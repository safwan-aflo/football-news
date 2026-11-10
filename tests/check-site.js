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

// 7. no leftover demo/sample-content notice on the public page
if (/Demo landing page|fictional sample content/i.test(html)) fail('demo/sample-content notice present on page');

// 8. league table: 1st-place club is Real Madrid
const leagueTable = html.match(/<div id="table">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
const firstRow = leagueTable && leagueTable[1].match(/<tr>\s*<td>1<\/td>\s*<td>([^<]*)<\/td>/i);
if (!firstRow) fail('league table 1st-place row not found');
else if (firstRow[1].trim() !== 'Real Madrid') fail(`league table 1st place is "${firstRow[1].trim()}", expected "Real Madrid"`);

// 9. league table: 2nd-place club is Arsenal
const secondRow = leagueTable && leagueTable[1].match(/<tr>\s*<td>2<\/td>\s*<td>([^<]*)<\/td>/i);
if (!secondRow) fail('league table 2nd-place row not found');
else if (secondRow[1].trim() !== 'Arsenal') fail(`league table 2nd place is "${secondRow[1].trim()}", expected "Arsenal"`);

// 10. league table: 3rd-place club is Bayern Munich
const thirdRow = leagueTable && leagueTable[1].match(/<tr>\s*<td>3<\/td>\s*<td>([^<]*)<\/td>/i);
if (!thirdRow) fail('league table 3rd-place row not found');
else if (thirdRow[1].trim() !== 'Bayern Munich') fail(`league table 3rd place is "${thirdRow[1].trim()}", expected "Bayern Munich"`);

// 11. header Subscribe button shows a bell icon
const header = html.match(/<header>[\s\S]*?<\/header>/i);
const subscribe = header && header[0].match(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*Subscribe(?:(?!<\/a>)[\s\S])*<\/a>/i);
if (!subscribe) fail('header Subscribe button not found');
else if (!/<svg\b[^>]*class=["'][^"']*\bbell\b/i.test(subscribe[0])) fail('header Subscribe button has no bell icon');

// 12. header nav has an in-page 'About' link immediately after 'Newsletter'
const navList = header && header[0].match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/i);
const navLinks = navList
  ? [...navList[1].matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], label: m[2].replace(/<[^>]*>/g, '').trim() }))
  : [];
const labels = navLinks.map((l) => l.label);
const aboutIdx = labels.indexOf('About');
if (!navList) fail('header nav list not found');
else if (aboutIdx === -1) fail('header nav has no "About" link');
else if (labels.indexOf('Newsletter') === -1 || aboutIdx !== labels.indexOf('Newsletter') + 1) fail(`header nav "About" is not right after "Newsletter" (order: ${labels.join(', ')})`);
else if (!/^#./.test(navLinks[aboutIdx].href)) fail(`header nav "About" link should point to an in-page section, got "${navLinks[aboutIdx].href}"`);

// 13. header nav has an in-page 'Contact' link after 'Newsletter' that resolves to an existing id
const contactIdx = labels.indexOf('Contact');
const newsletterIdx = labels.indexOf('Newsletter');
if (!navList) fail('header nav list not found');
else if (contactIdx === -1) fail('header nav has no "Contact" link');
else if (newsletterIdx === -1 || contactIdx < newsletterIdx) fail(`header nav "Contact" is not after "Newsletter" (order: ${labels.join(', ')})`);
else if (!/^#./.test(navLinks[contactIdx].href)) fail(`header nav "Contact" link should point to an in-page section, got "${navLinks[contactIdx].href}"`);
else if (!ids.includes(navLinks[contactIdx].href.slice(1))) fail(`header nav "Contact" link ${navLinks[contactIdx].href} has no matching id`);

// 14. header Subscribe button is light green
const css = (html.match(/<style>([\s\S]*?)<\/style>/i) || [])[1] || '';
const rootVars = Object.fromEntries([...((css.match(/:root\s*\{([^}]*)\}/) || [])[1] || '').matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2].trim()]));
const bellRule = css.match(/\.btn-bell\s*\{([^}]*)\}/);
const bellBgRaw = bellRule && (bellRule[1].match(/background(?:-color)?\s*:\s*([^;]+)/) || [])[1];
const bellBgVar = bellBgRaw && bellBgRaw.trim().match(/^var\((--[\w-]+)\)$/);
const bellBg = (bellBgVar ? rootVars[bellBgVar[1]] : bellBgRaw || '').trim().toLowerCase();
if (!subscribe || !/class=["'][^"']*\bbtn-bell\b/i.test(subscribe[0])) fail('header Subscribe button has no btn-bell class');
else if (!['#90ee90', 'lightgreen'].includes(bellBg)) fail(`header Subscribe button background is "${bellBg || 'inherited from .btn'}", expected light green (#90ee90)`);

// 15. header has an accessible inbox icon link right next to the Subscribe button
const navActions = header && header[0].match(/<div\b[^>]*class=["'][^"']*\bnav-actions\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
const actionLinks = navActions ? navActions[1].match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [] : [];
const inboxIdx = actionLinks.findIndex((a) => /\saria-label=["']Inbox["']/i.test(a));
const inbox = actionLinks[inboxIdx];
if (!navActions) fail('header has no .nav-actions group around the Subscribe button');
else if (!inbox) fail('header has no link with aria-label="Inbox"');
else if (!/<svg\b[^>]*class=["'][^"']*\binbox\b/i.test(inbox) || !/<svg\b[^>]*aria-hidden=["']true["']/i.test(inbox)) fail('header inbox link has no aria-hidden inbox icon');
else if (/Subscribe/i.test(inbox)) fail('header inbox link must not contain the text "Subscribe"');
else if (!/\shref=["']#[^"']+["']/i.test(inbox)) fail('header inbox link should point to an in-page section');
else if (!actionLinks.some((a, i) => Math.abs(i - inboxIdx) === 1 && /Subscribe/i.test(a))) fail('header inbox link is not directly next to the Subscribe button');

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ site checks passed (${refs.length} references, ${ids.length} ids)`);
