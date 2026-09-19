/**
 * 命令注册表：每个命令的**唯一描述处**
 *
 * 一个命令原先要改五个地方（`index.ts` 注册、`interactive.ts` 菜单 + 参数表单、
 * `help.ts` 文档、适配器委托、端口接口），漏一处就漂移。这里把这些收成
 * 一张表：Commander 命令、交互式菜单、`--help` 尾部说明、交互式参数收集（`interactive`）
 * 和执行体（`run`）都在同一个 spec 里。
 *
 * 新增一个查询命令 = 在本文件加一个 spec（并在 `index.ts` 之外无需改动其他文件）。
 * 菜单顺序 = `ALL_SPECS` 中的顺序，`menu` 字段决定它出不出现于查询子菜单。
 */
import { Command } from 'commander';
import { JwglGateway } from '../infrastructure/jwgl/gateway';
import { Term } from '../domain/term';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { scoresCommand } from './scores';
import { examsCommand } from './exams';
import { coursesCommand } from './courses';
import { scheduleCommand } from './schedule';
import { clschedCommand } from './clsched';
import { profileCommand } from './profile';
import { gpaCommand } from './gpa';
import { notificationsCommand } from './notifications';
import { academiaCommand } from './academia';
import { selectedCoursesCommand } from './selected-courses';
import { schedulePdfCommand } from './schedule-pdf';
import { DEFAULT_ACADEMIA_PDF_NAME, defaultSchedulePdfName } from '../application/usecases/documents';
import { academiaPdfCommand } from './academia-pdf';
import { FreeClassOptions, freeClassCommand, DEFAULT_FREE_CLASSROOM_LIMIT } from './freeclass';
import { warningCommand } from './warning';
import { PlanOptions, planCommand, DEFAULT_PLAN_LIMIT } from './plan';
import { paymentCommand } from './payment';
import { MinorScheduleOptions, minorScheduleCommand } from './minor-schedule';
import { DEFAULT_MINOR_KIND, MINOR_KIND_NAMES } from '../application/usecases/minor-schedule';
import {
  askFreeClassForm, askMinorScheduleForm, askOutputPath, askScoreForm, askTerm,
} from './prompts';
import { numericOption } from './_shared';
import { doc } from './help';

/** 命令在交互式界面里的位置。没有 `menu` 的命令不出现在查询子菜单（如 login/profile）。 */
export interface MenuEntry {
  label: string;
}

export interface CommandSpec {
  /** 命令名；同时是菜单项的取值 */
  id: string;
  /** Commander 的 description */
  summary: string;
  /** 是否挂 `-y/-t` 学期参数 */
  term?: true;
  /** 额外选项（学期参数之外） */
  options?: (cmd: Command) => Command;
  /** 查询子菜单条目；不填 = 不进查询菜单 */
  menu?: MenuEntry;
  /** `--help` 尾部的详细说明（也是 `usts help <命令>` 的输出） */
  help: string;
  /**
   * 交互式菜单里收集参数的表单；返回 `null` 表示用户取消本次操作。
   * 不填 = 该命令在菜单里不需要参数（直接以 `{}` 运行）。
   */
  interactive?: (defaults: Term) => Promise<unknown | null>;
  run: (client: JwglGateway, opts: any) => Promise<void>;
}

/** 出现在查询子菜单里的 spec（`menu` 必填）。 */
export type QuerySpec = CommandSpec & { menu: MenuEntry };

/**
 * 声明一个命令。
 *
 * `O` 只约束本 spec 自己的 `run`/`interactive` 签名——Commander 交回来的 options 是
 * 动态对象，注册表这一层统一按 `any` 透传（形状由 spec 自己声明，见 `CommandSpec.run`）。
 */
function defineCommand<O>(spec: {
  id: string;
  summary: string;
  term?: true;
  options?: (cmd: Command) => Command;
  menu?: MenuEntry;
  help: string;
  interactive?: (defaults: Term) => Promise<O | null>;
  run: (client: JwglGateway, opts: O) => Promise<void>;
}): CommandSpec {
  return spec;
}

// ===== 账号类命令 =====

