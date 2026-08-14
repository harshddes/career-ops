import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  SESSION_COOKIE,
  consumeMagicLink,
  cookieHeader,
  clearCookieHeader,
  createMagicLink,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  readSession,
  upsertGoogleUser,
  verifyPassword,
} from './auth.mjs';
import {
  FEED_SOURCES,
  getJob,
  getOrg,
  latestScanRuns,
  listFeed,
  listOrgs,
  listOverlays,
  listRecentJobs,
  patchOverlay,
  stubEuraxessJobs,
  stubOrgs,
  upsertCatalogJobs,
  upsertCatalogOrgs,
} from './catalog.mjs';
import {
  completeWorkOrder,
  createWorkOrder,
  getWorkOrder,
  listWorkOrders,
  markWorkOrderCopied,
} from './work-orders.mjs';
import { createPerson, listPeople } from './people.mjs';
import {
  deleteUserAndWorkspace,
  exportWorkspace,
  getProfile,
  saveProfile,
} from './profile.mjs';
import { attachFitScores } from './score.mjs';
import { sendResendEmail } from './mail.mjs';
import {
  renderApplied,
  renderFeed,
  renderInbox,
  renderJob,
  renderLegal,
  renderLogin,
  renderOrg,
  renderOrgs,
  renderPeople,
  renderProfile,
  renderResume,
  renderToday,
} from './html.mjs';

