function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CLIENT_JS = `
async function copyPrompt(orderId) {
  const button = document.querySelector('[data-copy="' + orderId + '"]');
  try {
    const response = await fetch('/api/work-orders/' + encodeURIComponent(orderId) + '/copy', { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'copy_failed');
    await navigator.clipboard.writeText(body.prompt_text);
    if (button) button.textContent = 'Copied';
  } catch (error) {
    if (button) button.textContent = 'Copy failed';
  }
}

function loadCvFile(input) {
  const file = input.files && input.files[0];
  const box = document.querySelector('textarea[name="cv_text"]');
  if (!file || !box) return;
  const reader = new FileReader();
  reader.onload = function () { box.value = String(reader.result || ''); };
  reader.readAsText(file);
}
`;

function nav(active) {
  const links = [
    ['/', 'Today'],
    ['/feeds/euraxess', 'EURAXESS'],
    ['/feeds/fusion', 'Fusion ATS'],
    ['/feeds/umich', 'U-M Careers'],
    ['/feeds/phdscanner', 'PhDScanner'],
    ['/orgs', 'Companies'],
    ['/people', 'People'],
    ['/inbox', 'Inbox'],
    ['/applied', 'Applied'],
    ['/profile', 'Profile'],
  ];
  return `<nav class="nav">${links.map(([href, label]) => (
    `<a class="${active === href || (active && href !== '/' && active.startsWith(href)) ? 'on' : ''}" href="${href}">${label}</a>`
  )).join('')}</nav>`;
}

