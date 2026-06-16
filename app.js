const STORAGE_KEY = "test-hole-collector-v1";
const PROJECT_INDEX_KEY = "test-hole-project-index-v1";
const ACTIVE_PROJECT_KEY = "test-hole-active-project-v1";
const PROJECT_DB_NAME = "test-hole-collector-projects-v1";
const PROJECT_STORE = "projects";

const fields = [
  "projectFileName",
  "projectNumber",
  "projectName",
  "client",
  "crew",
  "fieldDate",
  "weather",
  "coordinateSystem",
  "customCoordinateSystem",
  "mapStyle",
  "location",
  "mapLink",
  "projectNotes",
];

const holeFields = [
  "holeName",
  "expectedUtility",
  "utilityType",
  "surfaceType",
  "method",
  "elevation",
  "topPipeElevation",
  "depthTop",
  "description",
  "holeNotes",
];

const state = {
  project: defaultProject(),
  mapImage: "",
  mapZoom: 1,
  holes: [],
  selectedId: null,
};

let projectRecords = [];
let activeProjectId = null;
let projectDbPromise;

function openProjectDb() {
  if (!projectDbPromise) {
    projectDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(PROJECT_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PROJECT_STORE)) {
          request.result.createObjectStore(PROJECT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return projectDbPromise;
}

async function projectDbRequest(mode, action) {
  const db = await openProjectDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, mode);
    const request = action(transaction.objectStore(PROJECT_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const readProjectData = (id) => projectDbRequest("readonly", (store) => store.get(id));
const writeProjectData = (id, data) => projectDbRequest("readwrite", (store) => store.put(data, id));
const removeProjectData = (id) => projectDbRequest("readwrite", (store) => store.delete(id));

function defaultProject() {
  return {
    projectNumber: "",
    projectFileName: "",
    projectName: "",
    client: "",
    crew: "",
    fieldDate: new Date().toISOString().slice(0, 10),
    weather: "",
    coordinateSystem: "2236",
    customCoordinateSystem: "",
    mapStyle: "imagery",
    location: "",
    mapLink: "",
    projectNotes: "",
  };
}

const $ = (id) => document.getElementById(id);
const hasOwn = (object, property) => Object.prototype.hasOwnProperty.call(object, property);

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function selectedHole() {
  return state.holes.find((hole) => hole.id === state.selectedId) || null;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function formatDepth(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function updateCalculatedDepth(hole) {
  const ground = numericValue(hole.elevation);
  const topPipe = numericValue(hole.topPipeElevation);
  hole.depthTop = ground === null || topPipe === null ? "" : formatDepth(ground - topPipe);
}

function normalizeBearing(value) {
  const number = numericValue(value);
  if (number === null) return null;
  return ((number % 360) + 360) % 360;
}

function bearingDirection(value) {
  const bearing = normalizeBearing(value);
  if (bearing === null) return "";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(bearing / 45) % 8];
}

function oppositeDirection(direction) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = directions.indexOf(direction);
  return index < 0 ? "" : directions[(index + 4) % 8];
}

function pipeDirectionPair(pipe) {
  const first = bearingDirection(pipe.pipeBearing);
  if (!first) return "";
  return `${first}-${oppositeDirection(first)}`;
}

function blankPipe(source = {}) {
  return {
    id: source.id || uid(),
    northing: source.northing || "",
    easting: source.easting || "",
    utilitySize: source.utilitySize || "",
    material: source.material || "",
    pipeColor: source.pipeColor || "Blue",
    pipeBearing: source.pipeBearing || "",
    pipeStartDistance: source.pipeStartDistance || source.pipeDistance || "",
    pipeEndDistance: source.pipeEndDistance || source.pipeDistance || "",
  };
}

function syncPrimaryPipeLegacy(hole) {
  const pipe = (hole.pipes && hole.pipes[0]) || blankPipe();
  hole.utilitySize = pipe.utilitySize;
  hole.material = pipe.material;
  hole.pipeColor = pipe.pipeColor;
  hole.pipeBearing = pipe.pipeBearing;
  hole.pipeStartDistance = pipe.pipeStartDistance;
  hole.pipeEndDistance = pipe.pipeEndDistance;
  hole.northing = pipe.northing;
  hole.easting = pipe.easting;
}

function blankHole(index = state.holes.length + 1) {
  return {
    id: uid(),
    holeName: `TH-${index}`,
    expectedUtility: "Water",
    utilityType: "Water",
    surfaceType: "Asphalt",
    method: "Vacuum excavation",
    northing: "",
    easting: "",
    elevation: "",
    topPipeElevation: "",
    depthTop: "",
    utilitySize: "",
    material: "",
    pipeColor: "Blue",
    pipeBearing: "",
    pipeStartDistance: "",
    pipeEndDistance: "",
    pipes: [blankPipe()],
    description: "",
    holeNotes: "",
    mapX: null,
    mapY: null,
    mapImage: "",
    mapLabelImage: "",
    mapZoom: 1,
    photos: [],
  };
}

function projectStorageKey(id) {
  return `test-hole-project-${id}`;
}

function blankProjectState() {
  const projectState = JSON.parse(JSON.stringify({
    project: defaultProject(),
    mapImage: "",
    mapZoom: 1,
    holes: [],
    selectedId: null,
  }));
  projectState.holes = [blankHole(1)];
  projectState.selectedId = projectState.holes[0].id;
  return projectState;
}

function normalizeProjectData(data) {
  const normalized = data || blankProjectState();
  normalized.project = { ...defaultProject(), ...(normalized.project || {}) };
  normalized.mapImage = normalized.mapImage || "";
  normalized.mapZoom = normalized.mapZoom || 1;
  normalized.holes = Array.isArray(normalized.holes) ? normalized.holes : [];
  if (!normalized.holes.length) normalized.holes = [blankHole(1)];
  normalized.holes.forEach((hole) => {
    if (!hasOwn(hole, "expectedUtility")) hole.expectedUtility = hole.utilityType || "Water";
    if (!hasOwn(hole, "topPipeElevation")) hole.topPipeElevation = "";
    if (!hasOwn(hole, "pipeColor")) hole.pipeColor = "Blue";
    if (!hasOwn(hole, "pipeBearing")) hole.pipeBearing = "";
    if (!hasOwn(hole, "pipeStartDistance")) hole.pipeStartDistance = hole.pipeDistance || "";
    if (!hasOwn(hole, "pipeEndDistance")) hole.pipeEndDistance = hole.pipeDistance || "";
    if (!Array.isArray(hole.pipes) || !hole.pipes.length) {
      hole.pipes = [blankPipe(hole)];
    } else {
      hole.pipes = hole.pipes.map((pipe, index) => blankPipe(index === 0
        ? { northing: hole.northing, easting: hole.easting, ...pipe }
        : pipe));
    }
    syncPrimaryPipeLegacy(hole);
    if (!hasOwn(hole, "mapImage")) hole.mapImage = "";
    if (!hasOwn(hole, "mapLabelImage")) hole.mapLabelImage = "";
    if (!hasOwn(hole, "mapZoom")) hole.mapZoom = 1;
    updateCalculatedDepth(hole);
  });
  normalized.selectedId = normalized.selectedId || (normalized.holes[0] && normalized.holes[0].id) || null;
  return normalized;
}

function applyProjectData(data) {
  const normalized = normalizeProjectData(data);
  Object.assign(state.project, normalized.project);
  state.mapImage = normalized.mapImage;
  state.mapZoom = normalized.mapZoom;
  state.holes = normalized.holes;
  state.selectedId = normalized.selectedId;
}

function projectDisplayName(data = state) {
  const project = data.project || {};
  return project.projectFileName || [project.projectNumber, project.projectName].filter(Boolean).join(" - ") || "Untitled Project";
}

function saveProjectIndex() {
  localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(projectRecords));
  localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId || "");
}

async function saveActiveProjectNow() {
  if (!activeProjectId) return;
  await writeProjectData(activeProjectId, JSON.parse(JSON.stringify(state)));
  const record = projectRecords.find((project) => project.id === activeProjectId);
  if (record) {
    record.name = projectDisplayName();
    record.updatedAt = new Date().toISOString();
  }
  saveProjectIndex();
}

async function hydrate() {
  try {
    projectRecords = JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) || "[]");
  } catch {
    projectRecords = [];
  }

  if (!projectRecords.length) {
    let initialData = null;
    try {
      const legacy = localStorage.getItem(STORAGE_KEY);
      initialData = legacy ? JSON.parse(legacy) : blankProjectState();
    } catch {
      initialData = blankProjectState();
    }
    activeProjectId = uid();
    projectRecords = [{ id: activeProjectId, name: projectDisplayName(initialData), updatedAt: new Date().toISOString() }];
    await writeProjectData(activeProjectId, normalizeProjectData(initialData));
    saveProjectIndex();
  }

  activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || projectRecords[0].id;
  if (!projectRecords.some((project) => project.id === activeProjectId)) {
    activeProjectId = projectRecords[0].id;
  }

  let data = await readProjectData(activeProjectId);
  if (!data) {
    const legacyProject = localStorage.getItem(projectStorageKey(activeProjectId));
    data = legacyProject ? JSON.parse(legacyProject) : blankProjectState();
    await writeProjectData(activeProjectId, normalizeProjectData(data));
  }
  applyProjectData(data);
  render();
}

