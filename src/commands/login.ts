/**
 * 登录命令
 *
 * 登录策略（按优先级）：
 *   1. 已有安全持久化会话且仍有效 -> 直接复用（失效时 ensureValidSession 会尝试自动重登）
 *   2. 环境变量 USTS_COOKIES 提供已认证 Cookie -> 注入并**只探测不重登**地校验
 *   3. 账号密码纯脚本登录（经典正方 RSA 加密 + 双 POST 重试，无需浏览器）
 * 出现验证码时无法自动处理，提示改用 USTS_COOKIES 或 npm run capture。
 */
import inquirer from 'inquirer';
import { AuthGateway, ProfileGateway } from '../application/ports/jwgl-gateway';
import { success, error, info, warning } from '../lib/logger';
import { AppError, exitCodeForError } from '../domain/errors';
import { credentialsFromEnv } from '../lib/env';
import { assertInteractiveTerminal } from './_shared';

export async function loginCommand(client: AuthGateway & ProfileGateway): Promise<boolean> {
  // 1. 复用已持久化的会话
  if (client.restoreSession()) {
    const state = await client.ensureValidSession();
    if (state === 'valid') {
      console.log(success('已恢复上次登录的会话'));
      return true;
    }
    if (state === 'unknown') {
      console.error(warning('无法确认会话是否有效（网络异常），将继续尝试使用该会话'));
      return true;
    }
    console.log(info('上次会话已失效，重新登录...'));
  }

  // 2. 直接注入浏览器复制的会话 Cookie
  const cookies = process.env.USTS_COOKIES;
  if (cookies && cookies.trim()) {
    client.setCookies(cookies.trim());
    console.log(info('已载入会话 Cookie，正在校验...'));
    // 关键：校验这份 Cookie 时**绝不能触发自动重登**。
    // 若改用 queryProfile()，它内部的 withReauth 会在 Cookie 失效时用配置里的账号密码
    // 悄悄登录，于是「校验通过」其实是密码登录的功劳——既把结论说反了（用户会以为
    // Cookie 还有效），又会在配置里的密码也错时让同一组错误凭据短时间内连登两次，
    // 把账号更快推向验证码锁定（yzcskz=3）。probeSession() 只探测、从不重登，
    // 因此能如实回答「用户给的这份 Cookie 能不能用」。
    const probe = await client.probeSession();
    if (probe === 'unknown') {
      console.error(warning('无法校验提供的 Cookie（网络异常）。请稍后重试，或去掉 USTS_COOKIES 直接用账号密码登录'));
      return false;
    }
    if (probe === 'valid') {
      // 会话已确认可用；取个人信息只是为了补上学号（Cookie 注入的会话没有学号，
      // 缺了会让 profile/academia 的 su 参数为空）。取不到不影响这次登录。
      try {
        const profile = await client.queryProfile();
        client.markAuthenticated(profile.studentId || undefined);
      } catch {
        client.markAuthenticated();
      }
      client.saveSession();
      console.log(success('使用已提供的 Cookie 登录成功'));
      return true;
    }
    // expired
    console.error(warning('提供的 Cookie 已失效'));
    if (!credentialsFromEnv()) {
      console.error(error('请重新从浏览器复制 Cookie，或在配置文件中配置 USTS_USERNAME/USTS_PASSWORD'));
      return false;
    }
    console.log(info('改用配置中的账号密码登录...'));
    client.clearCookies();
  }

  // 3 & 4. 账号密码登录
  const credentials = credentialsFromEnv();
  let username = credentials?.username;
  let password = credentials?.password;

  if (!username || !password) {
    assertInteractiveTerminal(
      '交互式输入学号与密码',
      '请在配置文件中配置 USTS_USERNAME/USTS_PASSWORD，或设置 USTS_COOKIES 后重试',
    );
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: '请输入学号:',
        default: username,
        validate: (input: string) => input.length > 0 || '学号不能为空',
      },
      {
        type: 'password',
        name: 'password',
        message: '请输入密码:',
        mask: '*',
        validate: (input: string) => input.length > 0 || '密码不能为空',
      },
    ]);
    username = answers.username;
    password = answers.password;
  }

  console.log(info('正在通过账号密码登录（纯脚本 RSA + 双 POST 重试）...'));
  const result = await client.loginViaScript(username!, password!);

  if (result.success) {
    console.log(success(result.message));
    return true;
  }
  // 错误走 stderr（见 docs/contracts/cli.md 的输出通道约定），
  // 否则 `usts login > log` 会把失败原因一起吞掉。
  console.error(error(result.message));
  process.exitCode = exitCodeForError(new AppError(result.errorCode || 'UNKNOWN_ERROR', result.message));
  return false;
}
