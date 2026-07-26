describe("agent_pub", function()
  local agent_pub

  before_each(function()
    ngx_mock.setup({
      var = { uri = "/page" },
      header = { ["Content-Type"] = "text/html; charset=utf-8" },
    })
    package.loaded["agent_pub"] = nil
    agent_pub = require("agent_pub")
  end)

  it("is_ignore_url matches rbac built-in paths", function()
    assert.is_true(agent_pub.is_ignore_url("/wolf/rbac/login.html"))
    assert.is_true(agent_pub.is_ignore_url("/wolf/rbac/access_check"))
    assert.is_false(agent_pub.is_ignore_url("/api/x"))
  end)

  it("need_replace false for ignore urls", function()
    ngx_mock.setup({
      var = { uri = "/wolf/rbac/logout" },
      header = { ["Content-Type"] = "text/html" },
    })
    package.loaded["agent_pub"] = nil
    agent_pub = require("agent_pub")
    assert.is_false(agent_pub.need_replace())
  end)

  it("need_replace false when Content-Type missing", function()
    ngx_mock.setup({
      var = { uri = "/page" },
      header = {},
    })
    package.loaded["agent_pub"] = nil
    agent_pub = require("agent_pub")
    assert.is_false(agent_pub.need_replace())
  end)

  it("need_replace true for text/html and text/plain", function()
    ngx_mock.setup({
      var = { uri = "/page" },
      header = { ["Content-Type"] = "text/html; charset=utf-8" },
    })
    package.loaded["agent_pub"] = nil
    agent_pub = require("agent_pub")
    assert.is_true(agent_pub.need_replace())
    -- cached
    assert.is_true(agent_pub.need_replace())

    ngx_mock.setup({
      var = { uri = "/page" },
      header = { ["Content-Type"] = "text/plain" },
    })
    package.loaded["agent_pub"] = nil
    agent_pub = require("agent_pub")
    assert.is_true(agent_pub.need_replace())
  end)

  it("need_replace false for other content types", function()
    ngx_mock.setup({
      var = { uri = "/page" },
      header = { ["Content-Type"] = "application/json" },
    })
    package.loaded["agent_pub"] = nil
    agent_pub = require("agent_pub")
    assert.is_false(agent_pub.need_replace())
  end)
end)
