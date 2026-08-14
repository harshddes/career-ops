/**
 * Lane-specific Cursor prompts for the public workplace.
 * Self-contained so Cloudflare Workers never import WEB-TRACKER fs modules.
 * Text mirrors agent-task-queue, exhibitor CLEAR_QUEUE_SOP, and NETWORKING_RESEARCH_SOP.
 */

export const LANES = ['euraxess', 'phdscanner', 'exhibitor', 'networking', 'evaluate', 'pack'];
export const TARGET_KINDS = ['job', 'org', 'person'];

const CLOSE_LOOP = ({ orderId, baseUrl }) => [
  '',
  '## Close the loop (mandatory)',
  'Do not submit applications. Do not send email or LinkedIn messages.',
  'When the research markdown is ready, either:',
  `1. Paste it into the Career OS inbox card for work order \`${orderId}\`, or`,
  `2. POST ${baseUrl}/api/work-orders/${orderId}/complete with JSON {"result_md":"...","status":"review_ready"} using the signed-in session cookie.`,
  'Work is incomplete until the order leaves queued/copied.',
].join('\n');

const SOP = {
  euraxess: [
    'Lane: EURAXESS only. Do not touch PhDScanner, exhibitor, or networking queues.',
    'Run career-ops mode: deep against this posting.',
    'Write a research report. Attach it by completing the work order. Do not invent metrics.',
  ].join('\n'),
  phdscanner: [
    'Lane: PhDScanner only. Do not touch EURAXESS, exhibitor, or networking queues.',
    'Run career-ops mode: deep against this PhD/postdoc posting.',
    'Write a research report. Attach it by completing the work order.',
  ].join('\n'),
  exhibitor: [
    'Lane: target-companies-exhibitor only.',
    'Trigger (local factory): Clear the queue in Target Companies',
    'SOP: WEB-TRACKER/lib/exhibitor/CLEAR_QUEUE_SOP.md',
    'Find the official site and careers page. Enumerate every open posting. Score against modes/_profile.md.',
    'Keep instrumentation, diagnostics, HV/vacuum, detectors/DAQ, payload, propulsion hardware, manufacturing that enables space/fusion hardware.',
    'Skip software-platform-only, sales, pure theory, hard U.S.-person/clearance-only blockers.',
    'Write reports/exhibitor-{company-slug}-{YYYY-MM-DD}.md then paste the same markdown into this work order.',
    'Do not ask clarifying questions. Process this company only.',
  ].join('\n'),
  networking: [
    'Lane: networking-contact-research only.',
    'Trigger (local factory): Find new networking contacts',
    'SOP: WEB-TRACKER/lib/networking/NETWORKING_RESEARCH_SOP.md',
    'Public sources only: company/lab pages, alumni pages the user can open, conference lists, ORCID, GitHub, Bluesky/Mastodon.',
    'Never scrape LinkedIn. Never auto-send messages. Never infer ethnicity, nationality, or immigration status.',
    'Affinity tags require explicit public evidence.',
    'Return candidate people with display_name, title, organization, public URLs, source_refs, and review_status=review_ready.',
    'Paste the candidate list into this work order. Do not publish networking PII to any static snapshot.',
  ].join('\n'),
  evaluate: [
    'Lane: evaluate / Operations.',
    'Run career-ops mode: auto-pipeline (evaluate + report).',
    'Use existing career-ops rules. Do not submit applications or send messages automatically.',
  ].join('\n'),
  pack: [
    'Lane: application pack.',
    'Run career-ops mode: application-artifacts.',
    'Requested artifact: full application pack (resume PDF, cover letter PDF, application email draft).',
    'Use cv.md, config/profile.yml, modes/_profile.md when relevant. Do not invent experience or metrics.',
    'Save under output/{company-slug}/. Never submit the application or send email automatically.',
    'If you cannot compile LaTeX in this environment, write the markdown drafts and complete the work order with those drafts.',
  ].join('\n'),
};

export function defaultLaneFor({ source, kind, pack = false } = {}) {
  if (pack) return 'pack';
  if (kind === 'person' || kind === 'org' && source === 'networking') return 'networking';
  if (kind === 'org') return 'exhibitor';
  if (source === 'phdscanner') return 'phdscanner';
  if (source === 'euraxess') return 'euraxess';
  return 'evaluate';
}

export function compilePrompt({
  lane,
  orderId,
  target = {},
  baseUrl = 'http://127.0.0.1:8787',
} = {}) {
  const resolvedLane = LANES.includes(lane) ? lane : 'evaluate';
  const title = target.title || target.name || 'Untitled';
  const lines = [
    `# Career OS work order — ${resolvedLane}`,
    '',
    `**Work order id:** ${orderId}`,
    `**Lane:** ${resolvedLane}`,
    `**Target kind:** ${target.kind || ''}`,
    `**Target id:** ${target.id || ''}`,
    `**Title:** ${title}`,
    target.institution ? `**Institution / company:** ${target.institution}` : null,
    target.url ? `**URL:** ${target.url}` : null,
    target.website ? `**Website:** ${target.website}` : null,
    target.careers_url ? `**Careers URL:** ${target.careers_url}` : null,
    target.country ? `**Country:** ${target.country}` : null,
    target.summary ? `**Summary:** ${target.summary}` : null,
    '',
    '## Instructions',
    SOP[resolvedLane],
    CLOSE_LOOP({ orderId, baseUrl: String(baseUrl).replace(/\/$/, '') }),
  ].filter(line => line !== null);
  return lines.join('\n');
}
