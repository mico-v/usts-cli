import { JwglClient } from '../lib/client';
import { header, info, error, success } from '../lib/logger';
import { printJson, printTable } from '../lib/format';
import { ensureSession, resolveTerm, termLabel } from './_shared';

export async function selectedCoursesCommand(client: JwglClient, opts: { xnm?: string; xqm?: string; json?: boolean }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  try {
    const items = await client.querySelectedCourses(xnm, xqm);
    if (opts.json) {
      printJson({ xnm, xqm, items });
      return;
    }
    console.log(header(`已选课程   ${termLabel(xnm, xqm)}`));
    if (!items.length) {
      console.log(info('该学期暂无已选课程'));
      return;
    }
    printTable(
      ['课程', '课程号', '教学班', '教师', '学分', '容量/已选', '地点', '时间'],
      items.map((item) => [
        item.title,
        item.courseId,
        item.classId,
        item.teacher,
        item.credit?.toString(),
        item.capacity !== undefined || item.selectedNumber !== undefined ? `${item.capacity ?? '-'}/${item.selectedNumber ?? '-'}` : '',
        item.place,
        item.time,
      ]),
      { maxColWidth: 28 },
    );
    console.log(success(`共 ${items.length} 门已选课程`));
  } catch (e: any) {
    console.error(error(e?.message || '查询失败'));
  }
}
