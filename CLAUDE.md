# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`usts` is a Node.js (CommonJS) CLI for the 苏州科技大学 (Suzhou University of Science & Technology) **正方教务系统** (Zhifang educational administration system) at `jwgl.usts.edu.cn/jwglxt`. It logs in as a student and performs **read-only** queries (grades, exams, course lists, schedule, profile). Source is TypeScript in `src/`, compiled to `dist/`, exposed as the `usts` binary.

Runtime baseline: Node.js `>=22.12` (Commander 15 requirement).

## Commands

- `npm install` — install dependencies. `puppeteer*` sits in `devDependencies` (only used by the dev `npm run capture` tool), so its Chrome download can be skipped with `npm install --omit=dev` — **login does not need a browser**. Note `prepare` runs on plain `npm install` too (npm 11 runs it even with `--omit=dev`), so it is `node tools/prepare.mjs`, which builds when `typescript` is present and skips otherwise.
- `npm run build` — compile TypeScript to `dist/` (`tsc`; strict mode is on — resolve type errors before committing).
- `node dist/index.js <command>` — run the built CLI (requires a prior build). Also aliased as `npm run start`; `npm link` exposes it globally as `usts` (the `prepare` hook builds automatically).
- `npm run dev -- <command>` — run via `ts-node` without compiling. Prefer the compiled `node dist/index.js <command>` for reliability — ts-node invocations can be killed by tooling monitor windows.
- `node dist/index.js` (no args) — interactive menu shell (login / queries / profile / logout / exit). The menu also exposes 班级课表 (`clsched`). Selecting 查询 or 个人信息 fires a session check immediately so it overlaps the menu/form prompts instead of surfacing 未登录 only at the last step; that is why `SessionManager.ensure()` is single-flight.
- First use: `usts login`, which persists a private session in the OS user state directory. The session file is **bound to an `origin`** and is only loaded when it matches `USTS_BASE_URL`. Legacy cwd `.session.json` is **not** read (ADR-0004) — it is only detected at startup to tell the user to delete it.

Quality commands: `npm run typecheck`, `npm run lint`, `npm test`, and the aggregate `npm run check`. Tests use Node's built-in test runner against compiled `dist/` output.

**Dependency split**: `dependencies` = `axios`, `commander`, `inquirer` (all imported at runtime by `src/`); `devDependencies` = `typescript`, `ts-node`, `@types/*`, and `puppeteer*` (runtime no longer needs Puppeteer — only the dev `tools/capture-browser.mjs` does). A `--omit=dev`/`--production` install of just `dist/` runs fine. Keep runtime imports in `dependencies`.

## Architecture

The project is a modular monolith with ports/adapters boundaries (see `docs/architecture.md`):

- **`domain/`** — stable errors, term rules (`term.ts`: `currentTerm`, `displaySemester`, `academicYearName`), and the session-state contract; no Axios, filesystem, Commander, or Inquirer imports.
- **`application/`** — gateway ports (`ports/jwgl-gateway.ts`) and the session state machine (`session-manager.ts`: trust window, single-flight recovery, cooldown). The manager talks to I/O only through `SessionPort`, so it is unit-testable without HTTP.
- **`config/`** — trusted Base URL policy, the launch-environment snapshot (`trust.ts`), and cross-platform state/config paths.
- **`infrastructure/http/`** — `transport.ts` (keep-alive agents, retry/backoff policy, timeout classification) and `authenticated-transport.ts` (`AuthenticatedTransport`: Cookie Jar, retry, same-origin redirect following, form headers). Axios is confined to these two files plus the façade (enforced by `tools/lint.mjs`).
- **`infrastructure/session/`** — versioned, origin-bound, atomic `0700/0600` session storage.
- **`infrastructure/jwgl/`** — endpoint adapters (`auth.ts`, `records.ts`, `schedule.ts`, `academia.ts`, `document-api.ts`, `grid.ts`), response classification (`response-policy.ts`), pure page parsers (`*-page.ts`), request-body builders (`documents.ts`, `form.ts`, `class-schedule-page.ts`), and domain mappers (`mappers.ts`). These take an `AuthenticatedTransport` and contain no session state.
- **`lib/client.ts`** — the façade: session state (restore/save/logout, login-time learning), `SessionPort` for the session manager, the `withReauth` replay boundary, and thin delegation to the endpoint adapters. It holds no remote field names.
- **`types/api.ts`** — the stable result shapes shared by ports, adapters and commands (`RawFields` is only used inside this file).
- **`shared/sanitize.ts`** — terminal-output sanitising and secret redaction; the only cross-cutting leaf module.
- **`commands/`** — CLI orchestration/presentation. `ensureSession()` validates proactively (and auto-relogins) instead of only restoring locally.
- **`index.ts`** — Commander router and top-level error/exit-code boundary. Config/`.env` loading happens inside `main()`, not at import time.

