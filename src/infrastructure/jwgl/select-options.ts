import { CascadeOptions, SelectOption } from '../../types/schedule';

/**
 * 视图页内嵌下拉（`<select>`）的解析。
 *
 * 正方的查询视图页把「学院/年级/专业」等选单直接内嵌在 HTML 里（chosen-select，
 * 下拉本体 `display:none`），并且通常**已按当前学生预选**好学院/年级/专业——
 * 「默认查自己」这条规则就建立在 `defaults` 上，而不是靠本地推断学号/专业。
 *
 * 纯函数：不依赖 Axios，便于用脱敏夹具做契约测试。
 */

export interface ParsedOption {
  value: string;
  label: string;
  selected: boolean;
}

/**
 * 取 `name="<name>"` 那个 select 的选项（截到 `</select>` 为止）。
 * 名称必须整串匹配：`name="jg_id"` 不会误命中 `name="jg_id_cx"`。
 */
export function parseSelect(html: string, name: string): ParsedOption[] {
  const start = html.indexOf(`name="${name}"`);
  if (start < 0) return [];
  // 结束边界取「最近的 `</select>`」与「下一个 `<select`」中更靠前的那个。
  // 只看 `</select>` 并用固定长度兜底是有问题的：未闭合时按固定字符数截断，会把后面的
  // 选项**静默丢掉一半**（表现为「专业列表少了几项」或「未找到某学院」这类难查的错），
  // 而按下一个 `<select` 截断则永远不会跨到别的下拉里去。
  const endTag = html.indexOf('</select>', start);
  const nextTag = html.indexOf('<select', start + 1);
  const boundaries = [endTag, nextTag].filter((index) => index >= 0);
  const end = boundaries.length ? Math.min(...boundaries) : html.length;
  const segment = html.slice(start, end);
  return [...segment.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
    .map((option) => ({
      value: (option[1].match(/value="([^"]*)"/) || [])[1] || '',
      label: option[2].trim(),
      selected: /selected/.test(option[1]),
    }))
    .filter((option) => option.value);
}

/** 选项 → 端口类型。空 value 的「全部」项已被 `parseSelect` 过滤。 */
export function toSelectOptions(options: ParsedOption[]): SelectOption[] {
  return options.map((option) => ({ value: option.value, label: option.label }));
}

export function selectedValue(options: ParsedOption[]): string {
  return options.find((option) => option.selected)?.value || '';
}

/**
 * 解析「学院/年级/专业」级联视图页。
 * 三个下拉在页面上的 name 因模块而异（如执行计划用 `nj_cx`/`zyh_id_cx`），由调用方给出。
 */
export function parseCascadeOptions(
  html: string,
  names: { college: string; grade: string; major: string },
): CascadeOptions {
  const colleges = parseSelect(html, names.college);
  const grades = parseSelect(html, names.grade);
  const majors = parseSelect(html, names.major);
  return {
    colleges: toSelectOptions(colleges),
    grades: toSelectOptions(grades),
    majors: toSelectOptions(majors),
    defaults: {
      collegeId: selectedValue(colleges),
      gradeId: selectedValue(grades),
      majorId: selectedValue(majors),
    },
  };
}
