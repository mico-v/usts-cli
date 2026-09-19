import { header, info, success } from '../logger';
import { printTable } from '../format';
import { CascadeSelection } from '../../application/usecases/cascade';
import { MinorScheduleView } from '../../application/usecases/minor-schedule';
import { termLabel } from '../../domain/term';

/** 班级范围描述；三个维度都没解析到时给出「全部」。 */
function describeScope(scope: CascadeSelection): string {
  const parts = [scope.college?.label, scope.grade?.label, scope.major?.label].filter(Boolean);
  return parts.join(' · ') || '全部';
}

export function renderMinorSchedule(view: MinorScheduleView, term: { xnm: string; xqm: string }): void {
  console.log(header(
    `${view.kind.name}课表   ${termLabel(term.xnm, term.xqm)}   ${describeScope(view.scope)}`,
  ));
  if (!view.entries.length) {
    // 提示要跟着**当前**状态走：已经在按范围过滤时说「用 --college 指定范围」等于让人原地打转。
    console.log(info(view.scoped
      ? `该学期没有匹配的${view.kind.name}课表。可去掉 --college/--major/--grade 放宽范围`
      : `该学期没有${view.kind.name}课表记录`));
    return;
  }
  printTable(
    ['学院', '年级', '专业', '课表名称'],
    view.entries.map((entry) => [entry.college, entry.grade, entry.major, entry.name]),
    { maxColWidth: 30 },
  );
  console.log(success(`共 ${view.entries.length} 张${view.kind.name}课表`));
}
