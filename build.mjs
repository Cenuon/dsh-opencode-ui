#!/usr/bin/env node
/**
 * Build client.js — the browser ModuleLoader entry — from the sources under src/.
 *
 * The DSH Client loads one file per plugin, `window.__ModuleLoader__.load({ id,
 * factory })`, and the factory receives a module-table `require`. There is no
 * relative require, so every source has to arrive inside that single file; this
 * script does exactly one thing, string inlining, and adds no dependencies.
 *
 *   node build.mjs           write client.js
 *   node build.mjs --check   fail if client.js is stale (for verification)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const indent = (text, spaces) =>
  text.split('\n').map((line) => (line.length > 0 ? ' '.repeat(spaces) + line : line)).join('\n');

const pkg = JSON.parse(read('package.json'));
const tokens = JSON.parse(read('src/tokens.json'));
const settingsCss = read('src/settings.css').trim();
const appCss = read('src/app.css').trim();
const body = read('src/module.js').trim();

// Fail loudly here rather than letting the plugin throw during activation:
// overrideTokens rejects any entry that is not a { light, dark } string pair.
const problems = [];
for (const [name, value] of Object.entries(tokens)) {
  if (!name.startsWith('--')) problems.push(`${name}: token name must start with "--"`);
  if (value === null || typeof value !== 'object') { problems.push(`${name}: must be an object`); continue; }
  if (typeof value.light !== 'string' || value.light === '') problems.push(`${name}: missing "light"`);
  if (typeof value.dark !== 'string' || value.dark === '') problems.push(`${name}: missing "dark"`);
  for (const key of Object.keys(value)) {
    if (key !== 'light' && key !== 'dark') problems.push(`${name}: unexpected key "${key}"`);
  }
}
for (const [label, css] of [['settings.css', settingsCss], ['app.css', appCss]]) {
  const opens = (css.match(/\{/g) ?? []).length;
  const closes = (css.match(/\}/g) ?? []).length;
  if (opens !== closes) problems.push(`${label}: unbalanced braces (${opens} "{" vs ${closes} "}")`);
  if (css.includes('</style')) problems.push(`${label}: must not contain "</style"`);
  // A bare `[class$="_x"]` silently skips every element that also carries a state
  // class, because clsx joins them into one attribute: the active settings nav
  // cell is `kB3qhq_navCell kB3qhq_active`, which does not end with `_navCell`.
  // That is how the selected row kept the shipped 40px bluish style while its
  // siblings were restyled. Run tools/widen-class-selectors.mjs instead.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bare = (stripped.match(/(?<!:is\()\[class[\^$]="/g) ?? []).length;
  if (bare > 0) {
    problems.push(`${label}: ${bare} bare [class$=]/[class^=] selector(s) — run \`node tools/widen-class-selectors.mjs\``);
  }
}
if (!/\bfunction apply\s*\(/.test(body)) problems.push('module.js: must declare "function apply("');
if (problems.length > 0) {
  console.error('build failed:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

const out = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /* ---- inlined by build.mjs; edit src/, never this block ---- */
    const TOKENS = ${JSON.stringify(tokens, null, 2).split('\n').join('\n    ')};
    const SETTINGS_CSS = ${JSON.stringify(settingsCss)};
    const APP_CSS = ${JSON.stringify(appCss)};
    /* ---- end inlined ---- */

${indent(body, 4)}

    return { inject: ['slots'], apply };
  },
});
`;

const target = join(root, 'client.js');
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== out) {
    console.error('client.js is stale — run `node build.mjs`');
    process.exit(1);
  }
  console.log('client.js is up to date');
} else {
  writeFileSync(target, out);
  const rules = (settingsCss.match(/\{/g) ?? []).length + (appCss.match(/\{/g) ?? []).length;
  console.log(`client.js written — ${Object.keys(tokens).length} tokens, ${rules} CSS rules, ${Buffer.byteLength(out)} bytes`);
}
