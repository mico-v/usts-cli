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

- `src/domain`：稳定错误、学期等纯领域规则。
- `src/config`：配置解析、信任边界和跨平台路径。
- `src/infrastructure/http`：连接池、Cookie Jar、重试策略。
- `src/infrastructure/session`：版本化、安全、原子会话存储。
- `src/infrastructure/jwgl`：正方 DTO 解析、验证和领域映射。
- `src/lib/client.ts`：兼容 façade。现有命令继续依赖它，端点能力将逐步迁移到独立 API 模块。
- `src/commands`：CLI 用例编排和人类可读展示。
- `tools`：抓包和开发检查，不属于生产运行链路。

## 依赖规则

1. Axios 只能出现在 HTTP 基础设施和兼容 façade。
2. 远端字段名只能出现在 `infrastructure/jwgl` 或端点适配器。
3. 命令不得自行实现 HTTP、Cookie、重试或页面解析。
4. 应用错误必须具有稳定错误码，不能依靠中文字符串作为跨层契约。
5. 所有远端写操作必须显式声明副作用和幂等语义；默认禁止自动重试。
6. 单个源码文件原则上不超过 800 行，持续将 façade 能力向模块迁移。

## 演进方向

`JwglClient` 后续按能力拆为 `AuthApi`、`RecordsApi`、`ScheduleApi`、`CourseApi`、`DocumentApi`，共享同一 `HttpTransport`、`CookieJar` 和 `SessionStore`。在迁移完成前，façade 保证现有公开方法兼容。
