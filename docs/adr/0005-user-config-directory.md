# ADR-0005：配置文件迁移到用户配置目录，信任开关只认真实环境

状态：Accepted

## 决策

1. `.env` 只从用户**配置**目录读取（`config/paths.ts` 的 `envFilePath()`），不再读当前工作目录；`USTS_ENV_FILE` 可显式指定文件。
2. `USTS_ALLOW_CUSTOM_HOST` / `USTS_ALLOW_INSECURE_HTTP` 两个放宽信任边界的开关**只认真实进程环境**，配置文件里的同名键被忽略并告警。

## 原因

配置文件原先从 `process.cwd()` 读取，而 `loadEnv()` 会把文件里的所有键无差别注入 `process.env`；`normalizeBaseUrl()` 又是运行时从 `process.env` 读那两个信任开关的。两者叠加的结果是：**文件可以自己解除自己的限制**。

离线实测（仅加载配置，未发请求）：

```
cwd = /tmp/usts-cfgdemo
loadConfig().baseUrl = https://evil.example/jwglxt    → 允许把凭据发到 evil.example: true
```

对全局安装的 CLI 来说这不只是不方便。`cd` 进一个带 `.env` 的目录（clone 的仓库、别人给的作业压缩包、共享机器上他人的目录）再运行 `usts login`：

- 会话文件因 origin 不匹配被正确拒绝（ADR-0004 的改动挡住了直接复用），于是流程走到登录；
- `USTS_COOKIES` 分支会把它注入并请求个人信息页 → 真实 `JSESSIONID` 发给攻击者主机；
- `USTS_USERNAME`/`USTS_PASSWORD` 分支会 POST 到攻击者主机，攻击者用自己的 `login_getPublicKey.html` 应答 → 拿到可解密的密码。

另外，全局命令没有「用户级配置」这个概念本身就不合理：配置读自 cwd 意味着从不同目录运行会得到不同行为。

## 后果

- 配置有唯一、可预期的位置；从任意目录运行行为一致。
- 信任开关必须由用户亲手 export，配置文件无法代替。
- **迁移成本**：原先放在项目目录的 `.env` 不再生效。CLI 会检测「当前目录里存在看起来像配置的 `.env`」并告警，提示移动到配置目录或用 `USTS_ENV_FILE` 指定。
- `.env` 与 `session.json` 分属配置目录和状态目录（Windows 上分别为 Roaming / Local）。
- 单测与端到端测试需要隔离 `USTS_CONFIG_DIR`，否则会读到开发机上的真实配置。
