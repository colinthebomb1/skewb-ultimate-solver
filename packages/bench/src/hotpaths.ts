import { performance } from "node:perf_hooks";
import {
  MOVE_AXES,
  applyAlgorithm,
  applyMove,
  createSolvedState,
  isSolved,
  type Move,
  type MoveAxis,
  type PuzzleState,
} from "@skewb-ultimate/puzzle-core";
import {
  aStarSolver,
  bidirectionalBfsSolver,
  bidirectionalIdaStarSolver,
  idaStarSolver,
  warmUpHeuristics,
  type Solver,
} from "@skewb-ultimate/solvers";

// ─── Seeded RNG / scramble generation ────────────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicScramble(length: number, seed: number): Move[] {
  const random = mulberry32(seed);
  const scramble: Move[] = [];
  let previousAxis: MoveAxis | undefined;

  while (scramble.length < length) {
    const axes = MOVE_AXES.filter((axis) => axis !== previousAxis);
    const axis = axes[Math.floor(random() * axes.length)]!;
    const amount = random() < 0.5 ? 1 : -1;
    scramble.push({ axis, amount });
    previousAxis = axis;
  }

  return scramble;
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

function p95(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)]!;
}

// ─── Hot-path micro-benchmarks ────────────────────────────────────────────────

const SEARCH_MOVES: Move[] = MOVE_AXES.flatMap((axis) =>
  ([1, -1] as const).map((amount) => ({ axis, amount })),
);

function createSampleStates(count: number): PuzzleState[] {
  const states: PuzzleState[] = [];
  let state = createSolvedState();
  for (let i = 0; i < count; i++) {
    state = applyMove(state, SEARCH_MOVES[i % SEARCH_MOVES.length]!);
    states.push(state);
  }
  return states;
}

function serializeNibble(state: PuzzleState): string {
  const p = state.pieces;
  const o = state.orientations;
  return String.fromCharCode(
    p[0]! | (p[1]! << 4), p[2]! | (p[3]! << 4), p[4]! | (p[5]! << 4),
    p[6]! | (p[7]! << 4), p[8]! | (p[9]! << 4), p[10]! | (p[11]! << 4),
    p[12]! | (p[13]! << 4),
    o[0]! | (o[1]! << 4), o[2]! | (o[3]! << 4), o[4]! | (o[5]! << 4),
    o[6]! | (o[7]! << 4), o[8]! | (o[9]! << 4), o[10]! | (o[11]! << 4),
    o[12]! | (o[13]! << 4),
  );
}

type Measured = { label: string; elapsedMs: number; iterations: number; checksum: number };

function measure(label: string, iterations: number, fn: (i: number) => number): Measured {
  let checksum = 0;
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) checksum = (checksum + fn(i)) | 0;
  return { label, elapsedMs: performance.now() - t0, iterations, checksum };
}

function printMeasured({ label, elapsedMs, iterations, checksum }: Measured) {
  const rate = iterations / (elapsedMs / 1000);
  console.log(
    `  ${label.padEnd(32)} ${elapsedMs.toFixed(1).padStart(8)} ms` +
    `  ${Math.round(rate).toLocaleString().padStart(14)} ops/sec  (cs ${checksum})`,
  );
}

function runHotPathBench() {
  const N = 20_000;
  const ITERS = 1_000_000;
  const states = createSampleStates(N);

  console.log("\nHot path benchmarks");
  console.log("=".repeat(72));
  printMeasured(measure("applyMove", ITERS, (i) => {
    const next = applyMove(states[i % N]!, SEARCH_MOVES[i % SEARCH_MOVES.length]!);
    return next.pieces[0]! + next.orientations[0]!;
  }));
  printMeasured(measure("serializeState (nibble string)", ITERS, (i) =>
    serializeNibble(states[i % N]!).length,
  ));
  printMeasured(measure("isSolved", ITERS, (i) =>
    isSolved(states[i % N]!) ? 1 : 0,
  ));
}

// ─── Solver benchmark ─────────────────────────────────────────────────────────

type TrialResult = {
  status: "solved" | "failed";
  nodes: number;
  ms: number;
  solutionLength: number;
  verified: boolean;
};

