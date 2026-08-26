#!/usr/bin/env node
import { Command } from 'commander';
import { JwglClient } from './lib/client';
import { loginCommand } from './commands/login';
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
import { loadEnv } from './lib/env';
import { DEFAULT_BASE_URL, loadConfig } from './config/config';
import { error, warning } from './lib/logger';
import { errorMessage, exitCodeForError } from './domain/errors';

loadEnv();
let baseUrl = DEFAULT_BASE_URL;
let startupError: unknown;
let startupWarnings: string[] = [];
try {
  const config = loadConfig();
  baseUrl = config.baseUrl;
  startupWarnings = config.warnings;
} catch (cause) {
  startupError = cause;
}

const program = new Command();

program
  .name('usts')
  .description('苏州科技大学教务系统（正方 V9）命令行工具')
  .version('1.0.0')
  .addHelpText('after', `
  快速开始:
    1) usts login                首次使用先登录（会话保存到用户状态目录）
    2) usts scores               查询当前学期成绩
    3) usts profile              查看当前登录的个人信息

  通用学期参数（scores/exams/courses/schedule 可用）:
    -y, --xnm <学年>   学年，如 2025
    -t, --xqm <学期>   3=第一学期, 12=第二学期, 16=第三学期
    缺省时自动取当前学期（8月~次年1月为第一学期；2~7月为第二学期）。

  更多用法见各命令的 --help，例如: usts scores --help`);

program
  .command('login')
  .description('登录教务系统（纯脚本 RSA + 双 POST 重试，无需浏览器；会话安全持久化）')
  .addHelpText('after', `
  示例:
    usts login                  自动用 .env 中的 USTS_USERNAME/USTS_PASSWORD 登录
    usts login                  若 .env 未配置，则交互式输入学号与密码
  说明:
    登录成功后会话会保存到用户状态目录，后续查询命令可免登录直接使用。
    也可通过环境变量 USTS_COOKIES 直接注入浏览器复制的会话 Cookie 跳过登录。`)
  .action(async () => {
    const client = new JwglClient(baseUrl);
    const ok = await loginCommand(client);
    if (ok) process.exitCode = 0;
    else if (!process.exitCode) process.exitCode = 1;
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
    .addHelpText('after', `
  示例:
    usts scores                 查询当前学期成绩
    usts scores -y 2025 -t 3    查询 2025 学年第一学期成绩`)
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await scoresCommand(client, opts);
    }),
);

addTermOptions(
  program
    .command('exams')
    .description('查询考试安排（课程/时间/地点/座位号/类型）')
    .addHelpText('after', `
  示例:
    usts exams                  查询当前学期考试安排
    usts exams -y 2025 -t 3     查询 2025 学年第一学期考试安排`)
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await examsCommand(client, opts);
    }),
);

addTermOptions(
  program
    .command('courses')
    .description('查询选课名单（课程/课程代码/学分/教师/教学班）')
    .addHelpText('after', `
  示例:
    usts courses                查询当前学期选课名单
    usts courses -y 2025 -t 12  查询 2025 学年第二学期选课名单`)
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await coursesCommand(client, opts);
    }),
);

addTermOptions(
  program
    .command('schedule')
    .description('查询个人课表（按星期展示节次/教室/教师）')
    .addHelpText('after', `
  示例:
    usts schedule               查询当前学期课表
    usts schedule -y 2025 -t 3  查询 2025 学年第一学期课表
  说明:
    课表由教务系统前端 JS 动态渲染，本校暂以兜底解析；若返回空请稍后重试或显式指定 -y/-t。`)
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
    .addHelpText('after', `
  示例:
    usts clsched                           交互式级联选择 学院→专业→班级
    usts clsched -y 2026 -t 3 --jg 204 --zy 0107 --bh 测试班级
    usts clsched --jg 电子 --zy 计算机 --bh 2512`)
    .action(async (opts) => {
      const client = new JwglClient(baseUrl);
      await clschedCommand(client, opts);
    }),
);

program
  .command('profile')
  .description('查询个人信息（学号/姓名/学院/专业/班级/年级/手机等）')
  .addHelpText('after', `
  示例:
    usts profile                查询当前登录用户的个人信息`)
  .action(async () => {
    const client = new JwglClient(baseUrl);
    await profileCommand(client);
  });

program
  .command('gpa')
  .description('查询学业成绩概览（GPA/学分）')
  .option('--json', '以 JSON 输出')
  .action(async (opts) => {
    await gpaCommand(new JwglClient(baseUrl), opts);
  });

program
  .command('notifications')
  .description('查询首页通知和待办事项')
  .option('--json', '以 JSON 输出')
  .action(async (opts) => {
    await notificationsCommand(new JwglClient(baseUrl), opts);
  });

program
  .command('academia')
  .description('查询学业情况和课程分类概览')
  .option('--json', '以 JSON 输出')
  .option('--category <分类名>', '拉取指定分类的课程明细（如：思想政治类）')
  .addHelpText('after', `
  示例:
    usts academia                      学业概况（GPA/统计/分类学分）
    usts academia --category 思想政治类   查看该分类下的课程明细
    usts academia --json               机器可读输出`)
  .action(async (opts) => {
    await academiaCommand(new JwglClient(baseUrl), opts);
  });

addTermOptions(
  program
    .command('selected-courses')
    .description('查询已选课程详情（只读）')
    .option('--json', '以 JSON 输出')
    .action(async (opts) => {
      await selectedCoursesCommand(new JwglClient(baseUrl), opts);
    }),
);

addTermOptions(
  program
    .command('schedule-pdf')
    .description('下载个人课表 PDF（只读）')
    .option('-o, --output <文件>', '输出文件路径', 'schedule.pdf')
    .option('--force', '覆盖已有文件')
    .action(async (opts) => {
      await schedulePdfCommand(new JwglClient(baseUrl), opts);
    }),
);

program
  .command('academia-pdf')
  .description('下载成绩总表 PDF（只读）')
  .option('-o, --output <文件>', '输出文件路径', 'transcript.pdf')
  .option('--force', '覆盖已有文件')
  .action(async (opts) => {
    await academiaPdfCommand(new JwglClient(baseUrl), opts);
  });

// 无子命令时进入交互式终端；指定子命令（如 usts scores）则按原 CLI 模式运行
async function main(): Promise<void> {
  if (startupError) throw startupError;
  for (const message of startupWarnings) console.error(warning(message));
  if (process.argv.length <= 2) await interactiveShell(baseUrl);
  else await program.parseAsync(process.argv);
}

void main().catch((cause) => {
  process.exitCode = exitCodeForError(cause);
  console.error(error(errorMessage(cause, '程序异常退出')));
});
