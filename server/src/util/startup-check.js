/**
 * 启动期安全自检。
 *
 * Wolf 为了开箱即用，conf/config.js 里给 token/加密密钥和 root 初始口令留了默认值。
 * 这些默认值在仓库里是公开的：任何拿到它们的人都能伪造 JWT、解密 OAuth client secret，
 * 或直接用初始口令登录 root。这里在启动时做一次显式提醒，避免默认值被带上生产。
 */

const log4js = require('./log4js')

// 与 conf/config.js 中的内置默认值保持一致。
const DEFAULT_TOKEN_KEY = 'b5155b92b13a02d08d2cc1bf8b81bec7c0c70fb8'
const DEFAULT_CRYPT_KEY = 'fbd4962351924792cb5e5b131435cd30b24e3570'
const DEFAULT_ROOT_PASSWORD = '123456'

const CHECKS = [
  {
    env: 'RBAC_TOKEN_KEY',
    defaultValue: DEFAULT_TOKEN_KEY,
    risk: '任何人都可以用仓库中的公开密钥伪造 Console/RBAC JWT，直接获得 super 权限。',
  },
  {
    env: 'WOLF_CRYPT_KEY',
    defaultValue: DEFAULT_CRYPT_KEY,
    risk: '任何人都可以解密数据库中的 OAuth2 client secret 与应用 secret。',
  },
  {
    env: 'RBAC_ROOT_PASSWORD',
    defaultValue: DEFAULT_ROOT_PASSWORD,
    risk: 'root / admin 账号使用公开的初始口令，可被直接登录。',
  },
]

/**
 * @returns {Array<{env: string, risk: string}>} 命中默认值的配置项
 */
function findInsecureDefaults(env) {
  env = env || process.env
  const insecure = []
  for (const check of CHECKS) {
    const value = env[check.env]
    if (!value || value === check.defaultValue) {
      insecure.push({ env: check.env, risk: check.risk })
    }
  }
  return insecure
}

function buildWarningBanner(insecure) {
  const lines = []
  lines.push('')
  lines.push('='.repeat(78))
  lines.push('!! WOLF 安全告警：检测到正在使用内置默认密钥 / 口令')
  lines.push('='.repeat(78))
  for (const item of insecure) {
    lines.push(`  - ${item.env} 未设置或仍为默认值`)
    lines.push(`      风险：${item.risk}`)
  }
  lines.push('')
  lines.push('  生产环境请通过环境变量注入随机值，例如：')
  lines.push('      export RBAC_TOKEN_KEY=$(openssl rand -hex 32)')
  lines.push('      export WOLF_CRYPT_KEY=$(openssl rand -hex 32)')
  lines.push('      export RBAC_ROOT_PASSWORD=<强口令>')
  lines.push('  并确保这些值不进入 Git 仓库（K8s 用 Secret，不要用 ConfigMap）。')
  lines.push('='.repeat(78))
  lines.push('')
  return lines.join('\n')
}

/**
 * 执行启动自检，命中默认值时打印醒目告警。不阻断启动。
 * @returns {Array} 命中默认值的配置项
 */
function runStartupCheck(env) {
  const insecure = findInsecureDefaults(env)
  if (insecure.length === 0) {
    return insecure
  }
  const banner = buildWarningBanner(insecure)
  // 同时走 stderr 与日志：容器场景下用户通常只看得到其中之一。
  console.error(banner)
  log4js.error(banner)
  return insecure
}

module.exports = {
  runStartupCheck,
  findInsecureDefaults,
  buildWarningBanner,
  DEFAULT_TOKEN_KEY,
  DEFAULT_CRYPT_KEY,
  DEFAULT_ROOT_PASSWORD,
}
