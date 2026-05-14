import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  applyAlgorithm,
  applyMove,
  createSolvedState,
  formatAlgorithm,
  formatMove,
  isSolved,
  parseAlgorithm,
  parseMove,
  simplifyAlgorithm,
  MOVE_AXES,
  type Move,
  type MoveAxis,
  type PuzzleState,
} from "@skewb-ultimate/puzzle-core";
import type { SolveResult, SolverId } from "@skewb-ultimate/solvers";
import type { WorkerRequest } from "./solver.worker";
import "./style.css";

type AxisId = MoveAxis;

type PuzzleFacet = {
  object: THREE.Group;
  center: THREE.Vector3;
};

type PieceFragment = {
  key: string;
  object: THREE.Group;
  center: THREE.Vector3;
};

type FacetTurn = {
  facet: PuzzleFacet;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
};

type TurnAnimation = {
  facets: FacetTurn[];
  rotation: THREE.Quaternion;
  startedAt: number;
  durationMs: number;
  move: Move;
};

type QueuedTurn = {
  move: Move;
  durationMs: number;
};

const faceColors = [
  0xffffff, 0xf4d03f, 0xd9342b, 0x2274a5, 0x2fb344, 0xf28c28,
  0x8e44ad, 0x2dd4bf, 0x1f2937, 0xf472b6, 0x9ca3af, 0x8b5e34,
];

// The vectors are dodecahedron vertices. These represent the four turn axes.
const fixedAxes: Record<AxisId, THREE.Vector3> = {
  L: new THREE.Vector3(-1, 1, -1).normalize(),
  R: new THREE.Vector3(1, 1, 1).normalize(),
  D: new THREE.Vector3(1, -1, -1).normalize(),
  B: new THREE.Vector3(-1, -1, 1).normalize(),
};

const CORE_RADIUS = 1.69;
const STICKER_SCALE = 0.9;
const STICKER_BASE_INSET = 0.006;
const PIECE_DEPTH = 0.095;
const STICKER_CORNER_RADIUS = 0.025;
const STICKER_PROTRUSION = 0.004;
const CORE_CORNER_RADIUS = 0.018;
const DEFAULT_TURN_DURATION_MS = 420;
const FAST_TURN_DURATION_MS = 300;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <main class="shell">
    <section class="viewport" aria-label="Skewb Ultimate preview"></section>
    <aside class="panel">
      <header class="solver-header">
        <p class="eyebrow">Solver</p>
        <h1>Skewb Ultimate Solver</h1>
      </header>
      <div class="action-row primary-actions">
        <button type="button" data-scramble>Scramble</button>
        <button type="button" data-clear>Reset</button>
      </div>
      <div class="solver-row">
        <select id="solver-select" aria-label="Solver algorithm">
          <option value="bidirectional-bfs">Bidirectional BFS</option>
          <option value="bidirectional-ida-star">Bidirectional IDA*</option>
          <option value="ida-star">IDA*</option>
          <option value="depth-limited-dfs">Depth-Limited DFS</option>
        </select>
        <button type="button" data-solve>Solve</button>
      </div>
      <dl class="solve-stats" hidden>
        <div class="stat-row">
          <dt>Algorithm</dt><dd id="stat-algorithm">—</dd>
        </div>
        <div class="stat-row">
          <dt>Solution</dt><dd id="stat-solution">—</dd>
        </div>
        <div class="stat-row">
          <dt>Time</dt><dd id="stat-time">—</dd>
        </div>
        <div class="stat-row">
          <dt>Nodes</dt><dd id="stat-nodes">—</dd>
        </div>
      </dl>
      <div class="scramble-length-row">
        <label for="scramble-length">Length</label>
        <input type="range" id="scramble-length" min="1" max="25" value="12" />
        <span id="scramble-length-value">12 moves</span>
      </div>
      <section class="tool-section" aria-labelledby="moves-title">
        <div class="section-heading">
          <h2 id="moves-title">Moves</h2>
        </div>
        <div class="controls" aria-label="Move controls">
          <div class="move-pair">
            <button type="button" data-move="L">L</button>
            <button type="button" data-move="L'">L'</button>
          </div>
          <div class="move-pair">
            <button type="button" data-move="R">R</button>
            <button type="button" data-move="R'">R'</button>
          </div>
          <div class="move-pair">
            <button type="button" data-move="D">D</button>
            <button type="button" data-move="D'">D'</button>
          </div>
          <div class="move-pair">
            <button type="button" data-move="B">B</button>
            <button type="button" data-move="B'">B'</button>
          </div>
        </div>
      </section>
      <form class="algorithm-form" aria-label="Move sequence input">
        <label for="algorithm-input">Move sequence</label>
        <div class="algorithm-entry">
          <input id="algorithm-input" name="algorithm" value="L R' D B" autocomplete="off" spellcheck="false" />
          <button type="submit">Play</button>
        </div>
        <p id="input-status" class="input-status">Ready</p>
      </form>
    </aside>
  </main>
