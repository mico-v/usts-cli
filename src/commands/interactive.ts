/**
 * 交互式终端界面
 *
 * 启动后进入多级菜单：主菜单 -> 查询子菜单 -> 查询类型 -> 复刻网页查询表单 -> 输出结果。
 * 复用各命令函数与同一个 JwglClient；Cookie Jar、连接池和限流状态贯穿整个交互会话。
 */
import inquirer from 'inquirer';
import fs from 'node:fs';
import { JwglClient } from '../lib/client';
import { header, info, success, error } from '../lib/logger';
import { formatDuration } from '../lib/format';
import { AppError } from '../domain/errors';
import { SessionLookup } from '../domain/session';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { sessionProblemMessage, assertInteractiveTerminal } from './_shared';
import { scoresCommand } from './scores';
import { examsCommand } from './exams';
import { coursesCommand } from './courses';
import { scheduleCommand } from './schedule';
import { clschedCommand } from './clsched';
import { profileCommand } from './profile';
import { gpaCommand } from './gpa';
import { notificationsCommand } from './notifications';
import { academiaCommand } from './academia';
import { selectedCoursesCommand } from './selected-courses';
import { schedulePdfCommand, defaultSchedulePdfName } from './schedule-pdf';
import { academiaPdfCommand, DEFAULT_ACADEMIA_PDF_NAME } from './academia-pdf';
import { currentTerm } from '../domain/term';

type QueryType =
  | 'scores' | 'exams' | 'courses' | 'schedule' | 'clsched'
  | 'gpa' | 'notifications' | 'academia' | 'selected-courses'
  | 'schedule-pdf' | 'academia-pdf';

/** 学年下拉项：当前学年往前 5 年，显示 2025-2026 区间格式 */
function yearChoices(): { name: string; value: string }[] {
  const now = new Date().getFullYear();
  const out: { name: string; value: string }[] = [];
  for (let y = now; y >= now - 5; y--) out.push({ name: `${y}-${y + 1} 学年`, value: String(y) });
  return out;
}

const XQM_CHOICES = [
  { name: '第一学期（秋）', value: '3' },
  { name: '第二学期（春）', value: '12' },
  { name: '第三学期（小学期）', value: '16' },
];

const KCXZ_CHOICES = [
  { name: '全部', value: '' },
  { name: '必修课', value: '01' },
  { name: '选修课', value: '02' },
  { name: '限选课', value: '03' },
  { name: '任选课', value: '04' },
];

/** 复刻网页「学年/学期」查询表单 */
async function askTerm(defXnm: string, defXqm: string): Promise<{ xnm: string; xqm: string }> {
  const ans = await inquirer.prompt([
    { type: 'list', name: 'xnm', message: '选择学年', choices: yearChoices(), default: defXnm },
    { type: 'list', name: 'xqm', message: '选择学期', choices: XQM_CHOICES, default: defXqm },
  ]);
  return ans as { xnm: string; xqm: string };
}

/** 复刻网页「成绩查询」表单（在学年/学期基础上增加课程性质筛选） */
async function askScoreForm(defXnm: string, defXqm: string): Promise<{ xnm: string; xqm: string; kcxzdm: string }> {
  const ans = await inquirer.prompt([
    { type: 'list', name: 'xnm', message: '选择学年', choices: yearChoices(), default: defXnm },
    { type: 'list', name: 'xqm', message: '选择学期', choices: XQM_CHOICES, default: defXqm },
    { type: 'list', name: 'kcxzdm', message: '课程性质（筛选）', choices: KCXZ_CHOICES, default: '' },
  ]);
  return ans as { xnm: string; xqm: string; kcxzdm: string };
}

/** 主菜单上显示的本地会话状态。不发网络请求，因此即时可得；服务端是否有效由预检回答。 */
function sessionLabel(client: JwglClient): string {
  const local = client.localSession();
  if (!local.loggedIn) return '未登录';
  const parts = ['本地已保存会话'];
  if (local.username) parts.push(local.username);
  if (local.loginTime) parts.push(`登录于 ${formatDuration(Date.now() - local.loginTime.getTime())}前`);
  return parts.join(' · ');
}

