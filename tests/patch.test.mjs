import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lineDiff, createPatch } from '../app/diff.js';

const casesDir = new URL('./cases/', import.meta.url);
const cases = readdirSync(fileURLToPath(casesDir));

describe('patch generation', () => {
  for (const name of cases) {
    it(name, () => {
      const dir = new URL(`${name}/`, casesDir);
      const orig = readFileSync(new URL('original.txt', dir), 'utf8');
      const mod = readFileSync(new URL('modified.txt', dir), 'utf8');
      const diff = lineDiff(orig, mod, {});
      const patch = createPatch(diff, 'file.txt');
      const tmp = mkdtempSync(join(tmpdir(), 'diff-test-'));
      try {
        writeFileSync(join(tmp, 'file.txt'), orig);
        writeFileSync(join(tmp, 'patch.diff'), patch);
        execSync('git apply patch.diff', { cwd: tmp });
        const result = readFileSync(join(tmp, 'file.txt'), 'utf8');
        assert.strictEqual(result, mod);
      } finally {
        rmSync(tmp, { recursive: true });
      }
    });
  }
});
