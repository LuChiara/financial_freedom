// Inlines css/, js/ and data/countries.js into one self-contained HTML file: dist/fi-calculator.html
// Useful for sharing a single file or hosting somewhere that only takes one page.
// Run: node tools/bundle.js [https://github.com/you/repo]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const repo = process.argv[2];

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>\n${read('css/styles.css')}</style>`);
for (const src of ['js/engine.js', 'data/countries.js', 'js/ui.js']) {
  html = html.replace(`<script src="${src}"></script>`, () => `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}</script>`);
}
// Relative links to repo files don't exist next to a single file: point them at the repo, or drop them.
html = html.replace(/ Read <a href="METHODOLOGY\.md">how this is calculated<\/a>, or see <a href="data\/countries\.json">every default and its source<\/a>\./,
  repo ? ` Read <a href="${repo}/blob/main/METHODOLOGY.md">how this is calculated</a>, or see <a href="${repo}/blob/main/data/countries.json">every default and its source</a>.` : '');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'fi-calculator.html'), html);
console.log(`Wrote dist/fi-calculator.html (${(html.length / 1024).toFixed(0)} KB)`);
