export type BenchmarkRun = {
  algorithm: string;
  scrambleLength: number;
  success: boolean;
  elapsedMs: number;
  nodesExpanded: number;
};