let saveTimer;
function save() {
  $("saveState").textContent = "Saving...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveActiveProjectNow().then(() => {
      renderProjectSelector();
      $("saveState").textContent = "Saved";
    }).catch(() => {
      $("saveState").textContent = "Save failed";
    });
  }, 120);
}

function bindProjectFields() {
  fields.forEach((field) => {
    const input = $(field);
    input.addEventListener("input", () => {
      state.project[field] = input.value;
      save();
      renderReport();
    });
  });
}

function bindHoleFields() {
  holeFields.forEach((field) => {
    const input = $(field);
    input.addEventListener("input", () => {
      const hole = selectedHole();
      if (!hole) return;
      hole[field] = input.value;
      if (field === "elevation" || field === "topPipeElevation") {
        updateCalculatedDepth(hole);
        $("depthTop").value = hole.depthTop;
      }
      save();
      renderHoleList();
      renderPins();
      renderReport();
    });
  });
}

function addHole(shouldSave = true) {
  const hole = blankHole();
  state.holes.push(hole);
  state.selectedId = hole.id;
  if (shouldSave) save();
  render();
}

function duplicateHole() {
  const hole = selectedHole();
  if (!hole) return;
  const copy = {
    ...JSON.parse(JSON.stringify(hole)),
    id: uid(),
    holeName: nextDuplicateName(hole.holeName),
    mapX: null,
    mapY: null,
  };
  state.holes.push(copy);
  state.selectedId = copy.id;
  save();
  render();
}

function nextDuplicateName(name) {
  const base = name || "TH";
  let candidate = `${base} copy`;
  let i = 2;
  while (state.holes.some((hole) => hole.holeName === candidate)) {
    candidate = `${base} copy ${i}`;
    i += 1;
  }
  return candidate;
}

function deleteHole() {
  const index = state.holes.findIndex((hole) => hole.id === state.selectedId);
  if (index < 0) return;
  state.holes.splice(index, 1);
  const previousHole = state.holes[Math.max(0, index - 1)];
  state.selectedId = (previousHole && previousHole.id) || (state.holes[0] && state.holes[0].id) || null;
  save();
  render();
}

function render() {
  renderProjectSelector();
  fields.forEach((field) => {
    $(field).value = state.project[field] || "";
  });
  renderMapImage();
  renderHoleList();
  renderHoleForm();
  renderPins();
  renderReport();
}

function renderProjectSelector() {
  const select = $("projectSelect");
  if (!select) return;
  select.innerHTML = projectRecords
    .map((project) => `<option value="${project.id}">${escapeHtml(project.name || "Untitled Project")}</option>`)
    .join("");
  select.value = activeProjectId || "";
}

