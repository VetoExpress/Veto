import { AuthError } from '@vetoexpress/auth'
import { t } from './i18n'

const authMessages: Record<string, Parameters<typeof t>[0]> = {
  'API 服务暂未配置': 'electron_auth_service_unconfigured',
  无法连接认证服务: 'electron_auth_connection_failed',
  请求失败: 'electron_auth_request_failed',
  '发送失败，请稍后再试': 'electron_auth_code_send_failed',
  '重设密码失败，请稍后再试': 'electron_auth_password_reset_failed'
}

export class LocalizedAccountError extends AuthError {
  constructor(
    readonly key: Parameters<typeof t>[0],
    status?: number
  ) {
    super(t(key), status)
  }
}

export function accountErrorKey(error: unknown): Parameters<typeof t>[0] | undefined {
  if (error instanceof LocalizedAccountError) return error.key
  if (error instanceof AuthError && Object.hasOwn(authMessages, error.message)) {
    return authMessages[error.message]
  }
  return undefined
}

export function accountErrorMessage(error: unknown): string {
  const key = accountErrorKey(error)
  return key
    ? t(key)
    : error instanceof Error
      ? error.message
      : t('electron_account_operation_failed')
}
