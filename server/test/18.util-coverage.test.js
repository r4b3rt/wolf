'use strict'

const assert = require('assert')
const jwt = require('jsonwebtoken')
const Sequelize = require('sequelize')

const config = require('../conf/config')
const sequelize = require('../src/util/sequelize')
const { __test: seqTest } = sequelize
const redisUtil = require('../src/util/redis-util')
const tokenUtil = require('../src/util/token-util')
const captchaUtil = require('../src/util/captcha-util')
const opUtil = require('../src/util/op-util')
const cryptor = require('../src/util/cryptor')
const typeUtil = require('../src/util/type-util')
const ArgsHelper = require('../src/util/args-util')
const OAuthUtil = require('../src/util/oauth-util')
const util = require('../src/util/util')
const { addRootUserWithRetry } = require('../src/util/init-root-user')
const UserModel = require('../src/model/user')
const ArgsError = require('../src/errors/args-error')
const Op = require('sequelize').Op

const InternalCaller = require('../src/ai/internal-caller')
const AccessLogModel = require('../src/model/access-log')
const ResourceController = require('../src/controllers/resource')
const RbacPub = require('../src/controllers/rbac-pub')
const ResourceModel = require('../src/model/resource')
const resourceCache = require('../src/service/resource-cache')
const constant = require('../src/util/constant')
const AccessDenyError = require('../src/errors/access-deny-error')
const agentFactory = require('../src/ai/agent-factory')
const aiConfig = require('../src/ai/ai-config')
const toolsIndex = require('../src/ai/tools/index')

function mockCtx(overrides = {}) {
  return {
    method: 'GET',
    url: '/wolf/test',
    path: '/wolf/test',
    status: 200,
    body: null,
    action: 'GET',
    appid: 'app1',
    userInfo: { id: 1, username: 'u', nickname: 'n', manager: 'super' },
    resource: null,
    clientIp: '127.0.0.1',
    request: { method: 'GET', body: {}, headers: {} },
    query: {},
    i18n: { __: (k) => k },
    set: () => {},
    ...overrides,
  }
}

