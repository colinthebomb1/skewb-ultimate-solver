import {
  MOVE_AXES,
  applyMove,
  createSolvedState,
  invertAlgorithm,
  isSolved,
  simplifyAlgorithm,
  type Move,
  type MoveAxis,
  type Orientation,
  type PuzzleState,
} from "@skewb-ultimate/puzzle-core";

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

export function depthLimitedDfsSolver(): Solver {
  return {
    id: "depth-limited-dfs",
    name: "Depth-Limited DFS",
    async solve(state, options = {}) {
      const startedAt = performance.now();
      const maxDepth = options.maxDepth ?? 6;
      const maxNodes = options.maxNodes ?? 100_000;
      const stats = {
        elapsedMs: 0,
        nodesExpanded: 0,
        maxDepthReached: 0,
      };

      if (isSolved(state)) {
        return {
          status: "solved",
          solution: [],
          stats: {
            ...stats,
            elapsedMs: performance.now() - startedAt,
          },
        };
      }

      const visitedDepth = new Map<string, number>();

      for (let depth = 1; depth <= maxDepth; depth += 1) {
        stats.maxDepthReached = depth;
        const solution = search({
          state,
          depthRemaining: depth,
          path: [],
          previousAxis: undefined,
          visitedDepth,
          stats,
          maxNodes,
        });

        if (solution) {
          return {
            status: "solved",
            solution,
            stats: {
              ...stats,
              elapsedMs: performance.now() - startedAt,
            },
          };
        }

        if (stats.nodesExpanded >= maxNodes) {
          break;
        }
      }

      return {
        status: "failed",
        solution: [],
        stats: {
          ...stats,
          elapsedMs: performance.now() - startedAt,
        },
      };
    },
  };
}

export function bidirectionalBfsSolver(): Solver {
  return {
    id: "bidirectional-bfs",
    name: "Bidirectional BFS",
    async solve(startState, options = {}) {
      const startedAt = performance.now();
      const maxNodes = options.maxNodes ?? 1_000_000;
      const stats = { elapsedMs: 0, nodesExpanded: 0, maxDepthReached: 0 };
      const elapsed = () => performance.now() - startedAt;

      if (isSolved(startState)) {
        return { status: "solved", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
      }

      const goalState = createSolvedState();
      const startKey = serializeState(startState);
      const goalKey = serializeState(goalState);

      const fwdVisited = new Map<string, Move[]>([[startKey, []]]);
      const bwdVisited = new Map<string, Move[]>([[goalKey, []]]);

      type Entry = { state: PuzzleState; key: string; lastAxis: MoveAxis | undefined };
      let fwdFrontier: Entry[] = [{ state: startState, key: startKey, lastAxis: undefined }];
      let bwdFrontier: Entry[] = [{ state: goalState, key: goalKey, lastAxis: undefined }];

      function expandLevel(
        frontier: Entry[],
        visited: Map<string, Move[]>,
        other: Map<string, Move[]>,
        forward: boolean,
      ): Move[] | undefined {
        const next: Entry[] = [];

        for (const { state, key, lastAxis } of frontier) {
          const path = visited.get(key)!;

          for (const axis of MOVE_AXES) {
            if (axis === lastAxis) continue;

            for (const amount of SEARCH_AMOUNTS) {
              if (stats.nodesExpanded >= maxNodes) {
                frontier.length = 0;
                return undefined;
              }

              const move = { axis, amount };
              const nextState = applyMove(state, move);
              const nextKey = serializeState(nextState);

              if (visited.has(nextKey)) continue;

              const nextPath = [...path, move];
              visited.set(nextKey, nextPath);
              stats.nodesExpanded++;

              if (other.has(nextKey)) {
                const otherPath = other.get(nextKey)!;
                const fwdPath = forward ? nextPath : otherPath;
                const bwdPath = forward ? otherPath : nextPath;
                return simplifyAlgorithm([...fwdPath, ...invertAlgorithm(bwdPath)]);
              }

              next.push({ state: nextState, key: nextKey, lastAxis: axis });
            }
          }
        }

        frontier.splice(0, frontier.length, ...next);
        return undefined;
      }

      while (fwdFrontier.length > 0 || bwdFrontier.length > 0) {
        stats.maxDepthReached++;

        if (fwdFrontier.length > 0) {
          const solution = expandLevel(fwdFrontier, fwdVisited, bwdVisited, true);
          if (solution) return { status: "solved", solution, stats: { ...stats, elapsedMs: elapsed() } };
        }

        if (bwdFrontier.length > 0) {
          const solution = expandLevel(bwdFrontier, bwdVisited, fwdVisited, false);
          if (solution) return { status: "solved", solution, stats: { ...stats, elapsedMs: elapsed() } };
        }
      }

      return { status: "failed", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
    },
  };
}

type SearchContext = {
  state: PuzzleState;
  depthRemaining: number;
  path: Move[];
  previousAxis: MoveAxis | undefined;
  visitedDepth: Map<string, number>;
  stats: SolveResult["stats"];
  maxNodes: number;
};

const SEARCH_AMOUNTS = [1, -1] as const;

function search(context: SearchContext): Move[] | undefined {
  if (context.stats.nodesExpanded >= context.maxNodes) {
    return undefined;
  }

  context.stats.nodesExpanded += 1;

  if (isSolved(context.state)) {
    return context.path;
  }

  if (context.depthRemaining === 0) {
    return undefined;
  }

  const stateKey = serializeState(context.state);
  const previousDepthRemaining = context.visitedDepth.get(stateKey);

  if (
    previousDepthRemaining !== undefined &&
    previousDepthRemaining >= context.depthRemaining
  ) {
    return undefined;
  }

  context.visitedDepth.set(stateKey, context.depthRemaining);

  for (const axis of MOVE_AXES) {
    if (axis === context.previousAxis) {
      continue;
    }

    for (const amount of SEARCH_AMOUNTS) {
      const move = { axis, amount };
      const nextState = applyMove(context.state, move);
      const solution = search({
        ...context,
        state: nextState,
        depthRemaining: context.depthRemaining - 1,
        path: [...context.path, move],
        previousAxis: axis,
      });

      if (solution) {
        return solution;
      }
    }
  }

  return undefined;
}

const orientationRegistry = new Map<string, number>();

function orientationKey(orientation: Orientation): number {
  const raw = `${Math.round(orientation[0] * 100000)},${Math.round(orientation[1] * 100000)},${Math.round(orientation[2] * 100000)},${Math.round(orientation[3] * 100000)}`;
  let id = orientationRegistry.get(raw);

  if (id === undefined) {
    id = orientationRegistry.size;
    orientationRegistry.set(raw, id);
  }

  return id;
}

function serializeState(state: PuzzleState): string {
  return state.pieces.join(",") + "|" + state.orientations.map(orientationKey).join(",");
}
