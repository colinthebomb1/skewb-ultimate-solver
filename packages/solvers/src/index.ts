import {
  MOVE_AXES,
  applyAlgorithm,
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

export type SolverId =
  | "depth-limited-dfs"
  | "bidirectional-bfs"
  | "ida-star"
  | "bidirectional-ida-star"
  | "a-star"
  | "greedy-best-first"
  | "two-phase";

export type Solver = {
  id: string;
  name: string;
  solve(state: PuzzleState, options?: SolverOptions): Promise<SolveResult>;
};

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

// ---- Pattern database heuristic -------------------------------------------
// Each PDB tracks the (slot, orientation) of a fixed subset of pieces and
// stores the exact number of moves to bring just those pieces home. Because a
// move's effect on a piece depends only on the slot it occupies, the subset
// projection is a valid abstraction, so the stored distance is an admissible
// and consistent lower bound on the full solve. max() over several PDBs (and
// the permutation distance) stays admissible.
//
// We track two disjoint 6-piece subsets. A 6-piece key packs into 48 bits, so
// it fits in a JS safe integer and we can use a fast Map<number>. Both tables
// are built once by BFS over the abstract space (~2.5s total) the first time a
// solver runs, mirroring how permutationDistance is built lazily.

const SLOT_COUNT = 14;
const ORIENTATION_COUNT = 12;
const PDB_SUBSETS: readonly (readonly number[])[] = [
  [7, 8, 9, 10, 11, 12],
  [0, 1, 2, 3, 4, 5],
];

// forward[m][slot]  = slot the piece in `slot` moves to under SEARCH_MOVES[m]
// oriMap[m][slot][o] = that piece's orientation after the move
type AbstractTables = { forward: number[][]; oriMap: number[][][] };
let abstractTables: AbstractTables | undefined;

function getAbstractTables(): AbstractTables {
  if (abstractTables) return abstractTables;
  const identityPieces = Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const forward: number[][] = [];
  const oriMap: number[][][] = [];

  SEARCH_MOVES.forEach((move) => {
    const landed = applyMove({ pieces: identityPieces, orientations: new Array(SLOT_COUNT).fill(0) }, move);
    const fwd = new Array<number>(SLOT_COUNT);
    for (let target = 0; target < SLOT_COUNT; target++) fwd[landed.pieces[target]!] = target;
    forward.push(fwd);

    const om: number[][] = Array.from({ length: SLOT_COUNT }, () => new Array<number>(ORIENTATION_COUNT));
    for (let o = 0; o < ORIENTATION_COUNT; o++) {
      const moved = applyMove({ pieces: identityPieces, orientations: new Array(SLOT_COUNT).fill(o) }, move);
      for (let slot = 0; slot < SLOT_COUNT; slot++) om[slot]![o] = moved.orientations[fwd[slot]!]!;
    }
    oriMap.push(om);
  });

  abstractTables = { forward, oriMap };
  return abstractTables;
}

type PatternDatabase = { track: readonly number[]; distances: Map<number, number> };
let patternDatabases: PatternDatabase[] | undefined;

// Abstract state is a flat [slot0, ori0, slot1, ori1, ...]; pack to a number.
function packAbstract(abstract: Int8Array, size: number): number {
  let key = 0;
  for (let i = 0; i < size; i++) key = key * 256 + ((abstract[2 * i]! << 4) | abstract[2 * i + 1]!);
  return key;
}

function buildPatternDatabase(track: readonly number[]): PatternDatabase {
  const { forward, oriMap } = getAbstractTables();
  const size = track.length;
  const solved = new Int8Array(2 * size);
  for (let i = 0; i < size; i++) solved[2 * i] = track[i]!;

  const distances = new Map<number, number>([[packAbstract(solved, size), 0]]);
  let frontier: Int8Array[] = [solved];
  let depth = 0;

  while (frontier.length > 0) {
    depth++;
    const next: Int8Array[] = [];
    for (const abstract of frontier) {
      for (let m = 0; m < SEARCH_MOVES.length; m++) {
        const fwd = forward[m]!;
        const om = oriMap[m]!;
        const child = new Int8Array(2 * size);
        for (let i = 0; i < size; i++) {
          const slot = abstract[2 * i]!;
          child[2 * i] = fwd[slot]!;
          child[2 * i + 1] = om[slot]![abstract[2 * i + 1]!]!;
        }
        const key = packAbstract(child, size);
        if (!distances.has(key)) {
          distances.set(key, depth);
          next.push(child);
        }
      }
    }
    frontier = next;
  }

  return { track, distances };
}

function getPatternDatabases(): PatternDatabase[] {
  if (!patternDatabases) {
    patternDatabases = PDB_SUBSETS.map(buildPatternDatabase);
  }
  return patternDatabases;
}

function patternDatabaseKey(track: readonly number[], state: PuzzleState): number {
  const slotOf = new Array<number>(SLOT_COUNT);
  for (let i = 0; i < SLOT_COUNT; i++) slotOf[state.pieces[i]!] = i;
  let key = 0;
  for (const pieceId of track) {
    const slot = slotOf[pieceId]!;
    key = key * 256 + ((slot << 4) | state.orientations[slot]!);
  }
  return key;
}

/**
 * Eagerly build the heuristic tables (pattern databases and the permutation
 * distance table) used by the IDA* solvers. They are otherwise built lazily on
 * the first solve, which costs ~2.5s; calling this ahead of time — e.g. when a
 * solver worker spins up — keeps the first user solve fast. Idempotent.
 */
export function warmUpHeuristics(): void {
  permutationDistance(createSolvedState().pieces);
  getPatternDatabases();
}

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
  const p = state.pieces;
  const o = state.orientations;

  // Every value is a nibble (pieces 0-13, orientations 0-11), so pack the 28
  // nibbles four-per-char into 7 16-bit chars — half the key length of two
  // nibbles per char, which makes the per-node Map hashing/allocation cheaper.
  return String.fromCharCode(
    p[0]! | (p[1]! << 4) | (p[2]! << 8) | (p[3]! << 12),
    p[4]! | (p[5]! << 4) | (p[6]! << 8) | (p[7]! << 12),
    p[8]! | (p[9]! << 4) | (p[10]! << 8) | (p[11]! << 12),
    p[12]! | (p[13]! << 4) | (o[0]! << 8) | (o[1]! << 12),
    o[2]! | (o[3]! << 4) | (o[4]! << 8) | (o[5]! << 12),
    o[6]! | (o[7]! << 4) | (o[8]! << 8) | (o[9]! << 12),
    o[10]! | (o[11]! << 4) | (o[12]! << 8) | (o[13]! << 12),
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

      const solution = runIdaStar(startState, stats, maxNodes);
      return solution
        ? { status: "solved", solution, stats: { ...stats, elapsedMs: elapsed() } }
        : { status: "failed", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
    },
  };
}

