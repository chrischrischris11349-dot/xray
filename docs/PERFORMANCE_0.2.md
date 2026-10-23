# Performance measurements — XRay 0.2

Measured locally on October 22, 2026 with Node v22.14.0; synthetic workloads; medians of 7 runs. The final run was taken after native compilation finished. These isolate XRay-owned code, without making network requests or sending Discord messages.

| Workload | Before | After | Ratio |
| --- | ---: | ---: | ---: |
| Search: 5,000 entries, 9 queries | 117.27 ms | 42.17 ms | 2.78× |
| DOM observer: 1,001 overlapping additions, 12 watchers | 34.02 ms | 6.06 ms | 5.61× |
| Subtree scans in that observer batch | 12,012 | 12 | 1,001× fewer |
| Minified XRay core bytes | 296,505 | 306,436 | +3.35% |
| Equicord bytes | 2,518,449 | 2,518,449 | unchanged |

The bundle grew because this release adds functionality. Search ordering and scoring remain the same; cached normalization helps subsequent keystrokes over the same gathered entries. Observer figures describe overlapping added subtrees, where coalescing helps most; disjoint additions do not get the same ratio. Real message-row tests also verify that 100 unchanged refreshes preserve the existing nodes and their state.

Reproduce with `node core/test/performance.mjs`. Absolute timings vary with machine load. These do not measure startup, time to interactive, network requests, long-session memory, incoming voice or encoded screen-share FPS. A matched comparison against Discord/Vencord/other clients remains unmeasured. Do not treat these ratios as whole-app speedups.
