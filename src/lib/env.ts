/**
 * 极简 .env 加载器（避免引入额外依赖）
 *
 * 读取位置：`USTS_ENV_FILE`（只认真实环境变量）优先，否则用户配置目录下的 `.env`
 * （见 `config/paths.ts` 的 `envFilePath()`）。
 *
 * **不读当前工作目录**：全局安装后命令会在任意目录运行，让 cwd 决定凭据与目标主机
 * 等于把账号交给那个目录 —— 一份放错位置的 `.env` 就能把登录 POST 引向别的站点，
 * 详见 ADR-0005。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { envFilePath } from '../config/paths';
import { PRIVILEGED_ENV_KEYS, captureLaunchEnvironment, launchEnvironment } from '../config/trust';

export interface Credentials {
  username: string;
  password: string;
}

export interface EnvLoadResult {
  /** 实际尝试读取的配置文件路径 */
  path: string;
  /** 文件是否存在并被读取 */
  loaded: boolean;
  /** 已注入到进程环境的键 */
  injected: string[];
  /** 文件中存在但被拒绝的键：会放宽信任边界，只认真实环境变量 */
  rejected: string[];
}

/**
 * 可用于**自动重新登录**的凭据。
 *
 * 会话在命令执行中途失效时，绝不能弹交互式提示——那会破坏调用方语义，
 * 也让 `usts scores | jq` 这类管道卡住。因此只有环境变量（含配置文件）里的凭据
 * 才算数，取不到就让调用方明确失败并提示用户手动 `usts login`。
 */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Credentials | null {
  const username = env.USTS_USERNAME?.trim();
  const password = env.USTS_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

/**
 * 把配置文件读进进程环境。
 *
 * `options` 供测试注入：传入自定义 `env` 时不写全局快照（不构成「进程启动」）。
 */
export function loadEnv(options: { env?: NodeJS.ProcessEnv; filePath?: string } = {}): EnvLoadResult {
  const env = options.env ?? process.env;
  // 快照必须在注入之前完成，否则之后就无法区分真实环境与文件内容。
  if (!options.env) captureLaunchEnvironment(env);

  // USTS_ENV_FILE 只从真实环境读取——配置文件不能给自己换位置。
  const trusted = launchEnvironment();
  const explicit = trusted.USTS_ENV_FILE || env.USTS_ENV_FILE;
  const filePath = options.filePath ?? path.resolve(explicit || envFilePath(trusted));

  const result: EnvLoadResult = { path: filePath, loaded: false, injected: [], rejected: [] };
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return result; // 配置文件可选
  }
  result.loaded = true;

  const privileged: readonly string[] = PRIVILEGED_ENV_KEYS;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    if (privileged.includes(key)) {
      // 拒绝注入。注意也不能因为文件里有就覆盖真实环境——两者本来就以真实环境为准。
      result.rejected.push(key);
      continue;
    }
    result.injected.push(key);
    // 不覆盖已存在的环境变量（标准 dotenv 行为）
    if (env[key] === undefined) {
      env[key] = val;
    }
  }
  return result;
}
