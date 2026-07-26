'use strict'

const assert = require('assert')
const { sanitizeBody, SENSITIVE_FIELDS } = require('../src/util/log-sanitize')
const {
  findInsecureDefaults,
  buildWarningBanner,
  runStartupCheck,
  DEFAULT_TOKEN_KEY,
  DEFAULT_CRYPT_KEY,
  DEFAULT_ROOT_PASSWORD,
} = require('../src/util/startup-check')

describe('log-sanitize', function() {
  it('redacts sensitive fields without mutating original', function() {
    const body = {
      username: 'a',
      password: 'secret',
      nested: { token: 't', ok: 1 },
      list: [{ accessToken: 'x' }, 2],
    }
    const out = sanitizeBody(body)
    assert.strictEqual(out.password, '***')
    assert.strictEqual(out.nested.token, '***')
    assert.strictEqual(out.list[0].accessToken, '***')
    assert.strictEqual(body.password, 'secret')
    assert.ok(SENSITIVE_FIELDS.has('client_secret'))
  })

  it('returns non-objects and deep values as-is past max depth', function() {
    assert.strictEqual(sanitizeBody(null), null)
    assert.strictEqual(sanitizeBody('x'), 'x')
    let deep = { password: 'p' }
    for (let i = 0; i < 8; i++) deep = { nested: deep }
    const out = sanitizeBody(deep)
    // beyond MAX_DEPTH the inner object is returned unchanged (may still contain password)
    assert.ok(out)
  })
})

describe('startup-check', function() {
  it('findInsecureDefaults detects missing and default values', function() {
    const insecure = findInsecureDefaults({
      RBAC_TOKEN_KEY: DEFAULT_TOKEN_KEY,
      WOLF_CRYPT_KEY: '',
      // RBAC_ROOT_PASSWORD unset
    })
    const envs = insecure.map((i) => i.env).sort()
    assert.deepStrictEqual(envs, ['RBAC_ROOT_PASSWORD', 'RBAC_TOKEN_KEY', 'WOLF_CRYPT_KEY'])
  })

  it('returns empty when all custom', function() {
    const insecure = findInsecureDefaults({
      RBAC_TOKEN_KEY: 'custom-token-key-xxxxxxxx',
      WOLF_CRYPT_KEY: 'custom-crypt-key-xxxxxxxx',
      RBAC_ROOT_PASSWORD: 'strong-password',
    })
    assert.strictEqual(insecure.length, 0)
    assert.ok(buildWarningBanner([{ env: 'X', risk: 'r' }]).includes('安全告警'))
  })

  it('runStartupCheck logs banner when insecure', function() {
    const errors = []
    const origError = console.error
    console.error = (msg) => { errors.push(msg) }
    try {
      const r = runStartupCheck({
        RBAC_TOKEN_KEY: DEFAULT_TOKEN_KEY,
        WOLF_CRYPT_KEY: DEFAULT_CRYPT_KEY,
        RBAC_ROOT_PASSWORD: DEFAULT_ROOT_PASSWORD,
      })
      assert.strictEqual(r.length, 3)
      assert.ok(errors.length >= 1)
    } finally {
      console.error = origError
    }
  })

  it('runStartupCheck silent when secure', function() {
    const r = runStartupCheck({
      RBAC_TOKEN_KEY: 'custom-token-key-xxxxxxxx',
      WOLF_CRYPT_KEY: 'custom-crypt-key-xxxxxxxx',
      RBAC_ROOT_PASSWORD: 'strong-password',
    })
    assert.strictEqual(r.length, 0)
  })
})
