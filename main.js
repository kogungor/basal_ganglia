import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { data } from './data.js';

// --- Utils ---
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

// --- Shaders ---

const BrainParticleShader = {
  vertexShader: `
    uniform float time;
    varying vec2 vUv;
    varying float vProgress;
    attribute float randoms;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = randoms * 2. * (1. / -mvPosition.z);
    }
  `,
  fragmentShader: `
    uniform float time;
    void main() {
      float disc = length(gl_PointCoord.xy - vec2(0.5));
      float opacity = 0.3 * smoothstep(0.5, 0.4, disc);
      gl_FragColor = vec4(vec3(opacity), 1.);
    }
  `
};

const BrainTubeShader = {
  vertexShader: `
    varying vec2 vUv;
    uniform float time;
    uniform vec3 mouse;
    varying float vProgress;
    void main() {
      vUv = uv;
      vProgress = smoothstep(-1., 1., sin(vUv.x*8. + time * 3.));
      
      vec3 p = position;
      float maxDist = 0.05;
      float dist = length(mouse - p);
      if (dist < maxDist) {
        vec3 dir = normalize(mouse - p);
        dir*=1. - dist/maxDist; 
        p -= dir * 0.03;
      }
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec3 color;
    varying vec2 vUv;
    varying float vProgress;
    void main() {
      float hideCorners1 = smoothstep(1., 0.9, vUv.x);
      float hideCorners2 = smoothstep(0., 0.1, vUv.x);
      vec3 finalColor = mix(color, color*0.25, vProgress);
      gl_FragColor.rgba = vec4(vec3(finalColor), 1.);
      gl_FragColor.rgba = vec4(finalColor, hideCorners1 * hideCorners2);
    }
  `
};

// --- Scene Setup ---

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.001, 5);
camera.position.set(0, 0, 0.3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.top = '0px';
renderer.domElement.style.zIndex = '1'; // WebGL behind labels
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through
labelRenderer.domElement.style.zIndex = '2'; // Labels on top
container.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, labelRenderer.domElement); // Controls need to capture events on the top layer
controls.enableDamping = true;

// --- Scientific Labels ---
const labels = {};
function createLabel(text, position, className = 'label') {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  const label = new CSS2DObject(div);
  label.position.copy(position);
  scene.add(label);
  return { obj: label, div: div };
}

// Positions estimated relative to our model scale
labels['cortex'] = createLabel('Frontal Cortex', new THREE.Vector3(0, 0.25, 0.2), 'label label-cortex');
labels['striatum'] = createLabel('Striatum', new THREE.Vector3(0, 0.05, 0.05), 'label label-striatum');
labels['snc'] = createLabel('Substantia Nigra', new THREE.Vector3(-0.05, -0.05, -0.05), 'label label-snc');
labels['gpe'] = createLabel('Globus Pallidus (External)', new THREE.Vector3(0.05, -0.02, 0.02), 'label label-gpe');
labels['thalamus'] = createLabel('Thalamus', new THREE.Vector3(0, -0.15, -0.05), 'label label-thalamus');

function updateLabels() {
  // Reset active pulse from all
  Object.values(labels).forEach(l => {
    l.div.classList.remove('active-pulse');
    l.div.classList.remove('visible'); // We will re-add visible cumulatively
  });

  // Always show context
  labels['cortex'].div.classList.add('visible');
  labels['striatum'].div.classList.add('visible');

  // Accumulate visibility (Context Aware: logic builds up)
  if (currentStep >= 1) { // Step 1: Dopamine
    labels['snc'].div.classList.add('visible');
    if (currentStep === 1) labels['snc'].div.classList.add('active-pulse');
  }

  if (currentStep >= 2) { // Step 2: Cost (GPe is involved in braking)
    labels['gpe'].div.classList.add('visible');
    if (currentStep === 2) labels['gpe'].div.classList.add('active-pulse');
  }

  if (currentStep >= 3) { // Step 3: Action (Thalamus opens)
    labels['thalamus'].div.classList.add('visible');
    if (currentStep === 3) labels['thalamus'].div.classList.add('active-pulse');
  }

  // Spawn thoughts based on step (Only once per entry to step)
  if (currentStep !== lastStep) {
    spawnStepThoughts(currentStep);
  }
}

let lastStep = -1;

