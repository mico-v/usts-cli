# 只读接口覆盖矩阵

统计口径：只计算 `jwgl-web-api-catalog.md` 中已由真实请求确认过响应形状的只读数据端点；页面壳、`read?` 启发式路径、未实测导出和写接口不计入。

当前结果：**53 个确认只读端点，53 个已实现并真实调用成功，0 个未实现。**

## 已实现并真实成功

| 域 | 端点/能力 | CLI |
|---|---|---|
| 成绩 | 主成绩、备用成绩、成绩分项、分项模板 | `scores`, `scores --detail`, `scores --templates` |
| 考试 | 已排考、未排考 | `exams`, `exams --unplanned` |
| 选课名单 | 选课名单 | `courses` |
| 课表 | 个人课表、班级课表视图、专业/班级下拉、班级课表 | `schedule`, `clsched` |
| 个人信息 | 基本信息、富查询、9 个表格型子页签、选课状态 | `profile`, `profile --full`, `profile --section <分区>` |
| 通知 | 通知/待办 | `notifications` |
| 已选课程 | 已选课程、板块课程、已选/意向视图、历年学分、评教状态 | `selected-courses`, `--blocks`, `--chosen`, `--credits`, `--evaluation-status` |
| 空闲教室 | 场地查询 | `freeclass` |
| 学业预警 | 预警页面 | `warning` |
| 学业情况 | GPA 页面、分类明细、执行计划相关页面 | `gpa`, `academia`, `academia --category` |
| 执行计划 | 主列表、课程明细、视图选单 | `plan`, `plan --course` |
| 缴费 | 缴费记录 | `payment` |
| 微专业 | 三种课表目录 | `minor-schedule` |
| 毕业设计 | 毕设成绩 | `bysj` |
| 课程信息 | 课程基本信息 | `course --id` |
| 公共字典 | 11 个公共下拉端点，12 种语义 | `lookup --kind ...` |

公共字典已真实验证：开课单位、年级、学院、专业、班级、校区、课程类别、课程性质、课程归属、教学方式、上课时间、节次。

## 个人信息子页签实测

这些端点必须按页面实际契约使用 **GET**，并带 `xh_id`、`fromXh_id`；表格端点只使用
`queryModel.showCount/currentPage` 分页，不能复用写接口式的 `page/rows` 双分页参数。
当前账号的真实结果如下：

| 分区 | 端点 | 当前结果 |
|---|---|---|
| `primary-major` | `/xsxxxggl/xsxxwh_cxZxzyxx.html` | 成功，合法空结果 |
| `secondary-major` | `/xsxxxggl/xsxxwh_cxFxzyxx.html` | 成功，合法空结果 |
| `unassigned-major` | `/xsxxxggl/xsxxwh_cxWzyxx.html` | 成功，合法空结果 |
| `exam-levels` | `/xsxxxggl/xsxxwh_cxDjksxx.html` | 成功，3 条 |
| `family` | `/xsxxxggl/xsxxwh_cxXsjtcy.html` | 成功，1 条 |
| `records` | `/xsxxxggl/xsxxwh_cxXsxxjl.html` | 成功，合法空结果 |
| `academic-years` | `/xsxxxggl/xsxxwh_cxXsxnjd.html` | 成功，合法空结果（HTTP 910 空网格体） |
| `classes` | `/xsxxxggl/xsxxwh_cxBjxxList.html` | 成功，1 条 |
| `selected-courses` | `/xsxxxggl/xsxxwh_cxXsxkxx.html` | 成功，46 条 |
| `selection-status` | `/xsxxxggl/xsxxwh_cxViewKbzg.html` | 成功，状态码 1 |

## 明确排除

- Inventory 中仍标“未实测”的路径。
- 所有写接口：报名、申请、选课/退课、评教提交、信息修改、照片确认、支付、订单操作等。
- 未实测 Excel/PDF/打印/预览导出。
- 两个已实现的 PDF 命令当前真实生成失败；Go 与原 TypeScript 行为一致，属于当前账号远端打印模块限制。

## 复验方式

所有真实回归按至少 3 秒间隔串行执行，输出只保留退出码、条数、字段存在性和结构信息。重新验证前应先运行：

```bash
make check
go test -race -shuffle=on -count=1 ./...
make vuln
```
