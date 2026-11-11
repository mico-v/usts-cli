# 正方教务系统 Web 接口目录（USTS 实测）

> 采集时间：2026-10-31（账号：学生；学期：2026-2027 第一学期）
> 采集方式：主界面导航 + 32 个视图页逐个 GET + 页面引用的 55 个 JS 模块静态分析 + 只读 Action 实测。
> 原始响应只保存在临时目录（含个人数据，**未入库**）。本文只记录接口契约，不含任何个人数据。
> 机器可读的路径清单见 [`jwgl-endpoints-inventory.tsv`](./jwgl-endpoints-inventory.tsv)（504 条，含未实测/写接口）。
> TSV 里的「副作用提示」只是按路径关键字做的启发式分类（`read?`/`write?`/`export/read?`），
> **不是结论**；调用任何未在 §4/§5 明确记录为只读的路径前，必须先读页面 JS 或实际语义确认。

## 0. 本轮采集的关键结论

1. **`GET /xtgl/index_initMenu.html` 在当前账号上不是菜单页，而是「请重置密码」页。**
   访问它之后，同一会话里后续业务 Action 会统一返回「错误提示：无功能权限」，
   直到重新登录。因此本轮采集**完全避开该 URL**；导航清单沿用 2026-09 的抓包结果，
   并用 32 个视图页逐个复核。若以后要重新抓菜单，请先让账号完成密码重置。
2. **视图页 GET 必须带 `?gnmkdm=<功能码>`**。不带时常见 `HTTP 901` + 空 body；
   带上是 200 + 完整 HTML。
3. **JSON 响应经常被服务端标成 `Content-Type: text/html`**。判断响应类型要看 body 是否
   以 `{`/`[` 开头，不能只看 Content-Type；客户端（axios）也可能已经自动把 body 解析成对象。
4. **列表 Action 仍然是「双分页参数」契约**：经典 `page/rows/_search/nd/sidx/sord`
   与 `queryModel.showCount/queryModel.currentPage` 必须同时出现（详见 §2）。
5. **`无功能权限` 是请求被拒，不是会话失效**。它与「错误提示」页一样，属于
   `PROTOCOL_CHANGED`（`ambiguousSession`），不能据此判定会话过期。
6. 本轮新增确认的只读接口包括：学生信息富查询（63 字段）、个人信息各子页签、
   执行计划课程明细（99 条）、考试未排考网格、班级课表、公共下拉、课程基本信息、
   成绩分项、已选课程子接口等（见 §4）。

## 1. 会话与访问方式

- Base URL：`https://jwgl.usts.edu.cn/jwglxt`
- 会话：登录后 Cookie（`JSESSIONID`、`__jsluid_s` 等）+ 浏览器 UA。
- 请求头（数据 Action）：
  - `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`
  - `X-Requested-With: XMLHttpRequest`
  - `Referer: <Base>/<对应视图页>`
- 请求头（视图页）：`Accept: text/html,...`，`Referer` 通常用任意同源页面。
- **`su` 参数**：个人信息等 GET 页面可带 `su=<学号>`；不知道学号时省略，
  服务端会按会话识别用户。
- **WAF 限流**：连续请求建议间隔 2-3 秒；出现 `ECONNRESET` / `ERR_CONNECTION_CLOSED`
  时等待 30-60 秒。
- **登录**：经典正方 `login_slogin.html` + RSA 加密 + 首次 POST 被 WAF 重置后重试一次，
  详见 `WEB_ARCHITECTURE.md` §4。

## 2. 列表 Action 的公共契约

以 `postGrid` 为准：

```
POST <action-path>?doType=query&gnmkdm=<功能码>
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
X-Requested-With: XMLHttpRequest

xnm=2026&xqm=3
&_search=false&nd=<毫秒时间戳>&page=1&rows=100&sidx=&sord=asc
&queryModel.showCount=5000&queryModel.currentPage=1
```

- **两套分页参数都要有**。服务端实际使用 `queryModel.showCount/currentPage`；
  `showCount=5000` 可一次取全。
- 正常响应：

```json
{
  "currentPage": 1,
  "currentResult": 0,
  "items": [ ... ],
  "showCount": 10,
  "totalCount": 3,
  "totalPage": 1,
  "totalResult": 3
}
```

- **裸数组**：`已选课程`、`学业分类明细`、`comm_*` 下拉等接口直接返回 `[ ... ]`，
  没有 `items` 包装。
- **非网格对象**：个人课表返回 `{ xsxx, kbList, sjkList, xqjmcMap, ... }`；
  班级课表返回 `{ kbList, sjkList, ... }`。
- **错误页**：`无功能权限` / `错误提示` / `警告提示` 都是 200 + HTML；`HTTP 901` + 空 body
  常见于未认证的数据 Action。分类规则见 `docs/contracts/jwgl-endpoints.md`。

## 3. 主界面导航（32 项，2026-09 抓包 + 2026-10-31 视图页复核）

所有视图页在本轮均返回 200；括号内为本轮实测 HTML 大小。类型 `R` = 只读，
`W` = 含写操作，`R/W` = 既有只读列表也有写入口。