// Brain regions for thoughts - Adjusted to be closer (Tighter)
const LOCATION_PHONE = new THREE.Vector3(-0.12, 0.02, 0.05); // Closer to center
const LOCATION_SPORT = new THREE.Vector3(0.12, 0.02, 0.05);
const LOCATION_TOP = new THREE.Vector3(0, 0.12, 0); // Lowered closer to cortex

function spawnStepThoughts(step) {
  const thoughts = [];

  if (step === 1) { // Dopamine (Phone related)
    thoughts.push({ text: "Ooh, notification!", delay: 0, pos: LOCATION_PHONE });
    thoughts.push({ text: "Looks fun!", delay: 800, pos: LOCATION_PHONE });
    thoughts.push({ text: "Instant reward...", delay: 1500, pos: LOCATION_PHONE });
  } else if (step === 2) { // Cost (Sport related)
    thoughts.push({ text: "Too tired for gym...", delay: 0, pos: LOCATION_SPORT });
    thoughts.push({ text: "Maybe tomorrow?", delay: 1000, pos: LOCATION_SPORT });
    thoughts.push({ text: "So much effort.", delay: 2000, pos: LOCATION_SPORT });
  } else if (step === 3) { // Action (Decision)
    thoughts.push({ text: "Phone it is.", delay: 0, pos: LOCATION_TOP });
    thoughts.push({ text: "Just 5 minutes.", delay: 1000, pos: LOCATION_TOP });
  }

  // Use index to vertically stack thoughts to avoid overlap
  thoughts.forEach((t, index) => {
    setTimeout(() => {
      spawnThought(t.text, t.pos, index);
    }, t.delay);
  });
}

function spawnThought(text, basePos, stackIndex = 0) {
  const div = document.createElement('div');
  div.className = 'thought-bubble';
  div.textContent = text;

  const label = new CSS2DObject(div);

  // Position: Stack vertically based on index
  // Reduced spacing 0.06 -> 0.035 for tighter stacking
  const x = basePos.x + (Math.random() - 0.5) * 0.01;
  const y = basePos.y + (stackIndex * 0.035);
  const z = basePos.z;

  label.position.set(x, y, z);
  scene.add(label);

  // Animate In
  requestAnimationFrame(() => {
    div.classList.add('visible');
  });

  // Remove after longer time: 4-6 seconds
  setTimeout(() => {
    div.classList.remove('visible');
    setTimeout(() => {
      scene.remove(label);
    }, 500);
  }, 4500 + Math.random() * 1000);
}


// --- Data Processing ---

function createBrainCurvesFromPaths() {
  const paths = data.economics[0].paths;
  const brainCurves = [];

  paths.forEach(path => {
    const points = [];
    for (let i = 0; i < path.length; i += 3) {
      points.push(new THREE.Vector3(path[i], path[i + 1], path[i + 2]));
    }
    if (points.length > 1) {
      const tempCurve = new THREE.CatmullRomCurve3(points);
      brainCurves.push(tempCurve);
    }
  });

  return brainCurves;
}

const curves = createBrainCurvesFromPaths();

// --- Components ---

// 1. Tubes
const tubeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    color: { value: new THREE.Color(0.1, 0.3, 0.6) },
    mouse: { value: new THREE.Vector3(0, 0, 0) }
  },
  vertexShader: BrainTubeShader.vertexShader,
  fragmentShader: BrainTubeShader.fragmentShader,
  side: THREE.DoubleSide,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});

const tubesMesh = new THREE.Group();
curves.forEach(curve => {
  const geometry = new THREE.TubeGeometry(curve, 64, 0.001, 2, false);
  const mesh = new THREE.Mesh(geometry, tubeMaterial);
  tubesMesh.add(mesh);
});
scene.add(tubesMesh);

// 2. Particles
const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    color: { value: new THREE.Color(0.1, 0.3, 0.6) }
  },
  vertexShader: BrainParticleShader.vertexShader,
  fragmentShader: BrainParticleShader.fragmentShader,
  depthTest: false,
  depthWrite: false,
  transparent: true,
  blending: THREE.AdditiveBlending
});

const density = 10;
const numberOfPoints = density * curves.length;
const particlePositions = new Float32Array(numberOfPoints * 3);
const particleRandoms = new Float32Array(numberOfPoints);

