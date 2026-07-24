import { appendActivityEvent } from './activity-log.mjs';
import { DEFAULT_DIGEST_TIMEZONE, localDateString } from './today-activity.mjs';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function easternDate(date = new Date()) {
  return localDateString(date, DEFAULT_DIGEST_TIMEZONE);
}

function baseEvent(overrides = {}) {
  return {
    timezone: DEFAULT_DIGEST_TIMEZONE,
    local_date: easternDate(),
    ...overrides,
  };
}

export function researchDomainForSource(source = 'umich') {
  const clean = String(source || 'umich').toLowerCase();
  return clean === 'umich' ? 'umich_research' : 'phd_options';
}

export function logResearchStatusEvent(prospect, source = 'umich') {
  const status = cleanText(prospect?.status || 'updated');
  return appendActivityEvent(baseEvent({
    domain: researchDomainForSource(source),
    action: `research_status_${status}`,
    subject_id: prospect.id,
    subject_label: prospect.name,
    company: prospect.institution || prospect.source || source,
    title: prospect.title || prospect.lab || prospect.department,
    status,
    source,
    notes: prospect.outreach_angle || prospect.fit_rationale || prospect.notes || '',
    metadata: {
      email: prospect.contact_email || '',
      last_contacted: prospect.last_contacted || '',
      last_followed_up: prospect.last_followed_up || '',
      follow_up_date: prospect.follow_up_date || '',
    },
  }));
}

export function logJobConsiderPatchEvent(job, updates = {}) {
  const events = [];
  const applied = updates.applied === true || updates.status === 'applied';
  const unapplied = updates.applied === false || updates.status === 'to_consider';

  if (applied) {
    events.push(appendActivityEvent(baseEvent({
      domain: 'jobs',
      action: 'job_applied',
      subject_id: job.id,
      subject_label: `${job.company} - ${job.title}`,
      company: job.company,
      title: job.title,
      status: job.status || 'applied',
      source: 'Jobs To Consider',
      notes: job.notes || job.fit_summary || job.recommendation || '',
      metadata: {
        application_num: job.application_num || updates.application_num || '',
        url: job.url || '',
        applied_at: job.applied_at || updates.applied_at || '',
      },
    })));
  } else if (updates.status && !unapplied) {
    events.push(appendActivityEvent(baseEvent({
      domain: 'jobs',
      action: 'job_status_updated',
      subject_id: job.id,
      subject_label: `${job.company} - ${job.title}`,
      company: job.company,
      title: job.title,
      status: job.status || updates.status,
      source: 'Jobs To Consider',
      notes: job.notes || '',
      metadata: { url: job.url || '' },
    })));
  }
  return events;
}

export function logNetworkingActivity({
  action = 'updated',
  person = null,
  organization = null,
  task = null,
  interaction = null,
  notes = '',
} = {}) {
  if (String(process.env.NETWORKING_ACTIVITY_LOG || '').toLowerCase() === 'off') return null;
  const subjectId = person?.id || task?.id || interaction?.id || organization?.id || '';
  const subjectLabel = person?.display_name || task?.subject || interaction?.subject || organization?.name || 'Networking';
  return appendActivityEvent(baseEvent({
    domain: 'networking',
    action: `networking_${cleanText(action || 'updated')}`,
    subject_id: subjectId,
    subject_label: subjectLabel,
    company: person?.current_organization || organization?.name || '',
    title: person?.title || task?.subject || interaction?.type || '',
    status: person?.relationship_stage || task?.state || '',
    source: 'Networking Command Center',
    notes: cleanText(notes || interaction?.summary || task?.notes || person?.notes || ''),
    metadata: {
      person_id: person?.id || task?.person_id || interaction?.person_id || '',
      organization_id: organization?.id || person?.current_organization_id || task?.organization_id || '',
      channel: interaction?.channel || '',
      due_at: task?.due_at || '',
      occurred_at: interaction?.occurred_at || '',
    },
  }));
}

export function logApplicationRecordedEvent({ num, entry = {}, metadata = {}, core = {}, payload = {} }) {
  return appendActivityEvent(baseEvent({
    domain: 'jobs',
    action: 'application_recorded',
    subject_id: String(num),
    subject_label: `${entry.company || core.company || payload.company || ''} - ${entry.role || core.role || payload.role || payload.position || ''}`,
    company: entry.company || core.company || payload.company || '',
    title: entry.role || core.role || payload.role || payload.position || '',
    status: entry.status || core.status || 'Applied',
    source: 'Applications',
    notes: entry.notes || core.notes || payload.notes || '',
    metadata: {
      submitted_date: metadata.submitted_date || '',
      posting_url: metadata.posting_url || '',
    },
  }));
}

export function logApplicationContactedEvent({ num, entry = {}, metadata = {} }) {
  return appendActivityEvent(baseEvent({
    domain: 'jobs',
    action: 'application_contacted',
    subject_id: String(num),
    subject_label: `${entry.company || ''} - ${entry.role || ''}`,
    company: entry.company || '',
    title: entry.role || '',
    status: entry.status || '',
    source: 'Applications',
    notes: entry.notes || '',
    metadata: {
      outreach_date: metadata.outreach_date || '',
      email: metadata.email || entry.email || '',
      contact: metadata.contact || entry.contact || '',
    },
  }));
}

export function logApplicationPatchEvents({ num, core = {}, metadata = {}, entry = {}, payload = {} }) {
  const events = [];
  if (String(core.status || '').toLowerCase() === 'applied' || metadata.submitted_date) {
    events.push(logApplicationRecordedEvent({ num, entry, metadata, core, payload }));
  }
  if (metadata.outreach_date) {
    events.push(logApplicationContactedEvent({
      num,
      entry: { ...entry, ...core },
      metadata: { ...metadata, ...payload },
    }));
  }
  return events;
}
