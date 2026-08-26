# 正方接口契约

每个端点必须记录：方法、路径、认证、请求字段、响应结构、副作用、幂等性、超时、响应大小、重试规则、错误和脱敏夹具。

## 公共约束

- Base URL 默认固定为 `https://jwgl.usts.edu.cn/jwglxt`。
- 登录后请求使用同源 Cookie、浏览器 UA、正确 Referer；XHR 接口携带 `X-Requested-With`。
- 3xx 或登录页 HTML 视为 `SESSION_EXPIRED`。
- 非预期 JSON/HTML 字段视为 `PROTOCOL_CHANGED`，不得静默映射为空对象。
- 当前全部业务查询为 `effect=read`；未来写操作必须使用 `effect=mutation`。

## 已实现端点摘要

| operationId | 方法与路径 | 认证 | effect | 主要响应 |
|---|---|---|---|---|
| loginPage | GET `/xtgl/login_slogin.html` | 否 | auth | HTML/csrftoken |
| loginPublicKey | GET `/xtgl/login_getPublicKey.html` | 会话关联 | auth | modulus/exponent |
| loginSubmit | POST `/xtgl/login_slogin.html` | 会话关联 | auth | 302/index_initMenu |
| queryScores | POST `/cjcx/cjcx_cxXsgrcj.html` | 是 | read | grid items |
| queryExams | POST `/kwgl/kscx_cxXsksxxIndex.html` | 是 | read | grid items |
| queryCourseList | POST `/xkcx/xkmdcx_cxXkmdcxIndex.html` | 是 | read | grid items |
| querySchedule | POST `/kbcx/xskbcx_cxXsgrkb.html` | 是 | read | `sjkList` |
| queryClassSchedule | POST `/kbdy/bjkbdy_cxBjKb.html` | 是 | read | `kbList/sjkList` |
| queryNotifications | POST `/xtgl/index_cxDbsy.html` | 是 | read | array/grid |
| queryAcademia | GET `/xsxy/xsxyqk_cxXsxyqkIndex.html` | 是 | read | HTML |
| querySelectedCourses | POST `/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html` | 是 | read | array/grid |

## 重试契约

- `read`：仅连接重置、连接拒绝和超时等传输错误可有限重试。
- `auth`：由登录状态机控制，不能把业务失败当成传输重试。
- `download`：收到响应后不得因内容校验失败自动重发生成链。
- `mutation`：自动尝试次数固定为 1；结果不明确时必须通过只读查询确认。

抓包夹具必须脱敏 Cookie、密码、csrftoken、学号、姓名和课程隐私数据后才能进入版本库。