All output/UI text is Chinese; comments and remote API field names are Chinese/pinyin. Keep the dependency direction documented in `docs/architecture.md`.

## The 正方 V9 data interface (the key to adding a query)

List endpoints follow one contract (verified live, documented in `WEB_ARCHITECTURE.md`, implemented in `postGrid` in `infrastructure/jwgl/grid.ts`):

- **POST** to the **data action path**, URL query `?doType=query&gnmkdm=<功能码>` (no `su` — the server resolves the student from the session cookie).
- **Body** = query params (`xnm`/`xqm`) + **two pagination sets, both required**: the classic `_search=false&nd=<ts>&page=1&rows=100&sidx=&sord=asc` (without them the server rejects with an error page) **and** `queryModel.showCount=5000&queryModel.currentPage=1` (which the server *actually* uses for paging — it ignores `page`/`rows`; 5000 fetches everything in one shot). A pure `queryModel.*` body sent via axios is also rejected; the hybrid is the combination that works.
- **Headers**: `Cookie`, `Referer` (the view path), `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`, `X-Requested-With: XMLHttpRequest`.
- **Response**: `{ items: [...], totalCount: N }`. Classification by `classifyResponse`, in this order: `901` (empty body) / `302` to login / login-page HTML ⇒ session expired; a `status=910` wrapper, an HTML 错误提示 page, or a 3xx to a non-login URL ⇒ **ambiguous** (possibly expired, possibly a rejected request) — thrown as `PROTOCOL_CHANGED` with `details.ambiguousSession`, then confirmed with a live probe rather than guessed. Any page of a multi-page grid returning non-JSON, or a JSON body without `items`/`totalCount`, is also ambiguous — partial results are never silently returned.

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

1. Add/adjust the stable result type in `types/api.ts` (remote field names do not belong there).
2. Add DTO mapping under `infrastructure/jwgl/` (`mappers.ts`) and, for HTML pages, a pure parser in a `*-page.ts`. Only map the fields something actually reads — a field that no output path consumes is dead weight.
3. Add the endpoint adapter as a free function in the matching `infrastructure/jwgl/` module (`records.ts`, `schedule.ts`, `academia.ts`, `document-api.ts`) taking an `AuthenticatedTransport`; use `postGrid` for list endpoints. It must not hold session state.
4. Expose it from the façade (`lib/client.ts`) as a thin `withReauth('read' | 'download', …)` delegation — that wrapper is the replay boundary on session expiry.
5. Add a command function in `commands/` (call `ensureSession`, `resolveTerm`, and `reportCommandError`), and add it to the interactive menu in `commands/interactive.ts` (`QueryType` + the switch; the `never` default makes a missing case a compile error).
6. Register it in `index.ts` and add fixture/CLI tests.

## Session & login