async function switchProject(id) {
  if (!id || id === activeProjectId) return;
  await saveActiveProjectNow();
  activeProjectId = id;
  localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
  applyProjectData(await readProjectData(activeProjectId) || blankProjectState());
  render();
}

async function newProject() {
  await saveActiveProjectNow();
  activeProjectId = uid();
  const data = blankProjectState();
  projectRecords.push({ id: activeProjectId, name: projectDisplayName(data), updatedAt: new Date().toISOString() });
  await writeProjectData(activeProjectId, data);
  saveProjectIndex();
  applyProjectData(data);
  render();
  save();
}

async function deleteProject() {
  if (projectRecords.length <= 1) {
    alert("At least one project is required.");
    return;
  }
  if (!confirm("Delete this local project from this device?")) return;
  await removeProjectData(activeProjectId);
  localStorage.removeItem(projectStorageKey(activeProjectId));
  projectRecords = projectRecords.filter((project) => project.id !== activeProjectId);
  activeProjectId = projectRecords[0].id;
  saveProjectIndex();
  applyProjectData(await readProjectData(activeProjectId) || blankProjectState());
  render();
}

function renderMapImage() {
  const hole = selectedHole();
  const mapImage = (hole && hole.mapImage) || state.mapImage || "";
  const mapLabelImage = (hole && hole.mapLabelImage) || "";
  const mapZoom = (hole && hole.mapZoom) || state.mapZoom || 1;
  const canvas = $("mapCanvas");
  const image = $("mapImage");
  const labelImage = $("mapLabelImage");
  const pinLayer = $("pinLayer");
  const zoomPercent = `${mapZoom * 100}%`;

  canvas.style.setProperty("--map-zoom", markerZoom(mapZoom));
  image.src = mapImage;
  labelImage.src = mapLabelImage;

  [image, labelImage, pinLayer].forEach((layer) => {
    layer.style.transform = "none";
    layer.style.transformOrigin = "0 0";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.right = "auto";
    layer.style.bottom = "auto";
    layer.style.width = zoomPercent;
    layer.style.height = zoomPercent;
  });

  canvas.classList.toggle("has-image", Boolean(mapImage));
  canvas.classList.toggle("has-labels", Boolean(mapLabelImage));
  requestAnimationFrame(centerMapOnSelectedHole);
}

function setMapZoom(nextZoom) {
  const hole = selectedHole();
  const zoom = Math.max(1, Math.min(4, Number(nextZoom.toFixed(2))));
  if (hole) {
    hole.mapZoom = zoom;
  } else {
    state.mapZoom = zoom;
  }
  save();
  renderMapImage();
  renderReport();
}
function centerMapOnSelectedHole() {
  const hole = selectedHole();
  const canvas = $("mapCanvas");
  if (!hole || !canvas) return;
  if (!Number.isFinite(hole.mapX) || !Number.isFinite(hole.mapY)) return;

  const mapZoom = hole.mapZoom || state.mapZoom || 1;
  const contentWidth = canvas.clientWidth * mapZoom;
  const contentHeight = canvas.clientHeight * mapZoom;
  const targetX = (hole.mapX / 100) * contentWidth;
  const targetY = (hole.mapY / 100) * contentHeight;

  canvas.scrollLeft = Math.max(0, targetX - canvas.clientWidth / 2);
  canvas.scrollTop = Math.max(0, targetY - canvas.clientHeight / 2);
}

function placeSelectedHoleOnMap(event) {
  const hole = selectedHole();
  const canvas = $("mapCanvas");
  if (!hole || !canvas || !(hole.mapImage || state.mapImage)) return;

  const bounds = canvas.getBoundingClientRect();
  const mapZoom = hole.mapZoom || state.mapZoom || 1;
  const contentX = canvas.scrollLeft + event.clientX - bounds.left;
  const contentY = canvas.scrollTop + event.clientY - bounds.top;
  hole.mapX = clampNumber((contentX / (canvas.clientWidth * mapZoom)) * 100, 0, 100);
  hole.mapY = clampNumber((contentY / (canvas.clientHeight * mapZoom)) * 100, 0, 100);
  save();
  renderPins();
  renderReport();
}


function markerZoom(mapZoom) {
  return Math.max(0.75, Math.min(2.25, 0.75 + ((mapZoom || 1) - 1) * 0.5625));
}

