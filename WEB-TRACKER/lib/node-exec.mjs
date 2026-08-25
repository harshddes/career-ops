/**
 * Child Node processes that write live catalogs must see the same SQLite engine
 * as the HTTP server. Node 22.12 exposes DatabaseSync behind this flag;
 * better-sqlite3 AVs on this Windows/Node combo so we do not load it.
 */
export const EXPERIMENTAL_SQLITE = '--experimental-sqlite';

export function sqliteFlagEnabled() {
  if (process.execArgv.includes(EXPERIMENTAL_SQLITE)) return true;
  return /(^|\s)--experimental-sqlite(\s|$)/.test(String(process.env.NODE_OPTIONS || ''));
}

export function nodeScriptInvocation(scriptPath, scriptArgs = []) {
  return [EXPERIMENTAL_SQLITE, scriptPath, ...scriptArgs];
}
