# ADR-0008：以 Go 重写 CLI，并保留分层边界

状态：Accepted

## 背景

现有 TypeScript 版已经完成命令注册表、用例层、会话状态机与端点适配器拆分。继续演进时，主要成本来自：

- 单文件二进制分发与跨平台启动体验；
- 编译期接口检查，以及并发会话恢复的显式建模；
- 把 HTTP、Cookie、HTML 解析与 CLI 展示继续隔离在稳定边界内。

接口资料已经沉淀在 `WEB_ARCHITECTURE.md`、`docs/contracts/jwgl-web-api-catalog.md` 与
`docs/contracts/jwgl-endpoints-inventory.tsv`，具备重写条件。

## 决策

1. 在 `rewrite/go` 分支新增 Go 实现，TypeScript 版暂时保留，作为行为基线。
2. 保留原依赖方向：`cli -> application -> domain`，基础设施实现向内依赖。
3. Go 版使用 `cmd/usts + internal/*`，不暴露可被外部误用的公共 SDK。
4. 会话三态、单飞恢复、冷却、按副作用重试、同源下载与双分页网格继续作为硬约束。
5. 命令注册表继续作为唯一描述源，统一 flag、帮助、菜单、JSON 与退出码。
6. 远端字段、HTML 解析和响应分类只放在 `internal/infrastructure/jwgl`。

## 后果

- 两个实现短期并存，修改接口契约时需要同时核对；通过契约文档和夹具测试降低漂移。
- Go 二进制可以直接交叉编译，不再要求用户安装 Node.js。
- 会话与传输逻辑可以在 `httptest` 和纯函数测试中覆盖，不需要启动真实教务系统。
- 在完成 TS/Go 行为对比前，npm 发布链路保持不动。