- `loginCommand` (in `commands/login.ts`) tries in order: existing valid secure session → `USTS_COOKIES` env injection → pure-script login (`loginViaScript`, using config creds or an `inquirer` prompt). A stale `USTS_COOKIES` never blocks the password path: when credentials exist, it falls back to them.
- **Validating an injected cookie must use `probeSession()`, never anything that auto-relogins.** `queryProfile()` (and every other business method) is wrapped in `withReauth`, so validating a bad cookie through it would silently log in with the configured password — reporting "cookie works" when the password did, and burning a second failed credential attempt when that password is also wrong. `probeSession()` only probes, so it answers the actual question.
- **Login is pure script (2026-08 verified)**: classic 正方 `login_slogin.html` RSA login, no Puppeteer/Chrome. The 瑞数 JSLUID WAF **resets the session's *first* login POST** (302 back to login + rotated JSESSIONID), so `loginViaScript` just retries the identical POST once on the same cookie jar — the second one lands on `index_initMenu.html`. A response that already contains a definitive credential/captcha error is **not** retried (retrying doubles the failure count toward the `yzcskz=3` captcha lockout). It fetches the login page (parse `#csrftoken`), GETs `login_getPublicKey.html`, RSA-encrypts the password (PKCS#1 v1.5, Node `crypto`), POSTs `{csrftoken, yhm, mm, language=zh_CN, ydType=}` (mm twice like the browser). The same csrtoken/mm is reused across the retry. If a captcha is required (`input#yzm`, after repeated failures) it can't be solved automatically — the CLI then tells the user to inject `USTS_COOKIES` or use `npm run capture`.
- **Session validity is actively probed, never guessed** (`application/session-manager.ts` + `JwglClient.probeSession`): `ensureSession()` calls `ensureValidSession()`, which restores locally, then — unless inside a **trust window** — sends one probe request to the scores grid endpoint and requires a parseable `{items,totalCount}` as *positive* proof of validity. The probe is tri-state (`valid` / `expired` / `unknown`): network failures and WAF connection resets yield `unknown`, which is **fail-open** (the business request proceeds and the reactive path catches it) — never "expired".
- **On confirmed expiry the client re-logs in and replays the operation once** (`withReauth`). The replay boundary is the *public method*, not the individual request, because the PDF flows are multi-step stateful chains that must be re-run whole. Recovery is single-flight (the WAF resets connections on repeated logins) and has a cooldown after a failure. Credentials come only from env/`.env` — auto-relogin never prompts. `mutation` effects are never replayed. Credentials are missing → the run fails with an actionable message instead.
- **`HTTP 901` + empty body is the server's "not authenticated" status** for data actions (2026-09 verified live) — this, not `302`, is what the probe usually sees. `302`→login page is the equivalent signal for view pages. A `status=910` wrapper or an HTML 错误提示 page is a *rejected* request whose cause is genuinely ambiguous, so it is thrown as `PROTOCOL_CHANGED` carrying `details.ambiguousSession`; the client then probes once to decide instead of guessing.
- Sessions expire server-side after hours–days; that is now handled automatically, but `usts login` is still the way to re-authenticate explicitly or after a captcha lockout. `usts logout` clears the local session only (file + in-memory cookies, idempotent, no network) — the server-side session stays valid until it expires, because 正方 has no logout endpoint we can safely call without a packet capture. `logout` bumps the session manager's epoch so an in-flight auto-relogin cannot resurrect the session it just cleared.
- Credentials/config come from the **user config directory** (`~/.config/usts-cli/.env` on Linux; `USTS_CONFIG_DIR` / `USTS_ENV_FILE` override) or real env vars. Keys: `USTS_BASE_URL`, `USTS_USERNAME`, `USTS_PASSWORD`, `USTS_COOKIES`. Real env vars win over the file. `USTS_SESSION_TRUST_MS` tunes the trust window (default 5 min; `0` forces a probe before every command).
- **Never read config from the current working directory.** A globally-installed CLI runs in arbitrary directories; a cwd `.env` would let that directory redirect where credentials are sent. `USTS_ALLOW_CUSTOM_HOST` / `USTS_ALLOW_INSECURE_HTTP` are additionally **privileged**: they are only honoured from the real environment (`config/trust.ts` snapshot), never from the config file. See ADR-0005.

## Gotchas

