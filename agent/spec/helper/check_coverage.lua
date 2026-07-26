#!/usr/bin/env lua
--[[
  Enforce agent unit-test coverage gates:
  - line coverage ≥ 95% for agent lua/ modules (excl. resty/, *_main.lua)
  - required branch case matrix all executed (spec/.branch_hits)
]]

local LINE_THRESHOLD = 95
local REPORT = "luacov.report.out"
local BRANCH_HITS_FILE = "spec/.branch_hits"

-- Branch cases that must be exercised by table-driven unit specs.
local BRANCH_MATRIX = {
  -- access_check
  "access_check.ignore_url",
  "access_check.no_token",
  "access_check.logouted_token",
  "access_check.capture_nil_503",
  "access_check.retry_5xx",
  "access_check.ok_set_headers",
  "access_check.401_login_redirect",
  "access_check.403_no_permission",
  "access_check.403_root_html",
  "access_check.json_fail",
  "access_check.set_cookie",
  "access_check.clear_forged_headers",
  "access_check.bad_request_500",
  "access_check.other_deny",
  -- basic_auth_access_check
  "basic_auth.ignore_url",
  "basic_auth.no_authorization_challenge",
  "basic_auth.capture_nil_503",
  "basic_auth.retry_5xx",
  "basic_auth.ok_set_headers",
  "basic_auth.token_invalid_challenge",
  "basic_auth.403_redirect",
  "basic_auth.json_fail",
  "basic_auth.set_cookie",
  "basic_auth.clear_forged_headers",
  "basic_auth.bad_request_500",
  -- filters
  "header_filter.clear_content_length",
  "header_filter.ignore",
  "body_filter.html_inject_root",
  "body_filter.html_inject_marker",
  "body_filter.ignore",
  "body_filter.pwd_disallowed",
  "body_filter.username_from_args",
}

local EXPECTED_FILES = {
  "lua/access_check.lua",
  "lua/basic_auth_access_check.lua",
  "lua/body_filter.lua",
  "lua/header_filter.lua",
  "lua/agent_pub.lua",
  "lua/config.lua",
  "lua/json.lua",
  "lua/util.lua",
}

local function read_file(path)
  local f = io.open(path, "r")
  if not f then
    return nil
  end
  local data = f:read("*a")
  f:close()
  return data
end

local function is_agent_lua(filename)
  if not string.find(filename, "lua/", 1, true) then
    return false
  end
  if string.find(filename, "lua/resty/", 1, true) then
    return false
  end
  if string.find(filename, "_main.lua", 1, true) then
    return false
  end
  -- only project-relative lua/ paths (not /usr/.../lua/...)
  if string.sub(filename, 1, 4) == "lua/" then
    return true
  end
  if string.find(filename, "/opt/wolf/agent/lua/", 1, true) then
    return true
  end
  return false
end

local function parse_agent_coverage(report)
  local files = {}
  local in_summary = false
  local total_hits, total_missed = 0, 0

  for line in string.gmatch(report, "[^\r\n]+") do
    if string.match(line, "^Summary%s*$") or string.match(line, "^File%s+Hits") then
      in_summary = true
    end
    if in_summary then
      -- lua/foo.lua   133  0  100.00%
      local file, hits, missed, pct = string.match(
        line,
        "^%s*(%S+%.lua)%s+(%d+)%s+(%d+)%s+([%d%.]+)%%"
      )
      if file and is_agent_lua(file) then
        hits = tonumber(hits)
        missed = tonumber(missed)
        pct = tonumber(pct)
        files[file] = { hits = hits, missed = missed, pct = pct }
        total_hits = total_hits + hits
        total_missed = total_missed + missed
      end
    end
  end

  local total_lines = total_hits + total_missed
  local total_pct = 0
  if total_lines > 0 then
    total_pct = (total_hits / total_lines) * 100
  end
  return total_pct, files, total_hits, total_missed
end

local function parse_branch_hits(data)
  local hits = {}
  if not data then
    return hits
  end
  for line in string.gmatch(data, "[^\r\n]+") do
    line = string.match(line, "^%s*(.-)%s*$")
    if line and line ~= "" then
      hits[line] = true
    end
  end
  return hits
end

local function basename_key(path)
  local name = string.match(path, "lua/[^/]+%.lua$")
  return name or path
end

local function main()
  local report = read_file(REPORT)
  if not report then
    io.stderr:write("ERROR: missing " .. REPORT .. " — run `busted -c && luacov` first\n")
    os.exit(1)
  end

  local line_pct, files, hits, missed = parse_agent_coverage(report)
  if hits == 0 and missed == 0 then
    io.stderr:write("ERROR: no agent lua/ files found in " .. REPORT .. " summary\n")
    os.exit(1)
  end

  print("Agent files:")
  for _, expected in ipairs(EXPECTED_FILES) do
    local info = files[expected]
    if not info then
      -- try suffix match
      for path, data in pairs(files) do
        if basename_key(path) == expected then
          info = data
          break
        end
      end
    end
    if info then
      print(string.format("  %-40s %6.2f%%  (%d hits, %d missed)",
        expected, info.pct, info.hits, info.missed))
    else
      print(string.format("  %-40s MISSING from report", expected))
    end
  end

  print(string.format("Line coverage (agent lua/): %.2f%% (threshold %d%%) [%d hits / %d missed]",
    line_pct, LINE_THRESHOLD, hits, missed))

  local failed = false
  if line_pct + 1e-9 < LINE_THRESHOLD then
    io.stderr:write(string.format("FAIL: line coverage %.2f%% < %d%%\n", line_pct, LINE_THRESHOLD))
    failed = true
  else
    print("PASS: line coverage threshold met")
  end

  local branch_hits = parse_branch_hits(read_file(BRANCH_HITS_FILE))
  local missing = {}
  for _, name in ipairs(BRANCH_MATRIX) do
    if not branch_hits[name] then
      missing[#missing + 1] = name
    end
  end

  print(string.format("Branch matrix: %d/%d cases hit",
    #BRANCH_MATRIX - #missing, #BRANCH_MATRIX))

  if #missing > 0 then
    io.stderr:write("FAIL: missing branch cases:\n")
    for _, name in ipairs(missing) do
      io.stderr:write("  - " .. name .. "\n")
    end
    failed = true
  else
    print("PASS: branch case matrix complete")
  end

  if failed then
    os.exit(1)
  end
  print("check_coverage: OK")
  os.exit(0)
end

main()
