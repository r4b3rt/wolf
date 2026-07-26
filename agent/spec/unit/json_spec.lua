describe("json", function()
  local json

  before_each(function()
    package.loaded["json"] = nil
    json = require("json")
  end)

  it("loads valid object", function()
    local obj, err = json.loads('{"a":1}')
    assert.is_nil(err)
    assert.are.equal(1, obj.a)
  end)

  it("loads valid array", function()
    local obj, err = json.loads('[1,2]')
    assert.is_nil(err)
    assert.are.equal(1, obj[1])
  end)

  it("returns error on invalid json", function()
    local obj, err = json.loads("not-json")
    assert.is_nil(obj)
    assert.is_not_nil(err)
  end)

  it("tryloads returns decoded object/array", function()
    assert.are.equal(2, json.tryloads('{"x":2}').x)
    assert.are.equal(9, json.tryloads("[9]")[1])
  end)

  it("tryloads returns original for non-json-looking strings", function()
    assert.are.equal("hello", json.tryloads("hello"))
    assert.are.equal(42, json.tryloads(42))
  end)

  it("tryloads returns original when decode fails on json-looking string", function()
    assert.are.equal("{bad}", json.tryloads("{bad}"))
  end)

  it("dumps table and non-table", function()
    local s = json.dumps({ a = 1 })
    assert.is_truthy(string.find(s, '"a"'))
    assert.are.equal("nil", json.dumps(nil))
    assert.are.equal("3", json.dumps(3))
  end)
end)
