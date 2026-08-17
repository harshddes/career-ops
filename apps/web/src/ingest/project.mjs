function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function slugify(value = '') {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'item';
}

export function catalogJobId(source, stable) {
  return `${source}-${slugify(stable).slice(0, 72)}`;
}

function asIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function projectEuraxessItem(item = {}) {
  const url = cleanText(item.url || item.link);
  const jobId = url.match(/\/jobs\/(\d+)/)?.[1] || cleanText(item.id || item.external_id);
  const institution = cleanText(item.institution || item.university || 'EURAXESS');
  return {
    id: catalogJobId('euraxess', jobId || url),
    source: 'euraxess',
    title: cleanText(item.title),
    institution,
    country: cleanText(item.country),
    url,
    score: item.score ?? null,
    score_band: cleanText(item.score_band),
    deadline_text: cleanText(item.deadline_text || item.deadline),
    posted_at: asIso(item.posted_at || item.pubDate),
    visible: true,
    summary: cleanText(item.summary || item.description).slice(0, 1200),
    org_id: `org-${slugify(institution)}`,
    org: { name: institution, source: 'euraxess' },
  };
}

export function projectFusionJob(job = {}, org = {}) {
  const company = cleanText(job.company || org.name);
  return {
    id: catalogJobId('fusion', job.url || `${company}-${job.title}`),
    source: 'fusion',
    title: cleanText(job.title),
    institution: company,
    country: cleanText(job.location || org.country),
    url: cleanText(job.url),
    score: job.score ?? null,
    score_band: '',
    deadline_text: '',
    posted_at: asIso(job.posted_at),
    visible: true,
    location: cleanText(job.location),
    org_id: org.id || `org-${slugify(company)}`,
    org: {
      id: org.id || `org-${slugify(company)}`,
      name: company,
      website: org.website || '',
      careers_url: org.careers_url || '',
      source: 'fusion',
    },
  };
}

export function projectUmichRow(row = {}) {
  const jobId = cleanText(row.job_id || row.id);
  return {
    id: catalogJobId('umich', jobId),
    source: 'umich',
    title: cleanText(row.title || row.working_title),
    institution: cleanText(row.department || 'University of Michigan'),
    country: 'United States',
    url: cleanText(row.url),
    score: row.score ?? null,
    score_band: '',
    deadline_text: cleanText(row.date_posted || row.deadline_text),
    posted_at: asIso(row.date_posted),
    visible: true,
    location: cleanText(row.work_location),
    summary: cleanText(row.summary),
    org_id: 'org-university-of-michigan',
    org: {
      id: 'org-university-of-michigan',
      name: 'University of Michigan',
      website: 'https://careers.umich.edu',
      source: 'umich',
      country: 'United States',
    },
  };
}

export function projectPhdscannerItem(item = {}) {
  const id = cleanText(item.id || item.external_id);
  const institution = cleanText(item.institution || item.university);
  return {
    id: catalogJobId('phdscanner', id || item.url),
    source: 'phdscanner',
    title: cleanText(item.title),
    institution,
    country: cleanText(item.country),
    url: cleanText(item.url),
    score: item.score ?? null,
    score_band: '',
    deadline_text: cleanText(item.deadline_text),
    posted_at: asIso(item.posted_at),
    visible: true,
    summary: cleanText(item.summary).slice(0, 1200),
    org_id: institution ? `org-${slugify(institution)}` : null,
    org: institution ? { name: institution, source: 'phdscanner', country: item.country } : undefined,
  };
}
