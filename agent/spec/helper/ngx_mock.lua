--[[
  ngx mock + busted helper for wolf agent unit tests.
  Loaded via .busted helper before each suite.
]]

local BRANCH_HITS_FILE = "spec/.branch_hits"

local function url_encode(str)
  if str == nil then
    return nil
  end
  str = tostring(str)
  str = string.gsub(str, "\n", "\r\n")
  str = string.gsub(str, "([^%w%-%.%_%~ ])", function(c)
    return string.format("%%%02X", string.byte(c))
  end)
  str = string.gsub(str, " ", "+")
  return str
end

local function encode_args(args)
  if type(args) ~= "table" then
    return tostring(args or "")
  end
  local parts = {}
  for k, v in pairs(args) do
    if type(v) == "table" then
      for _, item in ipairs(v) do
        parts[#parts + 1] = url_encode(k) .. "=" .. url_encode(item)
      end
    else
      parts[#parts + 1] = url_encode(k) .. "=" .. url_encode(v)
    end
  end
  table.sort(parts)
  return table.concat(parts, "&")
end

local ExitError = {}
ExitError.__index = ExitError

function ExitError.new(status)
  return setmetatable({ status = status, message = "ngx.exit:" .. tostring(status) }, ExitError)
end

function ExitError:__tostring()
  return self.message
end

local M = {
  ExitError = ExitError,
}

local state

local function reset_state(overrides)
  overrides = overrides or {}
  state = {
    var = {
      uri = "/api/demo",
      host = "localhost",
      server_port = "80",
      scheme = "http",
      http_cookie = "",
      appID = "demo-app",
      remote_addr = "127.0.0.1",
      country_code = nil,
      city_name = nil,
      loginPrompt = nil,
      arg_username = nil,
      arg_nickname = nil,
    },
    ctx = {},
    header = {},
    status = 0,
    method = "GET",
    uri_args = {},
    req_headers = {},
    cleared_headers = {},
    set_headers = {},
    arg = { [1] = "" },
    say_buf = {},
    sent_headers = false,
    flushed = false,
    logs = {},
    capture_results = {},
    capture_calls = {},
    capture_fn = nil,
  }

  if overrides.var then
    for k, v in pairs(overrides.var) do
      state.var[k] = v
    end
  end
  if overrides.ctx then
    state.ctx = overrides.ctx
  end
  if overrides.header then
    state.header = overrides.header
  end
  if overrides.method then
    state.method = overrides.method
  end
  if overrides.uri_args then
    state.uri_args = overrides.uri_args
  end
  if overrides.req_headers then
    state.req_headers = overrides.req_headers
  end
  if overrides.arg then
    state.arg = overrides.arg
  end
  if overrides.capture_results then
    state.capture_results = overrides.capture_results
  end
  if overrides.capture_fn then
    state.capture_fn = overrides.capture_fn
  end
end

local function build_ngx()
  local ngx = {
    ERR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
    HTTP_OK = 200,
    HTTP_MOVED_TEMPORARILY = 302,
    HTTP_BAD_REQUEST = 400,
    HTTP_UNAUTHORIZED = 401,
    HTTP_FORBIDDEN = 403,
    HTTP_INTERNAL_SERVER_ERROR = 500,
    HTTP_SERVICE_UNAVAILABLE = 503,
    ExitError = ExitError,
  }

  local var_mt = {
    __index = function(_, k)
      return state.var[k]
    end,
    __newindex = function(_, k, v)
      state.var[k] = v
    end,
  }
  ngx.var = setmetatable({}, var_mt)

  local ctx_mt = {
    __index = function(_, k)
      return state.ctx[k]
    end,
    __newindex = function(_, k, v)
      state.ctx[k] = v
    end,
  }
  ngx.ctx = setmetatable({}, ctx_mt)

  local header_mt = {
    __index = function(_, k)
      return state.header[k]
    end,
    __newindex = function(_, k, v)
      state.header[k] = v
    end,
  }
  ngx.header = setmetatable({}, header_mt)

  local arg_mt = {
    __index = function(_, k)
      return state.arg[k]
    end,
    __newindex = function(_, k, v)
      state.arg[k] = v
    end,
  }
  ngx.arg = setmetatable({}, arg_mt)

  setmetatable(ngx, {
    __index = function(t, k)
      if k == "status" then
        return state.status
      end
      return rawget(t, k)
    end,
    __newindex = function(t, k, v)
      if k == "status" then
        state.status = v
        return
      end
      rawset(t, k, v)
    end,
  })

  ngx.log = function(level, ...)
    local parts = { tostring(level) }
    for i = 1, select("#", ...) do
      parts[#parts + 1] = tostring(select(i, ...))
    end
    state.logs[#state.logs + 1] = table.concat(parts, "")
  end

  ngx.say = function(...)
    local parts = {}
    for i = 1, select("#", ...) do
      parts[#parts + 1] = tostring(select(i, ...))
    end
    state.say_buf[#state.say_buf + 1] = table.concat(parts, "")
  end

  ngx.send_headers = function()
    state.sent_headers = true
  end

  ngx.flush = function()
    state.flushed = true
  end

  ngx.exit = function(status)
    error(ExitError.new(status), 0)
  end

  ngx.encode_args = encode_args

  ngx.escape_uri = function(str)
    if str == nil then
      return nil
    end
    return url_encode(str)
  end

  ngx.req = {
    get_method = function()
      return state.method
    end,
    get_uri_args = function()
      local copy = {}
      for k, v in pairs(state.uri_args) do
        copy[k] = v
      end
      return copy
    end,
    get_headers = function()
      local copy = {}
      for k, v in pairs(state.req_headers) do
        copy[k] = v
      end
      return copy
    end,
    clear_header = function(name)
      state.cleared_headers[#state.cleared_headers + 1] = name
      state.req_headers[name] = nil
      -- also clear case variants commonly used
      for k, _ in pairs(state.req_headers) do
        if string.lower(k) == string.lower(name) then
          state.req_headers[k] = nil
        end
      end
    end,
    set_header = function(name, value)
      state.set_headers[name] = value
      state.req_headers[name] = value
    end,
  }

  ngx.location = {
    capture = function(url)
      state.capture_calls[#state.capture_calls + 1] = url
      if state.capture_fn then
        return state.capture_fn(url, #state.capture_calls)
      end
      local idx = #state.capture_calls
      local res = state.capture_results[idx]
      if res == nil and #state.capture_results > 0 then
        res = state.capture_results[#state.capture_results]
      end
      return res
    end,
  }

  -- Minimal PCRE-like substitute using Lua patterns for unit tests.
  ngx.re = {
    sub = function(subj, regex, replace, _options)
      if subj == nil then
        return subj, 0
      end
      local plain = regex
      -- body tag
      if regex == "\\<body[^\\>]*\\>" then
        local n = 0
        local out = string.gsub(subj, "<body[^>]*>", function(m)
          n = n + 1
          local repl = replace
          if type(replace) == "string" then
            repl = string.gsub(replace, "%$0", m)
          end
          return repl
        end, 1)
        return out, n
      end
      -- rbac placeholder div
      if string.find(regex, 'id="rbac"', 1, true) then
        local needle = '<div id="rbac" style="display:none"></div>'
        local i, j = string.find(subj, needle, 1, true)
        if i then
          local out = string.sub(subj, 1, i - 1) .. replace .. string.sub(subj, j + 1)
          return out, 1
        end
        return subj, 0
      end
      -- fallback: treat as plain find
      local i, j = string.find(subj, plain, 1, true)
      if i then
        local out = string.sub(subj, 1, i - 1) .. replace .. string.sub(subj, j + 1)
        return out, 1
      end
      return subj, 0
    end,
  }

  return ngx
end

-- stub resty.cookie that reads from ngx.var.http_cookie
local function install_cookie_stub()
  local cookie_mod = {}
  function cookie_mod:new()
    return setmetatable({}, { __index = cookie_mod })
  end
  function cookie_mod:get(key)
    local raw = ngx.var.http_cookie or ""
    for part in string.gmatch(raw, "[^;]+") do
      local k, v = string.match(part, "^%s*([^=]+)=(.*)$")
      if k == key then
        return v
      end
    end
    return nil
  end
  package.loaded["resty.cookie"] = cookie_mod
end

function M.setup(overrides)
  reset_state(overrides)
  _G.ngx = build_ngx()
  install_cookie_stub()
  -- clear cached modules that close over ngx or config
  package.loaded["access_check"] = nil
  package.loaded["basic_auth_access_check"] = nil
  package.loaded["body_filter"] = nil
  package.loaded["header_filter"] = nil
  package.loaded["agent_pub"] = nil
  package.loaded["util"] = nil
  package.loaded["json"] = nil
  -- keep config loaded unless explicitly reset; allow override via package.loaded
  return _G.ngx
end

function M.state()
  return state
end

function M.capture_ok(userInfo, headers, reason)
  return {
    status = 200,
    body = require("cjson").encode({
      ok = true,
      reason = reason or "OK",
      data = { userInfo = userInfo },
    }),
    headers = headers or {},
  }
end

function M.capture_err(status, reason, userInfo, headers, raw_body)
  if raw_body then
    return {
      status = status,
      body = raw_body,
      headers = headers or {},
    }
  end
  return {
    status = status,
    body = require("cjson").encode({
      ok = false,
      reason = reason,
      data = { userInfo = userInfo },
    }),
    headers = headers or {},
  }
end

function M.pcall_run(fn, ...)
  local ok, err = pcall(fn, ...)
  if ok then
    return true, nil
  end
  if type(err) == "table" and err.status ~= nil then
    return false, err
  end
  -- ExitError thrown with error(..., 0) may be the object itself
  if getmetatable(err) == ExitError then
    return false, err
  end
  error(err)
end

function M.mark_branch(name)
  assert(type(name) == "string" and name ~= "", "branch name required")
  local f = io.open(BRANCH_HITS_FILE, "a")
  assert(f, "cannot open " .. BRANCH_HITS_FILE)
  f:write(name .. "\n")
  f:close()
end

-- Initialize default ngx for helper load
reset_state()
_G.ngx = build_ngx()
install_cookie_stub()

-- expose helpers globally for specs
_G.ngx_mock = M

return M
