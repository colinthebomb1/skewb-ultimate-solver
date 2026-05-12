export type MoveAxis = "L" | "R" | "D" | "B";

export type MoveAmount = 1 | -1;

export type Move = {
  axis: MoveAxis;
  amount: MoveAmount;
};

export type SlotId = string;

export type PieceId = string;

export type PuzzleState = {
  pieces: readonly PieceId[];
};

export const MOVE_AXES: readonly MoveAxis[] = ["L", "R", "D", "B"] as const;

type Vector3 = readonly [number, number, number];

type SlotDefinition = {
  id: SlotId;
  signs: Record<MoveAxis, MoveAmount>;
  center: Vector3;
};

const RAW_AXES: Record<MoveAxis, Vector3> = {
  L: [-1, 1, -1],
  R: [1, 1, 1],
  D: [1, -1, -1],
  B: [-1, -1, 1],
};

const AXIS_VECTORS = Object.fromEntries(
  MOVE_AXES.map((axis) => [axis, normalize(RAW_AXES[axis])]),
) as Record<MoveAxis, Vector3>;

const SLOT_DEFINITIONS = createSlotDefinitions();

export const SLOT_IDS: readonly SlotId[] = SLOT_DEFINITIONS.map((slot) => slot.id);

const SLOT_INDEX_BY_ID = new Map(SLOT_IDS.map((id, index) => [id, index]));

export function createSolvedState(): PuzzleState {
  return { pieces: [...SLOT_IDS] };
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

export function applyMove(state: PuzzleState, move: Move): PuzzleState {
  const amount = move.amount === 1 ? 1 : 2;
  let next = state;

  for (let i = 0; i < amount; i += 1) {
    next = applyClockwiseMove(next, move.axis);
  }

  return next;
}

export function applyAlgorithm(state: PuzzleState, moves: readonly Move[]): PuzzleState {
  return moves.reduce((current, move) => applyMove(current, move), state);
}

export function isSolved(state: PuzzleState): boolean {
  return SLOT_IDS.every((slotId, index) => state.pieces[index] === slotId);
}

export function formatMove(move: Move): string {
  return `${move.axis}${move.amount === -1 ? "'" : ""}`;
}

export function formatAlgorithm(moves: readonly Move[]): string {
  return moves.map(formatMove).join(" ");
}

export function simplifyAlgorithm(moves: readonly Move[]): Move[] {
  const simplified: Move[] = [];

  moves.forEach((move) => {
    const previous = simplified.at(-1);

    if (!previous || previous.axis !== move.axis) {
      simplified.push({ ...move });
      return;
    }

    const combined = normalizeTurnAmount(previous.amount + move.amount);

    if (combined === 0) {
      simplified.pop();
      return;
    }

    previous.amount = combined;
  });

  return simplified;
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

function normalizeTurnAmount(amount: number): MoveAmount | 0 {
  const normalized = ((amount % 3) + 3) % 3;

  if (normalized === 0) {
    return 0;
  }

  return normalized === 1 ? 1 : -1;
}

function applyClockwiseMove(state: PuzzleState, axis: MoveAxis): PuzzleState {
  const nextPieces = [...state.pieces];

  SLOT_DEFINITIONS
    .filter((slot) => slot.signs[axis] === 1)
    .forEach((sourceSlot) => {
      const targetSlotId = slotIdFromPoint(rotateAroundAxis(
        sourceSlot.center,
        AXIS_VECTORS[axis],
        1,
      ));
      const sourceIndex = getSlotIndex(sourceSlot.id);
      const targetIndex = getSlotIndex(targetSlotId);

      nextPieces[targetIndex] = state.pieces[sourceIndex]!;
    });

  return { pieces: nextPieces };
}

function createSlotDefinitions(): SlotDefinition[] {
  const slots: SlotDefinition[] = [];

  for (const l of [-1, 1] as const) {
    for (const r of [-1, 1] as const) {
      for (const d of [-1, 1] as const) {
        for (const b of [-1, 1] as const) {
          const signs = { L: l, R: r, D: d, B: b };
          const center = slotCenter(signs);

          if (magnitude(center) > 0.000001) {
            slots.push({
              id: formatSlotId(signs),
              signs,
              center,
            });
          }
        }
      }
    }
  }

  return slots;
}

function slotCenter(signs: Record<MoveAxis, MoveAmount>): Vector3 {
  return MOVE_AXES.reduce<Vector3>(
    (sum, axis) => add(sum, scale(AXIS_VECTORS[axis], signs[axis])),
    [0, 0, 0],
  );
}

function slotIdFromPoint(point: Vector3): SlotId {
  return formatSlotId(Object.fromEntries(
    MOVE_AXES.map((axis) => [
      axis,
      dot(point, AXIS_VECTORS[axis]) >= 0 ? 1 : -1,
    ]),
  ) as Record<MoveAxis, MoveAmount>);
}

function formatSlotId(signs: Record<MoveAxis, MoveAmount>): SlotId {
  return MOVE_AXES.map((axis) => `${axis}${signs[axis] === 1 ? "+" : "-"}`).join("");
}

function getSlotIndex(slotId: SlotId): number {
  const index = SLOT_INDEX_BY_ID.get(slotId);

  if (index === undefined) {
    throw new Error(`Unknown slot: ${slotId}`);
  }

  return index;
}

function rotateAroundAxis(point: Vector3, axis: Vector3, amount: 1): Vector3 {
  const theta = amount * ((-Math.PI * 2) / 3);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const axisDotPoint = dot(axis, point);
  const axisCrossPoint = cross(axis, point);

  return add(
    add(scale(point, cos), scale(axisCrossPoint, sin)),
    scale(axis, axisDotPoint * (1 - cos)),
  );
}

function normalize(vector: Vector3): Vector3 {
  const length = magnitude(vector);

  return scale(vector, 1 / length);
}

function magnitude(vector: Vector3): number {
  return Math.hypot(...vector);
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function add(left: Vector3, right: Vector3): Vector3 {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
}

function scale(vector: Vector3, amount: number): Vector3 {
  return [
    vector[0] * amount,
    vector[1] * amount,
    vector[2] * amount,
  ];
}
