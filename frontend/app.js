const JOBS_KEY = 'northstar-jobs-v1';

// The UI consumes normalized jobs. A server-side Greenhouse/Lever adapter can
// provide this same shape without coupling browser code to an ATS HTML page.
const seedJobs = [
  { id: 'j1', company: 'Arc', initials: 'arc', role: 'Product Design Intern', location: 'Remote · US', posted: '2 hours ago', url: 'https://www.greenhouse.io/' },
  { id: 'j2', company: 'Ramp', initials: 'r', role: 'Software Engineering Intern', location: 'New York · Hybrid', posted: '5 hours ago', url: 'https://jobs.ashbyhq.com/ramp' },
  { id: 'j3', company: 'Airtable', initials: 'air', role: 'Product Marketing Intern', location: 'San Francisco · Hybrid', posted: 'Yesterday', url: 'https://airtable.com/careers' },
];

const $ = (selector) => document.querySelector(selector);
const supabase = window.supabaseClient;
let applications = [];
let jobs = load(JOBS_KEY, seedJobs);

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return metadata.username || metadata.full_name || metadata.name || metadata.user_name || user?.email?.split('@')[0] || 'there';
}

function renderUser() {
  const displayName = getDisplayName(window.currentUser);
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  $('#user-name').textContent = displayName;
  $('#profile-name').textContent = displayName;
  $('#profile-avatar').textContent = initials;
}

function normalizeApplication(row) {
  return {
    id: row.id,
    company: row.company || 'Unknown company',
    role: row.role || 'Untitled role',
    location: row.location || '',
    date: row.application_date || row.created_at?.slice(0, 10),
    status: row.status,
    nextStep: row.next_step || '',
    url: row.applicaion_url || row.application_url || '',
    notes: row.notes || ''
  };
}

async function loadApplications() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.replace('login.html');
    return;
  }

  const { data, error } = await supabase
    .from('user_jobs')
    .select('*')
    .eq('user_id', sessionData.session.user.id)
    .in('status', ['Applied', 'Interview', 'Offer', 'Rejected'])
    .order('application_date', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('user_jobs query failed:', error);
    applications = [];
    toast('Could not load your applications.');
    return;
  }

  applications = data.map(normalizeApplication);
  $('#last-saved').textContent = '· synced';
}

function renderStats() {
  const active = applications.filter((item) => !['Rejected', 'Offer'].includes(item.status)).length;
  const interviews = applications.filter((item) => item.status === 'Interview').length;
  const offers = applications.filter((item) => item.status === 'Offer').length;
  const responded = applications.filter((item) => ['Interview', 'Offer', 'Rejected'].includes(item.status)).length;
  $('#stat-active').textContent = active;
  $('#stat-interviews').textContent = interviews;
  $('#stat-offers').textContent = offers;
  $('#stat-response').textContent = applications.length ? `${Math.round((responded / applications.length) * 100)}%` : '0%';
  $('#nav-application-count').textContent = applications.length;
}

function renderApplications() {
  const search = $('#application-search').value.toLowerCase().trim();
  const filter = $('#status-filter').value;
  const filtered = applications.filter((item) => {
    const matchesSearch = [item.company, item.role, item.location].join(' ').toLowerCase().includes(search);
    return matchesSearch && (filter === 'All' || item.status === filter);
  });
  const visible = filtered.slice(0, 5);
  $('#applications-body').innerHTML = visible.map((item) => `
    <tr><td><div class="company-cell"><span class="company-logo">${escapeHtml(item.company.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(item.company)}</strong><div class="role">${escapeHtml(item.role)}</div></div></div></td>
    <td><select class="status ${item.status === 'Applied' ? 'status-Applied' : `status-${item.status}`}" data-status-id="${item.id}" aria-label="Change ${escapeHtml(item.company)} status">${['Applied','Interview','Offer','Rejected'].map((status) => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td>
    <td class="date-cell">${formatDate(item.date)}</td><td class="next-step">${escapeHtml(item.nextStep || '—')}</td><td><button class="row-actions" data-delete-id="${item.id}" aria-label="Delete ${escapeHtml(item.company)}">•••</button></td></tr>`).join('');
  $('#empty-applications').hidden = filtered.length !== 0;
}