| # | 分组 | 功能 | gnmkdm | 视图页（GET） | 大小 | 类型 | CLI |
|---|---|---|---|---|---|---|---|
| 1 | 报名申请 | 学籍异动申请 | `N102020` | `/xjyd/xjydsq_cxXjydsq.html?doType=details` | 11196 | R/W | — |
| 2 | 报名申请 | 辅修报名 | `N1053` | `/fxgl/fxbm_cxXsfxbmIndex.html` | 8690 | R/W | — |
| 3 | 报名申请 | 重修报名 | `N1056` | `/cxbm/cxbm_cxXscxbmIndex.html` | 8615 | R/W | — |
| 4 | 报名申请 | 学生证补办申请 | `N106005` | `/xszbbgl/xszbbgl_cxXszbbsqIndex.html?doType=details` | 10243 | R/W | — |
| 5 | 报名申请 | 学生转专业申请 | `N106204` | `/xszzy/xszzysqgl_cxXszzysqIndex.html?doType=details` | 10754 | R/W | — |
| 6 | 报名申请 | 项目报名 | `N2510` | `/kjgl/kjbm_cxXskjbm.html?xmlbfl=1001` | 7059 | R/W | — |
| 7 | 报名申请 | 教学项目报名 | `N2511` | `/jxrwbmgl/jxrwxmbm_cxJxrwxmbmIndex.html` | 7762 | R/W | — |
| 8 | 报名申请 | 学生成绩学分认定申请 | `N306010` | `/cjxfrdgl/cjxfrdsq_cxCjxfrdsq.html?doType=details` | 6723 | R/W | — |
| 9 | 报名申请 | 学生退书申请 | `N824203` | `/jcdggl/jcck_cxXstssqIndex.html` | 9785 | R/W | — |
| 10 | 报名申请 | 校内课程替代申请 | `N151530` | `/kcthgl/xskcthsq_cxXskcthIndex.html?sqlx=xnkc` | 9310 | R/W | — |
| 11 | 报名申请 | 学生学历学位申请 | `N5504105` | `/bygl/xwsqsh_cxXsxlxwsqIndex.html` | 8709 | R/W | — |
| 12 | 报名申请 | 等级考试成绩申请 | `N25054810` | `/kjgl/djkscjsq_cxDjkscjsqIndex.html` | 9930 | R/W | — |
| 13 | 报名申请 | 非课程类成果学分认定申请 | `N4940` | `/cxcygl/cxcycgxfrdsq_cxCxcycgxfrdsqIndex.html` | 6413 | R/W | — |
| 14 | 报名申请 | 等级考试学分认定申请 | `N306603` | `/xfrdgl/xfrdsq_cxXfrdsqIndex.html` | 7604 | R/W | — |
| 15 | 信息维护 | 学生个人信息维护 | `N100808` | `/xsxxxggl/xsgrxxwh_cxXsGrxxxgIndex.html` | 7351 | R/W | — |
| 16 | 信息维护 | 毕业照片确认 | `N109566` | `/byzpqr/byzpqr_cxByzpqrIndex.html` | 8868 | R/W | — |
| 17 | 信息维护 | 学生缴费 | `N0185` | `/paycenter/paycenter_cxGrjfIndex.html` | 9176 | R/W | `payment` |
| 18 | 选课 | 自主选课 | `N253512` | `/xsxk/zzxkyzb_cxZzxkYzbIndex.html` | 7219 | R/W | `selected-courses`（只读） |
| 19 | 信息查询 | 查询个人信息 | `N100801` | `/xsxxxggl/xsgrxxwh_cxXsgrxx.html` | 47124 | R | `profile` |
| 20 | 信息查询 | 班级课表查询 | `N214505` | `/kbdy/bjkbdy_cxBjkbdyIndex.html` | 173594 | R | `clsched` |
| 21 | 信息查询 | 个人课表查询 | `N2151` | `/kbcx/xskbcx_cxXskbcxIndex.html` | 10784 | R | `schedule` |
| 22 | 信息查询 | 查询空闲教室 | `N2155` | `/cdjy/cdjy_cxKxcdlb.html` | 41836 | R | `freeclass` |
| 23 | 信息查询 | 选课名单查询 | `N255010` | `/xkcx/xkmdcx_cxXkmdcxIndex.html` | 21532 | R | `courses` |
| 24 | 信息查询 | 学生成绩查询 | `N305005` | `/cjcx/cjcx_cxDgXscj.html` | 11614 | R | `scores` |
| 25 | 信息查询 | 考试信息查询 | `N358105` | `/kwgl/kscx_cxXsksxxIndex.html` | 14125 | R | `exams` |
| 26 | 信息查询 | 微专业课表打印 | `N214556` | `/kbdy2/fxzykbdy_cxFxzyKbdyIndex.html?kklxdm=02` | 25065 | R | `minor-schedule` |
| 27 | 信息查询 | 学业预警处理 | `N305516` | `/xyyjjk/xyyjclcx_cxXyyjclcxxsIndex.html` | 4043 | R | `warning` |
| 28 | 信息查询 | 学生学业情况查询 | `N105515` | `/xsxy/xsxyqk_cxXsxyqkIndex.html?echarts=1` | 1455512 | R | `gpa` / `academia` |
| 29 | 信息查询 | 学生成绩总表打印 | `N558020` | `/bysxxcx/xscjzbdy_cxXscjzbdyIndex.html` | 6459 | R | `academia-pdf` |
| 30 | 信息查询 | 教学执行计划查看 | `N153540` | `/jxzxjhgl/jxzxjhck_cxJxzxjhckIndex.html` | 32596 | R | `plan` |
| 31 | 教学评价 | 学生评价 | `N401605` | `/xspjgl/xspj_cxXspjIndex.html?doType=details` | 7060 | R/W | — |
| 32 | 毕业设计 | 成绩查看 | `N532560` | `/xsbysjgl/cjck_cxCjckIndex.html` | 7777 | R | — |

> 视图页 GET 统一加 `?gnmkdm=<功能码>`；表中省略了该参数。
> `doType=details`、`xmlbfl`、`sqlx`、`kklxdm`、`echarts` 是视图页自身的参数，需保留。

## 4. 只读查询接口（实测）

### 4.1 成绩（`N305005`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/cjcx/cjcx_cxXsgrcj.html?doType=query&gnmkdm=N305005` | `xnm,xqm` + 网格参数 + 见下方 paramMap | `{items,totalCount}` | 3 条 |
| POST | `/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005` | 同上（备用主接口） | `{items,totalCount}` | 3 条 |
| GET | `/cjcx/cjcx_cxCjxqGjh.html` | `jxb_id,xnm,xqm,xh_id,kcmc` | HTML 成绩分项 | 2068B |
| GET | `/cjcx/cjcx_cxXmblbzlist.html?gnmkdm=N305005` | `xnm,xqm` | 字符串数组（成绩分项模板） | 6 项 |
| POST | `/cjcx/cjcx_dcListByXs.html` | 查询条件 + `dcclbh`（导出处理编号） | 文件路径/文件 | 未实测 |
| POST | `/cjcx/cjcx_dyList.html` | `xnm,xqm,bh_id` + 条件 | 文件路径 | 未实测 |
| POST | `/cjcx/cjcx_bjdyBjcjWord.html` | `xnm,xqm,bh_id` | Word/文件 | 未实测 |

学生端 `paramMap` 的完整字段（JS `cxDgXscj.js`）：
`xnm,xqm,qsXnxq,zzXnxq,xhxm,kkxb_id,kkbm_id,cxcykclxdm,kclbdm,kch,cjbzdm,xqh_id,njdm,zyh_id,x_id,tyxm_id,bjdm,kcxzdm,kcgsdm,xb_id,jg_id_cx,zt,ccdm,xslb,xz,zyfx_id,cjxzm,xsbj,cjsfzfbj,xxdm,sfjf,drcx_id,xmblzbh,xmblbz,sfzx,ywxj,sfbkkc,zsxy_id,kklxdm,jsxm,sfzgcj,kcsfwtg`。
其中 `jsxx=xs` 时只发学生端字段；教师/管理端字段可忽略。

成绩条目常用字段：`kcmc,kch,kch_id,kcxzmc,kclbmc,kcgsmc,xf,jd,cj,bfzcj,jsxm,jxb_id,xnm,xqm,kcxzdm,njdm_id,jg_id,jgmc,bh_id,bj,bzxx`。

