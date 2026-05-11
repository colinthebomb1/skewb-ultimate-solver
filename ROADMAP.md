# Roadmap

## Milestone 0: Research And Notation

Goal: define the source-of-truth notation, face labels, piece slots, and move axes.

- Adopt Jaap-style notation: `L`, `R`, `D`, `B` and inverses.
- Define a physical solved orientation for the 12-color puzzle.
- Label the four fixed corners: `L`, `R`, `D`, `B`.
- Label all 12 visible faces.
- Identify all physical piece types and slots.
- Record each base move on the real puzzle.
- Derive initial piece cycles and orientation changes.
- Write tests from the observed move rules.

Done when:

- `NOTATION.md` has enough detail to implement moves.
- A move table can be coded without guessing.

## Milestone 1: Engine Skeleton

Goal: build a pure TypeScript model with tested move semantics.

- Set up monorepo.
- Add `packages/puzzle-core`.
- Define `PuzzleState`, `Move`, `PieceId`, `SlotId`, and orientation types.
- Implement solved state.
- Implement notation parser.
- Implement base moves.
- Implement inverse moves.
- Add tests for move identity and inverse behavior.

Done when:

- `move^3 = identity` for each base move.
- `scramble + inverse(scramble)` returns solved.
- All tests pass without any UI.

## Milestone 2: Static 3D Puzzle

Goal: render a recognizable 12-color Skewb Ultimate.

- Set up `apps/web` with Vite and Three.js.
- Generate initial dodecahedron-based geometry.
- Render separate piece objects.
- Apply 12-color solved coloring.
- Add camera controls and lighting.
- Add a simple move list/debug panel.

Done when:

- The solved puzzle is recognizable and orientation labels are inspectable.

## Milestone 3: Accurate Move Animation

Goal: animate physical turns from engine moves.

- Map engine move axes to 3D rotation axes.
- Group affected piece objects during a move.
- Animate 120-degree rotations.
- Snap objects to exact post-move transforms.
- Add scramble playback.
- Add animation queue controls.

Done when:

- A short scramble animates cleanly.
- Move + inverse visually returns to the starting orientation.
- Engine state and visual state remain synchronized.

## Milestone 4: First Solvers

Goal: solve short scrambles and visualize attempts.

- Add random walk baseline.
- Add depth-limited DFS.
- Add scramble generator with known depth.
- Add solver result playback.
- Display basic stats.

Done when:

- The app can solve short generated scrambles and animate the result.

## Milestone 5: Solver Lab

Goal: compare several algorithms in the browser.

- Add bidirectional BFS.
- Add IDA*.
- Add search progress events.
- Add solver selection UI.
- Add stats table.
- Move long-running solvers into Web Workers if needed.

Done when:

- Multiple algorithms can run against the same scramble and compare results.

## Milestone 6: Benchmarks

Goal: support more serious algorithm comparison.

- Add CLI benchmark runner.
- Generate batches of scrambles.
- Record average time, success rate, nodes, and solution length.
- Add benchmark output files.
- Optionally add charts in the web app.

Done when:

- Algorithm changes can be measured repeatably.

## Milestone 7: Polish And Extensions

Goal: make the project portfolio-ready.

- Improve geometry and materials.
- Consider Blender-modeled pieces.
- Add URL-shareable scrambles.
- Add manual state entry.
- Add screenshots/GIFs for README.
- Publish demo to personal site or GitHub Pages.