/** 主菜单 */
async function mainMenu(client: JwglClient): Promise<string> {
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: `请选择操作（${sessionLabel(client)}）`,
    choices: [
      { name: '登录教务系统', value: 'login' },
      { name: '查询', value: 'query' },
      { name: '查看个人信息', value: 'profile' },
      { name: '退出登录（清除本地会话）', value: 'logout' },
      { name: '退出', value: 'exit' },
    ],
  }]);
  return action as string;
}

/**
 * 立刻在后台发起一次会话预检。
 *
 * 用户可能在选完菜单后直接「返回上级」而永远不 await 它，因此这里显式兜住拒绝：
 * 探测类失败本来就该按 fail-open 处理（交由业务请求兜底），不该冒出未处理的 rejection。
 */
function prefetchSession(client: JwglClient): Promise<SessionLookup> {
  return client.ensureValidSession().catch((): SessionLookup => 'unknown');
}

/**
 * 预检的等待点。
 *
 * 探针在用户选菜单时就已经发起（见 `interactiveShell`），因此在用户选完查询类型、
 * 填完表单之前通常已经就绪——这里的 `await` 几乎不花时间。目的是**提前**把
 * 「未登录」告诉用户，而不是等到最后一个命令执行时才报错。
 */
async function sessionReady(client: JwglClient, pending: Promise<SessionLookup>): Promise<boolean> {
  const problem = sessionProblemMessage(client, await pending);
  if (!problem) return true;
  console.error(error(problem));
  return false;
}

/** 查询类型子菜单 */
async function queryMenu(): Promise<QueryType | null> {
  const { type } = await inquirer.prompt([{
    type: 'list',
    name: 'type',
    message: '选择查询类型',
    choices: [
      { name: '学生成绩', value: 'scores' },
      { name: '考试安排', value: 'exams' },
      { name: '选课名单', value: 'courses' },
      { name: '个人课表', value: 'schedule' },
      { name: '班级课表', value: 'clsched' },
      { name: 'GPA / 学业成绩概览', value: 'gpa' },
      { name: '通知 / 待办', value: 'notifications' },
      { name: '学业情况', value: 'academia' },
      { name: '已选课程详情', value: 'selected-courses' },
      { name: '下载课表 PDF', value: 'schedule-pdf' },
      { name: '下载成绩总表 PDF', value: 'academia-pdf' },
      { name: '返回上级', value: '__back' },
    ],
  }]);
  return type === '__back' ? null : (type as QueryType);
}

/**
 * 询问输出文件名。
 *
 * 目标已存在时**当下**就问清是否覆盖，而不是让命令在最后一步报「文件已存在，
 * 请用 --force」——菜单里没有 --force，那种提示等于死路。
 */
async function askOutputPath(what: string, defaultName: string): Promise<{ output: string; force: boolean } | null> {
  const { output } = await inquirer.prompt([
    { type: 'input', name: 'output', message: `${what}输出文件名`, default: defaultName },
  ]);
  if (!fs.existsSync(output)) return { output, force: false };
  const { overwrite } = await inquirer.prompt([
    { type: 'confirm', name: 'overwrite', message: `${output} 已存在，覆盖吗？`, default: false },
  ]);
  return overwrite ? { output, force: true } : null;
}

