#!/usr/bin/env node
/**
 * One-shot: apply protected-domain floor + known deadline patches, then rescore
 * PhDScanner and EURAXESS stores and sync dashboards.
 */
import {
  rescoreEuraxessOpportunities,
  syncEuraxessOpportunitiesToDashboard,
  readEuraxessOpportunities,
} from '../lib/euraxess/opportunity-store.mjs';
import {
  patchPhdscannerOpportunity,
  rescorePhdscannerOpportunities,
  syncPhdscannerOpportunitiesToDashboard,
  readPhdscannerOpportunities,
} from '../lib/phdscanner/opportunity-store.mjs';
import { matchProtectedDomain, postingProtectedDomainText } from '../lib/protected-domain.mjs';
import { VISIBLE_THRESHOLD } from '../lib/phdscanner/scoring-profile.mjs';

const NOW = new Date();
const storeBefore = readPhdscannerOpportunities();
const surrey = (storeBefore.opportunities || []).find(o =>
  /af4fbcec-c6ab-4ef2-841e-7e28a0248707|perovskite scintillators.*nuclear security/i.test(
    [o.id, o.external_id, o.title, o.url].join(' '),
  ));

if (surrey?.id) {
  // Verified from rendered PhDScanner page (Parallel extract, 2026-07-13):
  // Application deadline 12 July 2026 — already passed as of today.
  patchPhdscannerOpportunity(surrey.id, {
    deadline_text: '12 July 2026',
    deadline_utc: '2026-07-12T23:59:00.000Z',
    verification: {
      deadline_source: 'phdscanner_rendered_detail',
      verified_at: NOW.toISOString(),
      note: 'Application deadline 12 July 2026; page also showed Deadline passed',
    },
  });
}

const phd = rescorePhdscannerOpportunities({ now: NOW });
syncPhdscannerOpportunitiesToDashboard();
rescoreEuraxessOpportunities({ now: NOW });
syncEuraxessOpportunitiesToDashboard();

function summarize(label, store) {
  const ops = store.opportunities || [];
  const archived = ops.filter(o => o.archived || o.score_band === 'archive' || o.status === 'archived' || o.status === 'closed');
  const visible = ops.filter(o => o.visible && !o.archived && o.status !== 'archived' && o.status !== 'closed');
  const withDeadline = ops.filter(o => o.deadline_utc);
  const protectedVisible = visible.filter(o => matchProtectedDomain(postingProtectedDomainText(o)).length);
  const lowWrong = ops.filter(o => {
    const hits = matchProtectedDomain(postingProtectedDomainText(o));
    if (!hits.length) return false;
    if ((o.risk_flags || []).includes('deadline_passed') || o.status === 'closed') return false;
    if ((o.risk_flags || []).includes('role_not_targeted') || (o.risk_flags || []).includes('protected_domain_wrong_role')) return false;
    return Number(o.score || 0) < VISIBLE_THRESHOLD || o.archived || o.score_band === 'archive' || o.status === 'archived';
  });
  return {
    label,
    total: ops.length,
    visible: visible.length,
    archived_or_closed: archived.length,
    with_deadline: withDeadline.length,
    protected_visible: protectedVisible.length,
    protected_still_wrongly_buried: lowWrong.length,
    low_wrong_sample: lowWrong.slice(0, 8).map(o => ({ id: o.id, title: o.title, score: o.score, status: o.status, flags: o.risk_flags })),
  };
}

const surreyAfter = (phd.opportunities || []).find(o =>
  /af4fbcec|perovskite scintillators.*nuclear security/i.test([o.id, o.external_id, o.title, o.url].join(' ')));

console.log(JSON.stringify({
  surrey: surreyAfter ? {
    id: surreyAfter.id,
    title: surreyAfter.title,
    score: surreyAfter.score,
    band: surreyAfter.score_band,
    archived: surreyAfter.archived,
    visible: surreyAfter.visible,
    status: surreyAfter.status,
    deadline_utc: surreyAfter.deadline_utc,
    risk_flags: surreyAfter.risk_flags,
  } : null,
  phdscanner: summarize('phdscanner', phd),
  euraxess: summarize('euraxess', readEuraxessOpportunities()),
}, null, 2));