`;

const viewport = document.querySelector<HTMLElement>(".viewport");

if (!viewport) {
  throw new Error("Missing viewport");
}

const puzzleViewport = viewport;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f0e7);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(5.7, 4.6, 7.3);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
puzzleViewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 4.4;
controls.maxDistance = 11;
controls.target.set(0, 0, 0);

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(3, 5, 4);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 1.4));

const puzzleGroup = new THREE.Group();
const puzzleFacets = createVisualPieces();
const initialFacetTransforms = new Map<PuzzleFacet, {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  center: THREE.Vector3;
}>();
puzzleGroup.rotation.set(0.2, 0.35, -0.08);
puzzleFacets.forEach((facet) => {
  initialFacetTransforms.set(facet, {
    position: facet.object.position.clone(),
    quaternion: facet.object.quaternion.clone(),
    center: facet.center.clone(),
  });
  puzzleGroup.add(facet.object);
});
puzzleGroup.add(createAxisMarkers());
scene.add(puzzleGroup);

let activeTurn: TurnAnimation | undefined;
const turnQueue: QueuedTurn[] = [];
let moveHistory: Move[] = [];
let engineState: PuzzleState = createSolvedState();
let completionStatus: string | undefined;
let solving = false;

const solverWorker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });

function solveAsync(solverId: SolverId, state: PuzzleState): Promise<SolveResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<SolveResult>) => {
      solverWorker.removeEventListener("message", onMessage);
      solverWorker.removeEventListener("error", onError);
      resolve(event.data);
    };
    const onError = (event: ErrorEvent) => {
      solverWorker.removeEventListener("message", onMessage);
      solverWorker.removeEventListener("error", onError);
      reject(new Error(event.message));
    };
    solverWorker.addEventListener("message", onMessage);
    solverWorker.addEventListener("error", onError);
    const request: WorkerRequest = { solverId, state };
    solverWorker.postMessage(request);
  });
}

const algorithmForm = requireElement<HTMLFormElement>(".algorithm-form");
const algorithmInput = requireElement<HTMLInputElement>("#algorithm-input");
const inputStatus = requireElement<HTMLElement>("#input-status");
const scrambleLengthInput = requireElement<HTMLInputElement>("#scramble-length");
const scrambleLengthValue = requireElement<HTMLElement>("#scramble-length-value");
const solverSelect = requireElement<HTMLSelectElement>("#solver-select");
const solveStats = requireElement<HTMLElement>(".solve-stats");
const statAlgorithm = requireElement<HTMLElement>("#stat-algorithm");
const statSolution = requireElement<HTMLElement>("#stat-solution");
const statTime = requireElement<HTMLElement>("#stat-time");
const statNodes = requireElement<HTMLElement>("#stat-nodes");

scrambleLengthInput.addEventListener("input", () => {
  scrambleLengthValue.textContent = `${scrambleLengthInput.value} moves`;
});

document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    const moveToken = button.dataset.move;

    if (moveToken) {
      enqueueMoves([parseMove(moveToken)], DEFAULT_TURN_DURATION_MS);
    }
  });
});

document.querySelector<HTMLButtonElement>("[data-scramble]")?.addEventListener("click", () => {
  const length = Number(scrambleLengthInput.value);
  const scramble = createRandomScramble(length);

  setInputStatus(`Scramble (${length}): ${formatAlgorithm(scramble)}`);
  enqueueMoves(scramble, FAST_TURN_DURATION_MS);
  setHashScramble(scramble);
});

const solveButton = document.querySelector<HTMLButtonElement>("[data-solve]");

solveButton?.addEventListener("click", async () => {
  if (solving) return;

  const pendingMoves = [
    ...(activeTurn ? [activeTurn.move] : []),
    ...turnQueue.map((turn) => turn.move),
  ];
  const projectedState = applyAlgorithm(engineState, pendingMoves);

  if (isSolved(projectedState)) {
    setInputStatus("Already solved.");
    return;
  }

  const solverId = solverSelect.value as SolverId;
  const solverName = solverSelect.options[solverSelect.selectedIndex]?.text ?? solverId;

  solving = true;
  if (solveButton) solveButton.disabled = true;
  solverSelect.disabled = true;
  setInputStatus(`Solving with ${solverName}…`);

  const result = await solveAsync(solverId, projectedState);

  solving = false;
  if (solveButton) solveButton.disabled = false;
  solverSelect.disabled = false;

  if (result.status === "solved") {
    const { solution, stats } = result;
    setInputStatus(`Solution found: ${formatAlgorithm(solution)}`);
    showStats(solverName, solution.length, stats.elapsedMs, stats.nodesExpanded);
    completionStatus = "Solved.";
    enqueueMoves(solution, FAST_TURN_DURATION_MS);
  } else {
    setInputStatus("No solution found within node limit.");
  }
});

document.querySelector<HTMLButtonElement>("[data-clear]")?.addEventListener("click", () => {
  resetVisualState();
  clearHashScramble();
  setInputStatus("Reset puzzle.");
});

algorithmForm.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    const moves = parseAlgorithm(algorithmInput.value);

    if (moves.length === 0) {
      setInputStatus("Enter at least one move.");
      return;
    }

    setInputStatus(`Playing: ${formatAlgorithm(moves)}`);
    enqueueMoves(moves, DEFAULT_TURN_DURATION_MS);
  } catch (error) {
    setInputStatus(error instanceof Error ? error.message : "Invalid algorithm.");
  }
});

function resize() {
  const width = Math.max(1, Math.round(puzzleViewport.clientWidth));
  const height = Math.max(1, Math.round(puzzleViewport.clientHeight));

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  controls.update();
  updateTurnAnimation(performance.now());
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

const viewportResizeObserver = new ResizeObserver(resize);

viewportResizeObserver.observe(puzzleViewport);
window.addEventListener("resize", resize);
resize();
animate();
loadHashScramble();

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function setInputStatus(message: string) {
  inputStatus.textContent = message;
}

function setHashScramble(scramble: readonly Move[]) {
  const encoded = formatAlgorithm(scramble).replace(/ /g, "_");
  history.replaceState(null, "", `#${encoded}`);
}

