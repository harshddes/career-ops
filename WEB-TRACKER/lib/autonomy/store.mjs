import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

function readLines(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function writeLines(filePath, rows) {
  writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

export class AutonomyRunStore {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  list({ limit = 50 } = {}) {
    return readLines(this.filePath)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit);
  }

  append(input = {}) {
    const now = new Date().toISOString();
    const run = {
      id: input.id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      created_at: now,
      updated_at: now,
      status: input.status || 'created',
      ...input,
    };
    appendFileSync(this.filePath, `${JSON.stringify(run)}\n`);
    return run;
  }

  update(id, patch = {}) {
    const rows = readLines(this.filePath);
    const index = rows.findIndex(row => row.id === id);
    if (index === -1) return null;
    rows[index] = {
      ...rows[index],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    writeLines(this.filePath, rows);
    return rows[index];
  }

  countToday({ provider = null } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    return readLines(this.filePath).filter(row => {
      if (!String(row.created_at || '').startsWith(today)) return false;
      if (provider && row.provider !== provider) return false;
      return ['submitted', 'completed', 'timeout', 'needs_user'].includes(row.status);
    }).length;
  }
}
