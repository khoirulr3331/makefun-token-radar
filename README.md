# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/khoirulr3331/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/khoirulr3331/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol by what its launch would be worth, and shows how to farm each one. It reads a sealed DefiLlama snapshot, fits a valuation curve on the live-token protocols at run time (log market cap on log TVL, with a category tilt from live comparables), validates the model held-out against the market, and writes a static dashboard: a sortable, filterable board, a detail view per protocol with the model's own breakdown, a live-token view and a comparables table. The board covers the whole 40-protocol watchlist and adds every other rankable pre-token protocol the snapshot holds (198 rows), each with a seven-step farm plan carrying its costs and times.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, and `dossier.json` with the vendored `vendor/makefun-board.ts`. Two runs write the same bytes.

---
<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
