/* Fortis Monthly Planner — vanilla JS, no build step. Data lives in localStorage; Excel export in export.js. */
(() => {
'use strict';

/* ───────────────────────── constants ───────────────────────── */
const STORE = 'fortis-monthly-planner-v1';
const THEME_KEY = 'fortis-monthly-planner-theme';
const PALETTE = ['#6C7BFF', '#22C3A6', '#FF8A5B', '#F25C9A', '#F2B94B', '#4FB6FF', '#A67BFF', '#7BD34E', '#FF6B6B', '#2DD4BF'];
const STATUS = [['todo', 'To do'], ['progress', 'In progress'], ['review', 'In review'], ['done', 'Done'], ['blocked', 'Blocked']];
const PRIORITY = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']];
const PSTATUS = [['planned', 'Planned'], ['active', 'Active'], ['on-hold', 'On hold'], ['completed', 'Completed']];
const WEEKENDS = { 'sat-sun': [0, 6], 'fri-sat': [5, 6], 'fri': [5], 'sun': [0] };
const WEEKEND_LABEL = { 'sat-sun': 'Saturday & Sunday off', 'fri-sat': 'Friday & Saturday off', 'fri': 'Friday off', 'sun': 'Sunday off' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WDL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 864e5;
const lw = () => (innerWidth <= 980 ? 170 : 300); // gantt label column width
const lab = (list, k) => (list.find(x => x[0] === k) || [k, k || '—'])[1];

/* ───────────────────────── tiny helpers ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const pad = n => String(n).padStart(2, '0');
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString('en-US');
const ms = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const iso = t => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => iso(ms(s) + n * DAY);
const diff = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const dow = s => new Date(ms(s)).getUTCDay();
const todayISO = () => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; };
const fmt = s => { if (!s) return '—'; const [, m, d] = s.split('-').map(Number); return `${MON[m - 1]} ${d}`; };
const fmtFull = s => { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); return `${MON[m - 1]} ${d}, ${y}`; };
const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function monthInfo(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
  return { y, m, n, days, start: days[0], end: days[n - 1], label: `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}` };
}
const shiftMonth = (ym, d) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };
const shade = (hex, amt) => { // amt -1..1
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = c => Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt, 0, 255));
  return '#' + [f(r), f(g), f(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};
const inkOn = hex => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)); return l > 150 ? '#0A0E22' : '#FFFFFF'; };

const IC = {
  dashboard: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  gantt: '<path d="M3 5h9M7 12h12M3 19h8M17 5h4M15 19h6"/>',
  projects: '<path d="M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
  tasks: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c2 .8 3.5 2.8 3.5 5.6"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', chev: '<path d="m6 9 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20L12 3zM12 10v5M12 17.5v.5"/>',
  flag: '<path d="M5 21V4m0 0h12l-2 4 2 4H5"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  wand: '<path d="m4 20 11-11M13 4l1.5 2.5L17 8l-2.5 1.5L13 12l-1.5-2.5L9 8l2.5-1.5L13 4zM18 14l.8 1.4 1.4.8-1.4.8-.8 1.4-.8-1.4-1.4-.8 1.4-.8.8-1.4z"/>',
};
const ico = (n, cls = '') => `<svg class="${cls}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ───────────────────────── state ───────────────────────── */
let S;            // persisted plan
const U = {       // UI state (not exported)
  view: 'dashboard', q: '',
  gantt: { group: 'project', dw: 40, collapsed: {}, deps: true, project: '', assignee: '', status: '', scrollL: null, scrollT: 0 },
  tasks: { project: '', assignee: '', status: '', sort: 'start', dir: 1 },
};
let DR = null;    // open drawer descriptor
const FP = window.FP = {};

function seed() {
  const month = todayISO().slice(0, 7);
  const m = monthInfo(month);
  const d = n => addDays(m.start, n - 1);        // day-of-month → ISO
  const team = [
    { id: 'm1', name: 'Aisha Rahman', role: 'Product Lead', color: '#6C7BFF', capacity: 8 },
    { id: 'm2', name: 'Karim Hossain', role: 'Engineering Lead', color: '#22C3A6', capacity: 8 },
    { id: 'm3', name: 'Nadia Islam', role: 'Product Designer', color: '#F25C9A', capacity: 7 },
    { id: 'm4', name: 'Tanvir Ahmed', role: 'Backend Engineer', color: '#F2B94B', capacity: 8 },
    { id: 'm5', name: 'Sumaiya Khan', role: 'Growth Marketer', color: '#FF8A5B', capacity: 6 },
    { id: 'm6', name: 'Rafiq Chowdhury', role: 'QA & Operations', color: '#4FB6FF', capacity: 8 },
  ];
  const goals = [
    { id: 'g1', title: 'Launch v2.0 to production', metric: 'Features shipped', unit: 'features', baseline: 0, current: 3, target: 8, owner: 'm1', color: '#6C7BFF', due: d(m.n) },
    { id: 'g2', title: 'Grow qualified leads', metric: 'Qualified leads', unit: 'leads', baseline: 120, current: 210, target: 400, owner: 'm5', color: '#FF8A5B', due: d(m.n) },
    { id: 'g3', title: 'Platform uptime 99.9%', metric: 'Uptime', unit: '%', baseline: 98.6, current: 99.4, target: 99.9, owner: 'm2', color: '#22C3A6', due: d(m.n) },
  ];
  const projects = [
    { id: 'p1', name: 'v2.0 Product Launch', color: '#6C7BFF', owner: 'm1', goalId: 'g1', status: 'active', description: 'Design, build, test and ship the v2.0 release with the new dashboard and billing flows.' },
    { id: 'p2', name: 'Launch Marketing Campaign', color: '#FF8A5B', owner: 'm5', goalId: 'g2', status: 'active', description: 'Positioning, landing page, content and paid channels to drive qualified leads at launch.' },
    { id: 'p3', name: 'Platform Reliability', color: '#22C3A6', owner: 'm2', goalId: 'g3', status: 'active', description: 'Observability, load testing and failover hardening ahead of launch traffic.' },
    { id: 'p4', name: 'Customer Onboarding', color: '#A67BFF', owner: 'm6', goalId: '', status: 'planned', description: 'Playbooks, help-centre content and training for the first wave of customers.' },
  ];
  const today = todayISO();
  const T = (id, projectId, name, assignee, s, e, pace, priority, hours, output, dep = '', details = '', milestone = false) => {
    const t = { id, projectId, name, assignee, start: d(s), end: d(e), progress: 0, status: 'todo', priority, hours, output, dep, details, milestone };
    // progress follows the calendar so the sample always looks like a live month
    if (t.end < today) { t.progress = 100; t.status = 'done'; }
    else if (t.start <= today) { t.progress = clamp(Math.round(expected(t, today) * pace / 5) * 5, 5, 95); t.status = 'progress'; }
    return t;
  };
  const tasks = [
    T('t1', 'p1', 'Requirements & scope freeze', 'm1', 1, 3, 1, 'high', 12, 'Signed-off PRD v2.0', '', 'Workshops with sales & support; lock the must-have list.'),
    T('t2', 'p1', 'UX flows & wireframes', 'm3', 4, 8, 1, 'high', 24, 'Wireframe set in Figma', 't1'),
    T('t3', 'p1', 'High-fidelity UI design', 'm3', 9, 15, .95, 'high', 30, 'Final UI kit + prototype', 't2', 'Dashboard, billing and settings screens.'),
    T('t4', 'p1', 'Backend APIs & billing service', 'm4', 6, 17, .6, 'critical', 64, 'Production-ready REST endpoints', 't1', 'Invoices, subscriptions, webhooks.'),
    T('t5', 'p1', 'Frontend implementation', 'm2', 18, 24, .9, 'high', 40, 'Merged feature branch', 't4'),
    T('t6', 'p1', 'QA regression & UAT', 'm6', 25, 28, .9, 'high', 22, 'Test report + bug burndown', 't5'),
    T('t7', 'p1', 'Go-live release', 'm2', 29, 29, 1, 'critical', 6, 'v2.0 live in production', 't6', 'Release checklist & rollback plan ready.', true),
    T('t8', 'p2', 'Messaging & positioning', 'm5', 2, 6, 1, 'medium', 22, 'Messaging house document', ''),
    T('t9', 'p2', 'Landing page copy & build', 'm5', 7, 14, .95, 'high', 24, 'Live landing page', 't8'),
    T('t10', 'p2', 'Launch content (blog, video, email)', 'm5', 7, 20, .8, 'medium', 18, '6 blog posts, 1 launch video, 3 emails', 't8'),
    T('t11', 'p2', 'Paid ads & partner outreach', 'm5', 15, 29, .9, 'medium', 28, 'Campaign live on 3 channels', 't9'),
    T('t12', 'p3', 'Monitoring & alerting setup', 'm4', 2, 9, 1, 'high', 12, 'Dashboards + on-call alerts', ''),
    T('t13', 'p3', 'Load & stress testing', 'm6', 10, 16, .9, 'high', 28, 'Capacity report (5× baseline)', 't12'),
    T('t14', 'p3', 'Failover & backup drill', 'm4', 19, 22, .9, 'medium', 14, 'Runbook + drill sign-off', 't13'),
    T('t15', 'p4', 'Onboarding playbook', 'm6', 14, 19, .9, 'medium', 8, 'Customer onboarding playbook', ''),
    T('t16', 'p4', 'Help-centre articles', 'm3', 20, 26, .9, 'low', 26, '25 help articles published', 't15'),
    T('t17', 'p4', 'Customer training webinar', 'm1', 27, 28, .9, 'medium', 8, 'Recorded training session', 't16'),
    T('t18', 'p1', 'Month-end review & retrospective', 'm1', m.n, m.n, 1, 'medium', 4, 'Retro notes & next-month plan', 't7', '', true),
  ];
  return {
    v: 1, sample: true,
    plan: { name: 'October Execution Plan', owner: 'Aisha Rahman', org: 'Fortis', month, weekend: 'sat-sun',
      objective: 'Ship v2.0, convert launch momentum into qualified leads, and harden the platform — all in one coordinated month.',
      notes: 'Weekly check-in every Monday 10:00. Risks reviewed on Thursdays.' },
    team, goals, projects, tasks,
  };
}
function load() {
  try { const raw = localStorage.getItem(STORE); if (raw) { const o = JSON.parse(raw); if (o && o.plan && Array.isArray(o.tasks)) return o; } } catch (e) { /* ignore */ }
  return null;
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* quota/private mode */ } }, 120); }
function touch() { if (S.sample) S.sample = false; save(); }

