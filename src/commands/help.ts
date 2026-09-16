import { Command } from 'commander';
import { error } from '../lib/logger';

/**
 * 去掉模板字符串的公共缩进：文档在源码里保持缩进可读，输出到终端时不带多余空格。
 */
function doc(text: string): string {
  const lines = text.replace(/^\n+/, '').replace(/\s+$/, '').split('\n')
    .map((line) => line.replace(/\s+$/, ''));
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => (/^ */).exec(line)?.[0].length ?? 0);
  const indent = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(Math.min(indent, line.length))).join('\n');
}

/**
 * 各命令 `--help` 尾部补充的详细说明。
 *
 * 这些内容原本堆在 README 里，但对使用命令行的人来说，`usts scores --help` 才是
 * 会真的被看到的地方；README 只留简介与安装。新增/修改命令行为时改这里。
 */
export const COMMAND_HELP: Record<string, string> = {
  login: doc(`
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

  logout: doc(`
    说明:
      只清除本地会话文件与内存中的 Cookie，幂等（本来没登录也算成功），不发网络请求。
      服务端会话不受影响，会在其有效期内继续可用；如需立即失效请在浏览器中退出登录。`),

  scores: doc(`
    示例:
      usts scores                 查询当前学期成绩
      usts scores -y 2025 -t 3    查询 2025 学年第一学期成绩

    说明:
      输出课程/性质/学分/成绩/绩点/教师/开课学院，末尾汇总门数与学分合计。
      主接口被拒或改版时会自动回退到备用接口；空结果不触发回退（新学期没成绩是正常的）。
      学期参数见 usts help term。`),

  exams: doc(`
    示例:
      usts exams                  查询当前学期考试安排
      usts exams -y 2025 -t 3     查询 2025 学年第一学期考试安排

    说明:
      输出课程/考试时间/考试地点/座位号/考试类型；该学期没有安排时给出提示。
      学期参数见 usts help term。`),

  courses: doc(`
    示例:
      usts courses                查询当前学期选课名单
      usts courses -y 2025 -t 12  查询 2025 学年第二学期选课名单

    说明:
      输出课程/课程代码/学分/教师/教学班。与 selected-courses 不是同一个功能：
      这里查的是课程名单，selected-courses 查的是已选课程详情。
      学期参数见 usts help term。`),

  schedule: doc(`
    示例:
      usts schedule               查询当前学期课表
      usts schedule -y 2025 -t 3  查询 2025 学年第一学期课表

    说明:
      按星期（周一~周日）分组展示节次范围/课程/教室/教师/上课周次；实践课、MOOC 等
      无固定节次的课程单独列在「其他课程（无固定时间）」。若返回空，先用 -y/-t
      显式指定学期重试。
      学期参数见 usts help term。`),

  clsched: doc(`
    示例:
      usts clsched                                        交互式级联选择
      usts clsched -y 2026 -t 3 --jg 204 --zy 0107 --bh 测试班级
      usts clsched --jg 电子 --zy 计算机 --bh 2512        名称会做子串匹配

    说明:
      复刻网页「班级课表查询」的级联选单（校区→年级→学院→专业→班级），可查任意
      班级的课表。输出按星期分组：节次/课程/教室/教师（含职称）/上课周次/学分。
      不指定 --bh 时进入交互式级联选择，需要真实终端；脚本里请给全 --jg/--zy/--bh。
      学期参数见 usts help term。`),

  profile: doc(`
    示例:
      usts profile                查询当前登录用户的个人信息

    说明:
      输出学号/姓名/学院/专业/班级/年级（含入学年份）/身份证/手机/邮箱，
      对应字段缺失时自动跳过。`),

  gpa: doc(`
    示例:
      usts gpa                    学业成绩概览（GPA/学分）
      usts gpa --json             机器可读输出（见 usts help json）`),

  notifications: doc(`
    示例:
      usts notifications          首页通知与待办事项
      usts notifications --json   机器可读输出（见 usts help json）`),

  academia: doc(`
    示例:
      usts academia                       学业概况（GPA/统计/分类学分）
      usts academia --category 思想政治类   查看该分类下的课程明细
      usts academia --json                机器可读输出

    说明:
      --category 按分类名子串匹配，明细含课程号/成绩/绩点/建议学期等。汇总节点
      （如「语言类」）没有直接明细，需要查它的叶子分类（如「大学英语」）。`),

  'selected-courses': doc(`
    示例:
      usts selected-courses -y 2025 -t 3

    说明:
      查询已选课程详情（教学班、容量、已选人数、地点等），只读，不执行选课或退课。
      与 courses 的课程名单是两个不同功能。
      学期参数见 usts help term。`),

  'schedule-pdf': doc(`
    示例:
      usts schedule-pdf -y 2026 -t 3      输出 schedule-2026-3.pdf
      usts schedule-pdf -o ./my.pdf       指定输出路径
      usts schedule-pdf --force           覆盖已有文件

    说明:
      缺省文件名带学年与学期，避免不同学期的课表互相覆盖；默认拒绝覆盖已有文件。
      详见 usts help download 与 usts help term。`),

  'academia-pdf': doc(`
    示例:
      usts academia-pdf                   输出 transcript.pdf
      usts academia-pdf -o ./grades.pdf   指定输出路径
      usts academia-pdf --force           覆盖已有文件

    说明:
      缺省文件名为 transcript.pdf；默认拒绝覆盖已有文件。
      详见 usts help download。`),
};

/**
 * 取某个命令 `--help` 尾部的详细说明（含前导换行）。
 * 缺少条目时不拼出 "undefined"：宁可少一段说明，也不让帮助文本里出现内部值。
 */
export function commandHelp(name: string): string {
  const text = COMMAND_HELP[name];
  return text ? `\n${text}` : '';
}

interface HelpTopic {
  /** 命令行里输入的主题名 */
  name: string;
  /** 中文别名，方便直接 `usts help 配置` */
  aliases?: string[];
  summary: string;
  text: string;
}

/**
 * `usts help <主题>` 的详细文档。
 *
 * README 只留简介与安装，配置、会话、学期、输出契约、下载与排错这些「用的时候才查」
 * 的内容放这里：终端里随时可取，也不会随实现漂移出第二个副本。
 */
export const HELP_TOPICS: HelpTopic[] = [
  {
    name: 'config',
    aliases: ['配置'],
    summary: '配置文件位置、可用键与网络信任边界',
    text: doc(`
      配置

        配置文件放在用户配置目录下的 .env，不是当前目录：

          Linux    \${XDG_CONFIG_HOME:-~/.config}/usts-cli/.env
          macOS    ~/Library/Application Support/usts-cli/.env
          Windows  %APPDATA%\\usts-cli\\.env

        用 USTS_CONFIG_DIR 覆盖目录，或用 USTS_ENV_FILE=/path/to/.env 直接指定文件。

        可配置项:
          USTS_BASE_URL   教务系统地址，缺省 https://jwgl.usts.edu.cn/jwglxt
          USTS_USERNAME   学号（配置后可免交互登录，并能自动重新登录）
          USTS_PASSWORD   密码
          USTS_COOKIES    直接注入浏览器复制的 Cookie，可跳过账号密码登录
          USTS_STATE_DIR  覆盖会话状态目录

        真实环境变量优先于文件内容。建议 chmod 600 该文件，权限过宽时启动会告警。
        账号密码只用于向教务系统登录，不会发往其他任何地址。

        为什么不读当前目录的 .env：全局安装后命令会在任意目录运行，若按 cwd 读配置，
        cd 进一个带 .env 的目录就等于让那个目录决定凭据发往哪台主机——一份
        USTS_BASE_URL + USTS_ALLOW_CUSTOM_HOST=1 就能把登录请求引向别的站点。当前目录
        若存在这样的文件，启动时会提示它没有被读取。

        出于凭证安全，默认只允许 HTTPS 的 jwgl.usts.edu.cn。本地协议测试如需自定义
        主机，必须显式设置 USTS_ALLOW_CUSTOM_HOST=1；使用明文 HTTP 还需额外设置
        USTS_ALLOW_INSECURE_HTTP=1。这两个开关的用途是放宽信任边界，因此只认真实
        环境变量：写在配置文件里会被忽略并在 stderr 告警。`),
  },
  {
    name: 'session',
    aliases: ['会话', '登录'],
    summary: '登录方式、会话有效期、自动重登与敏感度',
    text: doc(`
      登录与会话

        首次使用先运行 usts login，会话会持久化到操作系统用户状态目录（Linux 默认
        ~/.local/state/usts-cli/session.json），之后查询命令直接复用。

        登录流程按优先级自动选择:
          1. 已有有效会话        → 直接复用
          2. 设置了 USTS_COOKIES → 注入 Cookie 并用个人信息页校验（失效时，若配置了
                                  账号密码，自动改走账号密码登录而不是直接判死）
          3. 账号密码            → 纯脚本登录（正方 RSA 加密 + 双 POST 重试，无需浏览器）

        .env 未配置账号密码时，usts login 会交互式询问学号与密码。若该次登录需要图形
        验证码（连续失败触发，无法自动处理），改用 USTS_COOKIES 注入或
        npm run capture 人工登录后复用会话。

        手动注入浏览器 Cookie:
          export USTS_COOKIES="JSESSIONID=xxxx; __jsluid_s=xxxx"
          usts login

        有效期与自动重登:
          会话由教务系统控制，一般数小时至数天。查询命令执行前会校验会话——默认 5 分钟
          信任窗口内直接复用，窗口过期才发一次探针请求（USTS_SESSION_TRUST_MS 可调，
          设为 0 则每次都校验）；确认失效就用环境变量里的凭据自动重新登录并重放本次
          查询，网络异常不会被误判为失效。自动重登绝不弹出交互式提示，失败后进入冷却
          期；没有可用凭据时才提示运行 usts login。

        代价:
          自动重登需要 .env 里有 USTS_USERNAME/USTS_PASSWORD，等于把密码长期留在磁盘
          上。只用 USTS_COOKIES 的话不会自动重登，过期后需手动重新注入。

        敏感度:
          会话文件里是明文 bearer token（JSESSIONID/rememberMe），效力等同于密码——
          拿到它就能取全部数据。0600 只挡其他用户，不挡以你的身份运行的进程，也不挡
          家目录被备份、同步或打快照。文件加密与系统凭据管理器不在计划内，请按与密码
          同等的敏感度对待。

        退出登录:
          usts logout 只做本地清理（删会话文件 + 清内存 Cookie，幂等，不发网络请求）。
          正方没有可安全调用的登出接口，服务端会话会继续有效直到自然到期。

        origin 绑定:
          会话文件必须带 origin 且与当前 USTS_BASE_URL 一致才会被加载。旧版放在当前
          目录的 .session.json 不再读取（ADR-0004），删除后重新 usts login 即可。`),
  },
  {
    name: 'term',
    aliases: ['学期'],
    summary: '学期参数的取值、缺省推算与「全部学期」',
    text: doc(`
      学期参数

        scores / exams / courses / schedule / clsched / selected-courses / schedule-pdf 支持:

          -y, --xnm <学年>   学年，如 2025
          -t, --xqm <学期>   3=第一学期, 12=第二学期, 16=第三学期（小学期）

        缺省时按当前日期推算（与教务网页默认一致）:
          8 月 ~ 12 月 → 当前学年第一学期（xqm=3）
          2 月 ~  7 月 → 上一学年第二学期（xqm=12）
          1 月         → 上一学年第一学期（xqm=3）

        只给 -y 而不给 -t 时学期留空，即该学年全部学期:
          usts scores -y 2025      → 2025-2026 学年两个学期的全部成绩`),
  },
  {
    name: 'json',
    aliases: ['输出', '退出码'],
    summary: '--json 输出信封与退出码',
    text: doc(`
      JSON 输出与退出码

        gpa / notifications / academia / selected-courses 等命令支持 --json，输出带版本号
        的信封，错误以同样的信封写到 stderr:

          { "schemaVersion": 1, "command": "gpa", "data": {...}, "meta": {...}, "warnings": [] }

        JSON 模式不输出 ANSI 标题与表格，可直接管道给 jq。人类可读结果与进度走 stdout，
        警告与错误走 stderr。

        退出码:
          0  成功
          2  配置或参数错误（含非交互终端下调用交互式命令）
          3  登录、会话、凭证或验证码问题
          4  网络、限流或远端服务错误
          5  远端协议/响应结构变化
          6  本地文件系统错误

        完整契约（字段定义、会话行为、配置来源）见 docs/contracts/cli.md。`),
  },
  {
    name: 'download',
    aliases: ['下载', 'pdf'],
    summary: '两个 PDF 下载命令的文件名与覆盖策略',
    text: doc(`
        PDF 下载（只读）

          usts schedule-pdf -y 2026 -t 3      → schedule-2026-3.pdf
          usts schedule-pdf -o ./my.pdf       → 指定输出路径
          usts academia-pdf                   → transcript.pdf

        缺省文件名: schedule-pdf 带学年与学期，避免不同学期的课表互相覆盖；academia-pdf
        固定为 transcript.pdf。默认拒绝覆盖已有文件，加 --force 才会覆盖。

        实现走正方打印模块的多步只读请求链（含同源跳转跟随），并校验 %PDF- 文件头；
        不同时间段或模块权限可能导致服务器拒绝生成文件。PDF 含个人课表、成绩与学籍
        信息，请自行选择安全的输出路径。`),
  },
  {
    name: 'faq',
    aliases: ['常见问题', '排错'],
    summary: '超时、WAF 限流、验证码与空结果',
    text: doc(`
      常见问题

        提示「未找到会话」？
          本地还没有会话，运行 usts login。

        提示「会话已失效」？
          自动重登没有成功：按提示检查 .env 里的 USTS_USERNAME/USTS_PASSWORD 是否正确，
          或手动运行 usts login（可能触发了图形验证码）。

        卡住不动，或报「请求超时」？
          单个请求上限 15 秒（PDF 下载 45 秒），超时会换一条连接重试，并在 stderr 打印
          「请求超时，正在重试（2/3）…」——看到提示说明程序在工作，不是死机。

        报 ERR_CONNECTION_CLOSED / 「连接被重置」？
          校园网前置 WAF 在限流。程序会退避后自动重试；连续失败请等 30~60 秒再试，
          并发重试只会加重限流。

        usts login 一直失败或要求验证码？
          登录是纯脚本，不需要浏览器。「需要图形验证码」说明账号被连续失败锁出，改用
          USTS_COOKIES 注入已登录浏览器的 Cookie，或 npm run capture 人工登录。

        查询返回空数据？
          可能该学期确实没有记录，也可能学期推算不符合预期：用 -y / -t 显式指定重试。

        密码安全吗？
          账号密码只用于向教务系统登录，不发送到任何第三方；不要把 .env 提交到版本库。`),
  },
];

/** 主题清单（一行一个），拼进主帮助的「详细文档」段。 */
export const HELP_TOPIC_INDEX: string = [
  ...HELP_TOPICS.map((topic) => `    usts help ${topic.name.padEnd(9)} ${topic.summary}`),
  '    也可以 usts help <命令>（等同于 usts <命令> --help）',
].join('\n');

/**
 * `usts help [主题]`：不带主题时打印主帮助；主题可以是命令名或文档主题。
 * 未知主题按用法错误处理（退出码 2），而不是假装成功。
 */
export function helpCommand(topic: string | undefined, program: Command): void {
  const name = (topic ?? '').trim();
  if (!name) {
    program.outputHelp();
    return;
  }

  const command = program.commands.find(
    (candidate) => candidate.name() === name || candidate.aliases().includes(name),
  );
  if (command) {
    command.outputHelp();
    return;
  }

  const found = HELP_TOPICS.find(
    (candidate) => candidate.name === name || candidate.aliases?.includes(name),
  );
  if (found) {
    console.log(found.text);
    return;
  }

  console.error(error(
    `没有这个帮助主题：${name}。可用主题：${HELP_TOPICS.map((t) => t.name).join(' / ')}，或直接写命令名（如 usts help scores）。`,
  ));
  process.exitCode = 2;
}
