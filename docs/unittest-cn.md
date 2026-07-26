
### 执行单元测试

#### Server（Node / Mocha / nyc）

```bash
cd wolf/server
pnpm run test          # 常规单元/集成测试 + 覆盖率门禁
pnpm run test:all      # 含 AI 集成测试（需配置 AI API Key，RUN_AI_TESTS=yes）
pnpm run test4redis    # Redis 缓存路径（MEM_CACHE_BY_REDIS=yes）
```

执行完成后，若测试全部成功，会在 `server/coverage` 生成 HTML/lcov 报告；`nyc` 会强制检查覆盖率阈值（Statements/Lines/Functions ≥95%，Branches ≥90%），未达标则命令非 0 退出。

当前覆盖率（`pnpm run test:all`，约 1038 passing）：

| 指标 | 覆盖率 |
|------|--------|
| Statements | 96.9% |
| Branches | 90.2% |
| Functions | 96.01% |
| Lines | 97.06% |

说明：`src/util/radixtree.js`（已失效的 `rou3` 依赖，生产使用 `rax-radix-tree`）不计入覆盖率阈值。

| ![覆盖率-概览](./imgs/screenshot/coverage-overview.png) |
|:--:|
| *覆盖率-概览* |


| ![覆盖率-详情](./imgs/screenshot/coverage-detail.png) |
|:--:|
| *覆盖率-详情* |

#### Agent（OpenResty Lua / busted / luacov）

```bash
cd wolf/agent
make test-docker       # 推荐：与生产同 openresty alpine 镜像跑用例 + 覆盖率
# 或本机已装 luarocks/busted 时：
make coverage
```

当前覆盖率（`make test-docker`，58 successes）：

| 指标 | 覆盖率 |
|------|--------|
| Line（agent `lua/`） | 99.78% |
| Branch case matrix | 32/32 |

说明：第三方 vendored 文件 `lua/resty/cookie.lua` 与薄入口 `*_main.lua` 不计入覆盖率阈值。
