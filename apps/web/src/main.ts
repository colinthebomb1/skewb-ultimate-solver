import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  applyAlgorithm,
  applyMove,
  createSolvedState,
  formatAlgorithm,
  formatMove,
  invertAlgorithm,
  invertMove,
  isReachablePiecePermutation,
  isSolved,
  orientationQuaternion,
  parseAlgorithm,
  parseMove,
  simplifyAlgorithm,
  MOVE_AXES,
  SLOT_IDS,
  type Move,
  type MoveAxis,
  type PuzzleState,
} from "@skewb-ultimate/puzzle-core";
import type { SolveResult, SolverId } from "@skewb-ultimate/solvers";
import type { WorkerRequest } from "./solver.worker";
import "./style.css";

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
  onComplete: (() => void) | undefined;
};

type QueuedTurn = {
  move: Move;
  durationMs: number;
  onComplete: (() => void) | undefined;
};

// Colors assigned to dodecahedron face indices 0-11, calibrated so the
// virtual solved state matches the physical Meffert Skewb Ultimate layout.
const faceColors = [
  0x00b4a0, // face 0: teal
  0xffeb3b, // face 1: yellow
  0xff2288, // face 2: hot pink
  0xb8860b, // face 3: dark gold
  0xe6e6e6, // face 4: white
  0x66e600, // face 5: lime
  0x5bc8f5, // face 6: sky blue
  0x9400d3, // face 7: purple (purple rain)
  0xdbaeff, // face 8: light purple
  0xff2a1a, // face 9: red
  0x1040a8, // face 10: deep ocean blue
  0x006e40, // face 11: dark green
];
// Human-readable names for each faceColors entry, used in the paint UI.
const colorNames = [
  "Teal",
  "Yellow",
  "Hot pink",
  "Dark gold",
  "White",
  "Lime",
  "Sky blue",
  "Purple",
  "Light purple",
  "Red",
  "Deep ocean blue",
  "Dark green",
];
const DEFAULT_PAINT_COLOR_INDEX = 4; // white

// stickerKey = `${slotIndex}:${faceIndex}` — unique per sticker in solved state
const stickerMaterials = new Map<string, THREE.MeshStandardMaterial>();
// slotFaceNormals[slotIndex] maps dodecahedron faceIndex → outward normal
const slotFaceNormals: (Map<number, THREE.Vector3> | undefined)[] = [];

let paintMode = false;
let compareMode = false;
let paintColorIndex = 0;
const userStickerColors = new Map<string, number>(); // stickerKey → color index

// The vectors are dodecahedron vertices. These represent the four turn axes.
const fixedAxes: Record<MoveAxis, THREE.Vector3> = {
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
    <section class="viewport" aria-label="Skewb Ultimate preview">
      <div class="viewport-overlay">
        <button type="button" id="paint-toggle" class="viewport-overlay-btn">My Cube</button>
        <button type="button" id="compare-toggle" class="viewport-overlay-btn">Solver Lab</button>
      </div>
    </section>
    <aside class="panel">
      <div id="normal-panel">
        <header class="solver-header">
          <h1>Skewb Ultimate Solver</h1>
        </header>
        <div class="action-row primary-actions">
          <button type="button" data-scramble>Scramble</button>
          <button type="button" data-clear>Reset</button>
        </div>
        <div class="solver-row">
          <button type="button" data-solve>Solve</button>
          <select id="solver-select" aria-label="Solver algorithm">
            <option value="ida-star">IDA*</option>
            <option value="a-star">A*</option>
            <option value="bidirectional-ida-star">Bidirectional IDA*</option>
            <option value="bidirectional-bfs">Bidirectional BFS</option>
            <option value="greedy-best-first">Greedy Best-First</option>
            <option value="two-phase">Two-Phase</option>
            <option value="depth-limited-dfs">Depth-Limited DFS</option>
          </select>
        </div>
        <div id="solution-stepper" hidden>
          <div class="stepper-sequence" id="stepper-sequence"></div>
          <div class="stepper-nav">
            <button type="button" id="step-back">← Back</button>
            <span id="step-label">0 / 0</span>
            <button type="button" id="step-forward">Next →</button>
          </div>
        </div>
        <dl class="solve-stats" hidden>
          <div class="stat-row">
            <dt>Algorithm</dt><dd id="stat-algorithm">-</dd>
          </div>
          <div class="stat-row">
            <dt>Solution</dt><dd id="stat-solution">-</dd>
          </div>
          <div class="stat-row">
            <dt>Time</dt><dd id="stat-time">-</dd>
          </div>
          <div class="stat-row">
            <dt>Nodes</dt><dd id="stat-nodes">-</dd>
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
      </div>
      <div id="paint-panel" hidden>
        <header class="solver-header">
          <p class="eyebrow">My Cube</p>
          <h1>Enter Colors</h1>
        </header>
        <p class="paint-hint">Pick a color, then click any sticker on the puzzle to paint it. Drag to rotate.</p>
        <div class="palette" id="color-palette" aria-label="Color palette" role="group"></div>
        <div class="paint-readiness" id="paint-readiness">
          <div class="paint-meter" aria-hidden="true"><span id="paint-progress-bar"></span></div>
          <div class="paint-readiness-line">
            <span id="paint-color-counts">0 / 12 colors complete</span>
          </div>
          <div id="paint-color-status" class="paint-color-status">Teal: 0 / 4 stickers painted</div>
        </div>
        <div class="paint-actions" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
          <button type="button" id="solve-painted">Solve This</button>
          <button type="button" id="mark-solved">Mark Solved</button>
          <button type="button" id="clear-paint">Clear</button>
        </div>
        <div class="paint-actions" style="margin-top:-4px;grid-template-columns:repeat(2,minmax(0,1fr))">
          <button type="button" id="copy-paint-state" style="background:#f8fafc;color:#4b5563;font-size:12px;min-height:36px">Copy State</button>
          <button type="button" id="import-paint-state" style="background:#f8fafc;color:#4b5563;font-size:12px;min-height:36px">Import State</button>
        </div>
        <p id="input-status-paint" class="input-status"></p>
      </div>
      <div id="compare-mode-panel" hidden>
        <header class="solver-header">
          <p class="eyebrow">Solver Lab</p>
          <h1>Compare Solvers</h1>
        </header>
        <p class="compare-intro">Tick the algorithms to race, scramble, then run them on the same state. Click any solver to read how it works and replay its solution on the puzzle.</p>
        <div class="compare-scramble-row">
          <button type="button" id="compare-scramble">Scramble</button>
          <input type="range" id="compare-scramble-length" min="1" max="25" value="12" />
          <span id="compare-scramble-length-value">12 moves</span>
        </div>
        <button type="button" id="compare-run" class="compare-run-btn">Run comparison</button>
        <p class="compare-note" id="compare-note"></p>
        <div class="compare-list" id="compare-list"></div>
        <p id="input-status-compare" class="input-status"></p>
      </div>
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

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
fillLight.position.set(-3, -1, -4);
scene.add(fillLight);
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

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
let solving = false;
let stepSolution: readonly Move[] = [];
let stepIndex = 0;
let stepperLocked = false;

const solverWorker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });

function solveAsync(solverId: SolverId, state: PuzzleState, maxNodes?: number): Promise<SolveResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<SolveResult | { type: "ready" }>) => {
      if ((event.data as { type?: string }).type === "ready") return; // startup signal, not a result
      solverWorker.removeEventListener("message", onMessage);
      solverWorker.removeEventListener("error", onError);
      resolve(event.data as SolveResult);
    };
    const onError = (event: ErrorEvent) => {
      solverWorker.removeEventListener("message", onMessage);
      solverWorker.removeEventListener("error", onError);
      reject(new Error(event.message));
    };
    solverWorker.addEventListener("message", onMessage);
    solverWorker.addEventListener("error", onError);
    const request: WorkerRequest =
      maxNodes !== undefined ? { solverId, state, maxNodes } : { solverId, state };
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
const compareNote = requireElement<HTMLElement>("#compare-note");
const compareToggleBtn = requireElement<HTMLButtonElement>("#compare-toggle");
const compareModePanel = requireElement<HTMLElement>("#compare-mode-panel");
const compareList = requireElement<HTMLElement>("#compare-list");
const compareRunBtn = requireElement<HTMLButtonElement>("#compare-run");
const compareScrambleBtn = requireElement<HTMLButtonElement>("#compare-scramble");
const compareScrambleLength = requireElement<HTMLInputElement>("#compare-scramble-length");
const compareScrambleLengthValue = requireElement<HTMLElement>("#compare-scramble-length-value");
const compareStatusEl = requireElement<HTMLElement>("#input-status-compare");

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
  hideStepper();
  hideStats();
  resetVisualState();
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

  hideStepper();
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
    showStats(solverName, solution.length, stats.elapsedMs, stats.nodesExpanded);
    playSolution(solution);
  } else {
    setInputStatus("No solution found within node limit.");
  }
});

// ── Compare mode: race every solver on the same scramble ──────────────────
// Compact names so each row fits on one line in the narrow panel; the blurbs
// power the explainer that appears above the table for the enabled solvers.
const COMPARE_SOLVERS: { id: SolverId; name: string; blurb: string }[] = [
  {
    id: "ida-star",
    name: "Iterative-Deepening A-Star",
    blurb:
      "Explores solutions move by move, going a little deeper on each pass. It leans on a precomputed table of how far every position is from solved to skip hopeless directions, so it always finds a shortest solution while using almost no memory. That is why it is the default.",
  },
  {
    id: "a-star",
    name: "A-Star",
    blurb:
      "Always expands the most promising position next, scoring each one by the moves used so far plus an estimate of the moves still to go. It also finds a shortest solution, but it has to keep every position it is still considering in memory, so that pile grows quickly on harder scrambles.",
  },
  {
    id: "bidirectional-ida-star",
    name: "Bidirectional Iterative-Deepening A-Star",
    blurb:
      "Runs two searches at once, one from the scramble and one from the solved state, and tries to meet in the middle. Because each side only has to reach halfway, it avoids a lot of the deep digging a one-sided search would do.",
  },
  {
    id: "bidirectional-bfs",
    name: "Bidirectional Breadth-First Search",
    blurb:
      "Fans out one move at a time from both the scramble and the solved state until the two expanding shells collide. It is guaranteed to find a shortest solution, but every extra move multiplies the number of positions it must remember. On deep scrambles the shells grow enormous, so it runs out of memory and time before they ever meet.",
  },
  {
    id: "greedy-best-first",
    name: "Greedy Best-First Search",
    blurb:
      "Always grabs the move that looks closest to solved right now and never looks back at how many moves it has already spent. That makes it fast to act but short sighted, so it usually stumbles onto a solution far longer than necessary.",
  },
  {
    id: "two-phase",
    name: "Two-Phase",
    blurb:
      "Solves in two stages. First it steers the puzzle into a simpler, well behaved family of positions, then it finishes from there. This is how fast speedcubing solvers work, very quick and usually close to the shortest, though not always exactly optimal.",
  },
  {
    id: "depth-limited-dfs",
    name: "Depth-Limited Depth-First Search",
    blurb:
      "Pure brute force. It tries every possible sequence of moves up to a fixed length, with no sense of which way is closer to solved. That is fine for a move or two, but the number of sequences explodes, so it cannot reach the depth a real scramble needs. That is why it shows a dash instead of a solution.",
  },
];
const COMPARE_MAX_NODES = 2_000_000;

