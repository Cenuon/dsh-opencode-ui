#!/usr/bin/env node
/**
 * Widen every class-suffix selector so it also matches elements that carry more
 * than one class.
 *
 * DSH builds class strings with `clsx`, so a state class rides along with the
 * base one: the active settings nav cell is `_77Pn0W_navCell _77Pn0W_active`.
 * `[class$="_navCell"]` only matches when the whole class attribute ends with
 * `_navCell`, so it silently skipped every element that also had a state class —
 * the selected row kept the shipped 40px bluish style while its siblings were
 * restyled to 28px neutral. Measured: active pill 39px vs siblings 28px.
 *
 * Rewrites (idempotent — the lookbehind skips already-widened arms):
 *   [class$="_X"]   ->  :is([class$="_X"], [class*="_X "])
 *   [class^="_X_"]  ->  :is([class^="_X_"], [class*=" _X_"])
 *
 * The trailing space in the `*=` arm is what keeps this precise: `_X ` cannot
 * match `_XExtra`, so it stays a suffix match rather than a substring match.
 * `:is()` adopts the highest specificity among its arguments, so the rewritten
 * selector keeps the original weight.
 *
 * Usage: node tools/widen-class-selectors.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['src/settings.css', 'src/app.css', 'src/module.js'];

/** `[class$="_X"]` also matches when `_X` is followed by another class. */
const widenSuffix = (css) =>
  css.replace(/(?<!:is\()\[class\$="(_[A-Za-z0-9_-]+)"\]/g,
    (_m, name) => `:is([class$="${name}"], [class*="${name} "])`);

/** `[class^="_X_"]` also matches when `_X_` is preceded by another class. */
const widenPrefix = (css) =>
  css.replace(/(?<!:is\()\[class\^="(_[A-Za-z0-9_-]+_)"\]/g,
    (_m, name) => `:is([class^="${name}"], [class*=" ${name}"])`);

const check = process.argv.includes('--check');
let stale = 0;

for (const rel of targets) {
  const path = join(root, rel);
  const before = readFileSync(path, 'utf8');
  const after = widenPrefix(widenSuffix(before));
  if (before === after) {
    console.log(`unchanged  ${rel}`);
    continue;
  }
  stale += 1;
  if (check) {
    console.error(`stale      ${rel} — run \`node tools/widen-class-selectors.mjs\``);
  } else {
    writeFileSync(path, after);
    console.log(`rewritten  ${rel}  (${(after.match(/:is\(\[class/g) ?? []).length} widened)`);
  }
}

if (check && stale > 0) process.exit(1);
