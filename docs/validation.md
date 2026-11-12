# Go 重写验证记录

验证日期：2026-11-12
分支：`rewrite/go`

## 本地验证

- `make check`：通过
- `go test -race ./...`：通过
- `npm run check`：通过，原 TypeScript 191 项测试全部通过
- Windows amd64 交叉编译：通过
- macOS arm64 交叉编译：通过
- `git diff --check`：通过
- 无会话、参数错误、JSON 错误信封、非 TTY 交互拒绝、帮助与登出幂等路径：通过

## 真实只读回归

使用当前用户配置与本地会话，按约 3 秒间隔请求真实正方接口。记录只保留状态和条数，不包含个人字段值。

| 模块 | 结果 |
|---|---|
| `profile` | 成功，11 个稳定字段；字段存在性与 TypeScript 版一致 |
| `scores` | 成功，当前学期 3 条 |
| `scores -y 2025` | 成功，全年 32 条 |
| `scores --kcxzdm 01` | 成功，合法空结果 |
| `exams` | 成功，1 条 |
| `courses` | 成功，14 条 |
| `schedule` | 成功，16 条 |
| `gpa` | 成功；结构化字段存在性与 TypeScript 版一致 |
| `notifications` | 成功，11 条 |
| `academia` | 成功，57 个分类 |
| `academia --category 思想政治类` | 成功，8 门课程 |
| `selected-courses` | 成功，14 条 |
| `freeclass` | 成功，947 间场地 |
| `freeclass --week 3 --weekday 3 --section 5-6` | 成功，865 间场地 |
| `warning` | 成功，无预警，2 条页面结论 |
| `plan` | 成功，1 条执行计划 |
| `plan --course` | 成功，99 门课程 |
| `payment` | 成功，合法空结果 |
| `minor-schedule` | 成功，合法空结果 |
| `minor-schedule --kind 辅修` | 成功，合法空结果 |
| `clsched` 交互级联 | 成功找到真实班级并完成查询 |
| `clsched` 非交互参数 | 成功；该班级当前学期为空课表，TypeScript 版结果一致 |
| `login` 会话复用 | 成功 |
| 隔离状态目录下 `logout` | 成功，会话文件被删除，未影响真实会话 |
| 交互式主菜单 | 方向键、首尾循环、数字键跳选、Ctrl+P、PageDown、End、滚动视口、Ctrl+C 终端恢复均通过 PTY 验证 |
| 查询菜单滚动 | 8 行终端下正确显示上下滚动提示，Ctrl+C 干净退出 |
| 完整交互查询链路 | 主菜单进入查询、滚动选择成绩、完成三个滚动表单、真实查询 3 门课程并返回菜单 |

## PDF 外部限制

当前账号下两个 PDF 命令未能在真实接口成功生成文件：

- `schedule-pdf`：Go 与 TypeScript 均返回 `PROTOCOL_CHANGED`，服务端未返回有效 PDF。
- `academia-pdf`：Go 与 TypeScript 均返回远端错误，TypeScript 明确为 HTTP 404。

两种实现表现一致，因此这不是 Go 重写回归。PDF 请求链、同源重定向、PDF 文件头校验、原子落盘和覆盖策略已由本地集成测试覆盖；真实生成能力取决于当前账号的打印模块权限与远端服务状态。
