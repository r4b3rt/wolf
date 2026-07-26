describe("access_check", function()
  local access_check
  local config

  local function reload()
    package.loaded["access_check"] = nil
    package.loaded["util"] = nil
    package.loaded["json"] = nil
    package.loaded["agent_pub"] = nil
    package.loaded["config"] = nil
    config = require("config")
    access_check = require("access_check")
  end

  local function with_token(token)
    return "x-rbac-token=" .. token
  end

  it("ignore url clears forged headers and returns", function()
    ngx_mock.setup({
      var = { uri = "/favicon.ico", http_cookie = with_token("t") },
      req_headers = { ["X-UserId"] = "evil" },
    })
    reload()
    access_check.run()
    local st = ngx_mock.state()
    assert.is_true(#st.cleared_headers >= 1)
    ngx_mock.mark_branch("access_check.ignore_url")
    ngx_mock.mark_branch("access_check.clear_forged_headers")
  end)

  it("no token redirects to login", function()
    ngx_mock.setup({
      var = {
        uri = "/api/x",
        host = "example.com",
        server_port = "8080",
        scheme = "https",
        http_cookie = "",
        appID = "app1",
      },
      uri_args = { q = "1" },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(302, err.status)
    assert.is_truthy(string.find(ngx.header["Location"], "/wolf/rbac/login.html", 1, true))
    ngx_mock.mark_branch("access_check.no_token")
  end)

  it("logouted token redirects to login", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("logouted"), appID = "app1" },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(302, err.status)
    ngx_mock.mark_branch("access_check.logouted_token")
  end)

  it("capture nil returns 503 fail-closed", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("tok") },
      capture_results = { nil, nil, nil },
      capture_fn = function()
        return nil
      end,
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(503, err.status)
    assert.are.equal(3, #ngx_mock.state().capture_calls)
    ngx_mock.mark_branch("access_check.capture_nil_503")
  end)

  it("retries on 5xx then succeeds and sets identity headers", function()
    local user = { id = 7, username = "alice", nickname = "Alice" }
    local n = 0
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("tok"), server_port = "80" },
      capture_fn = function()
        n = n + 1
        if n < 3 then
          return { status = 502, body = "bad gateway", headers = {} }
        end
        return ngx_mock.capture_ok(user, { ["Set-Cookie"] = "x-rbac-token=new; Path=/" })
      end,
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_true(ok)
    assert.is_nil(err)
    local st = ngx_mock.state()
    assert.are.equal(3, #st.capture_calls)
    assert.are.equal(7, st.set_headers["X-UserId"])
    assert.are.equal("alice", st.set_headers["X-Username"])
    assert.is_not_nil(st.set_headers["X-nickname"])
    assert.are.equal("x-rbac-token=new; Path=/", ngx.header["Set-Cookie"])
    ngx_mock.mark_branch("access_check.retry_5xx")
    ngx_mock.mark_branch("access_check.ok_set_headers")
    ngx_mock.mark_branch("access_check.set_cookie")
  end)

  it("401 ERR_TOKEN_INVALID redirects to login", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("bad") },
      capture_results = {
        ngx_mock.capture_err(401, "ERR_TOKEN_INVALID", { id = 1, username = "u", nickname = "n" }),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(302, err.status)
    assert.is_truthy(string.find(ngx.header["Location"], "/wolf/rbac/login.html", 1, true))
    ngx_mock.mark_branch("access_check.401_login_redirect")
  end)

  it("403 redirects to no_permission", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("tok") },
      capture_results = {
        ngx_mock.capture_err(403, "ERR_NO_PERM", { id = 1, username = "bob", nickname = "B" }),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(302, err.status)
    assert.is_truthy(string.find(ngx.header["Location"], "/wolf/rbac/no_permission?", 1, true))
    ngx_mock.mark_branch("access_check.403_no_permission")
  end)

  it("403 on root uses no_permission.html", function()
    ngx_mock.setup({
      var = { uri = "/", http_cookie = with_token("tok") },
      capture_results = {
        ngx_mock.capture_err(403, "ERR_NO_PERM", { id = 1, username = "bob", nickname = "B" }),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.is_truthy(string.find(ngx.header["Location"], "/wolf/rbac/no_permission.html", 1, true))
    ngx_mock.mark_branch("access_check.403_root_html")
  end)

  it("non-200 json parse failure still denies", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("tok") },
      capture_results = {
        { status = 401, body = "not-json", headers = {} },
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(302, err.status)
    ngx_mock.mark_branch("access_check.json_fail")
  end)

  it("400 maps to 500 deny", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("tok") },
      capture_results = {
        ngx_mock.capture_err(400, "bad", nil),
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(500, err.status)
    ngx_mock.mark_branch("access_check.bad_request_500")
  end)

  it("other status uses deny with that status", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("tok") },
      capture_results = {
        { status = 418, body = '{"reason":"teapot","data":{}}', headers = {} },
      },
    })
    reload()
    local ok, err = ngx_mock.pcall_run(access_check.run)
    assert.is_false(ok)
    assert.are.equal(418, err.status)
    ngx_mock.mark_branch("access_check.other_deny")
  end)

  it("get_token returns nil when cookie new fails", function()
    ngx_mock.setup({ var = { uri = "/api/x", http_cookie = "x=1" } })
    package.loaded["resty.cookie"] = {
      new = function()
        return nil, "boom"
      end,
    }
    reload()
    assert.is_nil(access_check.get_token())
  end)

  it("200 with invalid json still ok without identity headers", function()
    ngx_mock.setup({
      var = { uri = "/api/x", http_cookie = with_token("tok") },
      capture_results = {
        { status = 200, body = "not-json", headers = {} },
      },
    })
    reload()
    local ok = ngx_mock.pcall_run(access_check.run)
    assert.is_true(ok)
    assert.is_nil(ngx_mock.state().set_headers["X-UserId"])
  end)

  it("url_args_as_args merges ext args and host port", function()
    ngx_mock.setup({
      var = {
        uri = "/p",
        host = "h",
        server_port = "443",
        scheme = "https",
      },
      uri_args = { a = "1" },
    })
    reload()
    local args = access_check.url_args_as_args({ b = "2" })
    assert.are.equal("https://h:443/p", args.return_to)
    assert.are.equal("1", args.a)
    assert.are.equal("2", args.b)
  end)
end)
