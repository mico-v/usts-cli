# 教务系统网页架构探索记录 (WEB_ARCHITECTURE.md)

> 记录对苏州科技大学正方教务系统（`jwgl.usts.edu.cn/jwglxt`，V-9.0）的网页结构探索结果。
> 这是**外部系统**的架构备忘，供实现 CLI 功能时参考。标注「已实测」的为通过无会话请求验证；
> 标注「待实测」的为基于正方标准实现的推测，需在登录后用真实账号验证。

## 1. 登录流程（已实测）

> ⚠️ 2026-08 更新：学校一度迁移到 **CAS 统一身份认证**（`sso.usts.edu.cn`），旧的正方 RSA 纯脚本登录曾失效（§7.1 历史）。**2026-08-21 实测：经典正方 `login_slogin.html` 纯脚本登录已恢复可用**，实现见 `loginViaScript()`（RSA 加密 + 双 POST 重试，§4）。以下 §1 流程即当前有效路径。

1. **取登录页**：`GET /xtgl/login_slogin.html`
   - 页面含隐藏域 `csrftoken`，值形如 `uuid,uuid去横线`（每次访问重新生成，登录 POST 必须原样带回）。
   - 隐藏域 `mmsfjm=1` 表示**密码需要加密**；`yzcskz=3` 表示登录失败 3 次后弹出图形验证码（`/kaptcha`）。
   - 表单字段：`yhm`(学号)、`mm`(密码)、`language=zh_CN`。
2. **取 RSA 公钥**：`GET /xtgl/login_getPublicKey.html` → JSON `{ "modulus": "<base64>", "exponent": "<base64>" }`（已实测返回有效密钥）。
3. **加密密码**：用公钥做 RSA（PKCS#1 v1.5）加密密码，结果 base64。Node 可用内置 `crypto`：`publicEncrypt({ key, padding: RSA_PKCS1_PADDING }, Buffer.from(pwd))` 再 base64，无需第三方库。
4. **提交登录**：`POST /xtgl/login_slogin.html?time=<毫秒时间戳>`，form 字段（浏览器实际提交，已抓包确认）：
   - `csrftoken`（登录页隐藏域原值，形如 `uuid,uuid去横线`）
   - `language=zh_CN`
   - `ydType=`（空）
   - `yhm`(学号)、`mm`(加密后，**提交两次**，对应可见框与隐藏框)
   - 请求头需带 `Origin: https://jwgl.usts.edu.cn`、`Referer` 为登录页。
   - ⚠️ 纯脚本按此提交仍会被 WAF 应用层拒绝（见 4.2），**必须用浏览器引擎（Puppeteer）执行**才能完成登录。
5. **成功标志**：302 跳转到 `index_initMenu.html`，服务端写入会话 Cookie（JSESSIONID、`__jsluid_s` 等）。后续所有请求必须携带该会话 Cookie。
6. **注意**：未登录访问任何功能页都会被 `302` 重定向到 `login_slogin.html`（观测到重定向目标为 `http://...`，实际请求仍建议用 `https` 并复用会话 Cookie）。

## 2. 已确认存在的功能模块（早期探索表，**未登录行为以 §5/§7 为准**）

> ⚠️ 本表是最早一轮浏览得出的模块清单，其中「未登录 → 302→登录页」是**视图页 GET** 的观测结果。
> 2026-09 复查后确认：**数据 Action 的 POST 未认证时返回 `HTTP 901` + 空 body**（见 §5），
> 而非 302。表里两行 `/cjcx/*` 路径是数据 Action，其 302 结论仅对裸 GET 成立。
> 「需确认哪个为当前启用」这类待办，§7 的实测表已给出答案（`Index` 后缀的那个）。

| 模块 | 视图路径 | 备注 |
|------|----------|------|
| 主菜单/首页 | `/xtgl/index_initMenu.html` | 302→登录页 |
| 个人信息 | `/xsxxxggl/xsxxwh_cxXsxx.html` | 未登录返回「错误提示」独立页（200），需登录；实际查询用 `xsgrxxwh_cxXsgrxx.html` |
| 成绩查询 | `/cjcx/cjcx_cxDgXscj.html` | 302→登录页 |
| 成绩查询(个人) | `/cjcx/cjcx_cxXsgrcj.html` | 302→登录页 |
| 课表查询 | `/kbcx/xskbcx_cxXsKb.html` | 302→登录页 |
| 考试查询 | `/kwgl/kscx_cxXsks.html`、`/ksgl/kscx_cxXsks.html` | 两个路径均存在，需确认哪个为当前启用 |
| 教学评价 | `/jxpj/cxjxpj_cxXsPj.html` | 302→登录页 |
| 选课 | `/xkgl/xsxkcx_cxXsxk.html` | 302→登录页 |
| 验证码 | `/kaptcha` | 失败 3 次后需要 |

