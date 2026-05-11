import type { Move, PuzzleState } from "@skewb-ultimate/puzzle-core";

export type SolverOptions = {
  maxDepth?: number;
  maxNodes?: number;
};

export type SolveResult = {
  status: "solved" | "failed" | "not-implemented";
  solution: Move[];
  stats: {
    elapsedMs: number;
    nodesExpanded: number;
    maxDepthReached: number;
  };
};

export type Solver = {
  id: string;
  name: string;
  solve(state: PuzzleState, options?: SolverOptions): Promise<SolveResult>;
};

export function randomWalkSolver(): Solver {
  return {
    id: "random-walk",
    name: "Random Walk",
    async solve() {
      return {
        status: "not-implemented",
        solution: [],
        stats: {
          elapsedMs: 0,
          nodesExpanded: 0,
          maxDepthReached: 0,
        },
      };
    },
  };
}

