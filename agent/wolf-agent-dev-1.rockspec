package = "wolf-agent-dev"
version = "1"
source = {
   url = "..."
}
description = {
   summary = "Dev/test dependencies for wolf OpenResty agent",
   license = "MIT"
}
dependencies = {
   "lua >= 5.1",
   "busted",
   "luacov",
   "lua-cjson",
}
build = {
   type = "builtin",
   modules = {}
}
