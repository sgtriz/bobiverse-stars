import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import systems from './data/systems.json';
import planets from './data/planets.json';
import routes from './data/routes.json';

// Seeded random generator for deterministic nebula placement
function createSeededRandom(seed) {
  return function() {
    seed = Math.sin(seed) * 10000;
    return seed - Math.floor(seed);
  };
}
const seededRandom = createSeededRandom(42);

// Dynamic discovery years from routes (for timeline)
const systemDiscoveryYears = {};
// Hardcode Sol's discovery year
systemDiscoveryYears['Sol'] = 0;

// Process routes to set discovery years for systems (maidenVoyage arrivals)
routes.forEach(route => {
  if (route.maidenVoyage && route.to) {
    const endYear = route.endYear;
    // Only set if earlier than existing (first arrival)
    if (!systemDiscoveryYears[route.to] || endYear < systemDiscoveryYears[route.to]) {
      systemDiscoveryYears[route.to] = endYear;
    }
  }
});

// Coordinate scale factor to spread stars out
const SCALE_FACTOR = 8; // Doubled again from 4 to make universe twice as large again

// Star size mapping based on size_class
const STAR_SIZES = {
  small: 0.225,
  medium: 0.50,
  large: 1.45,
  supermassive: 8.0
};

// Exploration routes imported from routes.json
// Uses 'routes' imported at top of file

// Setup scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005);
const nebulaSprites = [];

// Setup camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  20000 // Doubled to prevent clipping of distant stars
);
camera.position.z = 15; // Close to Sol (origin), not scaled by SCALE_FACTOR
camera.updateProjectionMatrix(); // Update after changing far plane

// Setup renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  const appContainer = document.getElementById('app');
  appContainer.appendChild(renderer.domElement);

// Deep Space Nebulas (created before stars to render as backdrop)
createNebulae();

// Setup OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Clock for delta time
const clock = new THREE.Clock();

// Planet group to manage active planets
const currentPlanetsGroup = new THREE.Group();
scene.add(currentPlanetsGroup);

// Exploration trails group
const explorationTrails = new THREE.Group();
scene.add(explorationTrails);

// Store star meshes for raycasting
const starMeshes = [];
const starDataMap = new Map();

// Helper: get scaled position for a system by id
function getSystemPosition(id) {
  const system = systems.find(s => s.id === id);
  if (!system) return null;
  return new THREE.Vector3(
    system.x * SCALE_FACTOR,
    system.y * SCALE_FACTOR,
    system.z * SCALE_FACTOR
  );
}

// Helper: get system by display name
function getSystemByName(name) {
  return systems.find(s => s.name === name);
}

// Draw exploration trails (ONLY maiden voyages - first trips to new systems)
const cometSprites = []; // Store comets for animation
const threatZones = []; // Store threat zones for animation

function createThreatZone(type, starRadius) {
  const zoneGroup = new THREE.Group();
  const zoneR = starRadius * 3.5; // 3.5x star size (final adjustment)
  
  // Inner soft volumetric glow
  const glowGeo = new THREE.SphereGeometry(zoneR, 6, 6); // Minimalist geometry (6x6)
  const glowColor = type === 'brazilian' ? 0xccff00 : 0xff0033; // Toxic Yellow-Green : Crimson
  const glowMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0.03, // Reduced for holographic feel
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.raycast = () => {}; // Disable raycasting
  zoneGroup.add(glowMesh);
    
  // Tactical wireframe (coarser grid)
  const wireGeo = new THREE.SphereGeometry(zoneR * 1.05, 6, 6); // Minimalist geometry
  const wireMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    wireframe: true,
    transparent: true,
    opacity: 0.08, // Reduced for holographic feel
    depthWrite: false // Allow clicks to pass through
  });
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  wireMesh.raycast = () => {}; // Disable raycasting
  zoneGroup.add(wireMesh);
    
  // Store references for animation
  zoneGroup.userData = { glowMesh, wireMesh, type };
  return zoneGroup;
}

const shipyards = []; // Store shipyards for animation

