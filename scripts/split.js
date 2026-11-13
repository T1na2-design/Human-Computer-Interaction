// Usage: npm run split -- path/to/prototype.html
// Splits the single-file prototype into public/index.html + css/styles.css + js/app.js
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('Usage: npm run split -- path/to/prototype.html'); process.exit(1); }
let html = fs.readFileSync(src, 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/);
const script = html.match(/<script>([\s\S]*?)<\/script>/);
if (!style || !script) { console.error('Could not find <style> and <script> blocks.'); process.exit(1); }
const pub = path.join(__dirname, '..', 'public');
fs.mkdirSync(path.join(pub, 'css'), { recursive: true });
fs.mkdirSync(path.join(pub, 'js'), { recursive: true });
fs.writeFileSync(path.join(pub, 'css/styles.css'), style[1].trim() + '\n');
fs.writeFileSync(path.join(pub, 'js/app.js'), script[1].trim() + '\n');
html = html.replace(style[0], '<link rel="stylesheet" href="/css/styles.css">')
           .replace(script[0], '<script src="/js/api.js"></script>\n\t<script src="/js/app.js"></script>');
fs.writeFileSync(path.join(pub, 'index.html'), html);
console.log('Done: public/index.html, public/css/styles.css, public/js/app.js');
