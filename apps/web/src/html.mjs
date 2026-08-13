function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderPage({ title, user, body, notice }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; --bg:#0f1419; --card:#1a222c; --ink:#e8eef4; --muted:#93a1b0; --accent:#6ee7b7; --line:#2a3542; }
    body { margin:0; font:16px/1.5 ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    main { max-width:880px; margin:0 auto; padding:2rem 1.25rem 4rem; }
    header { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1.5rem; }
    h1 { font-size:1.35rem; margin:0; }
    .muted { color:var(--muted); }
    .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1rem 1.1rem; margin:0.75rem 0; }
    label { display:block; font-size:0.85rem; color:var(--muted); margin:0.6rem 0 0.25rem; }
    input { width:100%; box-sizing:border-box; padding:0.55rem 0.65rem; border-radius:8px; border:1px solid var(--line); background:#0f1419; color:var(--ink); }
    button, .btn { display:inline-block; border:0; border-radius:8px; padding:0.55rem 0.9rem; background:var(--accent); color:#04291c; font-weight:650; text-decoration:none; cursor:pointer; }
    button.secondary, .btn.secondary { background:transparent; color:var(--ink); border:1px solid var(--line); }
    .row { display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; }
    .notice { padding:0.7rem 0.85rem; border-radius:8px; background:#14301f; color:#b7f7d4; }
    .error { background:#3a1515; color:#ffc9c9; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Career OS</h1>
        <p class="muted">Public workspace — your jobs stay yours.</p>
      </div>
      ${user ? `<form method="post" action="/logout"><button class="secondary" type="submit">Sign out ${escapeHtml(user.email)}</button></form>` : ''}
    </header>
    ${notice ? `<p class="notice${notice.error ? ' error' : ''}">${escapeHtml(notice.text)}</p>` : ''}
    ${body}
  </main>
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
      </div>`,
  });
}

export function renderDashboard({ user, jobs, notice }) {
  const cards = jobs.length
    ? jobs.map(job => `
      <article class="card">
        <strong>${escapeHtml(job.title)}</strong>
        <p class="muted">${escapeHtml(job.institution)} · ${escapeHtml(job.country)} · ${escapeHtml(job.score ?? '—')}/5</p>
        <p><a href="${escapeHtml(job.url)}" rel="noopener noreferrer">Open posting</a></p>
        <form method="post" action="/api/overlays/${encodeURIComponent(job.id)}">
          <label>Status
            <input name="status" value="${escapeHtml(job.overlay_status || 'saved')}">
          </label>
          <label>Private notes
            <input name="notes" value="${escapeHtml(job.overlay_notes || '')}">
          </label>
          <p class="row"><button type="submit">Save my overlay</button></p>
        </form>
      </article>`).join('')
    : `<p class="muted">Catalog is empty. The public GitHub Action upserts EURAXESS list rows when DATABASE_URL is set.</p>`;

  return renderPage({
    title: 'EURAXESS — Career OS',
    user,
    notice,
    body: `
      <div class="card">
        <h2>EURAXESS</h2>
        <p class="muted">Shared public catalog. Status and notes are only visible to ${escapeHtml(user.email)}.</p>
      </div>
      ${cards}`,
  });
}
