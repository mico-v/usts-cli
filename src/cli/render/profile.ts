import { header, info, success } from '../logger';
import { ProfileInfo } from '../../types/identity';

export function renderProfile(p: ProfileInfo): void {
  console.log(header('个人信息'));
  const line = (label: string, val?: string) => {
    if (val) console.log(`  ${info(label.padEnd(5, '　'))} ${val}`);
  };
  line('学号', p.studentId);
  line('姓名', p.displayName);
  line('学院', p.college);
  line('专业', p.major);
  line('班级', p.className);
  line('年级', p.grade ? `${p.grade}（入学年份 ${p.enrollmentYear}）` : undefined);
  line('身份证', p.idCard);
  line('手机', p.phone);
  line('邮箱', p.email);
  console.log(success('信息获取完成'));
}
