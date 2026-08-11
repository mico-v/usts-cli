/**
 * 登录命令
 *
 * 登录策略（按优先级）：
 *   1. 已有持久化会话（.session.json）且仍有效 -> 直接复用
 *   2. 环境变量 USTS_COOKIES 提供已认证 Cookie -> 注入并校验
 *   3. 浏览器登录（导航到 CAS 统一身份认证，自动填入账号密码并点击登录）
 *   出现验证码时无法自动处理，提示改用 npm run capture 或 USTS_COOKIES。
 */
import inquirer from 'inquirer';
import { JwglClient } from '../lib/client';
import { success, error, info } from '../lib/logger';

export async function loginCommand(client: JwglClient): Promise<boolean> {
  // 1. 复用已持久化的会话
  if (client.restoreSession()) {
    const valid = await client.validateSession();
    if (valid) {
      console.log(success('已恢复上次登录的会话'));
      return true;
    }
    info('上次会话已失效，重新登录...');
  }

  // 2. 直接注入浏览器复制的会话 Cookie
  const cookies = process.env.USTS_COOKIES;
  if (cookies && cookies.trim()) {
    client.setCookies(cookies.trim());
    info('已载入会话 Cookie，正在校验...');
    if (await client.validateSession()) {
      client.saveSession();
      console.log(success('使用已提供的 Cookie 登录成功'));
      return true;
    }
    console.log(error('提供的 Cookie 已失效，请重新从浏览器复制，或改用账号密码登录'));
    return false;
  }

  // 3 & 4. 账号密码登录
  let username = process.env.USTS_USERNAME;
  let password = process.env.USTS_PASSWORD;

  if (!username || !password) {
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

  info('正在通过浏览器登录（CAS 统一身份认证）...');
  const result = await client.loginViaBrowser(username!, password!);

  if (result.success) {
    console.log(success(result.message));
    return true;
  }
  console.log(error(result.message));
  return false;
}
