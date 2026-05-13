import {
  bidirectionalBfsSolver,
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
  "ida-star": idaStarSolver(),
  "depth-limited-dfs": depthLimitedDfsSolver(),
} as const;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { solverId, state } = event.data;
  const solver = solvers[solverId as keyof typeof solvers] ?? solvers["bidirectional-bfs"];
  const result = await solver.solve(state);
  self.postMessage(result);
};
