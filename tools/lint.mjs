#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['src', 'tests', 'tools'];
const errors = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else if (/\.(?:ts|js|mjs)$/.test(entry.name)) files.push(target);
  }
  return files;
}

for (const relative of SOURCE_ROOTS) {
  for (const file of walk(path.join(ROOT, relative))) {
    const source = fs.readFileSync(file, 'utf8');
    const display = path.relative(ROOT, file);
    const lines = source.split(/\r?\n/);
    if (lines.length > 800) errors.push(`${display}: 文件超过 800 行，请继续拆分职责`);
    lines.forEach((line, index) => {
      if (/[ \t]+$/.test(line)) errors.push(`${display}:${index + 1}: 行尾空白`);
      if (/\t/.test(line)) errors.push(`${display}:${index + 1}: 使用了 Tab 缩进`);
    });
    if (display.startsWith('src/') && /from ['"]axios['"]/.test(source)) {
      const allowed = display === 'src/lib/client.ts' || display.startsWith('src/infrastructure/http/');
      if (!allowed) errors.push(`${display}: Axios 只能出现在 HTTP 基础设施或兼容 façade 中`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('source policy checks passed');
}