function formatMs(ms: number): string {
  return ms < 1 ? "<1 ms" : `${Math.round(ms).toLocaleString()} ms`;
}

// The scramble the most recent comparison ran on, so selecting a solver can
// reset the puzzle and replay that solver's solution from the same state.
let compareScramble: readonly Move[] = [];

type CompareResult =
  | { status: "solved"; solution: readonly Move[]; stats: SolveResult["stats"] }
  | { status: "failed" };
const compareResults = new Map<SolverId, CompareResult>();
let compareSelectedId: SolverId | null = null;

compareScrambleLength.addEventListener("input", () => {
  compareScrambleLengthValue.textContent = `${compareScrambleLength.value} moves`;
});

// ── Unified solver list: one row per algorithm with an include checkbox, live
// metrics after a run, and an expandable detail (description + move-stepper). ──
type CompareItem = {
  root: HTMLElement;
  checkbox: HTMLInputElement;
  len: HTMLElement;
  nodes: HTMLElement;
  time: HTMLElement;
  detail: HTMLElement;
};
const compareItems = new Map<SolverId, CompareItem>();

for (const { id, name, blurb } of COMPARE_SOLVERS) {
  const root = document.createElement("div");
  root.className = "cmp-item";
  root.dataset.id = id;
  root.innerHTML =
    `<div class="cmp-row">` +
    `<label class="cmp-check"><input type="checkbox" checked aria-label="Include ${name}"></label>` +
    `<button type="button" class="cmp-head">` +
    `<span class="cmp-head-text">` +
    `<span class="cmp-name">${name}</span>` +
    `<span class="cmp-metrics"><span class="cmp-len"></span><span class="cmp-nodes"></span><span class="cmp-time"></span></span>` +
    `</span>` +
    `<span class="cmp-caret" aria-hidden="true">▸</span>` +
    `</button></div>` +
    `<div class="cmp-detail" hidden><p class="cmp-blurb">${blurb}</p><div class="cmp-stepper"></div></div>`;
  compareList.appendChild(root);
  const checkbox = root.querySelector<HTMLInputElement>(".cmp-check input")!;
  checkbox.addEventListener("change", () => {
    root.classList.toggle("cmp-item--off", !checkbox.checked);
    compareRunBtn.disabled = solving || !solverReady || enabledCompareSolvers().length === 0;
  });
  root.querySelector<HTMLButtonElement>(".cmp-head")!.addEventListener("click", () => selectCompareItem(id));
  compareItems.set(id, {
    root,
    checkbox,
    len: root.querySelector(".cmp-len")!,
    nodes: root.querySelector(".cmp-nodes")!,
    time: root.querySelector(".cmp-time")!,
    detail: root.querySelector(".cmp-detail")!,
  });
}

function enabledCompareSolvers() {
  return COMPARE_SOLVERS.filter(({ id }) => compareItems.get(id)?.checkbox.checked);
}

// ── Compare-mode move-stepper (lives inside the selected solver's detail) ──
let cmpStepSolution: readonly Move[] = [];
let cmpStepIndex = 0;
let cmpStepLocked = false;
let cmpStepperEl: HTMLElement | null = null;

function selectCompareItem(id: SolverId) {
  const item = compareItems.get(id);
  if (!item) return;

  // Collapse a second click on the already-open row.
  if (compareSelectedId === id) {
    item.root.classList.remove("cmp-item--selected");
    item.detail.setAttribute("hidden", "");
    compareSelectedId = null;
    return;
  }

  for (const [, other] of compareItems) {
    other.root.classList.remove("cmp-item--selected");
    other.detail.setAttribute("hidden", "");
  }
  item.root.classList.add("cmp-item--selected");
  item.detail.removeAttribute("hidden");
  compareSelectedId = id;

  const result = compareResults.get(id);
  cmpStepperEl = item.detail.querySelector(".cmp-stepper");
  if (result?.status === "solved") {
    replayInCompare(result.solution);
  } else {
    cmpStepSolution = [];
    if (cmpStepperEl) cmpStepperEl.replaceChildren();
  }
}

// Reset to the comparison's scramble and animate the chosen solution, staying
// in Compare mode. A stepper in the detail then allows stepping move-by-move.
function replayInCompare(solution: readonly Move[]) {
  resetVisualState();
  fastApplyMoves(compareScramble);
  cmpStepSolution = solution;
  cmpStepIndex = 0;
  cmpStepLocked = solution.length > 0;
  buildCmpStepper();
  if (solution.length === 0) return;
  enqueueMoves(solution, FAST_TURN_DURATION_MS, (index) => {
    cmpStepIndex = index + 1;
    if (cmpStepIndex >= cmpStepSolution.length) cmpStepLocked = false;
    updateCmpStepperUI();
  });
  updateCmpStepperUI();
}

