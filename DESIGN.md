# Skewb Ultimate Solver Lab Design

## Vision

Build a browser-based Skewb Ultimate solver lab with a realistic 3D puzzle, clean move animations, and multiple solving algorithms that can be compared by speed, success rate, depth, and search behavior.

This is primarily a personal/open-source project for GitHub and a personal website. It should be visually satisfying, technically clean, and useful for experimenting with solver approaches rather than focused on producing optimal solutions.

## Goals

- Render a physically accurate 12-color Skewb Ultimate as individual movable pieces.
- Animate legal Skewb Ultimate turns as full physical rotations.
- Keep the puzzle engine independent from the UI and renderer.
- Support generated scrambles, solution playback, and eventually manual state entry.
- Implement multiple solver approaches over time and compare their behavior.
- Prefer speed and success rate over mathematically optimal solutions.
- Keep the code testable from the beginning.

## Non-Goals

- Optimal solving in the first version.
- Manual user interaction with the 3D puzzle in the first demo.
- Supporting every Skewb Ultimate color scheme initially.
- Mobile support initially.
- A native desktop app initially.

## Tech Stack

- TypeScript monorepo.
- Vite for the browser app.
- Three.js for 3D rendering.
- Vitest for engine and solver tests.
- Pure TypeScript puzzle engine first.
- Optional future high-performance solver core in Rust or C++ compiled to WebAssembly.

## Repository Shape

```text
apps/web
  Browser UI, Three.js scene, animation timeline, controls, stats display.

packages/puzzle-core
  Pure TypeScript puzzle model:
  - state representation
  - moves
  - notation parser
  - scramble generation
  - validation helpers

packages/solvers
  Solver implementations:
  - random walk
  - depth-limited DFS
  - bidirectional BFS
  - IDA*
  - future pruning-table solvers

packages/bench
  Later CLI benchmark tooling.

docs
  Research notes, diagrams, and physical puzzle mapping notes.
```

## Architecture

The engine should not depend on Three.js, DOM APIs, React, or browser state. The renderer consumes engine states and move events.

```text
PuzzleState + Move
  -> puzzle-core applies move
  -> renderer receives old state, move, new state
  -> animation layer rotates affected physical pieces
  -> visual state snaps to new engine state
```

The solver interface should allow TypeScript and future WebAssembly implementations to plug into the same UI.

```ts
export interface Solver {
  id: string;
  name: string;
  solve(state: PuzzleState, options: SolverOptions): Promise<SolveResult>;
}
```

## Puzzle Model

Use Jaap-style Skewb Ultimate notation as the initial convention:

- Basic moves: `L`, `R`, `D`, `B`
- Inverses: `L'`, `R'`, `D'`, `B'`
- Optional parser shorthand: `L2`, `R2`, `D2`, `B2`

Internally, a move should preserve direction explicitly:

```ts
type MoveAxis = "L" | "R" | "D" | "B";

type Move = {
  axis: MoveAxis;
  amount: 1 | -1;
};
```

The engine should model piece state, not only sticker colors.

```text
piece state:
  which physical piece is in which slot
  orientation of that piece

sticker state:
  derived visible colors for rendering and later manual entry
```

The exact piece list, slot list, and orientation rules must be verified from the physical puzzle before coding the final move tables.

## Rendering Model

Target Option B: real movable pieces.

Each physical puzzle piece should be represented as an independent 3D object. During a move, the affected pieces rotate around the correct fixed-corner axis by 120 degrees, then snap into their new positions.

Initial rendering can use mathematically generated placeholder geometry. Blender-modeled pieces can come later for polish.

Rendering priorities:

- 12 distinct face colors.
- Visible seams between pieces.
- Smooth 120-degree rotations.
- Clean lighting and camera controls.
- Accurate move axes before visual polish.

## Solver Strategy

Solvers should be added progressively:

1. Random walk baseline.
2. Depth-limited DFS for short scrambles.
3. Bidirectional BFS for short-to-medium scrambles.
4. IDA* with simple heuristics.
5. Pattern databases / pruning tables.
6. Optional human-style method solver.

Stats to collect:

```text
algorithm
scramble length
solution length
time elapsed
nodes expanded
nodes per second
max depth reached
success or failure
memory estimate
```

## Testing Strategy

Puzzle-core should have tests before solver work gets serious.

Important tests:

- Solved state is valid.
- Every move has a valid inverse.
- Applying a move three times returns to the original state.
- Notation parser round-trips moves correctly.
- Scramble inverse solves the scramble.
- Move tables match physical puzzle observations.
- Renderer-facing move metadata identifies the correct affected pieces.

## Risks

- Incorrect move tables would poison the whole project.
- Piece orientation rules may be subtle.
- Dodecahedron geometry and real-piece seams may take iteration.
- Solver state encoding may need redesign once algorithms get serious.
- Browser-based solvers may need Web Workers to avoid blocking the UI.

## First Milestone Definition

The first satisfying demo is not a solver. It is:

```text
Render a Skewb Ultimate.
Apply one legal move in the engine.
Animate the exact physical pieces rotating 120 degrees.
Run a short generated scramble animation.
Verify moves and inverses with tests.
```