### 4.2 考试（`N358105`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/kwgl/kscx_cxXsksxxIndex.html?doType=query&gnmkdm=N358105` | `xnm,xqm,ksmcdmb_id,kch,kc,ksrq,kkbm_id` | `{items,totalCount}` | 1 条 |
| POST | `/kwgl/kscx_cxWpkskcList.html?doType=query&gnmkdm=N358105` | `xnm,xqm` | `{items,totalCount}` | 1 条 |
| POST | `/ksglcommon/common_cxKsmcByXnxq.html` | `xnm,xqm` | `[{KSMCDMB_ID,KSMC}]` | 未实测 |
| GET | `/query/query_cxJxlList.html` | `xqh_id` | `[{JXLDM,JXLMC}]` | 未实测 |
| POST | `/kwgl/kscx_cxKssjByKsmc.html` | `ksmcdmb_id` | `[{ksccb_id,kssj}]` | 未实测 |
| POST | `/kwgl/kscx_dcXsksxxList.html` | 查询条件 + `dcclbh=JW_N358105_KSCX` | 文件 | 未实测 |

考试条目常用字段：`kcmc,kch,jsxx,kssj,jxdd,cdmc,cdbh,xqmc,xnmc,xqmmc,xf,xh,xm,bj,njmc,jgmc,zymc,kkxy,jxbmc,ksmc,khfs`。

### 4.3 选课名单（`N255010`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/xkcx/xkmdcx_cxXkmdcxIndex.html?doType=query&gnmkdm=N255010` | `xnm,xqm,xb_id,kkxy_id,kclbdm,kcxzmc,kch,kklxdm,kkzt,jxbmc,jsxx,kcgsdm,xdbj,fxbj,cxbj,zxbj,fxlx,kcfl_cx,sfzbh_kcflsj,cxlx,zyfx_id,xklc,xkly` | `{items,totalCount}` | 14 条 |
| POST | `/xkcx/xkmdcx_dcList.html` | 同上 + `dcclbh,xsbjmc` | 文件 | 未实测 |
| GET | `/xkcx/xkmdcx_cxXsbjView.html` | 无 | HTML 学生标记对话框 | 未实测 |
| GET | `/xkgl/common_cxKcxxModel.html` | `kch_id` | HTML 课程信息 | 未实测（本轮 302） |
| GET | `/query/query_cxFckContent.html` | `content` | HTML 教学大纲 | 未实测 |

选课名单条目常用字段：`xh,xm,xbmc,bj,bjmc,zyh_id,zymc,jg_id,jgmc,njdm_id,njmc,kch,kcmc,kch_id,jxb_id,jxbmc,jsxx,jsmc,jsgh,xf,kclbmc,kcxzmc,kkxymc,sksj,jxdd,xqmc,xnmc,xjztmc,sfzx,sfjf`。

### 4.4 个人课表（`N2151`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151` | `xnm,xqm,kzlx=ck,xsdm,kclbdm,kclxdm`（可选 `validate`） | `{xsxx,kbList,sjkList,xqjmcMap,...}` | 成功 |
| POST | `/kbcx/xskbcx_cxDcExcelXskb.html?exceltopdf=1` 或 `?doType=table` | 同上课表参数 + `xszd.*` 导出字段 | Excel/PDF | 未实测 |
| POST | `/kbcx/xskbcx_cxDcExcelXskblb.html?doType=list` | 同上 | 文件列表 | 未实测 |
| POST | `/kbcx/xskbcx_cxXsShcPdf.html?doType=table` | 课表 PDF body（见 §5） | PDF | CLI 已实现 |
| GET | `/kbcx/xskbcx_cxXskbSimpleIndex.html` | 同页参数 | HTML | 未实测 |
| GET | `/kbcx/xskbcx_cxXskbPopupIndex.html` | 同页参数 | HTML | 未实测 |
| POST | `/kbcx/xskbcx_cxRsd.html` | 日期相关 | HTML/JSON | 未实测 |
| POST | `/kbcx/xskbcx_cxRjc.html` | 节次相关 | HTML/JSON | 未实测 |
| POST | `/kbcx/xskbcx_cxXsywKb.html` | 课表参数 | 课表 | 未实测 |

课表响应关键结构：
- `xsxx`：`XH,XM,BJMC,ZYMC,NJDM_ID,ZYH_ID,XNM,XQM,XNMC,XQMMC,KCMS`
- `kbList[]`：`kcmc,kch,jxb_id,jxbmc,jsxm,cdmc,cdbh,jc,jcs,jcor,xqj,xqjmc,qsjsz,zhxs,kcxszc,khfsmc,kklxdm,kcbj`
- `sjkList[]`：无固定时间的实践课/MOOC，可能不带 `xqj/jc`。
- `xqjmcMap`：星期编码 → 名称。

### 4.5 班级课表（`N214505`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| GET | `/kbdy/bjkbdy_cxBjkbdyIndex.html?gnmkdm=N214505` | — | HTML（学院/校区/年级下拉内嵌，预选当前学生） | 173594B |
| GET | `/xtgl/comm_cxZydmList.html?gnmkdm=N214505` | `jg_id,zyh_id_cx,_` | `[{zyh_id,zymc,...}]` | 19 项 |
| GET | `/xtgl/comm_cxBjdmList.html?gnmkdm=N214505` | `jg_id,zyh_id,bh_id,njdm_id,_` | `[{bh,bh_id,bj,jgmc,njmc,zymc,...}]` | 2 项 |
| POST | `/kbdy/bjkbdy_cxBjKb.html?gnmkdm=N214505` | 见下方 body | `{kbList,sjkList,...}` | `kbList=12,sjkList=1` |
| POST | `/kbdy/bjkbdy_cxBjkbdyTjkbList.html?doType=query&gnmkdm=N214505` | 同 `paramMap`（网页实际用的列表接口） | `{items,...}` | 未单独实测 |
| GET | `/kbdy/bjkbdy_cxZcxx.html` | `xnm,xqm` | `[{zs,zsmc}]`（周次选项） | 未实测 |
| GET | `/kbdy/bjkbdy_cxKbzdxsxx.html` | `map`（课表参数） | 教师信息 | 未实测 |
| GET | `/kbdy/bjkbdy_ylBjkbdyIndex.html` | `map,tjkbmc` | 预览 HTML | 未实测 |

`bjkbdy_cxBjKb.html` 请求体（实测可用的最小集）：

```
xnm,xqm,xnmc,xqmmc,xqh_id,njdm_id,zyh_id,bh_id,tjkbzdm=1,tjkbzxsdm=0,
zymc,jgmc,njmc,bj,bh,jsxm=,lxdh=,zs=,zxszjjs=false,
xsdm=,kclxdm=,kclbdm=,kbsjlyqz=,yf=,kzlx=ck
```