function clearHashScramble() {
  history.replaceState(null, "", location.pathname + location.search);
}

function loadHashScramble() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  try {
    const scramble = parseAlgorithm(hash.replace(/_/g, " "));
    if (scramble.length === 0) return;
    enqueueMoves(scramble, FAST_TURN_DURATION_MS);
    setInputStatus(`Loaded: ${formatAlgorithm(scramble)}`);
  } catch {
    // ignore malformed hash
  }
}

function showStats(algorithm: string, moves: number, elapsedMs: number, nodes: number) {
  statAlgorithm.textContent = algorithm;
  statSolution.textContent = `${moves} move${moves === 1 ? "" : "s"}`;
  statTime.textContent = elapsedMs < 1 ? "<1 ms" : `${Math.round(elapsedMs).toLocaleString()} ms`;
  statNodes.textContent = nodes.toLocaleString();
  solveStats.removeAttribute("hidden");
}

function resetVisualState() {
  activeTurn = undefined;
  turnQueue.length = 0;
  moveHistory = [];
  engineState = createSolvedState();
  completionStatus = undefined;

  puzzleFacets.forEach((facet) => {
    const initial = initialFacetTransforms.get(facet);

    if (!initial) {
      return;
    }

    facet.object.position.copy(initial.position);
    facet.object.quaternion.copy(initial.quaternion);
    facet.center.copy(initial.center);
  });
}

