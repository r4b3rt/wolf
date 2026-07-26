/**
 * 登录失败限流锁定（AUD-007）。
 *
 * 按 IP 与用户名分别计数连续失败次数，任意一个维度达到阈值后锁定一段时间，
 * 锁定期内直接拒绝，不再触达密码比较逻辑，缓解爆破/撞库。
 *
 * 复用现有的 WolfCache（内存或 Redis，取决于 MEM_CACHE_BY_REDIS），
 * 因此天然支持多实例部署下的共享限流状态（Redis 模式）。
 */

const config = require('../../conf/config')
const { WolfCache } = require('./wolf-cache')

// TTL 与锁定时长保持一致：失败计数窗口过期后重新开始计数，
// 锁定标记同样在此时长后自动解除。
const cache = new WolfCache('login-throttle:', config.loginLockSeconds)

function ipFailKey(ip) {
  return `fail:ip:${ip || 'unknown'}`
}

function userFailKey(username) {
  return `fail:user:${(username || '').toLowerCase()}`
}

function lockKey(failKey) {
  return `lock:${failKey}`
}

async function bumpFailCount(failKey) {
  const current = (await cache.get(failKey)) || 0
  const next = current + 1
  if (next >= config.loginMaxFails) {
    await cache.set(lockKey(failKey), true)
    await cache.del(failKey)
  } else {
    await cache.set(failKey, next)
  }
}

async function isLocked(failKey) {
  const locked = await cache.get(lockKey(failKey))
  return !!locked
}

/**
 * @param {string} ip
 * @param {string} username
 * @returns {Promise<boolean>} true 表示 IP 或用户名任一处于锁定状态
 */
async function isLoginLocked(ip, username) {
  const [ipLocked, userLocked] = await Promise.all([
    isLocked(ipFailKey(ip)),
    isLocked(userFailKey(username)),
  ])
  return ipLocked || userLocked
}

/**
 * 登录失败时调用：分别对 IP 与用户名计数，达到阈值即加锁。
 */
async function recordLoginFailure(ip, username) {
  await Promise.all([
    bumpFailCount(ipFailKey(ip)),
    bumpFailCount(userFailKey(username)),
  ])
}

/**
 * 登录成功时调用：清除该 IP 与用户名的失败计数（不清除已存在的锁定状态，
 * 锁定状态需自然过期，避免攻击者用一次成功登录清空计数继续爆破其它账号）。
 */
async function clearLoginFailure(ip, username) {
  await Promise.all([
    cache.del(ipFailKey(ip)),
    cache.del(userFailKey(username)),
  ])
}

async function flushForTests() {
  await cache.flushAll()
}

module.exports = {
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailure,
  flushForTests,
}
