import { ProfileGateway } from '../application/ports/jwgl-gateway';
import { ensureSession, reportCommandError } from './_shared';
import { renderProfile } from './render/profile';

export async function profileCommand(client: ProfileGateway): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    renderProfile(await client.queryProfile());
  } catch (e) {
    reportCommandError(e, '查询失败');
  }
}
