/**
 * 班级课表查询命令（bjkbdy，2026-08 抓包实测）
 *
 * 复刻网页「班级课表查询」的级联选单：校区 → 年级 → 学院 → 专业 → 班级，
 * 可查询任意专业、任意班级的课表。
 *
 * 用法：
 *   usts clsched                          # 交互式级联选择
 *   usts clsched -y 2026 -t 3 --jg 204 --zy 0107 --bh 测试班级
 */
import inquirer from 'inquirer';
import { JwglClient } from '../lib/client';
import { ClassScheduleQuery, ClassScheduleView, SelectOption } from '../types/api';
import { header, info, error, success } from '../lib/logger';
import { ensureSession, resolveTerm, termLabel } from './_shared';

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const XQM_CHOICES = [
  { name: '第一学期（秋）', value: '3' },
  { name: '第二学期（春）', value: '12' },
  { name: '第三学期（小学期）', value: '16' },
];

function yearChoices(defXnm: string): { name: string; value: string }[] {
  const def = Number(defXnm);
  const out: { name: string; value: string }[] = [];
  for (let y = def - 1; y <= def + 5; y++) out.push({ name: `${y}-${y + 1} 学年`, value: String(y) });
  return out;
}

/** 按 id / 全名 / 附加键（如班级编号 bh）/ 名称子串 匹配下拉选项 */
function pick(opt: string | undefined, list: SelectOption[], extraKeys: string[] = []): SelectOption | null {
  if (!opt) return null;
  const v = opt.trim();
  return (
    list.find((o) => o.value === v) ||
    list.find((o) => o.label === v) ||
    list.find((o) => extraKeys.some((k) => o.meta?.[k] === v)) ||
    list.find((o) => o.label.includes(v)) ||
    null
  );
}

/** 交互式：复刻网页级联选单 */
async function interactiveCascade(
  client: JwglClient,
  view: ClassScheduleView,
  defXnm: string,
  defXqm: string,
): Promise<ClassScheduleQuery | null> {
  const t = await inquirer.prompt([
    { type: 'list', name: 'xnm', message: '选择学年', choices: yearChoices(defXnm), default: defXnm },
    { type: 'list', name: 'xqm', message: '选择学期', choices: XQM_CHOICES, default: defXqm },
    { type: 'list', name: 'campus', message: '选择校区', choices: view.campuses.map((o) => ({ name: o.label, value: o.value })), default: view.defaultCampus || view.campuses[0]?.value },
    { type: 'list', name: 'grade', message: '选择年级', choices: view.grades.map((o) => ({ name: o.label, value: o.value })), default: view.defaultGrade || view.grades[0]?.value },
    { type: 'list', name: 'college', message: '选择学院', choices: view.colleges.map((o) => ({ name: o.label, value: o.value })) },
  ]);
  const college = view.colleges.find((o) => o.value === t.college);
  if (!college) return null;

  const majors = await client.getMajorsByCollege(t.college);
  if (!majors.length) {
    console.error(error('该学院暂无专业'));
    return null;
  }
  const m = await inquirer.prompt([{ type: 'list', name: 'v', message: '选择专业', choices: majors.map((o) => ({ name: o.label, value: o.value })) }]);
  const major = majors.find((o) => o.value === m.v);
  if (!major) return null;

  const classes = await client.getClassesByMajor(t.college, m.v, t.grade);
  if (!classes.length) {
    console.error(error('该专业该年级暂无班级'));
    return null;
  }
  const c = await inquirer.prompt([{ type: 'list', name: 'v', message: '选择班级', choices: classes.map((o) => ({ name: o.label, value: o.value })) }]);
  const cls = classes.find((o) => o.value === c.v);
  if (!cls) return null;

  return {
    xnm: t.xnm, xqm: t.xqm,
    xqhId: t.campus, njdmId: t.grade, jgId: t.college, zyhId: m.v, bhId: cls.value,
    bh: cls.meta?.bh || '', bj: cls.label, zymc: major.label, jgmc: college.label, njmc: t.grade,
  };
}

