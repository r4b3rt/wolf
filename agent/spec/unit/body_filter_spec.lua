describe("body_filter", function()
  local body_filter
  local config

  local function reload()
    package.loaded["body_filter"] = nil
    package.loaded["agent_pub"] = nil
    package.loaded["util"] = nil
    package.loaded["config"] = nil
    config = require("config")
    body_filter = require("body_filter")
  end

  it("injects topbar after body on root path", function()
    ngx_mock.setup({
      var = { uri = "/" },
      header = { ["Content-Type"] = "text/html" },
      ctx = { userInfo = { username = "u1", nickname = "N1" } },
      arg = { [1] = "<html><body>hi</body></html>" },
    })
    reload()
    body_filter.run()
    local body = ngx.arg[1]
    assert.is_truthy(string.find(body, "rbac-topbar", 1, true))
    assert.is_truthy(string.find(body, "u1", 1, true))
    assert.is_true(ngx.ctx.topbar_added)
    ngx_mock.mark_branch("body_filter.html_inject_root")
  end)

  it("injects via rbac marker on non-root path", function()
    ngx_mock.setup({
      var = { uri = "/app/index" },
      header = { ["Content-Type"] = "text/html" },
      ctx = { userInfo = { username = "u2", nickname = "N2" } },
      arg = { [1] = '<div id="rbac" style="display:none"></div><p>x</p>' },
    })
    reload()
    body_filter.run()
    assert.is_truthy(string.find(ngx.arg[1], "rbac-topbar", 1, true))
    -- n stays nil on this branch → topbar_added false
    assert.is_false(ngx.ctx.topbar_added)
    ngx_mock.mark_branch("body_filter.html_inject_marker")
  end)

  it("ignores when need_replace false", function()
    ngx_mock.setup({
      var = { uri = "/page" },
      header = { ["Content-Type"] = "application/json" },
      arg = { [1] = '{"a":1}' },
    })
    reload()
    body_filter.run()
    assert.are.equal('{"a":1}', ngx.arg[1])
    ngx_mock.mark_branch("body_filter.ignore")
  end)

  it("disallows change password when configured", function()
    ngx_mock.setup({
      var = { uri = "/dir/" },
      header = { ["Content-Type"] = "text/html" },
      ctx = { userInfo = { username = "u", nickname = "n" } },
      arg = { [1] = "<body></body>" },
    })
    reload()
    config.not_allow_change_pwd = true
    body_filter.run()
    assert.is_truthy(string.find(ngx.arg[1], "Password change is not allowed", 1, true))
    config.not_allow_change_pwd = nil
    ngx_mock.mark_branch("body_filter.pwd_disallowed")
  end)

  it("reads username from args when no userInfo", function()
    ngx_mock.setup({
      var = {
        uri = "/",
        arg_username = "fromarg",
        arg_nickname = "nickarg",
      },
      header = { ["Content-Type"] = "text/html" },
      ctx = {},
      arg = { [1] = "<body>x</body>" },
    })
    reload()
    body_filter.run()
    assert.is_truthy(string.find(ngx.arg[1], "fromarg", 1, true))
    assert.is_truthy(string.find(ngx.arg[1], "nickarg", 1, true))
    ngx_mock.mark_branch("body_filter.username_from_args")
  end)

  it("get_style and get_infobar defaults", function()
    ngx_mock.setup({
      var = { uri = "/" },
      ctx = {},
    })
    reload()
    assert.is_truthy(string.find(body_filter.get_style(), "rbac-topbar", 1, true))
    local ok, bar = body_filter.get_infobar()
    assert.is_true(ok)
    assert.is_truthy(string.find(bar, "NONE", 1, true))
  end)
end)
