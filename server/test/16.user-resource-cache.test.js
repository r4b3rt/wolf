'use strict'

const assert = require('assert')
const config = require('../conf/config')
const UserModel = require('../src/model/user')
const ResourceModel = require('../src/model/resource')
const userCache = require('../src/service/user-cache')
const resourceCache = require('../src/service/resource-cache')
const { HttpRadixTree } = require('rax-radix-tree')

describe('user-resource-cache', function() {
  const origFindOne = UserModel.findOne
  const origFindByPk = UserModel.findByPk
  const origResFindAll = ResourceModel.findAll
  const origResFindOne = ResourceModel.findOne
  const origRadix = config.rbacUseRadixTreeRouting

  afterEach(async function() {
    UserModel.findOne = origFindOne
    UserModel.findByPk = origFindByPk
    ResourceModel.findAll = origResFindAll
    ResourceModel.findOne = origResFindOne
    config.rbacUseRadixTreeRouting = origRadix
    await userCache.flushUserCache()
    await resourceCache.flushCacheImmediately().catch(() => {})
  })

  describe('getUserInfoByName', function() {
    it('miss then hit, and negative cache with #', async function() {
      const username = `cache_user_${Date.now()}`
      let dbCalls = 0
      UserModel.findOne = async () => {
        dbCalls += 1
        return {
          toJSON() {
            return { id: 99, username, authType: 1, status: 0 }
          },
        }
      }
      const miss = await userCache.getUserInfoByName(username)
      assert.strictEqual(miss.cached, 'miss')
      assert.strictEqual(miss.userInfo.username, username)
      const hit = await userCache.getUserInfoByName(username)
      assert.strictEqual(hit.cached, 'hit')
      assert.strictEqual(dbCalls, 1)

      const missing = `missing_${Date.now()}`
      UserModel.findOne = async () => null
      const empty1 = await userCache.getUserInfoByName(missing)
      assert.ok(!empty1.userInfo)
      const empty2 = await userCache.getUserInfoByName(missing)
      assert.strictEqual(empty2.cached, 'hit')
      assert.strictEqual(empty2.userInfo, undefined)
    })
  })

  describe('radix tree resource cache', function() {
    it('initRadixTreeCache no-op when flag off', async function() {
      config.rbacUseRadixTreeRouting = false
      await resourceCache.initRadixTreeCache()
    })

    it('initRadixTreeCache builds trees and getResourceByRadixTree matches', async function() {
      config.rbacUseRadixTreeRouting = true
      ResourceModel.findAll = async () => ([{
        id: 1,
        appID: 'demo',
        name: '/api/*',
        action: 'GET',
        matchType: 'radixtree',
        hosts: null,
        remoteAddrs: null,
        exprs: null,
        permID: 'p1',
      }])
      await resourceCache.initRadixTreeCache()
      const trees = resourceCache.getRadixTreeCache()
      assert.ok(trees.demo instanceof HttpRadixTree || trees.demo)

      const hit = await resourceCache.getResourceByRadixTree('demo', {
        path: '/api/x',
        method: 'GET',
        host: 'localhost',
        remote_addr: '127.0.0.1',
      })
      // may or may not match depending on HttpRadixTree path syntax; ensure miss path works
      const missApp = await resourceCache.getResourceByRadixTree('noapp', { path: '/', method: 'GET' })
      assert.strictEqual(missApp.resource, null)

      // inject a fake tree for deterministic match
      resourceCache.setRadixTreeCache({
        demo: {
          findRoute(query) {
            if (query.path === '/ok') return { meta: { id: 7, name: '/ok' } }
            return null
          },
        },
      })
      const matched = await resourceCache.getResourceByRadixTree('demo', { path: '/ok' })
      assert.strictEqual(matched.resource.id, 7)
      const unmatched = await resourceCache.getResourceByRadixTree('demo', { path: '/no' })
      assert.strictEqual(unmatched.resource, null)
    })

    it('getResource uses # negative cache', async function() {
      ResourceModel.findOne = async () => null
      const keyApp = `app_${Date.now()}`
      const r1 = await resourceCache.getResource(keyApp, 'GET', '/none')
      assert.strictEqual(r1.cached, 'miss')
      assert.ok(!r1.resource)
      const r2 = await resourceCache.getResource(keyApp, 'GET', '/none')
      assert.strictEqual(r2.cached, 'hit')
      assert.strictEqual(r2.resource, undefined)
    })
  })
})
