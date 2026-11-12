# USTS CLI Go 重写架构

## 目标

Go 版与现有 TypeScript 版在 `rewrite/go` 分支并行开发，先保持用户可见契约稳定，再逐步替换发布链路。

核心约束：

- 只读查询。支付、退课、报名等远端写操作不进入 CLI。
- 会话有效性只由正面证据判定，网络异常不得升级为“会话失效”。
- 远端字段只出现在 `internal/infrastructure/jwgl`，CLI 和用例不接触正方拼音字段。
- 错误使用稳定 `ErrorCode`，中文文案只属于展示层。
- 命令注册表是命令名、帮助、菜单与执行体的唯一描述源。
- 配置不读取当前工作目录；放宽主机/HTTP 信任边界的开关只认真实环境变量。

## 包结构

```text
cmd/usts
  main.go                  进程入口、配置加载、依赖装配、退出码

internal/domain
  errors.go                稳定错误码与退出码
  term.go                  学年/学期规则
  session.go               会话三态与恢复结果
  models.go                跨层稳定结果类型

internal/application
  session.go               会话状态机、单飞恢复、失败冷却
  ports.go                 用例依赖的窄网关接口
  usecases_*.go            成绩、课表、空闲教室、计划、文档等业务规则

internal/infrastructure/httpclient
  cookie_jar.go            域/路径/Secure/过期规则
  transport.go             Keep-Alive、重试、超时、同源跳转

internal/infrastructure/jwgl
  client.go                会话状态与重放边界
  auth.go                  探针、正方 RSA 登录、双 POST
  response.go              响应分类与 PDF 校验
  grid.go                  双分页网格协议
  *_page/parse_html.go     纯 HTML 解析
  mappers.go               远端字段 -> 领域模型
  records/schedule/...     按业务域拆分的端点适配器

internal/infrastructure/sessionstore
  file.go                  origin 绑定、0600、原子写

internal/infrastructure/documentstore
  file.go                  PDF 原子落盘

internal/cli
  registry.go              命令注册表与统一 flag 解析
  specs.go                 全部命令声明
  commands_*.go            会话检查 -> 用例 -> 渲染
  render.go                终端表格、标题与空状态
  interactive.go           交互菜单与表单
  select.go                方向键、翻页与滚动视口选择器
  help.go                  帮助主题
```

## 依赖方向

```text
cmd -> cli -> application -> domain
          \-> infrastructure/jwgl -> application/domain
          \-> infrastructure/httpclient -> domain/config
          \-> infrastructure/{sessionstore,documentstore}
```

禁止方向：

- `domain` 不依赖任何基础设施或 CLI。
- `application` 不依赖 `net/http`、文件系统或终端。
- `cli` 不拼远端字段名，也不自行实现 Cookie、重试、页面解析。
- `infrastructure/jwgl` 不输出面向人的文案；重试提示由 `cmd/usts` 注入。

## 请求与会话链路

```text
CLI
  -> EnsureValidSession
     -> local session restore
     -> trust window?
     -> probe (valid / expired / unknown)
     -> single-flight re-login when expired
  -> use case
     -> gateway method
        -> withReauth(operation)
           -> endpoint adapter
              -> AuthenticatedTransport
                 -> retry policy by effect
```

重放边界固定在公开网关方法：

- `read` 可在会话明确失效后重放一次。
- `download` 以整个 PDF 生成链为一次重放单位。
- `mutation` 永不自动重放。
- 歧义拒绝先探测；只有 `expired` 才重登，`unknown` fail-open。

## 错误契约

| 退出码 | 错误码 |
|---:|---|
| 0 | 成功 |
| 2 | `CONFIGURATION_ERROR` |
| 3 | `AUTHENTICATION_REQUIRED` / `SESSION_EXPIRED` / `INVALID_CREDENTIALS` / `CAPTCHA_REQUIRED` |
| 4 | `RATE_LIMITED` / `NETWORK_UNAVAILABLE` / `REQUEST_TIMEOUT` / `REMOTE_SERVER_ERROR` |
| 5 | `PROTOCOL_CHANGED` |
| 6 | `FILE_SYSTEM_ERROR` |

`--json` 错误始终写入 stderr：

```json
{
  "schemaVersion": 1,
  "command": "scores",
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "未找到会话，请先运行 usts login 登录",
    "retryable": false
  }
}
```

## 新增查询的落位顺序

1. 在 `internal/domain/models.go` 增加稳定结果类型。
2. 在 `internal/infrastructure/jwgl` 增加端点适配器与 mapper；HTML 页面使用纯解析函数。
3. 如涉及业务规则，在 `internal/application` 增加用例与窄接口。
4. 在 `internal/cli/commands_*.go` 增加“会话 -> 用例 -> 渲染”。
5. 在 `internal/cli/render.go` 增加展示，在 `specs.go` 注册命令。
6. 增加纯解析/用例测试；涉及协议时补 `httptest` 契约测试。

## 迁移策略

第一阶段保留 TypeScript 实现，Go 版通过 `go build ./cmd/usts` 独立验证。行为一致后再切换发布入口：

1. 对比 Go/TS 的 CLI 帮助、JSON 信封、退出码。
2. 用脱敏夹具覆盖所有已实现页面解析器。
3. 用真实只读账号做小规模接口回归，避免高频请求触发 WAF。
4. 将安装包和命令名切到 Go 二进制，TypeScript 版保留一个发布周期作为回退。