function buildCmpStepper() {
  if (!cmpStepperEl) return;
  cmpStepperEl.replaceChildren();
  const seq = document.createElement("div");
  seq.className = "cmp-step-seq";
  cmpStepSolution.forEach((move) => {
    const span = document.createElement("span");
    span.className = "cmp-step-move";
    span.textContent = formatMove(move);
    seq.appendChild(span);
  });
  const nav = document.createElement("div");
  nav.className = "cmp-step-nav";
  nav.innerHTML =
    `<button type="button" class="cmp-step-back">← Back</button>` +
    `<span class="cmp-step-label"></span>` +
    `<button type="button" class="cmp-step-fwd">Next →</button>`;
  cmpStepperEl.append(seq, nav);
  nav.querySelector<HTMLButtonElement>(".cmp-step-back")!.addEventListener("click", () => {
    if (cmpStepLocked || cmpStepIndex === 0) return;
    cmpStepIndex--;
    enqueueMoves([invertMove(cmpStepSolution[cmpStepIndex]!)], DEFAULT_TURN_DURATION_MS);
    updateCmpStepperUI();
  });
  nav.querySelector<HTMLButtonElement>(".cmp-step-fwd")!.addEventListener("click", () => {
    if (cmpStepLocked || cmpStepIndex >= cmpStepSolution.length) return;
    enqueueMoves([cmpStepSolution[cmpStepIndex]!], DEFAULT_TURN_DURATION_MS);
    cmpStepIndex++;
    updateCmpStepperUI();
  });
  updateCmpStepperUI();
}

function updateCmpStepperUI() {
  if (!cmpStepperEl) return;
  const atStart = cmpStepIndex === 0;
  const atEnd = cmpStepIndex >= cmpStepSolution.length;
  const back = cmpStepperEl.querySelector<HTMLButtonElement>(".cmp-step-back");
  const fwd = cmpStepperEl.querySelector<HTMLButtonElement>(".cmp-step-fwd");
  const label = cmpStepperEl.querySelector<HTMLElement>(".cmp-step-label");
  if (back) back.disabled = cmpStepLocked || atStart;
  if (fwd) fwd.disabled = cmpStepLocked || atEnd;
  if (label) label.textContent = `${cmpStepIndex} / ${cmpStepSolution.length}`;
  cmpStepperEl.querySelectorAll<HTMLElement>(".cmp-step-move").forEach((el, i) => {
    el.className =
      "cmp-step-move" +
      (i < cmpStepIndex ? " cmp-step-move--done" : i === cmpStepIndex ? " cmp-step-move--next" : "");
  });
}

function clearCompareResults() {
  compareResults.clear();
  compareSelectedId = null;
  cmpStepSolution = [];
  cmpStepperEl = null;
  for (const [, item] of compareItems) {
    item.root.classList.remove("cmp-item--selected", "cmp-running", "cmp-incomplete");
    item.detail.setAttribute("hidden", "");
    for (const cell of [item.len, item.nodes, item.time]) {
      cell.textContent = "";
      cell.classList.remove("cmp-best");
    }
  }
  compareNote.textContent = "";
}

compareScrambleBtn.addEventListener("click", () => {
  if (solving) return;
  clearCompareResults();
  resetVisualState();
  const length = Number(compareScrambleLength.value);
  const scramble = createRandomScramble(length);
  compareScramble = [];
  setInputStatus(`Scramble (${length}): ${formatAlgorithm(scramble)}`);
  enqueueMoves(scramble, FAST_TURN_DURATION_MS);
  setHashScramble(scramble);
});

compareRunBtn.addEventListener("click", async () => {
  if (solving || !solverReady) return;

  const enabled = enabledCompareSolvers();
  if (enabled.length === 0) {
    setInputStatus("Tick at least one solver to compare.");
    return;
  }

  const pendingMoves = [
    ...(activeTurn ? [activeTurn.move] : []),
    ...turnQueue.map((turn) => turn.move),
  ];
  const projectedState = applyAlgorithm(engineState, pendingMoves);

  if (isSolved(projectedState)) {
    setInputStatus("Scramble first. The puzzle is already solved.");
    return;
  }

  // Capture the scramble that reaches this state so selections can replay it.
  compareScramble = simplifyAlgorithm([...moveHistory, ...pendingMoves]);

  clearCompareResults();
  solving = true;
  compareRunBtn.disabled = true;
  compareScrambleBtn.disabled = true;
  setInputStatus("Comparing solvers…");

  const solved: { id: SolverId; len: number; ms: number; nodes: number }[] = [];
  for (const { id } of enabled) {
    const item = compareItems.get(id)!;
    item.root.classList.add("cmp-running");
    item.len.textContent = "…";
    let result: SolveResult | undefined;
    try {
      result = await solveAsync(id, projectedState, COMPARE_MAX_NODES);
    } catch {
      result = undefined;
    }
    item.root.classList.remove("cmp-running");
    if (result && result.status === "solved") {
      const len = result.solution.length;
      item.len.textContent = `${len} move${len === 1 ? "" : "s"}`;
      item.nodes.textContent = `${result.stats.nodesExpanded.toLocaleString()} nodes`;
      item.time.textContent = formatMs(result.stats.elapsedMs);
      compareResults.set(id, { status: "solved", solution: result.solution, stats: result.stats });
      solved.push({ id, len: result.solution.length, ms: result.stats.elapsedMs, nodes: result.stats.nodesExpanded });
    } else {
      item.root.classList.add("cmp-incomplete");
      item.len.textContent = "-";
      item.nodes.textContent = result ? `${result.stats.nodesExpanded.toLocaleString()} nodes` : "";
      item.time.textContent = result ? formatMs(result.stats.elapsedMs) : "";
      compareResults.set(id, { status: "failed" });
    }
  }

  if (solved.length > 0) {
    const minLen = Math.min(...solved.map((r) => r.len));
    const minMs = Math.min(...solved.map((r) => r.ms));
    const minNodes = Math.min(...solved.map((r) => r.nodes));
    for (const r of solved) {
      const item = compareItems.get(r.id)!;
      if (r.len === minLen) item.len.classList.add("cmp-best");
      if (r.ms === minMs) item.time.classList.add("cmp-best");
      if (r.nodes === minNodes) item.nodes.classList.add("cmp-best");
    }
    compareNote.textContent = `Optimal is ${minLen} moves. Click any solver to read it and replay. The best in each stat is shown in bold.`;
  } else {
    compareNote.textContent = "No solver finished within the node budget.";
  }

  solving = false;
  compareRunBtn.disabled = enabledCompareSolvers().length === 0;
  compareScrambleBtn.disabled = false;
  setInputStatus("Ready");
});

