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

const MAX_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const UPSERT_BATCH_SIZE = 500;

type Board = { company: string; board_token: string };

type NormalizedJob = {
  provider: string;
  provider_id: string;
  company: string;
  role: string;
  location: string;
  application_url: string | null;
  description: string | null;
  posted_at: string | null;
  is_active: boolean;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function shouldRetry(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchBoardJobs(board: Board): Promise<NormalizedJob[]> {
  const url =
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.board_token)}/jobs?content=true`;
  let lastError: unknown = new Error(`${board.company}: request failed`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        lastError = new Error(`${board.company}: Greenhouse returned ${response.status}`);
        if (!shouldRetry(response.status) || attempt === MAX_RETRIES) {
          break;
        }
      } else {
        const payload = await response.json();
        return (Array.isArray(payload.jobs) ? payload.jobs : []).map((job: {
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
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_RETRIES) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }

    await wait(500 * (2 ** attempt) + Math.floor(Math.random() * 250));
  }

  throw lastError;
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

  const activeBoards = boards as Board[];
  const results: Array<{ board: Board; jobs?: NormalizedJob[]; error?: string }> =
    new Array(activeBoards.length);
  let nextBoardIndex = 0;

  async function runWorker() {
    while (nextBoardIndex < activeBoards.length) {
      const boardIndex = nextBoardIndex;
      nextBoardIndex += 1;
      const board = activeBoards[boardIndex];

      try {
        results[boardIndex] = { board, jobs: await fetchBoardJobs(board) };
      } catch (error) {
        results[boardIndex] = {
          board,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENCY, activeBoards.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  const jobs = results.flatMap((result) => result.jobs || []);
  const failedCompanies = results
    .filter((result) => result.error)
    .map((result) => ({ company: result.board.company, error: result.error }));
  const successfulCompanies = results
    .filter((result) => !result.error)
    .map((result) => result.board.company);

  if (jobs.length) {
    for (let start = 0; start < jobs.length; start += UPSERT_BATCH_SIZE) {
      const { error: upsertError } = await supabase
        .from('jobs')
        .upsert(jobs.slice(start, start + UPSERT_BATCH_SIZE), { onConflict: 'provider,provider_id' });

      if (upsertError) {
        console.error('jobs upsert failed:', upsertError);
        return json({
          error: 'Jobs were fetched but could not be saved.',
          failed_companies: failedCompanies,
          successful_companies: successfulCompanies,
        }, 500);
      }
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
    board_count: activeBoards.length,
    successful_company_count: successfulCompanies.length,
    failed_companies: failedCompanies,
  });
});