function renderHoleList() {
  $("holeCount").textContent = `${state.holes.length} total`;
  const selectedName = $("selectedHoleName");
  const currentHole = selectedHole();
  if (selectedName) selectedName.textContent = (currentHole && currentHole.holeName) || "None";
  $("holeList").innerHTML = state.holes
    .map((hole) => {
      const selected = hole.id === state.selectedId ? " selected" : "";
      const utilityPair = [hole.expectedUtility && `Exp: ${hole.expectedUtility}`, hole.utilityType && `Found: ${hole.utilityType}`]
        .filter(Boolean)
        .join(" / ");
      const details = [utilityPair, hole.depthTop && `${hole.depthTop} ft`]
        .filter(Boolean)
        .join(" | ");
      return `
        <button class="hole-card${selected}" type="button" data-id="${hole.id}">
          <strong>${escapeHtml(hole.holeName || "Unnamed TH")}</strong>
          <span>${escapeHtml(details || "No details yet")}</span>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".hole-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      save();
      render();
    });
  });
}

function renderHoleForm() {
  const hole = selectedHole();
  $("emptyState").classList.toggle("hidden", Boolean(hole));
  $("holeForm").classList.toggle("hidden", !hole);
  if (!hole) return;

  holeFields.forEach((field) => {
    $(field).value = hole[field] || "";
  });
  renderPipeEditor(hole);
  renderPhotos(hole);
}

function renderPipeEditor(hole) {
  $("pipeList").innerHTML = hole.pipes.map((pipe, index) => `
    <section class="pipe-card" data-pipe-id="${pipe.id}">
      <div class="pipe-card-head">
        <strong>Pipe ${index + 1}</strong>
        <div class="inline-actions">
          <button class="pipe-aerial-btn" type="button" data-pipe-id="${pipe.id}">Center Aerial</button>
          ${hole.pipes.length > 1 ? `<button class="danger remove-pipe-btn" type="button" data-pipe-id="${pipe.id}">Remove</button>` : ""}
        </div>
      </div>
      <div class="form-grid pipe-form-grid">
        <label>Northing<input data-pipe-field="northing" value="${escapeHtml(pipe.northing)}" inputmode="decimal" placeholder="N"></label>
        <label>Easting<input data-pipe-field="easting" value="${escapeHtml(pipe.easting)}" inputmode="decimal" placeholder="E"></label>
        <label>Pipe / line size<input data-pipe-field="utilitySize" value="${escapeHtml(pipe.utilitySize)}" autocomplete="off" placeholder="8 in, 2 in, etc."></label>
        <label>Material<input data-pipe-field="material" value="${escapeHtml(pipe.material)}" autocomplete="off" placeholder="PVC, DIP, steel"></label>
        <label>Pipe color<input data-pipe-field="pipeColor" value="${escapeHtml(pipe.pipeColor)}" autocomplete="off" placeholder="Blue, orange, red, etc."></label>
        <label>Pipe bearing<input data-pipe-field="pipeBearing" value="${escapeHtml(pipe.pipeBearing)}" inputmode="decimal" placeholder="Approx. degrees"></label>
        <label>Pipe end 1 length<input data-pipe-field="pipeStartDistance" value="${escapeHtml(pipe.pipeStartDistance)}" inputmode="decimal" placeholder="Map length"></label>
        <label>Pipe end 2 length<input data-pipe-field="pipeEndDistance" value="${escapeHtml(pipe.pipeEndDistance)}" inputmode="decimal" placeholder="Map length"></label>
      </div>
    </section>
  `).join("");
}

function addPipe() {
  const hole = selectedHole();
  if (!hole) return;
  hole.pipes.push(blankPipe());
  syncPrimaryPipeLegacy(hole);
  save();
  renderPipeEditor(hole);
  renderPins();
  renderReport();
}

function removePipe(id) {
  const hole = selectedHole();
  if (!hole || hole.pipes.length <= 1) return;
  hole.pipes = hole.pipes.filter((pipe) => pipe.id !== id);
  syncPrimaryPipeLegacy(hole);
  save();
  renderPipeEditor(hole);
  renderPins();
  renderReport();
}

function updatePipe(event) {
  const input = event.target.closest("[data-pipe-field]");
  if (!input) return;
  const card = input.closest("[data-pipe-id]");
  const hole = selectedHole();
  const pipeId = card && card.dataset.pipeId;
  const pipe = hole && hole.pipes.find((item) => item.id === pipeId);
  if (!pipe) return;
  pipe[input.dataset.pipeField] = input.value;
  syncPrimaryPipeLegacy(hole);
  save();
  renderPins();
  renderReport();
}

function renderPhotos(hole) {
  $("photoGrid").innerHTML = (hole.photos || [])
    .map(
      (photo, index) => `
        <figure>
          <img src="${photo.src}" alt="${escapeHtml(photo.name || `Photo ${index + 1}`)}">
          <figcaption>${escapeHtml(photo.name || `Photo ${index + 1}`)}</figcaption>
        </figure>
      `,
    )
    .join("");
}

function renderPins() {
  const hole = selectedHole();
  const mapZoom = (hole && hole.mapZoom) || state.mapZoom || 1;
  const labelZoom = markerZoom(mapZoom);

  $("pinLayer").innerHTML = hole ? [hole]
    .filter((hole) => Number.isFinite(hole.mapX) && Number.isFinite(hole.mapY))
    .map((hole) => {
      const selected = hole.id === state.selectedId ? " selected" : "";
      return `
        <span class="th-marker${selected}" style="left:${hole.mapX}%;top:${hole.mapY}%;--marker-zoom:${labelZoom}">
          ${hole.pipes.map((pipe) => pipeOverlay(pipe, "pipe-bearing", "px", labelZoom, true)).join("")}
          <span class="th-crosshair" aria-hidden="true">
            <svg viewBox="-50 -50 100 100" focusable="false">
              <circle cx="0" cy="0" r="22"></circle>
              <line x1="-36" y1="0" x2="36" y2="0"></line>
              <line x1="0" y1="-36" x2="0" y2="36"></line>
            </svg>
          </span>
          <span class="th-label">${mapPointLabel(hole)}</span>
        </span>
      `;
    })
    .join("") : "";
}

function mapUtilityLabel(hole) {
  return hole.utilityType || hole.holeName || "TH";
}

function mapPointLabel(hole) {
  return `<b><span>${escapeHtml(hole.holeName || "TH")}</span><span>${escapeHtml(mapUtilityLabel(hole))}</span></b>`;
}

function pipeOverlay(pipe, className, unit, labelZoom = 1, anchored = false) {
  const bearing = normalizeBearing(pipe.pipeBearing);
  if (bearing === null) return "";

  const fallback = unit === "in" ? 0.8 : 95;
  const start = pipeDisplayDistance(pipe.pipeStartDistance, fallback, unit);
  const end = pipeDisplayDistance(pipe.pipeEndDistance, fallback, unit);

  const scale = unit === "in" ? 96 : 1;
  const startPx = start * scale;
  const endPx = end * scale;

  const rad = bearing * Math.PI / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  const center = 500;
  const x1 = center - dx * startPx;
  const y1 = center - dy * startPx;
  const x2 = center + dx * endPx;
  const y2 = center + dy * endPx;

  const isReport = className === "report-pipe-bearing";
  const vectorClass = isReport ? "report-pipe-vector" : "pipe-vector";
  const lineClass = isReport ? "report-pipe-vector-line" : "pipe-vector-line";

  const positionStyle = anchored
    ? `left:0;top:0;--marker-zoom:${labelZoom};--pipe-color:${pipeColorValue(pipe)}`
    : `left:0;top:0;--marker-zoom:${labelZoom};--pipe-color:${pipeColorValue(pipe)}`;

  return `
    <span class="${vectorClass}" style="${positionStyle}">
      <svg viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
        <line class="${lineClass}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
      </svg>
    </span>
  `;
}

function projectCoordinateWkid() {
  const selected = state.project.coordinateSystem || "2236";
  return selected === "custom" ? (state.project.customCoordinateSystem || "").trim() : selected;
}

async function convertToLatLong(easting, northing) {
  const wkid = projectCoordinateWkid();
  if (!wkid) throw new Error("Choose a coordinate system first.");

  if (wkid === "4326") {
    if (Math.abs(northing) > 90 || Math.abs(easting) > 180) {
      throw new Error("Those N/E values are not lat/long. Choose the project State Plane/WKID first.");
    }
    return { lat: northing, lng: easting };
  }

  const params = new URLSearchParams({
    inSR: wkid,
    outSR: "4326",
    f: "json",
    geometries: JSON.stringify({
      geometryType: "esriGeometryPoint",
      geometries: [{ x: easting, y: northing }],
    }),
  });
  const response = await fetch(`https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer/project?${params.toString()}`);
  if (!response.ok) throw new Error("Coordinate conversion failed.");
  const data = await response.json();
  const point = data.geometries && data.geometries[0];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error((data.error && data.error.message) || "Coordinate conversion returned no point.");
  }
  if (Math.abs(point.y) > 90 || Math.abs(point.x) > 180) {
    throw new Error("Converted coordinate is outside valid lat/long range. Check the coordinate system.");
  }
  return { lat: point.y, lng: point.x };
}

async function aerialFromCoordinates(pipeId) {
  const hole = selectedHole();
  if (!hole) return;
  const pipe = hole.pipes.find((item) => item.id === pipeId) || hole.pipes[0];
  if (!pipe) return;

  const northing = numericValue(pipe.northing);
  const easting = numericValue(pipe.easting);
  if (northing === null || easting === null) {
    $("mapTip").textContent = "Enter northing and easting for this pipe first.";
    return;
  }

  $("mapTip").textContent = "Converting coordinates...";
  let latLng;
  try {
    latLng = await convertToLatLong(easting, northing);
  } catch (error) {
    $("mapTip").textContent = error.message;
    hole.mapImage = "";
    save();
    renderMapImage();
    renderReport();
    return;
  }

  const { lat, lng } = latLng;
  const delta = 0.0018;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  hole.mapImage = esriExportUrl("World_Imagery", bbox, false);
  hole.mapLabelImage = state.project.mapStyle === "hybrid" ? esriExportUrl("Reference/World_Boundaries_and_Places", bbox, true) : "";
  hole.mapZoom = 2;
  hole.mapX = 50;
  hole.mapY = 50;
  save();
  renderMapImage();
  renderPins();
  renderReport();
  const pipeNumber = hole.pipes.findIndex((item) => item.id === pipe.id) + 1;
  $("mapTip").innerHTML = `Aerial centered on <b id="selectedHoleName">${escapeHtml(hole.holeName)}</b>, Pipe ${pipeNumber}`;
}

function esriExportUrl(service, bbox, transparent) {
  const params = new URLSearchParams({
    bbox,
    bboxSR: "4326",
    imageSR: "4326",
    size: "1400,1000",
    format: "png32",
    transparent: transparent ? "true" : "false",
    f: "image",
  });
  return `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/export?${params.toString()}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadMapImage(event) {
  const hole = selectedHole();
  const [file] = event.target.files;
  if (!file || !hole) return;
  hole.mapImage = await fileToDataUrl(file);
  hole.mapLabelImage = "";
  hole.mapZoom = 1;
  save();
  renderMapImage();
  renderReport();
  event.target.value = "";
}

async function addPhotos(event) {
  const hole = selectedHole();
  if (!hole) return;
  const files = Array.from(event.target.files || []);
  const photos = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      src: await fileToDataUrl(file),
    })),
  );
  hole.photos = [...(hole.photos || []), ...photos];
  save();
  renderPhotos(hole);
  renderReport();
  event.target.value = "";
}

