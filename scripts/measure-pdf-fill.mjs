#!/usr/bin/env node
/**
 * Measure how far down page 1 content reaches in a resume PDF (pdftotext -bbox).
 * Exit 0 always when measurement succeeds; prints JSON to stdout.
 * Used by generate-latex.mjs fill warnings.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const pdfPath = process.argv[2];
if (!pdfPath || !existsSync(pdfPath)) {
  console.error('Usage: node scripts/measure-pdf-fill.mjs <file.pdf>');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'resume-bbox-'));
const bboxPath = join(dir, 'bbox.html');

try {
  const result = spawnSync('pdftotext', ['-bbox', pdfPath, bboxPath], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  if (result.status !== 0 || !existsSync(bboxPath)) {
    console.error(JSON.stringify({ ok: false, error: 'pdftotext -bbox failed' }));
    process.exit(2);
  }

  const html = readFileSync(bboxPath, 'utf8');
  const pageMatch = html.match(/<page\b[^>]*>/i);
  if (!pageMatch) {
    console.error(JSON.stringify({ ok: false, error: 'no page tag' }));
    process.exit(2);
  }
  const width = Number((pageMatch[0].match(/\bwidth="([0-9.]+)"/i) || [])[1]);
  const height = Number((pageMatch[0].match(/\bheight="([0-9.]+)"/i) || [])[1]);
  const yMaxes = [...html.matchAll(/\byMax="([0-9.]+)"/gi)].map((m) => Number(m[1]));
  if (!height || yMaxes.length === 0) {
    console.error(JSON.stringify({ ok: false, error: 'missing geometry' }));
    process.exit(2);
  }

  const contentYMax = Math.max(...yMaxes);
  const bottomGapPt = height - contentYMax;
  const fillPct = (100 * contentYMax) / height;

  console.log(
    JSON.stringify({
      ok: true,
      pageWidthPt: width,
      pageHeightPt: height,
      contentYMaxPt: Number(contentYMax.toFixed(1)),
      fillPct: Number(fillPct.toFixed(1)),
      bottomGapPt: Number(bottomGapPt.toFixed(1)),
      bottomGapIn: Number((bottomGapPt / 72).toFixed(2)),
    })
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
