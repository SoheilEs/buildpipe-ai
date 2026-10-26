/**
 * Pure validation for a registered service (a workload plus where its manifests live).
 * Every field ends up in a Kubernetes API call or a Git operation later, so the rules are strict
 * and positive: anything not matched is rejected, nothing is "sanitised".
 */

export const WORKLOAD_KINDS = ['Deployment', 'StatefulSet'] as const;
export type WorkloadKindName = (typeof WORKLOAD_KINDS)[number];

export const GIT_PROVIDERS = ['github'] as const;
export type GitProviderName = (typeof GIT_PROVIDERS)[number];

/** Namespaces that are never a valid target. */
export const FORBIDDEN_NAMESPACES: ReadonlySet<string> = new Set([
  'kube-system',
  'kube-public',
  'kube-node-lease',
]);

export const MAX_CONFIG_PATHS = 20;
export const MAX_CONFIG_PATH_LENGTH = 255;

const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/;
// DNS-1123 label (namespace) and subdomain (workload name).
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const GIT_REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9._-]{1,100}$/;
const GIT_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const PATH_CHARS = /^[A-Za-z0-9._/@+=-]+$/;
const PATH_EXTENSION = /\.(ya?ml|json)$/;

export interface ServiceFields {
  name: string;
  namespace: string;
  workloadKind: string;
  workloadName: string;
  gitProvider: string;
  gitRepository: string;
  gitBaseBranch: string;
  configPaths: string[];
}

export type ServiceProblems = Partial<Record<keyof ServiceFields, string>>;

export function configPathProblem(path: unknown): string | null {
  if (typeof path !== 'string' || path === '') return 'must be a non-empty string';
  if (path.length > MAX_CONFIG_PATH_LENGTH) {
    return `must be at most ${MAX_CONFIG_PATH_LENGTH} characters`;
  }
  if (path.startsWith('/')) return 'must be relative to the repository root';
  if (!PATH_CHARS.test(path)) return 'contains characters that are not allowed';
  const segments = path.split('/');
  if (segments.some((segment) => segment === '')) return 'must not contain empty segments';
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return 'must not contain "." or ".." segments';
  }
  if (segments.some((segment) => segment === '.git')) return 'must not point into .git';
  if (!PATH_EXTENSION.test(path)) return 'must end in .yaml, .yml or .json';
  return null;
}

export function branchProblem(branch: unknown): string | null {
  if (typeof branch !== 'string' || !GIT_BRANCH.test(branch)) {
    return 'is not a valid branch name';
  }
  if (branch.includes('..') || branch.includes('//') || branch.endsWith('/')) {
    return 'is not a valid branch name';
  }
  if (branch.endsWith('.lock') || branch.endsWith('.')) return 'is not a valid branch name';
  return null;
}

/** Returns the problems per field; an empty object means the service is valid. */
export function validateService(
  input: Partial<Record<keyof ServiceFields, unknown>>,
): ServiceProblems {
  const problems: ServiceProblems = {};

  if (typeof input.name !== 'string' || !NAME.test(input.name)) {
    problems.name = 'must be 1 to 100 characters: letters, digits, space, ".", "_" or "-"';
  }

  if (typeof input.namespace !== 'string' || !DNS_LABEL.test(input.namespace)) {
    problems.namespace = 'must be a valid Kubernetes namespace name (DNS-1123 label)';
  } else if (FORBIDDEN_NAMESPACES.has(input.namespace)) {
    problems.namespace = `${input.namespace} cannot be a target`;
  }

  if (!(WORKLOAD_KINDS as readonly unknown[]).includes(input.workloadKind)) {
    problems.workloadKind = `must be one of ${WORKLOAD_KINDS.join(', ')}`;
  }

  if (
    typeof input.workloadName !== 'string' ||
    input.workloadName.length > 253 ||
    !DNS_SUBDOMAIN.test(input.workloadName)
  ) {
    problems.workloadName = 'must be a valid Kubernetes object name (DNS-1123 subdomain)';
  }

  if (!(GIT_PROVIDERS as readonly unknown[]).includes(input.gitProvider)) {
    problems.gitProvider = `must be one of ${GIT_PROVIDERS.join(', ')}`;
  }

  if (
    typeof input.gitRepository !== 'string' ||
    !GIT_REPOSITORY.test(input.gitRepository) ||
    input.gitRepository.includes('..') ||
    input.gitRepository.endsWith('.git')
  ) {
    problems.gitRepository = 'must look like "owner/name" without ".git" or ".."';
  }

  const branch = branchProblem(input.gitBaseBranch);
  if (branch) problems.gitBaseBranch = branch;

  if (
    !Array.isArray(input.configPaths) ||
    input.configPaths.length < 1 ||
    input.configPaths.length > MAX_CONFIG_PATHS
  ) {
    problems.configPaths = `must list 1 to ${MAX_CONFIG_PATHS} paths`;
  } else {
    const paths = input.configPaths as unknown[];
    const bad = paths
      .map((path, index) => [index, configPathProblem(path)] as const)
      .find(([, p]) => p);
    if (bad) {
      problems.configPaths = `path ${bad[0] + 1} ${bad[1]}`;
    } else if (new Set(paths).size !== paths.length) {
      problems.configPaths = 'must not contain duplicates';
    }
  }

  return problems;
}