export function createApp({ db, env = {}, seedStubCatalog = false }) {
  const app = new Hono();
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  function cookieSecure(c) {
    if (String(env.APP_BASE_URL || '').startsWith('https://')) return true;
    try {
      return new URL(c.req.url).protocol === 'https:';
    } catch {
      return false;
    }
  }

  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('session', await readSession(db, getCookie(c, SESSION_COOKIE)));
    await next();
  });

  async function ensureStub() {
    if (!seedStubCatalog) return;
    await upsertCatalogOrgs(db, stubOrgs());
    await upsertCatalogJobs(db, stubEuraxessJobs());
  }

  function baseUrl(c) {
    return env.APP_BASE_URL || new URL(c.req.url).origin;
  }

  function requireSession(c) {
    const session = c.get('session');
    if (session) return session;
    return null;
  }

  function loginOr(c, session) {
    if (session) return null;
    const accept = c.req.header('accept') || '';
    if (c.req.method === 'GET' && !accept.includes('application/json')) {
      return c.html(renderLogin({ googleEnabled }));
    }
    if (wantsHtml(c) && c.req.method === 'GET') {
      return c.html(renderLogin({ googleEnabled }));
    }
    return c.json({ error: 'unauthorized' }, 401);
  }

  async function withFit(session, jobs) {
    const profile = await getProfile(db, { tenantId: session.workspace_id, userId: session.user_id });
    return attachFitScores(jobs || [], profile);
  }

  app.get('/privacy', c => c.html(renderLegal({ slug: 'privacy', user: c.get('session') })));
  app.get('/terms', c => c.html(renderLegal({ slug: 'terms', user: c.get('session') })));

  app.get('/healthz', c => c.json({
    ok: true,
    service: 'career-os-web',
    google: googleEnabled,
    catalog_seeded: seedStubCatalog,
  }));

  app.get('/', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    await ensureStub();
    const [rawJobs, orders, scans] = await Promise.all([
      listRecentJobs(db, { tenantId: session.workspace_id, userId: session.user_id }),
      listWorkOrders(db, { tenantId: session.workspace_id, userId: session.user_id }),
      latestScanRuns(db),
    ]);
    const jobs = await withFit(session, rawJobs);
    return c.html(renderToday({
      user: { email: session.email, name: session.name },
      jobs,
      orders,
      scans,
    }));
  });

  app.get('/feeds/:source', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    const source = c.req.param('source');
    if (!FEED_SOURCES.includes(source)) return c.text('Unknown feed', 404);
    await ensureStub();
    const page = await listFeed(db, {
      source,
      tenantId: session.workspace_id,
      userId: session.user_id,
      cursor: c.req.query('cursor') || null,
    });
    return c.html(renderFeed({
      user: { email: session.email, name: session.name },
      source,
      jobs: await withFit(session, page.jobs),
      nextCursor: page.next_cursor,
    }));
  });

  app.get('/jobs/:id', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    await ensureStub();
    const job = await getJob(db, {
      jobId: c.req.param('id'),
      tenantId: session.workspace_id,
      userId: session.user_id,
    });
    if (!job) return c.html(renderJob({ user: { email: session.email }, job: null }), 404);
    const [scored] = await withFit(session, [job]);
    return c.html(renderJob({ user: { email: session.email, name: session.name }, job: scored }));
  });

  app.get('/orgs', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    await ensureStub();
    const orgs = await listOrgs(db, { tenantId: session.workspace_id, userId: session.user_id });
    return c.html(renderOrgs({ user: { email: session.email, name: session.name }, orgs }));
  });

  app.get('/orgs/:id', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    await ensureStub();
    const org = await getOrg(db, {
      orgId: c.req.param('id'),
      tenantId: session.workspace_id,
      userId: session.user_id,
    });
    if (!org) return c.html(renderOrg({ user: { email: session.email }, org: null }), 404);
    org.jobs = await withFit(session, org.jobs);
    return c.html(renderOrg({ user: { email: session.email, name: session.name }, org }));
  });

  app.get('/inbox', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    const orders = await listWorkOrders(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      openOnly: false,
    });
    return c.html(renderInbox({ user: { email: session.email, name: session.name }, orders }));
  });

  app.get('/applied', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    const rows = await listOverlays(db, { tenantId: session.workspace_id, userId: session.user_id });
    const columns = { saved: [], researching: [], applied: [], skipped: [] };
    for (const row of rows) {
      (columns[row.status] || columns.saved).push(row);
    }
    return c.html(renderApplied({
      user: { email: session.email, name: session.name },
      columns,
    }));
  });

  app.get('/people', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    await ensureStub();
    const [people, orgs] = await Promise.all([
      listPeople(db, { tenantId: session.workspace_id, userId: session.user_id }),
      listOrgs(db, { tenantId: session.workspace_id, userId: session.user_id }),
    ]);
    return c.html(renderPeople({
      user: { email: session.email, name: session.name },
      people,
      orgs,
    }));
  });

  app.get('/profile', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    const profile = await getProfile(db, { tenantId: session.workspace_id, userId: session.user_id });
    return c.html(renderProfile({
      user: { email: session.email, name: session.name },
      profile,
    }));
  });

  app.get('/resume', async c => {
    const session = requireSession(c);
    const denied = loginOr(c, session);
    if (denied) return denied;
    const profile = await getProfile(db, { tenantId: session.workspace_id, userId: session.user_id });
    return c.html(renderResume({
      user: { email: session.email, name: session.name },
      profile,
    }));
  });

  app.post('/api/profile', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const body = await readBody(c);
    const result = await saveProfile(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      displayName: String(body.display_name || ''),
      cvText: String(body.cv_text || ''),
      keywords: String(body.keywords || ''),
      digestEnabled: body.digest_enabled === 'on' || body.digest_enabled === true || body.digest_enabled === 'true',
    });
    if (wantsHtml(c)) return c.redirect('/profile');
    return c.json(result);
  });

  app.get('/api/export', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const payload = await exportWorkspace(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      email: session.email,
      name: session.name,
    });
    c.header('content-disposition', 'attachment; filename="career-os-export.json"');
    return c.json(payload);
  });

  app.post('/api/account/delete', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const body = await readBody(c);
    if (String(body.confirm || '') !== 'DELETE') {
      if (wantsHtml(c)) {
        const profile = await getProfile(db, { tenantId: session.workspace_id, userId: session.user_id });
        return c.html(renderProfile({
          user: { email: session.email, name: session.name },
          profile,
          notice: { error: true, text: 'Type DELETE to confirm.' },
        }), 400);
      }
      return c.json({ error: 'confirm_required' }, 400);
    }
    await deleteUserAndWorkspace(db, { userId: session.user_id, email: session.email });
    c.header('Set-Cookie', clearCookieHeader({ secure: cookieSecure(c) }));
    if (wantsHtml(c)) return c.redirect('/');
    return c.json({ ok: true });
  });

  app.post('/api/auth/register', async c => {
    const body = await readBody(c);
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const name = String(body.name || '');
    if (!email || password.length < 8) {
      return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Email and an 8+ character password are required.' } }), 400);
    }
    if (await findUserByEmail(db, email)) {
      return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'That email already has a workspace. Sign in.' } }), 409);
    }
    const user = await createUser(db, { email, name, password });
    return attachSession(c, db, user.id, cookieSecure(c), '/');
  });

  app.post('/api/auth/login', async c => {
    const body = await readBody(c);
    const user = await findUserByEmail(db, String(body.email || ''));
    const ok = user && await verifyPassword(String(body.password || ''), user.password_hash);
    if (!ok) {
      return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Email or password is wrong.' } }), 401);
    }
    return attachSession(c, db, user.id, cookieSecure(c), '/');
  });

  app.post('/api/auth/magic-link', async c => {
    const body = await readBody(c);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Email is required.' } }), 400);
    const link = await createMagicLink(db, email);
    const url = `${baseUrl(c)}/api/auth/magic-link/consume?token=${link.id}`;
    if (env.RESEND_API_KEY) {
      await sendResendEmail(env, {
        to: email,
        subject: 'Your Career OS sign-in link',
        text: `Sign in: ${url}\nThis link expires in 30 minutes.`,
      });
      return c.html(renderLogin({ googleEnabled, notice: { text: 'Check your email for the sign-in link.' } }));
    }
    if (env.ALLOW_INSECURE_MAGIC_LINK === '1') {
      return c.html(renderLogin({ googleEnabled, notice: { text: `Dev magic link: ${url}` } }));
    }
    return c.html(renderLogin({
      googleEnabled,
      notice: { text: 'Magic link stored. Add RESEND_API_KEY to email it, or set ALLOW_INSECURE_MAGIC_LINK=1 for local testing.' },
    }));
  });

  app.get('/api/auth/magic-link/consume', async c => {
    const token = c.req.query('token');
    const row = await consumeMagicLink(db, token);
    if (!row) return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'That link is invalid or expired.' } }), 400);
    const existing = await findUserByEmail(db, row.email);
    const user = existing || await createUser(db, { email: row.email, name: '', password: null });
    return attachSession(c, db, user.id, cookieSecure(c), '/');
  });

  app.get('/api/auth/google', c => {
    if (!googleEnabled) return c.text('Google OAuth is not configured', 501);
    const state = crypto.randomUUID();
    const redirectUri = `${baseUrl(c)}/api/auth/google/callback`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    c.header('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${cookieSecure(c) ? '; Secure' : ''}`);
    return c.redirect(url.toString());
  });

  app.get('/api/auth/google/callback', async c => {
    if (!googleEnabled) return c.text('Google OAuth is not configured', 501);
    const code = c.req.query('code');
    const state = c.req.query('state');
    const cookieState = getCookie(c, 'oauth_state');
    if (!code || !state || state !== cookieState) {
      return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Google sign-in was rejected.' } }), 400);
    }
    const redirectUri = `${baseUrl(c)}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Google token exchange failed.' } }), 400);
    }
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profile.email) {
      return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Google did not return an email.' } }), 400);
    }
    const user = await upsertGoogleUser(db, { email: profile.email, name: profile.name || '' });
    return attachSession(c, db, user.id, cookieSecure(c), '/');
  });

  app.post('/logout', async c => {
    await destroySession(db, getCookie(c, SESSION_COOKIE));
    c.header('Set-Cookie', clearCookieHeader({ secure: cookieSecure(c) }));
    return c.redirect('/');
  });

  app.get('/api/me', c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    return c.json({
      user_id: session.user_id,
      email: session.email,
      name: session.name,
      workspace_id: session.workspace_id,
    });
  });

  app.get('/api/feeds/:source', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const source = c.req.param('source');
    if (!FEED_SOURCES.includes(source)) return c.json({ error: 'unknown_feed' }, 404);
    await ensureStub();
    const page = await listFeed(db, {
      source,
      tenantId: session.workspace_id,
      userId: session.user_id,
      cursor: c.req.query('cursor') || null,
    });
    return c.json({
      view: 'list',
      source,
      jobs: await withFit(session, page.jobs),
      next_cursor: page.next_cursor,
    });
  });

  app.post('/api/overlays/:jobId', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    await ensureStub();
    const body = await readBody(c);
    const result = await patchOverlay(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      jobId: c.req.param('jobId'),
      status: String(body.status || 'saved'),
      notes: String(body.notes || ''),
    });
    if (!result.ok) return c.json(result, 404);
    if (wantsHtml(c)) return c.redirect(c.req.header('referer') || `/jobs/${c.req.param('jobId')}`);
    return c.json(result);
  });

  app.post('/api/work-orders', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    await ensureStub();
    const body = await readBody(c);
    const result = await createWorkOrder(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      lane: body.lane || undefined,
      targetKind: String(body.target_kind || 'job'),
      targetId: String(body.target_id || ''),
      pack: body.lane === 'pack' || body.pack === true || body.pack === 'true',
      baseUrl: baseUrl(c),
    });
    if (!result.ok) return c.json(result, result.status || 400);
    if (wantsHtml(c)) return c.redirect(`/inbox#${result.order.id}`);
    return c.json(result);
  });

  app.get('/api/work-orders', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const orders = await listWorkOrders(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      openOnly: c.req.query('open') !== '0',
    });
    return c.json({ orders });
  });

  app.post('/api/work-orders/:id/copy', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const result = await markWorkOrderCopied(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      orderId: c.req.param('id'),
    });
    if (!result.ok) return c.json(result, result.status || 404);
    return c.json(result);
  });

  app.post('/api/work-orders/:id/complete', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const body = await readBody(c);
    const result = await completeWorkOrder(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      orderId: c.req.param('id'),
      resultMd: String(body.result_md || ''),
      status: String(body.status || 'review_ready'),
    });
    if (!result.ok) return c.json(result, result.status || 404);
    if (wantsHtml(c)) return c.redirect(`/inbox#${c.req.param('id')}`);
    return c.json(result);
  });

  app.get('/api/work-orders/:id', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const order = await getWorkOrder(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      orderId: c.req.param('id'),
    });
    if (!order) return c.json({ error: 'unknown_order' }, 404);
    return c.json({ order });
  });

  app.post('/api/people', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const body = await readBody(c);
    const result = await createPerson(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      displayName: body.display_name,
      title: body.title,
      organizationName: body.organization_name,
      orgId: body.org_id || null,
      notes: body.notes,
    });
    if (!result.ok) return c.json(result, result.status || 400);
    if (wantsHtml(c)) return c.redirect('/people');
    return c.json(result);
  });

  app.get('/api/people', async c => {
    const session = requireSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    const people = await listPeople(db, { tenantId: session.workspace_id, userId: session.user_id });
    return c.json({ people });
  });

  app.post('/api/internal/catalog', async c => {
    const key = c.req.header('x-catalog-key') || '';
    if (!env.CATALOG_SERVICE_KEY || key !== env.CATALOG_SERVICE_KEY) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => ({}));
    if (Array.isArray(body.orgs)) await upsertCatalogOrgs(db, body.orgs);
    const jobs = Array.isArray(body.jobs) ? body.jobs : stubEuraxessJobs();
    const count = await upsertCatalogJobs(db, jobs);
    return c.json({ ok: true, upserted: count });
  });

  return app;
}

async function attachSession(c, db, userId, secure, location) {
  const session = await createSession(db, userId);
  c.header('Set-Cookie', cookieHeader(session.id, { secure, expiresAt: session.expiresAt }));
  return c.redirect(location);
}

async function readBody(c) {
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) return c.req.json();
  const form = await c.req.parseBody();
  return form || {};
}

function wantsHtml(c) {
  return (c.req.header('accept') || '').includes('text/html')
    || (c.req.header('content-type') || '').includes('application/x-www-form-urlencoded');
}