## 3. 数据接口模式（已实测 ✅）

正方 V-9 数据接口统一规律（已在 live 站点逐模块验证，见 `src/infrastructure/jwgl/grid.ts` 的 `postGrid` 与各端点模块（`records.ts`/`schedule.ts`））：

- **列表类（jqGrid）通用契约**：
  - `POST` 到**业务 action 路径**，URL 带 `?doType=query&gnmkdm=<功能码>`（2026-08 实测：不传 `su`，服务端按会话识别用户）。
  - **body 必须同时含两套分页参数**（见 §7）：经典字段 `page/rows/sidx/sord/_search/nd`（缺了会被服务端拒绝返回“错误提示”页）**以及** `queryModel.showCount / queryModel.currentPage`（服务端实际用它分页，`showCount=5000` 一次取全）。
  - 头部需带 `Cookie`、`Referer`（视图页路径）、`Content-Type: application/x-www-form-urlencoded;charset=UTF-8`、`X-Requested-With: XMLHttpRequest`。
  - 返回标准 JSON：`{ items: [...], totalCount: N, currentPage, totalPage }`。
- **`gnmkdm` 模块代码（实测确认）**：

  | 功能 | 视图路径 | 数据 action（POST doType=query） | gnmkdm |
  |------|----------|-------------------------------|--------|
  | 学生成绩 | `/cjcx/cjcx_cxDgXscj.html` | `/cjcx/cjcx_cxXsgrcj.html` | `N305005` |
  | 考试信息 | `/kwgl/kscx_cxXsksxxIndex.html` | `/kwgl/kscx_cxXsksxxIndex.html`（2026-08 实测：action 即带 Index 的视图本身；不带 Index 会返回 status=910 空网格） | `N358105` |
  | 选课名单 | `/xkcx/xkmdcx_cxXkmdcxIndex.html` | `/xkcx/xkmdcx_cxXkmdcxIndex.html`（2026-08 实测：带 Index） | `N255010` |
  | 个人课表 | `/kbcx/xskbcx_cxXskbcxIndex.html` | `/kbcx/xskbcx_cxXsgrkb.html`（2026-08 实测，无需刮隐藏字段） | `N2151` |
  | 个人信息 | `/xsxxxggl/xsgrxxwh_cxXsgrxx.html` | （GET 详情页，非 grid） | `N100801` |

- **个人信息（GET 解析）**：`GET /xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801&su=<学号>`，页面结构为 `<label>姓名：</label> ... <p class="form-control-static">张三</p>` 的 标签→值 配对；部分字段（学院/专业/班级）值写在 `id="col_jg_id"` / `col_zy_id` / `col_bh_id` 的 div 内，需兜底解析。客户端在学号未知时（如 `USTS_COOKIES` 注入的会话）**省略 `su` 参数**，服务端按会话识别用户，并从页面把学号补回来。
- **个人课表**：真实数据接口为 `POST /kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151`，body 仅 `xnm/xqm/kzlx=ck/xsdm/kclbdm/kclxdm`，返回 `{xsxx, sjkList}`（2026-08 实测，无需解析 JS 渲染的网格）。网页周网格单元格为 `id="星期-节次"`；实践/MOOC 等无固定节次的课程在 sjkList 中不带 `xqj/jc`。
- **会话依赖**：所有请求携带登录会话 Cookie + 合适 `Referer`；`xnm`(学年，如 `2025`)、`xqm`(学期 `3`=秋/`12`=春/`16`=短学期)。
- **默认学期**：`domain/term.ts` 的 `currentTerm()` 按当前月份推算，与网页一致（2026-08 实测 8 月网页缺省为 `xnm=今年, xqm='3'`）：8~12 月 → `{xnm:今年, xqm:'3'}`；2~7 月 → `{xnm:去年, xqm:'12'}`；1 月 → `{xnm:去年, xqm:'3'}`。

