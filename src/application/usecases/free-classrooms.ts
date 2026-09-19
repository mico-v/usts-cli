/**
 * 空闲教室查询用例
 *
 * 取数之外的规则都在这里：把「人写的」时段参数（`3-5,7`）归一成周次/星期/节次，
 * 并按名称/座位数在本地筛选。
 *
 * 为什么名称与座位数不走服务端：实测只确认了**时段**参数（`jyfs`/`zcd`/`xqj`/`jcd`）
 * 会真正过滤，其余过滤字段在网页的导出参数里只出现过名字、没实测过；本地按已映射字段
 * 筛选是**可证明正确**的（服务端一次就返回该时段的全部场地，不存在分页截断）。
 */
import { FreeClassroom } from '../../types/facilities';
import { AppError } from '../../domain/errors';
import { FreeClassroomGateway } from '../ports/jwgl-gateway';

/** 各时段维度的合法上限（与正方作息表同量级；超范围的取值一律报参数错误，不静默丢弃）。 */
const WEEK_MAX = 30;
const WEEKDAY_MAX = 7;
const SECTION_MAX = 13;

export interface FreeClassroomsQuery {
  xnm: string;
  xqm: string;
  /** 周次，如 `3`、`1-4`、`3-5,7` */
  week?: string;
  /** 星期，如 `3`、`1-5` */
  weekday?: string;
  /** 节次，如 `5`、`5-6` */
  section?: string;
  campus?: string;
  type?: string;
  building?: string;
  name?: string;
  minSeats?: number;
}

/** 归一后的查询条件；渲染层用它拼标题。 */
export interface FreeClassroomsCriteria {
  weeks: number[];
  weekdays: number[];
  sections: number[];
  campus?: string;
  type?: string;
  building?: string;
  name?: string;
  minSeats?: number;
}

export interface FreeClassroomsView {
  /** 本地筛选后的场地 */
  items: FreeClassroom[];
  /** 服务端在所选时段返回的场地数（本地筛选之前） */
  total: number;
  criteria: FreeClassroomsCriteria;
}

/**
 * `3`、`3,5`、`1-4`、`3-5,7-8` → 去重升序的整数列表。
 * 越界或写错的一律抛 `CONFIGURATION_ERROR`：静默忽略会让用户以为筛选生效了。
 */
export function parseNumberList(spec: string, label: string, max: number): number[] {
  const values = new Set<number>();
  for (const raw of spec.split(/[,，]/)) {
    const text = raw.trim();
    if (!text) continue;
    const range = text.match(/^(\d+)\s*[-~～至]\s*(\d+)$/);
    const single = text.match(/^(\d+)$/);
    const from = range ? Number(range[1]) : single ? Number(single[1]) : NaN;
    const to = range ? Number(range[2]) : single ? Number(single[1]) : NaN;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > max || from > to) {
      throw new AppError(
        'CONFIGURATION_ERROR',
        `${label}取值无效：${text}。应为 1~${max} 的数字或区间，如 3、1-4、3,5,7`,
      );
    }
    for (let value = from; value <= to; value++) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

function matchesText(value: string | undefined, keyword: string | undefined): boolean {
  if (!keyword) return true;
  return String(value ?? '').toLowerCase().includes(keyword.trim().toLowerCase());
}

function matches(room: FreeClassroom, query: FreeClassroomsQuery): boolean {
  if (!matchesText(room.campus, query.campus)) return false;
  if (!matchesText(room.category, query.type)) return false;
  if (!matchesText(room.building, query.building)) return false;
  // 名称**和编号**都参与匹配：`--name` 的说明写的是「场地名称/编号包含」，
  // 而表里「编号」是单独一列（cdbh），只比对名称会让按编号查的人一条都搜不到。
  if (!matchesText(room.name, query.name) && !matchesText(room.code, query.name)) return false;
  if (query.minSeats !== undefined && (room.seats ?? 0) < query.minSeats) return false;
  return true;
}

export async function readFreeClassrooms(
  client: FreeClassroomGateway,
  query: FreeClassroomsQuery,
): Promise<FreeClassroomsView> {
  const criteria: FreeClassroomsCriteria = {
    weeks: query.week ? parseNumberList(query.week, '周次', WEEK_MAX) : [],
    weekdays: query.weekday ? parseNumberList(query.weekday, '星期', WEEKDAY_MAX) : [],
    sections: query.section ? parseNumberList(query.section, '节次', SECTION_MAX) : [],
    campus: query.campus,
    type: query.type,
    building: query.building,
    name: query.name,
    minSeats: query.minSeats,
  };
  requireWholeTimeSlot(criteria);
  const items = await client.queryFreeClassrooms({
    xnm: query.xnm,
    xqm: query.xqm,
    weeks: criteria.weeks,
    weekdays: criteria.weekdays,
    sections: criteria.sections,
  });
  return { items: items.filter((room) => matches(room, query)), total: items.length, criteria };
}

/**
 * 时段三个维度必须一起给。
 *
 * 实测（2026-09）：只发 `zcd`（或只发 `xqj`+`jcd`）时服务端**忽略该过滤**，返回全部 946
 * 间场地——用户会以为自己查的是「第 3 周空闲」，拿到的却是全校场地列表。宁可报参数错误，
 * 也不能把这种结果当成答案。
 */
function requireWholeTimeSlot(criteria: FreeClassroomsCriteria): void {
  const given = [criteria.weeks.length, criteria.weekdays.length, criteria.sections.length]
    .filter((length) => length > 0).length;
  if (given === 0 || given === 3) return;
  throw new AppError(
    'CONFIGURATION_ERROR',
    '时段过滤要同时给出周次、星期、节次：服务端只认三者齐全的组合，'
    + '少给一项会退化成「不按时段过滤」，返回的就不是某时段空闲的场地。',
  );
}
