const fs = require('fs');
const glob = require('glob');
const path = require('path');

// Load theme definitions
const themesFile = path.resolve(__dirname, '..', 'src', 'constants', 'themes.js');
const themesSrc = fs.readFileSync(themesFile, 'utf8');

// crude parse: find occurrences like primary: '#023e8a' or overlayWhite30: 'rgba(255,255,255,0.3)'
const TOKEN_RE = /([a-zA-Z0-9_]+)\s*:\s*('((?:#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}))|(?:rgba?\([^']+\)))')/g;
const mapping = {}; // normalized value -> varName (prefer first occurrence)
let m;
while ((m = TOKEN_RE.exec(themesSrc)) !== null) {
  const token = m[1];
  let val = m[3].toLowerCase();
  // normalize hex to 7-char form
  if (/^#([a-f0-9]{3})$/.test(val)) {
    const g = val.match(/^#([a-f0-9])([a-f0-9])([a-f0-9])$/);
    val = '#' + g[1] + g[1] + g[2] + g[2] + g[3] + g[3];
  }
  // normalize rgba spacing
  val = val.replace(/\s+/g, '');
  const varName = `--color-${token.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
  if (!mapping[val]) mapping[val] = varName;
}

const files = glob.sync('src/**/*.{css,scss,jsx,js,ts,tsx}', { nodir: true });
const SKIP_PATTERNS = [/src[\\/]index\.css$/, /src[\\/]constants[\\/]/];

let changedFiles = 0;

files.forEach((file) => {
  if (SKIP_PATTERNS.some(rx => rx.test(file))) return;
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  // replace full hex matches
  content = content.replace(/#([A-Fa-f0-9]{6})/g, (match) => {
    const low = match.toLowerCase();
    if (mapping[low]) return `var(${mapping[low]})`;
    return match;
  });
  // expand and replace short hex #fff
  content = content.replace(/#([A-Fa-f0-9]{3})([^A-Fa-f0-9])/g, (m0, g1, g2) => {
    const expanded = '#' + g1[0]+g1[0]+g1[1]+g1[1]+g1[2]+g1[2];
    const low = expanded.toLowerCase();
    if (mapping[low]) return `var(${mapping[low]})` + g2;
    return `#${g1}` + g2;
  });
  // replace rgba/rgba with no-spaces normalization
  content = content.replace(/rgba?\([^\)]+\)/g, (match) => {
    const norm = match.replace(/\s+/g, '').toLowerCase();
    if (mapping[norm]) return `var(${mapping[norm]})`;
    return match;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
  }
});

console.log(`Replaced hex literals in ${changedFiles} files.`);