function enqueueMoves(moves: readonly Move[], durationMs: number) {
  if (moves.length === 0) {
    return;
  }

  turnQueue.push(...moves.map((move) => ({ move, durationMs })));
}

function updateTurnAnimation(now: number) {
  if (!activeTurn) {
    const next = turnQueue.shift();

    if (!next) {
      if (completionStatus && moveHistory.length === 0) {
        setInputStatus(completionStatus);
        completionStatus = undefined;
      }

      return;
    }

    activeTurn = createTurnAnimation(next.move, next.durationMs, now);
  }

  const t = Math.min((now - activeTurn.startedAt) / activeTurn.durationMs, 1);
  const eased = easeInOutCubic(t);
  const frameRotation = new THREE.Quaternion().slerp(activeTurn.rotation, eased);

  activeTurn.facets.forEach((turn) => {
    turn.facet.object.position.copy(turn.startPosition).applyQuaternion(frameRotation);
    turn.facet.object.quaternion
      .copy(frameRotation)
      .multiply(turn.startQuaternion);
  });

  if (t >= 1) {
    const completedTurn = activeTurn;

    activeTurn.facets.forEach((turn) => {
      turn.facet.object.position.copy(turn.startPosition).applyQuaternion(completedTurn.rotation);
      turn.facet.object.quaternion
        .copy(completedTurn.rotation)
        .multiply(turn.startQuaternion);
      turn.facet.center.copy(turn.facet.object.position);
    });
    engineState = applyMove(engineState, completedTurn.move);
    moveHistory = simplifyAlgorithm([...moveHistory, completedTurn.move]);
    activeTurn = undefined;
  }
}

function createTurnAnimation(move: Move, durationMs: number, now: number): TurnAnimation {
  // Clockwise is viewed from outside the fixed corner looking toward the center.
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    fixedAxes[move.axis],
    move.amount * ((-Math.PI * 2) / 3),
  );
  const facets = selectTurningFacets(fixedAxes[move.axis]).map((facet) => {
    const startPosition = facet.object.position.clone();
    const startQuaternion = facet.object.quaternion.clone();

    return {
      facet,
      startPosition,
      startQuaternion,
    };
  });

  return {
    facets,
    rotation,
    startedAt: now,
    durationMs,
    move,
  };
}

function createRandomScramble(length: number): Move[] {
  const scramble: Move[] = [];
  let previousAxis: MoveAxis | undefined;

  while (scramble.length < length) {
    const availableAxes = MOVE_AXES.filter((axis) => axis !== previousAxis);
    const axis = availableAxes[randomIndex(availableAxes.length)]!;
    const amount = Math.random() < 0.5 ? 1 : -1;

    scramble.push({ axis, amount });
    previousAxis = axis;
  }

  return scramble;
}

function randomIndex(length: number) {
  return Math.floor(Math.random() * length);
}

function createVisualPieces(): PuzzleFacet[] {
  return groupPhysicalPieces([...createCoreFragments(), ...createStickerFragments()]);
}

function createCoreFragments(): PieceFragment[] {
  return createDodecahedronFaces(CORE_RADIUS).flatMap(({ normal, ordered }) =>
    splitFaceByCutPlanes(ordered).map((pieceVertices) => {
      const pieceCenter = centerLocal(pieceVertices);

      return {
        key: pieceKey(pieceCenter),
        object: createCorePieceGroup(pieceVertices, pieceCenter, normal),
        center: pieceCenter,
      };
    }),
  );
}

function createStickerFragments(): PieceFragment[] {
  return createDodecahedronFaces(1.7).flatMap(({ normal, ordered }, faceIndex) => {
    const color = new THREE.Color(faceColors[faceIndex % faceColors.length]);

    return splitFaceByCutPlanes(ordered).map((pieceVertices) => {
      const pieceCenter = centerLocal(pieceVertices);

      return {
        key: pieceKey(pieceCenter),
        object: createCutPieceGroup(pieceVertices, pieceCenter, normal, color),
        center: pieceCenter,
      };
    });
  });
}

