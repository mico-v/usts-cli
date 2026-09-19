/**
 * 微专业 / 辅修 / 二学位课表用例
 *
 * 类型编码（`kklxdm` 的 02/03/04）留在适配器里，这一层只认语义名；班级范围沿用
 * `./cascade` 的规则（视图页预选值优先）。
 */
import { MinorProgramKind, MinorScheduleEntry } from '../../types/minor-programs';
import { CascadeSelection, selectCascade } from './cascade';
import { AppError } from '../../domain/errors';
import { MinorScheduleGateway } from '../ports/jwgl-gateway';

/** 课表类型：名称是用户看到的写法，`aliases` 收网页编码，方便直接写 `--kind 04`。 */
const KINDS: { code: MinorProgramKind; name: string; aliases: string[] }[] = [
  { code: 'micro-major', name: '微专业', aliases: ['02'] },
  { code: 'dual-degree', name: '二学位', aliases: ['03'] },
  { code: 'minor', name: '辅修', aliases: ['04'] },
];

/** 主界面入口是「微专业课表打印」（`kklxdm=02`），因此缺省即微专业。 */
export const DEFAULT_MINOR_KIND = KINDS[0].name;

export const MINOR_KIND_NAMES: string[] = KINDS.map((kind) => kind.name);

export function resolveMinorKind(value?: string): { code: MinorProgramKind; name: string } {
  const text = (value || '').trim();
  const found = !text ? KINDS[0] : KINDS.find(
    (kind) => kind.code === text || kind.name === text || kind.aliases.includes(text) || kind.name.includes(text),
  );
  if (!found) {
    throw new AppError('CONFIGURATION_ERROR', `未支持的类型：${value}。可选：${MINOR_KIND_NAMES.join(' / ')}`);
  }
  return { code: found.code, name: found.name };
}

export interface MinorScheduleQueryInput {
  xnm: string;
  xqm: string;
  kind?: string;
  college?: string;
  grade?: string;
  major?: string;
}

export interface MinorScheduleView {
  kind: { code: MinorProgramKind; name: string };
  entries: MinorScheduleEntry[];
  scope: CascadeSelection;
  /** 是否做了班级范围过滤——决定空结果时该给什么建议 */
  scoped: boolean;
}

export async function readMinorSchedules(
  client: MinorScheduleGateway,
  query: MinorScheduleQueryInput,
): Promise<MinorScheduleView> {
  const kind = resolveMinorKind(query.kind);

  // 该视图页的三个下拉**实测全都没有预选值**（只有学年/学期有 selected），因此缺省
  // 已经是不做范围过滤（命令层也就没有 --all 这个选项）。这时再去拉一次视图页是白跑一个
  // 请求（WAF 下每次请求都有代价），只有用户显式给了范围、需要校验/解析名称时才必须拉。
  const needsOptions = !!(query.college || query.grade || query.major);
  const options = needsOptions
    ? await client.getMinorScheduleOptions(kind.code)
    : { colleges: [], grades: [], majors: [], defaults: { collegeId: '', gradeId: '', majorId: '' } };

  const scope = selectCascade(options, query);
  const entries = await client.queryMinorSchedules({
    xnm: query.xnm,
    xqm: query.xqm,
    kind: kind.code,
    collegeId: scope.college?.value,
    gradeId: scope.grade?.value,
    majorId: scope.major?.value,
  });
  return { kind, entries, scope, scoped: !!(scope.college || scope.grade || scope.major) };
}
