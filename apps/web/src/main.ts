import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parseAlgorithm } from "@skewb-ultimate/puzzle-core";
import { randomWalkSolver } from "@skewb-ultimate/solvers";
import "./style.css";

type AxisId = "L" | "R" | "D" | "B";

type PuzzleFacet = {
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
  label: AxisId;
};

const faceColors = [
  0xffffff, 0xf4d03f, 0xd9342b, 0x2274a5, 0x2fb344, 0xf28c28,
  0x8e44ad, 0x2dd4bf, 0x1f2937, 0xf472b6, 0x9ca3af, 0x8b5e34,
];

// The vectors are dodecahedron vertices. These represent the four fixed-corner
// axes used by Jaap-style L/R/D/B notation.
const fixedAxes: Record<AxisId, THREE.Vector3> = {
  L: new THREE.Vector3(-1, 1, -1).normalize(),
  R: new THREE.Vector3(1, 1, 1).normalize(),
  D: new THREE.Vector3(1, -1, -1).normalize(),
  B: new THREE.Vector3(-1, -1, 1).normalize(),
};

const CORE_RADIUS = 1.69;
const STICKER_SCALE = 0.925;
const SURFACE_LIFT = 0.0005;
const PIECE_DEPTH = 0.095;
const STICKER_CORNER_RADIUS = 0.025;
const STICKER_THICKNESS = 0.014;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <main class="shell">
    <section class="viewport" aria-label="Skewb Ultimate preview"></section>
    <aside class="panel">
      <div>
        <p class="eyebrow">Skewb Ultimate Solver Lab</p>
        <h1>Skewb Ultimate visual lab</h1>
        <p class="summary">
          A 12-color deep-cut dodecahedron with Jaap-style move axes. Physical
          piece cycles come next after mapping the real puzzle.
        </p>
      </div>
      <div class="controls" aria-label="Move controls">
        <button type="button" data-move="L">L</button>
        <button type="button" data-move="R">R</button>
        <button type="button" data-move="D">D</button>
        <button type="button" data-move="B">B</button>
        <button type="button" data-scramble>Scramble</button>
      </div>
      <dl class="stats">
        <div><dt>State</dt><dd id="state-status">Visual shell</dd></div>
        <div><dt>Notation</dt><dd id="notation-status">L R D B</dd></div>
        <div><dt>Solver</dt><dd id="solver-status">Random walk stub</dd></div>
        <div><dt>Move</dt><dd id="move-status">Idle</dd></div>
      </dl>
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
camera.position.set(4.2, 3.4, 5.4);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
puzzleViewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 3.4;
controls.maxDistance = 9;
controls.target.set(0, 0, 0);

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(3, 5, 4);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 1.4));

const puzzleGroup = new THREE.Group();
const puzzleFacets = [...createCoreFacets(), ...createPuzzleFacets()];
puzzleGroup.rotation.set(0.2, 0.35, -0.08);
puzzleFacets.forEach((facet) => puzzleGroup.add(facet.object));
puzzleGroup.add(createAxisMarkers());
scene.add(puzzleGroup);

let activeTurn: TurnAnimation | undefined;
const turnQueue: AxisId[] = [];

document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    const axis = button.dataset.move;
    if (isAxisId(axis)) {
      enqueueTurn(axis);
    }
  });
});

document.querySelector<HTMLButtonElement>("[data-scramble]")?.addEventListener("click", () => {
  turnQueue.push("L", "R", "D", "B", "R", "L");
});

const parsed = parseAlgorithm("L R' D B");
const baseline = randomWalkSolver();

document.querySelector("#state-status")!.textContent = "cut face model";
document.querySelector("#notation-status")!.textContent = parsed
  .map((move) => `${move.axis}${move.amount < 0 ? "'" : ""}`)
  .join(" ");
document.querySelector("#solver-status")!.textContent = baseline.name;

function resize() {
  const width = puzzleViewport.clientWidth;
  const height = puzzleViewport.clientHeight;
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

window.addEventListener("resize", resize);
resize();
animate();

function enqueueTurn(axis: AxisId) {
  turnQueue.push(axis);
}

function updateTurnAnimation(now: number) {
  if (!activeTurn) {
    const next = turnQueue.shift();

    if (!next) {
      document.querySelector("#move-status")!.textContent = "Idle";
      return;
    }

    activeTurn = createTurnAnimation(next, now);
    document.querySelector("#move-status")!.textContent =
      `${activeTurn.label} (${activeTurn.facets.length} facets)`;
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
    activeTurn = undefined;
  }
}

function createTurnAnimation(axisId: AxisId, now: number): TurnAnimation {
  // Clockwise is viewed from outside the fixed corner looking toward the center.
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    fixedAxes[axisId],
    (-Math.PI * 2) / 3,
  );
  const facets = selectTurningFacets(fixedAxes[axisId]).map((facet) => {
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
    durationMs: 620,
    label: axisId,
  };
}

function createCoreFacets(): PuzzleFacet[] {
  return createDodecahedronFaces(CORE_RADIUS).flatMap(({ normal, ordered }) =>
    splitFaceByCutPlanes(ordered).map((pieceVertices) => {
      const pieceCenter = centerLocal(pieceVertices);

      return {
        object: createCorePieceGroup(pieceVertices, pieceCenter, normal),
        center: pieceCenter,
      };
    }),
  );
}

function createPuzzleFacets(): PuzzleFacet[] {
  return createDodecahedronFaces(1.7).flatMap(({ normal, ordered }, faceIndex) => {
    const color = new THREE.Color(faceColors[faceIndex % faceColors.length]);

    return splitFaceByCutPlanes(ordered).map((pieceVertices) => {
      const pieceCenter = centerLocal(pieceVertices);

      return {
        object: createCutPieceGroup(pieceVertices, pieceCenter, normal, color),
        center: pieceCenter,
      };
    });
  });
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
  const surface = new THREE.Mesh(
    createPolygonGeometry(localVertices),
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
    createPolygonSideWallGeometry(localVertices, normal, PIECE_DEPTH),
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
    .map((vertex) => vertex.add(normal.clone().multiplyScalar(SURFACE_LIFT)));
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
    vertex.clone().add(normal.clone().multiplyScalar(STICKER_THICKNESS)),
  );
  const group = new THREE.Group();

  group.add(new THREE.Mesh(createPolygonGeometry(topVertices), material));
  group.add(new THREE.Mesh(
    createPolygonSideWallGeometry(topVertices, normal, STICKER_THICKNESS),
    material,
  ));

  return group;
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

function isAxisId(value: string | undefined): value is AxisId {
  return value === "L" || value === "R" || value === "D" || value === "B";
}
