/** Default fusion/diagnostics keywords. No Gemini. Title/summary token overlap only. */

export const DEFAULT_POSITIVE = [
  'plasma', 'fusion', 'diagnostics', 'diagnostic', 'instrumentation',
  'instrument', 'detector', 'readout', 'ion optics', 'mass spectrometry',
  'tokamak', 'stellarator', 'neutron', 'calibration', 'daq',
  'test engineer', 'research scientist', 'research associate',
  'postdoc', 'doctoral', 'phd', 'experimental physicist',
];

export const DEFAULT_NEGATIVE = [
  'sales', 'account executive', 'recruiter', 'marketing',
  'frontend', 'mobile', 'hr', 'people ops', 'legal',
  'biomedical', 'agriculture',
];

function tokensFrom(value = '') {
  return String(value)
    .toLowerCase()
    .split(/[,\n]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function haystack(job = {}) {
  return [job.title, job.institution, job.summary, job.description, job.country]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function parseKeywords(keywords = '') {
  return tokensFrom(keywords);
}

export function ruleScore(job = {}, profile = {}) {
  const text = haystack(job);
  const extra = parseKeywords(profile.keywords);
  const cvHints = tokensFrom(String(profile.cv_text || '').slice(0, 4000))
    .filter(token => token.length > 4)
    .slice(0, 40);
  const positive = [...new Set([...DEFAULT_POSITIVE, ...extra, ...cvHints])];
  const hits = positive.filter(token => text.includes(token.toLowerCase()));
  const misses = DEFAULT_NEGATIVE.filter(token => text.includes(token));
  let score = 2.5 + Math.min(2.2, hits.length * 0.35) - Math.min(1.5, misses.length * 0.5);
  score = Math.max(1, Math.min(5, Math.round(score * 10) / 10));
  const band = score >= 4 ? 'top_priority' : score >= 3.5 ? 'strong_fit' : score >= 2.5 ? 'maybe' : 'weak';
  return { score, band, hits: hits.slice(0, 8), misses };
}

export function attachFitScores(jobs = [], profile = {}) {
  return jobs.map(job => {
    const fit = ruleScore(job, profile);
    return { ...job, fit_score: fit.score, fit_band: fit.band, fit_hits: fit.hits };
  });
}
