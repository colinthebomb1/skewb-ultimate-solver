import {
  MOVE_AXES,
  applyMove,
  createSolvedState,
  invertAlgorithm,
  isSolved,
  permutationDistance,
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

      type BfsNode = {
        state: PuzzleState;
        key: string;
        lastAxis: MoveAxis | undefined;
        parent: number;
        move: Move | undefined;
      };

      const fwdNodes: BfsNode[] = [
        { state: startState, key: startKey, lastAxis: undefined, parent: -1, move: undefined },
      ];
      const bwdNodes: BfsNode[] = [
        { state: goalState, key: goalKey, lastAxis: undefined, parent: -1, move: undefined },
      ];
      const fwdVisited = new Map<string, number>([[startKey, 0]]);
      const bwdVisited = new Map<string, number>([[goalKey, 0]]);
      let fwdFrontier = [0];
      let bwdFrontier = [0];

      function pathToBfsNode(nodes: BfsNode[], nodeIndex: number): Move[] {
        const path: Move[] = [];
        let current = nodeIndex;

        while (current !== -1) {
          const node = nodes[current]!;
          if (node.move) path.push(node.move);
          current = node.parent;
        }

        path.reverse();
        return path;
      }

      function expandLevel(
        frontier: number[],
        nodes: BfsNode[],
        visited: Map<string, number>,
        otherNodes: BfsNode[],
        other: Map<string, number>,
        forward: boolean,
      ): Move[] | undefined {
        const next: number[] = [];

        for (const nodeIndex of frontier) {
          const { state, lastAxis } = nodes[nodeIndex]!;

          for (const move of SEARCH_MOVES) {
            if (move.axis === lastAxis) continue;

            if (stats.nodesExpanded >= maxNodes) {
              frontier.length = 0;
              return undefined;
            }

            const nextState = applyMove(state, move);
            const nextKey = serializeState(nextState);

            if (visited.has(nextKey)) continue;

            const nextIndex = nodes.length;
            nodes.push({
              state: nextState,
              key: nextKey,
              lastAxis: move.axis,
              parent: nodeIndex,
              move,
            });
            visited.set(nextKey, nextIndex);
            stats.nodesExpanded++;

            const otherIndex = other.get(nextKey);
            if (otherIndex !== undefined) {
              const ownPath = pathToBfsNode(nodes, nextIndex);
              const otherPath = pathToBfsNode(otherNodes, otherIndex);
              const fwdPath = forward ? ownPath : otherPath;
              const bwdPath = forward ? otherPath : ownPath;
              return simplifyAlgorithm([...fwdPath, ...invertAlgorithm(bwdPath)]);
            }

            next.push(nextIndex);
          }
        }

        frontier.length = 0;
        for (const entry of next) frontier.push(entry);
        return undefined;
      }

      while (fwdFrontier.length > 0 || bwdFrontier.length > 0) {
        stats.maxDepthReached++;

        if (fwdFrontier.length > 0) {
          const solution = expandLevel(
            fwdFrontier, fwdNodes, fwdVisited, bwdNodes, bwdVisited, true,
          );
          if (solution) return { status: "solved", solution, stats: { ...stats, elapsedMs: elapsed() } };
        }

        if (bwdFrontier.length > 0) {
          const solution = expandLevel(
            bwdFrontier, bwdNodes, bwdVisited, fwdNodes, fwdVisited, false,
          );
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
const SEARCH_MOVES: readonly Move[] = MOVE_AXES.flatMap((axis) =>
  SEARCH_AMOUNTS.map((amount) => ({ axis, amount })),
);

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

  for (const move of SEARCH_MOVES) {
    if (move.axis === context.previousAxis) {
      continue;
    }

    const nextState = applyMove(context.state, move);
    const solution = search({
      ...context,
      state: nextState,
      depthRemaining: context.depthRemaining - 1,
      path: [...context.path, move],
      previousAxis: move.axis,
    });

    if (solution) {
      return solution;
    }
  }

  return undefined;
}

function serializeState(state: PuzzleState): string {
  const pieces = state.pieces;
  const orientations = state.orientations;

  return String.fromCharCode(
    pieces[0]! | (pieces[1]! << 4),
    pieces[2]! | (pieces[3]! << 4),
    pieces[4]! | (pieces[5]! << 4),
    pieces[6]! | (pieces[7]! << 4),
    pieces[8]! | (pieces[9]! << 4),
    pieces[10]! | (pieces[11]! << 4),
    pieces[12]! | (pieces[13]! << 4),
    orientations[0]! | (orientations[1]! << 4),
    orientations[2]! | (orientations[3]! << 4),
    orientations[4]! | (orientations[5]! << 4),
    orientations[6]! | (orientations[7]! << 4),
    orientations[8]! | (orientations[9]! << 4),
    orientations[10]! | (orientations[11]! << 4),
    orientations[12]! | (orientations[13]! << 4),
  );
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

  for (const move of SEARCH_MOVES) {
    if (move.axis === prevAxis) continue;

    path.push(move);
    const result = buildBidaFrontier(
      applyMove(state, move), g + 1, bound, maxFwdDepth, path, move.axis, frontier, stats,
    );
    path.pop();
    if (result) return result;
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

  for (const move of SEARCH_MOVES) {
    if (move.axis === prevAxis) continue;

    path.push(move);
    const result = bidaBwdSearch(
      applyMove(state, move), g + 1, maxBwdDepth, bound, path, move.axis, frontier, stats,
    );
    path.pop();
    if (result) return result;
  }
  return undefined;
}

function idaHeuristic(state: PuzzleState): number {
  // Admissible lower bound combining two independent estimates:
  //   1. permutationDistance: exact min moves to reach this permutation (ignoring orientations)
  //   2. ceil(wrongOrientations / 7): each move changes at most 7 corner orientations
  const permDist = permutationDistance(state.pieces);
  let wrongOrientations = 0;
  for (let i = 0; i < state.orientations.length; i++) {
    if (state.orientations[i] !== 0) wrongOrientations++;
  }
  return Math.max(permDist, Math.ceil(wrongOrientations / 7));
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

  for (const move of SEARCH_MOVES) {
    if (move.axis === previousAxis) continue;

    if (stats.nodesExpanded >= maxNodes) return minF;

    stats.nodesExpanded++;
    const nextState = applyMove(state, move);
    path.push(move);
    const result = idaSearch(nextState, g + 1, threshold, path, move.axis, stats, maxNodes);
    path.pop();

    if (Array.isArray(result)) return result;
    if (result < minF) minF = result;
  }

  return minF;
}

