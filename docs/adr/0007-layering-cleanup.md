# ADR-0007：分层归位（cli/ 布局、网关适配器、文案边界、types 拆分）

状态：Accepted

## 决策

ADR-0006 定下了「命令注册表 + 查询用例层」，但没有动目录与适配器的位置。这一步把它们收尾：

### 1. `commands/` → `cli/`，删除 `lib/`

`lib/` 里四个模块互不相关，纯粹是扁平布局的遗留：

| 原位置 | 新位置 | 理由 |
|---|---|---|
| `lib/client.ts` | `infrastructure/jwgl/gateway.ts` | 它持有传输层与会话状态，是**端点适配器**，不是「兼容层」。类名 `JwglClient` → `JwglGateway` |
| `lib/env.ts` | `config/env.ts` | 读配置文件属于配置层（`trust.ts` 早已把 `lib/env.ts` 写进环境快照，见 ADR-0005） |
| `lib/logger.ts`、`lib/format.ts` | `cli/logger.ts`、`cli/format.ts` | 颜色、符号、表格与人可读时长都是终端展示 |
| `commands/*` | `cli/*` | 与上面三个同级：整个 `cli/` 就是表现层与组合根 |

`cli/` 因此只剩一件事：编排、交互、渲染。

### 2. 端口由 `Pick` 派生，不再手写

`application/ports/jwgl-gateway.ts` 先声明完整表面 `JwglPort`，再由它派生每个命令用的窄端口：

```ts
type SessionCapability = keyof SessionGateway;
export type ScoresGateway = Pick<JwglPort, SessionCapability | 'queryScores'>;
```

原先 13 个手写接口（每个都是「会话能力 + 一个方法」）会随命令数线性增长，且每次改签名都要改两处。
`Pick` 零运行时代价，单测里的假网关依旧只实现用到的那一两个方法。

### 3. 面向人的文案不许下沉

`JwglGateway` 不再拼中文重试提示：它把结构化的 `RetryNotice`（`kind`/`attempt`/`delayMs`）交给
`onRetry`，由 `cli/create-client.ts` 决定文案与输出通道（stderr）。这与传输层已有的约定一致
（`TransportOptions.onRetry` 的注释就写着「文案属于展示层」）。现在「CLI 装配点」是一个可指认的文件，
生产构造只有它一处。

### 4. `types/api.ts` 按输出域拆分

`records.ts`（成绩/考试/选课名单/已选课程/通知）、`academia.ts`（GPA 与学业情况）、
`schedule.ts`（个人课表、班级课表、下拉选项）、`identity.ts`（登录响应、个人信息）。
一个文件承载 17 个导出时，「谁都能往里塞字段」是默认结果；按输出域拆开后，每个类型的归属是明确的。

### 5. PDF 落盘走端口

`application/ports/document-store.ts` + `infrastructure/documents/file-document-store.ts`，
延续 `SessionStore`/`FileSessionStore` 的既有形状。用例因此可以在内存假实现上测
「已存在且未加 `--force` 时**先**拒绝、不去跑下载链」这条顺序规则，而 `0600` + 原子 rename
由适配器自己保证。

## 原因

- 目录是给人（和后续会话）看的索引。`lib/` 这种名字解释不了任何东西，而 `infrastructure/jwgl/gateway.ts`
  一眼就能看出它是什么、在哪一层。
- 规范只有落在「结构上不可能违反」时才成立：端口派生、文案注入、落盘端口都属于这一类，
  它们把 ADR-0006 的边界从「评审时记得检查」变成了「不这么写就编译不过/测不过」。

## 后果

- `src/` 顶层只剩 `application`、`cli`、`config`、`domain`、`infrastructure`、`shared`、`types` —— 每个都能一句话说明白。
- `JwglGateway` 用 `implements JwglPort, AuthGateway, SessionPort` 显式声明实现关系：适配器漏实现某个端口方法会**编译失败**，
  而不是等到某个命令在运行时才炸。原先的 `implements SessionPort` 只覆盖了会话那一半。
- 重试提示的默认输出从「适配器内部兜底」改成「CLI 装配时注入」。若将来有人绕过 `cli/create-client.ts`
  直接 `new JwglGateway()`，重试会静默（表现为疑似卡死）。这是有意的取舍：基础设施不产出人类文案；
  两处生产构造点都在 `cli/` 内。
- `types/` 的四个文件没有桶文件（barrel）：引用方直接指向具体模块，避免又多一个「谁都能改」的入口。
- 不影响任何用户可见行为与退出码；`--json` 的字段与信封保持不变（用例的 view 里带着原始结果，
  命令层从 view 取它输出 JSON，而不是另发一次请求）。