function groupPhysicalPieces(fragments: PieceFragment[]): PuzzleFacet[] {
  const groups = new Map<string, PieceFragment[]>();

  fragments.forEach((fragment) => {
    const group = groups.get(fragment.key) ?? [];

    group.push(fragment);
    groups.set(fragment.key, group);
  });

  return [...groups.values()].map((fragmentsForPiece) => {
    const pieceCenter = fragmentsForPiece
      .reduce((sum, fragment) => sum.add(fragment.center), new THREE.Vector3())
      .multiplyScalar(1 / fragmentsForPiece.length);
    const group = new THREE.Group();

    group.position.copy(pieceCenter);

    fragmentsForPiece.forEach((fragment) => {
      fragment.object.position.sub(pieceCenter);
      group.add(fragment.object);
    });

    return {
      object: group,
      center: pieceCenter,
    };
  });
}

function pieceKey(center: THREE.Vector3) {
  return (Object.keys(fixedAxes) as AxisId[])
    .map((axisId) => `${axisId}${center.dot(fixedAxes[axisId]) >= 0 ? "+" : "-"}`)
    .join("|");
}

function createDodecahedronFaces(radius: number) {
  const geometry = new THREE.DodecahedronGeometry(radius, 0);
  const positions = geometry.getAttribute("position");
  const faceGroups = new Map<string, THREE.Vector3[]>();
  const faceNormals = new Map<string, THREE.Vector3>();

  for (let i = 0; i < positions.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, i);
    const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();

    if (normal.dot(a.clone().add(b).add(c)) < 0) {
      normal.negate();
    }

    const key = normalKey(normal);

    if (!faceGroups.has(key)) {
      faceGroups.set(key, []);
      faceNormals.set(key, normal);
    }

    faceGroups.get(key)!.push(a, b, c);
  }

  return [...faceGroups.entries()].map(([key, triangleVertices]) => {
    const normal = faceNormals.get(key)!;
    const vertices = uniqueVertices(triangleVertices);
    const center = vertices
      .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
      .multiplyScalar(1 / vertices.length);
    const ordered = sortFaceVertices(vertices, center, normal);

    return { normal, ordered };
  });
}

function selectTurningFacets(axis: THREE.Vector3) {
  return puzzleFacets.filter((facet) => facet.center.dot(axis) > 0.0001);
}

function createAxisMarkers() {
  const group = new THREE.Group();

  for (const [label, axis] of Object.entries(fixedAxes)) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 18, 12),
      new THREE.MeshStandardMaterial({
        color: 0x101820,
        roughness: 0.4,
      }),
    );
    marker.position.copy(axis.clone().multiplyScalar(2.2));
    marker.name = label;
    group.add(marker);
  }

  return group;
}

function createCorePieceGroup(
  vertices: THREE.Vector3[],
  center: THREE.Vector3,
  normal: THREE.Vector3,
) {
  const group = new THREE.Group();
  const localVertices = vertices.map((vertex) => vertex.clone().sub(center));
  const roundedLocalVertices = createRoundedPolygonPoints(localVertices, CORE_CORNER_RADIUS);
  const surface = new THREE.Mesh(
    createPolygonGeometry(roundedLocalVertices),
    new THREE.MeshStandardMaterial({
      color: 0x090d12,
      roughness: 0.88,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    }),
  );

  group.position.copy(center);
  group.add(surface);

  const sideWall = new THREE.Mesh(
    createPolygonSideWallGeometry(roundedLocalVertices, normal, PIECE_DEPTH),
    new THREE.MeshStandardMaterial({
      color: 0x090d12,
      roughness: 0.88,
      side: THREE.DoubleSide,
    }),
  );

  group.add(sideWall);

  return group;
}

