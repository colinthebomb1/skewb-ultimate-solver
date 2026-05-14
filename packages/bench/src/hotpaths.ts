import { performance } from "node:perf_hooks";
import {
  MOVE_AXES,
  applyAlgorithm,
  applyMove,
  createSolvedState,
  type Move,
  type MoveAxis,
  type PuzzleState,
} from "@skewb-ultimate/puzzle-core";
import {
  bidirectionalBfsSolver,
  bidirectionalIdaStarSolver,
  type Solver,
} from "@skewb-ultimate/solvers";

type Measured = {
  label: string;
  elapsedMs: number;
  iterations: number;
  checksum: number;
};

const SEARCH_AMOUNTS = [1, -1] as const;

async function main() {
  const sampleStates = createSampleStates(20_000);

  console.log("\nHot path benchmark");
  console.log("=".repeat(76));
  printMeasured(measure("serialize current string", 1_000_000, (i) =>
    serializeStateString(sampleStates[i % sampleStates.length]!).length,
  ));
  printMeasured(measure("serialize 4-bit string", 1_000_000, (i) =>
    packStateNibbleString(sampleStates[i % sampleStates.length]!).length,
  ));
  printMeasured(measure("pack BigInt 4-bit fields", 1_000_000, (i) =>
    Number(packStateBigInt(sampleStates[i % sampleStates.length]!) & 0xffffn),
  ));
  printMeasured(measure("applyMove", 500_000, (i) => {
    const state = sampleStates[i % sampleStates.length]!;
    const move = MOVE_SEQUENCE[i % MOVE_SEQUENCE.length]!;
    const next = applyMove(state, move);
    return next.pieces[0]! + next.orientations[0]!;
  }));

  console.log("\nSolver benchmark");
  console.log("=".repeat(76));
  const solvers = [
    bidirectionalBfsSolver(),
    bidirectionalIdaStarSolver(),
  ];

  for (const solver of solvers) {
    await awaitSolverBench(solver);
  }
}

function printMeasured(result: Measured) {
  const seconds = result.elapsedMs / 1000;
  const rate = result.iterations / seconds;

  console.log(
    `${result.label.padEnd(28)} ${result.elapsedMs.toFixed(1).padStart(8)} ms  ` +
    `${Math.round(rate).toLocaleString().padStart(14)} ops/sec  checksum ${result.checksum}`,
  );
}

function measure(label: string, iterations: number, fn: (index: number) => number): Measured {
  let checksum = 0;
  const startedAt = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    checksum = (checksum + fn(i)) | 0;
  }

  return {
    label,
    elapsedMs: performance.now() - startedAt,
    iterations,
    checksum,
  };
}

function createSampleStates(count: number) {
  const states: PuzzleState[] = [];
  let state = createSolvedState();

  for (let i = 0; i < count; i += 1) {
    const move = MOVE_SEQUENCE[i % MOVE_SEQUENCE.length]!;
    state = applyMove(state, move);
    states.push(state);
  }

  return states;
}

function serializeStateString(state: PuzzleState) {
  return String.fromCharCode(...state.pieces, ...state.orientations);
}

function packStateNibbleString(state: PuzzleState) {
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

function packStateBigInt(state: PuzzleState) {
  let packed = 0n;
  let shift = 0n;

  for (const piece of state.pieces) {
    packed |= BigInt(piece) << shift;
    shift += 4n;
  }

  for (const orientation of state.orientations) {
    packed |= BigInt(orientation) << shift;
    shift += 4n;
  }

  return packed;
}

async function awaitSolverBench(solver: Solver) {
  const cases = [
    { depth: 4, trials: 3 },
    { depth: 6, trials: 3 },
    { depth: 8, trials: 3 },
    { depth: 10, trials: 3 },
    { depth: 12, trials: 3 },
    { depth: 13, trials: 1 },
    { depth: 14, trials: 1 },
  ];

  console.log(`\n${solver.name}`);
  console.log(`${"Depth".padEnd(8)}${"Solved".padEnd(9)}${"Avg nodes".padEnd(14)}${"Avg ms".padEnd(10)}Max ms`);

  for (const { depth, trials } of cases) {
    const results = [];

    for (let trial = 0; trial < trials; trial += 1) {
      const scramble = deterministicScramble(depth, depth * 100 + trial);
      const state = applyAlgorithm(createSolvedState(), scramble);
      const result = await solver.solve(state, { maxNodes: 5_000_000 });
      results.push(result);
    }

    const solved = results.filter((result) => result.status === "solved").length;
    const avgNodes = Math.round(
      results.reduce((sum, result) => sum + result.stats.nodesExpanded, 0) / trials,
    );
    const avgMs = Math.round(
      results.reduce((sum, result) => sum + result.stats.elapsedMs, 0) / trials,
    );
    const maxMs = Math.round(Math.max(...results.map((result) => result.stats.elapsedMs)));

    console.log(
      `${String(depth).padEnd(8)}${`${solved}/${trials}`.padEnd(9)}` +
      `${avgNodes.toLocaleString().padEnd(14)}${String(avgMs).padEnd(10)}${maxMs}`,
    );
  }
}

function deterministicScramble(length: number, seed: number) {
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

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);

    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const MOVE_SEQUENCE: readonly Move[] = MOVE_AXES.flatMap((axis) =>
  SEARCH_AMOUNTS.map((amount) => ({ axis, amount })),
);

void main();
