import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createSolvedState, parseAlgorithm } from "@skewb-ultimate/puzzle-core";
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
  endPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  endQuaternion: THREE.Quaternion;
};

type TurnAnimation = {
  facets: FacetTurn[];
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
          A 12-color dodecahedron shell with Jaap-style move axes. Physical
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
const puzzleFacets = createPuzzleFacets();
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

const state = createSolvedState();
const parsed = parseAlgorithm("L R' D B");
const baseline = randomWalkSolver();

document.querySelector("#state-status")!.textContent = state.kind;
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

  activeTurn.facets.forEach((turn) => {
    turn.facet.object.position.copy(turn.startPosition).lerp(turn.endPosition, eased);
    turn.facet.object.quaternion
      .copy(turn.startQuaternion)
      .slerp(turn.endQuaternion, eased);
  });

  if (t >= 1) {
    activeTurn.facets.forEach((turn) => {
      turn.facet.object.position.copy(turn.endPosition);
      turn.facet.object.quaternion.copy(turn.endQuaternion);
      turn.facet.center.copy(turn.endPosition);
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
        endPosition: startPosition.clone().applyQuaternion(rotation),
        startQuaternion,
        endQuaternion: rotation.clone().multiply(startQuaternion),
      };
  });

  return {
    facets,
    startedAt: now,
    durationMs: 620,
    label: axisId,
  };
}

function createPuzzleFacets(): PuzzleFacet[] {
  const geometry = new THREE.DodecahedronGeometry(1.7, 0).toNonIndexed();
  const positions = geometry.getAttribute("position");
  const faceMap = new Map<string, number>();
  const facets: PuzzleFacet[] = [];

  for (let i = 0; i < positions.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, i);
    const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const faceIndex = getOrCreateFaceIndex(faceMap, normalKey(normal));
    const color = new THREE.Color(faceColors[faceIndex % faceColors.length]);
    const center = new THREE.Vector3()
      .add(a)
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    const facetGeometry = new THREE.BufferGeometry();

    facetGeometry.setFromPoints([
      a.clone().sub(center),
      b.clone().sub(center),
      c.clone().sub(center),
    ]);
    facetGeometry.setIndex([0, 1, 2]);
    facetGeometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      facetGeometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.62,
        metalness: 0.04,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(facetGeometry),
      new THREE.LineBasicMaterial({
        color: 0x1b1f23,
        transparent: true,
        opacity: 0.42,
      }),
    );
    const group = new THREE.Group();

    group.position.copy(center);
    group.add(mesh);
    group.add(edges);

    facets.push({
      object: group,
      center,
    });
  }

  return facets;
}

function selectTurningFacets(axis: THREE.Vector3) {
  return [...puzzleFacets]
    .sort((a, b) => b.center.dot(axis) - a.center.dot(axis))
    .slice(0, puzzleFacets.length / 2);
}

function createAxisMarkers() {
  const group = new THREE.Group();

  for (const [label, axis] of Object.entries(fixedAxes)) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.4 }),
    );
    marker.position.copy(axis.clone().multiplyScalar(2.2));
    marker.name = label;
    group.add(marker);
  }

  return group;
}

function getOrCreateFaceIndex(faceMap: Map<string, number>, key: string) {
  const existing = faceMap.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const next = faceMap.size;
  faceMap.set(key, next);
  return next;
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
