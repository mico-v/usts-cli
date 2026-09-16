import { success } from '../logger';

/** 两个 PDF 命令的落盘提示：说清**绝对路径**，用户才知道文件去了哪里。 */
export function renderDocumentSaved(what: string, absolutePath: string): void {
  console.log(success(`${what} 已保存：${absolutePath}`));
}