// The worker builds its heuristic tables (~2.5s) on startup and posts a "ready"
// message when done. Keep Solve disabled until then so an early click doesn't
// appear to hang while that build runs.
let solverReady = false;
function markSolverReady() {
  if (solverReady) return;
  solverReady = true;
  if (!solving) {
    if (solveButton) solveButton.disabled = false;
    compareRunBtn.disabled = enabledCompareSolvers().length === 0;
    compareScrambleBtn.disabled = false;
  }
  if (inputStatus.textContent === "Preparing solver…") setInputStatus("Ready");
}
if (solveButton) solveButton.disabled = true;
compareRunBtn.disabled = true;
compareScrambleBtn.disabled = true;
setInputStatus("Preparing solver…");
solverWorker.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === "ready") markSolverReady();
});
// Safety net: enable solving anyway if the ready signal never arrives.
setTimeout(markSolverReady, 8000);

document.querySelector<HTMLButtonElement>("[data-clear]")?.addEventListener("click", () => {
  hideStepper();
  hideStats();
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
  const target = paintMode ? paintStatusEl : compareMode ? compareStatusEl : inputStatus;
  target.textContent = message;
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

function hideStats() {
  solveStats.setAttribute("hidden", "");
  statAlgorithm.textContent = "-";
  statSolution.textContent = "-";
  statTime.textContent = "-";
  statNodes.textContent = "-";
}

function resetVisualState() {
  activeTurn = undefined;
  turnQueue.length = 0;
  moveHistory = [];
  engineState = createSolvedState();

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

function enqueueMoves(
  moves: readonly Move[],
  durationMs: number,
  onComplete?: (index: number) => void,
) {
  if (moves.length === 0) {
    return;
  }

  turnQueue.push(...moves.map((move, index) => ({
    move,
    durationMs,
    onComplete: onComplete ? () => onComplete(index) : undefined,
  })));
}

function updateTurnAnimation(now: number) {
  if (!activeTurn) {
    const next = turnQueue.shift();

    if (!next) {
      return;
    }

    activeTurn = createTurnAnimation(next.move, next.durationMs, now, next.onComplete);
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
    completedTurn.onComplete?.();
    activeTurn = undefined;
  }
}

function createTurnAnimation(
  move: Move,
  durationMs: number,
  now: number,
  onComplete?: () => void,
): TurnAnimation {
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
    onComplete,
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
    const faceNormal = normal.clone();
    const color = new THREE.Color(faceColors[faceIndex % faceColors.length]);

    return splitFaceByCutPlanes(ordered).map((pieceVertices) => {
      const pieceCenter = centerLocal(pieceVertices);
      const key = pieceKey(pieceCenter);
      const slotId = key.replace(/\|/g, "");
      const slotIndex = SLOT_IDS.indexOf(slotId);

      if (slotIndex !== -1) {
        if (!slotFaceNormals[slotIndex]) slotFaceNormals[slotIndex] = new Map();
        slotFaceNormals[slotIndex]!.set(faceIndex, faceNormal);
      }

      const stickerKey = `${slotIndex}:${faceIndex}`;

      return {
        key,
        object: createCutPieceGroup(pieceVertices, pieceCenter, normal, color, stickerKey),
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
  return (Object.keys(fixedAxes) as MoveAxis[])
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
  stickerKey: string,
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
  sticker.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.userData.stickerKey = stickerKey;
  });

  stickerMaterials.set(stickerKey, stickerMaterial);
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

// ── Solution stepper ────────────────────────────────────────────────────────

const solutionStepper = requireElement<HTMLElement>("#solution-stepper");
const stepperSequence = requireElement<HTMLElement>("#stepper-sequence");
const stepLabel = requireElement<HTMLElement>("#step-label");
const stepBackBtn = requireElement<HTMLButtonElement>("#step-back");
const stepFwdBtn = requireElement<HTMLButtonElement>("#step-forward");

function showStepper(solution: readonly Move[]) {
  stepSolution = solution;
  stepIndex = 0;
  stepperLocked = false;
  stepperSequence.innerHTML = "";
  solution.forEach((move, i) => {
    const span = document.createElement("span");
    span.className = "stepper-move";
    span.dataset.step = String(i);
    span.textContent = formatMove(move);
    stepperSequence.appendChild(span);
  });
  updateStepperUI();
  solutionStepper.removeAttribute("hidden");
}

function hideStepper() {
  solutionStepper.setAttribute("hidden", "");
  stepSolution = [];
  stepIndex = 0;
  stepperLocked = false;
}

function playSolution(solution: readonly Move[]) {
  showStepper(solution);

  if (solution.length === 0) {
    setInputStatus("Already solved.");
    return;
  }

  stepperLocked = true;
  updateStepperUI();
  setInputStatus(`Animating solution: ${formatAlgorithm(solution)}`);
  enqueueMoves(solution, FAST_TURN_DURATION_MS, (index) => {
    stepIndex = index + 1;
    if (stepIndex >= stepSolution.length) {
      stepperLocked = false;
      setInputStatus("Solved. Use Back to rewind through the solution.");
    }
    updateStepperUI();
  });
}

function updateStepperUI() {
  const atStart = stepIndex === 0;
  const atEnd = stepIndex >= stepSolution.length;
  stepBackBtn.disabled = stepperLocked || atStart;
  stepFwdBtn.disabled = stepperLocked || atEnd;
  stepLabel.textContent = `${stepIndex} / ${stepSolution.length}`;
  stepBackBtn.textContent = atStart ? "Back" : `Back ${formatMove(stepSolution[stepIndex - 1]!)}`;
  stepFwdBtn.textContent = atEnd ? "Done" : `${formatMove(stepSolution[stepIndex]!)} Next`;
  stepperSequence.querySelectorAll<HTMLElement>(".stepper-move").forEach((el, i) => {
    el.className = "stepper-move" +
      (i < stepIndex ? " stepper-move--done" :
       i === stepIndex ? " stepper-move--next" : " stepper-move--pending");
  });
}

stepBackBtn.addEventListener("click", () => {
  if (stepperLocked || stepIndex === 0) return;
  stepIndex--;
  enqueueMoves([invertMove(stepSolution[stepIndex]!)], DEFAULT_TURN_DURATION_MS);
  updateStepperUI();
});

stepFwdBtn.addEventListener("click", () => {
  if (stepperLocked || stepIndex >= stepSolution.length) return;
  enqueueMoves([stepSolution[stepIndex]!], DEFAULT_TURN_DURATION_MS);
  stepIndex++;
  updateStepperUI();
});

// ── Paint mode ──────────────────────────────────────────────────────────────

const paintToggleBtn = requireElement<HTMLButtonElement>("#paint-toggle");
const normalPanel = requireElement<HTMLElement>("#normal-panel");
const paintPanel = requireElement<HTMLElement>("#paint-panel");
const colorPalette = requireElement<HTMLElement>("#color-palette");
const paintStatusEl = requireElement<HTMLElement>("#input-status-paint");
const paintColorCountsEl = requireElement<HTMLElement>("#paint-color-counts");
const paintProgressBar = requireElement<HTMLElement>("#paint-progress-bar");
const paintColorStatusEl = requireElement<HTMLElement>("#paint-color-status");
const solvePaintedBtn = requireElement<HTMLButtonElement>("#solve-painted");
const markSolvedBtn = requireElement<HTMLButtonElement>("#mark-solved");
const clearPaintBtn = requireElement<HTMLButtonElement>("#clear-paint");
const copyPaintStateBtn = requireElement<HTMLButtonElement>("#copy-paint-state");
const importPaintStateBtn = requireElement<HTMLButtonElement>("#import-paint-state");

faceColors.forEach((color, index) => {
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = "palette-swatch";
  swatch.style.background = `#${color.toString(16).padStart(6, "0")}`;
  swatch.dataset.colorIndex = String(index);
  swatch.setAttribute("aria-label", `Color ${index + 1}`);
  if (index === 0) swatch.classList.add("palette-swatch--active");
  colorPalette.appendChild(swatch);
});

colorPalette.addEventListener("click", (event) => {
  const swatch = (event.target as HTMLElement).closest<HTMLElement>("[data-color-index]");
  if (!swatch) return;
  paintColorIndex = parseInt(swatch.dataset.colorIndex!);
  colorPalette.querySelectorAll(".palette-swatch").forEach((s) =>
    s.classList.remove("palette-swatch--active"),
  );
  swatch.classList.add("palette-swatch--active");
  updatePaintReadiness();
});

paintToggleBtn.addEventListener("click", () => {
  if (paintMode) exitPaintMode();
  else enterPaintMode();
});

compareToggleBtn.addEventListener("click", () => {
  if (compareMode) exitCompareMode();
  else enterCompareMode();
});

markSolvedBtn.addEventListener("click", () => {
  for (const [key, mat] of stickerMaterials) {
    const faceIndex = parseInt(key.split(":")[1]!);
    const colorIndex = faceIndex % faceColors.length;
    setPaintStickerColor(key, colorIndex);
    mat.color.set(faceColors[colorIndex]!);
  }
  updatePaintReadiness();
});

clearPaintBtn.addEventListener("click", () => {
  userStickerColors.clear();
  for (const [, mat] of stickerMaterials) mat.color.set(faceColors[DEFAULT_PAINT_COLOR_INDEX]!);
  updatePaintReadiness();
});

copyPaintStateBtn.addEventListener("click", () => {
  const payload = {
    slotIds: SLOT_IDS,
    stickerColors: Object.fromEntries(userStickerColors),
    faceColors: faceColors.map((c) => `#${c.toString(16).padStart(6, "0")}`),
  };
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
    paintStatusEl.textContent = "State copied to clipboard.";
  });
});

importPaintStateBtn.addEventListener("click", async () => {
  let json: string | null = null;
  try {
    json = await navigator.clipboard.readText();
  } catch {
    json = prompt("Paste your debug JSON:");
  }
  if (!json) return;
  try {
    const data = JSON.parse(json) as {
      stickerColors?: Record<string, number>;
      faceColors?: string[];
    };
    const colors = data.stickerColors;
    if (!colors || typeof colors !== "object") throw new Error("bad format");
    const importedColorMap = createImportedColorMap(data.faceColors);
    userStickerColors.clear();
    let count = 0;
    for (const [key, colorIdx] of Object.entries(colors)) {
      const idx = normalizePaintColor(importedColorMap[Number(colorIdx)] ?? Number(colorIdx));
      setPaintStickerColor(key, idx);
      const mat = stickerMaterials.get(key);
      if (mat) mat.color.set(faceColors[idx]!);
      count++;
    }
    updatePaintReadiness();
    paintStatusEl.textContent = `Imported ${count} stickers.`;
  } catch {
    paintStatusEl.textContent = "Paste a valid debug JSON first.";
  }
});

const paintRaycaster = new THREE.Raycaster();
let paintDragged = false;
let paintDownX = 0;
let paintDownY = 0;

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (!paintMode) return;
  paintDragged = false;
  paintDownX = event.clientX;
  paintDownY = event.clientY;
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!paintMode) return;
  if (Math.hypot(event.clientX - paintDownX, event.clientY - paintDownY) > 6) paintDragged = true;
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (!paintMode || paintDragged) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  paintRaycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const hits = paintRaycaster.intersectObjects(puzzleGroup.children, true);
  for (const hit of hits) {
    const key = (hit.object as THREE.Mesh).userData.stickerKey as string | undefined;
    if (!key || key.startsWith("-1:")) continue;
    setPaintStickerColor(key, paintColorIndex);
    stickerMaterials.get(key)?.color.set(faceColors[paintColorIndex]!);
    updatePaintReadiness();
    break;
  }
});

