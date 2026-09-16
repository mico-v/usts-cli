#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { createClient } from './cli/create-client';
import { ALL_SPECS } from './cli/registry';
import { interactiveShell } from './cli/interactive';
import { HELP_TOPIC_INDEX, helpCommand } from './cli/help';
import { loadEnv } from './config/env';
import { DEFAULT_BASE_URL, loadConfig } from './config/config';
import { legacySessionFilePath } from './config/paths';
import { error, warning } from './cli/logger';
import { errorMessage, exitCodeForError } from './domain/errors';

/** 版本号从包根目录的 package.json 读取，避免与 package.json 漂移。 */
function packageVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const version = (parsed as { version?: unknown }).version;
    return typeof version === 'string' ? version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 旧版 cwd/.session.json 自 ADR-0004 起不再被读取：该格式没有 origin 字段，
 * 从任意目录读取等于允许该目录向登录态注入 Cookie。这里只检测并提示，不代用户删除。
 */
function warnAboutLegacySession(): void {
  const legacy = legacySessionFilePath();
  if (!fs.existsSync(legacy)) return;
  console.error(warning(
    `检测到旧版会话文件 ${legacy}，出于安全考虑已不再读取。请删除该文件后重新运行 usts login。`,
  ));
}

// 配置在 main() 里加载：模块导入阶段不该有读 .env / 读磁盘的副作用。
let baseUrl = DEFAULT_BASE_URL;

const program = new Command();

program
  .name('usts')
  .description('苏州科技大学教务系统（正方 V9）命令行工具（只读查询）')
  // 关掉内置的 help 命令，换成自己实现的：除了命令帮助，还提供 `usts help <主题>`
  // 的详细文档（配置、会话、学期、输出契约、下载、排错）。见 cli/help.ts。
  .addHelpCommand(false)
  .addHelpText('after', `
  快速开始:
    1) usts login                首次使用先登录（会话保存到用户状态目录）
    2) usts scores               查询当前学期成绩
    3) usts profile              查看当前登录的个人信息

  通用学期参数（scores/exams/courses/schedule 等可用）:
    -y, --xnm <学年>   学年，如 2025
    -t, --xqm <学期>   3=第一学期, 12=第二学期, 16=第三学期
    缺省时自动取当前学期，详见: usts help term

  详细文档:
${HELP_TOPIC_INDEX}

  不带任何子命令运行 usts 会进入交互式菜单（需要真实终端）。

  更多用法见各命令的 --help，例如: usts scores --help`);

program
  .command('help [主题]')
  .description('查看详细文档（主题见 usts help，也可直接写命令名）')
  .action((topic: string | undefined) => {
    helpCommand(topic, program);
  });

// 学期选项（成绩/考试/课表/选课名单共用）
function addTermOptions(cmd: Command): Command {
  return cmd
    .option('-y, --xnm <学年>', '学年，如 2025（缺省为当前学年）')
    .option('-t, --xqm <学期>', '学期：3=第一学期, 12=第二学期, 16=第三学期（缺省为当前学期）');
}

// 命令注册：描述整张表都在 cli/registry.ts，这里只做 Commander 装配。
// 新增命令不需要动本文件，也不需要在别处补菜单项或帮助文本。
for (const spec of ALL_SPECS) {
  const command = program.command(spec.id).description(spec.summary);
  if (spec.term) addTermOptions(command);
  spec.options?.(command);
  if (spec.help) command.addHelpText('after', `\n${spec.help}`);
  command.action(async (opts) => {
    await spec.run(createClient(baseUrl), opts);
  });
}

// 无子命令时进入交互式终端；指定子命令（如 usts scores）则按原 CLI 模式运行
async function main(): Promise<void> {
  const env = loadEnv();
  if (env.rejected.length) {
    console.error(warning(
      `配置文件 ${env.path} 中的 ${env.rejected.join('、')} 已被忽略：放宽信任边界的开关只能来自真实环境变量，不能写在配置文件里。`,
    ));
  }
  const config = loadConfig();
  baseUrl = config.baseUrl;
  for (const message of config.warnings) console.error(warning(message));
  warnAboutLegacySession();
  program.version(packageVersion());
  if (process.argv.length <= 2) await interactiveShell(baseUrl);
  else await program.parseAsync(process.argv);
}

void main().catch((cause) => {
  process.exitCode = exitCodeForError(cause);
  console.error(error(errorMessage(cause, '程序异常退出')));
});
