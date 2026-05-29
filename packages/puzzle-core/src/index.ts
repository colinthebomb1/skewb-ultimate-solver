export type MoveAxis = "L" | "R" | "D" | "B";

export type MoveAmount = 1 | -1;

export type Move = {
  axis: MoveAxis;
  amount: MoveAmount;
};

export type SlotId = string;

export type PieceId = number;

export type Orientation = readonly [number, number, number, number];

export type PuzzleState = {
  pieces: readonly PieceId[];
  orientations: readonly number[];
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

export function slotIdForPiece(piece: PieceId): SlotId {
  return SLOT_IDS[piece]!;
}

const SLOT_INDEX_BY_ID = new Map(SLOT_IDS.map((id, index) => [id, index]));

type MoveCycle = { sourceIndex: number; targetIndex: number };
type MoveTransform = {
  sourceIndexes: readonly number[];
  targetIndexes: readonly number[];
  orientationTransition: readonly number[];
};

const MOVE_CYCLES: Record<MoveAxis, MoveCycle[]> = Object.fromEntries(
  MOVE_AXES.map((axis) => [
    axis,
    SLOT_DEFINITIONS
      .filter((slot) => slot.signs[axis] === 1)
      .map((sourceSlot) => ({
        sourceIndex: getSlotIndex(sourceSlot.id),
        targetIndex: getSlotIndex(
          slotIdFromPoint(rotateAroundAxis(sourceSlot.center, AXIS_VECTORS[axis], 1)),
        ),
      })),
  ]),
) as Record<MoveAxis, MoveCycle[]>;

const MOVE_QUATERNIONS: Record<MoveAxis, Orientation> = Object.fromEntries(
  MOVE_AXES.map((axis) => [axis, quaternionFromAxisAngle(AXIS_VECTORS[axis], 1)]),
) as Record<MoveAxis, Orientation>;

// Enumerate all reachable orientation quaternions. Identity is always index 0.
// The 4 Skewb axes generate the tetrahedral rotation group (order 12).
const ORIENTATION_QUATERNIONS: Orientation[] = (() => {
  const quatKey = (q: Orientation) =>
    `${Math.round(q[0] * 100000)},${Math.round(q[1] * 100000)},${Math.round(q[2] * 100000)},${Math.round(q[3] * 100000)}`;
  const identity: Orientation = [0, 0, 0, 1];
  const known = new Map<string, number>([[quatKey(identity), 0]]);
  const result: Orientation[] = [identity];
  let frontier: Orientation[] = [identity];

  while (frontier.length > 0) {
    const next: Orientation[] = [];

    for (const q of frontier) {
      for (const axis of MOVE_AXES) {
        const newQ = canonicalizeQuaternion(multiplyQuaternions(MOVE_QUATERNIONS[axis], q));
        const key = quatKey(newQ);

        if (!known.has(key)) {
          known.set(key, result.length);
          result.push(newQ);
          next.push(newQ);
        }
      }
    }

    frontier = next;
  }

  return result;
})();

// ORIENTATION_TRANSITION[axis][orientId] → new orientId after one CW turn.
const ORIENTATION_TRANSITION: Record<MoveAxis, readonly number[]> = (() => {
  const quatKey = (q: Orientation) =>
    `${Math.round(q[0] * 100000)},${Math.round(q[1] * 100000)},${Math.round(q[2] * 100000)},${Math.round(q[3] * 100000)}`;
  const byKey = new Map(ORIENTATION_QUATERNIONS.map((q, i) => [quatKey(q), i]));

  return Object.fromEntries(
    MOVE_AXES.map((axis) => [
      axis,
      ORIENTATION_QUATERNIONS.map((q) => {
        const newQ = canonicalizeQuaternion(multiplyQuaternions(MOVE_QUATERNIONS[axis], q));
        return byKey.get(quatKey(newQ))!;
      }),
    ]),
  ) as unknown as Record<MoveAxis, readonly number[]>;
})();

const MOVE_TRANSFORMS: Record<MoveAxis, Record<MoveAmount, MoveTransform>> = Object.fromEntries(
  MOVE_AXES.map((axis) => [
    axis,
    {
      1: createMoveTransform(axis, 1),
      [-1]: createMoveTransform(axis, -1),
    },
  ]),
) as Record<MoveAxis, Record<MoveAmount, MoveTransform>>;

export function orientationQuaternion(id: number): Orientation {
  return ORIENTATION_QUATERNIONS[id]!;
}

export function createSolvedState(): PuzzleState {
  return {
    pieces: SLOT_IDS.map((_, i) => i),
    orientations: SLOT_IDS.map(() => 0),
  };
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
  const pieces = state.pieces;
  const orientations = state.orientations;
  const nextPieces = [
    pieces[0]!, pieces[1]!, pieces[2]!, pieces[3]!, pieces[4]!, pieces[5]!, pieces[6]!,
    pieces[7]!, pieces[8]!, pieces[9]!, pieces[10]!, pieces[11]!, pieces[12]!, pieces[13]!,
  ];
  const nextOrientations = [
    orientations[0]!, orientations[1]!, orientations[2]!, orientations[3]!, orientations[4]!,
    orientations[5]!, orientations[6]!, orientations[7]!, orientations[8]!, orientations[9]!,
    orientations[10]!, orientations[11]!, orientations[12]!, orientations[13]!,
  ];
  const { sourceIndexes, targetIndexes, orientationTransition } =
    MOVE_TRANSFORMS[move.axis][move.amount];

  for (let i = 0; i < sourceIndexes.length; i += 1) {
    const sourceIndex = sourceIndexes[i]!;
    const targetIndex = targetIndexes[i]!;
    nextPieces[targetIndex] = pieces[sourceIndex]!;
    nextOrientations[targetIndex] = orientationTransition[orientations[sourceIndex]!]!;
  }

  return { pieces: nextPieces, orientations: nextOrientations };
}

export function applyAlgorithm(state: PuzzleState, moves: readonly Move[]): PuzzleState {
  return moves.reduce((current, move) => applyMove(current, move), state);
}

export function isSolved(state: PuzzleState): boolean {
  return state.pieces.every((pieceId, index) =>
    pieceId === index && state.orientations[index] === 0,
  );
}

let reachablePiecePermutationKeys: Set<string> | undefined;

export function isReachablePiecePermutation(pieces: readonly PieceId[]): boolean {
  if (!reachablePiecePermutationKeys) {
    reachablePiecePermutationKeys = buildReachablePiecePermutationKeys();
  }

  return reachablePiecePermutationKeys.has(serializePieces(pieces));
}

let permDistances: Map<number, number> | undefined;

// Returns the minimum moves needed to reach this piece permutation from solved,
// ignoring orientations. Used as an admissible heuristic lower bound.
export function permutationDistance(pieces: readonly PieceId[]): number {
  if (!permDistances) {
    permDistances = buildPermutationDistances();
  }

  return permDistances.get(piecePermutationKey(pieces)) ?? 0;
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

function buildReachablePiecePermutationKeys(): Set<string> {
  const solved = createSolvedState();
  const seen = new Set<string>([serializePieces(solved.pieces)]);
  let frontier: PuzzleState[] = [solved];

  while (frontier.length > 0) {
    const next: PuzzleState[] = [];

    for (const state of frontier) {
      for (const axis of MOVE_AXES) {
        for (const amount of [1, -1] as const) {
          const moved = applyMove(state, { axis, amount });
          const key = serializePieces(moved.pieces);

          if (!seen.has(key)) {
            seen.add(key);
            next.push(moved);
          }
        }
      }
    }

    frontier = next;
  }

  return seen;
}

// Encodes piece permutation as a single number (base-15 positional, fits in JS safe integer).
function piecePermutationKey(pieces: readonly PieceId[]): number {
  let key = 0;
  for (let i = pieces.length - 1; i >= 0; i--) {
    key = key * 15 + pieces[i]!;
  }
  return key;
}

function buildPermutationDistances(): Map<number, number> {
  const solved = createSolvedState();
  const distances = new Map([[piecePermutationKey(solved.pieces), 0]]);
  let frontier: PuzzleState[] = [solved];
  let depth = 0;

  while (frontier.length > 0) {
    depth++;
    const next: PuzzleState[] = [];

    for (const state of frontier) {
      for (const axis of MOVE_AXES) {
        for (const amount of [1, -1] as const) {
          const moved = applyMove(state, { axis, amount });
          const key = piecePermutationKey(moved.pieces);

          if (!distances.has(key)) {
            distances.set(key, depth);
            next.push(moved);
          }
        }
      }
    }

    frontier = next;
  }

  return distances;
}

function serializePieces(pieces: readonly PieceId[]): string {
  return pieces.join(",");
}

function createMoveTransform(axis: MoveAxis, amount: MoveAmount): MoveTransform {
  const clockwiseSourceToTarget = SLOT_IDS.map((_, index) => index);

  for (const { sourceIndex, targetIndex } of MOVE_CYCLES[axis]) {
    clockwiseSourceToTarget[sourceIndex] = targetIndex;
  }

  const sourceToTarget = amount === 1
    ? clockwiseSourceToTarget
    : clockwiseSourceToTarget.map((target) => clockwiseSourceToTarget[target]!);
  const sourceIndexes: number[] = [];
  const targetIndexes: number[] = [];

  for (const { sourceIndex } of MOVE_CYCLES[axis]) {
    sourceIndexes.push(sourceIndex);
    targetIndexes.push(sourceToTarget[sourceIndex]!);
  }

  const clockwiseTransition = ORIENTATION_TRANSITION[axis];
  const orientationTransition = amount === 1
    ? clockwiseTransition
    : clockwiseTransition.map((next) => clockwiseTransition[next]!);

  return { sourceIndexes, targetIndexes, orientationTransition };
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

function quaternionFromAxisAngle(axis: Vector3, amount: 1): Orientation {
  const theta = amount * ((-Math.PI * 2) / 3);
  const halfTheta = theta / 2;
  const sinHalfTheta = Math.sin(halfTheta);

  return canonicalizeQuaternion([
    axis[0] * sinHalfTheta,
    axis[1] * sinHalfTheta,
    axis[2] * sinHalfTheta,
    Math.cos(halfTheta),
  ]);
}

function multiplyQuaternions(left: Orientation, right: Orientation): Orientation {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;

  return canonicalizeQuaternion([
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ]);
}

function canonicalizeQuaternion(quaternion: Orientation): Orientation {
  const length = Math.hypot(...quaternion);
  const normalized: Orientation = [
    cleanQuaternionValue(quaternion[0] / length),
    cleanQuaternionValue(quaternion[1] / length),
    cleanQuaternionValue(quaternion[2] / length),
    cleanQuaternionValue(quaternion[3] / length),
  ];

  if (normalized[3] < 0) {
    return [
      -normalized[0],
      -normalized[1],
      -normalized[2],
      -normalized[3],
    ];
  }

  return normalized;
}

function cleanQuaternionValue(value: number): number {
  return Math.abs(value) < 0.0000000001 ? 0 : value;
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
