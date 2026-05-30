import {
  aStarSolver,
  bidirectionalBfsSolver,
  bidirectionalIdaStarSolver,
  depthLimitedDfsSolver,
  greedyBestFirstSolver,
  idaStarSolver,
  twoPhaseSolver,
  warmUpHeuristics,
  type SolverId,
} from "@skewb-ultimate/solvers";
import type { PuzzleState } from "@skewb-ultimate/puzzle-core";

export type WorkerRequest = {
  solverId: SolverId;
  state: PuzzleState;
  maxNodes?: number;
};

const solvers = {
  "ida-star": idaStarSolver(),
  "a-star": aStarSolver(),
  "greedy-best-first": greedyBestFirstSolver(),
  "two-phase": twoPhaseSolver(),
  "bidirectional-ida-star": bidirectionalIdaStarSolver(),
  "bidirectional-bfs": bidirectionalBfsSolver(),
  "depth-limited-dfs": depthLimitedDfsSolver(),
} as const;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { solverId, state, maxNodes } = event.data;
  const solver = solvers[solverId as keyof typeof solvers] ?? solvers["ida-star"];
  const result = await solver.solve(state, maxNodes !== undefined ? { maxNodes } : undefined);
  self.postMessage(result);
};

// Build the heuristic tables now (off the main thread) so the first solve
// isn't delayed by the one-time ~2.5s build. Deferred so the onmessage handler
// is registered first; an early solve request just triggers the lazy build.
// Signal "ready" once the build finishes so the UI can enable solving.
setTimeout(() => {
  warmUpHeuristics();
  self.postMessage({ type: "ready" });
}, 0);
