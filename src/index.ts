#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { JwglClient } from './lib/client';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { scoresCommand } from './commands/scores';
import { examsCommand } from './commands/exams';
import { coursesCommand } from './commands/courses';
import { profileCommand } from './commands/profile';
import { scheduleCommand } from './commands/schedule';
import { clschedCommand } from './commands/clsched';
import { gpaCommand } from './commands/gpa';
import { notificationsCommand } from './commands/notifications';
import { academiaCommand } from './commands/academia';
import { selectedCoursesCommand } from './commands/selected-courses';
import { schedulePdfCommand } from './commands/schedule-pdf';
import { academiaPdfCommand } from './commands/academia-pdf';
import { interactiveShell } from './commands/interactive';
import { HELP_TOPIC_INDEX, commandHelp, helpCommand } from './commands/help';
import { loadEnv } from './lib/env';
import { DEFAULT_BASE_URL, loadConfig } from './config/config';
import { legacySessionFilePath } from './config/paths';
import { error, warning } from './lib/logger';
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
  // 的详细文档（配置、会话、学期、输出契约、下载、排错）。见 commands/help.ts。
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

program
  .command('login')
  .description('登录教务系统（纯脚本 RSA + 双 POST 重试，无需浏览器；会话安全持久化）')
  .addHelpText('after', commandHelp('login'))
  .action(async () => {
    const client = new JwglClient(baseUrl);
    const ok = await loginCommand(client);
    if (ok) process.exitCode = 0;
    else if (!process.exitCode) process.exitCode = 1;
  });

program
  .command('logout')
  .description('退出登录（删除本地保存的会话）')
  .addHelpText('after', commandHelp('logout'))
  .action(() => {
    logoutCommand(new JwglClient(baseUrl));
  });

// 学期选项（成绩/考试/课表/选课名单共用）
function addTermOptions(cmd: Command): Command {
  return cmd
    .option('-y, --xnm <学年>', '学年，如 2025（缺省为当前学年）')
    .option('-t, --xqm <学期>', '学期：3=第一学期, 12=第二学期, 16=第三学期（缺省为当前学期）');
}

addTermOptions(
  program
    .command('scores')
    .description('查询学生成绩（课程/性质/学分/成绩/绩点/教师/开课学院）')
    .option('--kcxzdm <课程性质>', '按课程性质代码筛选')
    .addHelpText('after', commandHelp('scores'))
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await scoresCommand(client, opts);
    }),
);

addTermOptions(
  program
    .command('exams')
    .description('查询考试安排（课程/时间/地点/座位号/类型）')
    .addHelpText('after', commandHelp('exams'))
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await examsCommand(client, opts);
    }),
);

addTermOptions(
  program
    .command('courses')
    .description('查询选课名单（课程/课程代码/学分/教师/教学班）')
    .addHelpText('after', commandHelp('courses'))
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await coursesCommand(client, opts);
    }),
);

addTermOptions(
  program
    .command('schedule')
    .description('查询个人课表（按星期展示节次/教室/教师）')
    .addHelpText('after', commandHelp('schedule'))
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await scheduleCommand(client, opts);
    }),
);

addTermOptions(
  program
    .command('clsched')
    .description('查询班级课表（可按学院/专业/班级级联选择，可查任意班级）')
    .option('--xqh <校区>', '校区：id 或名称（默认石湖）')
    .option('--nj <年级>', '年级 id，如 2025')
    .option('--jg <学院>', '学院：id 或名称')
    .option('--zy <专业>', '专业：id 或名称')
    .option('--bh <班级>', '班级：名称或编号（如 测试班级）')
    .addHelpText('after', commandHelp('clsched'))
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await clschedCommand(client, opts);
    }),
);

program
  .command('profile')
  .description('查询个人信息（学号/姓名/学院/专业/班级/年级/手机等）')
  .addHelpText('after', commandHelp('profile'))
  .action(async () => {
    const client = new JwglClient(baseUrl);
    await profileCommand(client);
  });

program
  .command('gpa')
  .description('查询学业成绩概览（GPA/学分）')
  .option('--json', '以 JSON 输出')
  .addHelpText('after', commandHelp('gpa'))
  .action(async (opts) => {
    await gpaCommand(new JwglClient(baseUrl), opts);
  });

program
  .command('notifications')
  .description('查询首页通知和待办事项')
  .option('--json', '以 JSON 输出')
  .addHelpText('after', commandHelp('notifications'))
  .action(async (opts) => {
    await notificationsCommand(new JwglClient(baseUrl), opts);
  });

program
  .command('academia')
  .description('查询学业情况和课程分类概览')
  .option('--json', '以 JSON 输出')
  .option('--category <分类名>', '拉取指定分类的课程明细（如：思想政治类）')
  .addHelpText('after', commandHelp('academia'))
  .action(async (opts) => {
    await academiaCommand(new JwglClient(baseUrl), opts);
  });

addTermOptions(
  program
    .command('selected-courses')
    .description('查询已选课程详情（只读）')
    .option('--json', '以 JSON 输出')
    .addHelpText('after', commandHelp('selected-courses'))
    .action(async (opts) => {
      await selectedCoursesCommand(new JwglClient(baseUrl), opts);
    }),
);

addTermOptions(
  program
    .command('schedule-pdf')
    .description('下载个人课表 PDF（只读）')
    // 默认文件名由命令层决定（带学年的 schedule-<学年>-<学期>.pdf）：
    // 这里再写一个默认值会把命令里的兜底变成永远走不到的死代码。
    .option('-o, --output <文件>', '输出文件路径（缺省 schedule-<学年>-<学期>.pdf）')
    .option('--force', '覆盖已有文件')
    .addHelpText('after', commandHelp('schedule-pdf'))
    .action(async (opts) => {
      await schedulePdfCommand(new JwglClient(baseUrl), opts);
    }),
);

program
  .command('academia-pdf')
  .description('下载成绩总表 PDF（只读）')
  .option('-o, --output <文件>', '输出文件路径（缺省 transcript.pdf）')
  .option('--force', '覆盖已有文件')
  .addHelpText('after', commandHelp('academia-pdf'))
  .action(async (opts) => {
    await academiaPdfCommand(new JwglClient(baseUrl), opts);
  });

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