const COLS = { depth: 7, solved: 8, ver: 6, len: 7, nodes: 13, avgMs: 9, medMs: 9, p95Ms: 9, maxMs: 6 };
const TOTAL_WIDTH = Object.values(COLS).reduce((a, b) => a + b, 0) + 2;

function solverHeader(): string {
  return (
    `${"Depth".padEnd(COLS.depth)}` +
    `${"Solved".padEnd(COLS.solved)}` +
    `${"Ver".padEnd(COLS.ver)}` +
    `${"AvgLen".padEnd(COLS.len)}` +
    `${"AvgNodes".padEnd(COLS.nodes)}` +
    `${"AvgMs".padEnd(COLS.avgMs)}` +
    `${"MedMs".padEnd(COLS.medMs)}` +
    `${"p95Ms".padEnd(COLS.p95Ms)}` +
    `MaxMs`
  );
}

function solverRow(depth: number, trials: number, results: TrialResult[]): string {
  const solved = results.filter((r) => r.status === "solved");
  const verFail = solved.some((r) => !r.verified);

  const verStr = solved.length === 0 ? "—" : verFail ? "FAIL" : "✓";
  const avgLen = solved.length > 0 ? String(Math.round(avg(solved.map((r) => r.solutionLength)))) : "—";
  const avgNodes = Math.round(avg(results.map((r) => r.nodes)));
  const msTimes = results.map((r) => r.ms);

  return (
    `${String(depth).padEnd(COLS.depth)}` +
    `${`${solved.length}/${trials}`.padEnd(COLS.solved)}` +
    `${verStr.padEnd(COLS.ver)}` +
    `${avgLen.padEnd(COLS.len)}` +
    `${avgNodes.toLocaleString().padEnd(COLS.nodes)}` +
    `${avg(msTimes).toFixed(1).padEnd(COLS.avgMs)}` +
    `${median(msTimes).toFixed(0).padEnd(COLS.medMs)}` +
    `${p95(msTimes).toFixed(0).padEnd(COLS.p95Ms)}` +
    `${Math.max(...msTimes).toFixed(0)}`
  );
}

async function runSolverBench(solver: Solver) {
  const TRIALS = 50;
  const MAX_NODES = 10_000_000;

  console.log(`\n${solver.name}`);
  console.log(solverHeader());
  console.log("-".repeat(TOTAL_WIDTH));

  for (let depth = 1; depth <= 16; depth++) {
    const results: TrialResult[] = [];

    for (let t = 0; t < TRIALS; t++) {
      const scramble = deterministicScramble(depth, depth * 1000 + t);
      const scrambledState = applyAlgorithm(createSolvedState(), scramble);
      const result = await solver.solve(scrambledState, { maxNodes: MAX_NODES });

      let verified = false;
      if (result.status === "solved") {
        verified = isSolved(applyAlgorithm(scrambledState, result.solution));
      }

      results.push({
        status: result.status,
        nodes: result.stats.nodesExpanded,
        ms: result.stats.elapsedMs,
        solutionLength: result.solution.length,
        verified,
      });
    }

    const row = solverRow(depth, TRIALS, results);
    const verFail = results.some((r) => r.status === "solved" && !r.verified);
    console.log(verFail ? `${row}  !! BAD SOLUTION` : row);

    const solvedCount = results.filter((r) => r.status === "solved").length;
    if (solvedCount < Math.ceil(TRIALS * 0.5)) {
      console.log(`  ^ fewer than half solved — stopping`);
      break;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  runHotPathBench();

  // Build the IDA* heuristic tables up front so their one-time ~2.5s build
  // isn't charged to the first solve and skewing the depth-1 row.
  warmUpHeuristics();

  console.log("\n\nSolver benchmarks — 50 deterministic trials per depth, maxNodes 10M");
  console.log("=".repeat(TOTAL_WIDTH));

  await runSolverBench(idaStarSolver());
  await runSolverBench(aStarSolver());
  await runSolverBench(bidirectionalIdaStarSolver());
  await runSolverBench(bidirectionalBfsSolver());
}

void main();
