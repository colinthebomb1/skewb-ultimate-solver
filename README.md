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

## Planned Stack

- TypeScript
- Vite
- Three.js
- Vitest
- Optional future Rust/C++ WebAssembly solver core

## Docs

- [DESIGN.md](./DESIGN.md): architecture, goals, risks, and implementation strategy.
- [ROADMAP.md](./ROADMAP.md): milestone plan.
- [NOTATION.md](./NOTATION.md): move notation and physical puzzle labeling conventions.
- [PHYSICAL_MAPPING.md](./PHYSICAL_MAPPING.md): worksheet for mapping the real puzzle into engine move tables.
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

Planning and notation research. The first implementation milestone is a tested move model and a 3D animation demo for legal Skewb Ultimate turns.