// Shared IDA* driver: iterative deepening on the pattern-database heuristic.
// Returns the optimal solution, or undefined if exhausted / node-capped.
function runIdaStar(
  start: PuzzleState,
  stats: SolveResult["stats"],
  maxNodes: number,
): Move[] | undefined {
  if (isSolved(start)) return [];

  let threshold = idaHeuristic(start);
  while (true) {
    stats.maxDepthReached = Math.max(stats.maxDepthReached, threshold);
    const result = idaSearch(start, 0, threshold, [], undefined, stats, maxNodes);
    if (Array.isArray(result)) return result;
    if (result === Infinity) return undefined;
    threshold = result;
  }
}

export function bidirectionalIdaStarSolver(): Solver {
  return {
    id: "bidirectional-ida-star",
    name: "Bidirectional IDA*",
    async solve(startState, options = {}) {
      const startedAt = performance.now();
      const stats = { elapsedMs: 0, nodesExpanded: 0, maxDepthReached: 0 };
      const maxNodes = options.maxNodes ?? Infinity;
      const elapsed = () => performance.now() - startedAt;

      if (isSolved(startState)) {
        return { status: "solved", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
      }

      const goalState = createSolvedState();

      for (let bound = idaHeuristic(startState); ; bound++) {
        // Bail out if the node budget is exhausted (otherwise the bound loop
        // would spin forever, since it only ends by finding a solution).
        if (stats.nodesExpanded >= maxNodes) {
          return { status: "failed", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
        }
        stats.maxDepthReached = bound;
        const fwdDepth = Math.floor(bound / 2);
        const bwdDepth = bound - fwdDepth;

        // Forward DFS to fwdDepth — stores all reachable states into frontier
        const frontier = new Map<string, { path: Move[]; cost: number }>();
        const fwdPath: Move[] = [];
        const fwdResult = buildBidaFrontier(
          startState, 0, bound, fwdDepth, fwdPath, undefined, frontier, stats, maxNodes,
        );
        if (fwdResult) {
          return { status: "solved", solution: fwdResult, stats: { ...stats, elapsedMs: elapsed() } };
        }

        // Backward DFS from goal to bwdDepth — checks against frontier
        const bwdPath: Move[] = [];
        const bwdResult = bidaBwdSearch(
          goalState, 0, bwdDepth, bound, bwdPath, undefined, frontier, stats, maxNodes,
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
  maxNodes: number,
): Move[] | undefined {
  if (stats.nodesExpanded >= maxNodes) return undefined;
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
      applyMove(state, move), g + 1, bound, maxFwdDepth, path, move.axis, frontier, stats, maxNodes,
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
  maxNodes: number,
): Move[] | undefined {
  if (stats.nodesExpanded >= maxNodes) return undefined;
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
      applyMove(state, move), g + 1, maxBwdDepth, bound, path, move.axis, frontier, stats, maxNodes,
    );
    path.pop();
    if (result) return result;
  }
  return undefined;
}

function idaHeuristic(state: PuzzleState): number {
  // Admissible lower bound: the max of several independent exact distances.
  //   1. permutationDistance: exact min moves for this permutation (ignoring orientations)
  //   2. pattern databases: exact moves to solve each tracked piece subset (slot + orientation)
  // Each is an admissible & consistent lower bound, so their max is too.
  let estimate = permutationDistance(state.pieces);
  for (const pdb of getPatternDatabases()) {
    const distance = pdb.distances.get(patternDatabaseKey(pdb.track, state)) ?? 0;
    if (distance > estimate) estimate = distance;
  }
  return estimate;
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

// ---- Best-first search (A* and greedy best-first) -------------------------
// A binary min-heap of (priority, nodeIndex). Nodes live in a flat array with
// parent pointers so a solution is reconstructed without storing a path per
// node. The priority function selects the strategy: A* uses g + h, greedy
// best-first uses h alone.

type SearchNode = {
  state: PuzzleState;
  g: number;
  parent: number;
  move: Move | undefined;
  lastAxis: MoveAxis | undefined;
  key: string;
};

class MinHeap {
  private priorities: number[] = [];
  private values: number[] = [];

  get size(): number {
    return this.values.length;
  }

  push(priority: number, value: number): void {
    const p = this.priorities;
    const v = this.values;
    let i = p.length;
    p.push(priority);
    v.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent]! <= p[i]!) break;
      [p[parent], p[i]] = [p[i]!, p[parent]!];
      [v[parent], v[i]] = [v[i]!, v[parent]!];
      i = parent;
    }
  }

  pop(): number | undefined {
    const p = this.priorities;
    const v = this.values;
    if (v.length === 0) return undefined;
    const top = v[0]!;
    const lastP = p.pop()!;
    const lastV = v.pop()!;
    if (v.length > 0) {
      p[0] = lastP;
      v[0] = lastV;
      const n = v.length;
      let i = 0;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && p[left]! < p[smallest]!) smallest = left;
        if (right < n && p[right]! < p[smallest]!) smallest = right;
        if (smallest === i) break;
        [p[i], p[smallest]] = [p[smallest]!, p[i]!];
        [v[i], v[smallest]] = [v[smallest]!, v[i]!];
        i = smallest;
      }
    }
    return top;
  }
}