- **WAF rate-limiting**: rapid repeated requests get the connection reset (`ERR_CONNECTION_CLOSED`). Wait 30–60s and retry. `loginViaScript` already retries 3× with backoff (via `requestWithRetry`).
- **Transport failures must be classified by `error.code`, not just the message.** Axios timeouts carry `code: 'ECONNABORTED'` but a message of `"timeout of Nms exceeded"` — string-matching only meant the most common real failure (a connection silently dropped by the WAF) was never retried, so the command gave up after one silent 30s hang. See `classifyFailure` in `infrastructure/http/transport.ts`.
- **Retry policy is per-`effect`** (`RETRY_POLICY`): `read` 3 attempts and retries timeouts, `auth` **never** retries a timeout (a timed-out login POST may already have succeeded; retrying doubles the failure count toward the captcha lockout), `download` 2, `mutation` 1. Timeouts back off ~250ms (swap the connection), connection resets back off from 3s (likely rate limiting).
- **Never leave the user staring at a silent terminal.** Requeuing is silent otherwise; `JwglClient` reports each retry via `onNotice` (→ stderr, so `--json`/stdout stay clean). Per-request timeout is 15s for normal requests, 45s for downloads — long enough for 正方, short enough not to feel like a hang.
- **Session validity is confirmed, not inferred**: `validateSession` no longer exists — commands go through `ensureValidSession()` (probe + trust window + auto-relogin) and `assertReadableResponse` classifies responses via `classifyResponse`. Only `901`, a `302` to the login page, and login-page HTML count as *proof* of expiry. A bare "错误提示" page (missing `gnmkdm`/params) is **not** expiry — it is thrown as an ambiguous rejection and confirmed with a probe. Do not add new regex guesses over response text; use the tri-state contract.
- **New code must throw `AppError` with a stable code.** Every `throw` in `src/` is an `AppError` and `executeWithRetry` wraps all transport failures, so `reportCommandError` maps a non-`AppError` straight to `UNKNOWN_ERROR` — it must **not** re-derive codes from Chinese message text (that would violate `docs/architecture.md` rule 4 and only ever misfire on internal bugs).
- **Anything that prompts must check for a terminal first.** `assertInteractiveTerminal(what, alternative)` (`commands/_shared.ts`) guards the interactive menu, the `login` credential prompt, and `clsched`'s cascade. Without it, inquirer throws `ERR_USE_AFTER_CLOSE` on a piped/`</dev/null` stdin *after* already writing half a prompt to stdout. Guard only the prompting branch — a fully-specified `login`/`clsched` must keep working in scripts.
- **Errors and warnings go to `stderr`, progress and results to `stdout`** (`docs/contracts/cli.md`). Don't `console.log()` an `error(...)`/`warning(...)`. Beware `spawnSync` in tests: it blocks the event loop, so a parent-process HTTP server can never answer the child — test output channels in-process instead.
- **`npm install -g .` installs a *symlink*, not a copy**, so `bin` resolves to this repo's `dist/index.js` and npm never fixes its mode. `tsc` emits `0644`, so after any `rm -rf dist && npm run build` the command dies with `zsh: permission denied: usts`. That is why `build` is `tsc && node tools/chmod-bin.mjs` — never drop the chmod step. For a real copy-style install use `npm pack` + `npm install -g ./usts-cli-*.tgz`. npm 11 also prints an `install-scripts … allowScripts` warning that the `prepare` hook is not allowlisted; add `--allow-scripts=usts-cli` if a future version starts blocking it.
- **Term defaults** (aligned with the web, 2026-08 verified): `currentTerm()` in `domain/term.ts` (reached from commands via `resolveTerm` in `commands/_shared.ts`) — Aug–Dec → `{xnm: current year, xqm:'3'}` (the upcoming fall semester); Feb–Jul → `{xnm: previous year, xqm:'12'}`; Jan → `{xnm: previous year, xqm:'3'}`. Codes: `3`=fall, `12`=spring, `16`=short term. Passing `-y` without `-t` leaves the term empty = all semesters of that year. Pure term rules (`currentTerm`, `displaySemester`, `academicYearName`) live there and nowhere else — do not re-derive the `xqm` mapping or the `2026-2027` string inline.
- Response field names are pinyin abbreviations of the Chinese labels (e.g. `kcmc`=课程名称/course name, `jsxm`=教师/teacher, `xf`=学分/credit). See the comments in `types/api.ts`.
- **The session file holds a plaintext bearer token** (`JSESSIONID`/`rememberMe`) — as powerful as the password. `0700/0600` protects against other users, not against processes running as you or against home-directory backups/sync. Encryption and OS keyring integration are deliberately **out of scope** (`docs/security.md`); do not claim the session is "securely encrypted". Auto-relogin needs `USTS_PASSWORD` in `.env`, which keeps the password on disk — an accepted trade-off, documented in the README.
- Never commit a legacy `.session.json` or capture data; `captures/` and `.env` are gitignored. Exploratory reverse-engineering scripts (WAF probing, schedule-JS inspection) are untracked scratch files — delete them rather than committing.