## 4. 登录实现的关键坑（已实测）

### 4.1 RSA 公钥是「按会话绑定」的
服务端在**会话**里临时生成 RSA 密钥对，把私钥存于该会话，只下发公钥。因此：
**取公钥的 GET 请求必须携带与登录 POST 同一个会话 Cookie（JSESSIONID）**，否则服务端用另一个会话的私钥解密，必然「用户名或密码不正确」。
（Node 的 axios 不会自动管理 Cookie，必须自建 cookie jar，并在登录页 GET、公钥 GET、登录 POST、后续查询之间保持同一份 Cookie。）

### 4.2 前置 WAF 会「重置首次登录 POST」——纯脚本双 POST 重试即可登录（2026-08 实测）
响应头会下发 `__jsluid_s` Cookie（`SameSite=None; secure`）。实测结论（2026-08-21 更新，**推翻了旧版「纯脚本登录不可能」的结论**）：
- **会话内首次登录 POST 必被应用层拒绝**：返回 302 跳回登录页，并 Set-Cookie **轮换 JSESSIONID**（会话被重置）。原因不是加密错误（RSA 与公钥逐字节正确），而是瑞数 WAF 对新建会话的首次交互式 POST 判定为待校验。
- **关键：同一 cookie jar 上「第二次登录 POST」即成功**，302 → `index_initMenu.html?jsdm=xs`。重试**不需要**重取 csrftoken/公钥，body 原样（连空 csrftoken 都能成功）；`{csrftoken,yhm,mm}` 单 mm（zfn_api 原样）也可，浏览器行为是双 mm + language/ydType。
- **纯脚本登录已实现为 `loginViaScript()`**：GET 登录页 → GET 公钥 → RSA 加密 → POST（失败则同会话重试一次）。登录后 profile/scores/schedule 实测均可正常取数。**不再需要 Puppeteer/Chrome**。
- **WAF 对短时间内的重复请求做限流**：连续多次登录/查询后会出现 `net::ERR_CONNECTION_CLOSED`（连接层直接重置）。**等待约 30~60 秒后重试即可恢复**。`loginViaScript` 已对连接类错误做最多 3 次退避重试。
- **验证码**（`yzcskz=3`，连续失败 3 次触发）无法用脚本处理：需 `USTS_COOKIES` 注入或 `npm run capture` 人工登录。
- 登录后把会话 Cookie 持久化到用户状态目录的 `session.json`（目录 `0700`、文件 `0600`，必须带 `origin` 且与 `USTS_BASE_URL` 一致才加载），后续查询复用同一 Cookie Jar。旧版 cwd `.session.json` 不再读取（ADR-0004），仅启动提示清理。

## 5. 实现注意事项

- `JwglClient` 已实现：`loginViaScript()`（纯脚本 RSA + 双 POST 重试登录，无需浏览器）、安全 `SessionStore`/`CookieJar`、`ensureValidSession()`/`probeSession()`（主动校验 + 自动重登），以及 `postGrid`/`querySchedule`/`queryClassSchedule`/`getBjkbdyOptions` 等查询方法。
- 响应分类与重试语义见 §5 上一条以及 `docs/contracts/jwgl-endpoints.md`。
- **会话校验：只认正面证据，不靠关键字猜（2026-09 修正）**。未认证时服务端的表现按接口类型分两种，都可以作为「已失效」的**正面证据**：
  - **数据 Action**（`?doType=query&gnmkdm=...` 的 POST）返回 **`HTTP 901` + 空 body + `Content-Length: 0`**（响应头带 `X-Via-JSL`，即瑞数 WAF 之后的应用层判定）。这是最常见的失效表现，也是主动探针实际会看到的东西。
  - **视图页 GET** 返回 `302` 跳转到 `login_slogin.html`，或直接返回登录页 HTML。
  此外，「参数缺失/接口改版」也会被拒（`status=910` 包裹体、「错误提示」独立页），**这两种情况在响应层面与会话失效无法区分**，因此不再用正则猜：`classifyResponse` 把它们标记为 `ambiguous`（抛 `PROTOCOL_CHANGED` + `details.ambiguousSession`），由客户端发起一次探针拿正面证据后再决定是否重登。参考实现：`infrastructure/jwgl/response-policy.ts` + `application/session-manager.ts`。
