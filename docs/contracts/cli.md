# CLI 契约

## 输出通道

- `stdout`：成功结果。
- `stderr`：警告、诊断和错误。
- `--json` 模式不输出 ANSI 标题或表格。

## JSON 成功格式

```json
{
  "schemaVersion": 1,
  "command": "selected-courses",
  "data": [],
  "meta": { "xnm": "2026", "xqm": "3" },
  "warnings": []
}
```

`meta` 为可选字段，`warnings` 始终存在。内部远端 DTO 不属于兼容契约，`raw` 字段不会进入默认 JSON 输出。

## JSON 错误格式

错误写入 `stderr`：

```json
{
  "schemaVersion": 1,
  "command": "gpa",
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "会话已失效，请重新运行 usts login",
    "retryable": false
  }
}
```

## 退出码

| 退出码 | 含义 |
|---:|---|
| 0 | 成功 |
| 2 | 配置或参数错误 |
| 3 | 登录、会话、凭证或验证码问题 |
| 4 | 网络、限流或远端服务错误 |
| 5 | 远端协议/响应结构变化 |
| 6 | 本地文件系统错误 |
| 130 | 用户取消 |

新增字段属于向后兼容变更；删除/改名字段或改变类型必须提升 `schemaVersion`。
