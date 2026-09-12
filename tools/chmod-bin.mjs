#!/usr/bin/env node
/**
 * 给编译产物里的可执行入口补上执行位。
 *
 * 为什么需要它：`bin` 指向 `dist/index.js`，而 `tsc` 产出的是普通文件（0644）。
 * `npm link` / `npm install -g .` 对本地目录走的是**符号链接**安装——bin 直接指向
 * 仓库里的这个文件，npm 不会去改源文件的权限——于是命令报 `zsh: permission denied`。
 * （从 tarball 安装时 npm 会按包内容设置权限，所以只有链接安装会踩到。）
 *
 * 放在 build 之后而不是靠手工 chmod：任何一次 `rm -rf dist && npm run build`
 * 都会重置权限，靠人记着是不可靠的。
 */
import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');

if (!existsSync(entry)) {
  console.error(`[chmod-bin] 找不到 ${entry}，请先执行 tsc`);
  process.exit(1);
}

// Windows 上 chmod 基本是空操作（npm 会用 .cmd shim），因此失败也不当作构建失败。
try {
  chmodSync(entry, 0o755);
} catch (cause) {
  console.warn(`[chmod-bin] 无法设置执行位（可忽略）：${cause.message}`);
}
