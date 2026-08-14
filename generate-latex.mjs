#!/usr/bin/env node
/**
 * generate-latex.mjs - compile a LaTeX resume to PDF.
 *
 * Usage:
 *   node generate-latex.mjs <input.tex> [output.pdf] [--engine=xelatex|lualatex|pdflatex] [--keep-build] [--force]
 *
 * The Harsh resume baseline uses fontspec, so xelatex is the default engine.
 * Existing PDF outputs are never overwritten unless --force is passed.
 * Prefer a new, relevant PDF filename for each render.
 * Living resume source: harsh/resume/HarshDesai_Resume.tex
 * New PDFs: harsh/resume/pdfs-from-living-source/<new-name>.pdf
 * See harsh/resume/README.md.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { dirname, extname, join, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';

const VALID_ENGINES = new Set(['xelatex', 'lualatex', 'pdflatex']);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MEASURE_FILL_SCRIPT = join(SCRIPT_DIR, 'scripts', 'measure-pdf-fill.mjs');
/** One-page resumes with more empty bottom than this are underfilled. */
const MAX_BOTTOM_GAP_IN = 0.9;
/** One-page resumes with less empty bottom than this are cramped (still OK, but note). */
const MIN_BOTTOM_GAP_IN = 0.3;

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  usage();
  process.exit(1);
}

const inputPath = resolve(args.input);
if (!existsSync(inputPath)) {
  fail(`Input file not found: ${inputPath}`);
}
if (extname(inputPath).toLowerCase() !== '.tex') {
  fail(`Input must be a .tex file: ${inputPath}`);
}

const engine = args.engine || 'xelatex';
if (!VALID_ENGINES.has(engine)) {
  fail(`Invalid --engine="${engine}". Use one of: ${[...VALID_ENGINES].join(', ')}`);
}

const outputPath = resolve(args.output || inputPath.replace(/\.tex$/i, '.pdf'));
const keepBuild = Boolean(args.keepBuild);
const forceOverwrite = Boolean(args.force);

if (existsSync(outputPath) && !forceOverwrite) {
  fail(
    `Refusing to overwrite existing PDF: ${outputPath}\n` +
      `Pick a new, relevant output name (e.g. *_Instrumentation.pdf), or pass --force only if the user explicitly asked to restore/replace this file.`
  );
}

ensureEngineAvailable(engine);

const buildDir = mkdtempSync(join(tmpdir(), 'career-ops-latex-'));
const outputDir = dirname(outputPath);
mkdirSync(outputDir, { recursive: true });

