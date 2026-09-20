const STORAGE_KEY = 'northstar-applications-v1';
const JOBS_KEY = 'northstar-jobs-v1';

const seedApplications = [
  { id: '1', company: 'Vercel', role: 'Product Design Intern', location: 'Remote · US', date: '2026-09-17', status: 'Interview', nextStep: 'Portfolio review, Sep 24', url: 'https://vercel.com/careers', notes: '' },
  { id: '2', company: 'Notion', role: 'Growth Marketing Intern', location: 'San Francisco, CA', date: '2026-09-15', status: 'Applied', nextStep: 'Follow up next week', url: 'https://www.notion.so/careers', notes: '' },
  { id: '3', company: 'Figma', role: 'UX Research Intern', location: 'New York, NY', date: '2026-09-12', status: 'Applied', nextStep: 'Wait for response', url: 'https://www.figma.com/careers', notes: '' },
  { id: '4', company: 'Linear', role: 'Product Intern', location: 'Remote · US', date: '2026-09-08', status: 'Rejected', nextStep: 'Keep looking', url: 'https://linear.app/careers', notes: '' },
];

// The UI consumes normalized jobs. A server-side Greenhouse/Lever adapter can
// provide this same shape without coupling browser code to an ATS HTML page.
const seedJobs = [
  { id: 'j1', company: 'Arc', initials: 'arc', role: 'Product Design Intern', location: 'Remote · US', posted: '2 hours ago', url: 'https://www.greenhouse.io/' },
  { id: 'j2', company: 'Ramp', initials: 'r', role: 'Software Engineering Intern', location: 'New York · Hybrid', posted: '5 hours ago', url: 'https://jobs.ashbyhq.com/ramp' },
  { id: 'j3', company: 'Airtable', initials: 'air', role: 'Product Marketing Intern', location: 'San Francisco · Hybrid', posted: 'Yesterday', url: 'https://airtable.com/careers' },
];

const $ = (selector) => document.querySelector(selector);
let applications = load(STORAGE_KEY, seedApplications);
let jobs = load(JOBS_KEY, seedJobs);

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function saveApplications() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
  $('#last-saved').textContent = '· just now';
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
  $('#stat-trend').textContent = Math.min(applications.length, 3);
  $('#nav-application-count').textContent = applications.length;
}

function renderApplications() {
  const search = $('#application-search').value.toLowerCase().trim();
  const filter = $('#status-filter').value;
  const visible = applications.filter((item) => {
    const matchesSearch = [item.company, item.role, item.location].join(' ').toLowerCase().includes(search);
    return matchesSearch && (filter === 'All' || item.status === filter);
  });
  $('#applications-body').innerHTML = visible.map((item) => `
    <tr><td><div class="company-cell"><span class="company-logo">${escapeHtml(item.company.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(item.company)}</strong><div class="role">${escapeHtml(item.role)}</div></div></div></td>
    <td><select class="status ${item.status === 'Applied' ? 'status-Applied' : `status-${item.status}`}" data-status-id="${item.id}" aria-label="Change ${escapeHtml(item.company)} status">${['Wishlist','Applied','Interview','Offer','Rejected'].map((status) => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td>
    <td class="date-cell">${formatDate(item.date)}</td><td class="next-step">${escapeHtml(item.nextStep || '—')}</td><td><button class="row-actions" data-delete-id="${item.id}" aria-label="Delete ${escapeHtml(item.company)}">•••</button></td></tr>`).join('');
  $('#empty-applications').hidden = visible.length !== 0;
}

function renderJobs() {
  $('#jobs-list').innerHTML = jobs.map((job) => `<article class="job-card"><div class="job-top"><span class="job-logo">${escapeHtml(job.initials)}</span><div><h3 class="job-title">${escapeHtml(job.role)}</h3><div class="job-company">${escapeHtml(job.company)}</div></div><time class="job-date">${escapeHtml(job.posted)}</time></div><div class="job-details"><span>⌖ ${escapeHtml(job.location)}</span><a href="${safeUrl(job.url)}" target="_blank" rel="noreferrer">View listing ↗</a></div></article>`).join('');
}

function formatDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function safeUrl(value = '') { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2400); }

$('#application-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  applications.unshift({ ...data, id: crypto.randomUUID() });
  saveApplications(); renderStats(); renderApplications(); event.currentTarget.reset(); $('#application-modal').close(); toast('Application saved to your pipeline.');
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-status-id]')) {
    const application = applications.find((item) => item.id === event.target.dataset.statusId);
    if (application) { application.status = event.target.value; saveApplications(); renderStats(); renderApplications(); toast(`${application.company} moved to ${application.status}.`); }
  }
});

document.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('[data-delete-id]');
  if (deleteButton) { applications = applications.filter((item) => item.id !== deleteButton.dataset.deleteId); saveApplications(); renderStats(); renderApplications(); toast('Application removed.'); }
});

document.querySelectorAll('[data-open-modal]').forEach((button) => button.addEventListener('click', () => { $('#application-form').elements.date.value = new Date().toISOString().slice(0, 10); $('#application-modal').showModal(); }));
$('#application-search').addEventListener('input', renderApplications);
$('#status-filter').addEventListener('change', renderApplications);
$('#refresh-jobs').addEventListener('click', () => { $('#job-refresh-label').textContent = 'Updated just now'; toast('Job feed is up to date.'); });

renderStats(); renderApplications(); renderJobs();
