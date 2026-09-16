/**
 * 文档落盘端口
 *
 * 用例只声明「写到哪里、要不要先看目标是否存在」，原子性与文件权限由适配器负责。
 * 这样用例可以在内存假实现上测（见 `tests/documents-usecase.test.js`），
 * 而 `0600` + 原子 rename 这类真实行为由 `FileDocumentStore` 自己保证。
 */
export interface DocumentStore {
  exists(destination: string): boolean;
  /** 原子写入（临时文件 + rename），权限 0600；返回绝对路径。 */
  write(destination: string, bytes: Buffer): string;
}