function clearPhotos() {
  const hole = selectedHole();
  if (!hole) return;
  hole.photos = [];
  save();
  renderPhotos(hole);
  renderReport();
}

function renderReport() {
  const report = buildReport();
  $("reportPreview").innerHTML = report;
  $("printReport").innerHTML = report;
}

function buildReport() {
  const title = [state.project.projectNumber, state.project.projectName].filter(Boolean).join(" - ") || "Test Hole Report";
  const hole = selectedHole() || state.holes[0] || blankHole(1);
  return buildHoleDataSheet(hole, title, 1, 2) + buildHolePhotoSheet(hole, title, 2, 2);
}

function buildHoleDataSheet(hole, projectTitle, sheetNumber, totalSheets) {
  const p = state.project;
  const mapImage = hole.mapImage || state.mapImage || "";
  const mapLabelImage = hole.mapLabelImage || "";
  const mapZoom = hole.mapZoom || state.mapZoom || 1;
  return `
    <article class="sheet survey-sheet">
      <div class="sheet-frame first-page-frame">
        ${titleBlock(`${hole.holeName || "TEST HOLE"} DATA & LOCATION MAP`, projectTitle, String(sheetNumber), totalSheets)}
        <div class="top-deliverable">
          <table class="report-table project-info-table">
            <tbody>
              <tr><th>Project</th><td>${escapeHtml(projectTitle)}</td><th>Date</th><td>${escapeHtml(p.fieldDate || "")}</td></tr>
              <tr><th>Location</th><td>${escapeHtml(p.location || "")}</td><th>Crew</th><td>${escapeHtml(p.crew || "")}</td></tr>
              <tr><th>Client</th><td>${escapeHtml(p.client || "")}</td><th>Weather</th><td>${escapeHtml(p.weather || "")}</td></tr>
            </tbody>
          </table>
          <table class="report-table single-hole-table">
            <tbody>
              ${holeDataRows(hole)}
            </tbody>
          </table>
        </div>
        <div class="map-section-title">Aerial Image / Location Map</div>
        <div class="drawing-area first-page-map">
          <div class="north-arrow" aria-hidden="true">N</div>
          <div class="report-map">
            <div class="report-map-layer" style="${reportMapLayerStyle(hole, mapZoom)}">
              ${mapImage ? `<img src="${mapImage}" alt="">` : `<div class="map-placeholder"><strong>Aerial image / location map</strong><span>Generate or upload aerial for this test hole</span></div>`}
              ${mapLabelImage ? `<img class="report-label-image" src="${mapLabelImage}" alt="">` : ""}
              ${Number.isFinite(hole.mapX) && Number.isFinite(hole.mapY) ? `<span class="report-th-marker" style="left:${hole.mapX}%;top:${hole.mapY}%;--marker-zoom:${markerZoom(mapZoom)}">${hole.pipes.map((pipe) => pipeOverlay(pipe, "report-pipe-bearing", "px", markerZoom(mapZoom), true)).join("")}<span class="report-th-crosshair" aria-hidden="true"><svg viewBox="-50 -50 100 100" focusable="false"><circle cx="0" cy="0" r="22"></circle><line x1="-36" y1="0" x2="36" y2="0"></line><line x1="0" y1="-36" x2="0" y2="36"></line></svg></span><span class="report-th-label">${mapPointLabel(hole)}</span></span>` : ""}
            </div>
          </div>
        </div>
        <div class="sheet-notes">
          <b>Notes</b>
          <p>${escapeHtml(p.projectNotes || "Test hole information shown above was collected in the field. Verify utilities before excavation.")}</p>
        </div>
      </div>
    </article>
  `;
}

