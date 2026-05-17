#!/usr/bin/env node
/**
 * generate-cv.mjs — render cv.md through templates/cv-template.html (canonical ATS shell).
 *
 * The HTML/CSS matches the tuned one-page layout used for job-tailored emits
 * (see output reference: cv-harsh-desai-pranos-fusion-instrumentation-engineer-2026-05-06.html).
 *
 * Usage:
 *   node generate-cv.mjs [--paper=letter|a4] [--output=path.html] [--pdf=path.pdf]
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const args = parseArgs(process.argv.slice(2));
const paper = (args.paper || 'letter').toLowerCase();
if (!['letter', 'a4'].includes(paper)) {
  fail(`Invalid --paper="${paper}". Use letter or a4.`);
}

const outputPath = resolve(ROOT, args.output || 'output/cv-harsh-desai-ats.html');
const pdfPath = args.pdf
  ? resolve(ROOT, typeof args.pdf === 'string' ? args.pdf : outputPath.replace(/\.html$/i, '.pdf'))
  : null;

const source = await readFile(resolve(ROOT, 'cv.md'), 'utf-8');
const cv = parseCv(source);
const template = await readFile(resolve(ROOT, 'templates', 'cv-template.html'), 'utf-8');
const html = renderTemplate(template, buildModel(cv, paper));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, 'utf-8');
console.log(`HTML generated: ${outputPath}`);

if (pdfPath) {
  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, 'generate-pdf.mjs'), outputPath, pdfPath, `--format=${paper}`],
    { cwd: ROOT, stdio: 'inherit' }
  );
  process.exit(result.status ?? 1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function parseCv(markdown) {
  const lines = markdown.split(/\r?\n/);
  const name = (lines.find(line => line.startsWith('# ')) || '# Candidate').slice(2).trim();
  const contact = {};
  for (const line of lines) {
    const match = line.match(/^- (Phone|Email|Portfolio|LinkedIn):\s*(.+)$/);
    if (!match) continue;
    contact[match[1].toLowerCase()] = match[2].trim();
  }

  const summaryLine = lines.find(line => /^\*[^*].*\*$/.test(line.trim()));
  const summary = summaryLine ? summaryLine.trim().replace(/^\*|\*$/g, '') : '';

  return {
    name,
    contact,
    summary,
    education: parseItems(section(markdown, 'Education')),
    experience: parseItems(section(markdown, 'Work Experience')),
    projects: parseItems(section(markdown, 'Projects')),
    skills: parseBullets(section(markdown, 'Skills Summary')),
    honors: parseBullets(section(markdown, 'Honors')),
  };
}

function section(markdown, title) {
  const pattern = new RegExp(`^## ${escapeRegExp(title)}\\s*$`, 'm');
  const match = markdown.match(pattern);
  if (!match) return '';
  const start = (match.index || 0) + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function parseItems(markdown) {
  const blocks = markdown
    .split(/^### /m)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks.map(block => {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const title = cleanInline(lines.shift() || '');
    const meta = [];
    const bullets = [];

    for (const line of lines) {
      if (line.startsWith('- ')) {
        bullets.push(cleanInline(line.slice(2)));
      } else if (line.startsWith('**')) {
        meta.push(line);
      }
    }

    return { title, meta, bullets };
  });
}

function parseBullets(markdown) {
  return markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => cleanInline(line.slice(2)));
}

function parseMetaFields(metaLines) {
  const out = {};
  for (const raw of metaLines) {
    const line = raw.trim();
    const m = line.match(/^\*\*([^:]+):\*\*\s*(.+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const val = cleanInline(m[2]);
      if (['report', 'project', 'pres'].includes(key)) continue;
      out[key] = val;
    }
  }
  return out;
}

function buildModel(cv, paper) {
  const phone = cv.contact.phone || '+1-734-548-1080';
  const email = cv.contact.email || 'harshdes@umich.edu';
  const location = buildLocation(cv);
  const linkedinDisp = compactLinkedIn(cv.contact.linkedin);
  const portfolioLineText = portfolioLine(cv.contact.portfolio);

  const competencies = [
    'Plasma diagnostics instrumentation',
    'DAQ systems and digitizers',
    'High-voltage test automation',
    'FPGA/ADC detector readout',
    'Calibration traceability',
    'Low-noise signal-chain reasoning',
    'Python/PyVISA control workflows',
    'Ion optics and detector characterization',
    'Plasma physics measurement interpretation',
  ];

  const compHtml = competencies
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('\n        ');

  return {
    LANG: 'en',
    PAGE_WIDTH: paper === 'a4' ? '7.2in' : '7.25in',
    NAME: escapeHtml(cv.name),
    PHONE: escapeHtml(phone),
    EMAIL: escapeHtml(email),
    LOCATION: escapeHtml(location),
    LINKEDIN_DISPLAY: escapeHtml(linkedinDisp),
    PORTFOLIO_LINE: escapeHtml(portfolioLineText),
    SECTION_SUMMARY: 'Professional Summary',
    SECTION_COMPETENCIES: 'Core Competencies',
    SECTION_EXPERIENCE: 'Work Experience',
    SECTION_PROJECTS: 'Selected Projects',
    SECTION_EDUCATION: 'Education',
    SECTION_SKILLS: 'Skills',
    SECTION_CERTIFICATIONS: 'Honors',
    SUMMARY_TEXT: escapeHtml(cv.summary),
    COMPETENCIES: compHtml,
    EXPERIENCE: renderExperienceBlocks(cv.experience),
    PROJECTS: renderExperienceBlocks(cv.projects),
    EDUCATION: renderEducationBlocks(cv.education),
    SKILLS: renderSkillsGrid(cv.skills),
    CERTIFICATIONS: renderHonorsList(cv.honors),
  };
}

function renderTemplate(template, model) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => model[key] ?? '');
}

/** Right column meta: Dates | Location (matches Pranos-style header rows). */
function metaRightColumn(fields) {
  const d = fields.dates;
  const loc = fields.location;
  return [d, loc].filter(Boolean).join(' | ');
}

