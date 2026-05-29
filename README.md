# Skewb Ultimate Solver Lab

A browser-based 3D visualizer and solver for the [Skewb Ultimate](https://www.jaapsch.net/puzzles/ultimate.htm) — a dodecahedral twisty puzzle with 12 colors and roughly 100 million reachable states.

## What it does

- Renders the puzzle as individual movable pieces with accurate dodecahedron geometry
- Animates physical 120° turns around the four fixed-corner axes
- Solves scrambles using multiple algorithms and animates the solution step by step
- Lets you enter your real physical cube's colors and solve it directly ("My Cube" mode)
- Shares scrambles via URL hash so you can send a specific position to someone

## Algorithms

Four solvers are available from the dropdown, each with different tradeoffs:

| Algorithm | Approach | Good for |
|---|---|---|
| Bidirectional BFS | Expand forward from start and backward from goal, meet in the middle | Short scrambles, guaranteed shortest solution |
| IDA\* | Iterative deepening with an admissible heuristic | Medium scrambles without BFS memory cost |
| Bidirectional IDA\* | Split the depth budget and match forward/backward frontiers | Deeper scrambles, best practical performance |
| Depth-Limited DFS | Plain DFS with a depth cap | Reference baseline |

The IDA\* heuristic combines two independent lower bounds: an exact piece-permutation distance (precomputed by BFS over permutations, ignoring orientations) and a counting bound on wrong orientations. Both are admissible, so `max(permDist, ⌈wrongOrientations / 7⌉)` is too.

Solvers run in a Web Worker so the UI stays responsive during search.

## Engine

The puzzle engine (`packages/puzzle-core`) is pure TypeScript with no browser dependencies. State is `{ pieces: number[], orientations: number[] }` throughout — no quaternion strings in the hot path. Move tables are precomputed at startup so each `applyMove` is a small indexed array copy. The four axes generate the tetrahedral rotation group (order 12), giving 12 possible piece orientations tracked as integer IDs.

## Running locally

```bash
npm install
npm run dev        # start the Vite dev server
npm test           # run engine and solver tests
npm run bench      # CLI solver benchmark (node)
```

## Stack

- TypeScript monorepo — `puzzle-core`, `solvers`, `bench`, `apps/web`
- Three.js for 3D rendering
- Vite for bundling
- Vitest for tests
- Web Workers for non-blocking solve

## Notation

Moves follow Jaap-style notation: `L`, `R`, `D`, `B` for clockwise 120° turns around each fixed corner, with `'` for inverse. See [NOTATION.md](./NOTATION.md) for the full convention.