function reconstructPath(nodes: SearchNode[], index: number): Move[] {
  const path: Move[] = [];
  let current = index;
  while (current !== -1) {
    const node = nodes[current]!;
    if (node.move) path.push(node.move);
    current = node.parent;
  }
  path.reverse();
  return path;
}

function bestFirstSearch(
  start: PuzzleState,
  priorityOf: (g: number, h: number) => number,
  stats: SolveResult["stats"],
  maxNodes: number,
): Move[] | undefined {
  const startKey = serializeState(start);
  const nodes: SearchNode[] = [
    { state: start, g: 0, parent: -1, move: undefined, lastAxis: undefined, key: startKey },
  ];
  const bestG = new Map<string, number>([[startKey, 0]]);
  const heap = new MinHeap();
  heap.push(priorityOf(0, idaHeuristic(start)), 0);

  while (heap.size > 0) {
    const index = heap.pop()!;
    const node = nodes[index]!;

    if (isSolved(node.state)) {
      stats.maxDepthReached = Math.max(stats.maxDepthReached, node.g);
      return reconstructPath(nodes, index);
    }
    // A cheaper path to this state may have been queued after this entry.
    if (node.g > (bestG.get(node.key) ?? Infinity)) continue;
    if (stats.nodesExpanded >= maxNodes) return undefined;
    stats.nodesExpanded++;

    for (const move of SEARCH_MOVES) {
      if (move.axis === node.lastAxis) continue;
      const nextState = applyMove(node.state, move);
      const nextG = node.g + 1;
      const key = serializeState(nextState);
      if (nextG >= (bestG.get(key) ?? Infinity)) continue;
      bestG.set(key, nextG);
      const childIndex = nodes.length;
      nodes.push({ state: nextState, g: nextG, parent: index, move, lastAxis: move.axis, key });
      heap.push(priorityOf(nextG, idaHeuristic(nextState)), childIndex);
    }
  }
  return undefined;
}

