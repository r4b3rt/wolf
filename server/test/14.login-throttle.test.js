'use strict'

const assert = require('assert')
const config = require('../conf/config')
const throttle = require('../src/util/login-throttle')

describe('login-throttle', function() {
  let prevMax
  let prevLock

  beforeEach(async function() {
    prevMax = config.loginMaxFails
    prevLock = config.loginLockSeconds
    config.loginMaxFails = 3
    config.loginLockSeconds = 60
    await throttle.flushForTests()
  })

  afterEach(async function() {
    await throttle.flushForTests()
    config.loginMaxFails = prevMax
    config.loginLockSeconds = prevLock
  })

  it('locks after max fails on IP or username and clear does not remove lock', async function() {
    const ip = `10.9.8.${Date.now() % 200}`
    const user = `user_${Date.now()}`

    assert.strictEqual(await throttle.isLoginLocked(ip, user), false)
    await throttle.recordLoginFailure(ip, user)
    await throttle.recordLoginFailure(ip, user)
    assert.strictEqual(await throttle.isLoginLocked(ip, user), false)
    await throttle.recordLoginFailure(ip, user)
    assert.strictEqual(await throttle.isLoginLocked(ip, user), true)

    await throttle.clearLoginFailure(ip, user)
    // lock remains until TTL / flush
    assert.strictEqual(await throttle.isLoginLocked(ip, user), true)
  })

  it('handles empty ip/username keys', async function() {
    await throttle.recordLoginFailure('203.0.113.9', 'throttle_empty_user')
    assert.strictEqual(typeof (await throttle.isLoginLocked('203.0.113.9', 'throttle_empty_user')), 'boolean')
    await throttle.clearLoginFailure('203.0.113.9', 'throttle_empty_user')
  })

  it('falsy ip/username use unknown/empty key fallbacks', async function() {
    await throttle.recordLoginFailure(null, undefined)
    assert.strictEqual(typeof (await throttle.isLoginLocked('', null)), 'boolean')
    await throttle.clearLoginFailure(undefined, '')
  })
})
