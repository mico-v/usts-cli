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
