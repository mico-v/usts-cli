/**
 * 信任边界：进程启动时的真实环境快照，以及只允许由真实环境设置的开关。
 *
 * 为什么需要快照：`.env` 里的键会被注入 `process.env`，之后就无法区分「用户亲手
 * export 的值」和「从文件读到的值」。而下面这两个开关的作用正是**放宽**安全约束
 * （允许向非受信主机发凭据、允许明文 HTTP），一旦配置文件能改写它们，就等于让文件
 * 自己解除自己的限制——文件比 shell 环境更容易被复制、同步、随项目分发。
 *
 * 单独成模块是为了避开依赖环：`lib/env.ts` 写入快照，`config/config.ts` 读取它。
 */
export const PRIVILEGED_ENV_KEYS = ['USTS_ALLOW_CUSTOM_HOST', 'USTS_ALLOW_INSECURE_HTTP'] as const;

let snapshot: NodeJS.ProcessEnv | null = null;

/**
 * 由 `loadEnv()` 在注入文件内容**之前**调用。
 * 只在真正的进程启动路径（不传自定义 env）上捕获；测试/库用法不写全局状态。
 */
export function captureLaunchEnvironment(env: NodeJS.ProcessEnv): void {
  snapshot = { ...env };
}

/**
 * 真实进程环境。从未捕获过（库用法、单测直接构造客户端）时退回 `process.env`，
 * 此时 `process.env` 本身就是启动环境，语义一致。
 */
export function launchEnvironment(): NodeJS.ProcessEnv {
  return snapshot ?? process.env;
}
