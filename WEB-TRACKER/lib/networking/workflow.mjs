export const RELATIONSHIP_STAGES = [
  'identified',
  'researching',
  'qualified',
  'outreach_ready',
  'contacted',
  'engaged',
  'conversation',
  'warm',
  'referral_eligible',
  'referred',
  'nurture',
  'dormant',
  'declined',
  'do_not_contact',
  'archived',
];

export const PIPELINE_GROUPS = [
  { id: 'discover', label: 'Discover', stages: ['identified', 'researching'] },
  { id: 'prepare', label: 'Prepare', stages: ['qualified', 'outreach_ready'] },
  { id: 'reach', label: 'Reach', stages: ['contacted'] },
  { id: 'engage', label: 'Engage', stages: ['engaged', 'conversation'] },
  { id: 'activate', label: 'Activate', stages: ['warm', 'referral_eligible', 'referred'] },
  { id: 'maintain', label: 'Maintain', stages: ['nurture', 'dormant', 'declined', 'do_not_contact', 'archived'] },
];

export const NETWORKING_CHANNELS = [
  'linkedin',
  'email',
  'gmail',
  'x',
  'bluesky',
  'mastodon',
  'github',
  'event',
  'phone',
];

export const CHANNEL_STATES = [
  'unknown',
  'available',
  'request_pending',
  'contacted',
  'replied',
  'unavailable',
  'do_not_use',
];

export const TASK_STATES = ['open', 'waiting', 'snoozed', 'blocked', 'completed', 'canceled'];
export const REVIEW_STATES = ['review_ready', 'approved', 'rejected'];

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeRelationshipStage(value) {
  const stage = cleanText(value || 'identified').toLowerCase();
  return RELATIONSHIP_STAGES.includes(stage) ? stage : 'identified';
}

export function normalizeChannelState(value) {
  const state = cleanText(value || 'unknown').toLowerCase();
  return CHANNEL_STATES.includes(state) ? state : 'unknown';
}

export function normalizeTaskState(value) {
  const state = cleanText(value || 'open').toLowerCase();
  return TASK_STATES.includes(state) ? state : 'open';
}

export function normalizeReviewState(value, fallback = 'approved') {
  const state = cleanText(value || fallback).toLowerCase();
  return REVIEW_STATES.includes(state) ? state : fallback;
}

export function pipelineGroupForStage(stage) {
  const normalized = normalizeRelationshipStage(stage);
  return PIPELINE_GROUPS.find(group => group.stages.includes(normalized))?.id || 'discover';
}

export function nextRelationshipStage(stage) {
  const normalized = normalizeRelationshipStage(stage);
  const path = [
    'identified',
    'researching',
    'qualified',
    'outreach_ready',
    'contacted',
    'engaged',
    'conversation',
    'warm',
    'referral_eligible',
    'referred',
    'nurture',
  ];
  const index = path.indexOf(normalized);
  return index >= 0 && index < path.length - 1 ? path[index + 1] : normalized;
}

function daysSince(value, now = new Date()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / 86_400_000);
}

function activeChannelEntries(person = {}) {
  return Object.entries(person.channel_states || {})
    .filter(([, channel]) => channel && !['unknown', 'unavailable', 'do_not_use'].includes(channel.state));
}

