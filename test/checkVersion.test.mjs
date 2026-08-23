import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../scripts/check-version.mjs', import.meta.url).pathname;

/** A throwaway repo with `version` in package.json and the given tags. */
function repo({ version, tags = [], shallow = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'ver-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 't', version }));
  git('add', '-A');
  git('commit', '-qm', 'one');
  for (const tag of tags) git('tag', tag);

  if (shallow) {
    // A clone, because "shallow" is a property of the checkout, not something
    // you can set on a repo you made locally.
    const clone = mkdtempSync(join(tmpdir(), 'ver-shallow-'));
    execFileSync('git', ['clone', '-q', '--depth', '1', '--no-tags', `file://${dir}`, clone], {
      stdio: 'pipe',
    });
    mkdirSync(join(clone, 'scripts'), { recursive: true });
    cpSync(SCRIPT, join(clone, 'scripts/check-version.mjs'));
    rmSync(dir, { recursive: true, force: true });
    return clone;
  }

  mkdirSync(join(dir, 'scripts'), { recursive: true });
  cpSync(SCRIPT, join(dir, 'scripts/check-version.mjs'));
  return dir;
}

const run = (dir) => {
  const r = spawnSync(process.execPath, ['scripts/check-version.mjs'], { cwd: dir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('the version guard', () => {
  test('passes a version ahead of every tag', () => {
    const { code, out } = run(repo({ version: '1.4.0', tags: ['v1.3.1', 'v1.3.2'] }));
    assert.equal(code, 0);
    assert.match(out, /releasable/);
  });

  test('rejects a version that is already tagged', () => {
    const { code, out } = run(repo({ version: '1.3.2', tags: ['v1.3.2'] }));
    assert.equal(code, 1);
    assert.match(out, /already released/);
  });

  test('rejects a version below the latest release', () => {
    const { code, out } = run(repo({ version: '1.2.0', tags: ['v1.3.2'] }));
    assert.equal(code, 1);
    assert.match(out, /lower than the latest release/);
  });

  test('rejects a version that is not semver', () => {
    const { code, out } = run(repo({ version: 'wat', tags: ['v1.0.0'] }));
    assert.equal(code, 1);
    assert.match(out, /not a valid semver/);
  });

  test('a genuine first release still passes, loudly', () => {
    const { code, out } = run(repo({ version: '0.1.0', tags: [] }));
    assert.equal(code, 0);
    assert.match(out, /first release/);
  });

  test('a shallow clone fails instead of reading as a first release', () => {
    // The regression: `git tag -l` succeeds with empty output on a shallow
    // clone, so the try/catch could never fire, and the script waved through
    // an already-released version reporting "(first release)".
    const { code, out } = run(repo({ version: '1.3.2', tags: ['v1.3.2'], shallow: true }));
    assert.equal(code, 1);
    assert.match(out, /shallow clone/);
    assert.match(out, /fetch-depth: 0/);
  });
});
