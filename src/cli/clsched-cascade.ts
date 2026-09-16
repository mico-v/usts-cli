/**
 * 班级课表的交互式级联选择（校区 → 年级 → 学院 → 专业 → 班级）
 *
 * 这是**终端交互**，所以留在 CLI 层；它产出的 `ClassScheduleQuery` 与 `--jg/--zy/--bh`
 * 那条路径共用一个构造函数（`application/usecases/class-schedule.ts` 的 `toClassQuery`），
 * 两条路不会各自漂移。
 */
import inquirer from 'inquirer';
import { ClassScheduleGateway } from '../application/ports/jwgl-gateway';
import { ClassScheduleQuery, ClassScheduleView } from '../types/schedule';
import { AppError } from '../domain/errors';
import { gradeLabel, pickOption, toClassQuery } from '../application/usecases/class-schedule';
import { XQM_CHOICES } from './prompts';

/** 班级课表的学年下拉以「解析出的学年」为中心（前后各若干年），与查询表单不同。 */
function yearChoices(defXnm: string): { name: string; value: string }[] {
  const def = Number(defXnm);
  const out: { name: string; value: string }[] = [];
  for (let y = def - 1; y <= def + 5; y++) out.push({ name: `${y}-${y + 1} 学年`, value: String(y) });
  return out;
}

export async function interactiveCascade(
  client: ClassScheduleGateway,
  options: ClassScheduleView,
  term: { xnm: string; xqm: string },
): Promise<ClassScheduleQuery> {
  const picked = await inquirer.prompt([
    { type: 'list', name: 'xnm', message: '选择学年', choices: yearChoices(term.xnm), default: term.xnm },
    { type: 'list', name: 'xqm', message: '选择学期', choices: XQM_CHOICES, default: term.xqm },
    {
      type: 'list', name: 'campus', message: '选择校区',
      choices: options.campuses.map((o) => ({ name: o.label, value: o.value })),
      default: options.defaultCampus || options.campuses[0]?.value,
    },
    {
      type: 'list', name: 'grade', message: '选择年级',
      choices: options.grades.map((o) => ({ name: o.label, value: o.value })),
      default: options.defaultGrade || options.grades[0]?.value,
    },
    { type: 'list', name: 'college', message: '选择学院', choices: options.colleges.map((o) => ({ name: o.label, value: o.value })) },
  ]);

  const college = pickOption(picked.college, options.colleges);
  if (!college) throw new AppError('CONFIGURATION_ERROR', `未找到学院：${picked.college}`);

  const majors = await client.getMajorsByCollege(picked.college);
  if (!majors.length) throw new AppError('REMOTE_SERVER_ERROR', '该学院暂无专业');
  const chosenMajor = await inquirer.prompt([
    { type: 'list', name: 'v', message: '选择专业', choices: majors.map((o) => ({ name: o.label, value: o.value })) },
  ]);
  const major = pickOption(chosenMajor.v, majors);
  if (!major) throw new AppError('CONFIGURATION_ERROR', `未找到专业：${chosenMajor.v}`);

  const classes = await client.getClassesByMajor(picked.college, major.value, picked.grade);
  if (!classes.length) throw new AppError('REMOTE_SERVER_ERROR', '该专业该年级暂无班级');
  const chosenClass = await inquirer.prompt([
    { type: 'list', name: 'v', message: '选择班级', choices: classes.map((o) => ({ name: o.label, value: o.value })) },
  ]);
  const cls = pickOption(chosenClass.v, classes);
  if (!cls) throw new AppError('CONFIGURATION_ERROR', `未找到班级：${chosenClass.v}`);

  return toClassQuery({
    xnm: picked.xnm,
    xqm: picked.xqm,
    college,
    major,
    cls,
    campusId: picked.campus,
    gradeId: picked.grade,
    gradeName: gradeLabel(picked.grade, options),
  });
}