function createCutPieceGroup(
  vertices: THREE.Vector3[],
  center: THREE.Vector3,
  normal: THREE.Vector3,
  color: THREE.Color,
) {
  const group = new THREE.Group();
  const localVertices = vertices.map((vertex) => vertex.clone().sub(center));
  const stickerVertices = shrinkPolygon(localVertices, STICKER_SCALE)
    .map((vertex) => vertex.sub(normal.clone().multiplyScalar(STICKER_BASE_INSET)));
  const roundedStickerVertices = createRoundedPolygonPoints(
    stickerVertices,
    STICKER_CORNER_RADIUS,
  );

  group.position.copy(center);

  const stickerMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.52,
    metalness: 0.02,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const sticker = createStickerSolid(roundedStickerVertices, normal, stickerMaterial);

  group.add(sticker);

  return group;
}

function createStickerSolid(
  baseVertices: THREE.Vector3[],
  normal: THREE.Vector3,
  material: THREE.Material,
) {
  const topVertices = baseVertices.map((vertex) =>
    vertex.clone().add(normal.clone().multiplyScalar(STICKER_BASE_INSET + STICKER_PROTRUSION)),
  );
  const group = new THREE.Group();

  group.add(new THREE.Mesh(createPolygonGeometry(topVertices), material));
  group.add(new THREE.Mesh(
    createSideWallBetweenPolygons(baseVertices, topVertices),
    material,
  ));

  return group;
}

