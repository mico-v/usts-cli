/**
 * 班级课表用例（bjkbdy，2026-08 抓包实测）
 *
 * 复刻网页「班级课表查询」的选单语义：把用户给的 id/名称解析成一条
 * `ClassScheduleQuery`，再把课表按星期分组。
 *
 * 交互式级联（inquirer）在 `cli/clsched-cascade.ts`——那是终端交互，不属于用例；
 * 但它与本模块的 flags 解析共用 `pickOption` / `toClassQuery`，两条路径不会漂移。
 */
import { ClassScheduleItem, ClassScheduleQuery, ClassScheduleView as ClassScheduleOptions, SelectOption } from '../../types/schedule';
import { AppError } from '../../domain/errors';
import { currentTerm } from '../../domain/term';
import { ClassScheduleGateway } from '../ports/jwgl-gateway';

/** 班级课表必须落到具体学期；缺省时用当前学期（与个人课表行为一致）。 */
export function concreteTerm(term: { xnm: string; xqm: string }): { xnm: string; xqm: string } {
  return { xnm: term.xnm, xqm: term.xqm || currentTerm().semester };
}

/** 按 id / 全名 / 附加键（如班级编号 `bh`）/ 名称子串 匹配下拉选项。 */
export function pickOption(value: string | undefined, list: SelectOption[], extraKeys: string[] = []): SelectOption | null {
  if (!value) return null;
  const v = value.trim();
  return (
    list.find((o) => o.value === v) ||
    list.find((o) => o.label === v) ||
    list.find((o) => extraKeys.some((k) => o.meta?.[k] === v)) ||
    list.find((o) => o.label.includes(v)) ||
    null
  );
}

function requireOption(label: string, value: string, list: SelectOption[], extraKeys: string[] = []): SelectOption {
  const found = pickOption(value, list, extraKeys);
  if (!found) throw new AppError('CONFIGURATION_ERROR', `未找到${label}：${value}`);
  return found;
}

/** 年级 id → 年级名。必须是下拉里的显示文本，不能拿 `njdm_id` 的值充当。 */
export function gradeLabel(gradeId: string, options: ClassScheduleOptions): string {
  return options.grades.find((o) => o.value === gradeId)?.label || gradeId;
}

/** 级联/标志解析的公共结果：一条完整的班级选择。 */
export interface ClassSelection {
  xnm: string;
  xqm: string;
  college: SelectOption;
  major: SelectOption;
  cls: SelectOption;
  /** 校区 id（未指定时取网页默认） */
  campusId: string;
  gradeId: string;
  gradeName: string;
}

/** 班级选择 → 查询参数（两条解析路径共用，避免 `bh`/`njmc` 这类易错字段各写一遍）。 */
export function toClassQuery(selection: ClassSelection): ClassScheduleQuery {
  return {
    xnm: selection.xnm,
    xqm: selection.xqm,
    xqhId: selection.campusId,
    njdmId: selection.gradeId,
    zyhId: selection.major.value,
    bhId: selection.cls.value,
    bh: String(selection.cls.meta?.bh || ''),
    bj: selection.cls.label,
    zymc: selection.major.label,
    jgmc: selection.college.label,
    njmc: selection.gradeName,
  };
}

/** 按 `--jg/--zy/--bh` 解析班级。缺参数或匹配不到时抛 `AppError`（命令层统一上报）。 */
export async function resolveClassQueryByFlags(
  client: ClassScheduleGateway,
  options: ClassScheduleOptions,
  flags: { xqh?: string; nj?: string; jg?: string; zy?: string; bh?: string },
  term: { xnm: string; xqm: string },
): Promise<ClassScheduleQuery> {
  if (!flags.jg) {
    throw new AppError('CONFIGURATION_ERROR', '请用 --jg 指定学院，或去掉 --bh 走交互式选择');
  }
  const college = requireOption('学院', flags.jg, options.colleges);
  const campus = flags.xqh ? requireOption('校区', flags.xqh, options.campuses) : null;
  const gradeId = flags.nj || options.defaultGrade || '';
  if (!flags.zy) throw new AppError('CONFIGURATION_ERROR', '请用 --zy 指定专业');

  const majors = await client.getMajorsByCollege(college.value);
  const major = requireOption('专业', flags.zy, majors, ['zyh']);
  const classes = await client.getClassesByMajor(college.value, major.value, gradeId);
  const cls = requireOption('班级', flags.bh || '', classes, ['bh']);

  return toClassQuery({
    xnm: term.xnm,
    xqm: term.xqm,
    college,
    major,
    cls,
    campusId: campus ? campus.value : options.defaultCampus || '',
    gradeId,
    gradeName: gradeLabel(gradeId, options),
  });
}

export interface ClassScheduleDay {
  /** 1=周一 … 7=周日 */
  day: number;
  items: ClassScheduleItem[];
}

export interface ClassTimetable {
  days: ClassScheduleDay[];
  untimed: ClassScheduleItem[];
  /** 实践课（远端单独给出，没有节次与教室） */
  practice: string[];
  /** 有固定节次 + 无固定节次的课程总数 */
  courseCount: number;
}

export async function readClassSchedule(
  client: ClassScheduleGateway,
  query: ClassScheduleQuery,
): Promise<ClassTimetable> {
  const { items, practice } = await client.queryClassSchedule(query);
  const timed = items
    .filter((item) => item.weekday && item.startSection)
    .sort((a, b) => a.weekday! - b.weekday! || a.startSection! - b.startSection!);
  const days: ClassScheduleDay[] = [];
  for (let day = 1; day <= 7; day++) {
    const today = timed.filter((item) => item.weekday === day);
    if (today.length) days.push({ day, items: today });
  }
  const untimed = items.filter((item) => !(item.weekday && item.startSection));
  return { days, untimed, practice, courseCount: timed.length + untimed.length };
}