function createShipyard(targetRadius) {
  const group = new THREE.Group();
  group.rotation.x = Math.PI / 6; // Slightly tilted
  
  const moduleCount = 25; // 20-30 tiny modules
  const radius = targetRadius || 0.5; // Use passed radius, default to 0.5
  
  // Create thin scaffolding ring (TorusGeometry with very thin tube)
  const scaffoldGeo = new THREE.TorusGeometry(radius, 0.05, 8, 64); // Thicker tube for visibility
  const scaffoldMat = new THREE.MeshBasicMaterial({
    color: 0x444444, // Dark metallic
    wireframe: true,
    transparent: true,
    opacity: 0.8, // Increased from 0.5
    depthWrite: false
  });
  const scaffold = new THREE.Mesh(scaffoldGeo, scaffoldMat);
  scaffold.raycast = () => {}; // Disable raycasting
  group.add(scaffold);
  
  // Create tiny modules as Points (dots/stations)
  const positions = [];
  const activeIndices = []; // Track which modules have cyan glow
  
  for (let i = 0; i < moduleCount; i++) {
    const angle = (i / moduleCount) * Math.PI * 2;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    const y = (Math.random() - 0.5) * 0.02; // Tiny Y variation
    
    positions.push(x, y, z);
    activeIndices.push(i); // ALL modules get cyan for visibility
  }
  
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  
  const pointsMat = new THREE.PointsMaterial({
    color: 0x00f3ff, // Solid cyan (no vertex colors for simplicity)
    size: 1.5, // 3x bigger than 0.5 for maximum visibility
    sizeAttenuation: false, // Use world units
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  
  const points = new THREE.Points(pointsGeo, pointsMat);
  points.raycast = () => {}; // Disable raycasting
  points.userData = { activeIndices }; // Store for animation
  group.add(points);
  
  return group;
}

function drawExplorationTrails() {
  routes.forEach(route => {
    // Only render first arrivals (maidenVoyage: true)
    if (!route.maidenVoyage) return;
    
    const fromSystem = getSystemByName(route.from);
    const toSystem = getSystemByName(route.to);
    
    if (!fromSystem || !toSystem) {
      console.warn(`Skipping trail ${route.from} -> ${route.to}: system not found`);
      return;
    }
    
    const start = getSystemPosition(fromSystem.id);
    const end = getSystemPosition(toSystem.id);
    
    if (!start || !end) return;
    
    const points = [start, end];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Use DashedMaterial for animated flow effect
    const material = new THREE.LineDashedMaterial({
      color: 0x00f3ff, // Cyan
      dashSize: 0.5,
      gapSize: 0.3,
      transparent: true,
      opacity: 0.6
    });
    const line = new THREE.Line(geometry, material);
    line.userData = { route, startPoint: start, endPoint: end };
    line.computeLineDistances(); // Required for dashed lines
    explorationTrails.add(line);
    
    // Create comet sprite for this route
    const cometCanvas = document.createElement('canvas');
    cometCanvas.width = 32;
    cometCanvas.height = 32;
    const ctx = cometCanvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(0, 243, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(0, 243, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 243, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    
    const cometTexture = new THREE.CanvasTexture(cometCanvas);
    const cometMaterial = new THREE.SpriteMaterial({
      map: cometTexture,
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cometSprite = new THREE.Sprite(cometMaterial);
    cometSprite.scale.set(0.5, 0.5, 1);
    cometSprite.userData = {
      route: route,
      startPoint: start.clone(),
      endPoint: end.clone(),
      progress: 0, // 0 to 1 along path
      speed: 0.2 + Math.random() * 0.3, // Random speed
      visible: false,
      delayRemaining: Math.random() * 2 // Random initial delay
    };
    cometSprite.position.copy(start);
    explorationTrails.add(cometSprite);
    cometSprites.push(cometSprite);
  });
}

// Create star spheres with scaled positions and proper sizes
systems.forEach(system => {
  const radius = STAR_SIZES[system.size_class] || 0.35;
  const geometry = new THREE.SphereGeometry(radius, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(system.color), transparent: true, opacity: 1.0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { id: system.id };
  
  const scaledX = system.x * SCALE_FACTOR;
  const scaledY = system.y * SCALE_FACTOR;
  const scaledZ = system.z * SCALE_FACTOR;
  
  // Supermassive handler for Sagittarius A* - black core with orange rim-light
  if (system.size_class === "supermassive") {
    mesh.material.color.set(0x000000); // Black core
    // Add tight orange rim-light
    const rimGeo = new THREE.SphereGeometry(radius * 1.15, 32, 32);
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.raycast = () => {};
    mesh.add(rimMesh);
  }
  
  mesh.position.set(scaledX, scaledY, scaledZ);
  scene.add(mesh);
  starMeshes.push(mesh);
  starDataMap.set(mesh.uuid, system);
  
  // Add Skunk Works shipyard (rotating tactical structure)
  // Always apply to star if isSkunkWorks: true (ignore planet hub for visibility testing)
  if (system.isSkunkWorks) {
    const starRadius = STAR_SIZES[system.size_class] || 0.35;
    const orbitRadius = starRadius + 0.15; // Just outside star surface
    const shipyard = createShipyard(orbitRadius); // Create at correct size
    mesh.add(shipyard); // Attach to star mesh
    // Store points reference for animation (skip scaffold at index 0)
    const points = shipyard.children[1];
    shipyards.push({ group: shipyard, points });
  }
  
  // Remove planet hub logic temporarily - shipyard goes on star only
  
  // Add threat zone if system has threatLevel
  if (system.threatLevel) {
    const starRadius = STAR_SIZES[system.size_class] || 0.35;
    const zone = createThreatZone(system.threatLevel, starRadius);
    mesh.add(zone); // Attach zone to star mesh
    threatZones.push({ zone, system });
  }
});

// Draw exploration trails after stars are created
drawExplorationTrails();

// Background starfield (scaled to match)
const starCount = 18000; // 3x more stars for 10x larger field
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i += 3) {
  const distance = (150 + Math.random() * 4000) * SCALE_FACTOR; // 10x bigger field
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i] = distance * Math.sin(phi) * Math.cos(theta);
  starPositions[i + 1] = distance * Math.sin(phi) * Math.sin(theta);
  starPositions[i + 2] = distance * Math.cos(phi);
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.8 });
scene.add(new THREE.Points(starGeometry, starMaterial));

// Space Dust: 75 large, faint white/blue sprites
function createDustTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const dustTexture = createDustTexture();
const dustMaterial = new THREE.SpriteMaterial({
  map: dustTexture,
  color: 0xaaaaee, // Light blue tint
  transparent: true,
  opacity: 0.05,
  depthWrite: false // Prevent z-fighting
});
const dustCount = 450; // 3x more dust for 10x larger field

for (let i = 0; i < dustCount; i++) {
  const sprite = new THREE.Sprite(dustMaterial);
  // Random position in 10x expanded scene bounds
  sprite.position.set(
    (Math.random() - 0.5) * 2000 * SCALE_FACTOR, // 10x bigger
    (Math.random() - 0.5) * 2000 * SCALE_FACTOR,
    (Math.random() - 0.5) * 2000 * SCALE_FACTOR
  );
  // Large size for visibility
  const size = 10 + Math.random() * 10;
  sprite.scale.set(size, size, 1);
  scene.add(sprite);
}

// Deep Space Nebulas
function createNebulae() {
  const textureLoader = new THREE.TextureLoader();
  const nebulaTexture = textureLoader.load('https://assets.codepen.io/682745/cloud2.png');
  
  const nebulaColors = [
    0x008080, // Teal
    0x4b0082, // Purple
    0xff8c19, // Soft Orange
    0x00ff00, // Neon Green
    0xff1493, // Deep Pink
    0x00bfff, // Deep Sky Blue
    0xff4500, // Orange Red
    0x9400d3, // Dark Violet
    0x00ced1, // Dark Turquoise
    0xffd700, // Gold
    0xff6347, // Tomato
    0x7b68ee  // Medium Slate Blue
  ];
  
  const spriteCount = 16 + Math.floor(seededRandom() * 10); // 16-26 sprites (doubled)

  for (let i = 0; i < spriteCount; i++) {
    const material = new THREE.SpriteMaterial({
      map: nebulaTexture,
      color: nebulaColors[i % nebulaColors.length],
      transparent: true,
      opacity: 0.05 + seededRandom() * 0.05, // Reduced: 0.05 - 0.1
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = -1; // Render first (as backdrop)
    
    // Random position far from center (2x farther: 8000-16000 units)
    const distance = 8000 + seededRandom() * 8000;
    const theta = seededRandom() * Math.PI * 2;
    const phi = Math.acos(2 * seededRandom() - 1);
    sprite.position.set(
      distance * Math.sin(phi) * Math.cos(theta),
      distance * Math.sin(phi) * Math.sin(theta),
      distance * Math.cos(phi)
    );
    
    // Large scale (5x bigger: 3750x3750)
    sprite.scale.set(3750, 3750, 1);
    
    sprite.material.rotation = seededRandom() * Math.PI;
    
    scene.add(sprite);
    nebulaSprites.push(sprite);
  }
}

// Raycasting setup
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isAnimating = false;

// DOM elements
const sidebar = document.getElementById('system-sidebar');
const sidebarContent = document.getElementById('sidebar-content');
const closeSidebarBtn = document.getElementById('close-sidebar');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help');

// Show help modal on every page load
window.addEventListener('load', () => {
  helpModal.classList.add('active');
});

// Close help modal
closeHelpBtn.addEventListener('click', () => {
  helpModal.classList.remove('active');
});

// Help button opens modal
helpBtn.addEventListener('click', () => {
  helpModal.classList.add('active');
});

// Clear all planets from scene
function clearPlanets() {
  while (currentPlanetsGroup.children.length > 0) {
    const child = currentPlanetsGroup.children[0];
    currentPlanetsGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  }
}

// Spawn planets for a system (filters planets.json by systemId)
function spawnPlanets(systemData, starPosition) {
  // Filter planets array by systemId
  const systemPlanets = planets.filter(p => p.systemId === systemData.id);
  if (systemPlanets.length === 0) return;

  const planetColors = [0x8B7355, 0x1E90FF, 0xFF8C00, 0x32CD32, 0x8A2BE2, 0xFF69B4];

  systemPlanets.forEach((planet, index) => {
    // Skip megastructures (they are handled separately)
    if (planet.type) return;

    const radius = 0.08 + Math.random() * 0.05; // Increased from 0.05+0.03
    const geometry = new THREE.SphereGeometry(radius, 8, 8);
    const colorHex = planetColors[index % planetColors.length];
    const material = new THREE.MeshBasicMaterial({ color: colorHex });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Use orbit from planet data (visual units), scaled by system's orbitScale
    const systemOrbitScale = systemData.orbitScale || 1.0;
    const orbitRadius = planet.orbit * systemOrbitScale;
    const angle = Math.random() * Math.PI * 2;
    const orbitSpeed = 0.1 + Math.random() * 0.2;
    
    mesh.userData = { 
      orbitRadius, 
      angle, 
      orbitSpeed, 
      starPosition: starPosition.clone(),
      name: planet.name,
      lore: planet.lore || null
    };
    
    mesh.position.set(
      starPosition.x + orbitRadius * Math.cos(angle),
      starPosition.y,
      starPosition.z + orbitRadius * Math.sin(angle)
    );
    
    currentPlanetsGroup.add(mesh);
    
    // Add orbital ring for this planet
    const ringGeometry = new THREE.RingGeometry(orbitRadius - 0.01, orbitRadius + 0.01, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3 // Increased from 0.15 for better visibility
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2; // Lay flat in X-Z plane
    ring.position.copy(starPosition);
    currentPlanetsGroup.add(ring);
  });

  // Handle megastructures (Heaven's River Topopolis)
  const mega = systemPlanets.find(p => p.type === "Topopolis");
  if (mega) {
    // Create TorusKnotGeometry as per user's example
    const topoGeometry = new THREE.TorusKnotGeometry(mega.orbit, 0.08, 120, 16, 2, 3);
    const topoMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    const topopolisMesh = new THREE.Mesh(topoGeometry, topoMaterial);
    
    // Position at star's coordinates
    topopolisMesh.position.copy(starPosition);
    
    // Store megastructure metadata
    topopolisMesh.userData = {
      isMegastructure: true,
      name: mega.name,
      type: mega.type,
      lore: mega.lore,
      towns: mega.towns,
      orbit: mega.orbit
    };
    
    currentPlanetsGroup.add(topopolisMesh);
  }
}

// Helper: Generate Mission Card HTML
function generateMissionCard(route, currentSystemName) {
  const isOutbound = route.from === currentSystemName;
  
  // Row 1: Tags
  const directionTag = isOutbound ? 
    '<span class="tag tag-outbound">OUTBOUND</span>' : 
    '<span class="tag tag-inbound">INBOUND</span>';
  const discoveryTag = !isOutbound && route.maidenVoyage ? 
    '<span class="tag tag-discovery">DISCOVERY</span> ' : '';
  
  // Determine rows 2-4 based on direction
  let detailsHTML = '';
  if (isOutbound) {
    // OUTBOUND: Departed + Destination
    detailsHTML = `
      <div><span class="log-label">Name:</span><span class="log-value">${route.traveler}</span></div>
      <div><span class="log-label">Departed:</span><span class="log-value">${route.startYear}</span></div>
      <div><span class="log-label">Destination:</span><span class="log-value">${route.to}</span></div>
    `;
  } else {
    // INBOUND: Arrived + Origin
    detailsHTML = `
      <div><span class="log-label">Name:</span><span class="log-value">${route.traveler}</span></div>
      <div><span class="log-label">Arrived:</span><span class="log-value">${route.endYear}</span></div>
      <div><span class="log-label">Origin:</span><span class="log-value">${route.from}</span></div>
    `;
  }
  
  // Row 5: Note
  const noteHTML = route.note ? `<div class="log-note">${route.note}</div>` : '';
  
  return `
    <div class="mission-card ${isOutbound ? 'outbound' : 'inbound'}" data-route-from="${route.from}" data-route-to="${route.to}">
      <div>${discoveryTag}${directionTag}</div>
      ${detailsHTML}
      ${noteHTML}
    </div>
  `;
}

// Helper: Fly to a system by name
function flyToSystem(systemName) {
  const system = getSystemByName(systemName);
  if (!system) return;
  
  const starMesh = starMeshes.find(m => m.userData.id === system.id);
  if (!starMesh) return;
  
  // Clear old planets and spawn new ones
  clearPlanets();
  spawnPlanets(system, starMesh.position);
  
  // Populate sidebar
  const systemPlanets = planets.filter(p => p.systemId === system.id && !p.type);
  const planetsList = systemPlanets.length > 0 ? `
    <div class="planets-section">
      <h4>Key Planets</h4>
      <ul>
        ${systemPlanets.map(p => {
          const pLore = p.lore ? ` - ${p.lore}` : '';
          const isHabitable = /habitable/i.test(p.name) || (p.lore && /habitable/i.test(p.lore));
          const planetClass = isHabitable ? 'planet-habitable' : 'planet-uninhabitable';
          return `<li class="${planetClass}">${p.name}${pLore}</li>`;
        }).join('')}
      </ul>
    </div>
  ` : '';
  
  // Build exploration trails - sort by display year
  const connectedRoutes = routes.filter(r => 
    r.from === system.name || r.to === system.name
  ).sort((a, b) => {
    const aIsOut = a.from === system.name;
    const bIsOut = b.from === system.name;
    const aYear = aIsOut ? a.startYear : a.endYear;
    const bYear = bIsOut ? b.startYear : b.endYear;
    return aYear - bYear;
  });
  
  let trailsSection = '';
  if (connectedRoutes.length > 0) {
    const routeItems = connectedRoutes.map(route => generateMissionCard(route, system.name)).join('');
    trailsSection = `
      <div class="trails-section">
        <h4>Exploration Logs</h4>
        ${routeItems}
      </div>
    `;
  }
  
  // System-specific notes
  let systemSpecificNotes = '';
  switch(system.name) {
    case "Epsilon Eridani":
      systemSpecificNotes = `<p class="lore"><strong>Primary Skunk Works Hub:</strong> Bill developed the Icarus and Daedalus probes here.</p>`;
      break;
    case "Sagittarius A*":
      systemSpecificNotes = `<p class="lore"><strong>Federation Capital Proximity:</strong> ~7 light-years from the galactic center. Future wormhole tech was discovered here.</p>`;
      break;
    case "Eta Leporis":
      systemSpecificNotes = `<p class="lore"><strong>Timeline Discrepancy:</strong> Bender arrived first but went missing; Bob One tracked his trail in 2331.</p>`;
      break;
  }
  
  sidebarContent.innerHTML = `
    <h3>${system.name}</h3>
    <p class="distance">Distance from Sol: ${system.dist} light-years</p>
    <p class="bobs">Bobs in system: ${system.bobs.join(', ')}</p>
    <p class="lore">${system.lore}</p>
    ${systemSpecificNotes}
    ${planetsList}
    ${trailsSection}
  `;
  sidebar.classList.add('active');
  
  // Camera animation
  const offset = 2 * SCALE_FACTOR;
  const cameraTargetPos = {
    x: system.x * SCALE_FACTOR + offset,
    y: system.y * SCALE_FACTOR + offset,
    z: system.z * SCALE_FACTOR + offset
  };
  
  isAnimating = true;
  controls.enabled = false;
  
  gsap.to(camera.position, {
    x: cameraTargetPos.x,
    y: cameraTargetPos.y,
    z: cameraTargetPos.z,
    duration: 1.5,
    ease: "power2.inOut",
    onComplete: () => {
      isAnimating = false;
      controls.enabled = true;
    }
  });
  
  gsap.to(controls.target, {
    x: system.x * SCALE_FACTOR,
    y: system.y * SCALE_FACTOR,
    z: system.z * SCALE_FACTOR,
    duration: 1.5,
    ease: "power2.inOut"
  });
}

// Close sidebar handler
closeSidebarBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebar.classList.remove('active');
  clearPlanets();
});

// Event delegation for mission card clicks (navigation)
sidebarContent.addEventListener('click', (e) => {
  const card = e.target.closest('.mission-card');
  if (!card) return;
  
  const routeFrom = card.dataset.routeFrom;
  const routeTo = card.dataset.routeTo;
  
  // Determine which system to fly to based on current sidebar
  const currentSystemName = sidebar.querySelector('h3')?.textContent;
  if (!currentSystemName) return;
  
  // If outbound (from = current), fly to destination; if inbound, fly to origin
  const isOutbound = routeFrom === currentSystemName;
  const targetSystem = isOutbound ? routeTo : routeFrom;
  
  flyToSystem(targetSystem);
});

// Handle click events
const handleClick = (event) => {
  if (isAnimating) return;
  if (sidebar.contains(event.target)) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  // First check planets and megastructures (currentPlanetsGroup children)
  const planetIntersects = raycaster.intersectObjects(currentPlanetsGroup.children, false);
  if (planetIntersects.length > 0) {
    const clickedObj = planetIntersects[0].object;
    
    // Handle megastructure click (Heaven's River)
    if (clickedObj.userData.isMegastructure) {
      const mega = clickedObj.userData;
      sidebarContent.innerHTML = `
        <h3>${mega.name}</h3>
        <p class="distance">Type: ${mega.type}</p>
        <p class="lore">${mega.lore}</p>
        <div class="trails-section">
          <h4>Towns in ${mega.name}</h4>
          <ul>
            ${mega.towns.map(t => `<li>${t}</li>`).join('')}
          </ul>
        </div>
      `;
      sidebar.classList.add('active');
      console.log(`Clicked on megastructure: ${mega.name}`);
      return;
    }
    
    // Handle planet click
    if (clickedObj.userData.name) {
      const planet = clickedObj.userData;
      sidebarContent.innerHTML = `
        <h3>${planet.name}</h3>
        <p class="distance">Orbit radius: ${planet.orbitRadius.toFixed(2)} units</p>
        ${planet.lore ? `<p class="lore">${planet.lore}</p>` : ''}
      `;
      sidebar.classList.add('active');
      console.log(`Clicked on planet: ${planet.name}`);
      return;
    }
  }

  // Then check stars
  const starIntersects = raycaster.intersectObjects(starMeshes);
  if (starIntersects.length > 0) {
    const clickedMesh = starIntersects[0].object;
    const system = starDataMap.get(clickedMesh.uuid);
    if (system) {
      flyToSystem(system.name);
    }
    return;
  }
  // NOTE: Planets persist during camera orbit - no clearing on empty click
};

document.addEventListener('click', handleClick);

// Handle window resize
const handleResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};
window.addEventListener('resize', handleResize);

// Search functionality
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimeout;

const handleSearch = (query) => {
  query = query.trim().toLowerCase();
  if (!query) {
    searchResults.classList.remove('active');
    searchResults.innerHTML = '';
    return;
  }

  const results = [];

  // Search systems.json (name)
  systems.forEach(system => {
    if (system.name.toLowerCase().includes(query)) {
      results.push({
        type: 'system',
        name: system.name,
        systemId: system.id,
        systemName: system.name
      });
    }
  });

  // Search planets.json (name, get associated system)
  planets.forEach(planet => {
    if (planet.name.toLowerCase().includes(query)) {
      const system = systems.find(s => s.id === planet.systemId);
      if (system) {
        results.push({
          type: 'planet',
          name: planet.name,
          systemId: planet.systemId,
          systemName: system.name
        });
      }
    }
  });

  // Search routes.json (traveler, get systems)
  const travelerSystems = new Map();
  routes.forEach(route => {
    if (route.traveler.toLowerCase().includes(query)) {
      if (!travelerSystems.has(route.traveler)) {
        travelerSystems.set(route.traveler, new Set());
      }
      travelerSystems.get(route.traveler).add(route.from);
      travelerSystems.get(route.traveler).add(route.to);
    }
  });

  travelerSystems.forEach((systemNames, traveler) => {
    systemNames.forEach(systemName => {
      const system = getSystemByName(systemName);
      if (system) {
        results.push({
          type: 'traveler',
          name: `${traveler} - ${systemName}`,
          systemId: system.id,
          systemName: systemName,
          traveler: traveler
        });
      }
    });
  });

  // Remove duplicates
  const uniqueResults = [];
  const seen = new Set();
  results.forEach(result => {
    const key = `${result.type}-${result.systemId}-${result.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(result);
    }
  });

  // Render results
  if (uniqueResults.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
  } else {
    searchResults.innerHTML = uniqueResults.map(result => `
      <div class="search-result-item" data-system-id="${result.systemId}" data-system-name="${result.systemName}">
        ${result.type === 'traveler' ? '🚀' : result.type === 'planet' ? '🪐' : '⭐'} ${result.name}
      </div>
    `).join('');
  }

  searchResults.classList.add('active');
};

// Debounce input (200ms)
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    handleSearch(e.target.value);
  }, 200);
});

// Close search when clicking outside
document.addEventListener('click', (e) => {
  if (searchContainer && !searchContainer.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.classList.remove('active');
  }
});

// Handle search result click - triggers fly-to + sidebar
searchResults.addEventListener('click', (e) => {
  const resultItem = e.target.closest('.search-result-item');
  if (!resultItem) return;

  const systemId = resultItem.dataset.systemId;
  const system = systems.find(s => s.id === systemId);
  if (!system) return;

  // Use flyToSystem for consistent behavior
  flyToSystem(system.name);

  // Clear search
  searchInput.value = '';
  searchResults.classList.remove('active');
  searchResults.innerHTML = '';
});

// Timeline and Route Toggle Logic
let routesVisible = true;
const timelineSlider = document.getElementById('timeline-slider');
const timelineLabel = document.getElementById('timeline-label');
const toggleRoutesBtn = document.getElementById('toggle-routes');

function updateTimeline(currentYear) {
  // Update stars
  starMeshes.forEach(mesh => {
    const system = starDataMap.get(mesh.uuid);
    if (!system) return;
    const discoveryYear = systemDiscoveryYears[system.name];
    // If no discovery year recorded, treat as always visible (e.g., Sol is hardcoded 0)
    if (discoveryYear !== undefined && discoveryYear > currentYear) {
      // Not discovered yet - fade out
      if (mesh.material.opacity > 0.15) {
        gsap.to(mesh.material, { opacity: 0.15, duration: 0.5 });
      }
    } else {
      // Discovered - fade in
      if (mesh.material.opacity < 1.0) {
        gsap.to(mesh.material, { opacity: 1.0, duration: 0.5 });
      }
    }
  });
  
  // Update threat zones
  threatZones.forEach(item => {
    const { zone, system } = item;
    const discoveryYear = systemDiscoveryYears[system.name];
    if (discoveryYear !== undefined && discoveryYear > currentYear) {
      zone.visible = false;
    } else {
      zone.visible = true;
    }
  });
  
  // Update routes
  explorationTrails.children.forEach(line => {
    if (!line.userData || !line.userData.route) return;
    const route = line.userData.route;
    if (!routesVisible) {
      line.visible = false;
      return;
    }
    if (route.startYear > currentYear) {
      line.visible = false;
    } else {
      line.visible = true;
    }
  });
}

// Slider event
timelineSlider.addEventListener('input', (e) => {
  const year = parseInt(e.target.value);
  timelineLabel.textContent = year;
  updateTimeline(year);
});

// Toggle routes button
toggleRoutesBtn.addEventListener('click', () => {
  routesVisible = !routesVisible;
  toggleRoutesBtn.classList.toggle('active');
  // Update visibility based on current slider value
  updateTimeline(parseInt(timelineSlider.value));
});

// Initialize timeline to max year (show all)
updateTimeline(parseInt(timelineSlider.value));

// Animation loop
const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  
  // Get delta time for animations
  const delta = clock.getDelta();

  // Update planet orbits
  currentPlanetsGroup.children.forEach(planet => {
    if (planet.userData && planet.userData.orbitRadius !== undefined) {
      const { orbitRadius, angle, orbitSpeed, starPosition } = planet.userData;
      const newAngle = angle + orbitSpeed * delta;
      planet.userData.angle = newAngle;
      planet.position.set(
        starPosition.x + orbitRadius * Math.cos(newAngle),
        starPosition.y,
        starPosition.z + orbitRadius * Math.sin(newAngle)
      );
    }
  });

  // Animate nebula rotation (tiny imperceptible rotation)
  nebulaSprites.forEach(sprite => {
    sprite.material.rotation += 0.0001;
  });
  
  
  // Animate shipyards (rotating tactical structures)
  shipyards.forEach(item => {
    const { group, points } = item;
    if (!group) return;
    
    // Rotate entire scaffold slowly
    group.rotation.y += 0.005;
    
    // Pulse the entire points system opacity for "active" feel
    if (points && points.material) {
      points.material.opacity = 0.6 + Math.sin(Date.now() * 0.003) * 0.3;
    }
  });
  
  // Animate exploration trails (dashed lines + comets)
  const currentYear = parseInt(timelineSlider.value);
  
  explorationTrails.children.forEach(child => {
    // Animate dashed lines (flow effect)
    if (child.isLine && child.material && child.material.isLineDashedMaterial) {
      child.material.dashOffset -= 0.01; // Negative = flow from start to end
      
      // Only show if route is visible based on timeline
      const route = child.userData.route;
      if (route && route.startYear > currentYear) {
        child.visible = false;
      } else {
        child.visible = routesVisible;
      }
    }
    
    // Animate comets along routes
    if (child.isSprite && child.userData.route) {
      const comet = child;
      const route = comet.userData.route;
      const startYear = route.startYear;
      const isVisible = routesVisible && startYear <= currentYear;
      
      if (!isVisible) {
        comet.visible = false;
        return;
      }
      
      // Handle delay before restarting
      if (comet.userData.delayRemaining > 0) {
        comet.userData.delayRemaining -= delta;
        comet.visible = false;
        return;
      }
      
      comet.visible = true;
      
      // Update progress along path
      comet.userData.progress += comet.userData.speed * delta;
      
      // Reset if reached end
      if (comet.userData.progress >= 1) {
        comet.userData.progress = 0;
        comet.userData.delayRemaining = 1 + Math.random() * 3; // Random delay 1-4 seconds
        comet.position.copy(comet.userData.startPoint);
        return;
      }
      
      // Linear interpolation between start and end
      const t = comet.userData.progress;
      comet.position.set(
        comet.userData.startPoint.x + (comet.userData.endPoint.x - comet.userData.startPoint.x) * t,
        comet.userData.startPoint.y + (comet.userData.endPoint.y - comet.userData.startPoint.y) * t,
        comet.userData.startPoint.z + (comet.userData.endPoint.z - comet.userData.startPoint.z) * t
      );
    }
  });
  
  // Animate threat zones
  threatZones.forEach(item => {
    const { zone, system } = item;
    const userData = zone.userData;
    if (!userData) return;
    
    // Rotate wireframe slowly
    if (userData.wireMesh) {
      userData.wireMesh.rotation.y += 0.001;
    }
    
    // Pulse glow using sine wave
    if (userData.glowMesh) {
      const pulse = Math.sin(clock.getElapsedTime() * 2) * 0.03;
      userData.glowMesh.material.opacity = 0.05 + pulse;
    }
  });
  
  renderer.render(scene, camera);
};

animate();
