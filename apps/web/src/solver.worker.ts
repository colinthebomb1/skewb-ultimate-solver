import { bidirectionalBfsSolver } from "@skewb-ultimate/solvers";
import type { PuzzleState } from "@skewb-ultimate/puzzle-core";

const solver = bidirectionalBfsSolver();

self.onmessage = async (event: MessageEvent<PuzzleState>) => {
  const result = await solver.solve(event.data);
  self.postMessage(result);
};
