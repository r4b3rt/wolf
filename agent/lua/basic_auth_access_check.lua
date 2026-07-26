local resty_cookie = require("resty.cookie")   -- https://github.com/cloudflare/lua-resty-cookie
local util = require("util")
local json = require("json")
local agent_pub = require("agent_pub")
local config = require("config")

local _M = {}

local no_permission = "/wolf/rbac/no_permission"
local no_permission_html = "/wolf/rbac/no_permission.html"
local basic_auth_access_check_url = "/wolf/rbac/access_check"


function _M.get_authorization()
    local headers = ngx.req.get_headers()
	local authorization = headers["Authorization"]
    return authorization
end

function _M.get_host_port()
    local host = ngx.var.host
    local port = ""
    if ngx.var.server_port and ngx.var.server_port ~= 80 then
        port = ":" .. tostring(ngx.var.server_port)
    end
    local host_port = (ngx.var.scheme or "http") .. "://" .. host .. port
    return host_port
end

function _M.url_args_as_args(ext_args)
	local args = ngx.req.get_uri_args()
    local host_port = _M.get_host_port()

    local full_url = host_port .. ngx.var.uri
	args["return_to"] = full_url
	if ext_args and type(ext_args) == 'table' then
        for k, v in pairs(ext_args) do
			args[k] = v
		end
	end
	return args
end

function _M.check_url_permission(appID, action, resName, clientIP)
    local retry_max = 3
    local reason = nil;
    local userInfo = nil
	local res = nil
    for i = 1, retry_max do
        local args = { appID = appID, resName = resName, action = action, agentName=config.agentName, clientIP=clientIP}
        local url = basic_auth_access_check_url .. "?" .. ngx.encode_args(args)
        res = ngx.location.capture(url)
        if res then
            ngx.log(ngx.INFO, "check permission request:", url, ", status:", res.status, ",body:", tostring(res.body))
            if res.status < 500 then
                break
            else
                ngx.log(ngx.ERR, string.format("request [curl -v %s] failed! status:%d", url, res.status))
            end
        else
            reason = 'check permission failed, check request failed!'
            ngx.log(ngx.ERR, "fail request: ", url)
        end
    end
    if not res then
        -- Wolf 不可达：必须 fail-closed，不能让请求落到上游。
        ngx.log(ngx.ERR, "wolf server unreachable after ", retry_max,
            " retries, deny request. resName:", resName)
        return false, ngx.HTTP_SERVICE_UNAVAILABLE, reason or 'wolf server unreachable'
    end


    if res.status ~= 200 then
    	local strBody = util.trim(res.body or "")
        local body, err = json.loads(strBody)
	    if err then
            userInfo = res.body
            reason = 'check permission failed! parse response json failed!'
        else
            reason = body.reason
	    end

        return false, res.status, reason, userInfo, res.headers
    else
    	local body, err = json.loads(res.body)
	    if err then
            userInfo = res.body
            reason = 'check permission failed! parse response json failed!'
            ngx.log(ngx.ERR, "json.loads(", res.body, ") failed! err:", err)
        else
            userInfo = body.data.userInfo
            reason = body.reason
        end

    	return true, res.status, reason, userInfo, res.headers
    end
end


function _M.url_redirect(url, args)
    local appID = ngx.var.appID or "appIDUnset"
    args.appid = appID
    args = ngx.encode_args(args)
    util.redirect(url, args)
end

-- 返回 Basic Auth challenge 并终止请求。
function _M.basic_auth_challenge(loginPrompt)
    ngx.status = ngx.HTTP_UNAUTHORIZED
    ngx.header["WWW-Authenticate"] = "Basic realm=\"" .. loginPrompt .. "\""
    ngx.send_headers()
    ngx.flush(true)
    return ngx.exit(ngx.HTTP_UNAUTHORIZED)
end

-- 在 access 阶段发送错误响应并终止请求。
-- 必须 ngx.exit，否则 nginx 会继续进入 content 阶段并 proxy_pass（fail-open）。
function _M.deny(status, message)
    ngx.status = status
    ngx.header["Content-Type"] = "text/plain"
    ngx.send_headers()
    ngx.flush(true)
    ngx.say(message)
    ngx.flush(true)
    return ngx.exit(status)
end

function _M.run()
    local url = ngx.var.uri
    local action = ngx.req.get_method()

    -- 身份头由本模块在鉴权成功后写入，任何客户端传入的同名头都必须先丢弃，
    -- 否则忽略列表（静态资源）等提前返回的路径会把伪造的身份透传给上游。
    util.clear_identity_headers()

	if util.url_in_ignore_list(url) then
		ngx.log(ngx.INFO, "check permission, ignore current request!")
		return
	end

    local appID = ngx.var.appID or "appIDUnset"
    local loginPrompt = ngx.var.loginPrompt or "input you username and password"
    local clientIP = util.clientIP()
    local permItem = "{appID: " .. appID .. ", action: " .. action .. ", url: " .. url .. ", clientIP: " .. clientIP .. "}"
	ngx.log(ngx.INFO, "Cookie: ", ngx.var.http_cookie, ", permItem=", permItem)

	local authorization = _M.get_authorization()
	if authorization == nil then
		ngx.log(ngx.WARN, "no permission to access ", permItem, ", need login!")
        return _M.basic_auth_challenge(loginPrompt)
	end

    local ok, status, reason, userInfo, headers = _M.check_url_permission(appID, action, url, clientIP)
	ngx.log(ngx.INFO, " check_url_permission(", permItem, ")=",
        ok, ", status:", tostring(status), ", userInfo:", tostring(json.dumps(userInfo)))

    local userID = -1
	local username = nil
    local nickname = nil
    if type(userInfo) == 'table' then
		ngx.ctx.userInfo = userInfo
        userID = userInfo.id
		username = userInfo.username
        nickname = userInfo.nickname
        -- 只有鉴权通过才把身份透传给上游；失败路径不写头。
        if ok then
            ngx.req.set_header("X-UserId", userInfo.id)
            ngx.req.set_header("X-Username", userInfo.username)
            ngx.req.set_header("X-nickname", ngx.escape_uri(userInfo.nickname) or userInfo.username)
        end
	end
	if headers and headers["Set-Cookie"] then
		local cookie_value = headers["Set-Cookie"]
		ngx.header['Set-Cookie'] = cookie_value
		ngx.log(ngx.INFO, "******* Re Set-Cookie:", cookie_value, " *******")
    end
	if ok then
		---
	else
		-- no permission.
		if status == ngx.HTTP_UNAUTHORIZED or status == ngx.HTTP_FORBIDDEN then
			if reason == "ERR_TOKEN_INVALID" then
                return _M.basic_auth_challenge(loginPrompt)
            else
                local redirect_url = no_permission_html
                if url == '/' then
                    redirect_url = no_permission_html
                end
                return _M.url_redirect(redirect_url, { username = username, reason=reason })
            end
        elseif status == ngx.HTTP_BAD_REQUEST then
            return _M.deny(ngx.HTTP_INTERNAL_SERVER_ERROR,
                "rbac check permission failed! status:" .. tostring(status))
		else
            return _M.deny(status or ngx.HTTP_FORBIDDEN,
                "rbac check permission failed! status:" .. tostring(status))
		end
	end
end

return _M
