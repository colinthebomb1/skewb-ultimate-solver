# Skewb Ultimate Notation

This project uses Jaap-style notation as the starting convention for Skewb Ultimate moves.

Reference:

- https://www.jaapsch.net/puzzles/ultimate.htm
- https://www.jaapsch.net/puzzles/skewb.htm

## Core Idea

The Skewb Ultimate is a dodecahedral Skewb-family puzzle. Its eight dodecahedron corners split into two tetrads:

- four fixed-corner axes used for moves
- four opposite/movable corner positions

We hold the puzzle so the fixed tetrad points are named:

```text
L = Left
R = Right
D = Down
B = Back
```

The four legal base moves are rotations around these fixed corners:

```text
L
R
D
B
```

Each base move is a 120-degree clockwise turn around that fixed-corner axis, viewed looking directly at that corner.

Inverse moves are written with a prime:

```text
L'
R'
D'
B'
```

Parser shorthand may later support:

```text
L2
R2
D2
B2
```

Because each base move has order 3, a double clockwise turn is equivalent to one inverse turn. Internally, the engine should still preserve explicit direction as `amount: 1 | -1`.

## Move Type

```ts
type MoveAxis = "L" | "R" | "D" | "B";

type Move = {
  axis: MoveAxis;
  amount: 1 | -1;
};
```

## Physical Orientation Convention

This still needs to be finalized using the physical 12-color puzzle.

We need one canonical solved orientation:

1. Choose which physical corner is the `L` fixed corner.
2. Choose which physical corner is the `R` fixed corner.
3. Choose which physical corner is the `D` fixed corner.
4. Choose which physical corner is the `B` fixed corner.
5. Record which face colors surround each fixed corner.
6. Record the clockwise order of those faces when looking at each fixed corner.

Once chosen, this convention must not change without updating all move tables and tests.

## Face Labels

Jaap labels faces by the fixed corners they lie between. We should follow this where possible.

Examples:

```text
DR = face between Down and Right fixed corners
DL = face between Down and Left fixed corners
LR = face between Left and Right fixed corners
DB = face between Down and Back fixed corners
```

The full face list needs to be completed after the physical orientation is chosen.

## Piece And Slot Labels

The exact piece/slot model is still open.

Known project requirement:

- model physical pieces, not only sticker colors
- each physical piece has an identity
- each slot has a stable label
- orientation must be tracked for pieces where visible orientation changes

To finalize:

1. Photograph or sketch the solved puzzle in the canonical orientation.
2. Label all visible face colors.
3. Perform each base move once on the physical puzzle.
4. Record which pieces move and how they twist.
5. Convert those observations into move tables.

## Move Table Template

Each base move should eventually have a table like this:

```text
Move L:
  axis: fixed corner L
  angle: +120 degrees
  affected slots:
    ...
  piece cycle:
    slot_a -> slot_b -> slot_c -> slot_a
    ...
  orientation changes:
    ...
```

Tests should be written from these tables.

## Invariants

The engine should enforce or test:

- `L L L` returns to identity.
- `R R R` returns to identity.
- `D D D` returns to identity.
- `B B B` returns to identity.
- `L L'` returns to identity.
- `R R'` returns to identity.
- `D D'` returns to identity.
- `B B'` returns to identity.

