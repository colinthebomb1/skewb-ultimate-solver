import {
  bidirectionalBfsSolver,
  bidirectionalIdaStarSolver,
  depthLimitedDfsSolver,
  idaStarSolver,
  warmUpHeuristics,
  type SolverId,
} from "@skewb-ultimate/solvers";
import type { PuzzleState } from "@skewb-ultimate/puzzle-core";

export type WorkerRequest = {
  solverId: SolverId;
  state: PuzzleState;
};

const solvers = {
  "bidirectional-bfs": bidirectionalBfsSolver(),
  "bidirectional-ida-star": bidirectionalIdaStarSolver(),
  "ida-star": idaStarSolver(),
  "depth-limited-dfs": depthLimitedDfsSolver(),
} as const;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { solverId, state } = event.data;
  const solver = solvers[solverId as keyof typeof solvers] ?? solvers["bidirectional-ida-star"];
  const result = await solver.solve(state);
  self.postMessage(result);
};

// Build the heuristic tables now (off the main thread) so the first solve
// isn't delayed by the one-time ~2.5s build. Deferred so the onmessage handler
// is registered first; an early solve request just triggers the lazy build.
setTimeout(() => warmUpHeuristics(), 0);
