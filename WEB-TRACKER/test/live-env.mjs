/**
 * Isolate fat catalog tests from Dropbox JSON and the machine live dir.
 * Import this module first in any test that starts a server or reads canonical stores.
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.CAREER_OPS_LIVE_DATA_DIR = mkdtempSync(join(tmpdir(), 'career-ops-live-test-'));
process.env.CAREER_OPS_LIVE_IMPORT = '0';
process.env.CAREER_OPS_SKIP_WATCHERS = process.env.CAREER_OPS_SKIP_WATCHERS || '1';
