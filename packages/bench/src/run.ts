import {
  applyAlgorithm,
  createSolvedState,
  MOVE_AXES,
  type Move,
  type MoveAxis,
} from "@skewb-ultimate/puzzle-core";
import { bidirectionalBfsSolver, bidirectionalIdaStarSolver } from "@skewb-ultimate/solvers";

function randomScramble(length: number): Move[] {
  const scramble: Move[] = [];
  let previousAxis: MoveAxis | undefined;
  while (scramble.length < length) {
    const axes = MOVE_AXES.filter((a) => a !== previousAxis);
    const axis = axes[Math.floor(Math.random() * axes.length)]!;
    const amount = Math.random() < 0.5 ? 1 : -1;
    scramble.push({ axis, amount });
    previousAxis = axis;
  }
  return scramble;
}

const bida = bidirectionalIdaStarSolver();
const bfs = bidirectionalBfsSolver();
const TRIALS = 5;

console.log("\nBidirectional IDA* benchmark — scramble depth vs solve time");
console.log("=".repeat(68));
console.log(
  `${"Depth".padEnd(7)}${"Trials".padEnd(8)}${"Solved".padEnd(8)}${"Avg nodes".padEnd(14)}${"Avg ms".padEnd(10)}${"Max ms"}`,
);
console.log("-".repeat(68));

for (let depth = 1; depth <= 12; depth++) {
  const results = [];
  for (let t = 0; t < TRIALS; t++) {
    const scramble = randomScramble(depth);
    const state = applyAlgorithm(createSolvedState(), scramble);
    const r = await bida.solve(state, { maxNodes: 50_000_000 });
    results.push(r);
  }
  const solved = results.filter((r) => r.status === "solved").length;
  const avgNodes = Math.round(results.reduce((s, r) => s + r.stats.nodesExpanded, 0) / TRIALS);
  const avgMs = Math.round(results.reduce((s, r) => s + r.stats.elapsedMs, 0) / TRIALS);
  const maxMs = Math.round(Math.max(...results.map((r) => r.stats.elapsedMs)));
  console.log(
    `${String(depth).padEnd(7)}${String(TRIALS).padEnd(8)}${String(solved).padEnd(8)}${avgNodes.toLocaleString().padEnd(14)}${String(avgMs).padEnd(10)}${maxMs}`,
  );
  if (solved < TRIALS) {
    console.log(`  ^ ${TRIALS - solved} trial(s) hit node limit — stopping early`);
    break;
  }
}

console.log("\nBFS benchmark (baseline) — scramble depth vs solve time");
console.log("=".repeat(68));
console.log(
  `${"Depth".padEnd(7)}${"Trials".padEnd(8)}${"Solved".padEnd(8)}${"Avg nodes".padEnd(14)}${"Avg ms".padEnd(10)}${"Max ms"}`,
);
console.log("-".repeat(68));

for (let depth = 1; depth <= 12; depth++) {
  const results = [];
  for (let t = 0; t < TRIALS; t++) {
    const scramble = randomScramble(depth);
    const state = applyAlgorithm(createSolvedState(), scramble);
    const r = await bfs.solve(state);
    results.push(r);
  }
  const solved = results.filter((r) => r.status === "solved").length;
  const avgNodes = Math.round(results.reduce((s, r) => s + r.stats.nodesExpanded, 0) / TRIALS);
  const avgMs = Math.round(results.reduce((s, r) => s + r.stats.elapsedMs, 0) / TRIALS);
  const maxMs = Math.round(Math.max(...results.map((r) => r.stats.elapsedMs)));
  console.log(
    `${String(depth).padEnd(7)}${String(TRIALS).padEnd(8)}${String(solved).padEnd(8)}${avgNodes.toLocaleString().padEnd(14)}${String(avgMs).padEnd(10)}${maxMs}`,
  );
  if (solved < TRIALS) {
    console.log(`  ^ ${TRIALS - solved} trial(s) hit node limit — stopping`);
    break;
  }
}
