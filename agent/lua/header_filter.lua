local agent_pub = require("agent_pub")

local _M = {}

function _M.run()
    ngx.log(ngx.INFO, "url:", ngx.var.uri)
    if agent_pub.need_replace() then
        ngx.header.content_length = nil
    else
        ngx.log(ngx.INFO, "---- ignore url: ", ngx.var.uri);
    end
end

return _M