关键：`bh` 必须是班级**编号**（与 `bh_id` 对应，如 `2520401000`），传班级名称会得到空 `kbList`；
过滤 `cdmc === '未排地点'` 的占位行。

### 4.6 个人信息与子页签（`N100801`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| GET | `/xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801` | `su`（可选） | HTML（标签→值） | 47124B |
| GET | `/xsxxxggl/xsxxwh_cxCkDgxsxx.html?gnmkdm=N100801` | 无 | **对象，63 字段** | 成功 |
| POST | 同上 | `xh_id,fromXh_id,xh_id_code,xnm,xqm` | JSON（页面 JS 用法） | 本轮 POST 返回空，GET 可用 |
| GET | `/xsxxxggl/xsxxwh_cxZxzyxx.html?gnmkdm=N100801` | `xh_id,fromXh_id` | 网格 `{items}` | 0 条 |
| GET | `/xsxxxggl/xsxxwh_cxFxzyxx.html?gnmkdm=N100801` | 同上 | 网格 | 0 条 |
| GET | `/xsxxxggl/xsxxwh_cxWzyxx.html?gnmkdm=N100801` | 同上 | 网格 | 0 条 |
| GET | `/xsxxxggl/xsxxwh_cxDjksxx.html?gnmkdm=N100801` | 同上 | 网格 | 3 条 |
| GET | `/xsxxxggl/xsxxwh_cxXsjtcy.html?gnmkdm=N100801` | 同上 | 网格 | 1 条 |
| GET | `/xsxxxggl/xsxxwh_cxXsxxjl.html?gnmkdm=N100801` | 同上 | 网格 | 0 条 |
| GET | `/xsxxxggl/xsxxwh_cxXsxnjd.html?gnmkdm=N100801` | 同上 | 网格 | 0 条 |
| GET | `/xsxxxggl/xsxxwh_cxBjxxList.html?gnmkdm=N100801` | 同上 | `[{bh_id,bj}]` | 1 项 |
| GET | `/xsxxxggl/xsxxwh_cxXsxkxx.html?gnmkdm=N100801` | 同上 | 网格（已选课程） | 10/46 |
| POST | `/xsxxxggl/xsxxwh_cxViewKbzg.html?gnmkdm=N100801` | `xnm,xqm,fromXh_id` | 纯文本 `1/2/3`（可否选课状态） | 实测 `1` |
| GET | `/xsxxxggl/xsxxwh_cxXxqm.html` | — | **不存在**（`请求的方法cxXxqm未定义`） | 已确认 |
| GET | `/photo/photo_cxEncodedXszp.html` | `type,encodeXhid,zplx,t` | 图片（个人） | 未采集 |
| GET | `/photo/photo_cxXszp4.html` | `xh_id,zplx` | 图片（个人） | 未采集 |

`xsxxwh_cxCkDgxsxx` 的 63 个字段（不含值）：
`bdzcbj,bh_id,byzx,csrq,cyNum,date,dateDigit,dateDigitSeparator,day,has_xszp,hcpqjz,hkszd,jdNum,jg,jg_id,jlNum,jtdz,jtszd,ksh,kslbm,month,mzm,njdm_id,pageTotal,pageable,pyccdm,pyfaxx_id,pyfsdm,queryModel,rangeable,rxrq,sfzx,sjhm,syd,totalResult,userModel,xbm,xh,xh_id,xjztdm,xm,xmpy,xnm,xnmc,xqm,xqmc,xxnx,xz,year,yzbm,zjhm,zjlxm,zkzh,zsjg_id,zskl,zslb,zsnddm,zszyh_id,zyh_id,zzmmm`。

> 个人课表页的「已选课程」子页签使用 `/xsxxxggl/xsxxwh_cxXsxkxx.html`，
> 与自主选课页的 `zzxkyzb_cxZzxkYzbChoosedDisplay.html` 返回不同集合，二者都可用。

### 4.7 通知 / 待办

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/xtgl/index_cxDbsy.html?doType=query`（**无 gnmkdm**） | `sfyy=0,flag=1,_search=false,nd,queryModel.showCount=1000,queryModel.currentPage=1,queryModel.sortName=cjsj,queryModel.sortOrder=desc,time=0` | `{items,totalCount}` | 11 条 |

字段：`xxbt`（标题）、`xxnr`（正文）、`cjsj`（时间）、`sfyy`（是否已阅）、`ljdz`（链接地址）、`jsdm/jsmc`（角色）。

### 4.8 已选课程 / 自主选课（`N253512`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html?gnmkdm=N253512` | `xkxnm,xkxqm` | 裸数组 | 14 条 |
| POST | `/xsxk/zzxkyzb_cxZzxkYzbDisplay.html?gnmkdm=N253512` | `kklxdm,xkkz_id,xnm,xqm` | HTML 片段（选课列表） | 7651B |
| POST | `/xsxk/zzxkyzb_cxZzxkYzbChoosed.html?gnmkdm=N253512` | 同上 | HTML 片段（已选/意向/间听） | 6614B |
| POST | `/xsxk/zzxkyzb_cxZzxkyzbLnyhxf.html?gnmkdm=N253512` | `kklxdm,xkkz_id` | 数字字符串（历年已获学分） | `54` |
| POST | `/xsxk/zzxkyzb_cxTbXspjzt.html?gnmkdm=N253512` | `kklxdm,xkkz_id` | `0/1`（是否已评教） | `0` |
| POST | `/xsxk/zzxkyzb_cxXspkqkqr.html?gnmkdm=N253512` | 选课参数 | 评教确认 | 未实测 |
| POST | `/xsxk/zzxkyzb_cxBcxspkqkqr.html?gnmkdm=N253512` | 选课参数 | 批量确认 | 未实测 |
| POST | `/xsxk/zzxkyzb_cxYinxyixxfByKklxdm.html?gnmkdm=N253512` | `kklxdm` | 学分统计 | 未实测 |
| GET | `/xsxk/zzxkyzb_cxYinxyixxfView.html?gnmkdm=N253512` | — | HTML | 未实测 |
| GET | `/xkgzsz/jbxkgzsz_cxJbxkgzsz.html` | 选课参数 | 选课规则 | 未实测 |
| POST | `/xsxk/zzxkyzb_cxCheckZzxkyzbXfmcBynjzy.html?gnmkdm=N253512` | 选课参数 | 校验结果 | 未实测 |
| POST | `/xsxk/zzxkyzb_cxKcdgxx.html?gnmkdm=N253512` | `kch_id` | 课程大纲 | 未实测 |
| GET | `/kckgl/kcdgwh_ckKcdgxx.html` | `kch_id` | 课程大纲 HTML | 未实测 |
| POST | `/xsxk/tjxkyzb_cxJcxxList.html` | 选课参数 | 教材信息 | 未实测 |
| POST | `/xsxk/tjxkyzb_cxXkbzMsg.html` | 选课参数 | 选课备注 | 未实测 |
| GET | `/xkcx/tsxxcx_cxTsxxkcjd.html?gnmkdm=N154675&layout=default` | — | 通识课清单 | 未实测 |

