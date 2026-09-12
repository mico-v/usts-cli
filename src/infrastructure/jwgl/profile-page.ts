import { ProfileInfo } from '../../types/api';

/**
 * 解析个人信息详情页。
 *
 * 页面结构：`<label>姓名：</label> ... <p class="form-control-static">张三</p>`，
 * 部分字段（班级/学院/专业）落在 `id="col_xxx_id"` 的 div 内。
 *
 * 纯函数：不依赖 Axios，便于用脱敏夹具做契约测试。
 */
export function parseProfilePage(html: string, username: string): ProfileInfo {
  const pairs: Record<string, string> = {};
  const labelRe = /<label[^>]*>([^<]+?)[：:]\s*<\/label>/g;
  let lm: RegExpExecArray | null;
  while ((lm = labelRe.exec(html))) {
    const label = lm[1].trim();
    const anchor = lm.index + lm[0].length;
    const pIdx = html.indexOf('<p class="form-control-static">', anchor);
    if (pIdx < 0) continue;
    const end = html.indexOf('</p>', pIdx);
    const val = html.substring(pIdx + '<p class="form-control-static">'.length, end).trim();
    if (val && !pairs[label]) pairs[label] = val;
  }
  const get = (...names: string[]): string => names.map((n) => pairs[n]).find((v) => v) || '';
  const colVal = (id: string): string => {
    const m = html.match(new RegExp(`id="${id}"[^>]*>\\s*<p class="form-control-static">([\\s\\S]*?)<\\/p>`, 'i'));
    return m ? m[1].trim() : '';
  };
  const studentId = get('学号') || username;
  const grade = get('年级') || '';
  const enrollmentYear = Number(grade) || Number(String(studentId).slice(0, 4)) || 0;
  return {
    username: studentId || username,
    studentId,
    displayName: get('姓名'),
    className: get('班级') || colVal('col_bh_id'),
    college: get('学院', '院系') || colVal('col_jg_id'),
    major: get('专业') || colVal('col_zy_id'),
    grade,
    enrollmentYear,
    idCard: get('身份证', '身份证号'),
    phone: get('手机', '手机号码', '联系电话'),
    email: get('邮箱', '电子邮箱', 'E-mail', 'email'),
  };
}
