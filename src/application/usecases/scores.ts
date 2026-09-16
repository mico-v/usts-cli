/**
 * 成绩查询用例
 *
 * 用例层是命令层与网关之间的那一段：**只描述"这次查询要什么、拿到什么"**，
 * 不做终端渲染（`cli/render/*`），也不管会话（命令入口的 `ensureSession`）。
 * 好处是主路径可以直接用假网关在进程内测，不必 spawn 子进程、也不必起假服务器。
 */
import { ScoreItem } from '../../types/records';
import { ScoresGateway } from '../ports/jwgl-gateway';

/** 一次成绩查询的条件；`xnm`/`xqm` 已由 `resolveTerm` 补过缺省值。 */
export interface ScoresQuery {
  xnm: string;
  xqm: string;
  kcxzdm?: string;
}

/** 查询结果（与展示无关的形状）。 */
export interface ScoresView {
  items: ScoreItem[];
  /** 学分合计；缺学分的条目按 0 计（远端偶尔返回空字段）。 */
  totalCredit: number;
}

export async function readScores(client: ScoresGateway, query: ScoresQuery): Promise<ScoresView> {
  const extra: Record<string, string> = query.kcxzdm ? { kcxzdm: query.kcxzdm } : {};
  const items = await client.queryScores(query.xnm, query.xqm, extra);
  return { items, totalCredit: items.reduce((sum, item) => sum + (item.credit || 0), 0) };
}