function holeDataRows(hole) {
  const pipeRows = hole.pipes.map((pipe, index) => `
    <tr>
      <th>Pipe ${index + 1}</th><td>${escapeHtml([pipe.utilitySize, pipe.material].filter(Boolean).join(" / "))}</td>
      <th>Direction</th><td>${escapeHtml(pipeDirectionPair(pipe))}</td>
      <th>Color</th><td>${escapeHtml(pipeColorLabel(pipe))}</td>
    </tr>
    <tr>
      <th>Pipe ${index + 1} Northing</th><td>${escapeHtml(pipe.northing)}</td>
      <th>Pipe ${index + 1} Easting</th><td>${escapeHtml(pipe.easting)}</td>
      <th></th><td></td>
    </tr>
  `).join("");
  return `
    <tr>
      <th>Test Hole</th><td>${escapeHtml(hole.holeName)}</td>
      <th>Expected Utility</th><td>${escapeHtml(hole.expectedUtility)}</td>
      <th>Found Utility</th><td>${escapeHtml(hole.utilityType)}</td>
    </tr>
    <tr>
      <th>Surface</th><td>${escapeHtml(hole.surfaceType)}</td>
      <th>Ground Elev.</th><td>${escapeHtml(hole.elevation)}</td>
      <th>Top Pipe Elev.</th><td>${escapeHtml(hole.topPipeElevation)}</td>
    </tr>
    <tr><th>Depth / Method</th><td colspan="5">${escapeHtml([hole.depthTop, hole.method].filter(Boolean).join(" / "))}</td></tr>
    ${pipeRows}
    <tr>
      <th>Description</th><td colspan="5">${escapeHtml(hole.description)}</td>
    </tr>
    <tr>
      <th>Field Notes</th><td colspan="5">${escapeHtml(hole.holeNotes)}</td>
    </tr>
  `;
}

function reportPipeBearing(hole) {
  return hole.pipes.map((pipe) => pipeOverlay(pipe, "report-pipe-bearing", "in", 1)).join("");
}


