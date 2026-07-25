/**
 * AUD-015 回归：list 接口的 sort 参数必须按模型字段名做白名单校验，
 * 拒绝任意字符串直接拼进 ORDER BY（列名无法参数化，只能靠白名单）。
 */

const assert = require('assert')
const ArgsUtil = require('../src/util/args-util')
const UserModel = require('../src/model/user')

function helperWithSort(sort, ObjectModel) {
  const helper = new ArgsUtil({sort}, '/wolf/user/list')
  helper.ObjectModel = ObjectModel
  return helper
}

describe('args-util getOrderByArgs column whitelist (AUD-015)', function() {
  it('accepts a known model attribute, ascending', function() {
    const helper = helperWithSort('+username', UserModel)
    assert.deepStrictEqual(helper.getOrderByArgs('-id'), [['username', 'ASC']])
  })

  it('accepts a known model attribute, descending (default)', function() {
    const helper = helperWithSort('-lastLogin', UserModel)
    assert.deepStrictEqual(helper.getOrderByArgs('-id'), [['lastLogin', 'DESC']])
  })

  it('falls back to default order when sort arg absent', function() {
    const helper = helperWithSort(undefined, UserModel)
    assert.deepStrictEqual(helper.getOrderByArgs('-id'), [['id', 'DESC']])
  })

  it('rejects a field name that is not part of the model', function() {
    const helper = helperWithSort('-notAColumn', UserModel)
    assert.throws(() => helper.getOrderByArgs('-id'), /sort field 'notAColumn' is invalid/)
  })

  const payloads = [
    'id;DROP TABLE user;--',
    'id) UNION SELECT password FROM user--',
    '(SELECT 1)',
    'id, (SELECT pg_sleep(5))',
    'id ASC, password',
  ]
  for (const payload of payloads) {
    it(`rejects injection payload: ${payload}`, function() {
      const helper = helperWithSort(payload, UserModel)
      assert.throws(() => helper.getOrderByArgs('-id'))
    })
  }
})