solvePaintedBtn.addEventListener("click", async () => {
  if (solving || !getPaintReadiness().ready) return;
  const reconstructed = reconstructStateFromColors();
  if (!reconstructed) return;

  // Paint-mode solve uses IDA* — the pattern-database heuristic makes the
  // single-ended search the fastest solver, with no node limit.
  const solverId: SolverId = "ida-star";
  const solverName = "IDA*";

  solving = true;
  solvePaintedBtn.disabled = true;
  if (solveButton) solveButton.disabled = true;
  solverSelect.disabled = true;
  setInputStatus(`Solving painted cube with ${solverName}…`);

  const result = await solveAsync(solverId, reconstructed);

  solving = false;
  solvePaintedBtn.disabled = false;
  if (solveButton) solveButton.disabled = false;
  solverSelect.disabled = false;

  if (result.status !== "solved") {
    setInputStatus("No solution found. The color input may be an impossible state.");
    return;
  }

  const { solution, stats } = result;
  exitPaintMode();
  resetVisualState();
  fastApplyMoves(invertAlgorithm(solution));
  showStats(solverName, solution.length, stats.elapsedMs, stats.nodesExpanded);
  playSolution(solution);
});

function enterPaintMode() {
  if (compareMode) exitCompareMode();
  hideStepper();
  resetVisualState();
  paintMode = true;
  compareToggleBtn.setAttribute("hidden", "");
  userStickerColors.clear();
  paintColorIndex = 0;
  paintStatusEl.textContent = "";
  colorPalette.querySelectorAll(".palette-swatch").forEach((s, i) =>
    s.classList.toggle("palette-swatch--active", i === 0),
  );
  for (const [, mat] of stickerMaterials) mat.color.set(faceColors[DEFAULT_PAINT_COLOR_INDEX]!);
  keyLight.intensity = 0;
  fillLight.intensity = 0;
  ambientLight.intensity = 3.5;
  paintToggleBtn.textContent = "← Exit";
  paintToggleBtn.dataset.active = "";
  normalPanel.setAttribute("hidden", "");
  paintPanel.removeAttribute("hidden");
  updatePaintReadiness();
}