export const LOGIN_SPEC = defineCommand<void>({
  id: 'login',
  summary: '登录教务系统（纯脚本 RSA + 双 POST 重试，无需浏览器；会话安全持久化）',
  help: doc(`
    登录流程（按优先级自动选择）:
      1. 已有有效会话        → 直接复用
      2. 设置了 USTS_COOKIES → 注入 Cookie 并用个人信息页校验；失效时若 .env 里
                              有账号密码，自动改走账号密码登录而不是直接判死
      3. 账号密码            → 纯脚本登录（正方 RSA 加密 + 双 POST 重试）

    说明:
      无需浏览器、无需 Puppeteer。登录成功后会话保存到用户状态目录，后续查询命令
      直接复用；会话失效时查询命令也会用同样凭据自动重新登录。
      .env 未配置账号密码时会交互式询问学号与密码（密码以 * 遮罩），需要真实终端。
      若提示「需要图形验证码」（连续失败触发），无法自动处理：改用 USTS_COOKIES
      注入浏览器 Cookie（见 usts help session）。

    细节见 usts help session；配置项见 usts help config。`),
  run: async (client) => {
    const ok = await loginCommand(client);
    if (ok) process.exitCode = 0;
    // 兜底而非正常路径：loginCommand 的每条失败路径都会按契约自己设码（3 凭据 / 4 网络 /
    // 5 协议…）。这条保证的是「万一将来漏设」，失败的登录也绝不静默以 0 退出——
    // 那会让脚本把一次失败的登录当成成功。
    else if (!process.exitCode) process.exitCode = 1;
  },
});

export const LOGOUT_SPEC = defineCommand<void>({
  id: 'logout',
  summary: '退出登录（删除本地保存的会话）',
  help: doc(`
    说明:
      只清除本地会话文件与内存中的 Cookie，幂等（本来没登录也算成功），不发网络请求。
      服务端会话不受影响，会在其有效期内继续可用；如需立即失效请在浏览器中退出登录。`),
  run: async (client) => {
    logoutCommand(client);
  },
});

// ===== 查询类命令 =====

const scoresSpec = defineCommand<{ xnm: string; xqm: string; kcxzdm?: string }>({
  id: 'scores',
  summary: '查询学生成绩（课程/性质/学分/成绩/绩点/教师/开课学院）',
  term: true,
  menu: { label: '学生成绩' },
  options: (cmd) => cmd.option('--kcxzdm <课程性质>', '按课程性质代码筛选'),
  interactive: (def) => askScoreForm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts scores                 查询当前学期成绩
      usts scores -y 2025 -t 3    查询 2025 学年第一学期成绩

    说明:
      输出课程/性质/学分/成绩/绩点/教师/开课学院，末尾汇总门数与学分合计。
      主接口被拒或改版时会自动回退到备用接口；空结果不触发回退（新学期没成绩是正常的）。
      学期参数见 usts help term。`),
  run: (client, opts) => scoresCommand(client, opts),
});

const examsSpec = defineCommand<{ xnm: string; xqm: string }>({
  id: 'exams',
  summary: '查询考试安排（课程/时间/地点/座位号/类型）',
  term: true,
  menu: { label: '考试安排' },
  interactive: (def) => askTerm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts exams                  查询当前学期考试安排
      usts exams -y 2025 -t 3     查询 2025 学年第一学期考试安排

    说明:
      输出课程/考试时间/考试地点/座位号/考试类型；该学期没有安排时给出提示。
      学期参数见 usts help term。`),
  run: (client, opts) => examsCommand(client, opts),
});

