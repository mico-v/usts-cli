import { ProfileInfo } from '../../types/identity';

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
    // `</p>` 缺失时 `end` 是 -1，`substring(start, -1)` 会退化成 `substring(start, 0)` ——
    // 也就是把「文档开头到 label 处」当成字段值。宁可不取，也不能把一个跨半页的
    // 乱码当成人名/学院。
    if (end < 0) continue;
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
  // 入学年份只认页面上的「年级」。以前这里回退到 `studentId.slice(0, 4)`，那是按 8 位学号
  // 写的假设——本校学号是 11 位，切出来是「学号前四位」这种不存在的年份。它目前只在
  // `grade` 有值时才被渲染（也就是回退根本不会被显示），但留着就是一个等人踩的陷阱。
  const enrollmentYear = Number(grade) || 0;
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