for (let i = 0; i < numberOfPoints; i++) {
  particlePositions[i * 3] = randomRange(-1, 1);
  particlePositions[i * 3 + 1] = randomRange(-1, 1);
  particlePositions[i * 3 + 2] = randomRange(-1, 1);
  particleRandoms[i] = randomRange(0.3, 1);
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute('randoms', new THREE.BufferAttribute(particleRandoms, 1));

const particlesMesh = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particlesMesh);

const myPoints = [];
for (let i = 0; i < curves.length; i++) {
  for (let j = 0; j < density; j++) {
    myPoints.push({
      currentOffset: Math.random(),
      speed: Math.random() * 0.01,
      curve: curves[i],
      curPosition: Math.random(),
    });
  }
}

// --- Basal Ganglia Simulation Integration ---
const pathways = [];
let currentStep = -1;
let phoneActivity = 0.1;
let sportActivity = 0.1;

function createNeuralPath(points, colorHex, id) {
  const curve = new THREE.CatmullRomCurve3(points);

  // 1. Yolun kendisi (Soluk Çizgi)
  // Scale tube radius down significantly (0.08 -> 0.002)
  const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.002, 8, false);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  scene.add(tubeMesh);

  // 2. Sinyal Paketleri
  const pulses = [];
  const pulseCount = 15;

  // Scale sphere radius down (0.12 -> 0.005 -> 0.0025)
  // Making them subtle nodes
  const pGeo = new THREE.SphereGeometry(0.0025, 8, 8);
  const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  for (let i = 0; i < pulseCount; i++) {
    const mesh = new THREE.Mesh(pGeo, pMat.clone());
    mesh.material.color.setHex(colorHex);

    scene.add(mesh);
    pulses.push({
      mesh: mesh,
      progress: i / pulseCount,
      speed: 0.002,
      active: true
    });
  }

  pathways.push({
    id: id,
    curve: curve,
    pulses: pulses,
    baseColor: new THREE.Color(colorHex),
    tubeMat: tubeMat
  });
}

// Scale factor: reduced further to fit inside brain (approx 0.025 scale relative to original sample)
// Phone Yolu (Left Hemisphere Internal)
createNeuralPath(
  [
    new THREE.Vector3(-0.1, 0.08, 0.05),
    new THREE.Vector3(-0.05, 0.02, 0.02),
    new THREE.Vector3(-0.02, -0.02, 0),
    new THREE.Vector3(0, -0.08, -0.02)
  ],
  0x00ffff, "phone"
);

// Sport Yolu (Right Hemisphere Internal)
createNeuralPath(
  [
    new THREE.Vector3(0.1, 0.08, 0.05),
    new THREE.Vector3(0.05, 0.02, 0.02),
    new THREE.Vector3(0.02, -0.02, 0),
    new THREE.Vector3(0, -0.08, -0.02)
  ],
  0xff8800, "sport"
);

// Simulation State Logic - Enhanced with Logs & Accurate Hz
const steps = [
  {
    title: "SITUATION ANALYSIS",
    desc: "Brain receives sensory inputs. Both main pathways are active at baseline firing rates.",
    phone: 0.3, sport: 0.3, // 0.3 ~ 20Hz
    btn: "CALCULATE REWARD",
    logs: [
      "Cortex: Visual input 'Couch' detected.",
      "Cortex: Visual input 'Gym Bag' detected.",
      "Striatum: Baseline firing rate (20Hz) maintained."
    ]
  },
  {
    title: "DOPAMINE EFFECT",
    desc: "SNc releases phasic dopamine. D1 receptors (Direct Path) are highly sensitive to this burst.",
    phone: 0.95, sport: 0.3,
    btn: "QUERY COST & RISK",
    logs: [
      "SNc: PHASIC DOPAMINE SPIKE DETECTED!",
      "Direct Path (D1): Excitability increased to +300%.",
      "LTP (Long-Term Potentiation): Prioritizing 'Phone' action."
    ]
  },
  {
    title: "COST (EFFORT) OBSTACLE",
    desc: "Indirect Pathway (NO-GO) spikes due to high effort cost. It tries to inhibit movement.",
    phone: 1.0, sport: 0.05,
    btn: "MAKE DECISION (GATING)",
    logs: [
      "Indirect Path (D2): Fatigue signals received.",
      "GPe: Inhibition signal SENT to Thalamus.",
      "Computation: Cost (High Effort) > Reward (Health)."
    ]
  },
  {
    title: "ACTION SELECTION",
    desc: "Direct Pathway overwrites NO-GO signal. Thalamus disinhibited. Action initiated.",
    phone: 1.0, sport: 0.0,
    btn: "RESET SIMULATION",
    logs: [
      "GPi/SNr: Activity PAUSED (Gate Open).",
      "Thalamus: Burst firing (80Hz) to Cortex.",
      "Motor Cortex: Executing motor program 'LIE_DOWN'."
    ]
  }
];

