describe("util", function()
  local util
  local config

  before_each(function()
    ngx_mock.setup({
      var = { uri = "/x", remote_addr = "10.0.0.1" },
      req_headers = {},
    })
    package.loaded["config"] = nil
    package.loaded["util"] = nil
    config = require("config")
    util = require("util")
  end)

  it("ifnull / trim / replace / startswith / endswith", function()
    assert.are.equal("d", util.ifnull(nil, "d"))
    assert.are.equal("v", util.ifnull("v", "d"))
    assert.are.equal("ab", util.trim("  ab  "))
    assert.are.equal("axc", util.replace("abc", "b", "x"))
    assert.is_true(util.startswith("hello", "he"))
    assert.is_true(util.startswith("hello", ""))
    assert.is_false(util.startswith("hello", "x"))
    assert.is_true(util.endswith("hello", "lo"))
    assert.is_true(util.endswith("hello", ""))
    assert.is_false(util.endswith("hello", "x"))
  end)

  it("split by delimiter chars", function()
    local parts = util.split("a,b;c", ",;")
    assert.are.same({ "a", "b", "c" }, parts)
  end)

  it("redirect sets Location and exits 302", function()
    local ok, err = ngx_mock.pcall_run(function()
      util.redirect("/login", "a=1")
    end)
    assert.is_false(ok)
    assert.are.equal(302, err.status)
    assert.are.equal("/login?a=1", ngx.header["Location"])
  end)

  it("redirect without args", function()
    local ok, err = ngx_mock.pcall_run(function()
      util.redirect("/login")
    end)
    assert.is_false(ok)
    assert.are.equal("/login", ngx.header["Location"])
  end)

  it("clear_identity_headers clears forged identity", function()
    ngx_mock.setup({
      req_headers = {
        ["X-UserId"] = "1",
        ["X-Username"] = "u",
        ["X-nickname"] = "n",
      },
    })
    package.loaded["util"] = nil
    util = require("util")
    util.clear_identity_headers()
    local st = ngx_mock.state()
    assert.is_true(#st.cleared_headers >= 3)
  end)

  it("url_in_ignore_list equals/suffix/prefix and nil list", function()
    assert.is_true(util.url_in_ignore_list("/favicon.ico"))
    assert.is_true(util.url_in_ignore_list("/a/b.js"))
    assert.is_true(util.url_in_ignore_list("/x.css"))
    assert.is_false(util.url_in_ignore_list("/api/demo"))

    config.ignore_list.prefix = { "/demo" }
    assert.is_true(util.url_in_ignore_list("/demo/x"))

    local saved = config.ignore_list
    config.ignore_list = nil
    assert.is_false(util.url_in_ignore_list("/favicon.ico"))
    config.ignore_list = saved

    -- non-table fields
    config.ignore_list = { equals = "x", suffix = "y", prefix = "z" }
    assert.is_false(util.url_in_ignore_list("/favicon.ico"))
    config.ignore_list = saved
  end)

  it("localtime formats seconds", function()
    local s = util.localtime(0, "!%Y")
    assert.is_string(s)
    local s2 = util.localtime("1")
    assert.is_string(s2)
  end)

  it("clientIP prefers x-forwarded-for then x-real-ip then remote_addr", function()
    ngx_mock.setup({
      var = { remote_addr = "9.9.9.9", country_code = "CN", city_name = "SZ" },
      req_headers = { ["x-forwarded-for"] = "1.1.1.1" },
    })
    package.loaded["util"] = nil
    util = require("util")
    local ip, cc, city = util.clientIP()
    assert.are.equal("1.1.1.1", ip)
    assert.are.equal("CN", cc)
    assert.are.equal("SZ", city)

    ngx_mock.setup({
      var = { remote_addr = "9.9.9.9" },
      req_headers = { ["x-real-ip"] = "2.2.2.2" },
    })
    package.loaded["util"] = nil
    util = require("util")
    assert.are.equal("2.2.2.2", util.clientIP())

    ngx_mock.setup({
      var = { remote_addr = "9.9.9.9" },
      req_headers = {},
    })
    package.loaded["util"] = nil
    util = require("util")
    assert.are.equal("9.9.9.9", util.clientIP())

    ngx_mock.setup({
      var = { remote_addr = "9.9.9.9" },
      req_headers = { ["x-forwarded-for"] = { "a", "b" } },
    })
    package.loaded["util"] = nil
    util = require("util")
    assert.are.equal("b", util.clientIP())
  end)
end)
