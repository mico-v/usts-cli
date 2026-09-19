/**
 * 「学院/年级/专业」级联选单的解析
 *
 * 教学执行计划、微专业/辅修课表这类视图页都把三个下拉内嵌在 HTML 里，且正方通常已按
 * 当前学生预选好——解析规则一样，放在一处，避免两个用例各写一遍「默认值 vs 显式值」。
 */
import { CascadeOptions, SelectOption } from '../../types/schedule';
import { AppError } from '../../domain/errors';
import { pickOption } from './class-schedule';

export interface CascadeInput {
  college?: string;
  grade?: string;
  major?: string;
  /** 三个维度都不过滤（查全部） */
  all?: boolean;
}

export interface CascadeSelection {
  college?: SelectOption;
  grade?: SelectOption;
  major?: SelectOption;
}

/** 显式值：id、全名或名称子串均可；匹配不到就报参数错误，不静默忽略。 */
function resolve(label: string, value: string | undefined, list: SelectOption[]): SelectOption | null {
  if (!value) return null;
  const found = pickOption(value, list);
  if (!found) {
    throw new AppError('CONFIGURATION_ERROR', `未找到${label}：${value}。请检查取值`);
  }
  return found;
}

/** 视图页的预选值；页面没预选（或选项里没有该值）时返回 null = 该维度不过滤。 */
function byDefault(value: string, list: SelectOption[]): SelectOption | null {
  return value ? list.find((option) => option.value === value) ?? null : null;
}

/**
 * 解析规则（按优先级）：
 *   1. 用户显式给的值；
 *   2. 视图页的预选值——正方已按当前学生选好学院/年级/专业，照抄它比在本地拼学号/专业
 *      可靠得多，也不会因为校区、培养层次差异而选错；
 *   3. 都没有 = 该维度不过滤。
 */
export function selectCascade(options: CascadeOptions, input: CascadeInput): CascadeSelection {
  if (input.all) {
    // 同时给「不过滤」和具体维度是矛盾的。静默让 --all 赢会让用户以为筛选生效了，
    // 却拿到全量结果——宁可当场报错。
    const conflicting = (['college', 'grade', 'major'] as const).filter((key) => input[key]);
    if (conflicting.length) {
      throw new AppError(
        'CONFIGURATION_ERROR',
        `不能同时使用「不做过滤」与 ${conflicting.join(' / ')}：请二选一`,
      );
    }
    return {};
  }
  return {
    college: resolve('学院', input.college, options.colleges)
      ?? byDefault(options.defaults.collegeId, options.colleges) ?? undefined,
    grade: resolve('年级', input.grade, options.grades)
      ?? byDefault(options.defaults.gradeId, options.grades) ?? undefined,
    major: resolve('专业', input.major, options.majors)
      ?? byDefault(options.defaults.majorId, options.majors) ?? undefined,
  };
}