export function aStarSolver(): Solver {
  return {
    id: "a-star",
    name: "A*",
    async solve(startState, options = {}) {
      const startedAt = performance.now();
      const stats = { elapsedMs: 0, nodesExpanded: 0, maxDepthReached: 0 };
      const maxNodes = options.maxNodes ?? 5_000_000;
      // f = g + h with a consistent heuristic: optimal, and each state is
      // expanded once (unlike IDA*, which re-expands across iterations).
      const solution = bestFirstSearch(startState, (g, h) => g + h, stats, maxNodes);
      const elapsedMs = performance.now() - startedAt;
      return solution
        ? { status: "solved", solution, stats: { ...stats, elapsedMs } }
        : { status: "failed", solution: [], stats: { ...stats, elapsedMs } };
    },
  };
}

export function greedyBestFirstSolver(): Solver {
  return {
    id: "greedy-best-first",
    name: "Greedy Best-First",
    async solve(startState, options = {}) {
      const startedAt = performance.now();
      const stats = { elapsedMs: 0, nodesExpanded: 0, maxDepthReached: 0 };
      const maxNodes = options.maxNodes ?? 5_000_000;
      // Order by the heuristic alone: dives at the goal quickly, but the
      // resulting solution is valid rather than shortest.
      const solution = bestFirstSearch(startState, (_g, h) => h, stats, maxNodes);
      const elapsedMs = performance.now() - startedAt;
      return solution
        ? { status: "solved", solution, stats: { ...stats, elapsedMs } }
        : { status: "failed", solution: [], stats: { ...stats, elapsedMs } };
    },
  };
}

// Phase 1 of the two-phase solver: bring every piece to its home slot (solve
// the permutation), ignoring orientation. permutationDistance is exact for
// this goal, so it's a tiny search — the permutation diameter is only 6.
function solvePermutationPhase(
  start: PuzzleState,
  stats: SolveResult["stats"],
  maxNodes: number,
): Move[] | undefined {
  if (permutationDistance(start.pieces) === 0) return [];

  let threshold = permutationDistance(start.pieces);
  const path: Move[] = [];

  function dfs(state: PuzzleState, g: number, previousAxis: MoveAxis | undefined): Move[] | number {
    const f = g + permutationDistance(state.pieces);
    if (f > threshold) return f;
    if (permutationDistance(state.pieces) === 0) return [...path];

    let minF = Infinity;
    for (const move of SEARCH_MOVES) {
      if (move.axis === previousAxis) continue;
      if (stats.nodesExpanded >= maxNodes) return minF;
      stats.nodesExpanded++;
      path.push(move);
      const result = dfs(applyMove(state, move), g + 1, move.axis);
      path.pop();
      if (Array.isArray(result)) return result;
      if (result < minF) minF = result;
    }
    return minF;
  }

  while (true) {
    const result = dfs(start, 0, undefined);
    if (Array.isArray(result)) return result;
    if (result === Infinity) return undefined;
    threshold = result;
  }
}

export function twoPhaseSolver(): Solver {
  return {
    id: "two-phase",
    name: "Two-Phase",
    async solve(startState, options = {}) {
      const startedAt = performance.now();
      const stats = { elapsedMs: 0, nodesExpanded: 0, maxDepthReached: 0 };
      const maxNodes = options.maxNodes ?? Infinity;
      const elapsed = () => performance.now() - startedAt;

      if (isSolved(startState)) {
        return { status: "solved", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
      }

      // Phase 1: solve the permutation. Phase 2: solve the residual (mostly
      // orientation) optimally with the pattern-database heuristic. The two
      // phases aren't coordinated, so the combined solution is valid but
      // generally longer than the single-phase optimum.
      const phase1 = solvePermutationPhase(startState, stats, maxNodes);
      if (!phase1) {
        return { status: "failed", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
      }
      const midState = applyAlgorithm(startState, phase1);
      const phase2 = runIdaStar(midState, stats, maxNodes);
      if (!phase2) {
        return { status: "failed", solution: [], stats: { ...stats, elapsedMs: elapsed() } };
      }

      const solution = simplifyAlgorithm([...phase1, ...phase2]);
      stats.maxDepthReached = Math.max(stats.maxDepthReached, solution.length);
      return { status: "solved", solution, stats: { ...stats, elapsedMs: elapsed() } };
    },
  };
}