function createSideWallBetweenPolygons(
  bottomVertices: THREE.Vector3[],
  topVertices: THREE.Vector3[],
) {
  const geometry = new THREE.BufferGeometry();
  const indices: number[] = [];
  const vertexCount = topVertices.length;

  if (bottomVertices.length !== vertexCount) {
    throw new Error("Side wall geometry requires matching polygons");
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const topCurrent = i;
    const topNext = (i + 1) % vertexCount;
    const bottomCurrent = vertexCount + i;
    const bottomNext = vertexCount + ((i + 1) % vertexCount);

    indices.push(topCurrent, bottomCurrent, bottomNext);
    indices.push(topCurrent, bottomNext, topNext);
  }

  geometry.setFromPoints([...topVertices, ...bottomVertices]);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function createRoundedPolygonPoints(vertices: THREE.Vector3[], radius: number) {
  const rounded: THREE.Vector3[] = [];

  vertices.forEach((current, index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const previousEdgeLength = current.distanceTo(previous);
    const nextEdgeLength = current.distanceTo(next);
    const cornerDistance = Math.min(radius, previousEdgeLength * 0.35, nextEdgeLength * 0.35);
    const fromPrevious = current
      .clone()
      .add(previous.clone().sub(current).normalize().multiplyScalar(cornerDistance));
    const towardNext = current
      .clone()
      .add(next.clone().sub(current).normalize().multiplyScalar(cornerDistance));
    const segments = 5;

    rounded.push(fromPrevious);

    for (let segment = 1; segment < segments; segment += 1) {
      const t = segment / segments;
      rounded.push(quadraticBezier(fromPrevious, current, towardNext, t));
    }

    rounded.push(towardNext);
  });

  return rounded;
}

function quadraticBezier(
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  t: number,
) {
  const oneMinusT = 1 - t;

  return start
    .clone()
    .multiplyScalar(oneMinusT * oneMinusT)
    .add(control.clone().multiplyScalar(2 * oneMinusT * t))
    .add(end.clone().multiplyScalar(t * t));
}

function createPolygonSideWallGeometry(
  topVertices: THREE.Vector3[],
  outwardNormal: THREE.Vector3,
  depth: number,
) {
  const bottomVertices = topVertices.map((vertex) =>
    vertex.clone().sub(outwardNormal.clone().multiplyScalar(depth)),
  );
  const geometry = new THREE.BufferGeometry();
  const indices: number[] = [];
  const vertexCount = topVertices.length;

  for (let i = 0; i < vertexCount; i += 1) {
    const topCurrent = i;
    const topNext = (i + 1) % vertexCount;
    const bottomCurrent = vertexCount + i;
    const bottomNext = vertexCount + ((i + 1) % vertexCount);

    indices.push(topCurrent, bottomCurrent, bottomNext);
    indices.push(topCurrent, bottomNext, topNext);
  }

  geometry.setFromPoints([...topVertices, ...bottomVertices]);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function splitFaceByCutPlanes(vertices: THREE.Vector3[]) {
  let pieces = [vertices];

  Object.values(fixedAxes).forEach((axis) => {
    pieces = pieces.flatMap((piece) => splitPolygonByPlane(piece, axis));
  });

  return pieces.filter((piece) => piece.length >= 3);
}

function splitPolygonByPlane(vertices: THREE.Vector3[], planeNormal: THREE.Vector3) {
  const positive = clipPolygonByHalfSpace(vertices, planeNormal, 1);
  const negative = clipPolygonByHalfSpace(vertices, planeNormal, -1);

  return [positive, negative].filter((piece) => piece.length >= 3);
}

function clipPolygonByHalfSpace(
  vertices: THREE.Vector3[],
  planeNormal: THREE.Vector3,
  side: 1 | -1,
) {
  const clipped: THREE.Vector3[] = [];
  const signedDistance = (vertex: THREE.Vector3) => vertex.dot(planeNormal) * side;
  const includesVertex = (vertex: THREE.Vector3) => signedDistance(vertex) >= -0.0001;

  vertices.forEach((current, index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length]!;
    const currentInside = includesVertex(current);
    const previousInside = includesVertex(previous);

    if (currentInside !== previousInside) {
      clipped.push(intersectSegmentWithPlane(previous, current, planeNormal));
    }

    if (currentInside) {
      clipped.push(current.clone());
    }
  });

  return removeDuplicateVertices(clipped);
}

function intersectSegmentWithPlane(
  start: THREE.Vector3,
  end: THREE.Vector3,
  planeNormal: THREE.Vector3,
) {
  const startDistance = start.dot(planeNormal);
  const endDistance = end.dot(planeNormal);
  const amount = startDistance / (startDistance - endDistance);

  return start.clone().lerp(end, amount);
}

function removeDuplicateVertices(vertices: THREE.Vector3[]) {
  const deduped: THREE.Vector3[] = [];

  vertices.forEach((vertex) => {
    const previous = deduped.at(-1);

    if (!previous || previous.distanceToSquared(vertex) > 0.000001) {
      deduped.push(vertex);
    }
  });

  if (deduped.length > 1 && deduped[0]!.distanceToSquared(deduped.at(-1)!) <= 0.000001) {
    deduped.pop();
  }

  return deduped;
}

function createPolygonGeometry(vertices: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry();
  const localVertices = [centerLocal(vertices), ...vertices];
  const indices: number[] = [];

  for (let i = 1; i <= vertices.length; i += 1) {
    indices.push(0, i, i === vertices.length ? 1 : i + 1);
  }

  geometry.setFromPoints(localVertices);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function shrinkPolygon(vertices: THREE.Vector3[], scale: number) {
  const center = centerLocal(vertices);

  return vertices.map((vertex) => center.clone().lerp(vertex, scale));
}

function centerLocal(vertices: THREE.Vector3[]) {
  return vertices
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / vertices.length);
}

function uniqueVertices(vertices: THREE.Vector3[]) {
  const unique = new Map<string, THREE.Vector3>();

  vertices.forEach((vertex) => {
    unique.set(
      vertex
        .toArray()
        .map((value) => value.toFixed(5))
        .join(","),
      vertex,
    );
  });

  return [...unique.values()];
}

function sortFaceVertices(
  vertices: THREE.Vector3[],
  center: THREE.Vector3,
  normal: THREE.Vector3,
) {
  const basisX = vertices[0]!.clone().sub(center).normalize();
  const basisY = normal.clone().cross(basisX).normalize();

  return [...vertices].sort((left, right) => {
    const leftOffset = left.clone().sub(center);
    const rightOffset = right.clone().sub(center);
    const leftAngle = Math.atan2(leftOffset.dot(basisY), leftOffset.dot(basisX));
    const rightAngle = Math.atan2(rightOffset.dot(basisY), rightOffset.dot(basisX));

    return leftAngle - rightAngle;
  });
}

function normalKey(normal: THREE.Vector3) {
  return normal
    .toArray()
    .map((value) => Math.round(value * 100) / 100)
    .join(",");
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

