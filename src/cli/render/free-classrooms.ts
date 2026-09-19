import { header, info, success } from '../logger';
import { printTable } from '../format';
import { FreeClassroom } from '../../types/facilities';
import { termLabel } from '../../domain/term';
import { FreeClassroomsCriteria, FreeClassroomsView } from '../../application/usecases/free-classrooms';

const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

/** 时段条件的一句话描述；未指定任何时段时返回空串。 */
function describeTimeSlot(criteria: FreeClassroomsCriteria): string {
  const parts: string[] = [];
  if (criteria.weeks.length) parts.push(`第 ${criteria.weeks.join('/')} 周`);
  if (criteria.weekdays.length) parts.push(`周${criteria.weekdays.map((day) => WEEKDAY_NAMES[day - 1]).join('/')}`);
  if (criteria.sections.length) parts.push(`第 ${criteria.sections.join('/')} 节`);
  return parts.join(' · ');
}

/** 名称/设施筛选的一句话描述；未做此类筛选时返回空串。 */
function describeFilters(criteria: FreeClassroomsCriteria): string {
  const parts: string[] = [];
  if (criteria.campus) parts.push(`校区含「${criteria.campus}」`);
  if (criteria.type) parts.push(`类别含「${criteria.type}」`);
  if (criteria.building) parts.push(`楼号含「${criteria.building}」`);
  if (criteria.name) parts.push(`名称含「${criteria.name}」`);
  if (criteria.minSeats !== undefined) parts.push(`座位 ≥ ${criteria.minSeats}`);
  return parts.join(' · ');
}

export function renderFreeClassrooms(
  view: FreeClassroomsView,
  term: { xnm: string; xqm: string },
  limit: number,
): void {
  const { criteria } = view;
  const slot = describeTimeSlot(criteria);
  console.log(header(
    ['空闲教室', termLabel(term.xnm, term.xqm), slot, describeFilters(criteria)].filter(Boolean).join('   '),
  ));

  if (!slot) {
    console.log(info('未指定时段：下面是该学期全部场地。要查某时段空闲的教室，加 --week/--weekday/--section'));
  }
  if (!view.items.length) {
    console.log(info(view.total
      ? `该时段有 ${view.total} 间场地空闲，但没有一间符合上面的名称/座位条件`
      : '没有符合条件的场地'));
    return;
  }

  const shown = limit > 0 ? view.items.slice(0, limit) : view.items;
  printTable(
    ['场地', '编号', '校区', '类别', '楼号', '座位', '可借用'],
    shown.map((room: FreeClassroom) => [
      room.name,
      room.code,
      room.campus,
      room.category,
      room.building,
      room.seats?.toString(),
      room.borrowable,
    ]),
    { maxColWidth: 22 },
  );
  console.log(success(
    `共 ${view.items.length} 间场地` +
    (shown.length < view.items.length ? `，已显示前 ${shown.length} 间（--limit 调整，0 = 全部）` : ''),
  ));
}
