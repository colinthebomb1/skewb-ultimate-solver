import {
  bidirectionalBfsSolver,
  bidirectionalIdaStarSolver,
  depthLimitedDfsSolver,
  idaStarSolver,
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
