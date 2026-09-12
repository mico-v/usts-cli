import { academicYearName, displaySemester } from '../../domain/term';

/**
 * PDF 文档下载链的请求体构造。
 *
 * 这两条链都是**多步有状态 POST**：正方打印模块要求先逐步「生成」，最后一步才
 * 返回文件路径。因此它们的重试语义与普通只读查询不同——单步失败不得就地重放，
 * 必须整链重跑（见 `docs/contracts/jwgl-endpoints.md` 的重试契约）。
 */

// ===== 个人课表 PDF =====
export const SCHEDULE_PDF_POLICY_PATH = '/kbdy/bjkbdy_cxXnxqsfkz.html';
export const SCHEDULE_PDF_FILE_PATH = '/kbcx/xskbcx_cxXsShcPdf.html';

export function buildSchedulePdfBody(xnm: string, xqm: string, name = '导出'): string {
  return new URLSearchParams({
    xm: name,
    xnm,
    xqm,
    xnmc: academicYearName(xnm),
    xqmmc: displaySemester(xqm),
    jgmc: 'undefined',
    xxdm: '',
    'xszd.sj': 'true',
    'xszd.cd': 'true',
    'xszd.js': 'true',
    'xszd.jszc': 'false',
    'xszd.jxb': 'true',
    'xszd.xkbz': 'true',
    'xszd.kcxszc': 'true',
    'xszd.zhxs': 'true',
    'xszd.zxs': 'true',
    'xszd.khfs': 'true',
    'xszd.xf': 'true',
    'xszd.skfsmc': 'false',
    kzlx: 'dy',
  }).toString();
}

// ===== 成绩总表 PDF =====
export const ACADEMIA_PDF_QUERY: Record<string, string> = { gnmkdm: 'N558020' };
export const ACADEMIA_PDF_LIST_PATH = '/bysxxcx/xscjzbdy_dyList.html';
export const ACADEMIA_PDF_PROGRESS_PATH = '/xtgl/progress_cxProgressStatus.html';

const ACADEMIA_PDF_DATA: Record<string, string> = {
  gsdygx: '10628-zw-mrgs', ids: '', bdykcxzDms: '', cytjkcxzDms: '',
  cytjkclbDms: '', cytjkcgsDms: '', bjgbdykcxzDms: '', bjgbdyxxkcxzDms: '',
  djksxmDms: '', cjbzmcDms: '', cjdySzxs: '',
};

/** 生成链的前 5 步；按顺序 POST 完才会在第 6 步拿到真实文件路径。 */
export const ACADEMIA_PDF_STEPS: { path: string; form: Record<string, string> }[] = [
  { path: '/bysxxcx/xscjzbdy_dyXscjzbView.html', form: ACADEMIA_PDF_QUERY },
  { path: '/bysxxcx/xscjzbdy_dyCjdyszxView.html', form: { xh: '' } },
  { path: '/xtgl/bysxxcx/xscjzbdy_cxXsCount.html', form: ACADEMIA_PDF_DATA },
  { path: '/bysxxcx/xscjzbdy_cxGswjlx.html', form: ACADEMIA_PDF_DATA },
  { path: '/common/common_cxJwxtxx.html', form: ACADEMIA_PDF_QUERY },
];

/** 第 6 步：响应正文就是生成好的文件路径（形如 `#成功"/path/x.pdf"`）。 */
export const ACADEMIA_PDF_LIST_FORM = ACADEMIA_PDF_DATA;

export const ACADEMIA_PDF_PROGRESS_FORM: Record<string, string> = {
  key: 'score_print_processed',
  ...ACADEMIA_PDF_QUERY,
};
