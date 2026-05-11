export type MoveAxis = "L" | "R" | "D" | "B";

export type MoveAmount = 1 | -1;

export type Move = {
  axis: MoveAxis;
  amount: MoveAmount;
};

export type PuzzleState = {
  kind: "solved-placeholder";
};

export const MOVE_AXES: readonly MoveAxis[] = ["L", "R", "D", "B"] as const;

export function createSolvedState(): PuzzleState {
  return { kind: "solved-placeholder" };
}

export function invertMove(move: Move): Move {
  return {
    axis: move.axis,
    amount: move.amount === 1 ? -1 : 1,
  };
}

export function invertAlgorithm(moves: readonly Move[]): Move[] {
  return [...moves].reverse().map(invertMove);
}

export function formatMove(move: Move): string {
  return `${move.axis}${move.amount === -1 ? "'" : ""}`;
}

export function parseMove(token: string): Move {
  const axis = token[0];

  if (!isMoveAxis(axis)) {
    throw new Error(`Invalid move axis: ${token}`);
  }

  const suffix = token.slice(1);

  if (suffix === "") {
    return { axis, amount: 1 };
  }

  if (suffix === "'") {
    return { axis, amount: -1 };
  }

  if (suffix === "2") {
    return { axis, amount: -1 };
  }

  throw new Error(`Invalid move suffix: ${token}`);
}

export function parseAlgorithm(input: string): Move[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
}

function isMoveAxis(value: string | undefined): value is MoveAxis {
  return value === "L" || value === "R" || value === "D" || value === "B";
}