const coursesSpec = defineCommand<{ xnm: string; xqm: string }>({
  id: 'courses',
  summary: '查询选课名单（课程/课程代码/学分/教师/教学班）',
  term: true,
  menu: { label: '选课名单' },
  interactive: (def) => askTerm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts courses                查询当前学期选课名单
      usts courses -y 2025 -t 12  查询 2025 学年第二学期选课名单

    说明:
      输出课程/课程代码/学分/教师/教学班。与 selected-courses 不是同一个功能：
      这里查的是课程名单，selected-courses 查的是已选课程详情。
      学期参数见 usts help term。`),
  run: (client, opts) => coursesCommand(client, opts),
});

const scheduleSpec = defineCommand<{ xnm: string; xqm: string }>({
  id: 'schedule',
  summary: '查询个人课表（按星期展示节次/教室/教师）',
  term: true,
  menu: { label: '个人课表' },
  interactive: (def) => askTerm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts schedule               查询当前学期课表
      usts schedule -y 2025 -t 3  查询 2025 学年第一学期课表

    说明:
      按星期（周一~周日）分组展示节次范围/课程/教室/教师/上课周次；实践课、MOOC 等
      无固定节次的课程单独列在「其他课程（无固定时间）」。若返回空，先用 -y/-t
      显式指定学期重试。
      学期参数见 usts help term。`),
  run: (client, opts) => scheduleCommand(client, opts),
});

const clschedSpec = defineCommand<{
  xnm: string; xqm: string; xqh?: string; nj?: string; jg?: string; zy?: string; bh?: string;
}>({
  id: 'clsched',
  summary: '查询班级课表（可按学院/专业/班级级联选择，可查任意班级）',
  term: true,
  menu: { label: '班级课表' },
  options: (cmd) => cmd
    .option('--xqh <校区>', '校区：id 或名称（默认石湖）')
    .option('--nj <年级>', '年级 id，如 2025')
    .option('--jg <学院>', '学院：id 或名称')
    .option('--zy <专业>', '专业：id 或名称')
    .option('--bh <班级>', '班级：名称或编号（如 测试班级）'),
  help: doc(`
    示例:
      usts clsched                                        交互式级联选择
      usts clsched -y 2026 -t 3 --jg 204 --zy 0107 --bh 测试班级
      usts clsched --jg 电子 --zy 计算机 --bh 2512        名称会做子串匹配

    说明:
      复刻网页「班级课表查询」的级联选单（校区→年级→学院→专业→班级），可查任意
      班级的课表。输出按星期分组：节次/课程/教室/教师（含职称）/上课周次/学分。
      不指定 --bh 时进入交互式级联选择，需要真实终端；脚本里请给全 --jg/--zy/--bh。
      学期参数见 usts help term。`),
  run: (client, opts) => clschedCommand(client, opts),
});

export const PROFILE_SPEC = defineCommand<void>({
  id: 'profile',
  summary: '查询个人信息（学号/姓名/学院/专业/班级/年级/手机等）',
  help: doc(`
    示例:
      usts profile                查询当前登录用户的个人信息

    说明:
      输出学号/姓名/学院/专业/班级/年级（含入学年份）/身份证/手机/邮箱，
      对应字段缺失时自动跳过。`),
  run: (client) => profileCommand(client),
});

const gpaSpec = defineCommand<{ json?: boolean }>({
  id: 'gpa',
  summary: '查询学业成绩概览（GPA/学分）',
  menu: { label: 'GPA / 学业成绩概览' },
  options: (cmd) => cmd.option('--json', '以 JSON 输出'),
  help: doc(`
    示例:
      usts gpa                    学业成绩概览（GPA/学分）
      usts gpa --json             机器可读输出（见 usts help json）`),
  run: (client, opts) => gpaCommand(client, opts),
});

const notificationsSpec = defineCommand<{ json?: boolean }>({
  id: 'notifications',
  summary: '查询首页通知和待办事项',
  menu: { label: '通知 / 待办' },
  options: (cmd) => cmd.option('--json', '以 JSON 输出'),
  help: doc(`
    示例:
      usts notifications          首页通知与待办事项
      usts notifications --json   机器可读输出（见 usts help json）`),
  run: (client, opts) => notificationsCommand(client, opts),
});

