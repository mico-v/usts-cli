#!/usr/bin/env node
/**
 * 浏览器 DOM / 网络 记录器（capture-browser.mjs）
 *
 * 启动一个可见的 Chrome 窗口，你「正常浏览」教务系统即可；脚本在后台自动记录：
 *   1. 每个页面的最终渲染 DOM（含 JS 渲染结果）        -> captures/<序号>_<路径>.html
 *   2. 所有 XHR / fetch 数据接口请求与响应              -> captures/network.jsonl
 *   3. 会话 Cookie（供 CLI 直接复用）                  -> 用户状态目录/session.json + captures/session-cookies.txt
 *
 * 数据接口清单汇总写到 captures/summary.md —— 用它来写 CLI 的 query 方法，不用瞎猜。
 *
 * 建议浏览顺序（每个页面尽量多切换几次学年/学期，切换后的结果也会被记录）：
 *   登录 -> 学生成绩 -> 考试信息 -> 选课名单 -> 个人课表 -> 个人信息
 *
 * 用法：node tools/capture-browser.mjs
 * 结束：直接关闭浏览器窗口，或在终端 Ctrl+C。
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 状态目录（会话文件所在）复用 CLI 的 `config/paths.ts`，而不是在这里复制一份平台逻辑：
 * 复制出来的版本一定会和 CLI 漂移，而会话文件是要给 CLI 读的。
 */
let sessionFilePath;
try {
  ({ sessionFilePath } = await import('../dist/config/paths.js'));
} catch {
  console.error('[capture] 需要先构建：请运行 npm run build（本工具复用 dist/config/paths.js 的状态目录逻辑）');
  process.exit(2);
}

const TARGET_HOSTS = new Set(['jwgl.usts.edu.cn', 'localhost', '127.0.0.1']);
const OUT_DIR = path.resolve(process.cwd(), 'captures');
const SESSION_FILE = sessionFilePath();
const STATE_DIR = path.dirname(SESSION_FILE);
const NET_LOG = path.join(OUT_DIR, 'network.jsonl');
const SUMMARY_FILE = path.join(OUT_DIR, 'summary.md');
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

fs.mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
try { fs.chmodSync(OUT_DIR, 0o700); fs.chmodSync(STATE_DIR, 0o700); } catch {}

