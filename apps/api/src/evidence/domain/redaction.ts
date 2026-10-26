/**
 * Redaction of evidence before it is stored (CLAUDE.md: secrets never reach logs, reports or a
 * model). Pure and deterministic. It works on parsed JSON, in two layers:
 *  - by key: a value under a key that names a secret is replaced whatever its type;
 *  - by pattern: well-known secret shapes inside strings are replaced.
 * This lowers the risk, it does not remove it: an unlabelled secret in free text can survive, so
 * collectors should also leave out data they do not need (for example Kubernetes env values).
 */

export const REDACTED = '[REDACTED]';

const SECRET_KEY =
  /(pass(word|wd)?|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|credential|authorization|cookie|kubeconfig|client[-_]?(certificate|key)[-_]?data|certificate[-_]?authority[-_]?data)/i;

type Replacer = (match: string, ...groups: string[]) => string;
const RULES: ReadonlyArray<readonly [RegExp, Replacer]> = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    () => REDACTED,
  ],
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, () => `Bearer ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, () => REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, () => REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, () => REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, () => REDACTED],
  // user:password@host inside a URL
  [/(:\/\/[^\s/:@]+:)[^\s/@]+(@)/g, (_m, head, tail) => `${head}${REDACTED}${tail}`],
  // key=value and key: value pairs in free text
  [
    /\b(pass(?:word|wd)?|secret|token|api[-_]?key|access[-_]?key)\s*[:=]\s*[^\s,;"']+/gi,
    (_m, key) => `${key}=${REDACTED}`,
  ],
];

export const MAX_DEPTH = 20;
export const MAX_NODES = 20_000;

export class EvidenceTooComplexError extends Error {}

export interface RedactionResult {
  value: unknown;
  /** How many values were replaced. Stored with the evidence so a report can say so. */
  redactions: number;
}

export function redactString(text: string): { text: string; redactions: number } {
  let redactions = 0;
  let out = text;
  for (const [pattern, replace] of RULES) {
    out = out.replace(pattern, (...args: unknown[]) => {
      redactions += 1;
      // The last two arguments are the offset and the whole string; the rest is match + groups.
      const parts = args.slice(0, -2) as string[];
      return replace(parts[0], ...parts.slice(1));
    });
  }
  return { text: out, redactions };
}

/** Redacts a JSON-compatible value and reports how many values were replaced. */
export function redactValue(input: unknown): RedactionResult {
  let redactions = 0;
  let nodes = 0;

  const walk = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) throw new EvidenceTooComplexError('evidence is nested too deeply');
    if (++nodes > MAX_NODES) throw new EvidenceTooComplexError('evidence has too many values');

    if (typeof value === 'string') {
      const result = redactString(value);
      redactions += result.redactions;
      return result.text;
    }
    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1));
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      // Kubernetes env entries look like { name: "DB_PASSWORD", value: "..." }.
      const namesSecret =
        typeof record.name === 'string' && SECRET_KEY.test(record.name) && 'value' in record;
      for (const [key, child] of Object.entries(record)) {
        if (SECRET_KEY.test(key) || (namesSecret && key === 'value')) {
          if (child !== null && child !== undefined && child !== '') {
            redactions += 1;
            out[key] = REDACTED;
          } else {
            out[key] = child;
          }
        } else {
          out[key] = walk(child, depth + 1);
        }
      }
      return out;
    }
    return value;
  };

  return { value: walk(input, 0), redactions };
}
