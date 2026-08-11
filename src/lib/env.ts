/**
 * 极简 .env 加载器（避免引入额外依赖）
 */
import * as fs from 'fs';
import * as path from 'path';

export interface EnvConfig {
  USTS_USERNAME: string;
  USTS_PASSWORD: string;
  USTS_BASE_URL: string;
}

export function loadEnv(): Partial<EnvConfig> {
  const envPath = path.resolve(process.cwd(), '.env');
  const result: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return result;

  const content = fs.readFileSync(envPath, 'utf8');
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
    result[key] = val;
    // 不覆盖已存在的环境变量（标准 dotenv 行为）
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return result;
}
