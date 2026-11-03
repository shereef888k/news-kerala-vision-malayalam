const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const files = [];

function collectJavaScript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') collectJavaScript(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

collectJavaScript(path.join(root, 'backend'));
collectJavaScript(path.join(root, 'frontend'));

for (const file of files) {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.relative(root, file) });
}

for (const file of ['frontend/index.html', 'frontend/admin.html', 'frontend/demo.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  let index = 0;
  for (const [, attributes, source] of scripts) {
    if (/\bsrc\s*=/.test(attributes) || !source.trim()) continue;
    new vm.Script(source, { filename: `${file} inline script ${++index}` });
  }
}

console.log(`JavaScript syntax checks passed for ${files.length} files and inline HTML scripts.`);