/* ───────────────────────── derived data ───────────────────────── */
const byId = (arr, id) => arr.find(x => x.id === id);
const member = id => byId(S.team, id);
const project = id => byId(S.projects, id);
const task = id => byId(S.tasks, id);
const isWE = s => WEEKENDS[S.plan.weekend].includes(dow(s));
const dur = t => Math.max(1, diff(t.start, t.end) + 1);
const MI = () => monthInfo(S.plan.month);
const inMonth = (t, m) => t.end >= m.start && t.start <= m.end;
function matchQ(t) {
  if (!U.q) return true; const q = U.q.toLowerCase(); const p = project(t.projectId), a = member(t.assignee);
  return [t.name, t.details, t.output, p && p.name, a && a.name].some(x => (x || '').toLowerCase().includes(q));
}
function expected(t, today) { if (today < t.start) return 0; if (today >= t.end) return 100; return ((diff(t.start, today) + 1) / dur(t)) * 100; }
function health(t) {
  const today = todayISO();
  if (t.status === 'done') return 'done';
  if (t.status === 'blocked') return 'blocked';
  if (t.end < today) return 'overdue';
  if (t.progress < expected(t, today) - 20) return 'behind';
  return 'ontrack';
}
const wavg = ts => { const w = ts.reduce((a, t) => a + dur(t), 0); return w ? ts.reduce((a, t) => a + t.progress * dur(t), 0) / w : 0; };
function workDays(a, b) { const out = []; for (let s = a; s <= b; s = addDays(s, 1)) if (!isWE(s)) out.push(s); return out; }
function computeLoad() {
  const L = {}; S.team.forEach(m => L[m.id] = {});
  S.tasks.forEach(t => {
    if (!t.assignee || !L[t.assignee] || !(t.hours > 0)) return;
    let days = workDays(t.start, t.end); if (!days.length) { days = []; for (let s = t.start; s <= t.end; s = addDays(s, 1)) days.push(s); }
    const per = t.hours / days.length; days.forEach(s => L[t.assignee][s] = (L[t.assignee][s] || 0) + per);
  });
  return L;
}
function memberMonth(L, m, mi) {
  const wd = mi.days.filter(s => !isWE(s)).length; const cap = wd * m.capacity;
  const hrs = mi.days.reduce((a, s) => a + (L[m.id][s] || 0), 0);
  return { hrs, cap, util: cap ? hrs / cap : 0 };
}
const projTasks = pid => S.tasks.filter(t => t.projectId === pid);
function reindexDeps(id) { S.tasks.forEach(t => { if (t.dep === id) t.dep = ''; }); }