> 非选课期 `zzxkyzb_cxZzxkYzbIndex.html` 只显示「当前不属于选课阶段」，
> 板块/选课参数无法稳定构造；上述列表接口可在已有 `kklxdm/xkkz_id`（来自已选课程条目）时使用。

### 4.9 空闲教室（`N2155`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/cdjy/cdjy_cxKxcdlb.html?doType=query&gnmkdm=N2155` | `xnm,xqm,jyfs=0`；可选 `xqh_id,cdlb_id,cdejlb_id,cdmc,lh,cd_id,qszws,jszws,zcd,xqj,jcd` | `{items,totalCount}` | 946 条 |
| POST | `/cdjy/cdjy_cxDcKxcdlb.html` | 同查询条件 | Excel | 未实测 |
| GET | `/cdjy/cdjy_cxQtlb.html` | 查询条件 | HTML（其他类别） | 未实测 |
| GET | `/cdjy/cdjy_cxFjsfbt.html` | 查询条件 | HTML（房间分布） | 未实测 |
| GET | `/cdjy/cdjy_cxViewCdjy.html` | `ywlyb_id` | HTML（借用详情） | 未实测 |
| GET | `/cdjy/cdjy_cxAtyycdSchedule.html` | 查询条件 | HTML（场地预约日程） | 未实测 |
| GET | `/cdjy/cdjy_cxIn24hours.html` | 查询条件 | HTML（24 小时） | 未实测 |
| POST | `/cdjy/cdjy_cxKtjc.html` | 查询条件 | 空闲节次 | 未实测 |
| POST | `/cdjy/cdjy_cxXqjc.html` | 查询条件 | 空闲星期/节次 | 未实测 |
| POST | `/cdjy/cdjy_cxDateInforma.html` | 查询条件 | 日期信息 | 未实测 |

字段：`cd_id,cdbh,cdmc,cdlbmc,cdejlbmc,xqmc,jxlmc,lh,zws,sfkjy,sfybyy,jzmj,cdgly,bz`。
时段编码：`zcd` 周次位掩码 `Σ2^(n-1)`、`xqj` 星期逗号串、`jcd` 节次位掩码；
三者同时给才是交集，少给一项服务端会忽略整个时段过滤（返回全部场地）。

### 4.10 学业预警（`N305516`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| GET | `/xyyjjk/xyyjclcx_cxXyyjclcxxsIndex.html?gnmkdm=N305516` | — | HTML（结论文本/预警表） | 无预警 |
| GET | `/xyyjjk/xyyjtjcl_cxXsyjtjXq2.html?gnmkdm=N100801&cxly=1` | `id` | HTML 预警详情 | 未实测 |
| GET | `/xyyjgl/xyyj_cxXsbyjcbIndex.html` | `xh_id` | HTML 预警明细 | 未实测 |
| GET | `/xyyjgl/xyyj_cxXsxyxxLbIndex2.html` | `xh_id` | HTML 学业预警列表 | 未实测 |

无数据 Action；视图页直接渲染结论。不要用中文关键字判定「无预警」，应看结构。

### 4.11 学业情况 / GPA（`N105515`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| GET | `/xsxy/xsxyqk_cxXsxyqkIndex.html?gnmkdm=N105515&layout=default` | 可加 `echarts=1` | HTML + JS 模板（1.4MB） | 成功 |
| POST | `/xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515` | `xfyqjd_id` | 裸数组（课程明细） | 根节点空 |
| POST | `/xsxy/xsxyqk_cxJxzxjhxfyqFKcxx.html?gnmkdm=N105515` | `xfyqjd_id` | 裸数组（非计划课程） | 未实测 |
| GET | `/xsxy/xsxyqk_cxShowGpaView.html?gnmkdm=N105515` | 学期参数 | HTML/JSON（GPA 弹窗） | 未实测 |
| GET | `/xsxy/xsxyqk_cxShowJqPjfView.html?gnmkdm=N105515` | 学期参数 | HTML/JSON（加权平均分） | 未实测 |
| GET | `/xsxy/xsxyqk_cxKcxdxx.html?gnmkdm=N105515` | `xfyqjd_id` | HTML/JSON（课程修读详情） | 未实测 |
| GET | `/xsxy/xsxyqk_cxXsKcthSq.html?gnmkdm=N105515` | — | HTML（课程替代申请） | 未实测 |
| GET | `/xsxy/xsxyqk_cxDgshCjxfrdxx.html?gnmkdm=N105515` | — | HTML（成绩学分认定） | 未实测 |
| GET | `/xsxy/xsxyqk_cxXwtdView.html?gnmkdm=N105515` | — | HTML（学位条件） | 未实测 |
| GET | `/xsxy/xsxyqk_cxJdtdView.html?gnmkdm=N105515` | — | HTML（绩点条件） | 未实测 |
| GET | `/jxjhgl/common_cxKcJbxx.html` | `id=<课程代码>` | HTML 课程基本信息 | 8435B |

分类课程明细字段：`KCH,KCMC,KCYWMC,XDZT,XF,KCLBMC,KCXZMC,CJ,MAXCJ,JD,JYXDXNMC,JYXDXQMC,SFJHKC,XSXXXX`。
根节点/汇总节点返回空数组是正常现象，只有叶子节点有数据。