- **会话生命周期由状态机管理**（`application/session-manager.ts`）：`ensureValidSession()` 先本地恢复，若不在**信任窗口**内则向成绩查询接口发一次探针（要求返回可解析的 `{items,totalCount}` 才算有效）；确认失效则**自动重新登录并重放一次**原操作，重放边界是公开方法（PDF 多步生成链必须整链重跑）。恢复是单飞的（WAF 对重复登录做连接重置），失败后进入冷却期；`unknown`（网络异常）一律 fail-open，绝不升级为「失效」。探针结果按窗口缓存，因此「每条命令多一次预检」的开销只在窗口过期后发生（默认 5 分钟，`USTS_SESSION_TRUST_MS` 可调）。
- 验证码仅在连续失败触发；WAF 限流期间暂停请求、稍后重试即可，无需处理验证码。

## 6. 已实现的 CLI 查询命令（已实测 ✅）

| 命令 | 调用 | 说明 |
|------|------|------|
| `usts scores [--xnm 2025] [--xqm 3]` | `client.queryScores()` | 学生成绩，返回科目/成绩/学分/绩点/教师等 |
| `usts exams [--xnm] [--xqm]` | `client.queryExams()` | 考试安排，返回考试时间/地点 |
| `usts courses [--xnm] [--xqm]` | `client.queryCourseList()` | 选课名单，返回课程/选课学生 |
| `usts profile` | `client.queryProfile()` | 个人信息（姓名/学号/年级/学院/专业/班级/手机） |
| `usts schedule [--xnm] [--xqm]` | `client.querySchedule()` | 个人课表（2026-08 已修复：POST `xskbcx_cxXsgrkb.html`） |
| `usts gpa [--json]` | `client.queryGpa()` | 学业成绩概览；页面字段仍需有效会话确认 |
| `usts notifications [--json]` | `client.queryNotifications()` | 首页通知/待办；字段按 USTS 返回做防御性映射 |
| `usts academia [--json] [--category 名称]` | `client.queryAcademia()` / `queryAcademiaCategory()` | 学业情况：主页面分类概览 + `--category` 拉取某分类课程明细 |
| `usts selected-courses [--xnm] [--xqm] [--json]` | `client.querySelectedCourses()` | 已选课程详情候选接口 N253512，只读 |

- PDF 命令已实现只读请求链：`usts schedule-pdf` 使用 `bjkbdy_cxXnxqsfkz.html` → `xskbcx_cxXsShcPdf.html`；`usts academia-pdf` 使用成绩总表打印模块的多步生成接口。代码会校验登录页、HTTP 状态和 `%PDF-` 文件头。由于 PDF 含个人信息，live 下载需要用户明确指定安全输出路径；当前仅完成代码/build 验证，未在本轮落盘真实 PDF。
- `usts notifications` 已在有效会话下实测：POST `/xtgl/index_cxDbsy.html?doType=query`，请求体使用 `sfyy`、`flag`、`queryModel.showCount/currentPage/sortName/sortOrder` 等字段；当前返回通知数组，本次测试返回 6 条。标题使用 `xxbt`，正文使用 `xxnr`，创建时间使用 `cjsj`。
- `usts gpa` 与 `usts academia` 已在有效会话下实测：GET `/xsxy/xsxyqk_cxXsxyqkIndex.html?gnmkdm=N105515&layout=default`；页面是 HTML + 前端 JavaScript 模板，**分类树嵌在 JS 模板里**（节点形如 `"名称&nbsp;" + $.i18n.get('yqxf')/* 要求学分 */ + ":N&nbsp;" ... + "<span id='showKc<ID>'>"`），解析出 29 个分类节点（根=年级+专业，下分 通识教育课程/专业教育课程/素质拓展课程 等）。
- **学业分类明细（2026-08 实测）**：POST `/xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515`，body `{xfyqjd_id=<showKc的ID>}`，返回**课程数组**（非 items 包装）。字段：`KCH`/`KCMC`/`KCYWMC`(英文)/`XDZT`(修读状态)/`XF`/`KCLBMC`(类别)/`KCXZMC`(性质)/`CJ`(成绩)/`MAXCJ`(最佳)/`JD`(绩点)/`JYXDXNMC`+`JYXDXQMC`(建议学期)/`SFJHKC`(是否计划)/`XSXXXX`(学时组成)。实测 31 个叶子节点中 18 个有数据（如 思想政治类 8 门、大学英语 4 门）；**汇总节点（语言类/通识必修课/根节点）返回空**。`usts academia --category <名称>` 按名称子串匹配拉取。
- `scores` 主接口 `cjcx_cxXsgrcj.html` **被拒/改版**（`PROTOCOL_CHANGED`）时自动回退 `cjcx_cxDgXscj.html`（2026-08 实测可用，返回相同 13 门课）。注意回退**只针对协议层失败**：空结果是正常情况（新学期就是没成绩），不再为它多发一次请求（2026-09 调整）。
- **选课板块课列表（zfn `get_block_courses`）暂未实现**：非选课期 `GET /xsxk/zzxkyzb_cxZzxkYzbIndex.html?gnmkdm=N253512&layout=default` 只返回静态提示「当前不属于选课阶段」（无 `role=tab`/`kklxdm`/`xkkz_id` 隐藏域），zfn 的多步解析无法落地；需在选课期抓包确认板块 tab 结构后再实现。
- `scores` 已实跑取回真实数据（10 门课）；`exams`/`courses` 接口契约已确认（该生对应学期暂为空数据，返回空网格）；`profile` 已正确解析出姓名/学号/年级/班级/手机。
- 课表 `schedule` 因本校课表为 JS 动态加载且其 `xskbcx.js` 被 WAF 拦截，暂未能稳定抓取；后续可尝试从模块 JS 中提取真正的课表数据 Action 或解析 JS 注入的课表变量。

