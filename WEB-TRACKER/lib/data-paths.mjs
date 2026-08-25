/**
 * Live vs repo data directories.
 * Fat catalogs live under CAREER_OPS_LIVE_DATA_DIR (local NTFS), not Dropbox.
 * Repo `data/` remains the JSON import/export source.
 */
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const REPO_DATA_DIR = join(CAREER_OPS_DIR, 'data');
export const DASHBOARD_DATA_DIR = join(WEB_TRACKER_DIR, 'data');

function envPath(name) {
  const value = String(process.env[name] || '').trim();
  return value || '';
}

export function defaultLiveDataDir() {
  if (process.platform === 'win32') {
    const localApp = envPath('LOCALAPPDATA') || join(homedir(), 'AppData', 'Local');
    return join(localApp, 'career-ops', 'live-data');
  }
  return join(homedir(), '.career-ops', 'live-data');
}

export function getLiveDataDir() {
  return envPath('CAREER_OPS_LIVE_DATA_DIR')
    || envPath('CAREER_DATA_DIR')
    || defaultLiveDataDir();
}

/** Canonical JSON import/export directory (Dropbox repo). */
export function getCanonicalDataDir() {
  return envPath('CAREER_OPS_DATA_DIR') || REPO_DATA_DIR;
}

export const CAREER_DATA_DIR = getCanonicalDataDir();
export const LIVE_DATA_DIR = getLiveDataDir();

export const FAT_JSON_FILES = new Set([
  'euraxess-opportunities.json',
  'phdscanner-opportunities.json',
  'phd-board-opportunities.json',
  'umich-careers-opportunities.json',
  'umich-research-prospects.json',
  'jobs-to-consider.json',
  'opportunity-scoring-shadow-report.json',
  'research-contact-scoring-shadow-report.json',
]);

export const FAT_JSON_TABLE = {
  'euraxess-opportunities.json': 'euraxess_opportunities',
  'phdscanner-opportunities.json': 'phdscanner_opportunities',
  'phd-board-opportunities.json': 'phdscanner_opportunities',
  'umich-careers-opportunities.json': 'umich_opportunities',
  'umich-research-prospects.json': 'research_prospects',
  'jobs-to-consider.json': 'jobs_to_consider',
};

export function fatJsonTable(fileName = '') {
  return FAT_JSON_TABLE[String(fileName || '')] || '';
}
