/**
 * 空闲教室查询的稳定结果形状（`usts freeclass`）
 *
 * 远端字段名只允许出现在 `infrastructure/jwgl`；字段注释标出来源，方便追查。
 */

export interface FreeClassroom {
  code?: string;       // 场地编号 cdbh
  name: string;        // 场地名称 cdmc
  category?: string;   // 场地类别 cdlbmc
  campus?: string;     // 校区 xqmc
  building?: string;   // 楼号名 jxlmc
  seats?: number;      // 座位数 zws
  borrowable?: string; // 是否可借用 sfkjy（是/否）
}

/**
 * 空闲教室查询条件。
 *
 * 时段字段（`weeks`/`weekdays`/`sections`）留空表示不做时段过滤，返回该学期全部场地；
 * 给定后只返回在**每个**选中时段都空闲的场地——这正是网页「空闲场地查询」的语义。
 */
export interface FreeClassroomQuery {
  xnm: string;
  xqm: string;
  /** 周次，1 起（对应网页 `zcd` 位掩码） */
  weeks?: number[];
  /** 星期，1=周一 … 7=周日（对应网页 `xqj` 逗号串） */
  weekdays?: number[];
  /** 节次，1 起（对应网页 `jcd` 位掩码） */
  sections?: number[];
}
