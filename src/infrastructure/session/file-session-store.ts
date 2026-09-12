import * as fs from 'node:fs';
import * as path from 'node:path';
import { sessionFilePath } from '../../config/paths';
import { AppError } from '../../domain/errors';
import { StoredCookie } from '../http/cookie-jar';

const MAX_SESSION_BYTES = 1024 * 1024;

export interface PersistedSession {
  schemaVersion: 1;
  origin: string;
  cookies: StoredCookie[] | [string, string][];
  username?: string;
  loginTime?: string;
}

export interface SessionStore {
  load(): PersistedSession | null;
  save(session: PersistedSession): void;
  /** 删除持久化会话；返回是否真的删掉了文件（不存在视为成功）。 */
  remove(): boolean;
}

export class FileSessionStore implements SessionStore {
  constructor(readonly filePath = sessionFilePath()) {}

  private read(file: string): PersistedSession | null {
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_SESSION_BYTES) return null;
      const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw || typeof raw !== 'object') return null;
      const value = raw as Record<string, unknown>;
      if (value.schemaVersion !== undefined && value.schemaVersion !== 1) return null;
      if (!Array.isArray(value.cookies)) return null;
      // origin 是版本化格式的必需字段：没有它就无法判断这份会话属于哪台主机，
      // 也就无法安全复用。旧版 cwd/.session.json 正是因为缺这个字段而被退役（ADR-0004）。
      if (typeof value.origin !== 'string' || !value.origin) return null;
      return {
        schemaVersion: 1,
        origin: value.origin,
        cookies: value.cookies as StoredCookie[] | [string, string][],
        username: typeof value.username === 'string' ? value.username : undefined,
        loginTime: typeof value.loginTime === 'string' ? value.loginTime : undefined,
      };
    } catch {
      return null;
    }
  }

  load(): PersistedSession | null {
    return this.read(this.filePath);
  }

  /**
   * 删除会话文件。文件不在时视为成功（登出应当是幂等的）。
   * 符号链接仍按链接本身删除，不跟随目标——与 `read()` 拒绝符号链接的理由一致。
   */
  remove(): boolean {
    try {
      fs.unlinkSync(this.filePath);
      return true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
      throw new AppError('FILE_SYSTEM_ERROR', `无法删除会话文件：${this.filePath}`, { cause });
    }
  }

  save(session: PersistedSession): void {
    const dir = path.dirname(this.filePath);
    const temp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      try { fs.chmodSync(dir, 0o700); } catch { /* Windows 等平台可能不支持完整 POSIX 权限 */ }
      fs.writeFileSync(temp, JSON.stringify(session, null, 2), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, this.filePath);
      try { fs.chmodSync(this.filePath, 0o600); } catch { /* 同上 */ }
    } catch (cause) {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* 忽略清理失败 */ }
      throw new AppError('FILE_SYSTEM_ERROR', `无法安全保存会话：${this.filePath}`, { cause });
    }
  }
}
