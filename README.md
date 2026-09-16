# usts - 苏州科技大学教务系统命令行工具

[![npm version](https://img.shields.io/npm/v/usts-jwgl.svg)](https://www.npmjs.com/package/usts-jwgl)
[![npm downloads](https://img.shields.io/npm/dm/usts-jwgl.svg)](https://www.npmjs.com/package/usts-jwgl)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](package.json)

`usts` 面向苏州科技大学**正方教务系统**（V9，`jwgl.usts.edu.cn/jwglxt`）的在校生账号：在终端查询成绩、考试、课表、选课名单与个人信息。

## 安装

```bash
npm i -g usts-jwgl@latest     # 需要 Node.js 22.12+，命令名为 usts
```

账号密码登录是纯脚本（正方 RSA），**不需要浏览器**。

## 快速开始

```bash
usts login                    # 首次登录，会话保存到用户状态目录
usts scores                   # 当前学期成绩
usts                          # 不带参数进入交互式菜单
```

## 命令

| 命令 | 说明 |
|------|------|
| `usts login` / `usts logout` | 登录 / 清除本地会话 |
| `usts scores` | 成绩（课程/学分/绩点/教师/开课学院） |
| `usts exams` | 考试安排（时间/地点/座位号） |
| `usts courses` | 选课名单 |
| `usts schedule` | 个人课表 |
| `usts clsched` | 班级课表（任意班级，可级联选择） |
| `usts profile` | 个人信息 |
| `usts gpa` / `usts academia` | 学业成绩概览 / 学业情况与课程分类 |
| `usts notifications` | 通知与待办 |
| `usts selected-courses` | 已选课程详情 |
| `usts schedule-pdf` / `usts academia-pdf` | 下载课表 PDF / 成绩总表 PDF |

`scores` / `exams` / `courses` / `schedule` / `clsched` 等支持 `-y`（学年）与 `-t`（学期）参数，缺省按当前日期推算。

## 详细文档

详细说明放在命令行里，随时可取：

```bash
usts help              # 总览 + 文档主题列表
usts help config       # 配置文件位置、可用键与网络信任边界
usts help session      # 登录方式、会话有效期、自动重登与敏感度
usts help term         # 学期参数的取值与缺省推算
usts help json         # --json 输出信封与退出码
usts help download     # 两个 PDF 下载命令的文件名与覆盖策略
usts help faq          # 超时、WAF 限流、验证码、空结果
usts scores --help     # 任意命令的详细说明
```

配置放在用户配置目录的 `.env`（不是当前目录），常用键为 `USTS_USERNAME`、`USTS_PASSWORD`、`USTS_COOKIES`，详见 `usts help config`。

仓库内文档：[架构与依赖方向](docs/architecture.md)、[安全基线](docs/security.md)、[CLI 契约](docs/contracts/cli.md)、[正方接口实测](WEB_ARCHITECTURE.md)、[决策记录](docs/adr/)。

## 安全

- 所有命令都是只读查询，账号密码只用于登录教务系统，不发送到任何第三方。
- 会话文件里是**明文 bearer token**，效力等同于密码，请按同等敏感度对待；`.env` 与本地会话文件都不要提交到版本库。
- 更多边界（配置来源、主机信任、日志脱敏）见 [docs/security.md](docs/security.md) 与 `usts help session`。

## 开发

```bash
npm install
npm run build      # 编译到 dist/ 并补执行位（别单独跑 tsc：符号链接安装会 permission denied）
npm run check      # 类型检查 + 架构规则 + 测试
node dist/index.js --help
```

接口契约与实测结论见 [WEB_ARCHITECTURE.md](WEB_ARCHITECTURE.md)，架构约定见 [CLAUDE.md](CLAUDE.md)。

## 许可

[MIT](LICENSE)
