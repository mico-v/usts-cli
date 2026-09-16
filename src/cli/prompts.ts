/**
 * 交互式表单片段（inquirer）
 *
 * 从 `interactive.ts` 抽出来：命令参数怎么问，属于命令自己的描述（见 `registry.ts`
 * 各 spec 的 `interactive`），而菜单驱动在 `interactive.ts`。两边都要用这些表单，
 * 放在这里可以避免注册表反向依赖菜单模块。
 *
 * 这些函数都需要真实终端；调用方负责先用 `assertInteractiveTerminal` 拦下非 TTY。
 */
import fs from 'node:fs';
import inquirer from 'inquirer';
import { currentTerm, Term } from '../domain/term';

/** 学年下拉项：当前学年往前 5 年，显示 2025-2026 区间格式 */
export function yearChoices(): { name: string; value: string }[] {
  const now = new Date().getFullYear();
  const out: { name: string; value: string }[] = [];
  for (let y = now; y >= now - 5; y--) out.push({ name: `${y}-${y + 1} 学年`, value: String(y) });
  return out;
}

export const XQM_CHOICES = [
  { name: '第一学期（秋）', value: '3' },
  { name: '第二学期（春）', value: '12' },
  { name: '第三学期（小学期）', value: '16' },
];

export const KCXZ_CHOICES = [
  { name: '全部', value: '' },
  { name: '必修课', value: '01' },
  { name: '选修课', value: '02' },
  { name: '限选课', value: '03' },
  { name: '任选课', value: '04' },
];

/** 表单的默认值：与网页一致地按当前日期推算学年/学期。 */
export function termDefaults(): Term {
  return currentTerm();
}

/** 复刻网页「学年/学期」查询表单 */
export async function askTerm(defXnm: string, defXqm: string): Promise<{ xnm: string; xqm: string }> {
  const ans = await inquirer.prompt([
    { type: 'list', name: 'xnm', message: '选择学年', choices: yearChoices(), default: defXnm },
    { type: 'list', name: 'xqm', message: '选择学期', choices: XQM_CHOICES, default: defXqm },
  ]);
  return ans as { xnm: string; xqm: string };
}

/** 复刻网页「成绩查询」表单（在学年/学期基础上增加课程性质筛选） */
export async function askScoreForm(defXnm: string, defXqm: string): Promise<{ xnm: string; xqm: string; kcxzdm: string }> {
  const ans = await inquirer.prompt([
    { type: 'list', name: 'xnm', message: '选择学年', choices: yearChoices(), default: defXnm },
    { type: 'list', name: 'xqm', message: '选择学期', choices: XQM_CHOICES, default: defXqm },
    { type: 'list', name: 'kcxzdm', message: '课程性质（筛选）', choices: KCXZ_CHOICES, default: '' },
  ]);
  return ans as { xnm: string; xqm: string; kcxzdm: string };
}

/**
 * 询问输出文件名。
 *
 * 目标已存在时**当下**就问清是否覆盖，而不是让命令在最后一步报「文件已存在，
 * 请用 --force」——菜单里没有 --force，那种提示等于死路。
 * 用户选择不覆盖时返回 `null`，由调用方决定怎么提示。
 */
export async function askOutputPath(what: string, defaultName: string): Promise<{ output: string; force: boolean } | null> {
  const { output } = await inquirer.prompt([
    { type: 'input', name: 'output', message: `${what}输出文件名`, default: defaultName },
  ]);
  if (!fs.existsSync(output)) return { output, force: false };
  const { overwrite } = await inquirer.prompt([
    { type: 'confirm', name: 'overwrite', message: `${output} 已存在，覆盖吗？`, default: false },
  ]);
  return overwrite ? { output, force: true } : null;
}