export function renderPage({ title, user, body, notice, active = '/' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; --bg:#0f1419; --card:#1a222c; --ink:#e8eef4; --muted:#93a1b0; --accent:#6ee7b7; --line:#2a3542; --col-saved:#1b2838; --col-applied:#14301f; --col-skip:#3a1515; }
    body { margin:0; font:16px/1.5 ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    main { max-width:1100px; margin:0 auto; padding:1.25rem 1.25rem 4rem; }
    header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1rem; }
    h1 { font-size:1.35rem; margin:0; }
    h2 { font-size:1.1rem; margin:0 0 0.4rem; }
    .muted { color:var(--muted); }
    .nav { display:flex; flex-wrap:wrap; gap:0.4rem; margin:0 0 1.25rem; }
    .nav a { color:var(--muted); text-decoration:none; border:1px solid var(--line); border-radius:999px; padding:0.25rem 0.7rem; font-size:0.85rem; }
    .nav a.on { color:#04291c; background:var(--accent); border-color:transparent; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1rem 1.1rem; margin:0.75rem 0; }
    label { display:block; font-size:0.85rem; color:var(--muted); margin:0.6rem 0 0.25rem; }
    input, textarea, select { width:100%; box-sizing:border-box; padding:0.55rem 0.65rem; border-radius:8px; border:1px solid var(--line); background:#0f1419; color:var(--ink); font:inherit; }
    textarea { min-height:8rem; }
    button, .btn { display:inline-block; border:0; border-radius:8px; padding:0.55rem 0.9rem; background:var(--accent); color:#04291c; font-weight:650; text-decoration:none; cursor:pointer; }
    button.secondary, .btn.secondary { background:transparent; color:var(--ink); border:1px solid var(--line); }
    .row { display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; }
    .notice { padding:0.7rem 0.85rem; border-radius:8px; background:#14301f; color:#b7f7d4; }
    .error { background:#3a1515; color:#ffc9c9; }
    .kanban { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:0.75rem; }
    .kanban-col { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:0.75rem; min-height:8rem; }
    pre.prompt { white-space:pre-wrap; font-size:0.8rem; background:#0b1015; padding:0.75rem; border-radius:8px; overflow:auto; max-height:18rem; }
    .badge { font-size:0.75rem; color:var(--muted); }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Career OS</h1>
        <p class="muted">Shared catalog. Private overlays and research queue. Cursor does the heavy work.</p>
      </div>
      ${user ? `<form method="post" action="/logout"><button class="secondary" type="submit">Sign out ${escapeHtml(user.email)}</button></form>` : ''}
    </header>
    ${user ? nav(active) : ''}
    ${notice ? `<p class="notice${notice.error ? ' error' : ''}">${escapeHtml(notice.text)}</p>` : ''}
    ${body}
  </main>
  <footer class="muted" style="max-width:1100px;margin:0 auto;padding:0 1.25rem 2rem;font-size:0.85rem;">
    <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Career OS does not auto-submit applications.
  </footer>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
}

export function renderLogin({ googleEnabled, notice }) {
  const google = googleEnabled
    ? `<p><a class="btn" href="/api/auth/google">Continue with Google</a></p>`
    : `<p class="muted">Google login appears after you add GOOGLE_CLIENT_ID to the Worker secrets.</p>`;
  return renderPage({
    title: 'Sign in — Career OS',
    user: null,
    notice,
    active: '/',
    body: `
      <div class="card">
        <h2>Sign in</h2>
        ${google}
        <form method="post" action="/api/auth/register">
          <label>Name<input name="name" autocomplete="name"></label>
          <label>Email<input name="email" type="email" required autocomplete="email"></label>
          <label>Password<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
          <p class="row"><button type="submit">Create workspace</button></p>
        </form>
        <form method="post" action="/api/auth/login">
          <label>Email<input name="email" type="email" required autocomplete="email"></label>
          <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
          <p class="row"><button class="secondary" type="submit">Sign in with email</button></p>
        </form>
        <form method="post" action="/api/auth/magic-link">
          <label>Email for magic link<input name="email" type="email" required></label>
          <p class="row"><button class="secondary" type="submit">Email me a link</button></p>
        </form>
      </div>
      <div class="card">
        <h2>What this site is</h2>
        <p class="muted">Shared public job catalog. Your saved jobs, notes, CV, and people stay in your workspace.</p>
        <p class="muted">This site does not run Cursor, does not send Gmail as you, does not scrape LinkedIn, and does not submit applications. Queue research copies a prompt you paste into Cursor on a computer you control. Fit scores are keyword rules, not an AI draft.</p>
      </div>`,
  });
}

function jobCard(job, { queue = true } = {}) {
  return `
    <article class="card">
      <p class="badge">${escapeHtml(job.source || '')} · ${escapeHtml(job.overlay_status || 'untracked')}</p>
      <strong><a href="/jobs/${encodeURIComponent(job.id)}">${escapeHtml(job.title)}</a></strong>
      <p class="muted">${escapeHtml(job.institution || '')} · ${escapeHtml(job.country || '')} · catalog ${escapeHtml(job.score ?? '—')}/5${job.fit_score != null ? ` · your fit ${escapeHtml(job.fit_score)}/5` : ''}</p>
      <p class="row">
        ${job.url ? `<a class="btn secondary" href="${escapeHtml(job.url)}" rel="noopener noreferrer">Open posting</a>` : ''}
        ${queue ? `<form method="post" action="/api/work-orders"><input type="hidden" name="target_kind" value="job"><input type="hidden" name="target_id" value="${escapeHtml(job.id)}"><button type="submit">Queue research</button></form>` : ''}
      </p>
    </article>`;
}

export function renderToday({ user, jobs, orders, scans, notice }) {
  const inbox = orders.length
    ? orders.map(order => `
        <p class="row">
          <a href="/inbox#${encodeURIComponent(order.id)}">${escapeHtml(order.title || order.id)}</a>
          <span class="badge">${escapeHtml(order.lane)} · ${escapeHtml(order.status)}</span>
        </p>`).join('')
    : '<p class="muted">No open research orders. Queue one from a job or company card.</p>';
  const scanLine = scans.length
    ? scans.map(run => `${run.source}: ${run.status} (${run.upserted})`).join(' · ')
    : 'No cloud scans yet. Local stubs are fine until DATABASE_URL is set.';
  return renderPage({
    title: 'Today — Career OS',
    user,
    notice,
    active: '/',
    body: `
      <div class="card">
        <h2>Today</h2>
        <p class="muted">New catalog rows from GitHub Actions. Your Cursor inbox is private.</p>
        <p class="muted">This website does not run Cursor or submit applications. Copy a prompt from Inbox, paste it into Cursor on your computer, paste the report back.</p>
        <p class="badge">${escapeHtml(scanLine)}</p>
      </div>
      <div class="card">
        <h2>Needs AI</h2>
        ${inbox}
        <p><a class="btn secondary" href="/inbox">Open inbox</a></p>
      </div>
      ${(jobs || []).map(job => jobCard(job)).join('') || '<p class="muted">Catalog is empty.</p>'}`,
  });
}

export function renderFeed({ user, source, jobs, nextCursor, notice }) {
  const more = nextCursor
    ? `<p><a class="btn secondary" href="/feeds/${encodeURIComponent(source)}?cursor=${encodeURIComponent(nextCursor)}">Load more</a></p>`
    : '';
  return renderPage({
    title: `${source} — Career OS`,
    user,
    notice,
    active: `/feeds/${source}`,
    body: `
      <div class="card">
        <h2>${escapeHtml(source)}</h2>
        <p class="muted">Compact list. Details load on the job page. Status stays in your workspace.</p>
      </div>
      ${(jobs || []).map(job => jobCard(job)).join('') || '<p class="muted">No rows for this feed yet.</p>'}
      ${more}`,
  });
}

export function renderJob({ user, job, notice }) {
  if (!job) {
    return renderPage({
      title: 'Job — Career OS',
      user,
      notice: notice || { error: true, text: 'Job not found.' },
      body: '<p class="muted">Unknown job.</p>',
    });
  }
  return renderPage({
    title: `${job.title} — Career OS`,
    user,
    notice,
    active: `/feeds/${job.source}`,
    body: `
      <article class="card">
        <h2>${escapeHtml(job.title)}</h2>
        <p class="muted">${escapeHtml(job.institution)} · ${escapeHtml(job.country)} · catalog ${escapeHtml(job.score ?? '—')}/5${job.fit_score != null ? ` · your fit ${escapeHtml(job.fit_score)}/5 (${escapeHtml((job.fit_hits || []).join(', ') || job.fit_band || '')})` : ''}</p>
        ${job.url ? `<p><a href="${escapeHtml(job.url)}" rel="noopener noreferrer">Open posting</a></p>` : ''}
        ${job.org_id ? `<p><a href="/orgs/${encodeURIComponent(job.org_id)}">Company card</a></p>` : ''}
        <p>${escapeHtml(job.summary || job.description || 'No detail text in the compact catalog. Use Queue research for a Cursor prompt.')}</p>
        <div class="row">
          <form method="post" action="/api/work-orders">
            <input type="hidden" name="target_kind" value="job">
            <input type="hidden" name="target_id" value="${escapeHtml(job.id)}">
            <button type="submit">Queue research</button>
          </form>
          <form method="post" action="/api/work-orders">
            <input type="hidden" name="target_kind" value="job">
            <input type="hidden" name="target_id" value="${escapeHtml(job.id)}">
            <input type="hidden" name="lane" value="pack">
            <button class="secondary" type="submit">Queue pack</button>
          </form>
        </div>
        <form method="post" action="/api/overlays/${encodeURIComponent(job.id)}">
          <label>Status
            <select name="status">
              ${['saved', 'applied', 'researching', 'skipped'].map(status => (
                `<option value="${status}" ${job.overlay_status === status ? 'selected' : ''}>${status}</option>`
              )).join('')}
            </select>
          </label>
          <label>Private notes
            <input name="notes" value="${escapeHtml(job.overlay_notes || '')}">
          </label>
          <p class="row"><button type="submit">Save overlay</button></p>
        </form>
      </article>`,
  });
}

export function renderOrgs({ user, orgs, notice }) {
  const cards = (orgs || []).map(org => `
    <article class="card">
      <strong><a href="/orgs/${encodeURIComponent(org.id)}">${escapeHtml(org.name)}</a></strong>
      <p class="muted">${escapeHtml(org.country || '')} · ${escapeHtml(org.source || '')} · ${escapeHtml(org.job_count ?? 0)} jobs</p>
      <form method="post" action="/api/work-orders">
        <input type="hidden" name="target_kind" value="org">
        <input type="hidden" name="target_id" value="${escapeHtml(org.id)}">
        <input type="hidden" name="lane" value="exhibitor">
        <p class="row"><button type="submit">Queue research</button></p>
      </form>
    </article>`).join('');
  return renderPage({
    title: 'Companies — Career OS',
    user,
    notice,
    active: '/orgs',
    body: `
      <div class="card">
        <h2>Companies</h2>
        <p class="muted">Queue research compiles a Cursor prompt for this company only. Lanes stay isolated.</p>
      </div>
      ${cards || '<p class="muted">No companies yet.</p>'}`,
  });
}

export function renderOrg({ user, org, notice }) {
  if (!org) {
    return renderPage({
      title: 'Company — Career OS',
      user,
      notice: notice || { error: true, text: 'Company not found.' },
      body: '<p class="muted">Unknown company.</p>',
    });
  }
  return renderPage({
    title: `${org.name} — Career OS`,
    user,
    notice,
    active: '/orgs',
    body: `
      <article class="card">
        <h2>${escapeHtml(org.name)}</h2>
        <p class="muted">${escapeHtml(org.country || '')} · ${escapeHtml(org.source || '')}</p>
        ${org.website ? `<p><a href="${escapeHtml(org.website)}" rel="noopener noreferrer">Website</a></p>` : ''}
        ${org.careers_url ? `<p><a href="${escapeHtml(org.careers_url)}" rel="noopener noreferrer">Careers</a></p>` : ''}
        <div class="row">
          <form method="post" action="/api/work-orders">
            <input type="hidden" name="target_kind" value="org">
            <input type="hidden" name="target_id" value="${escapeHtml(org.id)}">
            <input type="hidden" name="lane" value="exhibitor">
            <button type="submit">Queue research</button>
          </form>
          <form method="post" action="/api/work-orders">
            <input type="hidden" name="target_kind" value="org">
            <input type="hidden" name="target_id" value="${escapeHtml(org.id)}">
            <input type="hidden" name="lane" value="networking">
            <button class="secondary" type="submit">Research contacts</button>
          </form>
        </div>
      </article>
      ${(org.jobs || []).map(job => jobCard(job)).join('')}`,
  });
}

function orderCard(order) {
  return `
    <article class="card" id="${escapeHtml(order.id)}">
      <p class="badge">${escapeHtml(order.lane)} · ${escapeHtml(order.target_kind)} · ${escapeHtml(order.status)}${order.contains_pii ? ' · PII' : ''}</p>
      <h2>${escapeHtml(order.title || order.id)}</h2>
      <p class="row">
        <button type="button" class="btn" data-copy="${escapeHtml(order.id)}" onclick="copyPrompt('${escapeHtml(order.id)}')">Copy prompt</button>
        <a class="btn secondary" href="/${order.target_kind === 'org' ? 'orgs' : order.target_kind === 'person' ? 'people' : 'jobs'}/${encodeURIComponent(order.target_id)}">Open target</a>
      </p>
      <pre class="prompt">${escapeHtml(order.prompt_text)}</pre>
      <form method="post" action="/api/work-orders/${encodeURIComponent(order.id)}/complete">
        <label>Paste research markdown
          <textarea name="result_md">${escapeHtml(order.result_md || '')}</textarea>
        </label>
        <label>Status
          <select name="status">
            ${['review_ready', 'completed', 'failed', 'in_progress'].map(status => (
              `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`
            )).join('')}
          </select>
        </label>
        <p class="row"><button type="submit">Save result</button></p>
      </form>
    </article>`;
}

export function renderInbox({ user, orders, notice }) {
  return renderPage({
    title: 'Inbox — Career OS',
    user,
    notice,
    active: '/inbox',
    body: `
      <div class="card">
        <h2>Needs AI</h2>
        <p class="muted">Copy the prompt into Cursor. Paste the report back. This site does not run Cursor, Gemini, or Playwright.</p>
      </div>
      ${(orders || []).map(orderCard).join('') || '<p class="muted">Inbox empty.</p>'}`,
  });
}

export function renderApplied({ user, columns, notice }) {
  const groups = [
    ['saved', 'Saved'],
    ['researching', 'Researching'],
    ['applied', 'Applied'],
    ['skipped', 'Skipped'],
  ];
  const board = groups.map(([status, label]) => `
    <div class="kanban-col">
      <h2>${label}</h2>
      ${(columns[status] || []).map(job => `
        <p><a href="/jobs/${encodeURIComponent(job.job_id)}">${escapeHtml(job.title)}</a>
        <span class="badge">${escapeHtml(job.institution || '')}</span></p>
        <form method="post" action="/api/overlays/${encodeURIComponent(job.job_id)}">
          <input type="hidden" name="notes" value="${escapeHtml(job.notes || '')}">
          <select name="status" onchange="this.form.submit()">
            ${['saved', 'researching', 'applied', 'skipped'].map(option => (
              `<option value="${option}" ${status === option ? 'selected' : ''}>${option}</option>`
            )).join('')}
          </select>
        </form>`).join('') || '<p class="muted">Empty</p>'}
    </div>`).join('');
  return renderPage({
    title: 'Applied — Career OS',
    user,
    notice,
    active: '/applied',
    body: `
      <div class="card">
        <h2>Private kanban</h2>
        <p class="muted">Only ${escapeHtml(user.email)} can see these overlays.</p>
      </div>
      <div class="kanban">${board}</div>`,
  });
}

export function renderPeople({ user, people, orgs, notice }) {
  const orgOptions = (orgs || []).map(org => `<option value="${escapeHtml(org.id)}">${escapeHtml(org.name)}</option>`).join('');
  const cards = (people || []).map(person => `
    <article class="card">
      <strong>${escapeHtml(person.display_name)}</strong>
      <p class="muted">${escapeHtml(person.title || '')} · ${escapeHtml(person.organization_name || '')} · ${escapeHtml(person.review_status)}</p>
      <form method="post" action="/api/work-orders">
        <input type="hidden" name="target_kind" value="person">
        <input type="hidden" name="target_id" value="${escapeHtml(person.id)}">
        <input type="hidden" name="lane" value="networking">
        <p class="row"><button type="submit">Queue research</button></p>
      </form>
    </article>`).join('');
  return renderPage({
    title: 'People — Career OS',
    user,
    notice,
    active: '/orgs',
    body: `
      <div class="card">
        <h2>People (private)</h2>
        <p class="muted">Networking PII stays in your workspace. It is never written to a public snapshot.</p>
        <form method="post" action="/api/people">
          <label>Name<input name="display_name" required></label>
          <label>Title<input name="title"></label>
          <label>Organization name<input name="organization_name"></label>
          <label>Link to catalog company
            <select name="org_id"><option value="">None</option>${orgOptions}</select>
          </label>
          <p class="row"><button type="submit">Add person</button></p>
        </form>
      </div>
      ${cards || '<p class="muted">No people yet.</p>'}`,
  });
}

export function renderProfile({ user, profile, notice }) {
  const digestOn = profile?.digest_enabled === true || profile?.digest_enabled === 't';
  return renderPage({
    title: 'Profile — Career OS',
    user,
    notice,
    active: '/profile',
    body: `
      <div class="card">
        <h2>CV and keywords</h2>
        <p class="muted">Stored only in your workspace. Used for rule scores and the printable resume. No Gemini.</p>
        <form method="post" action="/api/profile">
          <label>Name for resume<input name="display_name" value="${escapeHtml(profile?.display_name || user.name || '')}"></label>
          <label>Fit keywords (comma-separated)<input name="keywords" value="${escapeHtml(profile?.keywords || '')}" placeholder="plasma, FPGA, vacuum"></label>
          <label>CV text<textarea name="cv_text">${escapeHtml(profile?.cv_text || '')}</textarea></label>
          <label>Load a .txt or .md file into the box above (stays in this browser until you Save)
            <input type="file" accept=".txt,.md,text/plain" onchange="loadCvFile(this)">
          </label>
          <label class="row"><input type="checkbox" name="digest_enabled" ${digestOn ? 'checked' : ''} style="width:auto"> Email me new catalog jobs (Resend, max 100/day across the app)</label>
          <p class="row">
            <button type="submit">Save profile</button>
            <a class="btn secondary" href="/resume">Print resume</a>
            <a class="btn secondary" href="/api/export">Export my data</a>
          </p>
        </form>
      </div>
      <div class="card">
        <h2>Delete account</h2>
        <p class="muted">Removes your login, overlays, people, CV, and work orders. Shared job catalog stays.</p>
        <form method="post" action="/api/account/delete">
          <label>Type DELETE to confirm<input name="confirm" required autocomplete="off"></label>
          <p class="row"><button type="submit">Delete my workspace</button></p>
        </form>
      </div>`,
  });
}

export function renderResume({ user, profile }) {
  const name = profile?.display_name || user.name || user.email;
  const body = String(profile?.cv_text || '').trim() || 'Paste CV text on the Profile page, then return here and print.';
  const paragraphs = escapeHtml(body).replace(/\n/g, '<br>');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(name)} — Resume</title>
  <style>
    body { font: 16px/1.45 Georgia, serif; color: #111; max-width: 720px; margin: 2rem auto; padding: 0 1rem 4rem; }
    h1 { font-size: 1.6rem; margin-bottom: 0.2rem; }
    .muted { color: #555; }
    @media print { button { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <p><button onclick="window.print()">Print / Save PDF</button> <a href="/profile">Back to profile</a></p>
  <h1>${escapeHtml(name)}</h1>
  <p class="muted">${escapeHtml(user.email)}</p>
  <div>${paragraphs}</div>
</body>
</html>`;
}

export function renderLegal({ slug, user }) {
  const pages = {
    privacy: {
      title: 'Privacy',
      body: `
        <h2>Privacy</h2>
        <p>Career OS stores your email, optional CV text, job overlays, research prompts, and people you add. Job catalog rows are shared public postings.</p>
        <p>Networking names and notes never go into a static snapshot. We do not scrape LinkedIn. We do not submit applications for you.</p>
        <p>Export or delete your workspace from Profile. Magic-link mail, if enabled, is sent through Resend.</p>
        <p>This product is MIT-licensed career-ops software. Hosting on free Neon/Cloudflare tiers may process data in those providers’ regions.</p>`,
    },
    terms: {
      title: 'Terms',
      body: `
        <h2>Terms</h2>
        <p>You use Career OS at your own risk. Fit scores are keyword rules, not legal or immigration advice.</p>
        <p>Do not use the research prompts to scrape LinkedIn, send spam, or submit applications without the human clicking send.</p>
        <p>This site is not Cursor-on-your-phone. Factory LaTeX/Playwright packs stay on a machine you control (Docker or local :3737). There is no Gmail send-as-you. Free-tier hosting may pause when idle. There is no SLA.</p>
        <p>License: MIT. See the career-ops repository LICENSE file.</p>`,
    },
  };
  const page = pages[slug] || pages.privacy;
  return renderPage({
    title: `${page.title} — Career OS`,
    user,
    active: '/',
    body: `<div class="card">${page.body}</div>`,
  });
}

export { escapeHtml };
