# Physical Puzzle Mapping Worksheet

This worksheet captures observations from the real 12-color Skewb Ultimate. It should become the bridge between the physical puzzle and the engine move tables.

Do not treat this file as final until every move has been verified on the physical puzzle.

## Canonical Solved Orientation

Choose one solved orientation and keep it stable.

```text
Top/most visible reference face color:
Front/primary reference face color:
Left reference face color:
Right reference face color:
Down reference face color:
Back reference face color:
```

Notes:

```text
TODO
```

## Fixed Corners

Label the four fixed-corner axes used by Jaap-style notation.

For each fixed corner, record the face colors surrounding that corner in clockwise order when looking directly at the corner.

### Fixed Corner L

```text
Physical location:
Surrounding face colors clockwise:
Notes:
```

### Fixed Corner R

```text
Physical location:
Surrounding face colors clockwise:
Notes:
```

### Fixed Corner D

```text
Physical location:
Surrounding face colors clockwise:
Notes:
```

### Fixed Corner B

```text
Physical location:
Surrounding face colors clockwise:
Notes:
```

## Face Labels

Fill this table once the canonical orientation is chosen.

Jaap labels many faces by the fixed corners they lie between, such as `DR`, `DL`, `LR`, and `DB`.

| Face Label | Physical Color | Adjacent Fixed Corners | Notes |
| --- | --- | --- | --- |
| `DR` | TODO | `D`, `R` | TODO |
| `DL` | TODO | `D`, `L` | TODO |
| `LR` | TODO | `L`, `R` | TODO |
| `DB` | TODO | `D`, `B` | TODO |
| TODO | TODO | TODO | TODO |
| TODO | TODO | TODO | TODO |
| TODO | TODO | TODO | TODO |
| TODO | TODO | TODO | TODO |
| TODO | TODO | TODO | TODO |
| TODO | TODO | TODO | TODO |
| TODO | TODO | TODO | TODO |
| TODO | TODO | TODO | TODO |

## Piece Inventory

We need stable IDs for all movable physical pieces.

Use temporary labels until we finalize the actual model.

| Piece ID | Colors On Piece | Type/Shape | Solved Slot | Orientation Mark |
| --- | --- | --- | --- | --- |
| `P0` | TODO | TODO | TODO | TODO |
| `P1` | TODO | TODO | TODO | TODO |
| `P2` | TODO | TODO | TODO | TODO |
| `P3` | TODO | TODO | TODO | TODO |
| `P4` | TODO | TODO | TODO | TODO |
| `P5` | TODO | TODO | TODO | TODO |
| `P6` | TODO | TODO | TODO | TODO |
| `P7` | TODO | TODO | TODO | TODO |
| `P8` | TODO | TODO | TODO | TODO |
| `P9` | TODO | TODO | TODO | TODO |
| `P10` | TODO | TODO | TODO | TODO |
| `P11` | TODO | TODO | TODO | TODO |
| `P12` | TODO | TODO | TODO | TODO |
| `P13` | TODO | TODO | TODO | TODO |

## Move Observation Protocol

For each move:

1. Start from solved state.
2. Mark or photograph the visible pieces.
3. Apply the move once.
4. Record which pieces moved.
5. Record where each moved piece landed.
6. Record any orientation/twist change.
7. Apply the same move twice more and confirm the puzzle returns to solved.

## Move L

```text
Axis:
Clockwise definition:
Affected physical pieces:
Piece cycles:
Orientation changes:
Notes:
```

## Move R

```text
Axis:
Clockwise definition:
Affected physical pieces:
Piece cycles:
Orientation changes:
Notes:
```

## Move D

```text
Axis:
Clockwise definition:
Affected physical pieces:
Piece cycles:
Orientation changes:
Notes:
```

## Move B

```text
Axis:
Clockwise definition:
Affected physical pieces:
Piece cycles:
Orientation changes:
Notes:
```

## Validation Checklist

- `L L L` returns to solved.
- `R R R` returns to solved.
- `D D D` returns to solved.
- `B B B` returns to solved.
- `L L'` returns to solved.
- `R R'` returns to solved.
- `D D'` returns to solved.
- `B B'` returns to solved.
- All recorded piece cycles agree with physical observations.
- All recorded orientation changes agree with physical observations.

