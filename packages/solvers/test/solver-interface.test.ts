import { describe, expect, it } from "vitest";
import {
  applyAlgorithm,
  createSolvedState,
  isSolved,
  parseAlgorithm,
} from "@skewb-ultimate/puzzle-core";
import { bidirectionalBfsSolver, depthLimitedDfsSolver } from "../src";

describe("solver interface", () => {
  it("solves an already solved state", async () => {
    const result = await depthLimitedDfsSolver().solve(createSolvedState());

    expect(result.status).toBe("solved");
    expect(result.solution).toEqual([]);
    expect(result.stats.nodesExpanded).toBe(0);
  });

  it("solves a short scramble", async () => {
    const scramble = parseAlgorithm("L R' D");
    const scrambled = applyAlgorithm(createSolvedState(), scramble);
    const result = await depthLimitedDfsSolver().solve(scrambled, {
      maxDepth: 5,
      maxNodes: 50_000,
    });

    expect(result.status).toBe("solved");
    expect(isSolved(applyAlgorithm(scrambled, result.solution))).toBe(true);
    expect(result.solution.length).toBeLessThanOrEqual(5);
  });

  it("does not accept the old piece-only shortcut after orientation tracking", async () => {
    const scramble = parseAlgorithm("L R' D B R L' D' B R D L'");
    const scrambled = applyAlgorithm(createSolvedState(), scramble);
    const result = await depthLimitedDfsSolver().solve(scrambled, {
      maxDepth: 2,
      maxNodes: 50_000,
    });

    expect(result.status).toBe("failed");
    expect(result.solution).toEqual([]);
  });

  it("solves a six-move scramble when the depth limit allows it", async () => {
    const scramble = parseAlgorithm("R' L D' B D' R");
    const scrambled = applyAlgorithm(createSolvedState(), scramble);
    const result = await depthLimitedDfsSolver().solve(scrambled, {
      maxDepth: 8,
      maxNodes: 100_000,
    });

    expect(result.status).toBe("solved");
    expect(isSolved(applyAlgorithm(scrambled, result.solution))).toBe(true);
  });

  it("fails when the depth limit is too low", async () => {
    const scrambled = applyAlgorithm(createSolvedState(), parseAlgorithm("L R D"));
    const result = await depthLimitedDfsSolver().solve(scrambled, {
      maxDepth: 1,
    });

    expect(result.status).toBe("failed");
    expect(result.solution).toEqual([]);
  });
});

describe("bidirectional BFS solver", () => {
  it("solves an already solved state", async () => {
    const result = await bidirectionalBfsSolver().solve(createSolvedState());

    expect(result.status).toBe("solved");
    expect(result.solution).toEqual([]);
    expect(result.stats.nodesExpanded).toBe(0);
  });

  it("solves a short scramble", async () => {
    const scramble = parseAlgorithm("L R' D");
    const scrambled = applyAlgorithm(createSolvedState(), scramble);
    const result = await bidirectionalBfsSolver().solve(scrambled);

    expect(result.status).toBe("solved");
    expect(isSolved(applyAlgorithm(scrambled, result.solution))).toBe(true);
    expect(result.solution.length).toBeLessThanOrEqual(3);
  });

  it("solves a longer scramble that strains DFS", async () => {
    const scramble = parseAlgorithm("L R' D B L' D B' R L D'");
    const scrambled = applyAlgorithm(createSolvedState(), scramble);
    const result = await bidirectionalBfsSolver().solve(scrambled);

    expect(result.status).toBe("solved");
    expect(isSolved(applyAlgorithm(scrambled, result.solution))).toBe(true);
  });

  it("fails gracefully when node budget is exhausted", async () => {
    const scramble = parseAlgorithm("L R' D B L' D B' R L D' B R'");
    const scrambled = applyAlgorithm(createSolvedState(), scramble);
    const result = await bidirectionalBfsSolver().solve(scrambled, { maxNodes: 10 });

    expect(result.status).toBe("failed");
    expect(result.solution).toEqual([]);
  });
});
