'use strict'

const assert = require('assert')
const config = require('../conf/config')
const redisUtil = require('../src/util/redis-util')

describe('session-lock', function() {
  const origMemCacheByRedis = config.memCacheByRedis
  const origSet = redisUtil.redisClient.set.bind(redisUtil.redisClient)
  const origDel = redisUtil.redisClient.del.bind(redisUtil.redisClient)

  afterEach(function() {
    config.memCacheByRedis = origMemCacheByRedis
    redisUtil.redisClient.set = origSet
    redisUtil.redisClient.del = origDel
    delete require.cache[require.resolve('../src/ai/session-lock')]
  })

  it('memory path: acquire/release and conflict', async function() {
    config.memCacheByRedis = false
    delete require.cache[require.resolve('../src/ai/session-lock')]
    const lock = require('../src/ai/session-lock')
    const sid = `ut-${Date.now()}`
    assert.strictEqual(await lock.acquire(sid), true)
    assert.strictEqual(await lock.acquire(sid), false)
    await lock.release(sid)
    assert.strictEqual(await lock.acquire(sid), true)
    await lock.release(sid)
  })

  it('redis path: SET NX success and failure', async function() {
    config.memCacheByRedis = true
    const store = new Map()
    redisUtil.redisClient.set = async (key, val, nx, px, ttl) => {
      assert.strictEqual(nx, 'NX')
      assert.strictEqual(px, 'PX')
      assert.ok(ttl > 0)
      if (store.has(key)) return null
      store.set(key, val)
      return 'OK'
    }
    redisUtil.redisClient.del = async (key) => {
      store.delete(key)
      return 1
    }
    delete require.cache[require.resolve('../src/ai/session-lock')]
    const lock = require('../src/ai/session-lock')
    assert.strictEqual(await lock.acquire(42), true)
    assert.strictEqual(await lock.acquire(42), false)
    await lock.release(42)
    assert.strictEqual(await lock.acquire(42), true)
    await lock.release(42)
  })
})