/* ───────────────────────── toasts / tooltip ───────────────────────── */
function toast(msg, kind = '') { const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = (kind === 'good' ? ico('check', 'ic') .replace('<svg', '<svg width="16" height="16"') : '') + esc(msg); $('#toasts').appendChild(el); setTimeout(() => { el.style.transition = '.3s'; el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 2600); }
FP.toast = toast;
function tipShow(html, x, y) { const t = $('#tip'); t.innerHTML = html; t.classList.add('on'); const w = t.offsetWidth, h = t.offsetHeight; t.style.left = clamp(x + 16, 8, innerWidth - w - 8) + 'px'; t.style.top = clamp(y + 16, 8, innerHeight - h - 8) + 'px'; }
const tipHide = () => $('#tip').classList.remove('on');

/* ───────────────────────── chart bits ───────────────────────── */
function ring(pct, size = 64, stroke = 8, color = 'var(--accent)', text = true) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = clamp(pct, 0, 100);
  return `<svg class="ringsvg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * p) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dasharray .6s"/>
  ${text ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${size * 0.26}">${Math.round(p)}%</text>` : ''}</svg>`;
}
function donut(parts, size = 130, stroke = 18) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1, r = (size - stroke) / 2, c = 2 * Math.PI * r; let off = 0;
  const segs = parts.filter(p => p.v > 0).map(p => { const len = (p.v / total) * c; const s = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`; off += len; return s; }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>${segs}
   <text x="50%" y="46%" text-anchor="middle" font-family="var(--font-display)" font-weight="800" font-size="${size * 0.22}" fill="var(--fg)">${total === 1 && !parts.some(p => p.v) ? 0 : total}</text>
   <text x="50%" y="62%" text-anchor="middle" font-size="10" fill="var(--muted)">tasks</text></svg>`;
}
const STATUS_COLOR = { todo: '#7480A8', progress: '#38BDF8', review: '#B58CFF', done: '#34D399', blocked: '#FB7185' };

/* ───────────────────────── chrome: rail + topbar ───────────────────────── */
const VIEWS = [
  ['dashboard', 'Overview', 'dashboard'], ['gantt', 'Gantt Timeline', 'gantt'], ['projects', 'Projects', 'projects'],
  ['tasks', 'Tasks', 'tasks'], ['team', 'Team & Allocation', 'team'], ['goals', 'Goals & Outputs', 'goals'],
];
const SUB = {
  dashboard: 'Month at a glance', gantt: 'Drag to reschedule · drag edges to resize · double-click to add',
  projects: 'Every project in this plan', tasks: 'Full task register with owners, dates and deliverables',
  team: 'Who is doing what — and whether anyone is overloaded', goals: 'Targets this month should move, and what we will deliver',
};
function renderRail() {
  const mi = MI(), ts = S.tasks.filter(t => inMonth(t, mi)), pct = wavg(ts), today = todayISO();
  const left = today < mi.start ? mi.n : today > mi.end ? 0 : diff(today, mi.end) + 1;
  const counts = { projects: S.projects.length, tasks: ts.length, team: S.team.length, goals: S.goals.length };
  $('#rail').innerHTML = `
    <div class="brand"><div class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M8 12h12M4 18h8"/></svg></div>
      <div><div class="brand-name">Fortis</div><div class="brand-sub">Monthly Planner</div></div></div>
    <div class="nav-label">Workspace</div>
    ${VIEWS.map(([k, l, i]) => `<button class="nav-btn ${U.view === k ? 'active' : ''}" data-act="nav" data-v="${k}">${ico(i)}<span>${l}</span>${counts[k] != null ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('')}
    <div class="rail-spacer"></div>
    <div class="rail-card"><h4>${esc(mi.label)}</h4><p>${left} day${left === 1 ? '' : 's'} left · ${ts.filter(t => t.status === 'done').length}/${ts.length} tasks done</p>
      <div class="ring-row">${ring(pct, 54, 6, '#9FB0FF', false)}<div><div class="big">${Math.round(pct)}%</div><div class="sm">overall progress</div></div></div></div>`;
}
function renderTopbar() {
  const mi = MI();
  const newBtn = { projects: ['project', 'New project'], team: ['member', 'Add member'], goals: ['goal', 'New goal'] }[U.view] || ['task', 'New task'];
  $('#topbar').innerHTML = `
    <div class="page-title">${esc(VIEWS.find(v => v[0] === U.view)[1])}<small>${esc(SUB[U.view])}</small></div>
    <div class="month-nav"><button data-act="month" data-d="-1" title="Previous month">${ico('left')}</button>
      <div class="label" data-act="month-today" title="Jump to current month">${esc(mi.label)}</div>
      <button data-act="month" data-d="1" title="Next month">${ico('right')}</button></div>
    <div class="top-spacer"></div>
    <div class="search">${ico('search')}<input id="q" placeholder="Search tasks, people, outputs…" value="${esc(U.q)}" autocomplete="off"></div>
    <button class="btn" data-act="new" data-k="${newBtn[0]}">${ico('plus')}<span class="lbl">${newBtn[1]}</span></button>
    <button class="icon-btn" data-act="plan" title="Plan settings">${ico('edit')}</button>
    <button class="icon-btn" data-act="data" title="Data: backup, import, sample">${ico('db')}</button>
    <button class="icon-btn" data-act="theme" title="Toggle theme">${ico(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
    <button class="btn excel" data-act="export">${ico('sheet')}<span class="lbl">Export Excel</span></button>`;
  const q = $('#q'); q.addEventListener('input', () => { U.q = q.value; const p = q.selectionStart; renderView(); });
}

/* ───────────────────────── views ───────────────────────── */
const V = {};

/* —— Dashboard —— */
V.dashboard = () => {
  const mi = MI(), today = todayISO(), ts = S.tasks.filter(t => inMonth(t, mi)), L = computeLoad();
  const pct = wavg(ts), done = ts.filter(t => t.status === 'done').length, hours = ts.reduce((a, t) => a + (t.hours || 0), 0);
  const risk = ts.filter(t => ['overdue', 'blocked', 'behind'].includes(health(t)));
  const mems = S.team.map(m => ({ m, ...memberMonth(L, m, mi) }));
  const capAll = mems.reduce((a, x) => a + x.cap, 0), hrsAll = mems.reduce((a, x) => a + x.hrs, 0), util = capAll ? hrsAll / capAll : 0;
  const left = today < mi.start ? mi.n : today > mi.end ? 0 : diff(today, mi.end) + 1;
  const exp = ts.length ? wavg(ts.map(t => ({ ...t, progress: expected(t, today) }))) : 0;
  const delta = pct - exp;
  const upcoming = ts.filter(t => t.status !== 'done' && t.end >= today).sort((a, b) => a.end.localeCompare(b.end)).slice(0, 6);
  const sample = S.sample;

  // planned curve
  const W = 560, H = 190, P = { l: 34, r: 14, t: 14, b: 26 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const totalW = ts.reduce((a, t) => a + dur(t), 0) || 1;
  const planned = mi.days.map(s => ts.reduce((a, t) => a + dur(t) * clamp(s < t.start ? 0 : (diff(t.start, s) + 1) / dur(t), 0, 1), 0) / totalW * 100);
  const X = i => P.l + (i / (mi.n - 1)) * iw, Y = v => P.t + ih - (v / 100) * ih;
  const line = planned.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const ti = today < mi.start ? -1 : today > mi.end ? mi.n - 1 : diff(mi.start, today);
  const chart = `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${[0, 25, 50, 75, 100].map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--gridline)"/><text x="${P.l - 8}" y="${Y(v) + 3}" text-anchor="end">${v}%</text>`).join('')}
    ${[1, 8, 15, 22, mi.n].map(d => `<text x="${X(d - 1)}" y="${H - 6}" text-anchor="middle">${MON[mi.m - 1]} ${d}</text>`).join('')}
    <path d="${line}L${X(mi.n - 1)},${Y(0)}L${X(0)},${Y(0)}Z" fill="url(#pg)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
    ${ti >= 0 ? `<line x1="${X(ti)}" x2="${X(ti)}" y1="${P.t}" y2="${P.t + ih}" stroke="var(--today)" stroke-dasharray="3 4"/><circle cx="${X(ti)}" cy="${Y(pct)}" r="6" fill="var(--good)" stroke="var(--surface)" stroke-width="3"/>
    <text x="${clamp(X(ti), 70, W - 90)}" y="${Math.max(P.t + 10, Y(pct) - 14)}" text-anchor="middle" fill="var(--good)" style="font-weight:700;fill:var(--good)">Actual ${Math.round(pct)}%</text>` : ''}</svg>`;

  const statusParts = STATUS.map(([k, l]) => ({ k, l, v: ts.filter(t => t.status === k).length, color: STATUS_COLOR[k] }));
  const kpi = (cls, i, label, val, note, small = '') => `<div class="card kpi ${cls}"><div class="k-ico">${ico(i)}</div><div class="k-label">${label}</div><div class="k-val">${val}<small>${small}</small></div><div class="k-note">${note}</div></div>`;

  return `<div class="fade-in">
    <div class="hero"><button class="edit" data-act="plan">${ico('edit')} Edit plan</button>
      <div class="eyebrow">${esc(mi.label)} · ${esc(S.plan.org || 'Monthly plan')}${sample ? ' · Sample data' : ''}</div>
      <h1>${esc(S.plan.name || 'Untitled plan')}</h1><p>${esc(S.plan.objective || 'Add an objective for the month in Plan settings.')}</p>
      <div class="hero-meta"><div>Plan owner<b>${esc(S.plan.owner || '—')}</b></div><div>Projects<b>${S.projects.length}</b></div><div>Tasks this month<b>${ts.length}</b></div><div>Team<b>${S.team.length}</b></div><div>Working week<b style="font-size:14px;padding-top:4px">${esc(WEEKEND_LABEL[S.plan.weekend])}</b></div></div></div>
    ${sample ? `<div class="card card-pad" style="margin-bottom:18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;border-color:var(--accent)">${ico('wand', '')}<div style="flex:1;min-width:220px"><b>You are looking at a sample plan.</b><div class="muted" style="font-size:12.5px">Explore freely, then start a blank plan for your own month — or edit this one in place.</div></div><button class="btn primary" data-act="blank">Start blank plan</button></div>` : ''}
    <div class="grid g-kpi">
      ${kpi('', 'bolt', 'Overall progress', Math.round(pct), delta >= -3 ? `${delta >= 3 ? '+' : ''}${Math.round(delta)} pts vs schedule` : `${Math.round(delta)} pts behind schedule`, '%')}
      ${kpi('good', 'check', 'Tasks completed', `${done}<small>/ ${ts.length}</small>`, `${ts.filter(t => t.status === 'progress' || t.status === 'review').length} in flight`)}
      ${kpi(risk.length ? 'bad' : 'good', 'alert', 'Needs attention', risk.length, risk.length ? 'overdue, blocked or behind' : 'Everything on track')}
      ${kpi('info', 'cal', 'Days remaining', left, `${mi.days.filter(s => !isWE(s)).length} working days in month`)}
      ${kpi('warn', 'clock', 'Planned effort', fmtNum(hours), 'hours across all tasks', 'h')}
      ${kpi(util > 1 ? 'bad' : 'good', 'team', 'Team utilisation', Math.round(util * 100), util > 1 ? 'Over capacity — rebalance' : 'of available capacity', '%')}
    </div>
    <div class="section-title"><h2>Progress & delivery</h2></div>
    <div class="grid g-2">
      <div class="card"><div class="card-head"><div><h3>Planned burn-up</h3><div class="sub">Scheduled completion across the month vs. actual today</div></div></div><div style="padding:8px 14px 14px">${ts.length ? chart : '<div class="empty">Add tasks to see the plan curve.</div>'}</div></div>
      <div class="card"><div class="card-head"><div><h3>Status mix</h3><div class="sub">All tasks active in ${esc(MON[mi.m - 1])}</div></div></div>
        <div class="donut-wrap">${donut(statusParts)}<div class="donut-legend">${statusParts.map(p => `<div><i class="swatch" style="background:${p.color}"></i>${p.l}<b>${p.v}</b></div>`).join('')}</div></div></div>
    </div>
    <div class="grid g-2" style="margin-top:18px">
      <div class="card"><div class="card-head"><div><h3>Projects</h3><div class="sub">Duration-weighted progress</div></div><button class="btn sm ghost" data-act="nav" data-v="projects">View all</button></div><div class="list-pad">
        ${S.projects.length ? S.projects.map(p => { const pts = projTasks(p.id).filter(t => inMonth(t, mi)); const pp = wavg(pts); return `<div class="row-item" data-act="edit" data-k="project" data-id="${p.id}"><i class="swatch" style="background:${p.color}"></i><div class="row-main"><b>${esc(p.name)}</b><span>${pts.length} tasks · ${esc((member(p.owner) || {}).name || 'No owner')}</span></div><div style="width:130px"><div class="bar"><i style="width:${pp}%;background:${p.color}"></i></div></div><b class="mono" style="width:42px;text-align:right">${Math.round(pp)}%</b></div>`; }).join('') : '<div class="empty"><b>No projects yet</b>Create one to start planning.</div>'}</div></div>
      <div class="card"><div class="card-head"><div><h3>Coming up</h3><div class="sub">Next deadlines that are not done</div></div><button class="btn sm ghost" data-act="nav" data-v="gantt">Open Gantt</button></div><div class="list-pad">
        ${upcoming.length ? upcoming.map(t => { const p = project(t.projectId), a = member(t.assignee), h = health(t); return `<div class="row-item" data-act="edit" data-k="task" data-id="${t.id}"><i class="swatch" style="background:${p ? p.color : '#888'}"></i><div class="row-main"><b>${esc(t.name)}</b><span>${esc(p ? p.name : 'No project')} · due ${fmt(t.end)}</span></div>${h === 'behind' || h === 'blocked' || h === 'overdue' ? `<span class="chip blocked">${h}</span>` : ''}${a ? `<span class="avatar" style="background:${a.color}" title="${esc(a.name)}">${initials(a.name)}</span>` : ''}</div>`; }).join('') : '<div class="empty"><b>Nothing due</b>No open tasks ahead.</div>'}</div></div>
    </div>
    <div class="section-title"><h2>Goals & team load</h2></div>
    <div class="grid g-2">
      <div class="card"><div class="card-head"><h3>Goals</h3><button class="btn sm ghost" data-act="nav" data-v="goals">Manage</button></div><div class="list-pad">
        ${S.goals.length ? S.goals.map(g => { const gp = goalPct(g); return `<div class="row-item" data-act="edit" data-k="goal" data-id="${g.id}">${ring(gp, 44, 5, g.color)}<div class="row-main"><b>${esc(g.title)}</b><span>${fmtNum(g.current)} / ${fmtNum(g.target)} ${esc(g.unit)}</span></div></div>`; }).join('') : '<div class="empty"><b>No goals set</b>Define what this month should achieve.</div>'}</div></div>
      <div class="card"><div class="card-head"><h3>Team utilisation</h3><button class="btn sm ghost" data-act="nav" data-v="team">Allocation</button></div><div class="list-pad">
        ${mems.length ? mems.map(x => `<div class="row-item" data-act="edit" data-k="member" data-id="${x.m.id}"><span class="avatar" style="background:${x.m.color}">${initials(x.m.name)}</span><div class="row-main"><b>${esc(x.m.name)}</b><span>${esc(x.m.role)} · ${fmtNum(x.hrs)}h of ${fmtNum(x.cap)}h</span></div><div style="width:120px"><div class="bar ${x.util > 1 ? 'over' : 'ok'}"><i style="width:${clamp(x.util * 100, 0, 100)}%"></i></div></div><b class="mono" style="width:44px;text-align:right;color:${x.util > 1 ? 'var(--bad)' : 'inherit'}">${Math.round(x.util * 100)}%</b></div>`).join('') : '<div class="empty"><b>No team members</b>Add people to allocate work.</div>'}</div></div>
    </div></div>`;
};
const goalPct = g => { const span = g.target - g.baseline; return span ? clamp(((g.current - g.baseline) / span) * 100, 0, 100) : 0; };

/* —— Gantt —— */
function ganttTasks() {
  const mi = MI(), G = U.gantt;
  return S.tasks.filter(t => inMonth(t, mi) && matchQ(t) && (!G.project || t.projectId === G.project) && (!G.assignee || t.assignee === G.assignee) && (!G.status || t.status === G.status))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}
V.gantt = () => {
  const mi = MI(), G = U.gantt, dw = G.dw, today = todayISO(), N = mi.n, total = N * dw;
  const ts = ganttTasks();
  // rows
  const groups = [];
  if (G.group === 'project') {
    S.projects.forEach(p => { const items = ts.filter(t => t.projectId === p.id); if (items.length) groups.push({ key: p.id, label: p.name, color: p.color, items, sub: (member(p.owner) || {}).name }); });
    const orphan = ts.filter(t => !project(t.projectId)); if (orphan.length) groups.push({ key: '_', label: 'No project', color: '#7480A8', items: orphan });
  } else {
    S.team.forEach(m => { const items = ts.filter(t => t.assignee === m.id); if (items.length) groups.push({ key: m.id, label: m.name, color: m.color, items, sub: m.role }); });
    const un = ts.filter(t => !member(t.assignee)); if (un.length) groups.push({ key: '_', label: 'Unassigned', color: '#7480A8', items: un });
  }
  let y = 0; const pos = {}; const rowsHtml = [];
  const idx = s => diff(mi.start, s);
  groups.forEach(g => {
    const hs = 36, collapsed = G.collapsed[g.key];
    const gs = g.items.reduce((a, t) => t.start < a ? t.start : a, g.items[0].start), ge = g.items.reduce((a, t) => t.end > a ? t.end : a, g.items[0].end);
    const a = Math.max(0, idx(gs)), b = Math.min(N - 1, idx(ge));
    rowsHtml.push(`<div class="g-row proj ${collapsed ? 'collapsed' : ''}" style="height:${hs}px"><div class="g-label" data-act="collapse" data-key="${g.key}"><span class="pbtn">${ico('chev')}</span><i class="swatch" style="background:${g.color}"></i><span class="tname">${esc(g.label)}</span><span class="tmeta">${g.items.length} · ${Math.round(wavg(g.items))}%</span></div>
      <div class="g-track" data-pid="${G.group === 'project' ? g.key : ''}" data-mid="${G.group === 'assignee' ? g.key : ''}" style="width:${total}px"><div class="pbar" style="left:${a * dw + 1}px;width:${(b - a + 1) * dw - 2}px;background:${g.color};opacity:.28"></div><div class="pbar" style="left:${a * dw + 1}px;width:${Math.max(0, ((b - a + 1) * dw - 2) * wavg(g.items) / 100)}px;background:${g.color}"></div></div></div>`);
    y += hs;
    if (collapsed) return;
    g.items.forEach(t => {
      const rh = 42, p = project(t.projectId), m = member(t.assignee), col = p ? p.color : '#7480A8', s = idx(t.start), e = idx(t.end);
      pos[t.id] = { y: y + rh / 2, s, e }; const h = health(t);
      let bar;
      if (t.milestone) {
        bar = `<div class="milestone" data-id="${t.id}" style="left:${s * dw + dw / 2}px;background:${col}"></div><div class="mlabel" style="left:${s * dw + dw / 2 + 20}px">${esc(t.name)}</div>`;
      } else {
        const a = Math.max(0, s), b = Math.min(N - 1, e), w = (b - a + 1) * dw - 2;
        bar = `<div class="tbar ${t.status === 'done' ? 'done' : ''} ${t.status === 'blocked' ? 'blocked' : ''} ${h === 'overdue' ? 'overdue' : ''} ${s < 0 ? 'clipL' : ''} ${e > N - 1 ? 'clipR' : ''}" data-id="${t.id}" style="left:${a * dw + 1}px;width:${w}px;background:linear-gradient(180deg,${shade(col, .08)},${shade(col, -.12)})">
          <div class="fill" style="width:${t.progress}%"></div><div class="hdl l"></div><span class="txt">${w > 70 ? esc(t.name) : ''}${w > 150 ? ` · ${t.progress}%` : ''}</span><div class="hdl r"></div></div>`;
      }
      rowsHtml.push(`<div class="g-row task" style="height:${rh}px" data-id="${t.id}"><div class="g-label" data-act="edit" data-k="task" data-id="${t.id}">${m ? `<span class="avatar" style="background:${m.color}" title="${esc(m.name)}">${initials(m.name)}</span>` : '<span class="avatar" style="background:var(--surface-3);color:var(--faint)">?</span>'}<span class="tname" title="${esc(t.name)}">${esc(t.name)}</span><span class="tmeta">${t.progress}%</span></div><div class="g-track" style="width:${total}px" data-pid="${t.projectId}">${bar}</div></div>`);
      y += rh;
    });
  });
  const bodyH = y;
  // weeks
  const weeks = []; mi.days.forEach((s, i) => { if (i === 0 || dow(s) === 1) weeks.push({ from: s, n: 0 }); weeks[weeks.length - 1].n++; weeks[weeks.length - 1].to = s; });
  const head = `<div class="g-head"><div class="g-corner"><span>Task</span></div><div class="g-days"><div class="g-weeks">${weeks.map(w => `<div class="g-week" style="width:${w.n * dw}px">${fmt(w.from)} – ${w.to.slice(8).replace(/^0/, '')}</div>`).join('')}</div>
    <div class="g-daycells">${mi.days.map(s => `<div class="g-day ${isWE(s) ? 'we' : ''} ${s === today ? 'today' : ''}"><b>${+s.slice(8)}</b>${dw >= 30 ? WD[dow(s)] : ''}</div>`).join('')}</div></div></div>`;
  const overlay = `<div class="g-overlay" style="width:${total}px">${mi.days.map((s, i) => isWE(s) ? `<div class="g-we" style="left:${i * dw}px;width:${dw}px"></div>` : '').join('')}${mi.days.map((s, i) => `<div class="g-gl" style="left:${(i + 1) * dw - 1}px"></div>`).join('')}${today >= mi.start && today <= mi.end ? `<div class="g-today" style="left:${idx(today) * dw + dw / 2 - 1}px"></div>` : ''}</div>`;
  // dependencies
  let deps = '';
  if (G.deps) {
    const paths = [];
    ts.forEach(t => {
      const a = pos[t.dep], b = pos[t.id]; if (!t.dep || !a || !b) return;
      const x1 = (a.e + 1) * dw - 1, y1 = a.y, x2 = b.s * dw + 1, y2 = b.y, bad = ms(t.start) <= ms((task(t.dep) || {}).end || t.start);
      let d; if (x2 >= x1 + 14) d = `M${x1},${y1}H${x1 + 8}V${y2}H${x2 - 1}`; else { const ym = y2 > y1 ? y2 - 21 : y2 + 21; d = `M${x1},${y1}H${x1 + 8}V${ym}H${x2 - 9}V${y2}H${x2 - 1}`; }
      paths.push(`<path d="${d}" fill="none" stroke="${bad ? 'var(--bad)' : 'var(--faint)'}" stroke-width="1.6" ${bad ? '' : 'stroke-dasharray="0"'} marker-end="url(#ar${bad ? 'b' : 'n'})" opacity=".85"/>`);
    });
    deps = `<svg class="g-deps" width="${total}" height="${bodyH}"><defs><marker id="arn" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" fill="var(--faint)"/></marker><marker id="arb" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" fill="var(--bad)"/></marker></defs>${paths.join('')}</svg>`;
  }
  const pOpts = S.projects.map(p => `<option value="${p.id}" ${G.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const mOpts = S.team.map(m => `<option value="${m.id}" ${G.assignee === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const sOpts = STATUS.map(([k, l]) => `<option value="${k}" ${G.status === k ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="toolbar">
      <div class="seg"><button class="${G.group === 'project' ? 'on' : ''}" data-act="gset" data-k="group" data-v="project">By project</button><button class="${G.group === 'assignee' ? 'on' : ''}" data-act="gset" data-k="group" data-v="assignee">By person</button></div>
      <select class="sel" data-chg="gfilter" data-k="project"><option value="">All projects</option>${pOpts}</select>
      <select class="sel" data-chg="gfilter" data-k="assignee"><option value="">Everyone</option>${mOpts}</select>
      <select class="sel" data-chg="gfilter" data-k="status"><option value="">Any status</option>${sOpts}</select>
      <div class="seg"><button data-act="zoom" data-d="-6" title="Zoom out">−</button><button data-act="zoom" data-d="6" title="Zoom in">+</button></div>
      <button class="btn sm" data-act="gtoday">${ico('cal')} Today</button>
      <button class="btn sm ${G.deps ? '' : 'ghost'}" data-act="gdeps">${ico('link')} Dependencies</button>
      <button class="btn sm" data-act="autofix" title="Push dependent tasks so they start after their predecessor ends">${ico('wand')} Fix dependencies</button>
      <div class="legend"><span><i style="background:linear-gradient(90deg,rgba(0,0,0,.35) 50%,var(--accent) 50%)"></i>Progress</span><span><i style="background:var(--today)"></i>Today</span><span><i style="background:transparent;border:2px solid var(--bad)"></i>Overdue</span><span style="transform:none"><i style="width:9px;height:9px;transform:rotate(45deg);background:var(--accent)"></i>Milestone</span></div>
    </div>
    <div class="gantt-wrap" id="gwrap">${ts.length ? `<div class="gantt" style="--lw:${lw()}px;--dw:${dw}px">${head}<div class="g-body" style="width:${lw() + total}px;height:${bodyH}px">${rowsHtml.join('')}${overlay}${deps}</div></div>` :
      `<div class="empty" style="padding-top:90px"><b>No tasks in ${esc(mi.label)}</b>${S.tasks.length ? 'Adjust filters, switch month, or ' : ''}<button class="btn primary" style="margin-top:14px" data-act="new" data-k="task">${ico('plus')} Add task</button></div>`}</div>`;
};
V.gantt.after = () => {
  const w = $('#gwrap'); if (!w) return;
  const mi = MI(), G = U.gantt, today = todayISO();
  if (G.scrollL == null) { G.scrollL = today >= mi.start && today <= mi.end ? Math.max(0, diff(mi.start, today) * G.dw - 80) : 0; }
  w.scrollLeft = G.scrollL; w.scrollTop = G.scrollT;
  w.addEventListener('scroll', () => { G.scrollL = w.scrollLeft; G.scrollT = w.scrollTop; }, { passive: true });
  $$('.tbar,.milestone', w).forEach(el => bindBar(el));
  w.addEventListener('mouseover', e => { const el = e.target.closest('.tbar,.milestone'); if (!el || el.classList.contains('dragging')) return; const t = task(el.dataset.id); if (t) tipShow(tipHtml(t), e.clientX, e.clientY); });
  w.addEventListener('mousemove', e => { if ($('#tip').classList.contains('on') && e.target.closest('.tbar,.milestone')) tipShow($('#tip').innerHTML, e.clientX, e.clientY); });
  w.addEventListener('mouseout', e => { if (e.target.closest('.tbar,.milestone')) tipHide(); });
  w.addEventListener('dblclick', e => {
    const tr = e.target.closest('.g-track'); if (!tr || e.target.closest('.tbar,.milestone')) return;
    const x = e.clientX - tr.getBoundingClientRect().left, s = addDays(mi.start, clamp(Math.floor(x / G.dw), 0, mi.n - 1));
    openDrawer('task', null, { start: s, end: addDays(s, 2), projectId: tr.dataset.pid || (S.projects[0] || {}).id || '', assignee: tr.dataset.mid || '' });
  });
};
function tipHtml(t) {
  const p = project(t.projectId), m = member(t.assignee), h = health(t);
  return `<b>${esc(t.name)}</b><div><span>Project</span><span>${esc(p ? p.name : '—')}</span></div><div><span>Owner</span><span>${esc(m ? m.name : 'Unassigned')}</span></div><div><span>Dates</span><span>${fmt(t.start)} → ${fmt(t.end)} (${dur(t)}d)</span></div><div><span>Progress</span><span>${t.progress}% · ${lab(STATUS, t.status)}</span></div>${t.hours ? `<div><span>Effort</span><span>${t.hours}h</span></div>` : ''}${t.output ? `<div><span>Output</span><span>${esc(t.output)}</span></div>` : ''}${['overdue', 'behind'].includes(h) ? `<div><span>Health</span><span style="color:var(--bad)">${h}</span></div>` : ''}`;
}
function bindBar(el) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const t = task(el.dataset.id); if (!t) return;
    const G = U.gantt, mi = MI(), dw = G.dw;
    const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
    if (t.milestone && mode !== 'move') return;
    const x0 = e.clientX; let moved = false, dd = 0; const s0 = t.start, e0 = t.end;
    el.setPointerCapture(e.pointerId); tipHide();
    const calc = () => {
      let s = s0, en = e0;
      if (mode === 'move') { s = addDays(s0, dd); en = addDays(e0, dd); }
      else if (mode === 'l') { s = addDays(s0, Math.min(dd, diff(s0, e0))); }
      else { en = addDays(e0, Math.max(dd, -diff(s0, e0))); }
      return [s, en];
    };
    const paint = () => {
      const [s, en] = calc(), a = diff(mi.start, s), b = diff(mi.start, en);
      if (t.milestone) { el.style.left = (a * dw + dw / 2) + 'px'; const lbl = el.nextElementSibling; if (lbl) lbl.style.left = (a * dw + dw / 2 + 20) + 'px'; }
      else { el.style.left = (a * dw + 1) + 'px'; el.style.width = ((b - a + 1) * dw - 2) + 'px'; }
      tipShow(`<b>${esc(t.name)}</b><div><span>New dates</span><span>${fmt(s)} → ${fmt(en)}</span></div><div><span>Duration</span><span>${diff(s, en) + 1} days</span></div>`, lastX, lastY);
    };
    let lastX = e.clientX, lastY = e.clientY;
    const mv = ev => {
      lastX = ev.clientX; lastY = ev.clientY;
      const n = Math.round((ev.clientX - x0) / dw); if (Math.abs(ev.clientX - x0) > 3) { moved = true; el.classList.add('dragging'); }
      if (moved && n !== dd) { dd = n; paint(); } else if (moved) paint();
    };
    const up = ev => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.releasePointerCapture?.(e.pointerId); el.classList.remove('dragging'); tipHide();
      if (!moved) { openDrawer('task', t.id); return; }
      const [s, en] = calc(); if (s !== t.start || en !== t.end) { t.start = s; t.end = en; touch(); toast(`${t.name}: ${fmt(s)} → ${fmt(en)}`, 'good'); }
      renderAll();
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}
function autoFixDeps() {
  let changed = 0;
  for (let pass = 0; pass < S.tasks.length; pass++) {
    let any = false;
    S.tasks.forEach(t => { const d = t.dep && task(t.dep); if (!d) return; if (t.start <= d.end) { const shift = diff(t.start, d.end) + 1; t.start = addDays(t.start, shift); t.end = addDays(t.end, shift); any = true; changed++; } });
    if (!any) break;
  }
  return changed;
}

/* —— Projects —— */
V.projects = () => {
  const mi = MI();
  const cards = S.projects.map(p => {
    const all = projTasks(p.id), pts = all.filter(matchQ), pp = wavg(all), o = member(p.owner), g = byId(S.goals, p.goalId);
    const hrs = all.reduce((a, t) => a + (t.hours || 0), 0), ids = [...new Set(all.map(t => t.assignee).filter(Boolean))];
    const s = all.length ? all.reduce((a, t) => t.start < a ? t.start : a, all[0].start) : '', e = all.length ? all.reduce((a, t) => t.end > a ? t.end : a, all[0].end) : '';
    if (U.q && !pts.length && !p.name.toLowerCase().includes(U.q.toLowerCase())) return '';
    return `<div class="card pcard" data-act="edit" data-k="project" data-id="${p.id}"><div class="strip" style="background:${p.color}"></div><div class="body">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div style="min-width:0"><h3>${esc(p.name)}</h3></div><span class="chip ${p.status}">${lab(PSTATUS, p.status)}</span></div>
      <div class="desc">${esc(p.description || 'No description yet.')}</div>
      <div class="stats"><div><b>${all.length}</b><span>Tasks</span></div><div><b>${all.filter(t => t.status === 'done').length}</b><span>Done</span></div><div><b>${fmtNum(hrs)}h</b><span>Effort</span></div></div>
      <div class="util-row"><span>Progress</span><b>${Math.round(pp)}%</b></div><div class="bar"><i style="width:${pp}%;background:${p.color}"></i></div>
      <div class="foot"><div class="stack">${ids.slice(0, 5).map(id => { const m = member(id); return m ? `<span class="avatar" style="background:${m.color}" title="${esc(m.name)}">${initials(m.name)}</span>` : ''; }).join('')}</div><span>${s ? `${fmt(s)} → ${fmt(e)}` : 'No tasks scheduled'}</span></div>
      <div class="foot" style="margin-top:8px"><span>${ico('team').replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"')} ${o ? esc(o.name) : 'No owner'}</span><span>${g ? `${ico('goals').replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"')} ${esc(g.title)}` : ''}</span></div></div></div>`;
  }).join('');
  return `<div class="fade-in"><div class="grid g-3">${cards}<div class="add-card" data-act="new" data-k="project">${ico('plus')}New project</div></div></div>`;
};

/* —— Tasks —— */
V.tasks = () => {
  const T = U.tasks, mi = MI();
  const dirs = T.dir;
  const key = {
    name: t => t.name.toLowerCase(), project: t => (project(t.projectId) || {}).name || '', assignee: t => (member(t.assignee) || {}).name || '~',
    start: t => t.start, end: t => t.end, progress: t => t.progress, status: t => STATUS.findIndex(s => s[0] === t.status), priority: t => PRIORITY.findIndex(s => s[0] === t.priority), hours: t => t.hours || 0,
  }[T.sort] || (t => t.start);
  const rows = S.tasks.filter(t => inMonth(t, mi) && matchQ(t) && (!T.project || t.projectId === T.project) && (!T.assignee || t.assignee === T.assignee) && (!T.status || t.status === T.status))
    .sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dirs; });
  const th = (k, l) => `<th data-act="sort" data-k="${k}">${l}${T.sort === k ? (T.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const pOpts = S.projects.map(p => `<option value="${p.id}" ${T.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const mOpts = S.team.map(m => `<option value="${m.id}" ${T.assignee === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const sOpts = STATUS.map(([k, l]) => `<option value="${k}" ${T.status === k ? 'selected' : ''}>${l}</option>`).join('');
  const hrs = rows.reduce((a, t) => a + (t.hours || 0), 0);
  return `<div class="fade-in"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <select class="sel" data-chg="tfilter" data-k="project"><option value="">All projects</option>${pOpts}</select>
    <select class="sel" data-chg="tfilter" data-k="assignee"><option value="">Everyone</option>${mOpts}</select>
    <select class="sel" data-chg="tfilter" data-k="status"><option value="">Any status</option>${sOpts}</select>
    <span class="muted" style="margin-left:auto;font-size:12.5px">${rows.length} tasks · ${fmtNum(hrs)}h planned</span></div>
    <div class="card tbl-wrap"><table class="tbl"><thead><tr>${th('name', 'Task')}${th('project', 'Project')}${th('assignee', 'Owner')}${th('start', 'Start')}${th('end', 'End')}<th>Days</th>${th('progress', 'Progress')}${th('status', 'Status')}${th('priority', 'Priority')}${th('hours', 'Hours')}</tr></thead><tbody>
    ${rows.map(t => { const p = project(t.projectId), m = member(t.assignee), h = health(t); return `<tr data-act="edit" data-k="task" data-id="${t.id}">
      <td class="nm">${t.milestone ? '◆ ' : ''}${esc(t.name)}<span class="sub">${esc(t.output || t.details || '')}</span></td>
      <td>${p ? `<span class="person"><i class="swatch" style="background:${p.color}"></i>${esc(p.name)}</span>` : '<span class="faint">—</span>'}</td>
      <td>${m ? `<span class="person"><span class="avatar" style="background:${m.color}">${initials(m.name)}</span>${esc(m.name)}</span>` : '<span class="faint">Unassigned</span>'}</td>
      <td class="mono">${fmt(t.start)}</td><td class="mono" style="${h === 'overdue' ? 'color:var(--bad)' : ''}">${fmt(t.end)}</td><td class="mono">${dur(t)}</td>
      <td style="min-width:120px"><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:${t.progress}%"></i></div><span class="mono" style="font-size:12px;width:34px">${t.progress}%</span></div></td>
      <td><select class="inline-sel chip ${t.status}" data-chg="tstatus" data-id="${t.id}">${STATUS.map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><span class="chip ${t.priority}">${lab(PRIORITY, t.priority)}</span></td><td class="mono">${t.hours || 0}</td></tr>`; }).join('') || `<tr><td colspan="10"><div class="empty"><b>No tasks match</b>Create a task or adjust filters.</div></td></tr>`}
    </tbody></table></div></div>`;
};

/* —— Team —— */
V.team = () => {
  const mi = MI(), L = computeLoad(), today = todayISO();
  const cards = S.team.map(m => {
    const u = memberMonth(L, m, mi), ts = S.tasks.filter(t => t.assignee === m.id && inMonth(t, mi)), done = ts.filter(t => t.status === 'done').length;
    return `<div class="card mcard" data-act="edit" data-k="member" data-id="${m.id}"><span class="avatar lg" style="background:${m.color}">${initials(m.name)}</span><div style="flex:1;min-width:0"><h3>${esc(m.name)}</h3><div class="muted" style="font-size:12.5px">${esc(m.role)} · ${m.capacity}h/day</div>
      <div class="util"><div class="util-row"><span>${ts.length} tasks · ${done} done</span><b style="color:${u.util > 1 ? 'var(--bad)' : 'inherit'}">${fmtNum(u.hrs)}h / ${fmtNum(u.cap)}h · ${Math.round(u.util * 100)}%</b></div><div class="bar ${u.util > 1 ? 'over' : 'ok'}"><i style="width:${clamp(u.util * 100, 0, 100)}%"></i></div></div></div></div>`;
  }).join('');
  const cell = (m, s) => {
    const h = L[m.id][s] || 0; if (isWE(s)) return `<td class="we"></td>`; if (!h) return `<td></td>`;
    const r = h / m.capacity, bg = r <= 1 ? `rgba(52,211,153,${0.16 + 0.55 * r})` : `rgba(251,113,133,${Math.min(0.9, 0.5 + (r - 1))})`;
    return `<td style="background:${bg}" title="${esc(m.name)} · ${fmt(s)} · ${fmtNum(h)}h of ${m.capacity}h">${h >= 10 ? Math.round(h) : fmtNum(h)}</td>`;
  };
  const heat = S.team.length ? `<div class="tbl-wrap" style="padding:14px 18px 18px"><table class="heat"><thead><tr><th class="who"></th>${mi.days.map(s => `<th class="${s === today ? 'td-today' : ''}">${+s.slice(8)}<br>${WD[dow(s)]}</th>`).join('')}<th></th></tr></thead><tbody>
    ${S.team.map(m => { const u = memberMonth(L, m, mi); return `<tr><th class="who"><span class="person"><span class="avatar" style="background:${m.color}">${initials(m.name)}</span>${esc(m.name)}</span></th>${mi.days.map(s => cell(m, s)).join('')}<td class="sum" style="color:${u.util > 1 ? 'var(--bad)' : 'var(--fg)'}">${Math.round(u.util * 100)}%</td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="empty"><b>No team yet</b>Add members to see allocation.</div>';
  const unas = S.tasks.filter(t => !t.assignee && inMonth(t, mi));
  return `<div class="fade-in"><div class="grid g-3">${cards}<div class="add-card" style="min-height:96px" data-act="new" data-k="member">${ico('plus')}Add team member</div></div>
    <div class="section-title"><h2>Daily allocation heat-map</h2><div class="legend"><span><i style="background:rgba(52,211,153,.5)"></i>Within capacity</span><span><i style="background:rgba(251,113,133,.8)"></i>Over capacity</span><span class="muted">Hours per day, spread across working days</span></div></div>
    <div class="card">${heat}</div>${unas.length ? `<div class="card card-pad" style="margin-top:16px;border-color:var(--warn)"><b>${unas.length} task${unas.length > 1 ? 's' : ''} without an owner:</b> <span class="muted">${unas.map(t => esc(t.name)).join(' · ')}</span></div>` : ''}</div>`;
};

/* —— Goals & outputs —— */
V.goals = () => {
  const mi = MI(), gcards = S.goals.map(g => {
    const pct = goalPct(g), o = member(g.owner), linked = S.projects.filter(p => p.goalId === g.id), lp = wavg(linked.flatMap(p => projTasks(p.id)));
    return `<div class="card goal" data-act="edit" data-k="goal" data-id="${g.id}"><div class="g-top">${ring(pct, 62, 7, g.color)}<div style="min-width:0"><h3>${esc(g.title)}</h3><div class="metric">${esc(g.metric || '')}${o ? ' · ' + esc(o.name) : ''}${g.due ? ' · by ' + fmt(g.due) : ''}</div></div></div>
      <div class="vals"><b>${fmtNum(g.current)}<span> ${esc(g.unit)}</span></b><span>Target ${fmtNum(g.target)}</span></div><div class="bar"><i style="width:${pct}%;background:${g.color}"></i></div>
      <div class="foot" style="display:flex;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--muted)"><span>${linked.length ? linked.map(p => esc(p.name)).join(', ') : 'No linked project'}</span>${linked.length ? `<span>Delivery ${Math.round(lp)}%</span>` : ''}</div></div>`;
  }).join('');
  const groups = S.projects.map(p => ({ p, ts: projTasks(p.id).filter(t => matchQ(t) && (t.output || t.milestone)).sort((a, b) => a.end.localeCompare(b.end)) })).filter(g => g.ts.length);
  const allOut = S.tasks.filter(t => t.output), delivered = allOut.filter(t => t.status === 'done').length, missing = S.tasks.filter(t => !t.output && !t.milestone && inMonth(t, mi));
  return `<div class="fade-in"><div class="section-title"><h2>Goals & key results</h2></div><div class="grid g-3">${gcards}<div class="add-card" data-act="new" data-k="goal">${ico('plus')}New goal</div></div>
    <div class="section-title"><h2>Outputs & deliverables</h2><span class="muted">${delivered} of ${allOut.length} delivered</span></div>
    ${missing.length ? `<div class="card card-pad" style="margin-bottom:16px;border-color:var(--warn);font-size:13px"><b>${missing.length} task${missing.length > 1 ? 's have' : ' has'} no defined output.</b> <span class="muted">Every task should end in something you can point at: ${missing.slice(0, 4).map(t => esc(t.name)).join(' · ')}${missing.length > 4 ? '…' : ''}</span></div>` : ''}
    ${groups.length ? groups.map(({ p, ts }) => `<div class="out-group"><div class="out-head"><i class="swatch" style="background:${p.color}"></i>${esc(p.name)}<span class="chip">${ts.filter(t => t.status === 'done').length}/${ts.length}</span></div><div class="card">
      ${ts.map(t => { const m = member(t.assignee); return `<div class="out-item ${t.status === 'done' ? 'is-done' : ''}"><button class="chk ${t.status === 'done' ? 'on' : ''}" data-act="deliver" data-id="${t.id}" title="Mark delivered">${ico('check')}</button>
        <div class="row-main" data-act="edit" data-k="task" data-id="${t.id}" style="cursor:pointer"><div class="out-title">${t.milestone ? '◆ ' : ''}${esc(t.output || t.name)}</div><div class="out-sub">${esc(t.name)} · due ${fmt(t.end)}</div></div>
        ${m ? `<span class="avatar" style="background:${m.color}" title="${esc(m.name)}">${initials(m.name)}</span>` : ''}<span class="chip ${t.status}">${lab(STATUS, t.status)}</span></div>`; }).join('')}</div></div>`).join('') : '<div class="card empty"><b>No outputs defined</b>Add an "Expected output" to tasks and they appear here.</div>'}</div>`;
};

/* ───────────────────────── render loop ───────────────────────── */
function renderView() {
  const v = $('#view'), top = v.scrollTop;
  v.className = 'view' + (U.view === 'gantt' ? ' flush' : '');
  v.innerHTML = V[U.view]();
  if (V[U.view].after) V[U.view].after(); else v.scrollTop = top;
}
function renderAll() { renderRail(); renderTopbar(); renderView(); }
FP.renderAll = renderAll;

/* ───────────────────────── drawer forms ───────────────────────── */
const optsFrom = (list, blank) => () => [...(blank != null ? [['', blank]] : []), ...list()];
const FORMS = {
  task: {
    title: 'Task', arr: () => S.tasks,
    blank: () => { const mi = MI(), s = todayISO() >= mi.start && todayISO() <= mi.end ? todayISO() : mi.start; return { id: uid(), projectId: (S.projects[0] || {}).id || '', name: '', details: '', assignee: '', start: s, end: addDays(s, 2), progress: 0, status: 'todo', priority: 'medium', hours: 0, output: '', dep: '', milestone: false }; },
    fields: [
      { k: 'name', l: 'Task name', t: 'text', full: 1, req: 1, ph: 'e.g. Design onboarding flow' },
      { k: 'projectId', l: 'Project', t: 'select', opts: optsFrom(() => S.projects.map(p => [p.id, p.name]), 'No project') },
      { k: 'assignee', l: 'Assigned to', t: 'select', opts: optsFrom(() => S.team.map(m => [m.id, m.name]), 'Unassigned') },
      { h: 'Timeline' },
      { k: 'start', l: 'Start date', t: 'date' }, { k: 'end', l: 'End date', t: 'date' },
      { k: 'status', l: 'Status', t: 'select', opts: () => STATUS }, { k: 'priority', l: 'Priority', t: 'select', opts: () => PRIORITY },
      { k: 'progress', l: 'Progress', t: 'range' }, { k: 'hours', l: 'Effort (hours)', t: 'number', hint: 'Spread across working days for allocation' },
      { k: 'dep', l: 'Depends on (finish → start)', t: 'select', full: 1, opts: (o) => [['', 'No dependency'], ...S.tasks.filter(t => t.id !== o.id).map(t => [t.id, t.name])] },
      { k: 'milestone', l: 'Milestone', t: 'check', text: 'Mark as a milestone (shown as a diamond on the Gantt)', full: 1 },
      { h: 'Work details' },
      { k: 'details', l: 'Work details', t: 'textarea', full: 1, ph: 'What exactly needs to be done, constraints, links…' },
      { k: 'output', l: 'Expected output / deliverable', t: 'textarea', full: 1, ph: 'What will exist when this is finished?' },
    ],
  },
  project: {
    title: 'Project', arr: () => S.projects,
    blank: () => ({ id: uid(), name: '', color: PALETTE[S.projects.length % PALETTE.length], owner: '', goalId: '', status: 'planned', description: '' }),
    fields: [
      { k: 'name', l: 'Project name', t: 'text', full: 1, req: 1 }, { k: 'color', l: 'Colour', t: 'color', full: 1 },
      { k: 'owner', l: 'Project owner', t: 'select', opts: optsFrom(() => S.team.map(m => [m.id, m.name]), 'No owner') },
      { k: 'status', l: 'Status', t: 'select', opts: () => PSTATUS },
      { k: 'goalId', l: 'Supports goal', t: 'select', full: 1, opts: optsFrom(() => S.goals.map(g => [g.id, g.title]), 'No linked goal') },
      { k: 'description', l: 'Description & scope', t: 'textarea', full: 1 },
    ],
  },
  member: {
    title: 'Team member', arr: () => S.team,
    blank: () => ({ id: uid(), name: '', role: '', color: PALETTE[S.team.length % PALETTE.length], capacity: 8 }),
    fields: [
      { k: 'name', l: 'Full name', t: 'text', full: 1, req: 1 }, { k: 'role', l: 'Role', t: 'text', full: 1 },
      { k: 'capacity', l: 'Capacity (hours / working day)', t: 'number' }, { k: 'color', l: 'Colour', t: 'color', full: 1 },
    ],
  },
  goal: {
    title: 'Goal', arr: () => S.goals,
    blank: () => ({ id: uid(), title: '', metric: '', unit: '', baseline: 0, current: 0, target: 100, owner: '', color: PALETTE[S.goals.length % PALETTE.length], due: MI().end }),
    fields: [
      { k: 'title', l: 'Goal', t: 'text', full: 1, req: 1, ph: 'e.g. Reach 400 qualified leads' }, { k: 'metric', l: 'Metric measured', t: 'text', ph: 'Qualified leads' }, { k: 'unit', l: 'Unit', t: 'text', ph: 'leads, %, $' },
      { k: 'baseline', l: 'Starting value', t: 'number' }, { k: 'current', l: 'Current value', t: 'number' }, { k: 'target', l: 'Target value', t: 'number' },
      { k: 'owner', l: 'Goal owner', t: 'select', opts: optsFrom(() => S.team.map(m => [m.id, m.name]), 'No owner') }, { k: 'due', l: 'Due date', t: 'date' }, { k: 'color', l: 'Colour', t: 'color', full: 1 },
    ],
  },
  plan: {
    title: 'Plan settings', single: true,
    fields: [
      { k: 'name', l: 'Plan name', t: 'text', full: 1, req: 1 }, { k: 'owner', l: 'Plan owner', t: 'text' }, { k: 'org', l: 'Company / team', t: 'text' },
      { k: 'month', l: 'Planning month', t: 'month' }, { k: 'weekend', l: 'Weekly days off', t: 'select', opts: () => Object.entries(WEEKEND_LABEL) },
      { k: 'objective', l: 'Monthly objective', t: 'textarea', full: 1, ph: 'What must be true at the end of this month?' }, { k: 'notes', l: 'Notes & cadence', t: 'textarea', full: 1 },
    ],
  },
};
function fieldHtml(f, o) {
  if (f.h) return `<div class="sec-h">${f.h}</div>`;
  const v = o[f.k], cls = 'fld' + (f.full ? ' full' : '');
  let inner;
  switch (f.t) {
    case 'select': inner = `<select name="${f.k}">${f.opts(o).map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; break;
    case 'textarea': inner = `<textarea name="${f.k}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`; break;
    case 'range': inner = `<input type="range" name="${f.k}" min="0" max="100" step="5" value="${v || 0}"><span class="range-val" data-for="${f.k}">${v || 0}%</span>`; break;
    case 'color': inner = `<input type="hidden" name="${f.k}" value="${esc(v)}"><div class="swatches">${PALETTE.map(c => `<button type="button" data-act="pick" data-k="${f.k}" data-c="${c}" class="${c.toLowerCase() === String(v).toLowerCase() ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`; break;
    case 'check': inner = `<label style="display:flex;gap:10px;align-items:center;text-transform:none;letter-spacing:0;font-size:13px;font-weight:500;color:var(--fg)"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''} style="width:auto;accent-color:var(--accent)">${f.text}</label>`; break;
    default: inner = `<input type="${f.t}" name="${f.k}" value="${esc(v ?? '')}" placeholder="${esc(f.ph || '')}" ${f.t === 'number' ? 'step="any"' : ''}>`;
  }
  return `<div class="${cls}">${f.t === 'check' ? '' : `<label>${f.l}</label>`}${inner}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
}
function openDrawer(kind, id, defaults) {
  const F = FORMS[kind]; let o, isNew = false;
  if (F.single) o = { ...S.plan };
  else if (id) { const src = byId(F.arr(), id); if (!src) return; o = { ...src }; }
  else { o = { ...F.blank(), ...(defaults || {}) }; isNew = true; }
  DR = { kind, id: o.id, isNew, base: o };
  const sub = kind === 'task' && !isNew ? `${esc((project(o.projectId) || {}).name || 'No project')} · ${({ ontrack: 'on track', behind: 'behind schedule', overdue: 'overdue', done: 'done', blocked: 'blocked' })[health(o)]}` : isNew ? 'Fill in the details below' : '';
  $('#drawer').innerHTML = `<div class="dr-head"><div><h2>${isNew ? 'New ' + F.title.toLowerCase() : esc(F.title)}</h2><small>${sub}</small></div><button class="icon-btn x" data-act="close" aria-label="Close">${ico('close')}</button></div>
    <form class="dr-body" id="drForm" autocomplete="off"><div class="form">${F.fields.map(f => fieldHtml(f, o)).join('')}</div></form>
    <div class="dr-foot">${!isNew && !F.single ? `<button class="btn danger" data-act="del">Delete</button>${kind === 'task' ? '<button class="btn" data-act="dup">Duplicate</button>' : ''}` : ''}<span class="sp"></span><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="save">${isNew ? 'Create' : 'Save changes'}</button></div>`;
  $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drForm').addEventListener('input', e => { if (e.target.type === 'range') $(`[data-for="${e.target.name}"]`).textContent = e.target.value + '%'; });
  $('#drForm').addEventListener('submit', e => { e.preventDefault(); saveDrawer(); });
  setTimeout(() => { const f = $('#drForm input[type=text]'); if (f && isNew) f.focus(); }, 280);
}
function closeDrawer() { DR = null; $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }
function readForm(F, base) {
  const out = { ...base }; const fm = $('#drForm');
  F.fields.forEach(f => {
    if (f.h) return; const el = fm.elements[f.k]; if (!el) return;
    out[f.k] = f.t === 'check' ? el.checked : f.t === 'number' ? num(el.value) : f.t === 'range' ? Math.round(num(el.value)) : el.value.trim ? el.value.trim() : el.value;
  });
  return out;
}
function saveDrawer() {
  const F = FORMS[DR.kind], o = readForm(F, DR.base);
  const reqKey = (F.fields.find(f => f.req) || {}).k;
  if (reqKey && !o[reqKey]) { toast('Please enter a name', 'bad'); $(`#drForm [name=${reqKey}]`).focus(); return; }
  if (DR.kind === 'task') {
    if (!o.start || !o.end) { toast('Start and end dates are required', 'bad'); return; }
    if (o.end < o.start) { toast('End date is before the start date', 'bad'); return; }
    if (o.milestone) o.end = o.start;
    if (o.status === 'done') o.progress = 100;
    else if (o.progress === 100 && o.status === DR.base.status) o.status = 'done';
    else if (o.progress === 100) o.progress = 90;
    else if (o.status === 'todo' && o.progress > 0) o.status = 'progress';
    if (o.dep === o.id) o.dep = '';
  }
  if (DR.kind === 'member') o.capacity = o.capacity > 0 ? o.capacity : 8;
  if (DR.kind === 'plan') { S.plan = { ...S.plan, ...o }; if (!/^\d{4}-\d{2}$/.test(S.plan.month)) S.plan.month = todayISO().slice(0, 7); }
  else if (DR.isNew) F.arr().push(o); else Object.assign(byId(F.arr(), DR.id), o);
  touch(); const nm = DR.kind; closeDrawer(); renderAll(); toast(nm === 'plan' ? 'Plan updated' : 'Saved', 'good');
}
function deleteCurrent() {
  const { kind, id } = DR, F = FORMS[kind];
  const label = (byId(F.arr(), id) || {}).name || (byId(F.arr(), id) || {}).title || '';
  let msg = `Delete "${label}"?`; if (kind === 'project') msg += ` Its ${projTasks(id).length} task(s) will be deleted too.`;
  if (!confirm(msg)) return;
  if (kind === 'task') { reindexDeps(id); S.tasks = S.tasks.filter(t => t.id !== id); }
  else if (kind === 'project') { projTasks(id).forEach(t => reindexDeps(t.id)); S.tasks = S.tasks.filter(t => t.projectId !== id); S.projects = S.projects.filter(p => p.id !== id); }
  else if (kind === 'member') { S.tasks.forEach(t => { if (t.assignee === id) t.assignee = ''; }); S.projects.forEach(p => { if (p.owner === id) p.owner = ''; }); S.goals.forEach(g => { if (g.owner === id) g.owner = ''; }); S.team = S.team.filter(m => m.id !== id); }
  else if (kind === 'goal') { S.projects.forEach(p => { if (p.goalId === id) p.goalId = ''; }); S.goals = S.goals.filter(g => g.id !== id); }
  touch(); closeDrawer(); renderAll(); toast('Deleted');
}

/* ───────────────────────── modals ───────────────────────── */
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
function dataModal() {
  openModal(`<h2>Your data</h2><p class="lead">Everything is stored privately in this browser. Back it up as JSON, move it to another device, or reset.</p>
    <div class="sheet-list"><div><b>Backup (JSON)</b><span>Download the complete plan to restore later or share with a teammate.</span></div><div><b>Restore</b><span>Import a backup file — replaces the current plan.</span></div><div><b>Sample plan</b><span>Reload the demo month to explore features.</span></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="backup">${ico('download')} Download backup</button><button class="btn" data-act="restore">${ico('plus')} Import backup</button><button class="btn" data-act="sample">${ico('wand')} Load sample</button><button class="btn danger" data-act="blank">Start blank plan</button><span style="flex:1"></span><button class="btn ghost" data-act="mclose">Close</button></div>
    <input type="file" id="restoreFile" accept="application/json,.json" hidden>`);
  $('#restoreFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const o = JSON.parse(r.result); if (!o.plan || !Array.isArray(o.tasks)) throw 0; S = normalize(o); S.sample = false; save(); closeModal(); renderAll(); toast('Backup restored', 'good'); } catch (err) { toast('Not a valid planner backup', 'bad'); } };
    r.readAsText(f);
  });
}
function normalize(o) {
  const b = seed(); return { v: 1, sample: false, plan: { ...b.plan, ...o.plan }, team: o.team || [], projects: o.projects || [], goals: o.goals || [], tasks: (o.tasks || []).map(t => ({ details: '', output: '', dep: '', milestone: false, hours: 0, progress: 0, status: 'todo', priority: 'medium', assignee: '', ...t })) };
}
function exportModal() {
  const mi = MI(), n = S.tasks.filter(t => inMonth(t, mi)).length;
  openModal(`<h2>Export to Excel</h2><p class="lead">A fully formatted workbook for <b>${esc(mi.label)}</b> — ready to share with your team, stakeholders or finance.</p>
    <div class="sheet-list">
      <div><b>1 · Overview</b><span>Plan summary, KPIs, goals with progress and project roll-up.</span></div>
      <div><b>2 · Gantt Chart</b><span>Day-by-day coloured timeline with progress shading, weekends and today marker.</span></div>
      <div><b>3 · Task Register</b><span>Owners, dates, work details, outputs, hours — with filters, dropdowns and live formulas.</span></div>
      <div><b>4 · Allocation</b><span>Hours per person per day with capacity heat-map and utilisation formulas.</span></div>
      <div><b>5 · Projects · 6 · Goals & Outputs · 7 · Team</b><span>Supporting sheets for review meetings.</span></div></div>
    <div class="opt-row"><label><input type="radio" name="scope" value="month" checked> This month's tasks (${n})</label><label><input type="radio" name="scope" value="all"> All tasks (${S.tasks.length})</label></div>
    <div style="display:flex;gap:10px"><button class="btn excel" data-act="export-run">${ico('download')} Download .xlsx</button><button class="btn ghost" data-act="mclose">Cancel</button></div>`);
}

/* ───────────────────────── events ───────────────────────── */
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
FP.download = download;
const ACT = {
  nav: d => { U.view = d.v; renderAll(); $('#view').scrollTop = 0; },
  month: d => { S.plan.month = shiftMonth(S.plan.month, +d.d); U.gantt.scrollL = null; save(); renderAll(); },
  'month-today': () => { S.plan.month = todayISO().slice(0, 7); U.gantt.scrollL = null; save(); renderAll(); },
  new: d => openDrawer(d.k, null),
  edit: d => openDrawer(d.k, d.id),
  plan: () => openDrawer('plan'),
  close: closeDrawer, save: saveDrawer, del: deleteCurrent,
  dup: () => { const o = { ...DR.base, id: uid(), name: DR.base.name + ' (copy)', progress: 0, status: 'todo' }; S.tasks.push(o); touch(); closeDrawer(); renderAll(); openDrawer('task', o.id); toast('Duplicated', 'good'); },
  pick: d => { const f = $('#drForm'); f.elements[d.k].value = d.c; $$('.swatches button', f).forEach(b => b.classList.toggle('on', b.dataset.c === d.c)); },
  theme: () => { const r = document.documentElement, n = r.dataset.theme === 'dark' ? 'light' : 'dark'; r.dataset.theme = n; try { localStorage.setItem(THEME_KEY, n); } catch (e) { /* ignore */ } renderTopbar(); },
  data: dataModal, export: exportModal, mclose: closeModal,
  'export-run': async () => { const scope = ($('input[name=scope]:checked') || {}).value || 'month'; closeModal(); try { toast('Building workbook…'); await FP.exportExcel(scope); toast('Excel downloaded', 'good'); } catch (e) { console.error(e); toast('Export failed: ' + e.message, 'bad'); } },
  backup: () => { download(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), `fortis-plan-${S.plan.month}.json`); toast('Backup downloaded', 'good'); },
  restore: () => $('#restoreFile').click(),
  sample: () => { if (confirm('Replace the current plan with the sample plan?')) { S = seed(); save(); closeModal(); renderAll(); toast('Sample loaded', 'good'); } },
  blank: () => { if (!confirm('Start a blank plan? Your current plan will be cleared (download a backup first if unsure).')) return; const mo = todayISO().slice(0, 7); S = { v: 1, sample: false, plan: { name: 'My Monthly Plan', owner: '', org: '', month: mo, weekend: 'sat-sun', objective: '', notes: '' }, team: [], projects: [], goals: [], tasks: [] }; save(); closeModal(); U.view = 'dashboard'; renderAll(); toast('Blank plan ready — add your team and projects', 'good'); },
  collapse: d => { U.gantt.collapsed[d.key] = !U.gantt.collapsed[d.key]; renderView(); },
  gset: d => { U.gantt[d.k] = d.v; renderView(); },
  zoom: d => { U.gantt.dw = clamp(U.gantt.dw + +d.d, 18, 90); U.gantt.scrollL = null; renderView(); },
  gtoday: () => { const mi = MI(), w = $('#gwrap'); if (w && todayISO() >= mi.start && todayISO() <= mi.end) w.scrollTo({ left: Math.max(0, diff(mi.start, todayISO()) * U.gantt.dw - 120), behavior: 'smooth' }); else toast('Today is outside this month'); },
  gdeps: () => { U.gantt.deps = !U.gantt.deps; renderView(); },
  autofix: () => { const n = autoFixDeps(); if (n) { touch(); renderAll(); toast(`Rescheduled ${n} task${n > 1 ? 's' : ''} to respect dependencies`, 'good'); } else toast('All dependencies already respected'); },
  sort: d => { const T = U.tasks; if (T.sort === d.k) T.dir *= -1; else { T.sort = d.k; T.dir = 1; } renderView(); },
  deliver: (d, ev) => { ev.stopPropagation(); const t = task(d.id); if (t.status === 'done') { t.status = 'progress'; t.progress = Math.min(t.progress, 90); } else { t.status = 'done'; t.progress = 100; } touch(); renderAll(); },
};
document.addEventListener('click', e => {
  if (e.target.id === 'scrim') return closeDrawer();
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (e.target.closest('select') && el.tagName === 'TR') return;
  const fn = ACT[el.dataset.act]; if (fn) fn(el.dataset, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]'); if (!el) return;
  const c = el.dataset.chg;
  if (c === 'gfilter') { U.gantt[el.dataset.k] = el.value; renderView(); }
  else if (c === 'tfilter') { U.tasks[el.dataset.k] = el.value; renderView(); }
  else if (c === 'tstatus') { const t = task(el.dataset.id); t.status = el.value; if (el.value === 'done') t.progress = 100; else if (el.value === 'todo') t.progress = 0; else if (t.progress === 100) t.progress = 90; touch(); renderAll(); }
});
document.addEventListener('click', e => { if (e.target.closest('select[data-chg=tstatus]')) e.stopPropagation(); }, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) closeModal(); else if (DR) closeDrawer(); }
  const typing = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')); if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n') { e.preventDefault(); openDrawer('task'); }
  else if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
});

/* ───────────────────────── boot ───────────────────────── */
FP.state = () => S; FP.weekendDows = () => WEEKENDS[S.plan.weekend]; FP.helpers = { MI, monthInfo, inMonth, isWE, computeLoad, memberMonth, goalPct, health, dur, wavg, lab, STATUS, PRIORITY, PSTATUS, WEEKEND_LABEL, project, member, task, projTasks, fmtFull, fmt, diff, addDays, dow, todayISO, WDL, MON, shade, inkOn, byId };
try { const th = localStorage.getItem(THEME_KEY); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* ignore */ }
S = load() || seed();
renderAll();
})();
