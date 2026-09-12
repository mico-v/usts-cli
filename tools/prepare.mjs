#!/usr/bin/env node
/**
 * npm 的 `prepare` 钩子：`npm link` / 从 git 安装时自动编译，免得 bin 指向一个
 * 不存在或过期的 `dist/`。
 *
 * 为什么不能简单写 `"prepare": "npm run build"`：npm 11 实测 **`npm install --omit=dev`
 * 同样会运行 prepare**，而那时没有 typescript（它在本项目是 devDependency），
 * 构建失败会让整个安装失败。而 `--omit=dev` 是本项目文档支持的用法
 * （登录不需要 puppeteer，也不需要编译产物之外的东西）。所以先探测、缺了就跳过。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require.resolve('typescript');
} catch {
  console.log('prepare: 未安装 typescript（--omit=dev 安装），跳过构建');
  process.exit(0);
}

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
