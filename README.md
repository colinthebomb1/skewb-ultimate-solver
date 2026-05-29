# Skewb Ultimate Solver Lab

A browser-based Skewb Ultimate solver and visualization lab.

The goal is to render a realistic 12-color Skewb Ultimate, animate physically accurate turns, and compare different solving algorithms over time. This project prioritizes clean visuals, accurate move modeling, testable puzzle logic, and solver experimentation over optimal solutions.

## Project Goals

- Real-piece 3D Skewb Ultimate rendering with clean turn animations.
- Pure TypeScript puzzle engine separated from the UI.
- Jaap-style move notation: `L`, `R`, `D`, `B` and inverses.
- Generated scrambles and animated playback.
- Multiple solver strategies with stats and comparisons.
- Future support for manual state entry and more serious benchmarks.

## Stack

- TypeScript monorepo (puzzle-core, solvers, bench, web)
- Vite + Three.js (browser app)
- Vitest (engine and solver tests)

## Docs

- [DESIGN.md](./DESIGN.md): architecture, goals, risks, and implementation strategy.
- [ROADMAP.md](./ROADMAP.md): milestone plan.
- [NOTATION.md](./NOTATION.md): move notation and physical puzzle labeling conventions.
- [docs/REFERENCES.md](./docs/REFERENCES.md): external references used for puzzle facts and notation.

## Development Workflow

Use `main` for stable checkpoints and short-lived feature branches for meaningful project slices, such as:

```text
scaffold
notation-model
three-renderer
move-animation
solver-baselines
```

Tiny documentation edits can happen directly on `main`; code features should usually get a branch.

## Current Status

The core project is complete and working. The 3D puzzle renders with accurate geometry, move animations, and a solver panel. Four algorithms are implemented (Depth-Limited DFS, Bidirectional BFS, IDA*, Bidirectional IDA*) and run in a Web Worker. Scrambles are URL-shareable via the location hash. A "My Cube" paint mode lets you enter your physical cube's colors and solve it directly. Deploy to GitHub Pages is the remaining step.
