/**
 * Rules for evidence and findings (brief section 6: each item stored with its time, source,
 * source identifier and related version). Pure functions; the service applies them and writes.
 */
import { createHash } from 'crypto';

/** What an evidence item describes, and which source may produce it. */
export const EVIDENCE_KINDS = {
  'workload-spec': ['kubernetes'],
  'pod-status': ['kubernetes'],
  'scanner-control': ['kubescape'],
  'image-config': ['registry'],
  'git-file': ['git'],
} as const;

export type EvidenceKind = keyof typeof EVIDENCE_KINDS;
export const EVIDENCE_SOURCES = ['kubernetes', 'kubescape', 'registry', 'git'] as const;

export const FINDING_OUTCOMES = ['Present', 'Absent', 'Unknown', 'Conflicting'] as const;
export type FindingOutcome = (typeof FINDING_OUTCOMES)[number];

export const MAX_CONTENT_BYTES = 256 * 1024;
export const MAX_FINDING_EVIDENCE = 50;
/** Collectors on other machines may have slightly different clocks. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const CONTROL_CHARS = /[\x00-\x1F\x7F]/; // eslint-disable-line no-control-regex
const FINDING_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

export interface EvidenceInput {
  kind: string;
  source: string;
  /** Identifier at the source, e.g. "apps/v1/Deployment/staging/payments-api" or "C-0013". */
  sourceId: string;
  /** resourceVersion, image digest, commit SHA or tool version. Never empty. */
  sourceVersion: string;
  collectedAt: Date;
  content: unknown;
}

export interface FindingInput {
  code: string;
  outcome: string;
  summary: string;
  evidenceIds: string[];
}

export type Problems<T> = Partial<Record<keyof T, string>>;

const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  value.length <= max &&
  !CONTROL_CHARS.test(value);

/** Stable JSON: object keys sorted, so equal content always gives the same bytes and hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function validateEvidence(
  input: Partial<Record<keyof EvidenceInput, unknown>>,
  now: Date,
): Problems<EvidenceInput> {
  const problems: Problems<EvidenceInput> = {};
  const kinds = Object.keys(EVIDENCE_KINDS);

  if (typeof input.kind !== 'string' || !kinds.includes(input.kind)) {
    problems.kind = `must be one of ${kinds.join(', ')}`;
  }
  if (
    typeof input.source !== 'string' ||
    !(EVIDENCE_SOURCES as readonly string[]).includes(input.source)
  ) {
    problems.source = `must be one of ${EVIDENCE_SOURCES.join(', ')}`;
  } else if (
    !problems.kind &&
    !(EVIDENCE_KINDS[input.kind as EvidenceKind] as readonly string[]).includes(input.source)
  ) {
    problems.source = `${input.source} cannot produce ${String(input.kind)} evidence`;
  }
  if (!text(input.sourceId, 500)) problems.sourceId = 'must be 1 to 500 printable characters';
  if (!text(input.sourceVersion, 200)) {
    problems.sourceVersion =
      'is required: a resourceVersion, digest, commit SHA or tool version (1 to 200 printable characters)';
  }

  const at = input.collectedAt;
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    problems.collectedAt = 'must be a valid date';
  } else if (at.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
    problems.collectedAt = 'must not be in the future';
  }

  if (input.content === undefined) {
    problems.content = 'is required';
  } else if (Buffer.byteLength(canonicalJson(input.content), 'utf8') > MAX_CONTENT_BYTES) {
    problems.content = `must be at most ${MAX_CONTENT_BYTES} bytes as JSON`;
  }
  return problems;
}

export function validateFinding(
  input: Partial<Record<keyof FindingInput, unknown>>,
): Problems<FindingInput> {
  const problems: Problems<FindingInput> = {};

  if (typeof input.code !== 'string' || !FINDING_CODE.test(input.code)) {
    problems.code = 'must be UPPER_SNAKE_CASE, 3 to 64 characters';
  }
  const outcomeOk =
    typeof input.outcome === 'string' &&
    (FINDING_OUTCOMES as readonly string[]).includes(input.outcome);
  if (!outcomeOk) problems.outcome = `must be one of ${FINDING_OUTCOMES.join(', ')}`;
  if (!text(input.summary, 1000)) problems.summary = 'must be 1 to 1000 printable characters';

  const ids = input.evidenceIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id === '')) {
    problems.evidenceIds = 'must be a list of evidence ids';
  } else if (new Set(ids).size !== ids.length) {
    problems.evidenceIds = 'must not contain duplicates';
  } else if (ids.length > MAX_FINDING_EVIDENCE) {
    problems.evidenceIds = `must reference at most ${MAX_FINDING_EVIDENCE} items`;
  } else if (outcomeOk) {
    // A claim without evidence is a guess. Only "Unknown" may stand without any.
    if ((input.outcome === 'Present' || input.outcome === 'Absent') && ids.length < 1) {
      problems.evidenceIds = `a ${String(input.outcome)} finding must cite at least one evidence item`;
    }
    if (input.outcome === 'Conflicting' && ids.length < 2) {
      problems.evidenceIds = 'a Conflicting finding must cite at least two evidence items';
    }
  }
  return problems;
}