const academiaSpec = defineCommand<{ json?: boolean; category?: string }>({
  id: 'academia',
  summary: '查询学业情况和课程分类概览',
  menu: { label: '学业情况' },
  options: (cmd) => cmd
    .option('--json', '以 JSON 输出')
    .option('--category <分类名>', '拉取指定分类的课程明细（如：思想政治类）'),
  help: doc(`
    示例:
      usts academia                       学业概况（GPA/统计/分类学分）
      usts academia --category 思想政治类   查看该分类下的课程明细
      usts academia --json                机器可读输出

    说明:
      --category 按分类名子串匹配，明细含课程号/成绩/绩点/建议学期等。汇总节点
      （如「语言类」）没有直接明细，需要查它的叶子分类（如「大学英语」）。`),
  run: (client, opts) => academiaCommand(client, opts),
});

const selectedCoursesSpec = defineCommand<{ xnm: string; xqm: string; json?: boolean }>({
  id: 'selected-courses',
  summary: '查询已选课程详情（只读）',
  term: true,
  menu: { label: '已选课程详情' },
  options: (cmd) => cmd.option('--json', '以 JSON 输出'),
  interactive: (def) => askTerm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts selected-courses -y 2025 -t 3

    说明:
      查询已选课程详情（教学班、容量、已选人数、地点等），只读，不执行选课或退课。
      与 courses 的课程名单是两个不同功能。
      学期参数见 usts help term。`),
  run: (client, opts) => selectedCoursesCommand(client, opts),
});

const freeClassSpec = defineCommand<FreeClassOptions>({
  id: 'freeclass',
  summary: '查询空闲教室（可按周次/星期/节次查某时段空闲的场地）',
  term: true,
  menu: { label: '空闲教室' },
  options: (cmd) => cmd
    .option('--week <周次>', '周次，如 3、1-4、3,5,7')
    .option('--weekday <星期>', '星期，1=周一 … 7=周日，如 1,3,5')
    .option('--section <节次>', '节次，如 5 或 5-6')
    .option('--campus <校区>', '校区名称包含（如 石湖）')
    .option('--type <类别>', '场地类别名称包含（如 多媒体教室）')
    .option('--building <楼号>', '楼号名称包含（如 石5）')
    .option('--name <场地>', '场地名称/编号包含（如 103）')
    .option('--min-seats <座位数>', '只显示座位数不少于该值的场地', (value) => numericOption(value, '--min-seats', 1))
    .option('--limit <条数>', '终端最多显示多少条，0=全部（--json 不受影响）', (value) => numericOption(value, '--limit'))
    .option('--json', '以 JSON 输出'),
  interactive: (def) => askFreeClassForm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts freeclass                          当前学期全部场地（默认只显示前 ${DEFAULT_FREE_CLASSROOM_LIMIT} 条）
      usts freeclass --week 3 --weekday 3 --section 5-6
                                              第 3 周周三第 5-6 节空闲的教室
      usts freeclass --building 石5 --min-seats 60
                                              石 5 楼、座位数 ≥ 60 的场地
      usts freeclass --type 多媒体教室 --json   机器可读输出

    说明:
      不带时段参数时列的是该学期**全部场地**；带上 --week/--weekday/--section 后只返回在
      所选时段**都空闲**的场地——多选是「每段都空」而不是「任意一段空」，这与网页的
      「空闲场地查询」一致（第 3 周 ∧ 第 4 周 = 两周边都空着的教室）。
      三个时段参数**必须一起给**（服务端只认齐全的组合，少给一项会退化成不过滤）。
      星期用 1=周一 … 7=周日；周次/节次支持区间与逗号列表（如 1-4,6）。
      --campus/--type/--building/--name 按名称子串匹配（大小写不敏感），--min-seats 按座位数。
      默认只显示前 ${DEFAULT_FREE_CLASSROOM_LIMIT} 条，--limit 0 显示全部；--json 始终输出全集。
      学期参数见 usts help term。`),
  run: (client, opts) => freeClassCommand(client, opts),
});

