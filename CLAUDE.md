# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`usts` is a Node.js (CommonJS) CLI for the 苏州科技大学 (Suzhou University of Science & Technology) **正方教务系统** (Zhifang educational administration system) at `jwgl.usts.edu.cn/jwglxt`. It logs in as a student and performs **read-only** queries (grades, exams, course lists, schedule, profile). Source is TypeScript in `src/`, compiled to `dist/`, exposed as the `usts` binary.

## Commands

- `npm install` — install dependencies (downloads a Chrome build for Puppeteer on first install).
- `npm run build` — compile TypeScript to `dist/` (`tsc`; strict mode is on — resolve type errors before committing).
- `node dist/index.js <command>` — run the built CLI (requires a prior build). Also aliased as `npm run start`; `npm link` exposes it globally as `usts`.
- `npm run dev -- <command>` — run via `ts-node` without compiling. For long-running commands (e.g. `login` launches a headless browser), prefer the compiled `node dist/index.js login` — ts-node invocations can be killed by tooling monitor windows.
- `node dist/index.js` (no args) — interactive menu shell (login / queries / profile). The menu also exposes 班级课表 (`clsched`).
- First use: `usts login`, which persists a session to `.session.json`; subsequent queries reuse it.

**There is no test runner or linter configured** — `package.json` has no `test`/`lint` scripts. Don't assume `npm test` works.

**Dependency split gotcha**: only `inquirer` and `puppeteer*` are in `dependencies`; `axios` and `commander` (both imported at runtime by `src/`) are in `devDependencies`. A `--production` install or repackaging just `dist/` will fail at runtime with missing modules. Keep runtime imports in `dependencies`.

## Architecture

Three layers under `src/`:

- **`lib/client.ts` — `JwglClient`, the single HTTP boundary.** Wraps an axios instance (`baseURL` = 教务系统 host, 30s timeout, `maxRedirects: 0`, `validateStatus: () => true` so it can judge login/redirects itself). Owns the session cookie jar (`Map<string,string>` + `username`/`loginTime`, types in `types/api.ts`).
- **`commands/` — one exported async function per CLI command**, each taking a `JwglClient` and an opts object. `commands/_shared.ts` holds `ensureSession()` (restore + validate session; prints a hint and returns `false` if unusable), `resolveTerm()`, and term-label helpers. `interactive.ts` is the menu shell that reuses the same command functions.
- **`index.ts` — the commander router** at the entry point. Registers `login`, `scores`, `exams`, `courses`, `schedule`, `profile`; `scores/exams/courses/schedule` share `-y/--xnm` and `-t/--xqm` options via `addTermOptions()`. With no args it launches `interactiveShell()`.

Support modules: `lib/logger.ts` (ANSI-colored output: `success`/`error`/`warning`/`info`/`header`), `lib/format.ts` (`printTable`), `lib/env.ts` (minimal dotenv-style `.env` loader, non-overriding). All output/UI text is Chinese; comments and API field names are Chinese/pinyin.

## The 正方 V9 data interface (the key to adding a query)

List endpoints follow one contract (verified live, documented in `WEB_ARCHITECTURE.md`, implemented in `postGrid` in `client.ts`):

- **POST** to the **data action path**, URL query `?doType=query&gnmkdm=<功能码>` (no `su` — the server resolves the student from the session cookie).
- **Body** = query params (`xnm`/`xqm`) + **two pagination sets, both required**: the classic `_search=false&nd=<ts>&page=1&rows=100&sidx=&sord=asc` (without them the server rejects with an error page) **and** `queryModel.showCount=5000&queryModel.currentPage=1` (which the server *actually* uses for paging — it ignores `page`/`rows`; 5000 fetches everything in one shot). A pure `queryModel.*` body sent via axios is also rejected; the hybrid is the combination that works.
- **Headers**: `Cookie`, `Referer` (the view path), `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`, `X-Requested-With: XMLHttpRequest`.
- **Response**: `{ items: [...], totalCount: N }`. (A `status=910` HTTP wrapper or an HTML 错误提示 page means the request was rejected — wrong action URL or missing classic pagination fields.)

Verified module codes:

| Feature | gnmkdm | Data action | `client` method |
|---|---|---|---|
| Scores | `N305005` | `/cjcx/cjcx_cxXsgrcj.html` | `queryScores` |
| Exams | `N358105` | `/kwgl/kscx_cxXsksxxIndex.html` | `queryExams` |
| Course list | `N255010` | `/xkcx/xkmdcx_cxXkmdcxIndex.html` | `queryCourseList` |
| Schedule | `N2151` | `/kbcx/xskbcx_cxXsgrkb.html` (no `doType=query`; minimal body `xnm&xqm&kzlx=ck&xsdm=&kclbdm=&kclxdm=`) | `querySchedule` |
| Profile | `N100801` | GET `/xsxxxggl/xsgrxxwh_cxXsgrxx.html` | `queryProfile` (label→value HTML parse) |

Schedule caveat: `sjkList` items carry `xqj`/`jc` (weekday/section) only for courses with fixed slots; 实践课/MOOC summer courses omit them and land in the "无固定时间" group. Course-list teacher field is `jsmc` (not `jsxm`).

**Class schedule** (`clsched`, gnmkdm `N214505`) — the "query any class" feature. College/campus/grade dropdown options are parsed out of the view page `GET /kbdy/bjkbdy_cxBjkbdyIndex.html` HTML; majors/classes come from `comm_cxZydmList.html` / `comm_cxBjdmList.html`. The timetable POST `/kbdy/bjkbdy_cxBjKb.html` **requires `bh` to be the class *number* (e.g. `2520401000`), matching `bh_id` — passing the class name returns an empty `kbList`**. Its teacher field is `xm` (not `jsxm`); filter out placeholder rows with `cdmc === '未排地点'`. See `WEB_ARCHITECTURE.md` §7.6.

### Extension pattern for a new query

1. Add the result type to `types/api.ts`.
2. Add a method on `JwglClient` in `lib/client.ts` (use `postGrid` for list endpoints).
3. Add a command function in `commands/` (call `ensureSession`, `resolveTerm`).
4. Register it in `index.ts` via commander.

## Session & login

- `loginCommand` (in `commands/login.ts`) tries in order: existing valid `.session.json` → `USTS_COOKIES` env injection → Puppeteer browser login (`loginViaBrowser`, using `.env` creds or an `inquirer` prompt).
- **Login goes through CAS 统一身份认证** (`sso.usts.edu.cn`, 2026-08). Both the SSO server and jwgl sit behind a 瑞数 JSLUID WAF, so pure-axios login is impossible. `loginViaBrowser` drives headless Chrome straight to the CAS URL (`https://sso.usts.edu.cn/login?service=http://<host>/sso/jasiglogin/jwglxt`), waits out the WAF challenge, fills `input[name=username]` + `input[type=password]` via **native setters** (Angular re-renders truncate `page.type`), and clicks `button.login-button` (which has a `disabled` class until the form is valid). If a visible captcha appears it cannot be solved automatically — the CLI then tells the user to use `npm run capture` (manual login that writes `.session.json`) or inject `USTS_COOKIES`.
- Sessions expire server-side after hours–days. Re-run `usts login`.
- Credentials/config: `USTS_BASE_URL`, `USTS_USERNAME`, `USTS_PASSWORD`, `USTS_COOKIES` via `.env` (gitignored) or real env vars. `.env` injects into `process.env` without overriding existing values.

## Gotchas

- **WAF rate-limiting**: rapid repeated requests get the connection reset (`ERR_CONNECTION_CLOSED`). Wait 30–60s and retry. `loginViaBrowser` already retries 3× with backoff.
- **Session-validity check is conservative**: `validateSession` treats only 302→login page, "请先登录"/"登录超时", or login-page HTML as logged-out. A bare "错误提示" page (missing `gnmkdm`/params) means the session is fine, not expired.
- **Term defaults** (aligned with the web, 2026-08 verified): `JwglClient.currentTerm()` — Aug–Dec → `{xnm: current year, xqm:'3'}` (the upcoming fall semester); Feb–Jul → `{xnm: previous year, xqm:'12'}`; Jan → `{xnm: previous year, xqm:'3'}`. Codes: `3`=fall, `12`=spring, `16`=short term. Passing `-y` without `-t` leaves the term empty = all semesters of that year.
- Response field names are pinyin abbreviations of the Chinese labels (e.g. `kcmc`=课程名称/course name, `jsxm`=教师/teacher, `xf`=学分/credit). See the comments in `types/api.ts`.
- **`_`-prefixed files in the repo root** (`_cxDgXscj.js`, `_sched_probe.mjs`, `_sched_data.json`, `_probe_out.txt`, `_check_waf.txt`, `_tsc.log`, …) are exploratory reverse-engineering scratch artifacts (WAF probing / schedule-JS inspection). They are not source and not part of the build — safe to ignore or delete.
- `.session.json` is resolved against `process.cwd()` and is gitignored — never commit it.