function writePrivate(file, value) {
  fs.writeFileSync(file, value, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
}

let seq = 0;
const cookieJar = new Map(); // name -> value（跨页面合并）
let detectedUsername = '';
let sessionOrigin = 'https://jwgl.usts.edu.cn';
const seenRequests = new Map(); // "method url postData" -> count（去重）
const endpoints = new Map(); // 清洗后的 action url -> 元信息
const domTimers = new Map(); // page -> timer（XHR 重渲染防抖）
let browserRef = null;

const log = (...a) => console.log('[capture]', ...a);
const ts = () => new Date().toISOString();

// ---------- 工具 ----------
function onHost(u) {
  try { return TARGET_HOSTS.has(new URL(u).hostname); } catch { return false; }
}
function slugFor(u) {
  try {
    const s = new URL(u).pathname.replace(/\/+/g, '_').replace(/^_+|_+$/g, '') || 'page';
    return (s.slice(-50) || 'page').replace(/[\\/:*?"<>|\s]/g, '_');
  } catch { return 'page'; }
}
function keyFor(u) { return u.replace(/[?&](nd|time)=\d+/g, ''); }

// ---------- 学号检测（用于给安全会话文件补 username） ----------
function detectUsername(html) {
  if (detectedUsername) return;
  const re1 = html.match(/<label[^>]*>\s*学号\s*[:：]\s*<\/label>[\s\S]{0,200}?form-control-static[^>]*>\s*(\d{6,12})/);
  const re2 = html.match(/name="(?:yhm|xh)"\s+value="(\d{6,12})"/);
  const hit = (re1 && re1[1]) || (re2 && re2[1]);
  if (hit) detectedUsername = hit;
}

// ---------- 会话持久化 ----------
async function collectCookies(page) {
  try {
    // 只在教务系统主机上更新 origin。CLI 要求 session.json 的 origin 与
    // USTS_BASE_URL 精确匹配（ADR-0004），而浏览器会经过 about:blank、CAS 登录域
    // 或用户顺手打开的其它站点——把那些页面的 origin 写进去，产出的会话文件会被
    // CLI 静默拒绝，抓包就白做了。
    const href = page.url();
    if (onHost(href) && /^https?:/i.test(href)) sessionOrigin = new URL(href).origin;
    const cookies = await page.cookies();
    for (const c of cookies) cookieJar.set(c.name, c.value);
  } catch { /* 页面已关闭 */ }
}
function persistCookies() {
  if (!cookieJar.size) return;
  const data = {
    schemaVersion: 1,
    origin: sessionOrigin,
    cookies: [...cookieJar.entries()],
    username: detectedUsername || undefined,
    loginTime: new Date().toISOString(),
  };
  try {
    writePrivate(SESSION_FILE, JSON.stringify(data, null, 2));
    writePrivate(path.join(OUT_DIR, 'session-cookies.txt'),
      [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
    log(`已保存会话 Cookie ${cookieJar.size} 个 -> ${SESSION_FILE}` + (detectedUsername ? `（学号 ${detectedUsername}）` : ''));
  } catch (e) { log('保存会话失败:', e.message); }
}

// ---------- DOM 记录 ----------
async function dumpDom(page, reason) {
  let html = '';
  try {
    html = await page.evaluate(() => document.documentElement.outerHTML);
  } catch { return; } // 页面已关闭或非 HTML
  const title = await page.title().catch(() => '');
  const href = page.url();
  detectUsername(html);
  await collectCookies(page);

  const id = String(++seq).padStart(3, '0');
  const name = `${id}_${slugFor(href)}`;
  writePrivate(path.join(OUT_DIR, `${name}.html`), html);
  writePrivate(
    path.join(OUT_DIR, `${name}.meta.json`),
    JSON.stringify({ seq, reason, time: ts(), title, url: href, username: detectedUsername || undefined }, null, 2),
  );
  log(`DOM(${reason}) ${slugFor(href)}  <- ${title || '(无标题)'}`);
  persistCookies();
}

// XHR 响应后页面可能用 JS 重新渲染了 DOM -> 防抖补拍
function scheduleDomDump(page) {
  const t = domTimers.get(page);
  if (t) clearTimeout(t);
  domTimers.set(page, setTimeout(async () => {
    domTimers.delete(page);
    await dumpDom(page, 'xhr-render');
  }, 1500));
}

// ---------- 网络记录 ----------
function attachNet(page) {
  const pending = new Map(); // request -> 元信息

  page.on('request', (req) => {
    if (!onHost(req.url())) return;
    const rt = req.resourceType();
    if (rt !== 'xhr' && rt !== 'fetch') return;
    pending.set(req, {
      time: ts(), method: req.method(), url: req.url(),
      postData: req.postData() || '',
      contentType: (req.headers()['content-type'] || '').split(';')[0] || '',
    });
  });

  page.on('response', async (res) => {
    const rec = pending.get(res.request());
    if (!rec) return;
    pending.delete(res.request());

    const dedupeKey = `${rec.method} ${rec.url} ${rec.postData}`;
    const count = (seenRequests.get(dedupeKey) || 0) + 1;
    seenRequests.set(dedupeKey, count);

    const cleanUrl = keyFor(rec.url);
    if (!endpoints.has(cleanUrl)) {
      endpoints.set(cleanUrl, { method: rec.method, url: rec.url, postData: rec.postData });
    }

    const ctype = (res.headers()['content-type'] || '').toLowerCase();
    let body = null;
    if (count === 1 && (ctype.includes('json') || ctype.includes('text') || ctype.includes('html') || ctype.includes('xml') || ctype.includes('javascript'))) {
      try {
        const buf = await res.buffer();
        if (buf && buf.length <= MAX_RESPONSE_BYTES) body = buf.toString('utf8');
      } catch { /* 重定向 / 已被消费 */ }
    }

    if (count === 1) {
      const line = JSON.stringify({
        ...rec, status: res.status(),
        responseContentType: ctype.split(';')[0] || null,
        responseBody: body, bodyBytes: body ? body.length : null,
      });
      fs.appendFileSync(NET_LOG, line + '\n', { encoding: 'utf8', mode: 0o600 });
      log(`NET ${rec.method} ${res.status()} ${rec.url.split('?')[0]}${body ? `  (${body.length}B)` : ''}`);
    }

    scheduleDomDump(page); // 数据回来往往触发重渲染
  });
}

// ---------- 页面装配 ----------
function attachPage(page) {
  attachNet(page);
  page.on('load', async () => {
    try { await page.waitForNetworkIdle({ idleTime: 800, timeout: 12000 }); } catch { /* 页面一直在请求 */ }
    await new Promise((r) => setTimeout(r, 600));
    await dumpDom(page, 'load');
  });
}

// ---------- 汇总 ----------
function finalize() {
  persistCookies();
  let md = `# 接口与页面捕获汇总\n\n生成时间：${ts()}\n\n## 数据接口（XHR/fetch，去重后）\n\n`;
  md += '| 方法 | URL | 请求体(示例) |\n|---|---|---|\n';
  for (const e of endpoints.values()) {
    const post = e.postData ? e.postData.replace(/\n/g, ' ').slice(0, 160) : '—';
    md += `| ${e.method} | \`${keyFor(e.url)}\` | \`${post}\` |\n`;
  }
  md += `\n共 ${endpoints.size} 个接口。\n\n## 已记录的页面 DOM\n\n`;
  try {
    fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.html')).sort().forEach((f) => {
      md += `- \`${f}\`\n`;
    });
  } catch {}
  try { writePrivate(SUMMARY_FILE, md); } catch {}
  log('浏览器已关闭。汇总见 captures/summary.md，网络记录见 captures/network.jsonl');
}

// ---------- 启动 ----------
log('启动可见浏览器…请在弹出的 Chrome 里正常登录并使用教务系统。');
log('记录目录：' + OUT_DIR);
log('结束方式：关闭浏览器窗口 或 Ctrl+C。');
log('建议浏览：登录 -> 成绩 -> 考试 -> 选课 -> 课表 -> 个人信息（多切换几次学年/学期）。');

browserRef = await puppeteer.launch({
  headless: false,
  defaultViewport: null,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
});

browserRef.on('targetcreated', async (target) => {
  const page = await target.page();
  if (page) attachPage(page);
});
for (const p of await browserRef.pages()) attachPage(p);

browserRef.on('disconnected', () => { finalize(); process.exit(0); });
process.on('SIGINT', async () => { try { await browserRef.close(); } catch {} finalize(); process.exit(0); });

log(`浏览器已打开。现在开始正常使用即可。`);
