# ADR-0004：退役 cwd 旧版会话读取

状态：Accepted（修订 [ADR-0003](0003-session-storage.md)）

## 决策

不再读取当前工作目录下的旧版 `.session.json`。仅在其存在时于启动阶段提示用户删除并重新登录。

## 原因

ADR-0003 把 cwd `.session.json` 定位为「兼容迁移来源」，但实现是隐式的：任何命令在任意目录下运行，都会无条件读取该目录的 `.session.json` 并注入其中的 Cookie。而旧格式**没有 `origin` 字段**，无从判断会话归属，origin 校验对它形同空转；读取之后还会被静默写入受信任的状态目录、绑定当前 origin，并把文件里的 `username` 记作登录身份。

于是「`cd` 进一个含 `.session.json` 的目录再运行 `usts`」就等价于让该目录决定你的登录态：以别人的账号查询，并把对方可控的 `username` 持久化、随后作为 `su=` 参数发出。Cookie 只发往教务系统，不构成直接外泄，但隐式接受来源未绑定的凭证本身就不该是默认行为。

迁移窗口也已过去：登录已实现为纯脚本，`usts login` 一条命令即可重建会话，迁移不再有实际收益。

## 后果

- `FileSessionStore` 只读取 `sessionFilePath()`，不再有 cwd 回退；`origin` 成为版本化格式的必需字段，缺失即拒绝加载（`read()` 层强制）。
- `JwglClient.restoreSession()` 要求 `origin` 与当前 `USTS_BASE_URL` 严格相等，不再有「无 origin 则接受并提升」的分支。
- 从任意目录运行 CLI 的结果不再受该目录内容影响。
- 旧文件不会被自动删除（不在用户目录之外做文件操作），启动时给一次性提示，由用户手工删除并 `usts login`。