function logToConsole(message) {
  const consolePanel = document.getElementById('consolePanel');
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });

  entry.innerHTML = `<span class="log-time">[${timeString}]</span>${message}`;
  consolePanel.appendChild(entry);

  // Keep last 50 logs to allow scrolling history
  if (consolePanel.children.length > 50) {
    consolePanel.removeChild(consolePanel.children[0]);
  }

  // Auto-scroll to bottom
  consolePanel.scrollTop = consolePanel.scrollHeight;
}


// --- Live Graph Monitor Class ---
class GraphMonitor {
  constructor(canvasId, colorStr) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.color = colorStr;
    this.data = new Array(100).fill(0); // History buffer
  }

  addValue(normalizedValue) {
    // normalizedValue 0.0 to 1.0
    // Push new value, shift old
    this.data.push(normalizedValue);
    this.data.shift();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Draw Line Path
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = w / (this.data.length - 1);

    for (let i = 0; i < this.data.length; i++) {
      const val = this.data[i];
      // Invert Y because canvas 0 is top
      // Add some jitter for "noise" realism
      const jitter = (Math.random() - 0.5) * 0.05;
      const y = h - ((val + jitter) * h * 0.9); // Scale to 90% height

      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
    ctx.stroke();

    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// Instantiate Monitors
const phoneMonitor = new GraphMonitor('phoneGraph', '#00ffff');
const sportMonitor = new GraphMonitor('sportGraph', '#ff8800');

function updateGraphValues() {
  // Smoothly interpolate current display values towards target logic values
  // simple lerp
  phoneActivityDisplay = THREE.MathUtils.lerp(phoneActivityDisplay, phoneActivity, 0.05);
  sportActivityDisplay = THREE.MathUtils.lerp(sportActivityDisplay, sportActivity, 0.05);

  phoneMonitor.addValue(phoneActivityDisplay);
  sportMonitor.addValue(sportActivityDisplay);

  phoneMonitor.draw();
  sportMonitor.draw();

  // Update Text Hz
  // 0.0-1.0 -> 0-100Hz
  const pHz = Math.round(phoneActivityDisplay * 80);
  const sHz = Math.round(sportActivityDisplay * 80);
  document.getElementById('phoneVal').innerText = pHz + " Hz";
  document.getElementById('sportVal').innerText = sHz + " Hz";
}

let phoneActivityDisplay = 0.1;
let sportActivityDisplay = 0.1;

function updateUIAndState() {

  if (currentStep < 0) currentStep = 0;
  if (currentStep >= steps.length) currentStep = steps.length - 1;
  if (currentStep < 0) currentStep = 0;

  const s = steps[currentStep];

  // UI Update
  document.getElementById('phaseTitle').innerText = s.title;
  document.getElementById('descText').innerText = s.desc;
  document.getElementById('actionBtn').innerText = s.btn;

  // Logs
  if (currentStep !== lastStep) {
    if (s.logs) {
      s.logs.forEach((log, index) => {
        setTimeout(() => logToConsole(log), index * 600); // Stagger logs
      });
    }
  }

  // Hide Back button on initial step
  const backBtn = document.getElementById('backBtn');
  if (currentStep === 0) {
    backBtn.style.display = 'none';
    document.getElementById('actionBtn').style.width = '100%';
  } else {
    backBtn.style.display = 'inline-block';
    document.getElementById('actionBtn').style.width = 'auto';
  }

  // Update Target Activities for Monitors to Lerp towards
  phoneActivity = s.phone;
  sportActivity = s.sport;

  // Trigger effects
  if (currentStep !== lastStep) {
    // Clear previous bubbles if any? (Optional, but good for cleanup)
    const existingBubbles = document.querySelectorAll('.thought-bubble');
    existingBubbles.forEach(b => b.remove());

    spawnStepThoughts(currentStep); // Spawn thoughts again if we revisit
    lastStep = currentStep;
  }
}

window.nextStep = function () {
  currentStep++;
  if (currentStep >= steps.length) {
    currentStep = 0;
    controls.autoRotateSpeed = 2.0;
    // Clear Console on Reset
    document.getElementById('consolePanel').innerHTML = '';
    logToConsole("System: Simulation Reset. Re-initializing...");
  }
  updateUIAndState();
};

window.prevStep = function () {
  if (currentStep > 0) {
    currentStep--;
    updateUIAndState();
  }
};

document.getElementById('actionBtn').addEventListener('click', window.nextStep);
document.getElementById('backBtn').addEventListener('click', window.prevStep);


// --- Interaction ---
const mouse = new THREE.Vector2();
window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// --- Animation ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // Update uniforms
  tubeMaterial.uniforms.time.value = time;
  tubeMaterial.uniforms.mouse.value.set(mouse.x * 0.5, mouse.y * 0.5, 0);
  particleMaterial.uniforms.time.value = time;

  // Update particles
  const positions = particleGeometry.attributes.position.array;

  for (let i = 0; i < myPoints.length; i++) {
    myPoints[i].curPosition += myPoints[i].speed;
    myPoints[i].curPosition = myPoints[i].curPosition % 1;

    const curPoint = myPoints[i].curve.getPointAt(myPoints[i].curPosition);
    positions[i * 3] = curPoint.x;
    positions[i * 3 + 1] = curPoint.y;
    positions[i * 3 + 2] = curPoint.z;
  }

  particleGeometry.attributes.position.needsUpdate = true;

  // Update Simulation Pathways
  pathways.forEach(path => {
    const activity = path.id === 'phone' ? phoneActivity : sportActivity;
    path.tubeMat.opacity = THREE.MathUtils.lerp(path.tubeMat.opacity, activity * 0.6, 0.1);

    path.pulses.forEach(p => {
      if (!p.active) { p.mesh.visible = false; return; }
      p.mesh.visible = true;

      let currentSpeed = 0.001 + (activity * 0.005); // Scaled speed for smaller brain

      if (path.id === 'sport' && currentStep >= 2) {
        currentSpeed *= 0.05;
        p.mesh.position.add(new THREE.Vector3((Math.random() - .5) * 0.001, (Math.random() - .5) * 0.001, 0));
      }

      p.progress += currentSpeed;
      if (p.progress > 1) p.progress = 0;

      const pos = path.curve.getPointAt(p.progress);
      p.mesh.position.copy(pos);

      if (path.id === 'phone' && currentStep >= 1) {
        p.mesh.scale.setScalar(2.0);
        p.mesh.material.color.setHex(0xffffff);
      } else if (path.id === 'sport' && currentStep >= 2) {
        p.mesh.scale.setScalar(0.5);
        p.mesh.material.color.setHex(0x550000);
      } else {
        p.mesh.scale.setScalar(1);
        p.mesh.material.color.copy(path.baseColor);
      }
    });
  });

  // --- Visual Enhancement: Decision "Electrical Shine" ---
  // When decision is made (Step 3), make the whole brain glow/pulse
  if (currentStep === 3) {
    // Fast electrical pulse
    const intensity = 1.0 + Math.sin(time * 20) * 0.5; // Base 1.0, +/- 0.5
    // Boost blue channel for "electrical" look
    const baseR = 0.1; const baseG = 0.3; const baseB = 0.6;

    tubeMaterial.uniforms.color.value.setRGB(baseR * intensity, baseG * intensity, baseB * intensity * 1.5);
    particleMaterial.uniforms.color.value.setRGB(baseR * intensity, baseG * intensity, baseB * intensity * 1.5);
  } else {
    // Restore base color
    tubeMaterial.uniforms.color.value.setRGB(0.1, 0.3, 0.6);
    particleMaterial.uniforms.color.value.setRGB(0.1, 0.3, 0.6);
  }

  updateLabels(); // Update visibility classes
  updateGraphValues(); // Update Live EEG Graphs

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