### 4.12 教学执行计划（`N153540`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| GET | `/jxzxjhgl/jxzxjhck_cxJxzxjhckIndex.html?gnmkdm=N153540` | — | HTML（学院/年级/专业预选） | 32596B |
| POST | `/jxzxjhgl/jxzxjhck_cxJxzxjhckIndex.html?doType=query&gnmkdm=N153540` | `jg_id,njdm_id,zyh_id,dlbs,currentPage_cx` | `{items,totalCount}` | 1 条（本专业） |
| POST | `/jxzxjhgl/jxzxjhkcxx_cxJxzxjhkcxxIndex.html?doType=query&gnmkdm=N153540` | `jxzxjhxx_id,kch,jyxdxnm,jyxdxqm,yxxdxnm,yxxdxqm,shzt,xdlx` | `{items,totalCount}` | 99 条 |
| POST | `/jxzxjhgl/jxzxjhck_dcJxzxjhckIndex.html` | 主列表条件 | Excel | 未实测 |
| POST | `/jxzxjhgl/jxzxjhkcxx_dcJxzxjhkcxxIndex.html` | 课程条件 | Excel | 未实测 |
| GET | `/jxzxjhgl/jxzxjhxxwh_cxZyfxxx.html` | `jxzxjhxx_id` | HTML（专业方向） | 未实测 |
| GET | `/jxzxjhgl/jxzxjhxxwh_cxBjxx.html` | `jxzxjhxx_id` | HTML（班级信息） | 未实测 |
| GET | `/jxzxjhgl/jxzxjhck_cxJxzxjhxdyqIndex.html` | `jxzxjhxx_id` | HTML（修读要求） | 未实测 |
| GET | `/jxzxjhgl/jxzxjhxxwh_cxDyJxzxjhxx.html` | `jxzxjhxx_id` | HTML（计划详情） | 未实测 |
| GET | `/kkqkcx/kkqkcx_cxKcxsxxGJH.html` | 课程/计划参数 | 开课信息 | 未实测 |

主列表字段：`jxzxjhxx_id,njdm,njmc,jg_id,zyh_id,zymc,xz,zdxf,kcs,jhrs,dlbs,rwbj,zyfxgs,sfgazy,xqmc,bjgs`。
课程明细字段：`jxzxjhkcxx_id,jxzxjhxx_id,kch,kch_id,kcmc,kcywmc,xf,zxs,khfsdm,kcxzmc,kclxmc,jyxdxnm,jyxdxqm,shzt,shjgmc,zcbj,jcbj,...`。

> 主列表不带过滤会返回全校 1882 条（单页约 1.4MB）。默认按视图页预选的
> `jg_id + njdm_id + zyh_id` 过滤。

### 4.13 缴费（`N0185`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/paycenter/paycenter_cxGrjfIndex.html?doType=query&gnmkdm=N0185` | `xnm,xqm,sfqr,flg` | `{items,totalCount}` | 0 条 |
| POST | `/paycenter/paycenter_cxGrtfIndex.html?doType=query` | `xnm,xqm` | `{items,totalCount}`（退费记录） | 未实测 |
| POST | `/paycenter/paycenter_cxDqOrder.html` | 订单参数 | 当前订单 | 未实测 |
| GET | `/paycenter/paycenter_cxJfsm.html` | 订单参数 | 缴费说明 | 未实测 |
| POST | `/paycenter/paycenter_cxJfxmzfzt.html` | 订单参数 | 支付状态 | 未实测 |
| GET | `/paycenter/paycenter_cxDdxqDetail.html` | `order_id` | 订单详情 | 未实测 |
| GET | `/paycenter/paycenter_cxPayState.html` | 订单参数 | 支付状态 | 未实测 |
| POST | `/paycenter/paycenter_cxJfxztj.html` | `xnm,xqm` | 缴费统计 | 未实测 |
| POST | `/paycenter/paycenter_cxJfxmtj.html` | `xnm,xqm` | 项目统计 | 未实测 |

查询字段参考：`zfywsj_ids,xnm,xqm,ywdm,order_count,jfkssj,jfjssj,jfxnm,jfxqm,xm,xmdm,order_men`。
**写接口**（生成订单、支付、释放、退费）一律不实现，见 §6。

### 4.14 微专业 / 辅修 / 二学位（`N214556`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| GET | `/kbdy2/fxzykbdy_cxFxzyKbdyIndex.html?kklxdm=02&gnmkdm=N214556` | `kklxdm` = `02` 微专业 / `03` 二学位 / `04` 辅修 | HTML 选单 | 25065B |
| POST | `/kbdy2/fxzykbdy_cxFxzyKbdyTjkbList.html?doType=query&gnmkdm=N214556` | `xnm,xqm,kklxdm,jg_id,njdm_id,zyh_id,zs` | `{items,totalCount}` | 02/03/04 均 0 条 |
| POST | `/kbdy2/fxzykbdy_cxDcExcelFxzykb.html` | 同上 | Excel | 未实测 |
| GET | `/kbdy2/fxzykbdy_ylFxzykbdyIndex.html` | 课表参数 | HTML 预览 | 未实测 |
| GET | `/kbdy/bjkbdy_cxKbzdxsxx.html` | `kbzl=fx/exw/ezy` | 教师信息 | 未实测 |

### 4.15 毕业设计成绩（`N532560`）

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| POST | `/xsbysjgl/cjck_cxCjckIndex.html?doType=query&gnmkdm=N532560` | `xnm,xqm` | `{items,totalCount}` | 0 条 |
| GET | `/xsbysjgl/cjck_ckCjckView.html` | `xnm,xqm` | HTML 详情 | 未实测 |

### 4.16 公共下拉 / 级联（只读）

这些接口大多返回标准网格 `{items,totalCount}` 或裸数组，适合做通用级联。

| 方法 | 路径 | 参数 | 响应 | 实测 |
|---|---|---|---|---|
| GET | `/xtgl/comm_cxKkbmList.html` | `rangeable=false` | 裸数组（38 个开课单位） | 38 项 |
| GET | `/xtgl/comm_cxNjPaged.html` | 分页参数 | 网格（年级） | 成功 |
| GET | `/xtgl/comm_cxXydmPaged.html` | `localeKey=zh_CN` + 分页 | 网格（学院） | 成功 |
| GET | `/xtgl/comm_cxZydmPaged.html` | `localeKey=zh_CN` + 分页 | 网格（专业） | 成功 |
| GET | `/xtgl/comm_cxBjdmPaged.html` | `localeKey=zh_CN` + 分页 | 网格（班级） | 成功 |
| GET | `/query/query_cxXqList.html` | `sfky=1` | 网格（校区） | 成功 |
| GET | `/xkgl/common_queryKclbListPaged.html` | 分页 | 网格（课程类别） | 成功 |
| GET | `/xkgl/common_queryKcxzPaged.html` | 分页 | 网格（课程性质） | 成功 |
| GET | `/xkgl/common_queryKcgsPaged.html` | 分页 | 网格（课程归属） | 成功 |
| GET | `/xtgl/comm_cxJcsjList.html` | `lxdm=0032`（教学方式）/ `0036`（上课时间） | 网格 | 成功 |
| GET | `/xkgl/common_querySkjcList.html` | 分页 | 网格（上课节次） | 成功 |
| GET | `/xtgl/comm_cxKkbmPaged.html` | `localeKey` + 分页 | 网格（开课单位） | 未实测 |
| GET | `/xkgl/common_queryKkbmPaged.html` | `localeKey` + 分页 | 网格（开课单位） | 未实测 |
| GET | `/xtgl/comm_cxNjPaged.html` | 分页 | 网格 | 成功 |
| GET | `/xkgl/common_queryNjPaged.html` | `njdm_id` | 网格 | 未实测 |
| GET | `/xsxxxggl/xsxxwh_cxZyfxPaged.html` | `localeKey` + 分页 | 网格（专业方向） | 未实测 |
| GET | `/query/query_cxXqList.html` | `sfky=1` | 网格（校区） | 成功 |

