import { header, info, warning } from '../logger';
import { printTable } from '../format';
import { WarningStatus } from '../../types/warnings';

/**
 * 学业预警。
 *
 * 无预警时页面给的是一句结论，原样打出来即可；有预警时按页面原有的表头成表——
 * 列语义尚未在有数据的账号上实测，因此不做重命名。
 */
export function renderWarning(status: WarningStatus): void {
  console.log(header('学业预警'));

  if (!status.hasWarning) {
    for (const message of status.messages) console.log(info(message));
    return;
  }

  const headers = status.headers.length
    ? status.headers
    : status.rows[0].map((_, index) => `第${index + 1}列`);
  printTable(headers, status.rows, { maxColWidth: 24 });
  // 这是查询结果（走 stdout），不是 CLI 自身的警告——用 ⚠ 只是为了贴合「预警」语义。
  console.log(warning(`共 ${status.rows.length} 条预警记录`));
}
