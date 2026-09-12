import * as os from 'node:os';
import * as path from 'node:path';

export function stateDirectory(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (env.USTS_STATE_DIR) return path.resolve(env.USTS_STATE_DIR);
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'usts-cli');
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'usts-cli');
  }
  return path.join(env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'usts-cli');
}

export function sessionFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(stateDirectory(env), 'session.json');
}

/**
 * 跨平台用户**配置**目录（放 `.env`）。
 *
 * 与会话状态目录分开：状态是「这台机器上的运行产物」，配置是「用户写下的设置」。
 * Windows 上分别用 Roaming / Local（这正是两个目录的本意差别）；macOS 两者同根，
 * 文件名不同（`.env` vs `session.json`），互不干扰。
 */
export function configDirectory(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (env.USTS_CONFIG_DIR) return path.resolve(env.USTS_CONFIG_DIR);
  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'usts-cli');
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'usts-cli');
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'usts-cli');
}

/**
 * 配置文件的默认位置。
 *
 * 注意这里**不读当前工作目录**：全局安装后命令会在任意目录运行，让 cwd 决定凭据与
 * 目标主机，等于把账号交给那个目录（ADR-0005）。需要指向别处时用 `USTS_ENV_FILE`。
 */
export function envFilePath(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  return path.join(configDirectory(env, platform), '.env');
}

/**
 * 旧版会话文件的位置（当前工作目录）。
 *
 * ADR-0004 起**不再读取**，只在启动时检测并提示用户清理：该格式没有 `origin`
 * 字段，无法判断会话归属，从任意目录读取等于允许当前目录向登录态注入 Cookie。
 */
export function legacySessionFilePath(cwd = process.cwd()): string {
  return path.resolve(cwd, '.session.json');
}
