import * as THREE from "three";
import { createSolvedState, parseAlgorithm } from "@skewb-ultimate/puzzle-core";
import { randomWalkSolver } from "@skewb-ultimate/solvers";
import "./style.css";

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
        <h1>Move-accurate solver experiments</h1>
        <p class="summary">
          Planning scaffold for a realistic 12-color Skewb Ultimate visualizer.
          The first implementation target is accurate move animation.
        </p>
      </div>
      <dl class="stats">
        <div><dt>State</dt><dd id="state-status">Solved placeholder</dd></div>
        <div><dt>Notation</dt><dd id="notation-status">L R D B</dd></div>
        <div><dt>Solver</dt><dd id="solver-status">Random walk stub</dd></div>
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
scene.background = new THREE.Color(0xf7f5ef);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4, 3, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
puzzleViewport.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(3, 5, 4);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 1.4));

const geometry = new THREE.DodecahedronGeometry(1.55, 0);
const material = new THREE.MeshStandardMaterial({
  color: 0xdbc56d,
  roughness: 0.55,
  metalness: 0.05,
  flatShading: true,
});

const placeholder = new THREE.Mesh(geometry, material);
placeholder.rotation.set(0.25, 0.35, 0.1);
scene.add(placeholder);

const state = createSolvedState();
const parsed = parseAlgorithm("L R' D B");
const baseline = randomWalkSolver();

document.querySelector("#state-status")!.textContent = `${state.kind}`;
document.querySelector("#notation-status")!.textContent = parsed.map((move) => `${move.axis}${move.amount < 0 ? "'" : ""}`).join(" ");
document.querySelector("#solver-status")!.textContent = baseline.name;

function resize() {
  const width = puzzleViewport.clientWidth;
  const height = puzzleViewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  placeholder.rotation.y += 0.006;
  placeholder.rotation.x += 0.002;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
resize();
animate();