function applicationPayload(data) {
  return {
    user_id: window.currentUser.id,
    is_saved: false,
    status: data.status,
    application_date: data.date || null,
    notes: data.notes || null,
    next_step: data.nextStep || null,
    company: data.company.trim(),
    role: data.role.trim(),
    location: data.location.trim() || null,
    application_url: data.url.trim() || null
  };
}

function renderJobs() {
  $('#jobs-list').innerHTML = jobs.map((job) => `<article class="job-card"><div class="job-top"><span class="job-logo">${escapeHtml(job.initials)}</span><div><h3 class="job-title">${escapeHtml(job.role)}</h3><div class="job-company">${escapeHtml(job.company)}</div></div><time class="job-date">${escapeHtml(job.posted)}</time></div><div class="job-details"><span>⌖ ${escapeHtml(job.location)}</span><a href="${safeUrl(job.url)}" target="_blank" rel="noreferrer">View listing ↗</a></div></article>`).join('');
}

function formatDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function safeUrl(value = '') { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2400); }

$('#application-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const { data: inserted, error } = await supabase
    .from('user_jobs')
    .insert(applicationPayload(data))
    .select()
    .single();

  if (error) {
    console.error('user_jobs insert failed:', error);
    toast('Could not save the application.');
    return;
  }

  applications.unshift(normalizeApplication(inserted));
  renderStats();
  renderApplications();
  event.currentTarget.reset();
  $('#application-modal').close();
  $('#last-saved').textContent = '· synced';
  toast('Application saved.');
});

$('#close-application-button').addEventListener('click', () => $('#application-modal').close());
$('#cancel-application-button').addEventListener('click', () => $('#application-modal').close());

document.addEventListener('change', async (event) => {
  if (event.target.matches('[data-status-id]')) {
    const application = applications.find((item) => item.id === event.target.dataset.statusId);
    if (!application) return;

    const previousStatus = application.status;
    const nextStatus = event.target.value;
    const { error } = await supabase
      .from('user_jobs')
      .update({ status: nextStatus })
      .eq('id', application.id)
      .eq('user_id', window.currentUser.id);

    if (error) {
      console.error('user_jobs status update failed:', error);
      event.target.value = previousStatus;
      toast('Could not update the status.');
      return;
    }

    application.status = nextStatus;
    renderStats();
    renderApplications();
    $('#last-saved').textContent = '· synced';
    toast(`${application.company} moved to ${application.status}.`);
  }
});

document.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('[data-delete-id]');
  if (!deleteButton) return;

  const application = applications.find((item) => item.id === deleteButton.dataset.deleteId);
  if (!application || !window.confirm(`Delete ${application.company}?`)) return;

  const { error } = await supabase
    .from('user_jobs')
    .delete()
    .eq('id', application.id)
    .eq('user_id', window.currentUser.id);

  if (error) {
    console.error('user_jobs delete failed:', error);
    toast('Could not delete the application.');
    return;
  }

  applications = applications.filter((item) => item.id !== application.id);
  renderStats();
  renderApplications();
  $('#last-saved').textContent = '· synced';
  toast('Application removed.');
});

const profileMenuToggle = $('#profile-menu-toggle');
const profileMenu = $('#profile-menu');

profileMenuToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = !profileMenu.hidden;
  profileMenu.hidden = isOpen;
  profileMenuToggle.setAttribute('aria-expanded', String(!isOpen));
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('#profile-menu') && !event.target.closest('#profile-menu-toggle')) {
    profileMenu.hidden = true;
    profileMenuToggle.setAttribute('aria-expanded', 'false');
  }
});

$('#logout-button').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    toast('Could not log out.');
    console.error('Logout failed:', error);
    return;
  }

  window.location.replace('login.html');
});

document.querySelectorAll('[data-open-modal]').forEach((button) => button.addEventListener('click', () => { $('#application-form').elements.date.value = new Date().toISOString().slice(0, 10); $('#application-modal').showModal(); }));
$('#application-search').addEventListener('input', renderApplications);
$('#status-filter').addEventListener('change', renderApplications);
$('#refresh-jobs').addEventListener('click', () => { $('#job-refresh-label').textContent = 'Updated just now'; toast('Job feed is up to date.'); });

async function initializeApp() {
  renderUser();
  await loadApplications();
  renderStats();
  renderApplications();
  renderJobs();
}

initializeApp();