function renderExperienceBlocks(items) {
  return items
    .map((item) => {
      const f = parseMetaFields(item.meta);
      const metaCol = escapeHtml(metaRightColumn(f));
      const title = escapeHtml(item.title);
      const bullets =
        item.bullets.length > 0
          ? `<ul>${item.bullets.map((b) => `<li>${formatInline(b)}</li>`).join('')}</ul>`
          : '';
      return `<div class="item">
        <div class="item-head">
          <div class="title">${title}</div>
          <div class="meta">${metaCol}</div>
        </div>
        ${bullets}
      </div>`;
    })
    .join('\n');
}

function renderEducationBlocks(items) {
  return items
    .map((item) => {
      const f = parseMetaFields(item.meta);
      const degreeRaw = f.degree || '';
      const degreeTitle = stripGpaFromDegree(degreeRaw).trim();
      const gpa = extractGpa(degreeRaw);
      const leftPlain = degreeTitle ? `${item.title} - ${degreeTitle}` : item.title;
      const leftTitle = escapeHtml(leftPlain);
      const right = escapeHtml([f.dates, gpa].filter(Boolean).join(' | '));

      let bodyHtml = '';
      if (item.bullets.length) {
        bodyHtml = `<p>${formatInlineParagraph(item.bullets)}</p>`;
      }

      return `<div class="item">
        <div class="item-head">
          <div class="title">${leftTitle}</div>
          <div class="meta">${right}</div>
        </div>
        ${bodyHtml}
      </div>`;
    })
    .join('\n');
}

function stripGpaFromDegree(text) {
  return text.replace(/\s*\|\s*/g, ' ').replace(/\bGPA:\s*[\d.+/]+[^\s|]*/gi, '').trim();
}

function extractGpa(text) {
  const m = text.match(/\bGPA:\s*([\d.+/]+\s*\/?\s*[\d.]+\s*(?:\/\s*[\d.]+)?)/i);
  return m ? `GPA ${m[1]}`.trim() : '';
}

/** Join bullets into flowing paragraph (coursework-style, like tuned PDFs). */
function formatInlineParagraph(bullets) {
  const parts = bullets.map((b) => cleanInline(stripMarkdownLinksToText(b)));
  return `${escapeHtml(parts.join(' '))}`;
}

/** Strip markdown links to label text only inside paragraph merges. */
function stripMarkdownLinksToText(text) {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
}

function renderSkillsGrid(skillLines) {
  const parsed = skillLines.map((line) => {
    const labeled = cleanInline(line).match(/^\*\*([^*:]+):\*\*\s*(.+)$/);
    if (!labeled) {
      return `<div>${formatInline(line)}</div>`;
    }
    const label = labeled[1].trim();
    const body = labeled[2].trim();
    return `<div><span class="label">${escapeHtml(label)}:</span> ${formatInline(body)}</div>`;
  });
  return `<div class="skills-grid">\n${parsed.join('\n')}\n</div>`;
}

function renderHonorsList(honors) {
  if (!honors.length) return '<p>-</p>';
  const lis = honors.map((h) => `<li>${formatInline(h)}</li>`).join('');
  return `<ul class="compact-list">\n${lis}\n</ul>`;
}

function buildLocation(cv) {
  for (const e of cv.education) {
    const loc = parseMetaFields(e.meta).location;
    if (!loc) continue;
    if (/ann arbor/i.test(loc)) return 'Ann Arbor, MI, USA';
    const normalized = loc.replace(/\s+/g, ' ').trim();
    return /\b(IN|India|USA|US)\b/i.test(normalized) ? normalized : `${normalized}, USA`;
  }
  return 'Ann Arbor, MI, USA';
}

function compactLinkedIn(linkedinField) {
  const url = extractUrl(linkedinField || '') || 'https://www.linkedin.com/in/harshddes/';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return linkedinField ? cleanInline(linkedinField) : url;
  }
}

function portfolioLine(portfolioField) {
  const url = extractUrl(portfolioField || '') || 'https://harshddes.github.io/';
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = url.replace(/^https?:\/\//, '').split('/')[0];
  }
  return `Portfolio: ${host}`;
}

function cleanInline(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function extractUrl(text = '') {
  const match = text.match(/https?:\/\/[^)\s]+/);
  return match ? match[0] : '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
