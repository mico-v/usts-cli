import * as fs from 'node:fs';
import * as path from 'node:path';
import { DocumentStore } from '../../application/ports/document-store';

/**
 * 本地文件落盘：临时文件 + 原子 rename，权限 `0600`。
 *
 * 不直接写目标文件的原因与会话存储一致：写到一半失败会留下一个**看起来正常**的
 * 半截 PDF。临时文件名带 pid，避免同目录下并发写互相覆盖。
 *
 * PDF 含个人课表、成绩与学籍信息，所以是 0600 而不是默认权限。
 */
export class FileDocumentStore implements DocumentStore {
  exists(destination: string): boolean {
    return fs.existsSync(destination);
  }

  write(destination: string, bytes: Buffer): string {
    const absolute = path.resolve(destination);
    const temp = `${absolute}.tmp-${process.pid}`;
    fs.writeFileSync(temp, bytes, { mode: 0o600 });
    fs.renameSync(temp, absolute);
    return absolute;
  }
}
