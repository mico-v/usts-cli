/**
 * 退出登录命令
 *
 * 只做**本地**清理：删除持久化会话文件并清空内存 Cookie。
 * 服务端会话不受影响，会在其有效期内继续可用——正方没有可安全调用的登出接口
 * （路径需抓包确认），因此这里不猜测路径去发请求。若要立即失效，只能在浏览器里退出。
 *
 * 幂等：本来就没有会话时也返回成功。
 */
import { AuthGateway } from '../application/ports/jwgl-gateway';
import { info, success } from './logger';

export function logoutCommand(client: AuthGateway): void {
  const removed = client.logout();
  if (removed) {
    console.log(success('已退出登录，本地会话已删除'));
    console.log(info('服务端会话仍会在有效期内可用；如需立即失效，请在浏览器中退出登录。'));
    return;
  }
  console.log(info('本地没有保存的会话，无需退出'));
}