/** CLI 模式：按标志解析 学院→专业→班级 */
async function resolveByFlags(
  client: JwglClient,
  view: ClassScheduleView,
  opts: { xnm?: string; xqm?: string; xqh?: string; nj?: string; jg?: string; zy?: string; bh?: string },
  xnm: string,
  xqm: string,
): Promise<ClassScheduleQuery | null> {
  const college = opts.jg ? pick(opts.jg, view.colleges) : null;
  if (opts.jg && !college) {
    console.error(error(`未找到学院：${opts.jg}`));
    return null;
  }
  if (!college) {
    console.error(error('请用 --jg 指定学院，或去掉 --bh 走交互式选择'));
    return null;
  }
  const campus = opts.xqh ? pick(opts.xqh, view.campuses) : null;
  if (opts.xqh && !campus) {
    console.error(error(`未找到校区：${opts.xqh}`));
    return null;
  }
  const nj = opts.nj || view.defaultGrade || '';
  const majors = await client.getMajorsByCollege(college.value);
  const major = opts.zy ? pick(opts.zy, majors, ['zyh']) : null;
  if (opts.zy && !major) {
    console.error(error(`未找到专业：${opts.zy}`));
    return null;
  }
  if (!major) {
    console.error(error('请用 --zy 指定专业'));
    return null;
  }
  const classes = await client.getClassesByMajor(college.value, major.value, nj);
  const cls = pick(opts.bh, classes, ['bh']);
  if (!cls) {
    console.error(error(`未找到班级：${opts.bh}`));
    return null;
  }
  return {
    xnm, xqm,
    xqhId: campus ? campus.value : view.defaultCampus || '',
    njdmId: nj, jgId: college.value, zyhId: major.value, bhId: cls.value,
    bh: cls.meta?.bh || '', bj: cls.label, zymc: major.label, jgmc: college.label, njmc: nj,
  };
}

export async function clschedCommand(
  client: JwglClient,
  opts: { xnm?: string; xqm?: string; xqh?: string; nj?: string; jg?: string; zy?: string; bh?: string },
): Promise<void> {
  if (!(await ensureSession(client))) return;
  const term = resolveTerm(opts);
  const xnm = term.xnm;
  const xqm = term.xqm || JwglClient.currentTerm().xqm; // 课表必须落到具体学期

  let view: ClassScheduleView;
  try {
    view = await client.getBjkbdyOptions();
  } catch (e: any) {
    console.error(error(e?.message || '解析班级课表选项失败'));
    return;
  }
  if (!view.colleges.length) {
    console.error(error('未解析到学院列表，班级课表暂不可用'));
    return;
  }

  const q = opts.bh ? await resolveByFlags(client, view, opts, xnm, xqm) : await interactiveCascade(client, view, xnm, xqm);
  if (!q) return;

  console.log(header(`班级课表查询   ${q.bj} · ${termLabel(xnm, xqm)}`));
  try {
    const { items, practice } = await client.queryClassSchedule(q);
    if (!items.length && !practice.length) {
      console.log(info('该班级暂无课表记录'));
      return;
    }
    const timed = items.filter((i) => i.weekday && i.startSection).sort((a, b) => a.weekday! - b.weekday! || a.startSection! - b.startSection!);
    const untimed = items.filter((i) => !(i.weekday && i.startSection));
    for (let d = 1; d <= 7; d++) {
      const today = timed.filter((i) => i.weekday === d);
      if (!today.length) continue;
      console.log(header(DAYS[d - 1]));
      for (const c of today) {
        const sec = c.startSection === c.endSection ? `${c.startSection}` : `${c.startSection}~${c.endSection}`;
        console.log(
          `  ${sec}节  ${c.courseName}  @ ${c.room || '?'}  ${c.teacher || ''}${c.teacherTitle ? '(' + c.teacherTitle + ')' : ''}  ${c.weeks || ''}` +
          (c.credit != null ? `  学分:${c.credit}` : ''),
        );
      }
    }
    if (untimed.length) {
      console.log(header('其他课程（无固定时间）'));
      for (const c of untimed) console.log(`  ${c.courseName}  @ ${c.room || '?'}  ${c.teacher || ''}  ${c.weeks || ''}`);
    }
    for (const p of practice) console.log(info(`实践课：${p}`));
    console.log(success(`共 ${timed.length + untimed.length} 门课` + (practice.length ? ` · ${practice.length} 门实践课` : '')));
  } catch (e: any) {
    console.error(error(e?.message || '查询失败'));
  }
}
