describe("config", function()
  local config

  before_each(function()
    package.loaded["config"] = nil
    config = require("config")
  end)

  it("exposes sysname and agentName", function()
    assert.are.equal("WOLF-RBAC", config.sysname)
    assert.are.equal("wolf-agent", config.agentName)
  end)

  it("has ignore_list equals/suffix/prefix tables", function()
    assert.is_table(config.ignore_list)
    assert.is_table(config.ignore_list.equals)
    assert.is_table(config.ignore_list.suffix)
    assert.is_table(config.ignore_list.prefix)
    assert.are.equal("/favicon.ico", config.ignore_list.equals[1])
    assert.are.equal(".js", config.ignore_list.suffix[1])
  end)

  it("has cookie_config defaults", function()
    assert.are.equal("x-rbac-token", config.cookie_config.key)
    assert.are.equal("/", config.cookie_config.path)
    assert.are.equal(3600 * 24, config.cookie_config.expires)
  end)
end)
