describe("basic_auth_access_check", function()
  local basic_auth

  local function reload()
    package.loaded["basic_auth_access_check"] = nil
    package.loaded["util"] = nil
    package.loaded["json"] = nil
    package.loaded["agent_pub"] = nil
    package.loaded["config"] = nil
    basic_auth = require("basic_auth_access_check")
  end

  it("ignore url clears forged headers", function()
    ngx_mock.setup({
      var = { uri = "/x.css" },
      req_headers = { ["X-Username"] = "evil" },
    })
    reload()
    basic_auth.run()
    assert.is_true(#ngx_mock.state().cleared_headers >= 1)
    ngx_mock.mark_branch("basic_auth.ignore_url")
    ngx_mock.mark_branch("basic_auth.clear_forged_headers")
  end)

  it("missing Authorization issues WWW-Authenticate challenge", function()
    ngx_mock.setup({
      var = { uri = "/api/x", loginPrompt = "Wolf Login", appID = "app1" },
      req_headers = {},
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.are.equal(401, err.status)
    assert.are.equal('Basic realm="Wolf Login"', ngx.header["WWW-Authenticate"])
    ngx_mock.mark_branch("basic_auth.no_authorization_challenge")
  end)

  it("uses default loginPrompt when unset", function()
    ngx_mock.setup({
      var = { uri = "/api/x" },
      req_headers = {},
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.is_truthy(string.find(ngx.header["WWW-Authenticate"], "input you username", 1, true))
  end)

  it("capture nil returns 503", function()
    ngx_mock.setup({
      var = { uri = "/api/x" },
      req_headers = { Authorization = "Basic abc" },
      capture_fn = function()
        return nil
      end,
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.are.equal(503, err.status)
    ngx_mock.mark_branch("basic_auth.capture_nil_503")
  end)

  it("retries 5xx then sets headers and Set-Cookie", function()
    local user = { id = 3, username = "carol", nickname = "C" }
    local n = 0
    ngx_mock.setup({
      var = { uri = "/api/x", server_port = "8080" },
      req_headers = { Authorization = "Basic abc" },
      capture_fn = function()
        n = n + 1
        if n == 1 then
          return { status = 500, body = "err", headers = {} }
        end
        return ngx_mock.capture_ok(user, { ["Set-Cookie"] = "sid=1" })
      end,
    })
    reload()
    local ok = ngx_mock.pcall_run(basic_auth.run)
    assert.is_true(ok)
    local st = ngx_mock.state()
    assert.are.equal(3, st.set_headers["X-UserId"])
    assert.are.equal("carol", st.set_headers["X-Username"])
    assert.are.equal("sid=1", ngx.header["Set-Cookie"])
    ngx_mock.mark_branch("basic_auth.retry_5xx")
    ngx_mock.mark_branch("basic_auth.ok_set_headers")
    ngx_mock.mark_branch("basic_auth.set_cookie")
  end)

  it("ERR_TOKEN_INVALID challenges again", function()
    ngx_mock.setup({
      var = { uri = "/api/x", loginPrompt = "realm" },
      req_headers = { Authorization = "Basic abc" },
      capture_results = {
        ngx_mock.capture_err(401, "ERR_TOKEN_INVALID"),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.are.equal(401, err.status)
    assert.are.equal('Basic realm="realm"', ngx.header["WWW-Authenticate"])
    ngx_mock.mark_branch("basic_auth.token_invalid_challenge")
  end)

  it("403 redirects to no_permission.html", function()
    ngx_mock.setup({
      var = { uri = "/api/x" },
      req_headers = { Authorization = "Basic abc" },
      capture_results = {
        ngx_mock.capture_err(403, "NO", { id = 1, username = "u", nickname = "n" }),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.are.equal(302, err.status)
    assert.is_truthy(string.find(ngx.header["Location"], "no_permission.html", 1, true))
    ngx_mock.mark_branch("basic_auth.403_redirect")
  end)

  it("403 on root still uses no_permission.html", function()
    ngx_mock.setup({
      var = { uri = "/" },
      req_headers = { Authorization = "Basic abc" },
      capture_results = {
        ngx_mock.capture_err(403, "NO", { id = 1, username = "u", nickname = "n" }),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.is_truthy(string.find(ngx.header["Location"], "no_permission.html", 1, true))
  end)

  it("json fail on non-200", function()
    ngx_mock.setup({
      var = { uri = "/api/x" },
      req_headers = { Authorization = "Basic abc" },
      capture_results = {
        { status = 401, body = "broken", headers = {} },
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    -- reason not ERR_TOKEN_INVALID → redirect
    assert.are.equal(302, err.status)
    ngx_mock.mark_branch("basic_auth.json_fail")
  end)

  it("400 maps to 500", function()
    ngx_mock.setup({
      var = { uri = "/api/x" },
      req_headers = { Authorization = "Basic abc" },
      capture_results = {
        ngx_mock.capture_err(400, "bad"),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.are.equal(500, err.status)
    ngx_mock.mark_branch("basic_auth.bad_request_500")
  end)

  it("other status deny", function()
    ngx_mock.setup({
      var = { uri = "/api/x" },
      req_headers = { Authorization = "Basic abc" },
      capture_results = {
        { status = 429, body = '{"reason":"rate","data":{}}', headers = {} },
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(basic_auth.run)
    assert.is_false(ok)
    assert.are.equal(429, err.status)
  end)

  it("get_host_port and url_args_as_args", function()
    ngx_mock.setup({
      var = { uri = "/z", host = "h", server_port = "80", scheme = "http" },
      uri_args = {},
      req_headers = { Authorization = "Basic x" },
    })
    reload()
    -- server_port is a string in nginx; only numeric 80 suppresses ":port"
    assert.are.equal("http://h:80", basic_auth.get_host_port())
    local args = basic_auth.url_args_as_args({ k = "v" })
    assert.are.equal("v", args.k)
    assert.are.equal("http://h:80/z", args.return_to)
  end)

  it("200 invalid json ok path", function()
    ngx_mock.setup({
      var = { uri = "/api/x" },
      req_headers = { Authorization = "Basic abc" },
      capture_results = {
        { status = 200, body = "x", headers = {} },
      },
    })
    reload()
    assert.is_true(ngx_mock.pcall_run(basic_auth.run))
  end)
end)