const warningSpec = defineCommand<{ json?: boolean }>({
  id: 'warning',
  summary: '查询学业预警（当前学年学期）',
  menu: { label: '学业预警' },
  options: (cmd) => cmd.option('--json', '以 JSON 输出'),
  help: doc(`
    示例:
      usts warning            当前学年学期的学业预警
      usts warning --json     机器可读输出（见 usts help json）

    说明:
      该页面由服务端直接渲染结论，不接受学年/学期参数——查的始终是当前学年学期。
      「有没有预警」按页面**结构**判定（有无明细表），不做关键字匹配；无预警时原样打印
      页面的结论，有预警时按页面原有的表头成表（列语义尚未在有预警的账号上实测过，
      因此不做重命名）。`),
  run: (client, opts) => warningCommand(client, opts),
});

const planSpec = defineCommand<PlanOptions>({
  id: 'plan',
  summary: '查看教学执行计划（默认本专业 + 本年级，可查课程明细）',
  menu: { label: '教学执行计划' },
  options: (cmd) => cmd
    .option('--all', '不按本学院/本年级/本专业过滤，查全校')
    .option('--college <学院>', '学院：id、全名或名称子串')
    .option('--grade <年级>', '年级，如 2025')
    .option('--major <专业>', '专业：id、全名或名称子串')
    .option('--course [课程号]', '查看课程明细；给了课程号则只看该课程号（支持部分匹配）')
    .option('--limit <条数>', '终端最多显示多少条，0=全部（--json 不受影响）', (value) => numericOption(value, '--limit'))
    .option('--json', '以 JSON 输出'),
  help: doc(`
    示例:
      usts plan                          本专业 + 本年级的执行计划
      usts plan --course                 这条计划的全部课程
      usts plan --course 2AA31001        只看某个课程号
      usts plan --grade 2024 --major 计算机
      usts plan --all --limit 0          全校全部（1882 条，慎用）

    说明:
      缺省过滤条件来自正方视图页的**预选值**（页面已按当前学生选好学院/年级/专业），
      比在本地推断学号/专业可靠。--college/--major/--grade 可用 id、全名或名称子串覆盖，
      --all 取消全部过滤。
      课程明细挂在单条执行计划下，因此 --course 要求当前条件只匹配到一条计划；多条时
      请先用 --grade/--major 缩小（逐个拉明细会在 WAF 限流下打出一串请求）。
      默认只显示前 ${DEFAULT_PLAN_LIMIT} 条，--limit 0 显示全部；--json 始终输出全集。`),
  run: (client, opts) => planCommand(client, opts),
});

