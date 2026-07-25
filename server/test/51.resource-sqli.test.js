/**
 * AUD-001 回归：资源匹配路径不得出现 SQL 注入。
 *
 * getResourceFromDb 曾把请求路径拼进 Sequelize.literal，构造出的 SQL 可被 payload
 * 中的引号闭合。这里直接生成 SQL 文本，断言 payload 始终作为字面量出现。
 */

const assert = require('assert')
const ResourceModel = require('../src/model/resource')
const { buildMatchWhere } = require('../src/service/resource-cache')

function generateSql(resName) {
  const sequelize = ResourceModel.sequelize
  const queryGenerator = sequelize.getQueryInterface().queryGenerator
  const options = {
    where: buildMatchWhere('some-app', 'GET', resName),
    order: [['priority', 'ASC']],
    limit: 1,
    model: ResourceModel,
  }
  return queryGenerator.selectQuery(ResourceModel.getTableName(), options, ResourceModel)
}

describe('resource-cache sql injection (AUD-001)', function() {
  const payloads = [
    `x') = name OR 1=1 OR ('a`,
    `/a' OR '1'='1`,
    `/a'; DROP TABLE resource; --`,
    `/a' || pg_sleep(5) || '`,
    `/it's/a/path`,
    `/a\\'b`,
  ]

  for (const payload of payloads) {
    it(`payload is escaped: ${JSON.stringify(payload)}`, function() {
      const sql = generateSql(payload)

      // 注入生效的标志是 payload 中的引号闭合后引入了新的 SQL 结构。
      // 转义正确时，单引号会被翻倍（postgres）或反斜杠转义（mysql），
      // 因此原始 payload 不会以未转义形式出现在 SQL 中。
      if (payload.includes("'")) {
        assert.ok(
          !sql.includes(payload),
          `raw payload leaked into SQL unescaped:\n${sql}`
        )
      }

      // 结构断言：注入所依赖的裸 OR / 语句分隔不得出现在引号之外。
      const outsideStringLiterals = sql.replace(/'(?:''|\\'|[^'])*'/g, "''")
      assert.ok(
        !/\bOR\s+1\s*=\s*1\b/i.test(outsideStringLiterals),
        `injected OR 1=1 escaped the string literal:\n${sql}`
      )
      assert.ok(
        !/pg_sleep/i.test(outsideStringLiterals),
        `injected pg_sleep escaped the string literal:\n${sql}`
      )
      assert.ok(
        !/DROP\s+TABLE/i.test(outsideStringLiterals),
        `injected DROP TABLE escaped the string literal:\n${sql}`
      )
    })
  }

  it('keeps prefix/suffix/equal match semantics', function() {
    const sql = generateSql('/normal/path')
    assert.ok(/right\(/i.test(sql), 'suffix match must still use right()')
    assert.ok(/substr\(/i.test(sql), 'prefix match must still use substr()')
    assert.ok(/length\(/i.test(sql), 'match must still compare against length(name)')
    assert.ok(sql.includes("'/normal/path'"), 'resource name must be bound as a literal value')
  })
})
