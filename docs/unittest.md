
### Execute unit tests

#### Server (Node / Mocha / nyc)

```bash
cd wolf/server
pnpm run test          # unit/integration tests + coverage gate
pnpm run test:all      # includes AI integration tests (requires AI API Key; RUN_AI_TESTS=yes)
pnpm run test4redis    # Redis cache path (MEM_CACHE_BY_REDIS=yes)
```

When all tests pass, HTML/lcov reports are written under `server/coverage`. `nyc` enforces coverage thresholds (Statements/Lines/Functions ≥95%, Branches ≥90%); the command exits non-zero if thresholds are not met.

Current coverage (`pnpm run test:all`, ~1038 passing):

| Metric | Coverage |
|------|--------|
| Statements | 96.9% |
| Branches | 90.2% |
| Functions | 96.01% |
| Lines | 97.06% |

Note: `src/util/radixtree.js` (broken `rou3` dependency; production uses `rax-radix-tree`) is excluded from the coverage gate.

| ![Coverage - Overview](./imgs/screenshot/coverage-overview.png) |
|:--:|
| *Coverage - Overview* |


| ![Coverage - Detail](./imgs/screenshot/coverage-detail.png) |
|:--:|
| *Coverage - Detail* |

#### Agent (OpenResty Lua / busted / luacov)

```bash
cd wolf/agent
make test-docker       # recommended: run in openresty alpine (same runtime as production)
# or locally if luarocks/busted are installed:
make coverage
```

Current coverage (`make test-docker`, 58 successes):

| Metric | Coverage |
|------|--------|
| Line (agent `lua/`) | 99.78% |
| Branch case matrix | 32/32 |

Note: vendored `lua/resty/cookie.lua` and thin entry files `*_main.lua` are excluded from the coverage gate.
