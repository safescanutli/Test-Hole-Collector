(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function numberValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function formatDepth(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  function pipeCards() {
    return Array.from(document.querySelectorAll("#pipeList [data-pipe-id]"));
  }

  function syncPipeDepths(hole) {
    if (!hole || !Array.isArray(hole.pipes) || !hole.pipes.length) return;
    const ground = numberValue(hole.pipes[0].groundElevation);
    hole.pipes.forEach((pipe) => {
      const topPipe = numberValue(pipe.topPipeElevation);
      pipe.depthTop = ground === null || topPipe === null ? "" : formatDepth(ground - topPipe);
    });
    hole.elevation = hole.pipes[0].groundElevation || "";
    hole.topPipeElevation = hole.pipes[0].topPipeElevation || "";
    hole.depthTop = hole.pipes[0].depthTop || "";
  }

  function syncPipeCard(card, hole, options = {}) {
    if (!card || !hole || !Array.isArray(hole.pipes)) return null;
    const pipe = hole.pipes.find((item) => item.id === card.dataset.pipeId);
    if (!pipe) return null;

    card.querySelectorAll("[data-pipe-field]").forEach((input) => {
      if (options.skipPrimaryElevations && pipe === hole.pipes[0]
        && (input.dataset.pipeField === "groundElevation" || input.dataset.pipeField === "topPipeElevation")) {
        return;
      }
      pipe[input.dataset.pipeField] = input.value;
    });
    return pipe;
  }

  function syncPrimaryElevationInputs(hole) {
    if (!hole || !Array.isArray(hole.pipes) || !hole.pipes.length) return;
    const primaryPipe = hole.pipes[0];
    const active = document.activeElement;
    const topGroundInput = byId("elevation");
    const topPipeInput = byId("topPipeElevation");
    const primaryCard = pipeCards()[0];
    const cardGroundInput = primaryCard && primaryCard.querySelector('[data-pipe-field="groundElevation"]');
    const cardTopPipeInput = primaryCard && primaryCard.querySelector('[data-pipe-field="topPipeElevation"]');

    if (active === cardGroundInput) {
      primaryPipe.groundElevation = cardGroundInput.value;
      if (topGroundInput) topGroundInput.value = primaryPipe.groundElevation;
    } else if (topGroundInput) {
      primaryPipe.groundElevation = topGroundInput.value;
    }

    if (active === cardTopPipeInput) {
      primaryPipe.topPipeElevation = cardTopPipeInput.value;
      if (topPipeInput) topPipeInput.value = primaryPipe.topPipeElevation;
    } else if (topPipeInput) {
      primaryPipe.topPipeElevation = topPipeInput.value;
    }
  }

  function syncPipeInputs() {
    if (typeof selectedHole !== "function") return null;
    const hole = selectedHole();
    if (!hole) return null;

    pipeCards().forEach((card) => syncPipeCard(card, hole, { skipPrimaryElevations: true }));
    syncPrimaryElevationInputs(hole);
    syncPipeDepths(hole);

    const elevation = byId("elevation");
    const topPipeElevation = byId("topPipeElevation");
    const depthTop = byId("depthTop");
    if (elevation && document.activeElement !== elevation) elevation.value = hole.elevation || "";
    if (topPipeElevation && document.activeElement !== topPipeElevation) topPipeElevation.value = hole.topPipeElevation || "";
    if (depthTop) depthTop.value = hole.depthTop || "";

    pipeCards().forEach((card) => {
      const pipe = hole.pipes.find((item) => item.id === card.dataset.pipeId);
      const depthInput = card.querySelector('[data-pipe-field="depthTop"]');
      if (pipe && depthInput) depthInput.value = pipe.depthTop || "";
    });

    if (typeof save === "function") save();
    if (typeof renderHoleList === "function") renderHoleList();
    if (typeof renderPins === "function") renderPins();
    if (typeof renderReport === "function") renderReport();
    return hole;
  }

  function aerialUrl(service, bbox, transparent, format) {
    const params = new URLSearchParams({
      bbox,
      bboxSR: "4326",
      imageSR: "4326",
      size: "1000,750",
      dpi: "96",
      format: format || (transparent ? "png32" : "jpg"),
      transparent: transparent ? "true" : "false",
      f: "image",
    });
    return `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/export?${params.toString()}`;
  }

  function waitForImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error("Aerial image request timed out.")), 15000);
      image.onload = () => {
        clearTimeout(timer);
        resolve(url);
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Aerial image failed to load."));
      };
      image.src = url;
    });
  }

  async function convertPipeToLatLong(easting, northing) {
    if (typeof convertToLatLong === "function") {
      return convertToLatLong(easting, northing);
    }

    const project = typeof state !== "undefined" && state.project ? state.project : {};
    const wkid = project.coordinateSystem === "custom"
      ? project.customCoordinateSystem
      : project.coordinateSystem || "2236";
    const params = new URLSearchParams({
      inSR: wkid,
      outSR: "4326",
      geometries: JSON.stringify({ geometryType: "esriGeometryPoint", geometries: [{ x: easting, y: northing }] }),
      f: "json",
    });
    const response = await fetch(`https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer/project?${params.toString()}`);
    if (!response.ok) throw new Error("Coordinate conversion failed.");
    const data = await response.json();
    const point = data.geometries && data.geometries[0];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error((data.error && data.error.message) || "Coordinate conversion returned no point.");
    }
    return { lat: point.y, lng: point.x };
  }

  async function loadAerialForPipe(pipeId) {
    const hole = syncPipeInputs();
    if (!hole) return;
    if (pipeId) {
      const card = pipeCards().find((item) => item.dataset.pipeId === pipeId);
      syncPipeCard(card, hole);
      syncPipeDepths(hole);
    }
    const pipe = (hole.pipes || []).find((item) => item.id === pipeId) || (hole.pipes || [])[0];
    if (!pipe) return;

    const northing = numberValue(pipe.northing);
    const easting = numberValue(pipe.easting);
    const tip = byId("mapTip");
    if (northing === null || easting === null) {
      if (tip) tip.textContent = "Enter northing and easting for this pipe first.";
      return;
    }

    if (tip) tip.textContent = "Loading aerial...";
    let latLng;
    try {
      latLng = await convertPipeToLatLong(easting, northing);
    } catch (error) {
      if (tip) tip.textContent = error.message;
      return;
    }

    const delta = 0.0018;
    const bbox = [latLng.lng - delta, latLng.lat - delta, latLng.lng + delta, latLng.lat + delta].join(",");
    const imageryUrl = aerialUrl("World_Imagery", bbox, false, "jpg");
    const fallbackUrl = aerialUrl("World_Imagery", bbox, false, "png32");

    try {
      hole.mapImage = await waitForImage(imageryUrl);
    } catch {
      try {
        hole.mapImage = await waitForImage(fallbackUrl);
      } catch (error) {
        if (tip) tip.textContent = `${error.message} Check service or signal, then try again.`;
        return;
      }
    }

    const project = typeof state !== "undefined" && state.project ? state.project : {};
    hole.mapLabelImage = project.mapStyle === "hybrid"
      ? aerialUrl("Reference/World_Boundaries_and_Places", bbox, true, "png32")
      : "";
    hole.mapZoom = 2;
    hole.mapX = 50;
    hole.mapY = 50;

    if (typeof save === "function") save();
    if (typeof renderMapImage === "function") renderMapImage();
    if (typeof renderPins === "function") renderPins();
    if (typeof renderReport === "function") renderReport();

    const pipeNumber = (hole.pipes || []).findIndex((item) => item.id === pipe.id) + 1;
    if (tip) tip.innerHTML = `Aerial centered on <b id="selectedHoleName">${hole.holeName || "TH"}</b>, Pipe ${pipeNumber}`;
  }

  function installAerialFix() {
    if (document.documentElement.dataset.aerialFixBound) return;
    document.documentElement.dataset.aerialFixBound = "true";

    document.addEventListener("click", (event) => {
      const pipeButton = event.target.closest(".pipe-aerial-btn");
      const mainButton = event.target.closest("#aerialFromCoordsBtn");
      if (!pipeButton && !mainButton) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      loadAerialForPipe(pipeButton ? pipeButton.dataset.pipeId : undefined);
    }, true);

    const pipeList = byId("pipeList");
    if (pipeList && !pipeList.dataset.pipeSyncBound) {
      pipeList.dataset.pipeSyncBound = "true";
      pipeList.addEventListener("input", syncPipeInputs, true);
      pipeList.addEventListener("change", syncPipeInputs, true);
    }

    ["elevation", "topPipeElevation"].forEach((id) => {
      const input = byId(id);
      if (!input || input.dataset.depthSyncBound) return;
      input.dataset.depthSyncBound = "true";
      input.addEventListener("input", syncPipeInputs, true);
      input.addEventListener("change", syncPipeInputs, true);
      input.addEventListener("blur", syncPipeInputs, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installAerialFix);
  } else {
    installAerialFix();
  }
}());