function exitPaintMode() {
  paintMode = false;
  for (const [key, mat] of stickerMaterials) {
    const faceIndex = parseInt(key.split(":")[1]!);
    mat.color.set(faceColors[faceIndex % faceColors.length]!);
  }
  keyLight.intensity = 2.2;
  fillLight.intensity = 1.0;
  ambientLight.intensity = 1.2;
  paintToggleBtn.textContent = "My Cube";
  delete paintToggleBtn.dataset.active;
  compareToggleBtn.removeAttribute("hidden");
  normalPanel.removeAttribute("hidden");
  paintPanel.setAttribute("hidden", "");
}

function enterCompareMode() {
  if (paintMode) exitPaintMode();
  hideStepper();
  hideStats();
  compareMode = true;
  paintToggleBtn.setAttribute("hidden", "");
  compareToggleBtn.textContent = "← Exit";
  compareToggleBtn.dataset.active = "";
  normalPanel.setAttribute("hidden", "");
  compareModePanel.removeAttribute("hidden");
  setInputStatus(solverReady ? "Scramble, then run the comparison." : "Preparing solver…");
}

function exitCompareMode() {
  compareMode = false;
  compareToggleBtn.textContent = "Solver Lab";
  delete compareToggleBtn.dataset.active;
  paintToggleBtn.removeAttribute("hidden");
  compareModePanel.setAttribute("hidden", "");
  normalPanel.removeAttribute("hidden");
}

function fastApplyMoves(moves: readonly Move[]) {
  for (const move of moves) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      fixedAxes[move.axis],
      move.amount * ((-Math.PI * 2) / 3),
    );
    for (const facet of selectTurningFacets(fixedAxes[move.axis])) {
      facet.object.position.applyQuaternion(rotation);
      facet.object.quaternion.premultiply(rotation);
      facet.center.copy(facet.object.position);
    }
    engineState = applyMove(engineState, move);
  }
}

