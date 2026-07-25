/**
 * 敏感字段脱敏（AUD-010）。
 *
 * 审计日志会把请求体原样落库，password/token 等字段一旦写入就长期留存，
 * 具备审计查看权限的人即可读到明文口令/密钥。这里在写库前递归脱敏。
 */

const SENSITIVE_FIELDS = new Set([
  'password',
  'oldPassword',
  'newPassword',
  'reNewPassword',
  'confirmPassword',
  'secret',
  'client_secret',
  'clientSecret',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'captchaText',
])

const REDACTED = '***'
const MAX_DEPTH = 6

function sanitizeValue(value, depth) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1))
  }
  const result = {}
  for (const key of Object.keys(value)) {
    if (SENSITIVE_FIELDS.has(key)) {
      result[key] = REDACTED
    } else {
      result[key] = sanitizeValue(value[key], depth + 1)
    }
  }
  return result
}

/**
 * @param {*} body - 任意请求体/参数对象，不修改原对象
 * @returns {*} 脱敏后的深拷贝
 */
function sanitizeBody(body) {
  return sanitizeValue(body, 0)
}

module.exports = { sanitizeBody, SENSITIVE_FIELDS }