## 7. 2026-08 抓包实测校正（用真实浏览器数据反推的契约）

通过 `tools/capture-browser.mjs`（Puppeteer 可见浏览器 + 自动记录每次导航的最终渲染 DOM 与全部 XHR/fetch 请求体/响应体）抓包，实测结论：

### 7.1 登录曾迁移到 CAS（2026-08 历史，现已回退到经典正方页登录）
> ⚠️ 下述 CAS 流程是旧版抓包结论。**2026-08-21 实测 `login_slogin.html` 经典正方登录已恢复可用**（§4.2 双 POST 重试），纯脚本 `loginViaScript()` 即可登录，无需浏览器。CAS 流程仅作历史参考：
- 登录曾走 **CAS 统一身份认证**：`https://sso.usts.edu.cn/login?service=http://jwgl.usts.edu.cn/sso/jasiglogin/jwglxt`（Angular/NG-ZORRO 表单）。
- **jwgl 与 SSO 均前置瑞数 JSLUID WAF**（`__jsluid_s` cookie），纯 axios 曾拿不到登录表单（返回 `#sso_redirect` JS 挑战重定向页），须用浏览器执行 JS。
- 字段：`input[name="username"]`、`input[type="password"]`（无 name）、隐藏 `captcha_code`（需要验证码时才出现可见输入框）、隐藏 `execution`/`_eventId`/`type`/`geolocation`。
- 登录按钮 `button.login-button`，初始带 `disabled` class，填完表单才可点击；`execution` 令牌随会话绑定，GET 登录页与 POST 提交须保持同一 Cookie。
- **填表单用原生 setter + input/change 事件**（`page.type` 会被 Angular 重渲染截断，实测只输入 2 字符）。
- 出现图形验证码时无法自动处理：CLI 提示改用 `npm run capture` 人工登录，或注入 `USTS_COOKIES`。

### 7.2 列表接口真实契约（scores/exams/courselist）
- 真实 action（浏览器实际 POST）：
  - 成绩：`POST /cjcx/cjcx_cxXsgrcj.html?doType=query&gnmkdm=N305005`
  - 考试：`POST /kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105`（**带 Index**）
  - 选课：`POST /xkcx/xkmdcx_cxXkmdcxIndex.html?doType=query&gnmkdm=N255010`（**带 Index**）
  - 均不传 `su`，服务端按会话识别用户。
- **分页参数的关键坑**（axios 逐项实测）：
  - 服务端**忽略经典 `page/rows`**，实际按 `queryModel.showCount`/`queryModel.currentPage` 分页（默认 showCount=10）；只发 `page/rows` 会一直拿到第一页（数据重复）。
  - **纯 `queryModel.*` body 用 axios 发会被拒**（返回“错误提示”页）；浏览器能发是因带完整浏览器指纹。
  - ✅ 可行做法（已用于 `postGrid`）：**经典字段 `page/rows/sidx/sord/_search/nd` 与 `queryModel.showCount=5000&queryModel.currentPage=N` 同时发送**，一次取全且通过校验。
