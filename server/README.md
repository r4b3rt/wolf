
# run

```
pnpm run start
```

# run unit tests

```
pnpm run test
pnpm run test:all      # includes AI integration tests (needs AI API Key)
pnpm run test4redis    # Redis cache path
```

Coverage report: `coverage/index.html`

Current coverage (`pnpm run test:all`):

| Metric | Coverage | Threshold |
|------|--------|-----------|
| Statements | 96.9% | ≥95% |
| Branches | 90.2% | ≥90% |
| Functions | 96.01% | ≥95% |
| Lines | 97.06% | ≥95% |

See also: [docs/unittest-cn.md](../docs/unittest-cn.md) / [docs/unittest.md](../docs/unittest.md)
