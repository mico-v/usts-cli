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
}

export class FileSessionStore implements SessionStore {
  constructor(
    readonly filePath = sessionFilePath(),
    private readonly legacyPath = path.resolve(process.cwd(), '.session.json'),
  ) {}

  private read(file: string): PersistedSession | null {
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_SESSION_BYTES) return null;
      const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw || typeof raw !== 'object') return null;
      const value = raw as Record<string, unknown>;
      if (value.schemaVersion !== undefined && value.schemaVersion !== 1) return null;
      if (!Array.isArray(value.cookies)) return null;
      return {
        schemaVersion: 1,
        origin: typeof value.origin === 'string' ? value.origin : '',
        cookies: value.cookies as StoredCookie[] | [string, string][],
        username: typeof value.username === 'string' ? value.username : undefined,
        loginTime: typeof value.loginTime === 'string' ? value.loginTime : undefined,
      };
    } catch {
      return null;
    }
  }

  load(): PersistedSession | null {
    const current = this.read(this.filePath);
    if (current) return current;
    if (this.legacyPath === this.filePath) return null;
    const legacy = this.read(this.legacyPath);
    if (!legacy) return null;
    try { fs.chmodSync(this.legacyPath, 0o600); } catch { /* 尽力收紧旧文件权限 */ }
    return legacy;
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
