/**
 * 个人课表用例
 *
 * 「哪些课有固定节次、按星期怎么分组、同一天按什么顺序」是业务规则，放在这里；
 * 终端怎么画由 `cli/render/schedule.ts` 决定，因此这里只返回分组后的数据。
 */
import { ScheduleItem } from '../../types/schedule';
import { ScheduleGateway } from '../ports/jwgl-gateway';

export interface ScheduleDay {
  /** 1=周一 … 7=周日 */
  day: number;
  items: ScheduleItem[];
}

export interface ScheduleView {
  /** 有固定节次的课程，按星期分组（空星期不出现），组内按起始节次排序 */
  days: ScheduleDay[];
  /** 无固定节次的课程（实践课、MOOC 等） */
  untimed: ScheduleItem[];
  total: number;
}

/** 有具体排课时间：`weekday` 与 `startSection` 都有值。 */
export function hasFixedSlot(item: ScheduleItem): boolean {
  return Boolean(item.weekday && item.startSection);
}

export async function readSchedule(
  client: ScheduleGateway,
  term: { xnm: string; xqm: string },
): Promise<ScheduleView> {
  const items = await client.querySchedule(term.xnm, term.xqm);
  const days: ScheduleDay[] = [];
  for (let day = 1; day <= 7; day++) {
    const today = items
      .filter((item) => hasFixedSlot(item) && item.weekday === day)
      .sort((a, b) => a.startSection! - b.startSection!);
    if (today.length) days.push({ day, items: today });
  }
  return { days, untimed: items.filter((item) => !hasFixedSlot(item)), total: items.length };
}
