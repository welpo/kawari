import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeLine, lineDiff } from '../app/diff.js';

describe('Normalization Logic', () => {
  describe('normalizeLine()', () => {
    it('handles trailing whitespace', () => {
      const opts = { trailing: true };
      assert.strictEqual(normalizeLine('hello  ', opts), 'hello');
      assert.strictEqual(normalizeLine('  hello  ', opts), '  hello'); // Preserves leading
    });

    it('handles amount of whitespace', () => {
      const opts = { amount: true };
      assert.strictEqual(normalizeLine('a    b', opts), 'a b');
      assert.strictEqual(normalizeLine('   a    b   ', opts), 'a b'); // Trims ends too
    });

    it('handles all whitespace', () => {
      const opts = { all: true };
      assert.strictEqual(normalizeLine(' a b c ', opts), 'abc');
      assert.strictEqual(normalizeLine('\t\ta\n', opts), 'a');
    });

    it('handles quote normalization', () => {
      const opts = { quotes: true };
      assert.strictEqual(normalizeLine('foo = "bar"', opts), "foo = 'bar'");
      assert.strictEqual(normalizeLine("foo = 'bar'", opts), "foo = 'bar'");
    });

    it('combines multiple options', () => {
      const opts = { quotes: true, trailing: true };
      // Normalises quotes AND strips trailing space
      assert.strictEqual(normalizeLine('v = "1"  ', opts), "v = '1'");
    });
  });

  describe('lineDiff() integration', () => {
    it('treats normalized matches as "same" with meta-data', () => {
      const diff = lineDiff('foo  ', 'foo', { trailing: true });
      assert.strictEqual(diff.length, 1);
      assert.strictEqual(diff[0].type, 'same');
      assert.strictEqual(diff[0].normalized, true);
      assert.deepStrictEqual(diff[0].normReason, ['whitespace']);
    });

    it('treats quote differences as "same" when ignored', () => {
      const diff = lineDiff('let s = "hi"', "let s = 'hi'", { quotes: true });
      assert.strictEqual(diff.length, 1);
      assert.strictEqual(diff[0].type, 'same');
      assert.strictEqual(diff[0].normalized, true);
      assert.deepStrictEqual(diff[0].normReason, ['quotes']);
    });

    it('reports multiple normalization reasons', () => {
      // Different quotes AND trailing space
      const diff = lineDiff('s="a" ', "s='a'", { quotes: true, trailing: true });
      assert.strictEqual(diff.length, 1);
      assert.strictEqual(diff[0].type, 'same');
      assert.strictEqual(diff[0].normalized, true);
      assert.ok(diff[0].normReason.includes('whitespace'));
      assert.ok(diff[0].normReason.includes('quotes'));
    });

    it('still sees differences if normalization does not make them equal', () => {
      // Trailing is ignored, but "foo" != "bar"
      const diff = lineDiff('foo  ', 'bar', { trailing: true });
      // Should find differences (not same)
      const hasChanges = diff.some(d => d.type !== 'same');
      assert.ok(hasChanges);
    });
  });
});
