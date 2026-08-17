import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 14;
export const SESSION_COOKIE = 'career_os_session';

export function newId(prefix = '') {
  const body = randomBytes(16).toString('hex');
  return prefix ? `${prefix}_${body}` : body;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 32);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hex] = stored.split('$');
  if (!salt || !hex) return false;
  const derived = await scrypt(password, salt, 32);
  const expected = Buffer.from(hex, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export async function createUser(db, { email, name = '', password }) {
  const id = newId('user');
  const passwordHash = password ? await hashPassword(password) : null;
  await db.query(
    `INSERT INTO users (id, email, name, password_hash, email_verified)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, email.toLowerCase().trim(), name.trim(), passwordHash, !password],
  );
  const workspaceId = newId('ws');
  await db.query(
    'INSERT INTO workspaces (id, user_id) VALUES ($1, $2)',
    [workspaceId, id],
  );
  return { id, email: email.toLowerCase().trim(), name: name.trim(), workspaceId };
}

export async function findUserByEmail(db, email) {
  const rows = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  return rows[0] || null;
}

export async function workspaceForUser(db, userId) {
  const rows = await db.query('SELECT * FROM workspaces WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

export async function createSession(db, userId) {
  const id = newId('sess');
  const expiresAt = sessionExpiry();
  await db.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [id, userId, expiresAt.toISOString()],
  );
  return { id, expiresAt };
}

export async function readSession(db, sessionId) {
  if (!sessionId) return null;
  const rows = await db.query(
    `SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.email, u.name, w.id AS workspace_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspaces w ON w.user_id = u.id
      WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    return null;
  }
  return row;
}

export async function destroySession(db, sessionId) {
  if (!sessionId) return;
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function upsertGoogleUser(db, { email, name }) {
  const existing = await findUserByEmail(db, email);
  if (existing) {
    const workspace = await workspaceForUser(db, existing.id);
    return { ...existing, workspaceId: workspace.id };
  }
  return createUser(db, { email, name, password: null });
}

export async function createMagicLink(db, email) {
  const id = newId('magic');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.query(
    'INSERT INTO magic_links (id, email, expires_at) VALUES ($1, $2, $3)',
    [id, email.toLowerCase().trim(), expiresAt.toISOString()],
  );
  return { id, expiresAt };
}

export async function consumeMagicLink(db, id) {
  const rows = await db.query('SELECT * FROM magic_links WHERE id = $1', [id]);
  const row = rows[0];
  if (!row) return null;
  await db.query('DELETE FROM magic_links WHERE id = $1', [id]);
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row;
}

export function cookieHeader(sessionId, { secure, expiresAt }) {
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader({ secure }) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
