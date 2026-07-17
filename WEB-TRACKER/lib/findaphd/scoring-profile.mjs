/**
 * FindAPhD uses the same fit lexicon as PhDScanner / EURAXESS.
 * Funding badges are filter flags only — never score inputs.
 */
export {
  VISIBLE_THRESHOLD,
  STRONG_THRESHOLD,
  RESEARCH_THRESHOLD,
  PACK_THRESHOLD,
  ARCHIVE_THRESHOLD,
  scorePhdscannerPosting as scoreFindaphdPosting,
} from '../phdscanner/scoring-profile.mjs';
