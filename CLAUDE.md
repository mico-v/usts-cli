# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`usts` is a Node.js (CommonJS) CLI for the 苏州科技大学 (Suzhou University of Science & Technology) **正方教务系统** (Zhifang educational administration system) at `jwgl.usts.edu.cn/jwglxt`. It logs in as a student and performs **read-only** queries (grades, exams, course lists, schedule, profile). Source is TypeScript in `src/`, compiled to `dist/`, exposed as the `usts` binary.

Runtime baseline: Node.js `>=22.12` (Commander 15 requirement).

## Commands

- `npm install` — install dependencies. `puppeteer*` sits in `devDependencies` (only used by the dev `npm run capture` tool), so its Chrome download can be skipped with `npm install --omit=dev` — **login does not need a browser**.
- `npm run build` — compile TypeScript to `dist/` (`tsc`; strict mode is on — resolve type errors before committing).
- `node dist/index.js <command>` — run the built CLI (requires a prior build). Also aliased as `npm run start`; `npm link` exposes it globally as `usts`.
- `npm run dev -- <command>` — run via `ts-node` without compiling. Prefer the compiled `node dist/index.js <command>` for reliability — ts-node invocations can be killed by tooling monitor windows.
- `node dist/index.js` (no args) — interactive menu shell (login / queries / profile). The menu also exposes 班级课表 (`clsched`).
- First use: `usts login`, which persists a private session in the OS user state directory; legacy cwd `.session.json` is migrated.

Quality commands: `npm run typecheck`, `npm run lint`, `npm test`, and the aggregate `npm run check`. Tests use Node's built-in test runner against compiled `dist/` output.

**Dependency split**: `dependencies` = `axios`, `commander`, `inquirer` (all imported at runtime by `src/`); `devDependencies` = `typescript`, `ts-node`, `@types/*`, and `puppeteer*` (runtime no longer needs Puppeteer — only the dev `tools/capture-browser.mjs` does). A `--omit=dev`/`--production` install of just `dist/` runs fine. Keep runtime imports in `dependencies`.

## Architecture

The project is a modular monolith with ports/adapters boundaries (see `docs/architecture.md`):

- **`domain/`** — stable errors and pure term rules; no Axios, filesystem, Commander, or Inquirer imports.
- **`config/`** — trusted Base URL policy and cross-platform state paths.
- **`infrastructure/http/`** — explicit keep-alive agents, retry semantics, and an attribute-aware Cookie Jar.
- **`infrastructure/session/`** — versioned, origin-bound, atomic `0700/0600` session storage.
- **`infrastructure/jwgl/`** — remote DTO validation, parsers, and domain mappers.
- **`lib/client.ts`** — compatibility façade while endpoint capabilities are gradually extracted.
- **`commands/`** — CLI orchestration/presentation. `ensureSession()` restores locally only; business responses detect expiry, avoiding a preflight request for every command.
- **`index.ts`** — Commander router and top-level error/exit-code boundary.

All output/UI text is Chinese; comments and remote API field names are Chinese/pinyin. Keep the dependency direction documented in `docs/architecture.md`.

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

1. Add/adjust the stable domain result type in `types/api.ts` (remote fields do not belong there).
2. Add DTO validation and mapping under `infrastructure/jwgl/`.
3. Add the endpoint adapter (temporarily delegated through `JwglClient`; use `postGrid` for list endpoints).
4. Add a command function in `commands/` (call `ensureSession`, `resolveTerm`, and `reportCommandError`).
5. Register it in `index.ts` and add fixture/CLI tests.

## Session & login

- `loginCommand` (in `commands/login.ts`) tries in order: existing valid secure session → `USTS_COOKIES` env injection → pure-script login (`loginViaScript`, using `.env` creds or an `inquirer` prompt).
- **Login is pure script (2026-08 verified)**: classic 正方 `login_slogin.html` RSA login, no Puppeteer/Chrome. The 瑞数 JSLUID WAF **resets the session's *first* login POST** (302 back to login + rotated JSESSIONID), so `loginViaScript` just retries the identical POST once on the same cookie jar — the second one lands on `index_initMenu.html`. It fetches the login page (parse `#csrftoken`), GETs `login_getPublicKey.html`, RSA-encrypts the password (PKCS#1 v1.5, Node `crypto`), POSTs `{csrftoken, yhm, mm, language=zh_CN, ydType=}` (mm twice like the browser). The same csrtoken/mm is reused across the retry. If a captcha is required (`input#yzm`, after repeated failures) it can't be solved automatically — the CLI then tells the user to inject `USTS_COOKIES` or use `npm run capture`.
- Sessions expire server-side after hours–days. Re-run `usts login`.
- Credentials/config: `USTS_BASE_URL`, `USTS_USERNAME`, `USTS_PASSWORD`, `USTS_COOKIES` via `.env` (gitignored) or real env vars. `.env` injects into `process.env` without overriding existing values.

## Gotchas

- **WAF rate-limiting**: rapid repeated requests get the connection reset (`ERR_CONNECTION_CLOSED`). Wait 30–60s and retry. `loginViaScript` already retries 3× with backoff (via `requestWithRetry`).
- **Session-validity check is conservative**: `validateSession` treats only 302→login page, "请先登录"/"登录超时", or login-page HTML as logged-out. A bare "错误提示" page (missing `gnmkdm`/params) means the session is fine, not expired.
- **Term defaults** (aligned with the web, 2026-08 verified): `JwglClient.currentTerm()` — Aug–Dec → `{xnm: current year, xqm:'3'}` (the upcoming fall semester); Feb–Jul → `{xnm: previous year, xqm:'12'}`; Jan → `{xnm: previous year, xqm:'3'}`. Codes: `3`=fall, `12`=spring, `16`=short term. Passing `-y` without `-t` leaves the term empty = all semesters of that year.
- Response field names are pinyin abbreviations of the Chinese labels (e.g. `kcmc`=课程名称/course name, `jsxm`=教师/teacher, `xf`=学分/credit). See the comments in `types/api.ts`.
- **`_`-prefixed files in the repo root** (`_cxDgXscj.js`, `_sched_probe.mjs`, `_sched_data.json`, `_probe_out.txt`, `_check_waf.txt`, `_tsc.log`, …) are exploratory reverse-engineering scratch artifacts (WAF probing / schedule-JS inspection). They are not source and not part of the build — safe to ignore or delete.
- Session state defaults to the OS user state directory (`~/.local/state/usts-cli/session.json` on Linux), uses `0700/0600`, and is origin-bound. Never commit legacy `.session.json` or capture data.
