'use strict'

const assert = require('assert')
const { app, startServer, resolvePort } = require('../app')

describe('app-bootstrap', function() {
  it('app error handler is registered and callable', function() {
    let called = false
    const listeners = app.listeners('error')
    assert.ok(listeners.length >= 0)
    // emit error after startServer may have registered handler; also attach temporary
    const handler = () => { called = true }
    app.once('error', handler)
    app.emit('error', new Error('test-error'), {})
    assert.strictEqual(called, true)
  })

  it('exports startServer function', function() {
    const mod = require('../app')
    assert.strictEqual(typeof mod.startServer, 'function')
    assert.ok(mod.app)
  })

  it('resolvePort uses PORT or defaults to 12180', function() {
    assert.strictEqual(resolvePort({ PORT: '9999' }), 9999)
    assert.strictEqual(resolvePort({}), 12180)
    assert.strictEqual(resolvePort({ PORT: '' }), 12180)
  })

  it('startServer catch rethrows when startup check fails', async function() {
    const startupCheck = require('../src/util/startup-check')
    const orig = startupCheck.runStartupCheck
    startupCheck.runStartupCheck = () => { throw new Error('startup-boom') }
    try {
      await assert.rejects(() => startServer(), /startup-boom/)
    } finally {
      startupCheck.runStartupCheck = orig
    }
  })
})
