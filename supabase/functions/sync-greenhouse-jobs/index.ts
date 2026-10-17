import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

async function fetchBoardJobs(board: { company: string; board_token: string }) {
  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.board_token)}/jobs?content=true`,
  );

  if (!response.ok) {
    throw new Error(`${board.company}: Greenhouse returned ${response.status}`);
  }

  const payload = await response.json();
  return (payload.jobs || []).map((job: {
    id: number;
    title?: string;
    updated_at?: string;
    absolute_url?: string;
    location?: { name?: string };
    content?: string;
  }) => ({
    provider: 'greenhouse',
    provider_id: String(job.id),
    company: board.company,
    role: job.title || 'Untitled role',
    location: job.location?.name || 'Unspecified',
    application_url: job.absolute_url || null,
    description: job.content || null,
    posted_at: job.updated_at || null,
    is_active: true,
  }));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Only GET and POST are supported.' }, 405);
  }

  if (!supabase) {
    return json({ error: 'Supabase server configuration is missing.' }, 500);
  }

  const { data: boards, error: boardError } = await supabase
    .from('greenhouse_boards')
    .select('company, board_token')
    .eq('is_active', true);

  if (boardError) {
    console.error('greenhouse_boards query failed:', boardError);
    return json({ error: 'Could not load Greenhouse board configuration.' }, 500);
  }

  if (!boards?.length) {
    return json({ jobs: [], count: 0, failed_companies: [] });
  }

  const results = await Promise.allSettled(boards.map(fetchBoardJobs));
  const jobs = results
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchBoardJobs>>> => result.status === 'fulfilled')
    .flatMap((result) => result.value);
  const failedCompanies = results
    .map((result, index) => result.status === 'rejected' ? { company: boards[index].company, error: String(result.reason) } : null)
    .filter(Boolean);

  if (jobs.length) {
    const { error: upsertError } = await supabase
      .from('jobs')
      .upsert(jobs, { onConflict: 'provider,provider_id' });

    if (upsertError) {
      console.error('jobs upsert failed:', upsertError);
      return json({ error: 'Jobs were fetched but could not be saved.', failed_companies: failedCompanies }, 500);
    }
  }

  jobs.sort((first, second) => {
    const firstTime = first.posted_at ? Date.parse(first.posted_at) : 0;
    const secondTime = second.posted_at ? Date.parse(second.posted_at) : 0;
    return secondTime - firstTime;
  });

  return json({
    jobs: jobs.slice(0, 50),
    count: jobs.length,
    failed_companies: failedCompanies,
  });
});