- 无需旧版臆测的 `gridHidden` 隐藏字段（`jsxx=xs`、`yhm=` 等）——只发 `xnm`/`xqm` 等查询参数即可。

### 7.3 个人课表真接口
- `POST /kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151`，body：`xnm=<学年>&xqm=<学期>&kzlx=ck&xsdm=&kclbdm=&kclxdm=`
- 响应 `{ qsxqj, xsxx:{...}, sjkList:[...] }`；`sjkList` 条目字段：`kcmc`(课程) `jsxm`(教师) `jxbzh`(教学班) `xqmc`(校区) `xf`(学分) `qsjsz`(周次) `kclb`(课程类别) `khfsmc`(考核方式) `xnmc`(学年)。有固定排课的条目才有 `xqj`(星期)/`jc`(节次，形如 `5-6`)；实践课/MOOC 无固定节次则不带。
- 网页渲染的周网格单元格为 `<td id="星期-节次" class="td_wrap">`。

### 7.4 字段映射实测
- 成绩：教师字段是 `jsxm`；**选课名单：教师是 `jsmc`（不是 `jsxm`，旧代码取不到导致教师列空）**；考试字段因该学期无数据未验证（命令内保留防御性 `pick()`）。
- 缺省学期：8 月网页缺省 `xnm=今年, xqm='3'`（即将到来的秋季学期），`currentTerm()` 已对齐；只给 `-y` 时学期留空 = 该学年全部学期（与网页一致）。

### 7.5 抓包产物
- `captures/*.html`：每页最终渲染 DOM；`captures/network.jsonl`：全部 XHR 请求体+响应体；`captures/summary.md`：去重接口清单。均已 gitignore，抓包目录为 `0700`、文件为 `0600`（含个人真实数据）。

### 7.6 班级课表（bjkbdy，N214505，2026-08 实测）
- 视图页：`GET /kbdy/bjkbdy_cxBjkbdyIndex.html?gnmkdm=N214505`。**学院/校区/年级/培养层次等选单选项内嵌在 HTML 里**（chosen-select，`display:none`），需按 `name="jg_id"` 等定位后截取到 `</select>` 解析 `<option>`。
- 级联下拉（GET，均带 `_=<时间戳>&gnmkdm=N214505`）：
  - 专业：`/xtgl/comm_cxZydmList.html?jg_id=<学院>&zyh_id_cx=` → `[{zyh_id, zymc}]`
  - 班级：`/xtgl/comm_cxBjdmList.html?jg_id=<学院>&zyh_id=<专业>&bh_id=&njdm_id=<年级>` → `[{bh_id, bh(班级编号), bj(班级名), jgmc, zymc, njmc}]`
- 课表数据：`POST /kbdy/bjkbdy_cxBjKb.html?gnmkdm=N214505`，body 需带 `xnm/xqm/xnmc/xqmmc/xqh_id/njdm_id/zyh_id/bh_id/tjkbzdm=1/tjkbzxsdm=0/zymc/jgmc/njmc/bj/bh/kzlx=ck` 等。
  **关键坑：`bh` 必须传班级编号（如 2520401000）且与 bh_id 对应，传班级名或留空会返回空 kbList**；`xkrs`/`zs` 等字段非必需。
  返回 `{ kbList, sjkList, xqjmcMap, weekNum, ... }`：
  - `kbList` 排课条目：`kcmc`(课程) `xm`(**教师，注意不是 jsxm**) `zcmc`(职称) `xqj`(星期) `xqjmc` `jcor`(节次，形如 "7-9") `cdmc`(教室) `cdlbmc`(场地类别) `zcd`(周次) `xf`(学分) `kcxzjc`(必修/选修) `jxbzc`(教学班组成) `jgh_id`(教师工号)。占位条目 `cdmc='未排地点'` 需过滤。
  - `sjkList` 实践课：`qtkcgs`/`sjkcgs` 文本摘要。
- CLI 命令 `usts clsched`：交互式级联（校区→年级→学院→专业→班级），或 `--jg/--zy/--bh`（id 或名称均可，名称按子串匹配）直接查询任意班级。
