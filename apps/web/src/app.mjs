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
import { listFeed, patchOverlay, stubEuraxessJobs, upsertCatalogJobs } from './catalog.mjs';
import { renderDashboard, renderLogin } from './html.mjs';

export function createApp({ db, env = {}, seedStubCatalog = false }) {
  const app = new Hono();
  const secure = String(env.APP_BASE_URL || '').startsWith('https://');
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('session', await readSession(db, getCookie(c, SESSION_COOKIE)));
    await next();
  });

  app.get('/healthz', c => c.json({
    ok: true,
    service: 'career-os-web',
    google: googleEnabled,
    catalog_seeded: seedStubCatalog,
  }));

  app.get('/', async c => {
    const session = c.get('session');
    if (!session) return c.html(renderLogin({ googleEnabled }));
    if (seedStubCatalog) await upsertCatalogJobs(db, stubEuraxessJobs());
    const jobs = await listFeed(db, {
      source: 'euraxess',
      tenantId: session.workspace_id,
      userId: session.user_id,
    });
    return c.html(renderDashboard({
      user: { email: session.email, name: session.name },
      jobs,
    }));
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
    return attachSession(c, db, user.id, secure, '/');
  });

  app.post('/api/auth/login', async c => {
    const body = await readBody(c);
    const user = await findUserByEmail(db, String(body.email || ''));
    const ok = user && await verifyPassword(String(body.password || ''), user.password_hash);
    if (!ok) {
      return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Email or password is wrong.' } }), 401);
    }
    return attachSession(c, db, user.id, secure, '/');
  });

  app.post('/api/auth/magic-link', async c => {
    const body = await readBody(c);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return c.html(renderLogin({ googleEnabled, notice: { error: true, text: 'Email is required.' } }), 400);
    const link = await createMagicLink(db, email);
    const base = env.APP_BASE_URL || new URL(c.req.url).origin;
    const url = `${base}/api/auth/magic-link/consume?token=${link.id}`;
    if (env.RESEND_API_KEY) {
      await sendResend(env, email, url);
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
    return attachSession(c, db, user.id, secure, '/');
  });

  app.get('/api/auth/google', c => {
    if (!googleEnabled) return c.text('Google OAuth is not configured', 501);
    const state = crypto.randomUUID();
    const redirectUri = `${env.APP_BASE_URL || new URL(c.req.url).origin}/api/auth/google/callback`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    c.header('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`);
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
    const redirectUri = `${env.APP_BASE_URL || new URL(c.req.url).origin}/api/auth/google/callback`;
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
    return attachSession(c, db, user.id, secure, '/');
  });

  app.post('/logout', async c => {
    await destroySession(db, getCookie(c, SESSION_COOKIE));
    c.header('Set-Cookie', clearCookieHeader({ secure }));
    return c.redirect('/');
  });

  app.get('/api/me', c => {
    const session = c.get('session');
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    return c.json({
      user_id: session.user_id,
      email: session.email,
      name: session.name,
      workspace_id: session.workspace_id,
    });
  });

  app.get('/api/feeds/euraxess', async c => {
    const session = c.get('session');
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    if (seedStubCatalog) await upsertCatalogJobs(db, stubEuraxessJobs());
    const jobs = await listFeed(db, {
      source: 'euraxess',
      tenantId: session.workspace_id,
      userId: session.user_id,
    });
    return c.json({ view: 'list', jobs });
  });

  app.post('/api/overlays/:jobId', async c => {
    const session = c.get('session');
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    if (seedStubCatalog) await upsertCatalogJobs(db, stubEuraxessJobs());
    const body = await readBody(c);
    const result = await patchOverlay(db, {
      tenantId: session.workspace_id,
      userId: session.user_id,
      jobId: c.req.param('jobId'),
      status: String(body.status || 'saved'),
      notes: String(body.notes || ''),
    });
    if (!result.ok) return c.json(result, 404);
    if (wantsHtml(c)) return c.redirect('/');
    return c.json(result);
  });

  app.post('/api/internal/catalog', async c => {
    const key = c.req.header('x-catalog-key') || '';
    if (!env.CATALOG_SERVICE_KEY || key !== env.CATALOG_SERVICE_KEY) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => ({}));
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

async function sendResend(env, to, url) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Career OS <onboarding@resend.dev>',
      to: [to],
      subject: 'Your Career OS sign-in link',
      text: `Sign in: ${url}\nThis link expires in 30 minutes.`,
    }),
  });
}
