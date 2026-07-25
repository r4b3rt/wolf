/**
 * AI 对话同 session 并发锁（AUD-022）。
 *
 * 同一个会话短时间内被并发调用 chatPost 时，多个请求会同时读取同一份历史消息、
 * 各自往会话里追加消息、并可能同时触发记忆提取，导致消息顺序错乱、重复持久化等
 * 竞态问题。这里在处理开始时尝试加锁，拿不到锁的请求直接快速失败，交由前端提示
 * 用户稍后重试，而不是让请求排队消耗 LLM 配额或产生脏数据。
 *
 * - MEM_CACHE_BY_REDIS=yes（多实例部署）时用 Redis SET NX PX 做跨实例的锁；
 * - 否则退化为进程内 Set（与项目里其它未接 Redis 时的内存态状态一致的假设：
 *   单实例部署，不做水平扩展）。
 */

const config = require('../../conf/config')
const { redisClient } = require('../util/redis-util')

// 需覆盖一轮对话（含多次工具调用）可能耗费的最长时间，避免进程异常退出后锁长期悬挂。
const LOCK_TTL_MS = 5 * 60 * 1000

const inProcessLocks = new Set()

function lockKey(sessionId) {
  return `ai-chat-lock:${sessionId}`
}

/**
 * @param {number|string} sessionId
 * @returns {Promise<boolean>} true 表示加锁成功
 */
async function acquire(sessionId) {
  if (config.memCacheByRedis) {
    const res = await redisClient.set(lockKey(sessionId), '1', 'NX', 'PX', LOCK_TTL_MS)
    return res === 'OK'
  }
  if (inProcessLocks.has(sessionId)) {
    return false
  }
  inProcessLocks.add(sessionId)
  return true
}

async function release(sessionId) {
  if (config.memCacheByRedis) {
    await redisClient.del(lockKey(sessionId))
    return
  }
  inProcessLocks.delete(sessionId)
}

module.exports = { acquire, release }