export function deriveNextNetworkingAction(person = {}, tasks = [], now = new Date()) {
  if (person.do_not_contact || person.relationship_stage === 'do_not_contact') {
    return { type: 'none', label: 'Do not contact', reason: 'contact is suppressed' };
  }
  if (person.review_status === 'review_ready') {
    return { type: 'review', label: 'Review evidence before outreach', reason: 'AI-researched candidate needs approval' };
  }
  if (person.review_status === 'rejected') {
    return { type: 'none', label: 'Rejected during review', reason: 'candidate was not approved for outreach' };
  }

  const openTasks = tasks
    .filter(task => task.person_id === person.id && taskIsActionable(task, now))
    .sort((left, right) => String(left.due_at || '9999').localeCompare(String(right.due_at || '9999')));
  if (openTasks.length) {
    const task = openTasks[0];
    return {
      type: task.action_type || 'task',
      label: task.subject || 'Complete next action',
      reason: task.due_at && Date.parse(task.due_at) <= now.getTime() ? 'task is due' : 'explicit next action',
      task_id: task.id,
      due_at: task.due_at || '',
    };
  }

  const channels = activeChannelEntries(person);
  const pending = channels.find(([, channel]) => channel.state === 'request_pending');
  if (pending) {
    const elapsed = daysSince(pending[1].last_touch_at, now);
    return elapsed !== null && elapsed >= 7
      ? {
          type: 'review_channel',
          label: `Review pending ${pending[0]} request`,
          reason: 'request has been pending for at least seven days',
          channel: pending[0],
        }
      : {
          type: 'wait',
          label: `Wait for ${pending[0]} response`,
          reason: 'connection request is still inside the waiting window',
          channel: pending[0],
          waiting_until: pending[1].next_permitted_touch_at || '',
        };
  }

  const contacted = channels
    .filter(([, channel]) => channel.state === 'contacted')
    .sort((left, right) => String(right[1].last_touch_at || '').localeCompare(String(left[1].last_touch_at || '')))[0];
  if (contacted) {
    const elapsed = daysSince(contacted[1].last_touch_at, now);
    const followups = Number(contacted[1].unanswered_followups || 0);
    if (elapsed !== null && elapsed >= 7 && followups < 1) {
      return {
        type: 'follow_up',
        label: `Send one ${contacted[0]} follow-up`,
        reason: 'seven days elapsed with no reply',
        channel: contacted[0],
      };
    }
    return {
      type: followups >= 1 ? 'nurture' : 'wait',
      label: followups >= 1 ? 'Move to nurture' : 'Wait for reply',
      reason: followups >= 1 ? 'unanswered follow-up limit reached' : 'first message is still inside the waiting window',
      channel: contacted[0],
    };
  }

  if (person.relationship_stage === 'identified' || person.relationship_stage === 'researching') {
    return { type: 'research', label: 'Research relevance and a legitimate path', reason: 'contact is not qualified yet' };
  }
  if (person.relationship_stage === 'qualified') {
    return { type: 'prepare', label: 'Prepare a personalized first touch', reason: 'contact is qualified but not outreach-ready' };
  }
  if (person.relationship_stage === 'outreach_ready') {
    const available = channels.find(([, channel]) => channel.state === 'available');
    return available
      ? { type: 'outreach', label: `Reach out via ${available[0]}`, reason: 'message and channel are ready', channel: available[0] }
      : { type: 'find_channel', label: 'Find a legitimate contact channel', reason: 'no usable channel is recorded' };
  }
  if (['engaged', 'conversation'].includes(person.relationship_stage)) {
    return { type: 'respond', label: 'Respond or schedule the conversation', reason: 'the contact is actively engaged' };
  }
  if (['warm', 'referral_eligible'].includes(person.relationship_stage)) {
    return { type: 'relationship', label: 'Choose a relevant, low-pressure next step', reason: 'relationship is warm' };
  }
  return { type: 'none', label: 'No action scheduled', reason: 'set a task, waiting date, or no-action reason' };
}

export function enforceOutreachGuardrails(person = {}, proposed = {}) {
  const channel = cleanText(proposed.channel).toLowerCase();
  const channelStates = person.channel_states || {};
  const activeChannels = Object.entries(channelStates)
    .filter(([, entry]) => ['request_pending', 'contacted'].includes(entry?.state));
  if (person.do_not_contact || person.relationship_stage === 'do_not_contact') {
    return { allowed: false, reason: 'This person is marked do not contact.' };
  }
  if (person.review_status !== 'approved') {
    return { allowed: false, reason: 'Approve this researched candidate before recording outbound contact.' };
  }
  if (activeChannels.length && !activeChannels.some(([name]) => name === channel)) {
    return { allowed: false, reason: `Resolve the active ${activeChannels[0][0]} outreach before switching channels.` };
  }
  const existing = channelStates[channel] || {};
  if (proposed.type === 'follow_up' && Number(existing.unanswered_followups || 0) >= 1) {
    return { allowed: false, reason: 'One unanswered follow-up has already been recorded.' };
  }
  return { allowed: true, reason: '' };
}

export function taskIsActionable(task = {}, now = new Date()) {
  if (task.state === 'open') return true;
  if (task.state === 'waiting') {
    const wakeAt = Date.parse(task.waiting_until || task.remind_at || '');
    return Number.isFinite(wakeAt) && wakeAt <= now.getTime();
  }
  if (task.state === 'snoozed') {
    const wakeAt = Date.parse(task.snoozed_until || task.remind_at || '');
    return Number.isFinite(wakeAt) && wakeAt <= now.getTime();
  }
  return false;
}
