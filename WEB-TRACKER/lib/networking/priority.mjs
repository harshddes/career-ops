import { taskIsActionable } from './workflow.mjs';

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function hoursUntil(value, now) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return (timestamp - now.getTime()) / 3_600_000;
}

export function scoreNetworkingTask(task = {}, context = {}, now = new Date()) {
  const person = context.person || {};
  const opportunity = context.opportunity || {};
  const dueHours = hoursUntil(task.due_at, now);
  const deadlineHours = hoursUntil(opportunity.deadline, now);
  const reasons = [];
  const penalties = [];

  const outcomeValue = clamp(
    task.outcome_value
    ?? (opportunity.fit_score ? Number(opportunity.fit_score) / 5 : person.fit_score ? Number(person.fit_score) / 5 : 0.5),
  );
  const urgency = dueHours === null
    ? (deadlineHours === null ? 0.35 : clamp(1 - (deadlineHours / (24 * 21))))
    : clamp(1 - (dueHours / (24 * 14)));
  const momentum = clamp(task.relationship_momentum ?? person.relationship_strength ?? 0.35);
  const pathQuality = clamp(task.path_quality ?? person.path_strength ?? 0.2);
  const readiness = clamp(task.readiness ?? (person.relationship_stage === 'outreach_ready' ? 0.9 : 0.55));
  const freshness = clamp(task.freshness ?? 0.6);

  if (urgency >= 0.8) reasons.push(dueHours !== null && dueHours <= 0 ? 'overdue' : 'time-sensitive');
  if (outcomeValue >= 0.75) reasons.push('high-value target');
  if (momentum >= 0.65) reasons.push('relationship momentum');
  if (pathQuality >= 0.65) reasons.push('strong path');
  if (readiness >= 0.8) reasons.push('ready to execute');

  let penalty = 0;
  if (person.do_not_contact) {
    penalty += 1;
    penalties.push('do not contact');
  }
  if (task.state === 'blocked') {
    penalty += 0.45;
    penalties.push('blocked');
  }
  if (task.state === 'snoozed') {
    penalty += 0.2;
    penalties.push('snoozed');
  }
  if (task.recent_contact_too_soon) {
    penalty += 0.45;
    penalties.push('contacted too recently');
  }
  if (opportunity.liveness_state === 'expired') {
    penalty += 0.3;
    penalties.push('linked opening expired');
  }
  if (Number(task.unanswered_followups || 0) >= 1 && task.action_type === 'follow_up') {
    penalty += 0.75;
    penalties.push('unanswered follow-up limit reached');
  }

  const raw = (
    (0.28 * outcomeValue)
    + (0.22 * urgency)
    + (0.18 * momentum)
    + (0.12 * pathQuality)
    + (0.10 * readiness)
    + (0.10 * freshness)
    - penalty
  );
  const score = Math.round(clamp(raw) * 100);

  return {
    score,
    reasons: reasons.slice(0, 3),
    penalties,
    components: {
      outcome_value: Math.round(outcomeValue * 100),
      urgency: Math.round(urgency * 100),
      relationship_momentum: Math.round(momentum * 100),
      path_quality: Math.round(pathQuality * 100),
      readiness: Math.round(readiness * 100),
      freshness: Math.round(freshness * 100),
    },
  };
}

export function rankNetworkingTasks(tasks = [], contextByTask = {}, now = new Date()) {
  return tasks
    .filter(task => taskIsActionable(task, now))
    .map(task => ({
      ...task,
      priority: scoreNetworkingTask(task, contextByTask[task.id] || {}, now),
    }))
    .sort((left, right) => (
      right.priority.score - left.priority.score
      || String(left.due_at || '9999').localeCompare(String(right.due_at || '9999'))
    ));
}
