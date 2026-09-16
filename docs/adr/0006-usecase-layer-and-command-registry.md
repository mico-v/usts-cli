# ADR-0006：命令注册表 + 查询用例层

状态：Accepted

## 背景

端口/适配器分层已经完成（`infrastructure/` 是干净的适配器，`application/session-manager.ts` 可脱离 HTTP 单测），但**中间那一层是空的**：命令直接拿网关取数并顺手做业务判断，注册信息散在五处。

具体症状：

1. **一个命令要改五个地方**——`index.ts`（Commander 注册）、`commands/interactive.ts`（菜单项 + `QueryType` + `switch` + 参数表单）、`commands/help.ts`（`COMMAND_HELP` 文档）、`lib/client.ts`（委托方法）、`application/ports/jwgl-gateway.ts`（窄接口）。`never` 穷尽只兜住了菜单那一处，其余四处靠人肉记忆，`CLAUDE.md` 里那份 6 步「Extension pattern」就是这种结构的补丁。
2. **业务规则落在两端**——`commands/scores.ts` 里既有命令编排，又有「用接口返回的 `xnmmc`/`xqmmc` 覆盖标题」「学分合计」「空结果不等于出错」这些规则；`lib/client.ts` 的 `queryProfile()` 里混着「从个人页学到学号并落盘」的身份规则和会话状态。
3. **测试被迫走子进程**——命令把取数、规则、渲染绑在一起，主路径只能在 `spawnSync` 里打 `dist/`（而 `spawnSync` 阻塞事件循环，所以不能在子进程里起假服务器，见 `CLAUDE.md`）。

## 决策

### 1. 命令注册表（`commands/registry.ts`）

每个命令一个 `CommandSpec`：`id`、`summary`、`term`、`options`、`menu`、`help`、`interactive`、`run`。

- `index.ts` 遍历 `ALL_SPECS` 做 Commander 装配，不再手写命令；
- 交互式菜单由 `QUERY_SPECS`（`ALL_SPECS` 里带 `menu` 的那些）生成，顺序即声明顺序；
- `--help` 尾部说明与 `usts help <命令>` 都取自 spec 的 `help` 字段；
- 菜单里的参数表单（学年/学期、课程性质、PDF 文件名）由 spec 的 `interactive` 提供，取消返回 `null`。

新增查询命令 = 加一个 spec（+ 适配器、端口方法、用例与渲染），**不再需要改菜单、帮助或路由**。原先 `QueryType` + `never` 穷尽检查的用途被「加 spec 即自动进菜单」取代，因此它作为冗余机制被删除——菜单清单与命令表由同一份数据派生，不再可能漂移。

### 2. 查询用例层（`application/usecases/`）

用例返回与展示无关的 view（`readScores` → `{ items, totalCredit }`），终端渲染在 `commands/render/*`，会话校验留在命令入口（`ensureSession` 会打印并设置退出码，属于 CLI 语义）。

首批落地 `usecases/scores.ts` + `commands/render/scores.ts` 作为样板，其余查询按同一形状迁移。

顺带把五个纯学期规则（`resolveTerm`、`termLabel`、`semesterLabel`、`academicYearLabel`、`xqmName`）从 `commands/_shared.ts` 移到 `domain/term.ts`：它们本来就是纯规则，放在命令层会导致用例层反向依赖命令层。

## 原因

- 注册信息有多份副本时，"忘记同步"不是纪律问题而是结构问题；把副本合成一份，比反复强调"记得改五处"便宜。
- 用例层让业务规则只存在于一个地方，命令退化为"校验会话 → 调用例 → 渲染"，两端都不再顺手做判断。
- 渲染只吃 view，因此可以在进程内断言输出，不必 spawn 子进程；测试重心可以从子进程端到端转向用例 + 渲染（子进程测试只留退出码、输出通道、非 TTY 这几类真正的进程级契约）。

## 后果

- `index.ts` 从 267 行降到约 110 行，只剩错误/退出码边界与启动顺序；`commands/interactive.ts` 不再持有命令清单。
- `commands/registry.ts` 成为命令描述的唯一出处，代价是它同时装着各命令的帮助文本（约 330 行，其中大半是文档）；后续若继续膨胀，可按"文档文本"再拆一次，但不拆回"每个命令一个模块"，否则注册表又要靠 import 清单维持顺序。
- 命令层与用例层的边界需要持续维护：**终端渲染、退出码、交互提示留在命令层；取数与业务规则进用例层**。
- 未迁移的命令暂时保持现状（spec 的 `run` 直接调用原命令函数），可以逐个搬，不需要一次性改完。

## 后续调整

同一天完成的目录与适配器归位见 [ADR-0007](0007-layering-cleanup.md)：`commands/` 改名 `cli/`、`lib/` 撤除、
façade 更名 `JwglGateway` 并移入 `infrastructure/jwgl/`、端口改为 `Pick` 派生、`types/api.ts` 按输出域拆分。
本 ADR 正文里的 `commands/*`、`lib/client.ts` 等路径按当时的仓库状态保留。