分页参数与列表 Action 相同：`page,rows,sidx,sord,_search,nd,queryModel.showCount,queryModel.currentPage`。

## 5. 导出 / PDF / 文件接口

### 5.1 个人课表 PDF（CLI 已实现）

```
POST /kbdy/bjkbdy_cxXnxqsfkz.html?gnmkdm=N2151      # 预检
POST /kbcx/xskbcx_cxXsShcPdf.html?doType=table      # 生成 PDF
```

body：`xm,xnm,xqm,xnmc,xqmmc,jgmc=undefined,xxdm,kzlx=dy` + `xszd.*`（sj/cd/js/jszc/jxb/xkbz/...）。
响应必须是 `%PDF-`。

### 5.2 成绩总表 PDF（CLI 已实现）

六步生成链：

```
POST /bysxxcx/xscjzbdy_dyXscjzbView.html?gnmkdm=N558020   {gnmkdm}
POST /bysxxcx/xscjzbdy_dyCjdyszxView.html                  {xh}
POST /xtgl/bysxxcx/xscjzbdy_cxXsCount.html                 {gsdygx,ids,...}
POST /bysxxcx/xscjzbdy_cxGswjlx.html                       {gsdygx,ids,...}
POST /common/common_cxJwxtxx.html                           {gnmkdm}
POST /bysxxcx/xscjzbdy_dyList.html                          {gsdygx,ids,...}
POST /xtgl/progress_cxProgressStatus.html                   {key=score_print_processed,gnmkdm}
GET  <返回的文件路径>
```

`ACADEMIA_PDF_DATA` 字段：`gsdygx=10628-zw-mrgs,ids,bdykcxzDms,cytjkcxzDms,cytjkclbDms,cytjkcgsDms,bjgbdykcxzDms,bjgbdyxxkcxzDms,djksxmDms,cjbzmcDms,cjdySzxs`。

### 5.3 其它导出（未实测，均只读）

| 功能 | 方法 | 路径 | 参数 |
|---|---|---|---|
| 成绩导出 | POST | `/cjcx/cjcx_dcListByXs.html` | 成绩 paramMap + `dcclbh` |
| 班级成绩打印 | POST | `/cjcx/cjcx_bjdyBjcjWord.html` | `xnm,xqm,bh_id` |
| 成绩单打印 | POST | `/cjcx/cjcx_dyList.html` | `xnm,xqm,bh_id` + 条件 |
| 考试导出 | POST | `/kwgl/kscx_dcXsksxxList.html` | 考试 paramMap + `dcclbh` |
| 考试安排打印 | POST | `/kwgl/kscx_cxDyKsapylb.html` / `kscx_cxDyKsjcb.html` | 考试条件 |
| 选课名单导出 | POST | `/xkcx/xkmdcx_dcList.html` | 选课名单 paramMap + `dcclbh`, `xsbjmc` |
| 空闲教室导出 | POST | `/cdjy/cdjy_cxDcKxcdlb.html` | 教室查询条件 |
| 个人课表 Excel | POST | `/kbcx/xskbcx_cxDcExcelXskb.html?exceltopdf=1` / `?doType=table` | 课表参数 + `xszd.*` |
| 班级课表 Excel | POST | `/kbdy/bjkbdy_cxDcExcelBjkb.html?doType=one\|manySheet\|table` | 班级课表 paramMap |
| 班级课表 PDF | POST | `/kbdy/bjkbdy_shcpdfBjkb.html?doType=list\|table\|both` | 班级课表 paramMap |
| 班级课表（校区/周课表） | POST | `/kbdy/bjkbdy_cxDcExcelQxkb.html`、`/kbdy/bjkbdy_cxDcExcelZckb.html`、`/kbdy/bjkbdy_cxDcExcelSlhlBjkb.html`、`/kbdy/bjkbdy_cxDcExceldkb.html` | 班级课表 paramMap |
| 执行计划导出 | POST | `/jxzxjhgl/jxzxjhck_dcJxzxjhckIndex.html` | 主列表条件 |
| 执行计划课程导出 | POST | `/jxzxjhgl/jxzxjhkcxx_dcJxzxjhkcxxIndex.html` | 课程条件 |
| 微专业导出 | POST | `/kbdy2/fxzykbdy_cxDcExcelFxzykb.html` | 微专业 paramMap |
| 毕业设计成绩打印 | POST | `/bygl/xwsqsh_dyList.html` | 毕业条件 |
| 附件下载/预览 | GET/POST | `/xtgl/file_cxDownFile.html`、`/xtgl/wjyl_cxWjyl.html` | `fjsclj,fjm` |
| 进度查询 | GET | `/xtgl/progress_cxProgressStatus.html?key=<任务>` | 见各导出任务 |

## 6. 写接口（只登记，不实现）

以下路径来自页面 JS，均会修改服务端状态或有金钱/不可逆副作用。**本项目不调用、不重试、不重放**。