const paymentSpec = defineCommand<{ xnm: string; xqm: string; json?: boolean }>({
  id: 'payment',
  summary: '查询学生缴费记录（只读）',
  term: true,
  menu: { label: '学生缴费' },
  options: (cmd) => cmd.option('--json', '以 JSON 输出'),
  interactive: (def) => askTerm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts payment                当前学期缴费记录
      usts payment -y 2025        2025-2026 学年全部学期
      usts payment --json         机器可读输出

    说明:
      **只做查询**。支付、释放缴费中订单、生成订单、退费申请等写接口一律不实现——
      涉及金钱与不可逆副作用，不在只读 CLI 的范围内。
      输出学年/学期/类型/缴费项目/金额/状态/缴费时间/缴费期限/订单号。
      学期参数见 usts help term。`),
  run: (client, opts) => paymentCommand(client, opts),
});

const minorScheduleSpec = defineCommand<MinorScheduleOptions>({
  id: 'minor-schedule',
  summary: `查询微专业/辅修/二学位课表（默认${DEFAULT_MINOR_KIND}）`,
  term: true,
  menu: { label: '微专业课表' },
  options: (cmd) => cmd
    .option('--kind <类型>', `课表类型：${MINOR_KIND_NAMES.join(' / ')}（缺省 ${DEFAULT_MINOR_KIND}）`)
    .option('--college <学院>', '学院：id、全名或名称子串')
    .option('--grade <年级>', '年级，如 2025')
    .option('--major <专业>', '专业：id、全名或名称子串')
    .option('--json', '以 JSON 输出'),
  interactive: (def) => askMinorScheduleForm(def.academicYear, def.semester),
  help: doc(`
    示例:
      usts minor-schedule                  当前学期微专业课表（缺省类型）
      usts minor-schedule --kind 辅修       辅修课表
      usts minor-schedule --college 电子 --major 计算机 --grade 2025
      usts minor-schedule --college 电子 --json

    说明:
      --kind 取 ${MINOR_KIND_NAMES.join(' / ')}：${DEFAULT_MINOR_KIND}对应主界面的「微专业课表打印」，
      因此是缺省值；也可直接写网页编码 02/03/04。
      班级范围缺省**不过滤**（该视图页未按学生预选学院/年级/专业，实测确认）；
      --college/--major/--grade 可按 id、全名或名称子串缩小范围。
      列出的是**课表记录**（学院/年级/专业/课表名称），不是课表里的课程；导出 Excel、
      预览课表内容尚未实现。
      学期参数见 usts help term。`),
  run: (client, opts) => minorScheduleCommand(client, opts),
});

const schedulePdfSpec = defineCommand<{ xnm: string; xqm: string; output?: string; force?: boolean }>({  id: 'schedule-pdf',
  summary: '下载个人课表 PDF（只读）',
  term: true,
  menu: { label: '下载课表 PDF' },
  // 默认文件名由命令层决定（带学年的 schedule-<学年>-<学期>.pdf）：
  // 这里再写一个默认值会把命令里的兜底变成永远走不到的死代码。
  options: (cmd) => cmd
    .option('-o, --output <文件>', '输出文件路径（缺省 schedule-<学年>-<学期>.pdf）')
    .option('--force', '覆盖已有文件'),
  interactive: async (def) => {
    const form = await askTerm(def.academicYear, def.semester);
    return askOutputPath('课表 PDF ', defaultSchedulePdfName(form.xnm, form.xqm))
      .then((choice) => (choice ? { ...form, ...choice } : null));
  },
  help: doc(`
    示例:
      usts schedule-pdf -y 2026 -t 3      输出 schedule-2026-3.pdf
      usts schedule-pdf -o ./my.pdf       指定输出路径
      usts schedule-pdf --force           覆盖已有文件

    说明:
      缺省文件名带学年与学期，避免不同学期的课表互相覆盖；默认拒绝覆盖已有文件。
      详见 usts help download 与 usts help term。`),
  run: (client, opts) => schedulePdfCommand(client, opts),
});

const academiaPdfSpec = defineCommand<{ output?: string; force?: boolean }>({
  id: 'academia-pdf',
  summary: '下载成绩总表 PDF（只读）',
  menu: { label: '下载成绩总表 PDF' },
  options: (cmd) => cmd
    .option('-o, --output <文件>', '输出文件路径（缺省 transcript.pdf）')
    .option('--force', '覆盖已有文件'),
  interactive: () => askOutputPath('成绩总表 PDF ', DEFAULT_ACADEMIA_PDF_NAME),
  help: doc(`
    示例:
      usts academia-pdf                   输出 transcript.pdf
      usts academia-pdf -o ./grades.pdf   指定输出路径
      usts academia-pdf --force           覆盖已有文件

    说明:
      缺省文件名为 transcript.pdf；默认拒绝覆盖已有文件。
      详见 usts help download。`),
  run: (client, opts) => academiaPdfCommand(client, opts),
});

/**
 * 全部命令，顺序即 `usts --help` 里的命令表顺序。
 *
 * `menu` 决定它是否进查询子菜单——`QUERY_SPECS` 由它派生，因此不会出现
 * 「菜单里有、命令表里没有」这类漂移。
 */
export const ALL_SPECS: CommandSpec[] = [
  LOGIN_SPEC,
  LOGOUT_SPEC,
  scoresSpec,
  examsSpec,
  coursesSpec,
  scheduleSpec,
  clschedSpec,
  PROFILE_SPEC,
  gpaSpec,
  notificationsSpec,
  academiaSpec,
  selectedCoursesSpec,
  freeClassSpec,
  warningSpec,
  planSpec,
  paymentSpec,
  minorScheduleSpec,
  schedulePdfSpec,
  academiaPdfSpec,
];

/** 查询子菜单（顺序 = 上面的声明顺序）。 */
export const QUERY_SPECS: QuerySpec[] = ALL_SPECS.filter((spec): spec is QuerySpec => !!spec.menu);
