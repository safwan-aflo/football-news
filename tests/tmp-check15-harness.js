// TEMPORARY verification harness for check 15 — delete after use.
const fs = require('fs'), cp = require('child_process'), path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(__dirname, 'check-site.js'), 'utf8')
  .replace("const html = fs.readFileSync(file, 'utf8');", 'const html = process.env.CHK_HTML;')
  .replace("path.resolve(__dirname, '..')", JSON.stringify(root));
const cur = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const old = cp.execFileSync('git', ['show', 'bc54576:index.html'], { cwd: root, encoding: 'utf8' });
const seam = '</svg></a>\n      <a class="btn btn-bell"';
if (!cur.includes(seam)) throw new Error('seam not found');
const variants = {
  old,
  noLabel: cur.replace(' aria-label="Inbox"', ''),
  emptyLabel: cur.replace('aria-label="Inbox"', 'aria-label=" "'),
  missingId: cur.replace('<a class="icon-btn" href="#newsletter"', '<a class="icon-btn" href="#nope"'),
  linkBetween: cur.replace(seam, '</svg></a><a href="#about">x</a>\n      <a class="btn btn-bell"'),
  otherWrapper: cur.replace(seam, '</svg></a></div><div>\n      <a class="btn btn-bell"'),
  visibleTextOnly: cur.replace(' aria-label="Inbox"', '').replace(seam, '</svg>Inbox</a>\n      <a class="btn btn-bell"'),
  current: cur,
};
for (const [k, h] of Object.entries(variants)) {
  const r = cp.spawnSync(process.execPath, ['-e', src], { env: { ...process.env, CHK_HTML: h }, encoding: 'utf8' });
  console.log(`[${k}] exit ${r.status}: ${(r.stdout + r.stderr).trim().replace(/\n/g, ' | ')}`);
}
