/**
 * 认证服务接口定义
 * JWT 认证提供者实现此接口
 */
import type { UserProfile } from "../types/auth";

export interface AuthProvider {
  /** 认证方式名称 */
  readonly type: "jwt";

  /** 是否已配置 */
  readonly isConfigured: boolean;

  /**
   * 密码登录
   * @param account 账号（邮箱）
   * @param password 密码
   * @returns 用户资料
   */
  signInWithPassword(account: string, password: string): Promise<UserProfile>;

  /**
   * 获取当前会话用户资料
   * @returns 用户资料或 null
   */
  getCurrentSessionProfile(): Promise<UserProfile | null>;

  /**
   * 退出登录
   */
  signOut(): Promise<void>;

  /**
   * 发送密码重置邮件
   * @param account 账号（邮箱）
   */
  sendPasswordResetEmail(account: string): Promise<string>;

  /**
   * 更新密码（重置密码场景）
   * @param newPassword 新密码
   */
  updateRecoveryPassword(newPassword: string): Promise<void>;

  /**
   * 订阅认证状态变化
   * @param onChange 变化回调
   * @returns 取消订阅函数
   */
  subscribeAuthProfile(
    onChange: (profile: UserProfile | null, error?: string, event?: string) => void
  ): () => void;
}
