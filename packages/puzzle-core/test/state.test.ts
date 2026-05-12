import { describe, expect, it } from "vitest";
import {
  MOVE_AXES,
  SLOT_IDS,
  applyAlgorithm,
  applyMove,
  createSolvedState,
  invertAlgorithm,
  isSolved,
  parseAlgorithm,
} from "../src";

describe("puzzle state", () => {
  it("creates a solved 14-slot permutation state", () => {
    const state = createSolvedState();

    expect(SLOT_IDS).toHaveLength(14);
    expect(state.pieces).toEqual(SLOT_IDS);
    expect(isSolved(state)).toBe(true);
  });

  it("changes state after a single move", () => {
    const state = applyMove(createSolvedState(), { axis: "L", amount: 1 });

    expect(isSolved(state)).toBe(false);
  });

  it("treats every base move as order 3", () => {
    for (const axis of MOVE_AXES) {
      const state = applyAlgorithm(createSolvedState(), [
        { axis, amount: 1 },
        { axis, amount: 1 },
        { axis, amount: 1 },
      ]);

      expect(isSolved(state)).toBe(true);
    }
  });

  it("applies inverse moves", () => {
    for (const axis of MOVE_AXES) {
      const state = applyAlgorithm(createSolvedState(), [
        { axis, amount: 1 },
        { axis, amount: -1 },
      ]);

      expect(isSolved(state)).toBe(true);
    }
  });

  it("returns to solved after an algorithm followed by its inverse", () => {
    const scramble = parseAlgorithm("L R' D B R L' D' B");
    const state = applyAlgorithm(
      applyAlgorithm(createSolvedState(), scramble),
      invertAlgorithm(scramble),
    );

    expect(isSolved(state)).toBe(true);
  });
});
