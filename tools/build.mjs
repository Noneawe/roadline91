// SPDX-License-Identifier: AGPL-3.0-or-later
// Build: inlines all ES modules reachable from src/main.js into dist/roadline91.html.
// Supports named imports and `export const|let|function|class` only; anything else fails the build.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY_TAG = '<script type="module" src="src/main.js"></script>';
const MAX_BYTES = 1.5 * 1024 * 1024;
const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const EXPORT = /^export\s+(const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm;

const order = [];
const seen = new Set();

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const id = relative(ROOT, file);
  const names = [];
  let code = readFileSync(file, 'utf8').replace(IMPORT, (all, list, from) => {
    const dep = join(dirname(file), from);
    visit(dep);
    const bindings = list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
    return `const { ${bindings.join(', ')} } = __m[${JSON.stringify(relative(ROOT, dep))}];`;
  });
  code = code.replace(EXPORT, (all, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`${id}: unsupported import/export syntax`);
  order.push(`__m[${JSON.stringify(id)}] = (() => {\n${code}\nreturn { ${names.join(', ')} };\n})();`);
}

visit(join(ROOT, 'src/main.js'));
const script = `const __m = Object.create(null);\n${order.join('\n')}`.replace(/<\/script/g, '<\\/script');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
if (!html.includes(ENTRY_TAG)) throw new Error('index.html: entry script tag not found');
const out = html.replace(ENTRY_TAG, () => `<script type="module">\n${script}\n</script>`);
if (Buffer.byteLength(out) > MAX_BYTES) throw new Error(`dist too large: ${Buffer.byteLength(out)} bytes`);
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/roadline91.html'), out);
console.log(`dist/roadline91.html: ${seen.size} modules, ${Buffer.byteLength(out)} bytes`);