function getPaintReadiness() {
  const colorCounts = new Array<number>(faceColors.length).fill(0);

  for (let slot = 0; slot < SLOT_IDS.length; slot += 1) {
    for (const [face] of slotFaceNormals[slot] ?? []) {
      const color = getEffectivePaintColor(slot, face);
      colorCounts[color] = colorCounts[color]! + 1;
    }
  }

  return {
    colorCounts,
    completeColors: colorCounts.filter((count) => count === 4).length,
    ready: colorCounts.every((count) => count === 4),
  };
}

function updatePaintReadiness() {
  const readiness = getPaintReadiness();
  const progress = readiness.completeColors / faceColors.length;
  const selectedColorCount = readiness.colorCounts[paintColorIndex] ?? 0;

  paintColorCountsEl.textContent = `${readiness.completeColors} / ${faceColors.length} colors complete`;
  paintProgressBar.style.width = `${Math.round(progress * 100)}%`;
  solvePaintedBtn.disabled = solving || !readiness.ready;
  solvePaintedBtn.title = readiness.ready ? "" : "Each color must appear exactly 4 times.";
  paintColorStatusEl.textContent = `${colorNames[paintColorIndex] ?? "Color"}: ${selectedColorCount} / 4 stickers painted`;
  paintColorStatusEl.dataset.state =
    selectedColorCount === 4 ? "complete" : selectedColorCount > 4 ? "invalid" : "incomplete";
}

function getEffectivePaintColor(slot: number, face: number) {
  return normalizePaintColor(userStickerColors.get(`${slot}:${face}`) ?? DEFAULT_PAINT_COLOR_INDEX);
}

function setPaintStickerColor(key: string, colorIndex: number) {
  const normalized = normalizePaintColor(colorIndex);

  if (normalized === DEFAULT_PAINT_COLOR_INDEX) {
    userStickerColors.delete(key);
  } else {
    userStickerColors.set(key, normalized);
  }
}

function reconstructStateFromColors(): PuzzleState | null {
  const numSlots = SLOT_IDS.length;

  const userColorsBySlot: Map<number, number>[] = Array.from({ length: numSlots }, () => new Map());

  const colorCounts = new Array<number>(faceColors.length).fill(0);
  for (let s = 0; s < numSlots; s++) {
    for (const [fIdx] of slotFaceNormals[s] ?? []) {
      const color = getEffectivePaintColor(s, fIdx);
      userColorsBySlot[s]!.set(fIdx, color);
      colorCounts[color] = colorCounts[color]! + 1;
    }
  }

  const wrongCount = colorCounts.findIndex((count) => count !== 4);
  if (wrongCount !== -1) {
    setInputStatus(`Color ${wrongCount + 1} has ${colorCounts[wrongCount]} stickers, but each color needs 4.`);
    return null;
  }

  const resultPieces = new Array<number>(numSlots).fill(-1);
  const resultOrientations = new Array<number>(numSlots).fill(0);
  const usedPieces = new Set<number>();

  for (let s = 0; s < numSlots; s++) {
    const slotFaces = slotFaceNormals[s];
    if (!slotFaces) continue;
    const userColors = userColorsBySlot[s]!;
    let found = false;

    outer: for (let p = 0; p < numSlots && !found; p++) {
      if (usedPieces.has(p)) continue;
      const pieceFaces = slotFaceNormals[p];
      if (!pieceFaces || pieceFaces.size !== slotFaces.size) continue;

      for (let o = 0; o < 12 && !found; o++) {
        const [qx, qy, qz, qw] = orientationQuaternion(o);
        const Q = new THREE.Quaternion(qx, qy, qz, qw);

        let allMatch = true;
        for (const [g, normalG] of pieceFaces) {
          const rotated = normalG.clone().applyQuaternion(Q);
          let bestFace = -1;
          let bestDot = -Infinity;
          for (const [f, normalF] of slotFaces) {
            const d = rotated.dot(normalF);
            if (d > bestDot) { bestDot = d; bestFace = f; }
          }
          if (userColors.get(bestFace) !== g) { allMatch = false; break; }
        }

        if (allMatch) {
          resultPieces[s] = p;
          resultOrientations[s] = o;
          usedPieces.add(p);
          found = true;
          continue outer;
        }
      }
    }

    if (!found) {
      setInputStatus(`Painting error at ${SLOT_IDS[s]}. Check that piece for a wrong color.`);
      return null;
    }
  }

  if (resultPieces.includes(-1)) {
    const missing = resultPieces.map((p, s) => (p === -1 ? SLOT_IDS[s] : null)).filter(Boolean);
    console.error("Reconstruction failed silently for slots:", missing);
    return null;
  }

  if (!isReachablePiecePermutation(resultPieces)) {
    setInputStatus("Impossible piece placement. Check face color locality or a mispainted sticker.");
    return null;
  }

  return { pieces: resultPieces, orientations: resultOrientations };
}

function createImportedColorMap(importedFaceColors: string[] | undefined) {
  if (!Array.isArray(importedFaceColors)) return [];

  const currentByHex = new Map(
    faceColors.map((color, index) => [colorToHex(color), index]),
  );

  return importedFaceColors.map((color, fallbackIndex) =>
    currentByHex.get(normalizeHexColor(color)) ?? fallbackIndex,
  );
}

function normalizePaintColor(colorIndex: number) {
  if (!Number.isFinite(colorIndex)) {
    throw new Error("Invalid paint color index");
  }

  return ((Math.trunc(colorIndex) % faceColors.length) + faceColors.length) % faceColors.length;
}

function colorToHex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function normalizeHexColor(color: string) {
  return color.trim().toLowerCase();
}
