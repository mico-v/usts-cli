# usts - 苏州科技大学教务系统命令行工具

`usts` 是一个面向苏州科技大学**正方教务系统**（V9，`jwgl.usts.edu.cn/jwglxt`）的命令行工具。登录后无需打开浏览器，即可在终端快速查询成绩、考试、课表、选课名单与个人信息。

> 适用对象：在校生（学生账号）。所有查询均为**只读**，不修改任何教务数据。

---

## 目录

- [安装与构建](#安装与构建)
- [配置](#配置)
- [登录](#登录)
- [命令总览](#命令总览)
- [通用参数：学期](#通用参数学期)
- [命令详解](#命令详解)
  - [login](#1-login-登录)
  - [scores](#2-scores-成绩查询)
  - [exams](#3-exams-考试安排)
  - [courses](#4-courses-选课名单)
  - [schedule](#5-schedule-个人课表)
  - [clsched](#6-clsched-班级课表)
  - [profile](#7-profile-个人信息)
- [会话与凭证](#会话与凭证)
- [常见问题](#常见问题)

---

## 安装与构建

环境要求：Node.js 22.12+（与 Commander 15 的运行时要求一致）。

```bash
npm install        # 安装依赖
npm run build      # 编译 TypeScript 到 dist/
npm run check      # 类型检查、架构规则与自动化测试
```

> **登录不依赖浏览器**：账号密码登录是纯脚本（RSA + 双 POST 重试），无需安装 Puppeteer/Chrome。`puppeteer*` 仅在 `devDependencies`，只服务于开发用的 `npm run capture` 抓包工具；生产/无浏览器环境可按需 `npm install --omit=dev` 跳过它。

构建后即可使用。推荐把 `dist/index.js` 当作 `usts` 命令运行：

```bash
node dist/index.js <命令>          # 直接运行
# 或注册到 npm 全局（可选）
npm link                           # 之后可用 usts <命令>
```

> 开发模式（无需编译，需 ts-node）：`npm run dev -- <命令>`

---

## 配置

在项目根目录创建 `.env` 文件（可参考下方字段）：

```ini
# 教务系统基础地址（一般无需修改）
USTS_BASE_URL=https://jwgl.usts.edu.cn/jwglxt

# 登录账号（配置后 usts login 可免交互）
USTS_USERNAME=你的学号
USTS_PASSWORD=你的密码

# 可选：直接注入浏览器复制的会话 Cookie（见“会话与凭证”）
# USTS_COOKIES=JSESSIONID=xxxx; __jsluid_s=xxxx

# 可选：覆盖跨平台会话状态目录
# USTS_STATE_DIR=/path/to/private/state
```

`.env` 中的账号密码仅在运行 `usts login` 时使用，不会外发到除教务系统以外的任何地址。

出于凭证安全，默认只允许 HTTPS 的 `jwgl.usts.edu.cn`。本地协议测试如需自定义主机，必须显式设置 `USTS_ALLOW_CUSTOM_HOST=1`；使用明文 HTTP 还需额外设置 `USTS_ALLOW_INSECURE_HTTP=1`。

---

## 登录

首次使用需先登录一次，会话会持久化到操作系统用户状态目录，之后查询命令可直接复用，无需重复登录。Linux 默认路径为 `~/.local/state/usts-cli/session.json`；旧版项目目录 `.session.json` 会自动迁移。

```bash
usts login
```

登录流程（按优先级自动选择）：

1. 若用户状态目录中已有**有效**会话 → 直接复用。
2. 若设置了环境变量 `USTS_COOKIES` → 注入并校验该 Cookie。
3. 否则通过**账号密码纯脚本登录**：经典正方 RSA 加密 + 「双 POST 重试」（`loginViaScript`）。

> 登录走经典正方页 `login_slogin.html`（瑞数 WAF 会重置「会话内首次登录 POST」，所以脚本会同一会话重试一次即成功）。**无需安装 Puppeteer/Chrome，无需浏览器**。若该次登录需要**图形验证码**（连续失败触发，无法自动处理），会提示改用 `npm run capture` 人工登录后复用会话，或注入 `USTS_COOKIES`。

> 若 `.env` 未配置账号密码，`usts login` 会在终端交互式询问学号与密码（密码输入以 `*` 遮罩）。

---

## 命令总览

| 命令 | 说明 | 是否需要学期参数 |
|------|------|------------------|
| `usts login` | 登录教务系统 | 否 |
| `usts scores` | 查询学生成绩 | 可选 |
| `usts exams` | 查询考试安排 | 可选 |
| `usts courses` | 查询选课名单 | 可选 |
| `usts schedule` | 查询个人课表 | 可选 |
| `usts clsched` | 查询班级课表（级联选学院/专业/班级，可查任意班级） | 可选 |
| `usts profile` | 查询个人信息 | 否 |
| `usts gpa` | 查询学业成绩概览（GPA/学分） | 否 |
| `usts notifications` | 查询通知和待办事项 | 否 |
| `usts academia` | 查询学业情况（GPA/统计/课程分类，可 `--category` 拉明细） | 否 |
| `usts selected-courses` | 查询已选课程详情（只读） | 可选 |

查看任意命令的详细帮助：

```bash
usts --help            # 总览
usts scores --help     # 单命令帮助
```

---

## 通用参数：学期

`scores` / `exams` / `courses` / `schedule` / `clsched` 支持以下学期参数：

| 参数 | 含义 | 示例 |
|------|------|------|
| `-y, --xnm <学年>` | 学年，如 `2025` | `usts scores -y 2025` |
| `-t, --xqm <学期>` | 学期代码：`3`=第一学期，`12`=第二学期，`16`=第三学期（小学期） | `usts scores -t 3` |

**缺省行为**：不指定时，工具按当前日期自动推算学期（与教务网页默认一致）：

- 8 月 ~ 12 月 → 当前学年**第一学期**（`xqm=3`）
- 2 月 ~ 7 月 → 上一学年**第二学期**（`xqm=12`）
- 1 月 → 上一学年**第一学期**（`xqm=3`）

> 只指定 `-y`（学年）而不指定 `-t` 时，学期留空（= 该学年全部学期），与网页选中年份后的缺省一致。例如 `usts scores -y 2025` 会返回 2025-2026 学年两个学期的全部成绩。

---

## 命令详解

### 1. login（登录）

```bash
usts login
```

登录并把会话安全保存到用户状态目录。详见[登录](#登录)。

### 2. scores（成绩查询）

```bash
usts scores                 # 当前学期
usts scores -y 2025 -t 3   # 2025 学年第一学期
```

输出表格：课程 / 性质 / 学分 / 成绩 / 绩点 / 教师 / 开课学院，并在末尾汇总课程门数与学分合计。

```
→ 学生成绩查询    2025 学年 · 第一学期
+---------------+-------+----+----+-----+-----------------+-----------+
| 课程            | 性质    | 学分 | 成绩 | 绩点  | 教师              | 开课学院      |
+---------------+-------+----+----+-----+-----------------+-----------+
| 高等数学A(一)    | 通识必修课 | 4  | 95 | 4.5 | 李涛              | 电子与信息工程学院 |
+---------------+-------+----+----+-----+-----------------+-----------+
✓ 共 10 门课程 · 学分合计 21
```

### 3. exams（考试安排）

```bash
usts exams
usts exams -y 2025 -t 3
```

输出：课程 / 考试时间 / 考试地点 / 座位号 / 考试类型。若该学期暂无考试安排会提示「该学期暂无考试安排」。

### 4. courses（选课名单）

```bash
usts courses
usts courses -y 2025 -t 12
```

输出：课程 / 课程代码 / 学分 / 教师 / 教学班。

### 5. schedule（个人课表）

```bash
usts schedule
usts schedule -y 2025 -t 3
```

按星期（周一 ~ 周日）分组展示：节次范围 / 课程 / 教室 / 教师 / 上课周次。实践课、MOOC 等无固定节次的课程单独列在「其他课程（无固定时间）」。

### 6. clsched（班级课表）

```bash
usts clsched                                        # 交互式级联选择 校区→年级→学院→专业→班级
usts clsched -y 2026 -t 3 --jg 204 --zy 0107 --bh 测试班级   # 直接指定（id 或名称均可）
```

复刻网页「班级课表查询」的级联选单，**可查询任意专业、任意班级的课表**。输出按星期分组：节次 / 课程 / 教室 / 教师（含职称）/ 上课周次 / 学分，实践课单列。

| 参数 | 含义 |
|------|------|
| `--jg <学院>` | 学院：id（如 `204`）或名称（如 `电子`） |
| `--zy <专业>` | 专业：id（如 `0107`）或名称（如 `计算机`） |
| `--bh <班级>` | 班级：名称（如 `测试班级`）或编号 |
| `--nj <年级>` | 年级 id，如 `2025`（缺省取网页默认） |
| `--xqh <校区>` | 校区：id 或名称（缺省石湖） |

不指定 `--bh` 时进入交互式级联选择。

### 7. profile（个人信息）

```bash
usts profile
```

输出：学号 / 姓名 / 学院 / 专业 / 班级 / 年级（含入学年份）/ 身份证 / 手机 / 邮箱（对应字段缺失时自动跳过）。

### 8. gpa / academia / notifications / selected-courses

这些命令参考 `zfn_api` 的只读接口，但请求路径、字段和分页以 USTS 实际版本为准：

```bash
usts gpa                         # 学业成绩概览
usts gpa --json                  # 机器可读 JSON
usts notifications               # 首页通知/待办
usts academia                    # 学业概况（GPA/统计/分类学分）
usts academia --category 思想政治类   # 拉取某分类下的课程明细
usts selected-courses -y 2025 -t 3
```

`academia --category` 按分类名（子串匹配）拉取该分类的课程明细（课程号/成绩/绩点/建议学期等）；汇总节点（如「语言类」）无直接明细，需查其叶子分类（如「大学英语」）。`scores` 主接口无数据时自动回退备用接口。`selected-courses` 与 `courses` 不是同一个功能：前者查询已选课程详情（教学班、容量、已选人数、地点等），后者查询课程名单。上述命令均为只读，不执行选课或退课操作。`zfn_api` 使用的旧学期参数 `1/2` 不适用于本项目，当前 USTS 仍使用 `xqm=3/12/16`。

支持 `--json` 的命令使用版本化输出信封：`{schemaVersion, command, data, meta?, warnings}`；JSON 错误写入 `stderr`。完整契约和退出码见 [`docs/contracts/cli.md`](docs/contracts/cli.md)。

---

### 9. PDF 下载（只读）

```bash
usts schedule-pdf -y 2026 -t 3 -o ./schedule.pdf
usts academia-pdf -o ./transcript.pdf
```

默认拒绝覆盖已有文件，使用 `--force` 才会覆盖。PDF 可能包含个人课表、成绩和学籍信息，请自行选择安全的输出路径。实现已接入正方打印模块的多步只读请求链，并校验 `%PDF-` 文件头；不同时间段/模块权限可能导致服务器拒绝生成文件。

## 会话与凭证

- **存储位置**：Linux 默认 `~/.local/state/usts-cli/session.json`；可用 `USTS_STATE_DIR` 覆盖。目录权限为 `0700`，文件权限为 `0600`。
- **兼容迁移**：旧版当前目录 `.session.json` 仍可读取，成功读取后迁移到新位置并尽力收紧旧文件权限。
- **有效期**：会话由教务系统控制，一般数小时至数天；过期后查询会提示「会话已失效，请重新运行 usts login」。
- **手动注入 Cookie**：如果你已在浏览器登录，可把请求头里的 `Cookie` 整串复制到环境变量 `USTS_COOKIES`，运行 `usts login` 即可校验并复用，无需账号密码：

  ```bash
  export USTS_COOKIES="JSESSIONID=xxxx; __jsluid_s=xxxx"
  usts login
  ```

---

## 常见问题

**Q：运行查询命令提示「未找到会话 / 会话已失效」？**
A：先运行 `usts login`。若已登录仍失效，说明会话过期，重新 `usts login` 即可。

**Q：请求失败、报错 `ERR_CONNECTION_CLOSED` 或卡住？**
A：校园网前置 WAF 对短时间内的重复请求有限流，会直接重置连接。请**暂停 30~60 秒后重试**。登录命令已内置重试与退避，查询命令遇到限流时稍等再试即可。

**Q：`usts login` 提示需要验证码 / 一直失败？**
A：登录是纯脚本（无需浏览器）。若提示「需要图形验证码」，说明账号刚被连续失败锁出，请改用 `USTS_COOKIES` 注入已登录的浏览器 Cookie，或 `npm run capture` 人工登录。若为 `ERR_CONNECTION_CLOSED`，属 WAF 限流，等待 30~60 秒重试即可。

**Q：查询返回空数据？**
A：可能是该学期确实没有对应记录，或学期参数推算不符合预期。请用 `-y` / `-t` 显式指定目标学期重试。课表（`schedule`）若持续为空，是当前解析方式的已知限制。

**Q：密码安全吗？**
A：`.env` 中的账号密码仅用于向教务系统登录，不会发送到任何第三方。`USTS_USERNAME`/`USTS_PASSWORD` 不应提交到版本库。

---

## 开发说明

- 源码位于 `src/`，编译产物在 `dist/`。
- 新增查询功能的一般流程：在 `src/types/api.ts` 增加类型 → 在 `src/lib/client.ts` 增加查询方法 → 在 `src/commands/` 增加命令 → 在 `src/index.ts` 注册路由。
- 接口契约与实测结论记录在 `WEB_ARCHITECTURE.md`。
