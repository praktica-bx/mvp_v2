const glob = require('glob');
const fs = require('fs');
const path = require('path');

const HEX_RGBA_RE = /(rgba?\([^)]*\))|(#(?:[A-Fa-f0-9]{3,8}))/g;

function isAllowedMatch(match) {
  if (!match) return true;
  if (/^transparent$/i.test(match)) return true;
  if (/^currentColor$/i.test(match)) return true;
  if (/var\(--color-/.test(match)) return true;
  return false;
}

const files = glob.sync('src/**/*.{js,jsx,ts,tsx,css,scss,less,html}', { nodir: true });
const SKIP_PATTERNS = [
  /src[\\/]index\.css$/,
  /src[\\/]constants[\\/]/,
  /src[\\/]components[\\/]ColorSwatch\.(jsx|js)$/
];
const found = [];

files.forEach((file) => {
  if (SKIP_PATTERNS.some((rx) => rx.test(file))) return;
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = HEX_RGBA_RE.exec(content)) !== null) {
    const match = m[0];
    // ignore if inside a var(...) fallback: var(--x, #ffffff)
    const varStart = content.lastIndexOf('var(', m.index);
    if (varStart !== -1) {
      const varEnd = content.indexOf(')', varStart);
      if (varEnd !== -1 && varEnd > m.index) continue;
    }
    if (!isAllowedMatch(match)) {
      const snippet = content.slice(Math.max(0, m.index - 40), Math.min(content.length, m.index + 40)).replace(/\n/g, ' ');
      found.push({ file, match, index: m.index, snippet });
    }
  }
});

if (found.length) {
  console.error('\nFound raw color literals (hex or rgba) — replace with var(--color-...) or allowed tokens:\n');
  found.forEach((f) => {
    console.error(`${f.file}: ${f.match}\n  ...${f.snippet}...\n`);
  });
  process.exit(1);
}

console.log('No raw color literals found.');