function pipeColorLabel(hole) {
  const raw = String(hole.pipeColor || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();

  const hexNames = {
    "#0042a9": "Blue",
    "#0066cc": "Blue",
    "#0000ff": "Blue",
    "#ff0000": "Red",
    "#00a651": "Green",
    "#008000": "Green",
    "#ffff00": "Yellow",
    "#f6c400": "Yellow",
    "#ff8800": "Orange",
    "#ffa500": "Orange",
    "#800080": "Purple",
    "#8a2be2": "Purple",
    "#000000": "Black",
    "#ffffff": "White",
    "#808080": "Gray",
    "#9c4f2f": "Brown"
  };

  if (hexNames[lower]) return hexNames[lower];
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function pipeColorValue(hole) {
  const raw = String(hole.pipeColor || "").trim();
  const lower = raw.toLowerCase();

  const colorMap = {
    blue: "#0066cc",
    water: "#0066cc",
    red: "#ff0000",
    electric: "#ff0000",
    green: "#00a651",
    sewer: "#00a651",
    storm: "#00a651",
    yellow: "#f6c400",
    gas: "#f6c400",
    orange: "#ff8800",
    telecom: "#ff8800",
    purple: "#8a2be2",
    reclaimed: "#8a2be2",
    black: "#000000",
    white: "#ffffff",
    gray: "#808080",
    grey: "#808080",
    brown: "#9c4f2f"
  };

  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  return colorMap[lower] || "#9c4f2f";
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function reportMapLayerStyle(hole, mapZoom) {
  const zoom = Math.max(1, Number(mapZoom) || 1);
  const widthPct = zoom * 100;
  const heightPct = zoom * 100;

  if (!Number.isFinite(hole.mapX) || !Number.isFinite(hole.mapY)) {
    return `--map-zoom:1;width:${widthPct}%;height:${heightPct}%;left:0%;top:0%;`;
  }

  const minLeft = 100 - widthPct;
  const minTop = 100 - heightPct;
  const leftPct = clampNumber(50 - (hole.mapX * zoom), minLeft, 0);
  const topPct = clampNumber(50 - (hole.mapY * zoom), minTop, 0);

  return `--map-zoom:1;width:${widthPct}%;height:${heightPct}%;left:${leftPct}%;top:${topPct}%;`;
}

function pipeDisplayDistance(value, fallback, unit = "px") {
  const distance = numericValue(value);
  if (distance === null || distance <= 0) return fallback;
  if (unit === "in") return Math.max(0.15, Math.min(3.5, distance / 120));
  return distance;
}

function buildHolePhotoSheet(hole, projectTitle, sheetNumber, totalSheets) {
  const photos = (hole.photos || []).slice(0, 4);
  const photoFigures = photos
    .map(
      (photo, index) => `
        <figure>
          <img src="${photo.src}" alt="${escapeHtml(photo.name || "Test hole photo")}">
          <figcaption>${escapeHtml(hole.holeName || "Test Hole")} - Photo ${index + 1}</figcaption>
        </figure>
      `,
    )
    .join("");

  return `
    <article class="sheet survey-sheet">
      <div class="sheet-frame photo-page-frame">
        ${titleBlock(`${hole.holeName || "TEST HOLE"} PHOTOGRAPHS`, projectTitle, String(sheetNumber), totalSheets)}
        <div class="photo-page-title">${escapeHtml(hole.holeName || "Test Hole")} Photographs</div>
        <div class="photo-page-grid">
          ${photoFigures || `<div class="empty-photo">No photos attached.</div>`}
        </div>
      </div>
    </article>
  `;
}

function titleBlock(sheetTitle, projectTitle, sheetNumber, totalSheets) {
  const p = state.project;
  return `
    <div class="title-block">
      <div class="tb-brand">
        <b>DEGROVE</b>
        <span>Surveyors Inc.</span>
      </div>
      <div class="tb-project">
        <b>${escapeHtml(projectTitle || "Test Hole Project")}</b>
        <span>${escapeHtml(p.location || "")}</span>
      </div>
      <div class="tb-meta">
        <span>Project No.</span><b>${escapeHtml(p.projectNumber || "")}</b>
        <span>Date</span><b>${escapeHtml(p.fieldDate || "")}</b>
        <span>Crew</span><b>${escapeHtml(p.crew || "")}</b>
      </div>
      <div class="tb-sheet">
        <span>${escapeHtml(sheetTitle)}</span>
        <b>SHEET ${sheetNumber} OF ${totalSheets}</b>
      </div>
    </div>
  `;
}

function exportCsv() {
  const headers = [
    "holeName",
    "expectedUtility",
    "utilityType",
    "surfaceType",
    "method",
    "northing",
    "easting",
    "elevation",
    "topPipeElevation",
    "depthTop",
    "utilitySize",
    "material",
    "pipeColor",
    "pipes",
    "description",
    "holeNotes",
    "mapX",
    "mapY",
  ];
  const rows = [headers, ...state.holes.map((hole) => headers.map((header) => header === "pipes"
    ? hole.pipes.map((pipe, index) => `Pipe ${index + 1}: N ${pipe.northing} E ${pipe.easting} ${pipe.utilitySize} ${pipe.material} ${pipeColorLabel(pipe)} ${pipeDirectionPair(pipe)}`.trim()).join(" | ")
    : (hole[header] === null || hole[header] === undefined ? "" : hole[header])))];
  download(
    `${state.project.projectNumber || "test-holes"}.csv`,
    rows.map((row) => row.map(csvCell).join(",")).join("\n"),
    "text/csv",
  );
}

function csvCell(value) {
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function exportJson() {
  download(
    `${state.project.projectNumber || "test-hole-backup"}.json`,
    JSON.stringify(state, null, 2),
    "application/json",
  );
}

function safeFilePart(value) {
  return String(value || "test-hole-project")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "test-hole-project";
}

function exportProjectFile() {
  saveActiveProjectNow();
  const payload = {
    fileType: "test-hole-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  download(
    `${safeFilePart(state.project.projectFileName || state.project.projectNumber || state.project.projectName)}.thproject.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function exportGeoJson() {
  const features = state.holes
    .flatMap((hole) => hole.pipes.map((pipe, index) => {
      const lat = numericValue(pipe.northing);
      const lng = numericValue(pipe.easting);
      if (lat === null || lng === null) return null;
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        properties: {
          name: `${hole.holeName} Pipe ${index + 1}`,
          testHole: hole.holeName,
          pipeNumber: index + 1,
          expectedUtility: hole.expectedUtility,
          foundUtility: hole.utilityType,
          size: pipe.utilitySize,
          material: pipe.material,
          pipeColor: pipeColorLabel(pipe),
          bearing: pipe.pipeBearing,
          direction: pipeDirectionPair(pipe),
          end1Length: pipe.pipeStartDistance,
          end2Length: pipe.pipeEndDistance,
          groundElevation: hole.elevation,
          topPipeElevation: hole.topPipeElevation,
          depthTop: hole.depthTop,
          description: hole.description,
          notes: hole.holeNotes,
          projectNumber: state.project.projectNumber,
          projectName: state.project.projectName,
        },
      };
    }))
    .filter(Boolean);

  download(
    `${state.project.projectNumber || "test-holes"}.geojson`,
    JSON.stringify({ type: "FeatureCollection", features }, null, 2),
    "application/geo+json",
  );
}

function projectMapUrl() {
  const link = (state.project.mapLink || "").trim();
  if (link) return link;
  const location = (state.project.location || "").trim();
  return location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : "";
}

function openProjectMap() {
  const url = projectMapUrl();
  if (!url) {
    alert("Add a project location or map link first.");
    return;
  }
  window.open(url, "_blank", "noopener");
}

function emailPdf() {
  renderReport();
  const subject = encodeURIComponent(`${state.project.projectNumber || "Test Hole"} PDF Deliverable`);
  const body = encodeURIComponent(
    [
      "Attached is the test hole PDF deliverable.",
      "",
      "If the PDF is not attached yet, use Print > Save as PDF from the app, then attach the saved file to this email.",
      projectMapUrl() ? `Map link: ${projectMapUrl()}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  window.print();
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

async function savePdf() {
  if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF tools did not load. Check your internet connection and try again.");
    return;
  }

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const pdfWindow = isIos ? window.open("", "_blank") : null;
  if (pdfWindow) {
    pdfWindow.document.write("<p style='font-family:sans-serif;padding:24px'>Creating PDF...</p>");
  }

  const button = $("pdfBtn");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Creating PDF...";
  renderReport();

  const report = $("printReport");
  const sourceSheets = Array.from(report.children).filter((element) => element.classList.contains("sheet"));
  const stage = document.createElement("div");
  stage.className = "pdf-render-stage";
  document.body.appendChild(stage);

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter", compress: true });

    for (let index = 0; index < sourceSheets.length; index += 1) {
      stage.replaceChildren(sourceSheets[index].cloneNode(true));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const sheet = stage.firstElementChild;
      const bounds = sheet.getBoundingClientRect();
      const canvas = await window.html2canvas(sheet, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height),
        windowWidth: Math.ceil(bounds.width),
        scrollX: 0,
        scrollY: 0,
      });
      if (index > 0) pdf.addPage("letter", "portrait");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 8.5, 11, undefined, "FAST");
    }

    const filename = `${safeFilePart(state.project.projectFileName || state.project.projectNumber || state.project.projectName)}.pdf`;
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);

    if (pdfWindow) {
      pdfWindow.location.href = url;
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    if (pdfWindow) pdfWindow.close();
    alert(`PDF creation failed: ${error.message}`);
  } finally {
    stage.remove();
    button.disabled = false;
    button.textContent = originalText;
  }
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function restoreJson(event) {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  const restored = JSON.parse(text);
  const restoredData = restored.fileType === "test-hole-project" ? restored.data : restored;
  applyProjectData(restoredData);
  activeProjectId = uid();
  projectRecords.push({ id: activeProjectId, name: projectDisplayName(), updatedAt: new Date().toISOString() });
  saveActiveProjectNow();
  save();
  render();
  event.target.value = "";
}

function bindEvents() {
  bindProjectFields();
  bindHoleFields();
  $("projectSelect").addEventListener("change", (event) => switchProject(event.target.value));
  $("newProjectBtn").addEventListener("click", newProject);
  $("deleteProjectBtn").addEventListener("click", deleteProject);
  $("addHoleBtn").addEventListener("click", () => addHole());
  $("duplicateHoleBtn").addEventListener("click", duplicateHole);
  $("deleteHoleBtn").addEventListener("click", deleteHole);
  $("mapImage").addEventListener("error", () => {
    if (!$("mapImage").getAttribute("src")) return;
    $("mapTip").textContent = "Aerial image failed to load. Check the coordinate system and internet connection.";
  });
  $("mapImage").addEventListener("load", () => {
    const hole = selectedHole();
    if (hole && (hole.mapImage || state.mapImage)) {
      $("mapTip").innerHTML = `Aerial centered on <b id="selectedHoleName">${escapeHtml(hole.holeName)}</b>`;
    }
  });
  $("mapImageInput").addEventListener("change", loadMapImage);
  $("mapCanvas").addEventListener("click", placeSelectedHoleOnMap);
  $("aerialFromCoordsBtn").addEventListener("click", () => aerialFromCoordinates());
  $("zoomOutBtn").addEventListener("click", () => {
    const hole = selectedHole();
    setMapZoom(((hole && hole.mapZoom) || state.mapZoom || 1) - 0.25);
  });
  $("zoomInBtn").addEventListener("click", () => {
    const hole = selectedHole();
    setMapZoom(((hole && hole.mapZoom) || state.mapZoom || 1) + 0.25);
  });
  $("zoomResetBtn").addEventListener("click", () => setMapZoom(1));
  $("clearMapBtn").addEventListener("click", () => {
    const hole = selectedHole();
    if (hole) {
      hole.mapImage = "";
      hole.mapZoom = 1;
      hole.mapX = null;
      hole.mapY = null;
    } else {
      state.mapImage = "";
    }
    save();
    renderMapImage();
    renderPins();
    renderReport();
  });
  $("photoRollInput").addEventListener("change", addPhotos);
  $("addPipeBtn").addEventListener("click", addPipe);
  $("pipeList").addEventListener("input", updatePipe);
  $("pipeList").addEventListener("click", (event) => {
    const aerialButton = event.target.closest(".pipe-aerial-btn");
    if (aerialButton) {
      aerialFromCoordinates(aerialButton.dataset.pipeId);
      return;
    }
    const button = event.target.closest(".remove-pipe-btn");
    if (button) removePipe(button.dataset.pipeId);
  });
  $("clearPhotosBtn").addEventListener("click", clearPhotos);
  $("refreshReportBtn").addEventListener("click", renderReport);
  $("printBtn").addEventListener("click", () => {
    renderReport();
    window.print();
  });
  $("pdfBtn").addEventListener("click", savePdf);
  $("csvBtn").addEventListener("click", exportCsv);
  $("geoJsonBtn").addEventListener("click", exportGeoJson);
  $("openProjectMapBtn").addEventListener("click", openProjectMap);
  $("emailPdfBtn").addEventListener("click", emailPdf);
  $("exportProjectBtn").addEventListener("click", exportProjectFile);
  $("jsonBtn").addEventListener("click", exportJson);
  $("jsonInput").addEventListener("change", restoreJson);
}

async function initializeApp() {
  const addButton = $("addHoleBtn");
  if (addButton) addButton.disabled = true;

  try {
    await hydrate();
  } catch {
    activeProjectId = activeProjectId || uid();
    projectRecords = projectRecords.length ? projectRecords : [{
      id: activeProjectId,
      name: "Untitled Project",
      updatedAt: new Date().toISOString(),
    }];
    applyProjectData(blankProjectState());
    render();
    $("saveState").textContent = "Temporary session";
  }

  bindEvents();
  if (addButton) addButton.disabled = false;
}

initializeApp();

window.addEventListener("pagehide", () => {
  clearTimeout(saveTimer);
  saveActiveProjectNow().catch(() => {});
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((registration) => {
      registration.update();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
    }).catch(() => {});
  });
}
