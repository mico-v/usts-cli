# 正方接口契约

每个端点必须记录：方法、路径、认证、请求字段、响应结构、副作用、幂等性、超时、响应大小、重试规则、错误和脱敏夹具。

## 公共约束

- Base URL 默认固定为 `https://jwgl.usts.edu.cn/jwglxt`。
- 登录后请求使用同源 Cookie、浏览器 UA、正确 Referer；XHR 接口携带 `X-Requested-With`。
- 非预期 JSON/HTML 字段视为 `PROTOCOL_CHANGED`，不得静默映射为空对象。

## 响应分类契约

所有响应先经 `classifyResponse` 归类，再决定抛错与是否重登。**只有正面证据才算「会话失效」**：

| 观察到的响应 | 结论 |
|---|---|
| `HTTP 901` + 空 body（数据 Action 未认证，2026-09 实测） | `session-expired` |
| `3xx` 且 `Location` 指向登录页 | `session-expired` |
| `200` + 登录页 HTML（`请先登录`/`登录超时`/`login_slogin`） | `session-expired` |
| `3xx` 且 `Location` 不指向登录页，或无 `Location` | `ambiguous` |
| `401` | `ambiguous` |
| `200` + `{status:910}` / 「错误提示」页 / 非 JSON / 缺少 `items`·`totalCount` | `ambiguous` |
| `429` | `rate-limited` |
| 其它 `4xx`/`5xx` | `server-error` |

`ambiguous` **不是**结论而是疑问：调用方（`JwglClient.withReauth`）会向探针端点发一次请求拿正面证据，再决定重登重放还是如实报 `PROTOCOL_CHANGED`。网络异常与 WAF 连接重置记为 `unknown`，一律 fail-open，不得升级为失效。

分页列表的**任何一页**出现非 JSON、或 JSON 体缺少 `items`/`totalCount`，都按 `ambiguous` 抛错——绝不返回截断后的部分结果。

## 重试与副作用契约

传输失败按**错误对象**分类，不能只看 message：axios 的超时错误 `code` 是 `ECONNABORTED`，message 却是 `"timeout of Nms exceeded"`（不含 `ETIMEDOUT`/`ECONNABORTED` 字样）。只匹配 message 会让最常见的那类失败——连接被对端静默丢弃——从不重试，表现为一次静默挂起后直接报错。

| 失败类型 | 判定 | 重试 | 退避 |
|---|---|---|---|
| 超时 | `code` 为 `ECONNABORTED`/`ETIMEDOUT`，或 message 含 timeout | 见下表 | 短（250ms 量级）：对端多半已静默丢弃这条连接，立刻换一条即可 |
| 连接 | `ECONNRESET`/`ECONNREFUSED`/`EPIPE`/`ERR_CONNECTION`/`socket hang up` | 见下表 | 长（3s 起指数）：更可能是 WAF 限流，必须退避 |
| 其它（证书、DNS 等） | 其余 | 否 | — |

| effect | 尝试次数 | 是否重试超时 | 理由 |
|---|---:|---|---|
| `read` | 3 | 是 | |
| `auth` | 3 | **否** | 超时的登录 POST 可能已在服务端生效，重发会重复计入失败次数，更快撞上验证码锁定（`yzcskz=3`）。登录的重复提交由 `loginViaScript` 按「首次 POST 被 WAF 重置」这一实测规律精确控制 |
| `download` | 2 | 是 | 单步值得换连接重试，但 PDF 生成链不能无限拖长 |
| `mutation` | 1 | 否 | 结果不明确时必须通过只读查询确认 |

单次请求超时：普通请求 15 秒（正方正常响应在 1~2 秒内），下载/生成链 45 秒。每次重试前通过 `onRetry` 输出提示（走 stderr），静默等待会被用户当成死机。

若超时集中出现在「空闲一段时间后的第一个请求」，怀疑对象是 keep-alive 复用了一条已被 WAF 静默回收（不发 FIN）的连接——当前靠换连接重试兜底。

抓包夹具必须脱敏 Cookie、密码、csrftoken、学号、姓名和课程隐私数据后才能进入版本库。

## 已实现端点摘要

| operationId | 方法与路径 | 认证 | effect | 主要响应 |
|---|---|---|---|---|
| loginPage | GET `/xtgl/login_slogin.html` | 否 | auth | HTML/csrftoken |
| loginPublicKey | GET `/xtgl/login_getPublicKey.html` | 会话关联 | auth | modulus/exponent |
| loginSubmit | POST `/xtgl/login_slogin.html` | 会话关联 | auth | 302/index_initMenu |
| queryScores | POST `/cjcx/cjcx_cxXsgrcj.html` | 是 | read | grid items |
| queryScores（探针） | POST `/cjcx/cjcx_cxXsgrcj.html`（`showCount=1`） | 是 | read | `{items,totalCount}` 可解析即为「会话有效」的正面证据 |
| queryExams | POST `/kwgl/kscx_cxXsksxxIndex.html` | 是 | read | grid items |
| queryCourseList | POST `/xkcx/xkmdcx_cxXkmdcxIndex.html` | 是 | read | grid items |
| querySchedule | POST `/kbcx/xskbcx_cxXsgrkb.html` | 是 | read | `sjkList` |
| queryClassSchedule | POST `/kbdy/bjkbdy_cxBjKb.html` | 是 | read | `kbList/sjkList` |
| queryNotifications | POST `/xtgl/index_cxDbsy.html` | 是 | read | array/grid |
| queryAcademia | GET `/xsxy/xsxyqk_cxXsxyqkIndex.html` | 是 | read | HTML |
| querySelectedCourses | POST `/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html` | 是 | read | array/grid |
| downloadSchedulePdf | POST `/kbdy/bjkbdy_cxXnxqsfkz.html` → `/kbcx/xskbcx_cxXsShcPdf.html` | 是 | download | PDF |
| downloadAcademiaPdf | POST `/bysxxcx/xscjzbdy_dy*` 六步生成链 + 同源 GET | 是 | download | PDF |

