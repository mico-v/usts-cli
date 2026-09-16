/**
 * 交互式终端界面
 *
 * 启动后进入多级菜单：主菜单 -> 查询子菜单 -> 查询类型 -> 复刻网页查询表单 -> 输出结果。
 * 复用各命令函数与同一个网关实例；Cookie Jar、连接池和限流状态贯穿整个交互会话。
 *
 * 菜单项来自 `registry.ts` 的命令描述（`QUERY_SPECS`，顺序即声明顺序），参数表单来自各
 * spec 的 `interactive`——因此新增查询命令只改注册表，这里不会再出现第二份命令清单。
 */
import inquirer from 'inquirer';
import { JwglGateway } from '../infrastructure/jwgl/gateway';
import { createClient } from './create-client';
import { header, info, success, error } from './logger';
import { formatDuration } from './format';
import { SessionLookup } from '../domain/session';
import { sessionProblemMessage, assertInteractiveTerminal } from './_shared';
import { LOGIN_SPEC, LOGOUT_SPEC, PROFILE_SPEC, QUERY_SPECS, QuerySpec } from './registry';
import { termDefaults } from './prompts';

/** 查询子菜单里的「返回上级」哨兵值 */
const BACK = '__back';

/** 主菜单上显示的本地会话状态。不发网络请求，因此即时可得；服务端是否有效由预检回答。 */
function sessionLabel(client: JwglGateway): string {
  const local = client.localSession();
  if (!local.loggedIn) return '未登录';
  const parts = ['本地已保存会话'];
  if (local.username) parts.push(local.username);
  if (local.loginTime) parts.push(`登录于 ${formatDuration(Date.now() - local.loginTime.getTime())}前`);
  return parts.join(' · ');
}

/** 主菜单 */
async function mainMenu(client: JwglGateway): Promise<string> {
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: `请选择操作（${sessionLabel(client)}）`,
    choices: [
      { name: '登录教务系统', value: 'login' },
      { name: '查询', value: 'query' },
      { name: '查看个人信息', value: 'profile' },
      { name: '退出登录（清除本地会话）', value: 'logout' },
      { name: '退出', value: 'exit' },
    ],
  }]);
  return action as string;
}

/**
 * 立刻在后台发起一次会话预检。
 *
 * 用户可能在选完菜单后直接「返回上级」而永远不 await 它，因此这里显式兜住拒绝：
 * 探测类失败本来就该按 fail-open 处理（交由业务请求兜底），不该冒出未处理的 rejection。
 */
function prefetchSession(client: JwglGateway): Promise<SessionLookup> {
  return client.ensureValidSession().catch((): SessionLookup => 'unknown');
}

/**
 * 预检的等待点。
 *
 * 探针在用户选菜单时就已经发起（见 `interactiveShell`），因此在用户选完查询类型、
 * 填完表单之前通常已经就绪——这里的 `await` 几乎不花时间。目的是**提前**把
 * 「未登录」告诉用户，而不是等到最后一个命令执行时才报错。
 */
async function sessionReady(client: JwglGateway, pending: Promise<SessionLookup>): Promise<boolean> {
  const problem = sessionProblemMessage(client, await pending);
  if (!problem) return true;
  console.error(error(problem));
  return false;
}

/** 查询类型子菜单 */
async function queryMenu(): Promise<QuerySpec | null> {
  const { type } = await inquirer.prompt([{
    type: 'list',
    name: 'type',
    message: '选择查询类型',
    choices: [
      ...QUERY_SPECS.map((spec) => ({ name: spec.menu.label, value: spec.id })),
      { name: '返回上级', value: BACK },
    ],
  }]);
  return QUERY_SPECS.find((spec) => spec.id === type) ?? null;
}

/**
 * 进入具体查询：按 spec 收集参数 -> 执行。
 *
 * `interactive` 返回 `null` 表示用户取消了本次操作（目前只有 PDF 下载会这样：目标
 * 文件已存在且选择不覆盖）。菜单里没有 `--force`，所以必须当下问清，而不是把
 * 「文件已存在」留到最后一步由命令报错。
 */
async function runQuery(spec: QuerySpec, client: JwglGateway): Promise<void> {
  const opts = spec.interactive ? await spec.interactive(termDefaults()) : {};
  if (opts === null) {
    console.log(info('已取消，未写入文件'));
    return;
  }
  await spec.run(client, opts);
}

export async function interactiveShell(baseUrl: string): Promise<void> {
  // 先检查终端，再打印任何东西：没有 TTY 时应给出用法提示，而不是让 inquirer
  // 抛 ERR_USE_AFTER_CLOSE，并往 stdout 留下半截菜单/提示符。
  assertInteractiveTerminal('交互式菜单', '请直接使用子命令（例如 usts scores），完整列表见 usts --help');

  const client = createClient(baseUrl);
  console.log(header('苏州科技大学教务系统 CLI'));
  console.log(info('用方向键选择，回车确认。首次使用请先「登录教务系统」。'));
  console.log(info(`会话：${sessionLabel(client)}。查询前会自动校验，失效时尝试自动重新登录。`));
  while (true) {
    let action: string;
    try {
      action = await mainMenu(client);
    } catch {
      // 用户按 Ctrl+C 中断选择
      console.log();
      break;
    }

    if (action === 'exit') {
      console.log(success('再见'));
      break;
    }

    if (action === 'login') {
      await LOGIN_SPEC.run(client, {});
      continue;
    }

    if (action === 'logout') {
      await LOGOUT_SPEC.run(client, {});
      continue;
    }

    if (action === 'profile') {
      // 先发起预检再进命令：与提示并行，且命令入口的 ensureSession 会复用同一次结果。
      const pending = prefetchSession(client);
      if (!(await sessionReady(client, pending))) continue;
      await PROFILE_SPEC.run(client, {});
      continue;
    }

    if (action === 'query') {
      // 关键：用户还在选查询类型、填学年/学期表单时，探针（必要时还有自动重登）就已经
      // 在跑，不必等到最后一个命令执行才报「未登录」。ensure() 合并并发调用，不会多发请求。
      const pending = prefetchSession(client);
      const spec = await queryMenu();
      if (!spec) continue;
      if (!(await sessionReady(client, pending))) continue;
      try {
        await runQuery(spec, client);
      } catch (e: any) {
        if (e?.message?.includes('interrupted')) break;
        console.error(error(e?.message || '查询中断'));
      }
      continue;
    }
  }
  // 交互会话允许在一次失败后继续操作，正常退出不继承中途命令的退出码。
  process.exitCode = 0;
}