describe('util-coverage', function() {
  describe('sequelize helpers', function() {
    it('arrayGet/arraySet round-trip and edge cases', function() {
      const store = {}
      const ctx = {
        getDataValue(k) { return store[k] },
        setDataValue(k, v) { store[k] = v },
      }
      const get = seqTest.arrayGet('tags')
      const set = seqTest.arraySet('tags')
      assert.deepStrictEqual(get.call(ctx), [])
      set.call(ctx, ['a', 'b'])
      assert.strictEqual(store.tags, '|||a|||b|||')
      assert.deepStrictEqual(get.call(ctx), ['a', 'b'])
      // without surrounding separators
      store.tags = 'x|||y'
      assert.deepStrictEqual(get.call(ctx), ['x', 'y'])
      set.call(ctx, null)
      assert.strictEqual(store.tags, '')
    })

    it('objectGet/objectSet round-trip and empty', function() {
      const store = {}
      const ctx = {
        getDataValue(k) { return store[k] },
        setDataValue(k, v) { store[k] = v },
      }
      const get = seqTest.objectGet('profile')
      const set = seqTest.objectSet('profile')
      assert.deepStrictEqual(get.call(ctx), {})
      set.call(ctx, { a: 1 })
      assert.strictEqual(store.profile, '{"a":1}')
      assert.deepStrictEqual(get.call(ctx), { a: 1 })
      set.call(ctx, null)
      assert.strictEqual(store.profile, '')
    })

    it('mysqlCustomDefine rewrites ARRAY/JSONB when mysql', function() {
      const orig = seqTest.dialectFlags.isMysql
      seqTest.dialectFlags.isMysql = false
      const attrsSkip = { tags: { type: { key: 'ARRAY', type: Sequelize.STRING } } }
      seqTest.mysqlCustomDefine('m', attrsSkip, {})
      assert.ok(!attrsSkip.tags.get)

      seqTest.dialectFlags.isMysql = true
      const arrType = { key: 'ARRAY', type: Sequelize.STRING }
      const attrs = {
        tags: { type: arrType },
        profile: { type: { key: 'JSONB' } },
        name: { type: { key: 'STRING' } },
      }
      seqTest.mysqlCustomDefine('m', attrs, {})
      assert.strictEqual(typeof attrs.tags.get, 'function')
      assert.strictEqual(typeof attrs.tags.set, 'function')
      assert.strictEqual(attrs.tags.type, Sequelize.STRING)
      assert.strictEqual(typeof attrs.profile.get, 'function')
      assert.strictEqual(typeof attrs.profile.set, 'function')
      seqTest.dialectFlags.isMysql = orig
    })

    it('getDialectOptions covers mysql and postgres', function() {
      assert.strictEqual(seqTest.getDialectOptions(true).supportBigNumbers, true)
      assert.strictEqual(seqTest.getDialectOptions(false).useUTC, false)
    })

    it('mustUpdate mysql returning findOne/findAll', async function() {
      const orig = seqTest.dialectFlags.isMysql
      seqTest.dialectFlags.isMysql = true
      const row = { id: 1, name: 'n' }
      const mockOne = {
        update: async () => [undefined, 1],
        findOne: async () => row,
        findAll: async () => [row, row],
        getTableName: () => 't',
      }
      let r = await seqTest.mustUpdate.call(mockOne, { name: 'n' }, { where: { id: 1 } })
      assert.strictEqual(r.effects, 1)
      assert.deepStrictEqual(r.newValues, row)

      r = await seqTest.mustUpdate.call(mockOne, { name: 'n' }, { where: {}, returningAsList: true })
      assert.strictEqual(r.effects, 1)
      assert.strictEqual(r.newValues.length, 2)
      seqTest.dialectFlags.isMysql = orig
    })

    it('define with deleteDefaultId removes id attribute', function() {
      const M = sequelize.define('__test_no_id_' + Date.now(), {
        name: { type: Sequelize.STRING },
      }, { timestamps: false, deleteDefaultId: true })
      assert.ok(!M.rawAttributes.id)
    })
  })

  describe('init-root-user retry', function() {
    it('retries on failure then succeeds', async function() {
      const origFind = UserModel.findOne
      const origCreate = UserModel.create
      let attempts = 0
      UserModel.findOne = async () => null
      UserModel.create = async () => {
        attempts += 1
        if (attempts < 2) throw new Error('db not ready')
        return { id: 1 }
      }
      await addRootUserWithRetry(3, 1)
      assert.ok(attempts >= 2)
      UserModel.findOne = origFind
      UserModel.create = origCreate
    })

    it('logs and stops after max retries', async function() {
      const origFind = UserModel.findOne
      const origCreate = UserModel.create
      UserModel.findOne = async () => null
      UserModel.create = async () => { throw new Error('still down') }
      await addRootUserWithRetry(2, 1)
      UserModel.findOne = origFind
      UserModel.create = origCreate
    })

    it('default maxRetries/delayMs succeed when users exist', async function() {
      const origFind = UserModel.findOne
      UserModel.findOne = async () => ({ id: 1 })
      await addRootUserWithRetry()
      UserModel.findOne = origFind
    })
  })

  describe('redis-util', function() {
    it('initRedisClient single and cluster paths', function() {
      class FakeRedis {
        constructor(url) { this.url = url }
        static Cluster = class {
          constructor(nodes, opts) { this.nodes = nodes; this.opts = opts }
        }
      }
      const single = redisUtil.initRedisClient({ url: 'redis://localhost:6379/0' }, FakeRedis)
      assert.strictEqual(single.url, 'redis://localhost:6379/0')
      const cluster = redisUtil.initRedisClient({
        cluster: [{ host: '127.0.0.1', port: 6379 }],
        clusterOptions: { scaleReads: 'slave' },
      }, FakeRedis)
      assert.ok(cluster instanceof FakeRedis.Cluster)
      assert.strictEqual(cluster.opts.scaleReads, 'slave')
      assert.ok(redisUtil.redisClient)
    })
  })

  describe('token-util remaining branches', function() {
    const origSet = redisUtil.redisClient.set
    const origDel = redisUtil.redisClient.del
    const origVerify = jwt.verify
    afterEach(function() {
      redisUtil.redisClient.set = origSet
      redisUtil.redisClient.del = origDel
      jwt.verify = origVerify
    })

    it('tokenDecrypt rejects falsy verify result and old version', function() {
      jwt.verify = () => null
      let r = tokenUtil.tokenDecrypt('any.token.value')
      assert.strictEqual(r.error, 'ERR_TOKEN_INVALID')

      jwt.verify = () => ({ id: 1, username: 'u', version: 1 })
      r = tokenUtil.tokenDecrypt('any.token.value')
      assert.strictEqual(r.error, 'ERR_TOKEN_INVALID')
    })

    it('tokenCreate throws when redis set fails', async function() {
      redisUtil.redisClient.set = async () => 'ERR'
      await assert.rejects(
        () => tokenUtil.tokenCreate({ id: 1, username: 'u', manager: 'admin' }),
        /redis set error/,
      )
    })

    it('tokenDelete throws when redis del fails', async function() {
      redisUtil.redisClient.del = async () => 0
      await assert.rejects(() => tokenUtil.tokenDelete('tok'), /redis delete error/)
    })
  })

  describe('captcha-util remaining branches', function() {
    const origSet = redisUtil.redisClient.set
    const origGet = redisUtil.redisClient.get
    afterEach(function() {
      redisUtil.redisClient.set = origSet
      redisUtil.redisClient.get = origGet
    })

    it('newCaptcha throws when redis set fails', async function() {
      redisUtil.redisClient.set = async () => 'FAIL'
      await assert.rejects(() => captchaUtil.newCaptcha(), /redis set error/)
    })

    it('captchaValidate returns invalid when cid missing', async function() {
      redisUtil.redisClient.get = async () => null
      const r = await captchaUtil.captchaValidate('no-such', 'xxxx')
      assert.strictEqual(r.valid, false)
      assert.strictEqual(r.errmsg, 'ERR_CAPTCHA_INVALID')
    })
  })

  describe('op-util / cryptor / type-util / util / oauth / args', function() {
    it('arrayContains mysql like path', function() {
      const orig = config.database.url
      config.database.url = 'mysql://u:p@localhost/db'
      const q = opUtil.arrayContains('x')
      assert.ok(q[Op.like])
      config.database.url = orig
      const q2 = opUtil.arrayContains('x')
      assert.ok(q2[Op.contains])
    })

    it('cryptor encodePassword and aesDecrypt invalid base64', function() {
      const enc = cryptor.encodePassword('pwd')
      assert.strictEqual(typeof enc, 'string')
      assert.strictEqual(enc.length, 40)
      const bad = cryptor.aesDecrypt('!!!not-base64!!!', cryptor.md5hex('key'))
      assert.strictEqual(bad, '!!!not-base64!!!')
    })

    it('type-util isInt/isFloat and null type', function() {
      assert.strictEqual(typeUtil.isInt(3), true)
      assert.strictEqual(typeUtil.isInt(3.2), false)
      assert.strictEqual(typeUtil.isFloat(3.2), true)
      assert.strictEqual(typeUtil.getType(null), 'null')
    })

    it('util.sha1hex', function() {
      assert.strictEqual(util.sha1hex('abc').length, 40)
    })

    it('oauth-util invalid id paths', function() {
      assert.strictEqual(OAuthUtil.parseOAuthUserID('bad').error, 'ERR_USER_ID_INVALID')
      // valid checksum but wrong decrypted payload shape
      const chk = require('../src/util/chksum')
      const cryptorLocal = require('../src/util/cryptor')
      const magic = cryptorLocal.sha1hex(config.cryptKey).substr(0, 12)
      const aesKey = cryptorLocal.md5hex('G04a#2lom:' + config.cryptKey)
      const userIDChkSum = new chk(magic, 4, 'base64')
      const encrypted = cryptorLocal.aesEncrypt('v1:only-two', aesKey)
      const forged = userIDChkSum.add(encrypted)
      assert.strictEqual(OAuthUtil.parseOAuthUserID(forged).error, 'ERR_USER_ID_INVALID')
    })

    it('args-util parse helpers, getBoolArg, start/end time, order', function() {
      assert.throws(() => ArgsHelper.parseObject('f', '{bad'), ArgsError)
      assert.throws(() => ArgsHelper.parseArray('f', 123), ArgsError)
      assert.throws(() => ArgsHelper.parseArray('f', '[bad]'), ArgsError)

      const h = new ArgsHelper({
        flag: 'yes',
        startTime: '2020-01-01 00:00:00',
        endTime: '2020-01-02 00:00:00',
      }, '/t')
      assert.strictEqual(h.getBoolArg('flag'), true)
      assert.strictEqual(h.getBoolArg('missing', false), false)
      const both = h.getStartEndTimeArgs()
      assert.ok(both[Op.between])

      const h2 = new ArgsHelper({ startTime: '2020-01-01 00:00:00' }, '/t')
      assert.ok(h2.getStartEndTimeArgs()[Op.gte])
      const h3 = new ArgsHelper({ endTime: '2020-01-02 00:00:00' }, '/t')
      assert.ok(h3.getStartEndTimeArgs()[Op.lte])
      assert.strictEqual(new ArgsHelper({}, '/t').getStartEndTimeArgs(), undefined)

      const h4 = new ArgsHelper({}, '/t')
      assert.strictEqual(h4.getOrderByArgs(null), undefined)
      // valid enum check (no throw)
      h4.checkEnum('k', 'a', ['a', 'b'])
      // no ObjectModel: identifier ok
      assert.strictEqual(h4._isValidOrderField('id'), true)
    })
  })

  describe('internal-caller branches', function() {
    const origCreate = AccessLogModel.create
    afterEach(function() {
      AccessLogModel.create = origCreate
    })

    it('uses statusCode when status missing; writeAccessLog catch; no userInfo', async function() {
      class FailStatusCode {
        constructor(ctx) { this.ctx = ctx }
        async do() {
          const err = new Error()
          err.statusCode = 418
          throw err
        }
      }
      AccessLogModel.create = () => { throw new Error('log fail') }
      const body = await InternalCaller.call(FailStatusCode, 'x', {
        method: 'GET',
        path: '/wolf/x',
        args: undefined,
        userInfo: null,
      })
      assert.strictEqual(body.ok, false)
      assert.strictEqual(body.reason, 'ERR_SERVER_ERROR')
    })

    it('defaults status to 500 when neither status nor statusCode', async function() {
      class FailBare {
        constructor(ctx) { this.ctx = ctx }
        async do() { throw new Error('boom') }
      }
      let status
      AccessLogModel.create = (data) => { status = data.status; return Promise.resolve(data) }
      await InternalCaller.call(FailBare, 'x', {
        method: 'POST', path: '/wolf/y', args: {}, userInfo: { id: 9, username: 'a', nickname: 'b' },
      })
      assert.strictEqual(status, 500)
    })

    it('createMockCtx defaults empty args', function() {
      const ctx = InternalCaller.createMockCtx({
        method: 'POST', path: '/p', userInfo: { id: 1 },
      })
      assert.deepStrictEqual(ctx.request.body, {})
      assert.strictEqual(ctx.request.rawBody, '{}')
    })
  })

  describe('agent-factory remaining branches', function() {
    const orig = {
      importPiMono: agentFactory.importPiMono,
      getAllTools: toolsIndex.getAllTools,
      isAiAvailable: aiConfig.isAiAvailable,
      getProvider: aiConfig.getProvider,
      getModelId: aiConfig.getModelId,
      getWolfAiConfig: aiConfig.getWolfAiConfig,
      getBaseUrl: aiConfig.getBaseUrl,
      getApiKeyForProvider: aiConfig.getApiKeyForProvider,
    }
    afterEach(function() {
      Object.assign(agentFactory, { importPiMono: orig.importPiMono })
      agentFactory.resetPiMonoCache()
      toolsIndex.getAllTools = orig.getAllTools
      aiConfig.isAiAvailable = orig.isAiAvailable
      aiConfig.getProvider = orig.getProvider
      aiConfig.getModelId = orig.getModelId
      aiConfig.getWolfAiConfig = orig.getWolfAiConfig
      aiConfig.getBaseUrl = orig.getBaseUrl
      aiConfig.getApiKeyForProvider = orig.getApiKeyForProvider
    })

    it('pruneMessages breaks when toolResult indexOf is 0', function() {
      const tr = { role: 'toolResult', id: 'dup' }
      const msgs = [tr, { role: 'user' }, { role: 'assistant' }, tr, { role: 'user', id: 'last' }]
      const result = agentFactory.pruneMessages(msgs, 2)
      assert.strictEqual(result[0], tr)
      assert.strictEqual(result.length, 2)
    })

    it('fallback api default, compat default, createAgent defaults', async function() {
      class FakeAgent {
        constructor(opts) { this.opts = opts }
      }
      agentFactory.resetPiMonoCache()
      agentFactory.importPiMono = async () => ({
        Agent: FakeAgent,
        getModel: () => null,
      })
      aiConfig.isAiAvailable = () => true
      aiConfig.getProvider = () => 'openai'
      aiConfig.getModelId = () => 'custom'
      aiConfig.getBaseUrl = () => ''
      aiConfig.getWolfAiConfig = () => ({ thinkingFormat: 'qwen' }) // no api, no thinkingLevel, no maxHistory, no compat on model
      aiConfig.getApiKeyForProvider = async () => 'k'
      toolsIndex.getAllTools = async () => []

      const { model } = await agentFactory.getWolfPiModel()
      assert.strictEqual(model.api, 'openai-completions')
      assert.strictEqual(model.compat.thinkingFormat, 'qwen')

      const agent = await agentFactory.createAgent({
        userInfo: { username: 'u' },
        clientIp: '1.1.1.1',
      })
      assert.strictEqual(agent.opts.initialState.thinkingLevel, 'low')
      assert.deepStrictEqual(agent.opts.initialState.messages, [])
      const pruned = await agent.opts.transformContext(new Array(120).fill({ role: 'user' }))
      assert.strictEqual(pruned.length, 100)
    })

    it('importPiMono loads real packages', async function() {
      this.timeout(15000)
      agentFactory.resetPiMonoCache()
      const loaded = await agentFactory.importPiMono()
      assert.strictEqual(typeof loaded.Agent, 'function')
      assert.strictEqual(typeof loaded.getModel, 'function')
    })
  })

  describe('resource controller upgrade / access', function() {
    const origRadix = config.rbacUseRadixTreeRouting
    const origFindAll = ResourceModel.findAll
    const origUpdate = ResourceModel.update
    const origInit = resourceCache.initRadixTreeCache
    afterEach(function() {
      config.rbacUseRadixTreeRouting = origRadix
      ResourceModel.findAll = origFindAll
      ResourceModel.update = origUpdate
      resourceCache.initRadixTreeCache = origInit
    })

    function makeResource(ctxOverrides) {
      const ctx = mockCtx(ctxOverrides)
      const svc = new ResourceController(ctx)
      svc.success = (data) => { ctx.body = { ok: true, data }; ctx._ok = data }
      svc.fail = (code, reason) => { ctx.body = { ok: false, reason }; ctx._fail = { code, reason } }
      svc.log4js = { info() {}, warn() {}, error() {} }
      return svc
    }

    it('_getMatchTypeEnums depends on radix flag', function() {
      config.rbacUseRadixTreeRouting = true
      assert.deepStrictEqual(makeResource()._getMatchTypeEnums(), ['radixtree'])
      config.rbacUseRadixTreeRouting = false
      assert.ok(makeResource()._getMatchTypeEnums().includes('equal'))
    })

    it('access denies non-super for upgrade/flush', async function() {
      const svc = makeResource({ userInfo: { manager: 'admin' } })
      await assert.rejects(() => svc.access('upgradeMatchTypeToRadixTree'), AccessDenyError)
      await assert.rejects(() => svc.access('flushCache'), AccessDenyError)
    })

    it('access allows super for upgrade', async function() {
      const svc = makeResource({ userInfo: { manager: 'super' } })
      await svc.access('upgradeMatchTypeToRadixTree')
    })

    it('upgradeMatchTypeToRadixTree skips when flag off', async function() {
      config.rbacUseRadixTreeRouting = false
      const svc = makeResource()
      await svc.upgradeMatchTypeToRadixTree()
      assert.strictEqual(svc.ctx._fail.code, 400)
    })

    it('upgradeMatchTypeToRadixTree converts equal/suffix/prefix', async function() {
      config.rbacUseRadixTreeRouting = true
      const updates = []
      ResourceModel.findAll = async () => ([
        { id: 1, matchType: constant.MatchType.equal, name: '/a' },
        { id: 2, matchType: constant.MatchType.suffix, name: '.js' },
        { id: 3, matchType: constant.MatchType.prefix, name: '/api' },
        { id: 4, matchType: constant.MatchType.radixtree, name: '/**' },
      ])
      ResourceModel.update = async (vals, opts) => { updates.push({ vals, opts }); return [1] }
      resourceCache.initRadixTreeCache = async () => {}
      const svc = makeResource()
      await svc.upgradeMatchTypeToRadixTree()
      assert.strictEqual(updates.length, 3)
      assert.strictEqual(updates[1].vals.name, '**.js')
      assert.strictEqual(updates[2].vals.name, '/api**')
      assert.ok(svc.ctx._ok.message.includes('upgraded count: 3'))
    })

    it('delete delegates to deleteByPkWithAppAccess', async function() {
      const svc = makeResource()
      let called = false
      svc.deleteByPkWithAppAccess = async () => { called = true }
      await svc.delete()
      assert.strictEqual(called, true)
    })

    it('getPriority covers equal/suffix/prefix/ALL and unknown', function() {
      const { getPriority } = ResourceController
      assert.ok(getPriority({ name: '/a', matchType: 'equal', action: 'GET' }) > 10000)
      assert.ok(getPriority({ name: '.js', matchType: 'suffix', action: 'GET' }) > 100000)
      assert.ok(getPriority({ name: '/api', matchType: 'prefix', action: 'ALL' }) > 1000000)
      // neither equal/suffix/prefix
      assert.ok(getPriority({ name: '/**', matchType: 'radixtree', action: 'GET' }) < 10000)
    })

    it('list applies order when sort present', async function() {
      const svc = makeResource({
        method: 'GET',
        request: { method: 'GET', body: {} },
        query: { appID: 'app1', sort: '+id', key: 'x' },
      })
      ResourceModel.findAll = async (opts) => {
        assert.ok(opts.order)
        return []
      }
      ResourceModel.count = async () => 0
      await svc.list()
      assert.strictEqual(svc.ctx.body.ok, true)
    })
  })

  describe('basic-service access helpers', function() {
    const BasicService = require('../src/controllers/basic-service')

    function makeBasic(userInfo) {
      const ctx = mockCtx({ userInfo })
      const svc = new BasicService(ctx, { findOne: async () => null, findByPk: async () => null, destroy: async () => 1 })
      svc.success = (d) => { ctx.body = { ok: true, data: d } }
      svc.fail = (c, r) => { ctx.body = { ok: false, reason: r }; ctx.status = c }
      svc.log4js = { info() {}, warn() {}, error() {} }
      return svc
    }

    it('assertAppAccess covers super/admin/deny/no-user', function() {
      makeBasic(null).assertAppAccess('a')
      makeBasic({ manager: 'super' }).assertAppAccess('a')
      makeBasic({ manager: 'admin', appIDs: ['a'], username: 'u' }).assertAppAccess('a')
      assert.throws(
        () => makeBasic({ manager: 'admin', appIDs: null, username: 'u' }).assertAppAccess('a'),
        AccessDenyError,
      )
      assert.throws(
        () => makeBasic({ manager: 'admin', appIDs: ['b'], username: 'u' }).assertAppAccess('a'),
        AccessDenyError,
      )
      assert.throws(
        () => makeBasic({ manager: 'none', username: 'u' }).assertAppAccess('a'),
        AccessDenyError,
      )
    })

    it('check*Exist early returns and system perms', async function() {
      const svc = makeBasic({ manager: 'super' })
      await svc.checkAppIDsExist(null)
      await svc.checkPermIDsExist('a', null)
      await svc.checkRoleIDsExist('a', null)
      await svc.checkPermIDExist('a', null)
      await svc.checkPermIDExist('a', 'ALLOW_ALL')
      await svc.checkPermIDExist('a', 'DENY_ALL')
      await svc.checkCategoryIDExist(null)
    })

    it('checkExist with exclude and missing object', async function() {
      const svc = makeBasic({ manager: 'super' })
      svc.args = { value: { name: 'x' }, exclude: { id: 1 } }
      svc.ObjectModel = { findOne: async () => null }
      await svc.checkExist()
      assert.strictEqual(svc.ctx.body.data.exist, false)
      svc.ObjectModel = { findOne: async () => ({ id: 1 }) }
      await svc.checkExist()
      assert.strictEqual(svc.ctx.body.data.exist, true)
      // no exclude branch
      svc.args = { value: { name: 'y' } }
      svc.ObjectModel = { findOne: async () => null }
      await svc.checkExist()
      assert.strictEqual(svc.ctx.body.data.exist, false)
    })

    it('deleteByPk / deleteByPkWithAppAccess not found', async function() {
      const svc = makeBasic({ manager: 'super' })
      svc.args = { id: 9 }
      await svc.deleteByPk('id')
      assert.strictEqual(svc.ctx.body.reason, 'ERR_OBJECT_NOT_FOUND')
      await svc.deleteByPkWithAppAccess('id')
      assert.strictEqual(svc.ctx.body.reason, 'ERR_OBJECT_NOT_FOUND')
    })
  })

  describe('rbac-pub branches', function() {
    const origRadix = config.rbacUseRadixTreeRouting
    const origRecord = config.rbacRecordAccessLog
    const origGet = resourceCache.getResource
    const origGetRadix = resourceCache.getResourceByRadixTree
    const origCreate = AccessLogModel.create
    afterEach(function() {
      config.rbacUseRadixTreeRouting = origRadix
      config.rbacRecordAccessLog = origRecord
      resourceCache.getResource = origGet
      resourceCache.getResourceByRadixTree = origGetRadix
      AccessLogModel.create = origCreate
    })

    function makePub(ctxOverrides) {
      const ctx = mockCtx(ctxOverrides)
      const svc = new RbacPub(ctx)
      svc.success = (data) => { ctx.body = { ok: true, data } }
      svc.fail = (code, reason, data) => { ctx.body = { ok: false, reason, data }; ctx.status = code }
      svc.log4js = { info() {}, warn() {}, error() {} }
      return svc
    }

    it('_isRecordAccessLog false on OPTIONS and when disabled', function() {
      config.rbacRecordAccessLog = true
      const svc = makePub({ action: 'OPTIONS' })
      assert.strictEqual(svc._isRecordAccessLog(), false)
      config.rbacRecordAccessLog = false
      assert.strictEqual(makePub({ action: 'GET' })._isRecordAccessLog(), false)
    })

    it('_writeAccessLog no-ops when not recording', function() {
      config.rbacRecordAccessLog = false
      makePub()._writeAccessLog()
    })

    it('_writeAccessLog without userInfo and appid falls back to args', function() {
      config.rbacRecordAccessLog = true
      let saved = null
      AccessLogModel.create = (v) => { saved = v; return Promise.resolve(v) }
      const svc = makePub({
        userInfo: null,
        appid: null,
        resource: { id: 1, permID: 'p1', appID: 'a' },
        request: { method: 'GET', body: {} },
        query: { appID: 'from-arg', action: 'GET', resName: '/r', clientIP: '1.1.1.1' },
      })
      svc.args = { appID: 'from-arg', action: 'GET', resName: '/r', clientIP: '1.1.1.1' }
      svc._writeAccessLog()
      assert.strictEqual(saved.userID, -1)
      assert.strictEqual(saved.username, 'none')
      assert.strictEqual(saved.appID, 'from-arg')
    })

    it('_writeAccessLog skips ALLOW_ALL matched resource', function() {
      config.rbacRecordAccessLog = true
      let called = false
      AccessLogModel.create = () => { called = true }
      const svc = makePub({
        resource: { id: 1, permID: constant.SystemPerm.ALLOW_ALL },
      })
      svc._writeAccessLog()
      assert.strictEqual(called, false)
    })

    it('_accessCheckInternal radix tree path with undefined query', async function() {
      config.rbacUseRadixTreeRouting = true
      resourceCache.getResourceByRadixTree = async (appID, query) => {
        assert.strictEqual(query.method, 'GET')
        assert.strictEqual(query.path, '/x')
        return { resource: { permID: constant.SystemPerm.ALLOW_ALL, id: 1 }, cached: 'miss' }
      }
      const svc = makePub()
      await svc._accessCheckInternal(
        { username: 'u', permissions: {} },
        'app1',
        'GET',
        '/x',
        undefined,
      )
      assert.strictEqual(svc.ctx.body.ok, true)
    })

    it('_accessCheckInternal radix tree with provided query object', async function() {
      config.rbacUseRadixTreeRouting = true
      resourceCache.getResourceByRadixTree = async (appID, query) => {
        assert.strictEqual(query.extra, 1)
        return { resource: null, cached: 'miss' }
      }
      const svc = makePub()
      await svc._accessCheckInternal(
        { username: 'u', permissions: {} },
        'app1',
        'GET',
        '/x',
        { extra: 1 },
      )
      assert.strictEqual(svc.ctx.body.ok, false)
    })
  })

  describe('helper / user-cache / query-util / system-prompt / redis-cache', function() {
    const { ldapOptions } = require('../src/controllers/helper')
    const userCache = require('../src/service/user-cache')
    const queryUtil = require('../src/util/query-util')
    const { truncateMemoryItem, buildMemorySection } = require('../src/ai/system-prompt')
    const { RedisCache } = require('../src/util/wolf-cache')
    const RoleModel = require('../src/model/role')
    const UserRoleModel = require('../src/model/user-role')

    it('ldapOptions without fieldsMap', function() {
      const orig = config.ldapConfig
      config.ldapConfig = { label: 'X' }
      const opts = ldapOptions()
      assert.strictEqual(opts.supported, true)
      assert.deepStrictEqual(opts.syncedFields, [])
      config.ldapConfig = orig
    })

    it('user-cache byId paths: originUserInfo, no appId, missing role, negative cache', async function() {
      const origFindByPk = UserModel.findByPk
      const origUR = UserRoleModel.findOne
      const origRole = RoleModel.findOne
      try {
        const info = await userCache.getUserInfoById(1, null, { id: 1, username: 'u' })
        assert.strictEqual(info.userInfo.id, 1)

        UserRoleModel.findOne = async () => ({
          permIDs: ['p1'],
          roleIDs: ['r1'],
        })
        RoleModel.findOne = async () => null
        await userCache.flushUserCache()
        const withRoleMiss = await userCache.getUserInfoById(2, 'appx', { id: 2, username: 'u2' })
        assert.strictEqual(withRoleMiss.userInfo.permissions.p1, true)

        UserModel.findByPk = async () => null
        await userCache.flushUserCache()
        const missing = await userCache.getUserInfoById(999001, 'appz')
        assert.ok(!missing.userInfo)
        // negative cache hit (#)
        const missingHit = await userCache.getUserInfoById(999001, 'appz')
        assert.strictEqual(missingHit.cached, 'hit')
        assert.strictEqual(missingHit.userInfo, undefined)
      } finally {
        UserModel.findByPk = origFindByPk
        UserRoleModel.findOne = origUR
        RoleModel.findOne = origRole
        await userCache.flushUserCache()
      }
    })

    it('query-util getValues defaults and array/object parse', function() {
      assert.deepStrictEqual(queryUtil.getValues({}), {})
      const vals = queryUtil.getValues(
        { arr: '[1,2]', obj: '{"a":1}', plain: 'x' },
        { arr: 'array', obj: { type: 'object' }, plain: {} },
        '/t',
      )
      assert.deepStrictEqual(vals.arr, [1, 2])
      assert.deepStrictEqual(vals.obj, { a: 1 })
      assert.strictEqual(vals.plain, 'x')
      assert.throws(
        () => queryUtil.getValues({ arr: '{}' }, { arr: 'array' }, '/t'),
        ArgsError,
      )
    })

    it('system-prompt truncate and memory section length limit', function() {
      assert.strictEqual(truncateMemoryItem(null, 10), '')
      assert.ok(truncateMemoryItem('abcdefghij', 5).endsWith('...'))
      const origGet = aiConfig.getWolfAiConfig
      aiConfig.getWolfAiConfig = () => ({ maxMemoryItemLength: 3, maxMemorySectionLength: 40 })
      try {
        const section = buildMemorySection([
          { category: 'preference', content: 'abcdef' },
          { category: 'custom', content: 'zzzzzzzz' },
        ], true)
        assert.ok(section.includes('...'))
        assert.ok(section.includes('custom') || section.includes('用户'))
      } finally {
        aiConfig.getWolfAiConfig = origGet
      }
    })

    it('RedisCache constructor defaults', function() {
      const fake = {
        set: async () => 'OK',
        sadd: async () => 1,
        expire: async () => 1,
        get: async () => null,
        del: async () => 1,
        smembers: async () => [],
        multi: () => ({ exec: async () => [] }),
      }
      const c = new RedisCache(fake)
      assert.strictEqual(c.prefix, '')
      assert.ok(c.stdTTL > 0)
    })

    it('category list without key/order and put without existCategory', async function() {
      const Category = require('../src/controllers/category')
      const CategoryModel = require('../src/model/category')
      const origFindAll = CategoryModel.findAll
      const origCount = CategoryModel.count
      const origFindByPk = CategoryModel.findByPk
      const origCheckExist = CategoryModel.checkExist
      const origCheckNotExist = CategoryModel.checkNotExist
      const origUpdate = CategoryModel.mustUpdate
      try {
        CategoryModel.findAll = async (opts) => {
          assert.ok(!opts.where[require('sequelize').Op.or])
          return []
        }
        CategoryModel.count = async () => 0
        const ctx = mockCtx({
          method: 'GET',
          request: { method: 'GET', body: {} },
          query: { appID: 'app1' },
        })
        const svc = new Category(ctx)
        svc.success = (d) => { ctx.body = { ok: true, data: d } }
        svc.log4js = { info() {}, warn() {}, error() {} }
        await svc.list()
        assert.strictEqual(ctx.body.ok, true)

        CategoryModel.checkExist = async () => ({})
        CategoryModel.findByPk = async () => null
        CategoryModel.checkNotExist = async () => {}
        CategoryModel.mustUpdate = async () => ({ newValues: { id: 1, name: 'n', toJSON() { return this } } })
        const ctx2 = mockCtx({
          method: 'PUT',
          request: { method: 'PUT', body: { id: 1, name: 'n', appID: 'app1' } },
          query: {},
          userInfo: { manager: 'super' },
        })
        const svc2 = new Category(ctx2)
        svc2.success = (d) => { ctx2.body = { ok: true, data: d } }
        svc2.fail = () => {}
        svc2.log4js = { info() {}, warn() {}, error() {} }
        await svc2.put()
        assert.strictEqual(ctx2.body.ok, true)
      } finally {
        CategoryModel.findAll = origFindAll
        CategoryModel.count = origCount
        CategoryModel.findByPk = origFindByPk
        CategoryModel.checkExist = origCheckExist
        CategoryModel.checkNotExist = origCheckNotExist
        CategoryModel.mustUpdate = origUpdate
      }
    })
  })
})
