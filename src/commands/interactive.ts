/**
 * 交互式终端界面
 *
 * 启动后进入多级菜单：主菜单 -> 查询子菜单 -> 查询类型 -> 复刻网页查询表单 -> 输出结果。
 * 复用各命令函数与 JwglClient，会话按需在每次操作时重建（均从 .session.json 恢复）。
 */
import inquirer from 'inquirer';
import { JwglClient } from '../lib/client';
import { header, info, success, error, warning } from '../lib/logger';
import { loginCommand } from './login';
import { scoresCommand } from './scores';
import { examsCommand } from './exams';
import { coursesCommand } from './courses';
import { scheduleCommand } from './schedule';
import { clschedCommand } from './clsched';
import { profileCommand } from './profile';

type QueryType = 'scores' | 'exams' | 'courses' | 'schedule' | 'clsched';

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

/** 主菜单 */
async function mainMenu(): Promise<string> {
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: '请选择操作',
    choices: [
      { name: '登录教务系统', value: 'login' },
      { name: '查询', value: 'query' },
      { name: '查看个人信息', value: 'profile' },
      { name: '退出', value: 'exit' },
    ],
  }]);
  return action as string;
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
      { name: '返回上级', value: '__back' },
    ],
  }]);
  return type === '__back' ? null : (type as QueryType);
}

/** 进入具体查询：展示表单 -> 执行查询命令 */
async function runQuery(type: QueryType, baseUrl: string): Promise<void> {
  const def = JwglClient.currentTerm();
  const client = new JwglClient(baseUrl);
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
  }
}

export async function interactiveShell(baseUrl: string): Promise<void> {
  console.log(header('苏州科技大学教务系统 CLI'));
  console.log(info('用方向键选择，回车确认。首次使用请先「登录教务系统」。'));
  while (true) {
    let action: string;
    try {
      action = await mainMenu();
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
      await loginCommand(new JwglClient(baseUrl));
      continue;
    }

    if (action === 'profile') {
      await profileCommand(new JwglClient(baseUrl));
      continue;
    }

    if (action === 'query') {
      const type = await queryMenu();
      if (!type) continue;
      try {
        await runQuery(type, baseUrl);
      } catch (e: any) {
        if (e?.message?.includes('interrupted')) break;
        console.error(error(e?.message || '查询中断'));
      }
      continue;
    }
  }
}
