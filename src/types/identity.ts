/**
 * 身份与会话相关的稳定结果形状（登录响应、个人信息）
 *
 * 远端字段名只允许出现在 `infrastructure/jwgl`；字段注释标出来源，方便追查。
 */

import type { AppErrorCode } from '../domain/errors';

export interface LoginResponse {
  success: boolean;
  message: string;
  errorCode?: AppErrorCode;
  data?: {
    sessionId?: string;
    username?: string;
    displayName?: string;
  };
}

export interface ProfileInfo {
  username: string;
  displayName: string;
  studentId: string;
  className: string;
  college: string;
  major: string;
  grade: string;
  enrollmentYear: number;
  idCard?: string;
  phone?: string;
  email?: string;
}
