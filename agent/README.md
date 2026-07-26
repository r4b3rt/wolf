
# 单元测试与覆盖率

```bash
make test-docker       # 推荐（openresty alpine + busted/luacov）
make coverage          # 本机已安装 luarocks/busted 时
```

当前覆盖率（`make test-docker`，58 successes）：

| 指标 | 覆盖率 | 阈值 |
|------|--------|------|
| Line（`lua/`） | 99.78% | ≥95% |
| Branch case matrix | 32/32 | 全覆盖 |

排除：`lua/resty/cookie.lua`（第三方）、`*_main.lua`（薄入口）。

详见：[docs/unittest-cn.md](../docs/unittest-cn.md)

# 运行agent代理restful-demo

```bash
docker run -ti --rm --name wolf-agent-demo -p 10094:10094 \
-e BACKEND_URL=http://docker.for.mac.localhost:10090 \
-e RBAC_SERVER_URL=http://docker.for.mac.localhost:12180 \
-e RBAC_APP_ID=restful-demo \
-e AGENT_PORT=10094 \
-e EXTENSION_CONFIG="include /opt/wolf/agent/conf/no-permission-demo.conf;" \
igeeky/wolf-agent

```

# 运行agent代理openresty.org网站

```bash
docker run -ti --rm --name wolf-agent-or -p 10096:10096 \
-e BACKEND_URL=http://openresty.org \
-e RBAC_SERVER_URL=http://docker.for.mac.localhost:12180 \
-e RBAC_APP_ID=openresty \
-e AGENT_PORT=10096 \
igeeky/wolf-agent

```

# 运行agent使用本地配置进行开发测试

```bash
cd path/to/wolf/agent
docker run -ti --rm --name wolf-agent-or-dev -p 10096:10096 \
-e BACKEND_URL=http://openresty.org \
-e RBAC_SERVER_URL=http://docker.for.mac.localhost:12180 \
-e RBAC_APP_ID=openresty \
-e AGENT_PORT=10096 \
-e EXTENSION_CONFIG="include /opt/wolf/agent/conf/no-permission-demo.conf;" \
-e ACCESS_CHECK_LUA="basic_auth_access_check_main.lua" \
-v ./:/opt/wolf/agent \
igeeky/wolf-agent
```