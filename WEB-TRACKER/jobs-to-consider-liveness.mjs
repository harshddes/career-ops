#!/usr/bin/env node
/**
 * jobs-to-consider-liveness.mjs
 *
 * Liveness checker for curated researched jobs. Closed roles are kept for
 * history, but moved out of the main Jobs to Consider section.
 */

import { chromium } from 'playwright';
import { classifyLiveness } from '../liveness-core.mjs';
import { patchConsiderJob, readConsiderJobs, syncConsiderJobsToDashboard } from './lib/jobs-to-consider-store.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ADP_CID = '3196ba6f-d49c-4493-9290-3d91489bdfa9';
const ADP_CCID = '19000101_000001';
const ADP_REQUISITIONS_URL =
  'https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions';

function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function checkAdpUrl(url) {
  const parsed = new URL(url);
  const jobId = parsed.searchParams.get('jobId');
  const res = await fetch(`${ADP_REQUISITIONS_URL}?cid=${ADP_CID}&ccId=${ADP_CCID}&lang=en_CA`);
  if (!res.ok) return { result: 'uncertain', reason: `ADP API HTTP ${res.status}` };
  const data = await res.json();
  const jobs = Array.isArray(data.jobRequisitions) ? data.jobRequisitions : [];
  const match = jobs.find((job) => {
    const externalId = job.customFieldGroup?.stringFields
      ?.find((field) => field.nameCode?.codeValue === 'ExternalJobID')
      ?.stringValue;
    return job.itemID === jobId || externalId === jobId || job.clientRequisitionID === jobId;
  });
  if (!match) return { result: 'expired', reason: `ADP jobId ${jobId || '(missing)'} not found in active requisitions` };
  return { result: 'active', reason: `ADP active requisition: ${cleanText(match.requisitionTitle)}` };
}

async function checkHrmosUrl(url) {
  const res = await fetch(url);
  if (res.status === 404 || res.status === 410) return { result: 'expired', reason: `HTTP ${res.status}` };
  if (!res.ok) return { result: 'uncertain', reason: `HRMOS HTTP ${res.status}` };
  const text = await res.text();
  if (/応募する|Apply Now|Job summary|Essential requirements/i.test(text)) {
    const title = cleanText(text.match(/<title>(.*?)<\/title>/i)?.[1] || 'HRMOS posting');
    return { result: 'active', reason: `HRMOS active posting: ${title}` };
  }
  return { result: 'uncertain', reason: 'HRMOS content present but apply markers not found' };
}

async function checkHaileyUrl(url) {
  const res = await fetch(url);
  if (res.status === 404 || res.status === 410) return { result: 'expired', reason: `HTTP ${res.status}` };
  if (!res.ok) return { result: 'uncertain', reason: `Hailey HTTP ${res.status}` };
  const text = await res.text();
  if (/Submit application|Cover letter|Open positions|job ad/i.test(text)) {
    return { result: 'active', reason: 'Hailey HR active posting or listing detected' };
  }
  return { result: 'uncertain', reason: 'Hailey content present but job markers not found' };
}

async function checkPortalUrl(url) {
  if (/workforcenow\.adp\.com/i.test(url)) return checkAdpUrl(url);
  if (/hrmos\.co/i.test(url)) return checkHrmosUrl(url);
  if (/firstlightfusion\.careers\.haileyhr\.app/i.test(url)) return checkHaileyUrl(url);
  return null;
}

export async function checkUrl(page, url) {
  try {
    const portalResult = await checkPortalUrl(url);
    if (portalResult) return portalResult;

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const status = response?.status() ?? 0;
    await page.waitForTimeout(2000);
    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    const applyControls = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')
      );
      return candidates
        .filter((element) => {
          if (element.closest('nav, header, footer')) return false;
          if (element.closest('[aria-hidden="true"]')) return false;
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (!element.getClientRects().length) return false;
          return Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
        })
        .map((element) => [
          element.innerText,
          element.value,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    });
    return classifyLiveness({ status, finalUrl, bodyText, applyControls });
  } catch (err) {
    return { result: 'uncertain', reason: `navigation error: ${err.message.split('\n')[0]}` };
  }
}

export async function runLivenessSweep({ dryRun = DRY_RUN, logger = console, now = new Date() } = {}) {
  const store = readConsiderJobs();
  const candidates = store.jobs.filter(job =>
    job.url && !['closed', 'archived'].includes(job.status) && !job.liveness_exempt
  );

  logger.log(`[jobs-to-consider-liveness] Checking ${candidates.length} job(s)${dryRun ? ' (dry run)' : ''}...\n`);
  if (candidates.length === 0) {
    syncConsiderJobsToDashboard();
    return { checked: 0, active: 0, closed: 0, uncertain: 0 };
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let active = 0;
  let closed = 0;
  let uncertain = 0;

  try {
    for (const job of candidates) {
      const { result, reason } = await checkUrl(page, job.url);
      const nextStatus = result === 'expired' && job.status !== 'applied' ? 'closed' : job.status;
      const nextLiveness = result === 'expired' ? 'closed' : result;
      if (result === 'active') active += 1;
      else if (result === 'expired') closed += 1;
      else uncertain += 1;

      logger.log(`${result.padEnd(9)} ${job.company} -- ${job.title}`);
      if (reason) logger.log(`          ${reason}`);

      if (!dryRun) {
        patchConsiderJob(job.id, {
          status: nextStatus,
          liveness: nextLiveness,
          liveness_reason: reason,
          last_checked: now.toISOString(),
        });
      }
    }
  } finally {
    await browser.close();
  }

  if (!dryRun) syncConsiderJobsToDashboard();
  logger.log(`\n[jobs-to-consider-liveness] Results: ${active} active, ${closed} closed, ${uncertain} uncertain`);
  return { checked: candidates.length, active, closed, uncertain };
}

if (process.argv[1]?.endsWith('jobs-to-consider-liveness.mjs')) {
  runLivenessSweep().catch((err) => {
    console.error('[jobs-to-consider-liveness] Fatal:', err.message);
    process.exit(1);
  });
}