| 模块 | 写接口（示例） | 说明 |
|---|---|---|
| 学籍异动 | `/xjyd/xjydsq_zjXjydsq.html`、`xjydsq_xgXjydsq.html`、`xjydsq_scXjydsq.html`、`xjydsq_qxXjydsq.html` | 申请/修改/删除/撤销 |
| 辅修报名 | `/fxgl/fxbm_zjXsfxbm.html`、`fxbm_scXsfxbm.html`、`fxbm_scSfxtbsq.html`、`fxbm_scQxfxtbsq.html` | 报名/退报 |
| 重修报名 | `/cxbm/cxbm_tbXscxbm.html`、`cxbm_bmXscxbm.html`、`cxbm_tbXscxxk.html`、`cxbm_bmXscxxk.html` | 报名/选课 |
| 学生证补办 | `/xszbbgl/xszbbgl_tjXszbbsq.html` | 提交申请 |
| 转专业 | `/xszzy/xszzysqgl_*` | 申请/修改 |
| 项目报名 | `/kjgl/kjbm_zjXskjbm.html`、`kjbm_zjXskjbmQr.html`、`kjbm_scXskjbm.html` | 报名/确认/删除 |
| 教学项目报名 | `/jxrwbmgl/jxrwxmbm_bmJxxmZc.html`、`jxrwxmbm_scJxrwxmbm.html`、`jxrwxmbm_zjJxrwxmbmIndex.html` | 报名/删除 |
| 成绩学分认定 | `/cjxfrdgl/cjxfrdsq_tjCjxfrdsq.html`、`cjxfrdsq_sqCjxfrd.html`、`cjxfrdsq_xgCjxfrd.html`、`cjxfrdsq_scCjxfrd.html` | 提交/修改/删除 |
| 退书申请 | `/jcdggl/jcck_cxTjXstssq.html`、`jcck_scXstssq.html`、`jcck_cxshXstssq.html` | 提交/删除/审核 |
| 课程替代 | `/kcthgl/xskcthsq_tjKcthsqxx.html?sqlx=xnkc`、`xskcthsq_scKcthsqxx.html`、`xskcthsq_sqbXnkcthSqbSubmit.html` | 提交/删除 |
| 学历学位 | `/bygl/xwsqsh_sqXsxlxwsqView.html`、`xwsqsh_scXsxlxwsq.html`、`xwsqsh_xgXsxlxwsqView.html` | 申请/修改/删除 |
| 等级考试成绩申请 | `/kjgl/djkscjsq_sqDjkscjView.html`、`djkscjsq_tjDjkscjsq.html`、`djkscjsq_scDjkscj.html` | 申请/删除 |
| 非课程成果认定 | `/cxcygl/cxcycgxfrdsq_sqCxcycgxfrdSelect.html`、`cxcycgxfrdsq_tjCjxfrdsq.html`、`cxcycgxfrdsq_scCjxfrd.html` | 申请/删除 |
| 等级考试学分认定 | `/xfrdgl/xfrdsq_sqXfrdView2.html`、`xfrdsq_tjXfrdxx2.html`、`xfrdsq_tjXfrdsqxx2.html`、`xfrdsq_xgXfrdView.html` | 申请/修改 |
| 个人信息维护 | `/xsxxxggl/xsgrxxwh_xgXsgrxx.html`、`xsgrxxwh_xgBcXsgrxx.html`、`xsgrxxwh_scXsxxXgsq.html` | 修改/保存/删除 |
| 毕业照片确认 | `/byzpqr/byzpqr_cxBcByzpqr.html` | 确认（不可逆） |
| 缴费 | `/paycenter/paycenter_buildOrder.html`、`paycenter_cxCreateOrder.html`、`paycenter_cxPayChooseIndex.html`、`paycenter_cxUpdatePayState.html`、`paycenter_cxRollBackPayStatus.html`、`paycenter_cxCancelOrder.html`、`paycenter_cxUpdateOrder.html`、`paycenter_payRedirectCloud.html` | 金钱/订单 |
| 自主选课 | `/xsxk/zzxkyzb_xkBcZyZzxkYzb.html`、`zzxkyzb_tuikBcZzxkYzb.html`、`zzxkyzb_xkZzxkyzbQuickly.html` | 选课/退课 |
| 学生评价 | `/xspjgl/xspj_cxBcFqpj.html`、`xspj_cxBcCjpj.html`、`xspj_cxQtjssfypj.html` | 保存/提交评教 |
| 密码修改 | `/xtgl/mmgl_xgRsaMm.html` | 修改密码 |

## 7. 未实测 / 当前不可用

| 项目 | 现象 | 结论 |
|---|---|---|
| `GET /xtgl/index_initMenu.html` | 当前返回「请重置密码」页；访问后业务 Action 变「无功能权限」 | 账号待重置密码；采集时避开 |
| `GET /xsxxxggl/xsxxwh_cxXxqm.html` | 「请求的方法cxXxqm在对象XsxxwhAction中未定义」 | 页面 JS 里已注释掉，接口不存在 |
| `POST /xsxxxggl/xsxxwh_cxCkDgxsxx.html` | 页面 JS 用 POST，本轮返回空 body | 改用 GET（带 `gnmkdm=N100801`）可拿到 63 字段对象 |
| `GET /xkgl/common_cxKcxxModel.html` | 本轮 302 | 需要对话框上下文/参数，未确认 |
| 自主选课板块/选课 | 非选课期只显示「当前不属于选课阶段」 | 需在选课期重新抓包 |
| 微专业/辅修/二学位列表 | 02/03/04 均 0 条 | 当前账号无数据，字段按 JS colModel 记录 |
| 毕业设计成绩 | 0 条 | 当前学期无数据 |
| 学业分类根节点 | 返回空数组 | 汇总节点本来就没有课程，叶子节点才有 |
| 部分导出/PDF | 未下载真实文件 | 路径与参数来自 JS，调用前需再确认 |

## 8. 给 CLI 的扩展建议（按价值排序）

1. **`profile --full`**：用 `xsxxwh_cxCkDgxsxx.html`（GET）一次拿到 63 字段，
   再按需拉 `cxDjksxx`（等级考试）、`cxXsjtcy`（家庭成员）、`cxXsxkxx`（已选课程）。
2. **`plan --course` 已实现**，但可补 `--json` 输出课程明细的完整字段；
   主列表默认过滤条件已从视图页预选值取得。
3. **`exams --wpks`**：`kscx_cxWpkskcList.html` 是独立的「未排考课程」网格，
   与主考试列表互补。
4. **`course info <课程号>`**：`/jxjhgl/common_cxKcJbxx.html?id=<kch>` 返回
   课程代码/中英文名/学分/学时/简介/大纲，适合做 `usts course`。
5. **`score detail`**：`cjcx_cxCjxqGjh.html` 返回成绩分项，
   参数来自成绩行的 `jxb_id/xnm/xqm/xh_id/kcmc`。
6. **`bysj`**：`N532560` 已确认契约（当前 0 条），实现成本低。
7. **导出**：`--export <path>` 可复用 §5 的路径；注意导出是 `export/read`，
   文件内容可能含个人信息，默认不落盘。

## 9. 复现方式（人工）

```bash
# 1) 登录（避开 index_initMenu）
usts login

# 2) 取视图页（必须带 gnmkdm）
curl -s -b "$COOKIE" \
  'https://jwgl.usts.edu.cn/jwglxt/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005' \
  -o /tmp/score-view.html

# 3) 调列表 Action（双分页）
curl -s -b "$COOKIE" \
  -H 'Content-Type: application/x-www-form-urlencoded;charset=UTF-8' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Referer: https://jwgl.usts.edu.cn/jwglxt/cjcx/cjcx_cxDgXscj.html' \
  --data 'xnm=2026&xqm=3&_search=false&nd=1&page=1&rows=100&sidx=&sord=asc&queryModel.showCount=5000&queryModel.currentPage=1' \
  'https://jwgl.usts.edu.cn/jwglxt/cjcx/cjcx_cxXsgrcj.html?doType=query&gnmkdm=N305005'
```

> 上面的 `$COOKIE` 从已登录会话中取；不要把真实 Cookie、学号、姓名写入仓库。
