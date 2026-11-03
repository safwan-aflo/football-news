// Site checks for a static page (no dependencies). Run: node tests/check-site.js
// Fails (exit 1) if the page is structurally broken or references files that don't exist.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];
const fail = (msg) => errors.push(msg);

const file = path.join(root, 'index.html');
if (!fs.existsSync(file)) { console.error('index.html is missing'); process.exit(1); }
const html = fs.readFileSync(file, 'utf8');

// 1. basic document structure
if (!/<!doctype html>/i.test(html)) fail('missing <!DOCTYPE html>');
for (const tag of ['html', 'head', 'body']) {
  if (!new RegExp(`<${tag}[\\s>]`, 'i').test(html)) fail(`missing <${tag}>`);
  if (!new RegExp(`</${tag}>`, 'i').test(html)) fail(`missing </${tag}>`);
}
const title = html.match(/<title>([^<]*)<\/title>/i);
if (!title || !title[1].trim()) fail('missing or empty <title>');

// 2. balanced container tags (catches accidentally deleted closing tags)
for (const tag of ['div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'ul', 'ol', 'a', 'p', 'span', 'button']) {
  const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
  const close = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
  if (open !== close) fail(`<${tag}> opened ${open}× but closed ${close}×`);
}

// 3. duplicate ids
const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((m) => m[1]);
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dup.length) fail(`duplicate id(s): ${[...new Set(dup)].join(', ')}`);

// 4. every local src/href points to an existing file; in-page #anchors exist
const refs = [...html.matchAll(/\s(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]);
for (const ref of refs) {
  if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(ref)) continue;
  if (ref.startsWith('#')) {
    if (ref.length > 1 && !ids.includes(ref.slice(1))) fail(`in-page link ${ref} has no matching id`);
    continue;
  }
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]).replace(/^\.?\//, '');
  if (!clean) continue;
  if (!fs.existsSync(path.join(root, clean))) fail(`broken reference: ${ref}`);
}

// 5. images have alt text
for (const img of html.match(/<img\b[^>]*>/gi) || []) {
  if (!/\salt=["'][^"']*["']/i.test(img)) fail(`image without alt: ${img.slice(0, 80)}`);
}

// 6. referenced SVG files are well-formed enough to render
for (const ref of refs.filter((r) => /\.svg($|[?#])/i.test(r) && !/^https?:/i.test(r))) {
  const p = path.join(root, decodeURIComponent(ref.split(/[?#]/)[0]).replace(/^\.?\//, ''));
  if (!fs.existsSync(p)) continue;
  const svg = fs.readFileSync(p, 'utf8');
  if (!/<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg.trim())) fail(`malformed SVG: ${ref}`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ site checks passed (${refs.length} references, ${ids.length} ids)`);
