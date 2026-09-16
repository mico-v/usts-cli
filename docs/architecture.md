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

- `src/domain`：稳定错误、学期等纯领域规则（`term.ts`：`currentTerm`/`resolveTerm`/`displaySemester`/`academicYearName` 以及学年学期的中文标签），以及会话状态契约（`session.ts` 的三态 `SessionState`）。
- `src/application`：应用契约与用例。`ports/jwgl-gateway.ts` 定义各命令依赖的窄接口；`session-manager.ts` 是会话状态机（信任窗口、单飞恢复、失败冷却），只通过 `SessionPort` 做 I/O，可脱离 HTTP 单测；`usecases/*.ts` 是查询用例——只描述「这次查询要什么、拿到什么」，返回与展示无关的 view，不渲染、不管会话（ADR-0006）。
- `src/config`：配置解析、信任边界（`trust.ts` 保存启动时的真实环境快照，供 `config.ts` 判定信任开关）和跨平台状态/配置路径。
- `src/infrastructure/http`：`transport.ts`（连接池、重试与退避策略、超时分类）与 `authenticated-transport.ts`（`AuthenticatedTransport`：Cookie Jar、重试、同源跳转跟随、表单请求头）。Axios 只允许出现在这两处和网关适配器。
- `src/infrastructure/session`：版本化、安全、原子会话存储。`src/infrastructure/documents`：`FileDocumentStore` —— PDF 落盘的原子写入与 `0600` 权限（端口在 `application/ports/document-store.ts`）。
- `src/infrastructure/jwgl`：端点适配器（`auth.ts`/`records.ts`/`schedule.ts`/`academia.ts`/`document-api.ts`/`grid.ts`）、响应分类（`response-policy.ts`）、纯页面解析器（`*-page.ts`）、请求体构造（`documents.ts`/`form.ts`/`class-schedule-page.ts`）和领域映射（`mappers.ts`）。这些模块只接收一个 `AuthenticatedTransport`，不含会话状态。
- `src/infrastructure/jwgl/gateway.ts`：端点适配器 `JwglGateway`——唯一持有传输层与会话状态的类（会话状态、`SessionPort`、`withReauth` 重放边界、对各端点模块的委托）。它不含远端字段名，也不含面向人的文案：重试通知保持结构化上报，文案与输出通道由 `cli/create-client.ts` 绑定。
- `src/types`：`records.ts` / `academia.ts` / `schedule.ts` / `identity.ts` —— 按输出域拆分的稳定结果形状，端口、适配器与命令共用（`RawFields` 只在 `schedule.ts` 内用于下拉选项的 `meta`）。层级上位于 `domain` 之上、`application` 之下。
- `src/shared`：`sanitize.ts` —— 终端输出净化与密钥脱敏，唯一的横切叶子模块。
- `src/cli`：CLI 编排与展示。`registry.ts` 是**命令描述的唯一出处**（命令名、参数、菜单项、帮助文本、交互式表单、执行体，ADR-0006）；`create-client.ts` 是网关装配点（把结构化重试通知接到 stderr），`logger.ts`/`format.ts` 负责终端文本；`prompts.ts` 与 `clsched-cascade.ts` 是 inquirer 表单片段；`render/*` 只吃用例返回的 view、只往 stdout 写；其余 `*Command` 负责「校验会话 → 调用例 → 渲染 → 错误码」。
- `tools`：抓包和开发检查，不属于生产运行链路。

## 依赖规则

1. Axios 只能出现在 HTTP 基础设施和网关适配器（`infrastructure/jwgl/gateway.ts`）。
2. 远端字段名只能出现在 `infrastructure/jwgl` 或端点适配器；命令层不得再出现 `pick(item, ['kcmc', ...])` 式的字段挑选。
3. 命令不得自行实现 HTTP、Cookie、重试或页面解析。
4. 应用错误必须具有稳定错误码，不能依靠中文字符串作为跨层契约。`reportCommandError` 中的中文正则只是未迁移旧路径的兼容垫片，新逻辑不得依赖它。
5. 所有远端写操作必须显式声明副作用和幂等语义：`mutation` 不自动重试也不参与会话重放；`download` 允许传输层重试，且只能在**整个方法**这一层被会话失效重放（多步生成链不可部分重放）。
6. 会话有效性只能由正面证据判定。网络异常与无法解释的响应一律记为 `unknown` 并 fail-open，不得升级为「会话失效」——错误的失效判定会触发一次注定失败的登录，反而把用户带进 WAF 限流。
7. 单个源码文件原则上不超过 800 行，持续把适配器里的能力向模块迁移。
8. 命令的注册信息（命令名、参数、菜单项、帮助文本、交互式表单）只能来自 `cli/registry.ts`；命令层负责终端渲染、退出码与交互提示，业务规则属于 `application/usecases/`（ADR-0006）。
9. 配置只能来自用户配置目录或真实环境变量，**不得读取当前工作目录**；会放宽信任边界的开关只能来自真实环境变量（ADR-0005）。
10. 面向人的文案（提示、标题、重试说明）不得出现在 `domain/`、`application/` 与 `infrastructure/`：它们要么是 `cli/render/*`，要么由 `cli/` 注入（如 `onRetry`）。

## 演进方向

按端点能力拆分已完成：适配器（`infrastructure/jwgl/gateway.ts`）只承担会话状态与对外委托，端点模块按记录/课表/
学业/文档/认证分到 `infrastructure/jwgl/` 各自的文件，共享同一个 `AuthenticatedTransport`、`CookieJar` 与 `SessionStore`。

命令注册表、查询用例层与分层归位也已落地（ADR-0006 / ADR-0007）：所有查询命令都是
「`ensureSession` → 用例 → 渲染 → `reportCommandError`」，`cli/` 不持有命令清单，`types/` 按输出域拆分。

后续的常规演进是：

1. 新查询按 `CLAUDE.md` 的「Extension pattern」落位（结果类型 → 端点适配器 → 适配器方法 → 用例 + 渲染 → 一个 `CommandSpec`）。
2. 命令若有新的业务规则（阈值、回退、聚合），进 `application/usecases/` 而不是命令层；命令层只保留会话校验、渲染、退出码与交互提示。
3. 需要新 I/O 时优先加端口（照 `DocumentStore`/`SessionStore` 的形状），在 `infrastructure/` 里实现，用例保持可用假实现测试。