try {
  const compileResult = compileLatex({ engine, inputPath, buildDir });
  if (compileResult.status !== 0) {
    reportCompilerFailure({ engine, buildDir, compileResult });
    process.exit(1);
  }

  const generatedPdf = join(buildDir, `${basename(inputPath, '.tex')}.pdf`);
  if (!existsSync(generatedPdf)) {
    fail(`Compiler completed but PDF was not found: ${generatedPdf}`);
  }

  copyFileSync(generatedPdf, outputPath);
  const stats = statSync(outputPath);
  const pageCount = countPdfPages(outputPath);

  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Engine: ${engine}`);
  console.log(`Pages: ${pageCount || 'unknown'}`);
  console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);

  reportPageFill({ outputPath, pageCount });

  if (!keepBuild) {
    rmSync(buildDir, { recursive: true, force: true });
  } else {
    console.log(`Build directory: ${buildDir}`);
  }
} catch (error) {
  if (!keepBuild) {
    console.error(`Build directory retained for debugging: ${buildDir}`);
  }
  fail(error.message);
}

function reportPageFill({ outputPath, pageCount }) {
  if (!existsSync(MEASURE_FILL_SCRIPT)) return;

  const measure = spawnSync(process.execPath, [MEASURE_FILL_SCRIPT, outputPath], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  if (measure.status !== 0 || !measure.stdout) {
    console.log('Fill check: unavailable (pdftotext -bbox failed or missing)');
    return;
  }

  let data;
  try {
    data = JSON.parse(measure.stdout.trim());
  } catch {
    console.log('Fill check: unavailable (bad JSON)');
    return;
  }
  if (!data.ok) {
    console.log(`Fill check: unavailable (${data.error || 'unknown'})`);
    return;
  }

  console.log(
    `Fill: ${data.fillPct}% of page height used; bottom gap ${data.bottomGapIn} in (${data.bottomGapPt} pt)`
  );

  if (pageCount > 1) {
    console.warn(
      `FILL WARNING: ${pageCount} pages — overfilled for a one-page resume. Compress content and re-render to a NEW PDF name.`
    );
    return;
  }

  if (pageCount === 1 && data.bottomGapIn > MAX_BOTTOM_GAP_IN) {
    console.warn(
      `FILL WARNING: underfilled — ${data.bottomGapIn} in empty at bottom (target ≤ ${MAX_BOTTOM_GAP_IN} in). ` +
        `Add honest role-relevant content and re-render to a NEW PDF name.`
    );
  } else if (pageCount === 1 && data.bottomGapIn < MIN_BOTTOM_GAP_IN) {
    console.warn(
      `FILL NOTE: very tight bottom gap (${data.bottomGapIn} in). Watch for overflow on the next edit.`
    );
  }
}

function parseArgs(argv) {
  const parsed = {
    input: null,
    output: null,
    engine: null,
    keepBuild: false,
    force: false,
  };

  for (const arg of argv) {
    if (arg === '--keep-build') {
      parsed.keepBuild = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg.startsWith('--engine=')) {
      parsed.engine = arg.slice('--engine='.length).trim();
      continue;
    }
    if (arg.startsWith('--')) {
      fail(`Unknown option: ${arg}`);
    }
    if (!parsed.input) {
      parsed.input = arg;
      continue;
    }
    if (!parsed.output) {
      parsed.output = arg;
      continue;
    }
    fail(`Unexpected extra argument: ${arg}`);
  }

  return parsed;
}

function compileLatex({ engine, inputPath, buildDir }) {
  const compilerArgs = [
    '-interaction=nonstopmode',
    '-halt-on-error',
    `-output-directory=${buildDir}`,
    inputPath,
  ];

  let result = null;
  for (let run = 0; run < 2; run++) {
    result = spawnSync(engine, compilerArgs, {
      cwd: dirname(inputPath),
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer: 12 * 1024 * 1024,
    });
    if (result.status !== 0) return result;
  }
  return result;
}

function ensureEngineAvailable(engine) {
  const result = spawnSync(engine, ['--version'], {
    encoding: 'utf-8',
    windowsHide: true,
  });

  if (result.error && result.error.code === 'ENOENT') {
    fail(`${engine} was not found on PATH. Install MiKTeX/TeX Live or compile the .tex file in Overleaf.`);
  }
  if (result.status !== 0 && result.error) {
    fail(`Unable to run ${engine}: ${result.error.message}`);
  }
}

function reportCompilerFailure({ engine, buildDir, compileResult }) {
  console.error(`${engine} failed with exit code ${compileResult.status}.`);
  if (compileResult.stdout) console.error(compileResult.stdout);
  if (compileResult.stderr) console.error(compileResult.stderr);
  console.error(`Build directory retained for debugging: ${buildDir}`);
}

function countPdfPages(pdfPath) {
  const pdfInfo = spawnSync('pdfinfo', [pdfPath], {
    encoding: 'utf-8',
    windowsHide: true,
  });
  if (pdfInfo.status === 0 && pdfInfo.stdout) {
    const match = pdfInfo.stdout.match(/^Pages:\s+(\d+)/m);
    if (match) return Number(match[1]);
  }

  const pdf = readFileSync(pdfPath).toString('latin1');
  return (pdf.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
}

function usage() {
  console.error(
    'Usage: node generate-latex.mjs <input.tex> [output.pdf] [--engine=xelatex|lualatex|pdflatex] [--keep-build] [--force]'
  );
  console.error('Existing PDFs are never overwritten unless --force is passed.');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
