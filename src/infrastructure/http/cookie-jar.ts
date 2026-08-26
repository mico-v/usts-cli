export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  secure: boolean;
  expiresAt?: number;
}

function domainMatches(host: string, cookie: StoredCookie): boolean {
  return cookie.hostOnly ? host === cookie.domain : host === cookie.domain || host.endsWith(`.${cookie.domain}`);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  return requestPath.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`);
}

function defaultCookiePath(pathname: string): string {
  if (!pathname.startsWith('/') || pathname === '/') return '/';
  const end = pathname.lastIndexOf('/');
  return end <= 0 ? '/' : pathname.slice(0, end);
}

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  constructor(private readonly defaultUrl: string) {}

  private key(cookie: StoredCookie): string {
    return `${cookie.domain}\n${cookie.path}\n${cookie.name}`;
  }

  importCookieHeader(raw: string, requestUrl = this.defaultUrl): void {
    const url = new URL(requestUrl);
    for (const part of raw.split(';')) {
      const index = part.indexOf('=');
      if (index <= 0) continue;
      const cookie: StoredCookie = {
        name: part.slice(0, index).trim(),
        value: part.slice(index + 1).trim(),
        domain: url.hostname.toLowerCase(),
        path: '/',
        hostOnly: true,
        secure: url.protocol === 'https:',
      };
      if (cookie.name) this.cookies.set(this.key(cookie), cookie);
    }
  }

  setCookie(raw: string, requestUrl = this.defaultUrl): boolean {
    const url = new URL(requestUrl);
    const parts = raw.split(';').map((part) => part.trim());
    const first = parts.shift() || '';
    const index = first.indexOf('=');
    if (index <= 0) return false;
    const cookie: StoredCookie = {
      name: first.slice(0, index).trim(),
      value: first.slice(index + 1).trim(),
      domain: url.hostname.toLowerCase(),
      path: defaultCookiePath(url.pathname),
      hostOnly: true,
      secure: false,
    };
    for (const attribute of parts) {
      const eq = attribute.indexOf('=');
      const name = (eq < 0 ? attribute : attribute.slice(0, eq)).trim().toLowerCase();
      const value = eq < 0 ? '' : attribute.slice(eq + 1).trim();
      if (name === 'domain' && value) {
        const domain = value.replace(/^\./, '').toLowerCase();
        if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) return false;
        cookie.domain = domain;
        cookie.hostOnly = false;
      } else if (name === 'path' && value.startsWith('/')) {
        cookie.path = value;
      } else if (name === 'secure') {
        cookie.secure = true;
      } else if (name === 'max-age' && /^-?\d+$/.test(value)) {
        cookie.expiresAt = Date.now() + Number(value) * 1000;
      } else if (name === 'expires') {
        const expires = Date.parse(value);
        if (Number.isFinite(expires)) cookie.expiresAt = expires;
      }
    }
    const key = this.key(cookie);
    if (cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now()) return this.cookies.delete(key);
    if (!cookie.name) return false;
    const previous = this.cookies.get(key);
    this.cookies.set(key, cookie);
    return !previous || JSON.stringify(previous) !== JSON.stringify(cookie);
  }

  header(requestUrl = this.defaultUrl): string {
    const url = new URL(requestUrl);
    const now = Date.now();
    const matches: StoredCookie[] = [];
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (cookie.secure && url.protocol !== 'https:') continue;
      if (!domainMatches(url.hostname.toLowerCase(), cookie) || !pathMatches(url.pathname || '/', cookie.path)) continue;
      matches.push(cookie);
    }
    return matches.sort((a, b) => b.path.length - a.path.length).map((c) => `${c.name}=${c.value}`).join('; ');
  }

  serialize(): StoredCookie[] {
    return [...this.cookies.values()].map((cookie) => ({ ...cookie }));
  }

  restore(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string') {
        this.importCookieHeader(`${item[0]}=${item[1]}`);
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const candidate = item as Partial<StoredCookie>;
      if (!candidate.name || typeof candidate.value !== 'string' || !candidate.domain || !candidate.path) continue;
      const cookie: StoredCookie = {
        name: candidate.name,
        value: candidate.value,
        domain: candidate.domain.toLowerCase(),
        path: candidate.path,
        hostOnly: candidate.hostOnly ?? true,
        secure: candidate.secure ?? true,
        expiresAt: candidate.expiresAt,
      };
      this.cookies.set(this.key(cookie), cookie);
    }
  }

  get size(): number {
    return this.cookies.size;
  }
}
