import {
  MOVE_AXES,
  applyMove,
  createSolvedState,
  invertAlgorithm,
  isSolved,
  simplifyAlgorithm,
  type Move,
  type MoveAxis,
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

export type SolverId = "depth-limited-dfs" | "bidirectional-bfs" | "ida-star" | "bidirectional-ida-star" | "random-walk";

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

function serializeState(state: PuzzleState): string {
  return String.fromCharCode(...state.pieces, ...state.orientations);
}

export function idaStarSolver(): Solver {
  return {
    id: "ida-star",
    name: "IDA*",
    async solve(startState, options = {}) {
      const startedAt = performance.now();
      const maxNodes = options.maxNodes ?? Infinity;
      const stats = { elapsedMs: 0, nodesExpanded: 0, maxDepthReached: 0 };
      const elapsed = () => performance.now() - startedAt;

      if (isSolved(startState)) {
        return { status: "solved", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
      }

      let threshold = idaHeuristic(startState);

      while (true) {
        stats.maxDepthReached = threshold;
        const result = idaSearch(startState, 0, threshold, [], undefined, stats, maxNodes);

        if (Array.isArray(result)) {
          return { status: "solved", solution: result, stats: { ...stats, elapsedMs: elapsed() } };
        }

        if (result === Infinity) break;
        threshold = result;
      }

      return { status: "failed", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
    },
  };
}

export function bidirectionalIdaStarSolver(): Solver {
  return {
    id: "bidirectional-ida-star",
    name: "Bidirectional IDA*",
    async solve(startState) {
      const startedAt = performance.now();
      const stats = { elapsedMs: 0, nodesExpanded: 0, maxDepthReached: 0 };
      const elapsed = () => performance.now() - startedAt;

      if (isSolved(startState)) {
        return { status: "solved", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
      }

      const goalState = createSolvedState();

      for (let bound = idaHeuristic(startState); ; bound++) {
        stats.maxDepthReached = bound;
        const fwdDepth = Math.floor(bound / 2);
        const bwdDepth = bound - fwdDepth;

        // Forward DFS to fwdDepth — stores all reachable states into frontier
        const frontier = new Map<string, { path: Move[]; cost: number }>();
        const fwdPath: Move[] = [];
        const fwdResult = buildBidaFrontier(
          startState, 0, bound, fwdDepth, fwdPath, undefined, frontier, stats,
        );
        if (fwdResult) {
          return { status: "solved", solution: fwdResult, stats: { ...stats, elapsedMs: elapsed() } };
        }

        // Backward DFS from goal to bwdDepth — checks against frontier
        const bwdPath: Move[] = [];
        const bwdResult = bidaBwdSearch(
          goalState, 0, bwdDepth, bound, bwdPath, undefined, frontier, stats,
        );
        if (bwdResult) {
          return { status: "solved", solution: bwdResult, stats: { ...stats, elapsedMs: elapsed() } };
        }
      }
    },
  };
}

type FrontierEntry = { path: Move[]; cost: number };

function buildBidaFrontier(
  state: PuzzleState,
  g: number,
  bound: number,
  maxFwdDepth: number,
  path: Move[],
  prevAxis: MoveAxis | undefined,
  frontier: Map<string, FrontierEntry>,
  stats: SolveResult["stats"],
): Move[] | undefined {
  stats.nodesExpanded++;

  if (isSolved(state)) return [...path];

  if (g + idaHeuristic(state) > bound) return undefined;

  const key = serializeState(state);
  const existing = frontier.get(key);
  if (!existing || existing.cost > g) {
    frontier.set(key, { path: [...path], cost: g });
  }

  if (g >= maxFwdDepth) return undefined;

  for (const axis of MOVE_AXES) {
    if (axis === prevAxis) continue;
    for (const amount of SEARCH_AMOUNTS) {
      const move = { axis, amount };
      path.push(move);
      const result = buildBidaFrontier(
        applyMove(state, move), g + 1, bound, maxFwdDepth, path, axis, frontier, stats,
      );
      path.pop();
      if (result) return result;
    }
  }
  return undefined;
}

function bidaBwdSearch(
  state: PuzzleState,
  g: number,
  maxBwdDepth: number,
  bound: number,
  path: Move[],
  prevAxis: MoveAxis | undefined,
  frontier: Map<string, FrontierEntry>,
  stats: SolveResult["stats"],
): Move[] | undefined {
  stats.nodesExpanded++;

  const key = serializeState(state);
  const fwdEntry = frontier.get(key);
  if (fwdEntry && fwdEntry.cost + g <= bound) {
    return simplifyAlgorithm([...fwdEntry.path, ...invertAlgorithm(path)]);
  }

  if (g >= maxBwdDepth) return undefined;

  for (const axis of MOVE_AXES) {
    if (axis === prevAxis) continue;
    for (const amount of SEARCH_AMOUNTS) {
      const move = { axis, amount };
      path.push(move);
      const result = bidaBwdSearch(
        applyMove(state, move), g + 1, maxBwdDepth, bound, path, axis, frontier, stats,
      );
      path.pop();
      if (result) return result;
    }
  }
  return undefined;
}

function idaHeuristic(state: PuzzleState): number {
  let wrong = 0;
  for (let i = 0; i < state.pieces.length; i++) {
    if (state.pieces[i] !== i || state.orientations[i] !== 0) wrong++;
  }
  return Math.ceil(wrong / 3);
}

// Returns a solution path (array) if found, the minimum f that exceeded the threshold if not, or Infinity if exhausted.
function idaSearch(
  state: PuzzleState,
  g: number,
  threshold: number,
  path: Move[],
  previousAxis: MoveAxis | undefined,
  stats: SolveResult["stats"],
  maxNodes: number,
): Move[] | number {
  const f = g + idaHeuristic(state);
  if (f > threshold) return f;
  if (isSolved(state)) return [...path];

  let minF = Infinity;

  for (const axis of MOVE_AXES) {
    if (axis === previousAxis) continue;

    for (const amount of SEARCH_AMOUNTS) {
      if (stats.nodesExpanded >= maxNodes) return minF;

      stats.nodesExpanded++;
      const nextState = applyMove(state, { axis, amount });
      path.push({ axis, amount });
      const result = idaSearch(nextState, g + 1, threshold, path, axis, stats, maxNodes);
      path.pop();

      if (Array.isArray(result)) return result;
      if (result < minF) minF = result;
    }
  }

  return minF;
}
