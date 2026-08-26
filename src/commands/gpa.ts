import { GpaGateway } from '../application/ports/jwgl-gateway';
import { header, info } from '../lib/logger';
import { printJsonEnvelope, printTable } from '../lib/format';
import { ensureSession, reportCommandError } from './_shared';

export async function gpaCommand(client: GpaGateway, opts: { json?: boolean } = {}): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    const result = await client.queryGpa();
    if (opts.json) {
      printJsonEnvelope('gpa', result);
      return;
    }
    console.log(header('学业成绩概览'));
    const rows = [
      ['平均绩点', result.gpa?.toString()],
      ['平均成绩', result.averageScore?.toString()],
      ['总学分', result.totalCredits?.toString()],
      ['已修学分', result.earnedCredits?.toString()],
    ].filter((row) => row[1]);
    if (!rows.length) {
      console.log(info('页面未识别出结构化 GPA/学分字段，请使用 --json 查看原始文本'));
      if (result.rawText?.length) printTable(['页面文本'], result.rawText.map((v) => [v]));
      return;
    }
    printTable(['项目', '数值'], rows);
  } catch (e: any) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'gpa' });
  }
}
