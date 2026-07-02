#!/usr/bin/env node
/**
 * generate-latex.mjs - compile a LaTeX resume to PDF.
 *
 * Usage:
 *   node generate-latex.mjs <input.tex> [output.pdf] [--engine=xelatex|lualatex|pdflatex] [--keep-build]
 *
 * The Harsh resume baseline uses fontspec, so xelatex is the default engine.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { dirname, extname, join, resolve, basename } from 'path';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';

const VALID_ENGINES = new Set(['xelatex', 'lualatex', 'pdflatex']);

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

function parseArgs(argv) {
  const parsed = {
    input: null,
    output: null,
    engine: null,
    keepBuild: false,
  };

  for (const arg of argv) {
    if (arg === '--keep-build') {
      parsed.keepBuild = true;
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
  console.error('Usage: node generate-latex.mjs <input.tex> [output.pdf] [--engine=xelatex|lualatex|pdflatex] [--keep-build]');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
