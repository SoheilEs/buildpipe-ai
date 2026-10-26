import {
  MAX_CONFIG_PATHS,
  ServiceFields,
  branchProblem,
  configPathProblem,
  validateService,
} from './service-validation';

const valid = (): ServiceFields => ({
  name: 'Payments API',
  namespace: 'staging',
  workloadKind: 'Deployment',
  workloadName: 'payments-api',
  gitProvider: 'github',
  gitRepository: 'acme/infra-config',
  gitBaseBranch: 'main',
  configPaths: ['apps/payments/deployment.yaml'],
});

describe('validateService', () => {
  it('accepts a complete, valid service', () => {
    expect(validateService(valid())).toEqual({});
  });

  it('accepts a StatefulSet and a nested branch name', () => {
    expect(
      validateService({ ...valid(), workloadKind: 'StatefulSet', gitBaseBranch: 'release/1.2' }),
    ).toEqual({});
  });

  describe('name', () => {
    it.each(['', ' leading', '-dash', 'x'.repeat(101), 'bad/name', 'semi;colon', 42, null])(
      'rejects %p',
      (name) => {
        expect(validateService({ ...valid(), name })).toHaveProperty('name');
      },
    );
  });

  describe('namespace', () => {
    it.each(['', 'Staging', 'has_underscore', '-start', 'end-', 'a'.repeat(64), 'a b', 7])(
      'rejects %p',
      (namespace) => {
        expect(validateService({ ...valid(), namespace })).toHaveProperty('namespace');
      },
    );

    it.each(['kube-system', 'kube-public', 'kube-node-lease'])(
      'rejects system namespace %s',
      (ns) => {
        expect(validateService({ ...valid(), namespace: ns }).namespace).toMatch(
          /cannot be a target/,
        );
      },
    );

    it('accepts default and numeric-leading labels', () => {
      expect(validateService({ ...valid(), namespace: 'default' })).toEqual({});
      expect(validateService({ ...valid(), namespace: '1team' })).toEqual({});
    });
  });

  describe('workload', () => {
    it.each(['DaemonSet', 'Job', 'deployment', '', undefined])(
      'rejects kind %p',
      (workloadKind) => {
        expect(validateService({ ...valid(), workloadKind })).toHaveProperty('workloadKind');
      },
    );

    it.each(['', 'Upper', 'with space', '-x', 'x-', 'a'.repeat(254), 'x;rm', 'a/b'])(
      'rejects name %p',
      (workloadName) => {
        expect(validateService({ ...valid(), workloadName })).toHaveProperty('workloadName');
      },
    );

    it('accepts dotted subdomain names', () => {
      expect(validateService({ ...valid(), workloadName: 'api.v2' })).toEqual({});
    });
  });

  describe('git', () => {
    it.each(['gitlab', 'GitHub', '', undefined])('rejects provider %p', (gitProvider) => {
      expect(validateService({ ...valid(), gitProvider })).toHaveProperty('gitProvider');
    });

    it.each([
      '',
      'noslash',
      'a/b/c',
      '/name',
      'owner/',
      'owner/name.git',
      'ow ner/name',
      'owner/na..me',
      'https://github.com/acme/x',
      'owner/name;rm',
    ])('rejects repository %p', (gitRepository) => {
      expect(validateService({ ...valid(), gitRepository })).toHaveProperty('gitRepository');
    });

    it.each([
      '',
      '-main',
      'a..b',
      'a//b',
      'trailing/',
      'x.lock',
      'x.',
      'with space',
      'a~b',
      'a^b',
      'a:b',
      'x'.repeat(201),
      '--upload-pack=evil',
    ])('rejects branch %p', (gitBaseBranch) => {
      expect(branchProblem(gitBaseBranch)).not.toBeNull();
      expect(validateService({ ...valid(), gitBaseBranch })).toHaveProperty('gitBaseBranch');
    });
  });

  describe('configPaths', () => {
    it.each([
      '',
      '/etc/passwd',
      '../secrets.yaml',
      'a/../b.yaml',
      'a/./b.yaml',
      'a//b.yaml',
      'dir/',
      '.git/config.yaml',
      'a/.git/x.yaml',
      'C:\\win.yaml',
      'a\\b.yaml',
      'file.txt',
      'file',
      'a b.yaml',
      'a\u0000b.yaml',
      'x'.repeat(256) + '.yaml',
      'a$(whoami).yaml',
    ])('rejects path %p', (path) => {
      expect(configPathProblem(path)).not.toBeNull();
    });

    it.each([
      'deploy.yaml',
      'k8s/overlays/staging/deployment.yml',
      'values.json',
      'a/b-c_d.e/f.yaml',
    ])('accepts path %p', (path) => {
      expect(configPathProblem(path)).toBeNull();
    });

    it('requires at least one path and at most the limit', () => {
      expect(validateService({ ...valid(), configPaths: [] })).toHaveProperty('configPaths');
      const many = Array.from({ length: MAX_CONFIG_PATHS + 1 }, (_, i) => `f${i}.yaml`);
      expect(validateService({ ...valid(), configPaths: many })).toHaveProperty('configPaths');
      expect(validateService({ ...valid(), configPaths: many.slice(0, MAX_CONFIG_PATHS) })).toEqual(
        {},
      );
    });

    it('rejects duplicates and names the offending path', () => {
      expect(
        validateService({ ...valid(), configPaths: ['a.yaml', 'a.yaml'] }).configPaths,
      ).toMatch(/duplicates/);
      expect(
        validateService({ ...valid(), configPaths: ['a.yaml', '../b.yaml'] }).configPaths,
      ).toMatch(/^path 2 /);
    });

    it.each([undefined, null, 'a.yaml', { 0: 'a.yaml' }, [1], [null]])(
      'rejects non-list %p',
      (configPaths) => {
        expect(validateService({ ...valid(), configPaths: configPaths as never })).toHaveProperty(
          'configPaths',
        );
      },
    );
  });

  it('reports every bad field at once', () => {
    const problems = validateService({
      name: '',
      namespace: 'Bad',
      workloadKind: 'Job',
      workloadName: 'X',
      gitProvider: 'svn',
      gitRepository: 'x',
      gitBaseBranch: '..',
      configPaths: [],
    });
    expect(Object.keys(problems).sort()).toEqual(
      [
        'configPaths',
        'gitBaseBranch',
        'gitProvider',
        'gitRepository',
        'name',
        'namespace',
        'workloadKind',
        'workloadName',
      ].sort(),
    );
  });
});