/** 进入具体查询：展示表单 -> 执行查询命令 */
async function runQuery(type: QueryType, client: JwglClient): Promise<void> {
  const term = currentTerm();
  const def = { xnm: term.academicYear, xqm: term.semester };
  switch (type) {
    case 'scores': {
      const form = await askScoreForm(def.xnm, def.xqm);
      await scoresCommand(client, form);
      break;
    }
    case 'exams': {
      const form = await askTerm(def.xnm, def.xqm);
      await examsCommand(client, form);
      break;
    }
    case 'courses': {
      const form = await askTerm(def.xnm, def.xqm);
      await coursesCommand(client, form);
      break;
    }
    case 'schedule': {
      const form = await askTerm(def.xnm, def.xqm);
      await scheduleCommand(client, form);
      break;
    }
    case 'clsched': {
      await clschedCommand(client, {});
      break;
    }
    case 'gpa':
      await gpaCommand(client);
      break;
    case 'notifications':
      await notificationsCommand(client);
      break;
    case 'academia':
      await academiaCommand(client);
      break;
    case 'selected-courses': {
      const form = await askTerm(def.xnm, def.xqm);
      await selectedCoursesCommand(client, form);
      break;
    }
    case 'schedule-pdf': {
      const form = await askTerm(def.xnm, def.xqm);
      const choice = await askOutputPath('课表 PDF ', defaultSchedulePdfName(form.xnm, form.xqm));
      if (!choice) {
        console.log(info('已取消，未写入文件'));
        break;
      }
      await schedulePdfCommand(client, { ...form, ...choice });
      break;
    }
    case 'academia-pdf': {
      const choice = await askOutputPath('成绩总表 PDF ', DEFAULT_ACADEMIA_PDF_NAME);
      if (!choice) {
        console.log(info('已取消，未写入文件'));
        break;
      }
      await academiaPdfCommand(client, choice);
      break;
    }
    default: {
      // 穷举检查：将来往 QueryType 里加类型却忘了写 case，这里会编译失败
      const unimplemented: never = type;
      throw new AppError('CONFIGURATION_ERROR', `未实现的查询类型：${String(unimplemented)}`);
    }
  }
}

export async function interactiveShell(baseUrl: string): Promise<void> {
  // 先检查终端，再打印任何东西：没有 TTY 时应给出用法提示，而不是让 inquirer
  // 抛 ERR_USE_AFTER_CLOSE，并往 stdout 留下半截菜单/提示符。
  assertInteractiveTerminal('交互式菜单', '请直接使用子命令（例如 usts scores），完整列表见 usts --help');

  const client = new JwglClient(baseUrl);
  console.log(header('苏州科技大学教务系统 CLI'));
  console.log(info('用方向键选择，回车确认。首次使用请先「登录教务系统」。'));
  console.log(info(`会话：${sessionLabel(client)}。查询前会自动校验，失效时尝试自动重新登录。`));
  while (true) {
    let action: string;
    try {
      action = await mainMenu(client);
    } catch (e: any) {
      // 用户按 Ctrl+C 中断选择
      console.log();
      break;
    }

    if (action === 'exit') {
      console.log(success('再见'));
      break;
    }

    if (action === 'login') {
      await loginCommand(client);
      continue;
    }

    if (action === 'logout') {
      logoutCommand(client);
      continue;
    }

    if (action === 'profile') {
      // 先发起预检再进命令：与提示并行，且命令入口的 ensureSession 会复用同一次结果。
      const pending = prefetchSession(client);
      if (!(await sessionReady(client, pending))) continue;
      await profileCommand(client);
      continue;
    }

    if (action === 'query') {
      // 关键：用户还在选查询类型、填学年/学期表单时，探针（必要时还有自动重登）就已经
      // 在跑，不必等到最后一个命令执行才报「未登录」。ensure() 合并并发调用，不会多发请求。
      const pending = prefetchSession(client);
      const type = await queryMenu();
      if (!type) continue;
      if (!(await sessionReady(client, pending))) continue;
      try {
        await runQuery(type, client);
      } catch (e: any) {
        if (e?.message?.includes('interrupted')) break;
        console.error(error(e?.message || '查询中断'));
      }
      continue;
    }
  }
  // 交互会话允许在一次失败后继续操作，正常退出不继承中途命令的退出码。
  process.exitCode = 0;
}
