# USTS CLI 架构

## 目标

项目采用模块化单体和端口/适配器风格。CLI 是表现层，正方教务系统是不稳定的外部系统，二者之间必须通过应用契约和防腐层隔离。

运行时基线为 Node.js `>=22.12`，不为更低版本增加兼容分支。

依赖方向固定为：

```text
cli -> application/domain <- infrastructure
```

基础设施可以依赖领域类型，领域层不得依赖 Axios、文件系统、Commander 或 Inquirer。

## 当前模块

- `src/domain`：稳定错误、学期等纯领域规则（`term.ts` 的 `currentTerm`/`displaySemester`/`academicYearName`），以及会话状态契约（`session.ts` 的三态 `SessionState`）。
- `src/application`：应用契约与用例。`ports/jwgl-gateway.ts` 定义各命令依赖的窄接口；`session-manager.ts` 是会话状态机（信任窗口、单飞恢复、失败冷却），只通过 `SessionPort` 做 I/O，可脱离 HTTP 单测。
- `src/config`：配置解析、信任边界（`trust.ts` 保存启动时的真实环境快照，供 `config.ts` 判定信任开关）和跨平台状态/配置路径。
- `src/infrastructure/http`：`transport.ts`（连接池、重试与退避策略、超时分类）与 `authenticated-transport.ts`（`AuthenticatedTransport`：Cookie Jar、重试、同源跳转跟随、表单请求头）。Axios 只允许出现在这两处和 façade。
- `src/infrastructure/session`：版本化、安全、原子会话存储。
- `src/infrastructure/jwgl`：端点适配器（`auth.ts`/`records.ts`/`schedule.ts`/`academia.ts`/`document-api.ts`/`grid.ts`）、响应分类（`response-policy.ts`）、纯页面解析器（`*-page.ts`）、请求体构造（`documents.ts`/`form.ts`/`class-schedule-page.ts`）和领域映射（`mappers.ts`）。这些模块只接收一个 `AuthenticatedTransport`，不含会话状态。
- `src/lib`：兼容 façade（`client.ts`：会话状态、`SessionPort`、`withReauth` 重放边界、委托调用）与配置/输出辅助。
- `src/types`：`api.ts` —— 端口、适配器与命令共用的稳定结果形状（`RawFields` 只在本文件内使用）。层级上位于 `domain` 之上、`application` 之下。
- `src/shared`：`sanitize.ts` —— 终端输出净化与密钥脱敏，唯一的横切叶子模块。
- `src/commands`：CLI 用例编排和人类可读展示。
- `tools`：抓包和开发检查，不属于生产运行链路。

## 依赖规则

1. Axios 只能出现在 HTTP 基础设施和兼容 façade。
2. 远端字段名只能出现在 `infrastructure/jwgl` 或端点适配器；命令层不得再出现 `pick(item, ['kcmc', ...])` 式的字段挑选。
3. 命令不得自行实现 HTTP、Cookie、重试或页面解析。
4. 应用错误必须具有稳定错误码，不能依靠中文字符串作为跨层契约。`reportCommandError` 中的中文正则只是未迁移旧路径的兼容垫片，新逻辑不得依赖它。
5. 所有远端写操作必须显式声明副作用和幂等语义：`mutation` 不自动重试也不参与会话重放；`download` 允许传输层重试，且只能在**整个方法**这一层被会话失效重放（多步生成链不可部分重放）。
6. 会话有效性只能由正面证据判定。网络异常与无法解释的响应一律记为 `unknown` 并 fail-open，不得升级为「会话失效」——错误的失效判定会触发一次注定失败的登录，反而把用户带进 WAF 限流。
7. 单个源码文件原则上不超过 800 行，持续将 façade 能力向模块迁移。
8. 配置只能来自用户配置目录或真实环境变量，**不得读取当前工作目录**；会放宽信任边界的开关只能来自真实环境变量（ADR-0005）。

## 演进方向

按端点能力拆分已完成：`JwglClient` 现在只承担会话状态与对外委托，端点适配器按记录/课表/学业/文档/认证分到
`infrastructure/jwgl/` 各自的模块，共享同一个 `AuthenticatedTransport`、`CookieJar` 与 `SessionStore`。
后续新增查询按 `CLAUDE.md` 的「Extension pattern」落位即可，不需要再动 façade 的结构。
