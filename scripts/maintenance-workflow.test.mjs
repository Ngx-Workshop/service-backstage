import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

function fixture(git = true, tooling = false) {
  const directory = mkdtempSync(join(tmpdir(), 'backstage-maintenance-'));
  for (const file of ['package.json', 'package-lock.json']) {
    copyFileSync(join(root, file), join(directory, file));
  }
  if (tooling) {
    mkdirSync(join(directory, '.husky'));
    for (const path of ['src', 'test', 'scripts', '.github/workflows']) {
      mkdirSync(join(directory, path), { recursive: true });
    }
    for (const file of [
      '.husky/pre-commit',
      '.lintstagedrc.json',
      '.prettierrc',
      '.prettierignore',
      'test/jest-e2e.json',
      'scripts/maintenance-workflow.test.mjs',
      '.github/workflows/maintenance.yml',
    ]) {
      copyFileSync(join(root, file), join(directory, file));
    }
    writeFileSync(join(directory, '.gitignore'), 'node_modules/\n.husky/_/\n');
    writeFileSync(
      join(directory, 'src/fixture.ts'),
      'export const check = 1;\n'
    );
    writeFileSync(
      join(directory, 'test/fixture.ts'),
      'export const check = 2;\n'
    );
  }
  const env = {
    ...process.env,
    CI: '',
    HUSKY: '',
    NODE_ENV: '',
    npm_config_omit: '',
    XDG_CONFIG_HOME: join(directory, 'empty-config'),
  };
  delete env.npm_config_production;
  delete env.npm_config_include;
  const run = (command, args, extraEnv = {}) =>
    execFileSync(command, args, {
      cwd: directory,
      env: { ...env, ...extraEnv },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if (git) {
    run('git', ['init', '--quiet']);
    run('git', ['config', 'user.name', 'Maintenance fixture']);
    run('git', ['config', 'user.email', 'fixture@example.invalid']);
    run('git', ['config', 'commit.gpgsign', 'false']);
  }
  return {
    directory,
    run,
    env,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('developer install and actual hooks preserve partial staging and block failure', () => {
  const { directory, run, env, cleanup } = fixture(true, true);
  try {
    run('npm', ['ci', '--no-audit', '--no-fund']);
    assert.equal(
      run('git', ['config', '--local', 'core.hooksPath']).trim(),
      '.husky/_'
    );
    const middle = Array.from(
      { length: 8 },
      (_, i) => `const keep${i} = ${i};\n`
    ).join('');
    const baseline = `const staged = { value: 0 };\n${middle}const untouched = 1;\n`;
    writeFileSync(join(directory, 'fixture.js'), baseline);
    run('git', ['add', '.']);
    run('git', ['commit', '--quiet', '-m', 'fixture baseline'], { HUSKY: '0' });

    const staged = `const staged={value:1}\n${middle}const untouched = 1;\n`;
    writeFileSync(join(directory, 'fixture.js'), staged);
    run('git', ['add', 'fixture.js']);
    writeFileSync(
      join(directory, 'fixture.js'),
      staged.replace('untouched = 1', 'untouched = 2')
    );
    writeFileSync(
      join(directory, 'unstaged.js'),
      'const privateUnstaged={value:3}\n'
    );
    const unstaged = readFileSync(join(directory, 'unstaged.js'), 'utf8');
    run('git', ['commit', '--quiet', '-m', 'fixture formatted staging']);
    const committed = run('git', ['show', 'HEAD:fixture.js']);
    assert.match(committed, /const staged = \{ value: 1 \};/);
    assert.match(committed, /const untouched = 1;/);
    assert.match(
      readFileSync(join(directory, 'fixture.js'), 'utf8'),
      /const untouched = 2;/
    );
    assert.equal(
      readFileSync(join(directory, 'unstaged.js'), 'utf8'),
      unstaged
    );

    const invalid = 'const broken = {\n';
    writeFileSync(join(directory, 'fixture.js'), invalid);
    run('git', ['add', 'fixture.js']);
    const before = run('git', ['rev-parse', 'HEAD']);
    const failed = spawnSync(
      'git',
      ['commit', '--quiet', '-m', 'must not commit'],
      {
        cwd: directory,
        env,
        encoding: 'utf8',
      }
    );
    assert.notEqual(failed.status, 0);
    assert.equal(run('git', ['rev-parse', 'HEAD']), before);
    assert.equal(run('git', ['show', ':fixture.js']), invalid);
    assert.equal(readFileSync(join(directory, 'fixture.js'), 'utf8'), invalid);

    run('npm', ['run', 'format:check']);
    const badFormat = 'export const formatting={value:1}\n';
    writeFileSync(join(directory, 'src/fixture.ts'), badFormat);
    const checked = spawnSync('npm', ['run', 'format:check'], {
      cwd: directory,
      env,
      encoding: 'utf8',
    });
    assert.equal(checked.status, 1);
    assert.equal(
      readFileSync(join(directory, 'src/fixture.ts'), 'utf8'),
      badFormat
    );
    mkdirSync(join(directory, 'contracts'));
    writeFileSync(join(directory, 'contracts/generated.ts'), invalid);
    const info = JSON.parse(
      run(join(directory, 'node_modules/.bin/prettier'), [
        '--file-info',
        'contracts/generated.ts',
      ])
    );
    assert.equal(info.ignored, true);
  } finally {
    cleanup();
  }
});

for (const [name, git, args, env] of [
  ['CI install skips hooks', true, [], { CI: 'true' }],
  ['Docker package-only install without Git succeeds', false, [], {}],
  [
    'production install without devDependencies or hook files succeeds',
    true,
    ['--omit=dev'],
    {},
  ],
]) {
  test(name, () => {
    const { directory, run, cleanup } = fixture(git);
    try {
      run('npm', ['ci', '--no-audit', '--no-fund', ...args], env);
      assert.equal(existsSync(join(directory, '.husky/_/pre-commit')), false);
      if (args.includes('--omit=dev')) {
        assert.equal(existsSync(join(directory, 'node_modules/husky')), false);
        assert.equal(
          existsSync(join(directory, 'node_modules/lint-staged')),
          false
        );
      }
    } finally {
      cleanup();
    }
  });
}
