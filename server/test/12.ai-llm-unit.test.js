'use strict'

const assert = require('assert')

const agentFactory = require('../src/ai/agent-factory')
const generateTitle = require('../src/ai/generate-title')
const memoryExtractor = require('../src/ai/memory-extractor')
const aiConfig = require('../src/ai/ai-config')
const toolsIndex = require('../src/ai/tools/index')

describe('ai-llm-unit', function() {
  const orig = {
    importPiMono: agentFactory.importPiMono,
    importCompleteSimpleTitle: generateTitle.importCompleteSimple,
    importCompleteSimpleMem: memoryExtractor.importCompleteSimple,
    getWolfPiModel: agentFactory.getWolfPiModel,
    isAiAvailable: aiConfig.isAiAvailable,
    getProvider: aiConfig.getProvider,
    getModelId: aiConfig.getModelId,
    getWolfAiConfig: aiConfig.getWolfAiConfig,
    getBaseUrl: aiConfig.getBaseUrl,
    getApiKeyForProvider: aiConfig.getApiKeyForProvider,
    getAllTools: toolsIndex.getAllTools,
  }

  afterEach(function() {
    agentFactory.importPiMono = orig.importPiMono
    agentFactory.resetPiMonoCache()
    generateTitle.importCompleteSimple = orig.importCompleteSimpleTitle
    memoryExtractor.importCompleteSimple = orig.importCompleteSimpleMem
    agentFactory.getWolfPiModel = orig.getWolfPiModel
    aiConfig.isAiAvailable = orig.isAiAvailable
    aiConfig.getProvider = orig.getProvider
    aiConfig.getModelId = orig.getModelId
    aiConfig.getWolfAiConfig = orig.getWolfAiConfig
    aiConfig.getBaseUrl = orig.getBaseUrl
    aiConfig.getApiKeyForProvider = orig.getApiKeyForProvider
    toolsIndex.getAllTools = orig.getAllTools
  })

  function stubPiMono({ getModelReturn, AgentClass } = {}) {
    class FakeAgent {
      constructor(opts) {
        this.opts = opts
      }
    }
    agentFactory.resetPiMonoCache()
    agentFactory.importPiMono = async () => ({
      Agent: AgentClass || FakeAgent,
      getModel: () => (getModelReturn === undefined ? null : getModelReturn),
    })
  }

  describe('getWolfPiModel / createAgent', function() {
    it('throws when AI not available', async function() {
      stubPiMono()
      aiConfig.isAiAvailable = () => false
      aiConfig.getProvider = () => 'openai'
      aiConfig.getModelId = () => 'gpt-test'
      aiConfig.getWolfAiConfig = () => ({ api: 'openai-completions' })
      await assert.rejects(() => agentFactory.getWolfPiModel(), /AI 功能未配置/)
    })

    it('builds fallback model when getModel returns null', async function() {
      stubPiMono({ getModelReturn: null })
      aiConfig.isAiAvailable = () => true
      aiConfig.getProvider = () => 'openai'
      aiConfig.getModelId = () => 'custom-model'
      aiConfig.getWolfAiConfig = () => ({ api: 'openai-completions' })
      aiConfig.getBaseUrl = () => ''
      const { model, provider, modelId } = await agentFactory.getWolfPiModel()
      assert.strictEqual(provider, 'openai')
      assert.strictEqual(modelId, 'custom-model')
      assert.strictEqual(model.id, 'custom-model')
      assert.strictEqual(model.api, 'openai-completions')
      assert.strictEqual(model.reasoning, false)
    })

    it('uses registry model and applies baseUrl / reasoning / thinkingFormat', async function() {
      stubPiMono({
        getModelReturn: {
          id: 'gpt-4',
          name: 'gpt-4',
          api: 'openai-completions',
          provider: 'openai',
          compat: { foo: 1 },
        },
      })
      aiConfig.isAiAvailable = () => true
      aiConfig.getProvider = () => 'openai'
      aiConfig.getModelId = () => 'gpt-4'
      aiConfig.getBaseUrl = () => 'https://proxy.example/v1'
      aiConfig.getWolfAiConfig = () => ({
        api: 'openai-completions',
        modelReasoning: true,
        thinkingFormat: 'qwen',
      })
      const { model } = await agentFactory.getWolfPiModel()
      assert.strictEqual(model.baseUrl, 'https://proxy.example/v1')
      assert.strictEqual(model.reasoning, true)
      assert.strictEqual(model.compat.thinkingFormat, 'qwen')
      assert.strictEqual(model.compat.foo, 1)
    })

    it('createAgent wires Agent with tools, prompt and transformContext', async function() {
      const created = []
      class CapturingAgent {
        constructor(opts) {
          created.push(opts)
          this.opts = opts
        }
      }
      stubPiMono({
        getModelReturn: { id: 'm1', provider: 'openai', api: 'openai-completions' },
        AgentClass: CapturingAgent,
      })
      aiConfig.isAiAvailable = () => true
      aiConfig.getProvider = () => 'openai'
      aiConfig.getModelId = () => 'm1'
      aiConfig.getBaseUrl = () => ''
      aiConfig.getWolfAiConfig = () => ({ thinkingLevel: 'medium', maxHistoryMessages: 2 })
      aiConfig.getApiKeyForProvider = async () => 'sk-test'
      toolsIndex.getAllTools = async () => [{ name: 't1' }]

      const agent = await agentFactory.createAgent({
        userInfo: { username: 'u1', nickname: 'N', manager: 'super' },
        clientIp: '1.2.3.4',
        messages: [{ role: 'user', content: 'hi' }],
        locale: 'zh-CN',
        memories: [],
      })
      assert.ok(agent)
      assert.strictEqual(created.length, 1)
      assert.strictEqual(created[0].initialState.tools.length, 1)
      assert.ok(created[0].initialState.systemPrompt.includes('u1'))
      assert.strictEqual(created[0].initialState.thinkingLevel, 'medium')
      const key = await created[0].getApiKey('openai')
      assert.strictEqual(key, 'sk-test')
      const pruned = await created[0].transformContext([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ])
      assert.strictEqual(pruned.length, 2)
    })
  })

  describe('generateSessionTitle', function() {
    it('returns empty for blank text', async function() {
      const title = await generateTitle.generateSessionTitle('   ', 'zh-CN')
      assert.strictEqual(title, '')
    })

    it('throws when no api key', async function() {
      agentFactory.getWolfPiModel = async () => ({
        model: { id: 'm', provider: 'openai' },
        wolfAiConf: {},
        provider: 'openai',
      })
      generateTitle.importCompleteSimple = async () => ({
        completeSimple: async () => ({ content: [{ type: 'text', text: 't' }] }),
      })
      aiConfig.getApiKeyForProvider = () => ''
      await assert.rejects(() => generateTitle.generateSessionTitle('hello', 'en'), /No API key/)
    })

    it('throws on stopReason error', async function() {
      agentFactory.getWolfPiModel = async () => ({
        model: { id: 'm', provider: 'openai', baseUrl: 'https://api.mimo.example' },
        wolfAiConf: { thinkingFormat: 'mimo' },
        provider: 'openai',
      })
      generateTitle.importCompleteSimple = async () => ({
        completeSimple: async () => ({ stopReason: 'error', errorMessage: 'boom' }),
      })
      aiConfig.getApiKeyForProvider = () => 'sk'
      await assert.rejects(() => generateTitle.generateSessionTitle('hello', 'en'), /boom/)
    })

    it('returns cleaned truncated title and uses mimo onPayload', async function() {
      let seenOnPayload = null
      agentFactory.getWolfPiModel = async () => ({
        model: { id: 'm', provider: 'mimo', baseUrl: 'https://xiaomimimo.com/v1' },
        wolfAiConf: {},
        provider: 'mimo',
      })
      generateTitle.importCompleteSimple = async () => ({
        completeSimple: async (model, ctx, opts) => {
          seenOnPayload = opts.onPayload
          if (opts.onPayload) opts.onPayload({ foo: 1 })
          return {
            content: [{ type: 'text', text: `"${'X'.repeat(100)}"` }],
          }
        },
      })
      aiConfig.getApiKeyForProvider = () => 'sk'
      const title = await generateTitle.generateSessionTitle('对话内容', 'zh-CN')
      assert.ok(typeof seenOnPayload === 'function')
      assert.strictEqual(title.length, 80)
      assert.ok(!title.startsWith('"'))
    })
  })

  describe('memory-extractor LLM paths', function() {
    it('callLlmForExtraction returns empty for blank conversation', async function() {
      const r = await memoryExtractor.callLlmForExtraction('  ', [])
      assert.deepStrictEqual(r, { add: [], deprecate: [] })
    })

    it('parses markdown JSON and filters non-array fields', async function() {
      agentFactory.getWolfPiModel = async () => ({
        model: { id: 'm', provider: 'openai' },
        wolfAiConf: {},
        provider: 'openai',
      })
      aiConfig.getApiKeyForProvider = () => 'sk'
      memoryExtractor.importCompleteSimple = async () => ({
        completeSimple: async () => ({
          content: [{
            type: 'text',
            text: '<think>x</think>```json\n{"add":[{"category":"preference","content":"c"}],"deprecate":"bad"}\n```',
          }],
        }),
      })
      const r = await memoryExtractor.callLlmForExtraction('hello world', [])
      assert.strictEqual(r.add.length, 1)
      assert.deepStrictEqual(r.deprecate, [])
    })

    it('returns empty on empty LLM content and invalid JSON', async function() {
      agentFactory.getWolfPiModel = async () => ({
        model: { id: 'm', provider: 'openai' },
        wolfAiConf: {},
        provider: 'openai',
      })
      aiConfig.getApiKeyForProvider = () => 'sk'
      memoryExtractor.importCompleteSimple = async () => ({
        completeSimple: async () => ({ content: [] }),
      })
      let r = await memoryExtractor.callLlmForExtraction('hello', [])
      assert.deepStrictEqual(r, { add: [], deprecate: [] })

      memoryExtractor.importCompleteSimple = async () => ({
        completeSimple: async () => ({ content: [{ type: 'text', text: 'not-json' }] }),
      })
      r = await memoryExtractor.callLlmForExtraction('hello', [])
      assert.deepStrictEqual(r, { add: [], deprecate: [] })
    })

    it('extractMemoryForSession skips empty messages but marks extracted', async function() {
      let updated = null
      const session = {
        id: 9,
        update: async (vals) => { updated = vals },
      }
      await memoryExtractor.extractMemoryForSession(
        session,
        1,
        { findAll: async () => [] },
        { findAll: async () => [], update: async () => [0], create: async () => ({}) },
      )
      assert.ok(updated.memoryExtractedAt)
    })

    it('extractMemoryForSession marks extracted when LLM throws', async function() {
      let updated = null
      const session = {
        id: 9,
        update: async (vals) => { updated = vals },
      }
      agentFactory.getWolfPiModel = async () => { throw new Error('llm down') }
      await memoryExtractor.extractMemoryForSession(
        session,
        1,
        {
          findAll: async () => ([{
            content: { role: 'user', content: 'hi' },
          }]),
        },
        { findAll: async () => [], update: async () => [0], create: async () => ({}) },
      )
      assert.ok(updated.memoryExtractedAt)
    })

    it('extractMemoryForSession writes add/deprecate with truncation', async function() {
      const created = []
      let deprecated = null
      const session = {
        id: 3,
        update: async () => {},
      }
      agentFactory.getWolfPiModel = async () => ({
        model: { id: 'm', provider: 'openai' },
        wolfAiConf: {},
        provider: 'openai',
      })
      aiConfig.getApiKeyForProvider = () => 'sk'
      aiConfig.getWolfAiConfig = () => ({ maxMemoryItemLength: 5 })
      memoryExtractor.importCompleteSimple = async () => ({
        completeSimple: async () => ({
          content: [{
            type: 'text',
            text: JSON.stringify({
              add: [
                { category: 'preference', content: '1234567890' },
                { category: 'bad', content: 'x' },
                { category: 'knowledge', content: '  ok  ' },
              ],
              deprecate: [1, 'x', 2],
            }),
          }],
        }),
      })
      await memoryExtractor.extractMemoryForSession(
        session,
        7,
        {
          findAll: async () => ([{
            content: { role: 'user', content: 'remember this' },
          }]),
        },
        {
          findAll: async () => ([{ id: 1, category: 'preference', content: 'old' }]),
          update: async (vals, opts) => { deprecated = opts.where.id; return [2] },
          create: async (row) => { created.push(row); return row },
        },
      )
      assert.deepStrictEqual(deprecated, [1, 2])
      assert.strictEqual(created.length, 2)
      assert.strictEqual(created[0].content, '12345')
      assert.strictEqual(created[1].content, 'ok')
    })

    it('triggerMemoryExtraction filters pending and handles outer errors', async function() {
      const extractedSessions = []
      const sessions = [
        { id: 1, memoryExtractedAt: 10, updateTime: 20, update: async () => {} },
        { id: 2, memoryExtractedAt: 30, updateTime: 20, update: async () => {} },
      ]
      // stub extract via LLM empty path
      agentFactory.getWolfPiModel = async () => ({
        model: { id: 'm', provider: 'openai' },
        wolfAiConf: {},
        provider: 'openai',
      })
      aiConfig.getApiKeyForProvider = () => 'sk'
      memoryExtractor.importCompleteSimple = async () => ({
        completeSimple: async () => ({ content: [{ type: 'text', text: '{"add":[],"deprecate":[]}' }] }),
      })

      await memoryExtractor.triggerMemoryExtraction(
        1,
        {
          findAll: async (opts) => {
            assert.ok(opts.where.id)
            return sessions
          },
        },
        {
          findAll: async () => {
            extractedSessions.push(1)
            return [{ content: { role: 'user', content: 'hi' } }]
          },
        },
        { findAll: async () => [], update: async () => [0], create: async () => ({}) },
        99,
      )
      assert.ok(extractedSessions.length >= 1)

      // no pending
      await memoryExtractor.triggerMemoryExtraction(
        1,
        { findAll: async () => ([{ id: 1, memoryExtractedAt: 50, updateTime: 10 }]) },
        { findAll: async () => [] },
        { findAll: async () => [] },
      )

      // outer catch
      await memoryExtractor.triggerMemoryExtraction(
        1,
        { findAll: async () => { throw new Error('db') } },
        { findAll: async () => [] },
        { findAll: async () => [] },
      )
    })
  })
})
