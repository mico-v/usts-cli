#!/usr/bin/env node
/**
 * 清理 `dist/` 里已经没有对应源文件的编译产物。
 *
 * 为什么需要它：`tsc` 只负责写文件，**从不删除**输出目录里多出来的东西。`src/cli/` 之前
 * 叫 `src/commands/`、另有 `src/lib/`，重构后源文件没了，但 `dist/commands/`、`dist/lib/`
 * 这些旧产物一直躺在 `dist/` 里（`dist/` 在 .gitignore 中，所以没人看见）。而 `package.json`
 * 的 `files` 是 `["dist"]` —— `npm publish` 会把这 25 个陈旧 JavaScript 文件一并发出去：
 * 包体积变大，而且用户装到的包里带着一份**与当前版本无关的旧代码**。
 *
 * CI 从干净 checkout 构建，所以 CI 看不出来；只有本地发布（或本地 `npm pack`）会踩到。
 *
 * 做法：遍历 `dist/`，凡是「有 .js / .js.map 但没有同名 .ts 源文件」的文件一律删除，
 * 然后删掉空目录。判定用同路径下的 `.ts` 是否存在，因此不需要维护一份路径白名单。
 * 只在 `dist/` 是 tsc 的输出目录（存在 `src/`）时才运行，避免误删别处的构建产物。
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const srcDir = path.join(root, 'src');

if (!existsSync(distDir)) process.exit(0);
if (!existsSync(srcDir)) {
  console.log('[prune-dist] 未找到 src/，跳过（dist/ 可能不是本项目的编译输出）');
  process.exit(0);
}

const removed = [];

/** 该产物是否有对应的源文件 */
function hasSource(relative) {
  const base = relative.replace(/\.js\.map$/, '').replace(/\.js$/, '');
  return existsSync(path.join(srcDir, `${base}.ts`))
    || existsSync(path.join(srcDir, `${base}.tsx`))
    // .d.ts 声明文件（tsc 的 declaration 输出）按 .ts 判定即可
    || existsSync(path.join(srcDir, base));
}

function prune(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      prune(full);
      // 清完之后是空目录就删掉（旧的一整个目录如 dist/commands/）
      if (readdirSync(full).length === 0) {
        rmSync(full, { recursive: true, force: true });
        removed.push(`${path.relative(root, full)}/`);
      }
      continue;
    }
    if (!/\.(?:js|js\.map|d\.ts)$/.test(entry.name)) continue;
    const relative = path.relative(distDir, full);
    if (hasSource(relative)) continue;
    rmSync(full, { force: true });
    removed.push(path.relative(root, full));
  }
}

prune(distDir);

if (removed.length) {
  console.log(`[prune-dist] 删除 ${removed.length} 个无源文件的陈旧产物（例如 ${removed.slice(0, 3).join('、')}）`);
} else {
  console.log('[prune-dist] dist/ 与 src/ 一致，无需清理');
}

// 兜底自检：输出目录里是否还有孤儿产物（防止上面的判定写错而静默放过）
function findOrphans(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { count += findOrphans(full); continue; }
    if (!/\.js$/.test(entry.name)) continue;
    if (hasSource(path.relative(distDir, full))) continue;
    count += 1;
  }
  return count;
}
if (statSync(distDir).isDirectory() && findOrphans(distDir) > 0) {
  console.error('[prune-dist] 仍存在无源文件的 .js 产物，请检查清理逻辑');
  process.exit(1);
}
