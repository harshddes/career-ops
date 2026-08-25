#!/usr/bin/env node
/**
 * Nightly copy of the local live WAL into Dropbox. Never on the click path.
 */
import { cpSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getLiveDataDir, REPO_DATA_DIR } from '../lib/data-paths.mjs';
import { LIVE_TABLES, readLiveCollection } from '../lib/db.mjs';
import {
  syncConsiderJobsToDashboard,
} from '../lib/jobs-to-consider-store.mjs';
import { syncEuraxessOpportunitiesToDashboard } from '../lib/euraxess/opportunity-store.mjs';
import { syncPhdscannerOpportunitiesToDashboard } from '../lib/phdscanner/opportunity-store.mjs';
import { syncUmichOpportunitiesToDashboard } from '../lib/umich-careers/opportunity-store.mjs';
import { syncResearchProspectsToDashboard } from '../lib/research-prospect-store.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(REPO_DATA_DIR, 'live-backup');

function copyLiveDir() {
  const liveDir = getLiveDataDir();
  if (!existsSync(liveDir)) {
    console.log(`[backup] live dir missing: ${liveDir}`);
    return { copied: false, liveDir };
  }
  mkdirSync(BACKUP_DIR, { recursive: true });
  cpSync(liveDir, BACKUP_DIR, { recursive: true });
  return { copied: true, liveDir, backupDir: BACKUP_DIR };
}

function exportSnapshots() {
  const tables = Object.keys(LIVE_TABLES);
  for (const table of tables) {
    try {
      readLiveCollection(table);
    } catch {}
  }
  syncEuraxessOpportunitiesToDashboard({ write: true });
  syncPhdscannerOpportunitiesToDashboard({ write: true });
  syncUmichOpportunitiesToDashboard({ write: true });
  syncConsiderJobsToDashboard({ write: true });
  syncResearchProspectsToDashboard({ write: true });
}

const copy = copyLiveDir();
exportSnapshots();
console.log(JSON.stringify({
  ok: true,
  generated_at: new Date().toISOString(),
  script: join(BASE, 'backup-live-data.mjs'),
  ...copy,
}, null, 2));
