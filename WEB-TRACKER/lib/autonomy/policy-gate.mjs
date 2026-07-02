import { isForbiddenAction, safeRelativePath } from './schemas.mjs';

const AUTO_SAFE_ACTIONS = new Set(['dashboard_metadata', 'mark_duplicate_alert']);
const WRITE_ACTIONS = new Set(['report_draft', 'tracker_addition', 'jobs_to_consider_patch']);

function autonomyMode(env = process.env) {
  return String(env.AUTONOMY_MODE || 'dry_run').toLowerCase();
}

function requireApprovalForWrites(env = process.env) {
  return String(env.AUTONOMY_REQUIRE_APPROVAL_FOR_WRITES || 'true').toLowerCase() !== 'false';
}

export function classifyProposedWrite(write, env = process.env) {
  const mode = autonomyMode(env);
  const action = write?.action;

  if (!action || isForbiddenAction(action)) {
    return {
      lane: 'forbidden',
      allowed: false,
      requiresApproval: true,
      reason: `Forbidden or missing action: ${action || '(blank)'}`,
    };
  }

  if (mode === 'dry_run') {
    return {
      lane: 'dry_run',
      allowed: false,
      requiresApproval: true,
      reason: 'Autonomy is in dry_run mode.',
    };
  }

  if (AUTO_SAFE_ACTIONS.has(action)) {
    return {
      lane: 'auto_safe',
      allowed: mode === 'auto_safe',
      requiresApproval: mode !== 'auto_safe',
      reason: mode === 'auto_safe' ? 'Low-risk reversible action.' : 'Auto-safe action awaits approval in current mode.',
    };
  }

  if (WRITE_ACTIONS.has(action)) {
    const validPath = action === 'report_draft'
      ? safeRelativePath(write.relative_path, ['reports'])
      : action === 'tracker_addition'
        ? safeRelativePath(write.relative_path, ['batch/tracker-additions'])
        : true;

    if (!validPath) {
      return {
        lane: 'forbidden',
        allowed: false,
        requiresApproval: true,
        reason: 'Write path is outside the allowed roots.',
      };
    }

    return {
      lane: 'approval_required',
      allowed: mode === 'auto_safe' && !requireApprovalForWrites(env),
      requiresApproval: requireApprovalForWrites(env),
      reason: 'Tracker/report writes require approval by default.',
    };
  }

  return {
    lane: 'approval_required',
    allowed: false,
    requiresApproval: true,
    reason: 'Unknown risk; approval required.',
  };
}

export function classifyProposedWrites(writes = [], env = process.env) {
  return writes.map(write => ({
    ...write,
    policy: classifyProposedWrite(write, env),
  }));
}

export function summarizePolicy(classifiedWrites = []) {
  const summary = {
    total: classifiedWrites.length,
    forbidden: 0,
    approval_required: 0,
    auto_safe: 0,
    dry_run: 0,
  };

  for (const write of classifiedWrites) {
    const lane = write.policy?.lane || 'approval_required';
    summary[lane] = (summary[lane] || 0) + 1;
  }

  return summary;
}
