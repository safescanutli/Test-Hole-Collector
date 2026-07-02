(function () {
  let preparedPdfFile = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeFilePartLocal(value) {
    return String(value || "test-hole-project")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "test-hole-project";
  }

  function pdfFileNameLocal() {
    const project = typeof state !== "undefined" && state.project ? state.project : {};
    const raw = project.projectFileName || project.projectNumber || project.projectName || "test-hole-project";
    return `${safeFilePartLocal(raw)}.pdf`;
  }

  function setPdfButtonsLocal(disabled, text) {
    ["pdfBtn", "sharePdfBtn", "sharePdfActionBtn", "printBtn"].forEach((id) => {
      const button = byId(id);
      if (!button) return;
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.disabled = disabled;
      button.textContent = disabled && text ? text : button.dataset.originalText;
    });
  }

  function updateShareReadyState(isReady) {
    ["sharePdfBtn", "sharePdfActionBtn"].forEach((id) => {
      const button = byId(id);
      if (!button) return;
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = isReady ? "Tap to Share PDF" : button.dataset.originalText;
      button.classList.toggle("primary", isReady || id === "sharePdfBtn");
    });
  }

  function markerAnchorInMap(marker, mapBounds) {
    const pinLayer = byId("pinLayer");
    if (!marker || !pinLayer) return null;

    const leftPct = Number.parseFloat(marker.style.left);
    const topPct = Number.parseFloat(marker.style.top);
    const pinRect = pinLayer.getBoundingClientRect();
    if (Number.isFinite(leftPct) && Number.isFinite(topPct) && pinRect.width && pinRect.height) {
      return {
        x: (pinRect.left - mapBounds.left) + ((leftPct / 100) * pinRect.width),
        y: (pinRect.top - mapBounds.top) + ((topPct / 100) * pinRect.height),
      };
    }

    const markerRect = marker.getBoundingClientRect();
    return {
      x: markerRect.left - mapBounds.left,
      y: markerRect.top - mapBounds.top,
    };
  }

  function selectedMapHole() {
    if (typeof selectedHole === "function") return selectedHole();
    if (typeof state !== "undefined" && state && Array.isArray(state.holes)) {
      return state.holes.find((hole) => hole.id === state.selectedId) || state.holes[0] || null;
    }
    return null;
  }

  function numericValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function markerZoomLocal(mapZoom) {
    return Math.max(0.75, Math.min(2.25, 0.75 + ((mapZoom || 1) - 1) * 0.5625));
  }

  function pipeColorValueLocal(pipe) {
    const raw = String((pipe && pipe.pipeColor) || "").trim();
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
      brown: "#9c4f2f",
    };

    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
    return colorMap[lower] || "#9c4f2f";
  }

  function normalizeBearing(value) {
    const number = numericValue(value);
    if (number === null) return null;
    return ((number % 360) + 360) % 360;
  }

  function pipeDisplayDistance(value, fallback) {
    const distance = numericValue(value);
    return distance === null || distance <= 0 ? fallback : distance;
  }

  function loadCanvasImage(source) {
    const src = source && (source.currentSrc || source.src || source.getAttribute("src"));
    if (!src) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Map image could not be drawn for the PDF."));
      image.src = src;
    });
  }

  function drawPipe(ctx, pipe, anchor, markerZoom) {
    const bearing = normalizeBearing(pipe && pipe.pipeBearing);
    if (bearing === null) return;

    const start = pipeDisplayDistance(pipe.pipeStartDistance, 95);
    const end = pipeDisplayDistance(pipe.pipeEndDistance, 95);
    const radians = bearing * Math.PI / 180;
    const dx = Math.sin(radians);
    const dy = -Math.cos(radians);

    ctx.save();
    ctx.strokeStyle = pipeColorValueLocal(pipe);
    ctx.lineWidth = Math.max(3, 4 * markerZoom);
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(anchor.x - dx * start, anchor.y - dy * start);
    ctx.lineTo(anchor.x + dx * end, anchor.y + dy * end);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrosshair(ctx, anchor, markerZoom) {
    const radius = 10.56 * markerZoom;
    const arm = 17.28 * markerZoom;

    ctx.save();
    ctx.strokeStyle = "#1f4f47";
    ctx.lineWidth = Math.max(2, 2.4 * markerZoom);
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, radius, 0, Math.PI * 2);
    ctx.moveTo(anchor.x - arm, anchor.y);
    ctx.lineTo(anchor.x + arm, anchor.y);
    ctx.moveTo(anchor.x, anchor.y - arm);
    ctx.lineTo(anchor.x, anchor.y + arm);
    ctx.stroke();
    ctx.restore();
  }

  function wrapWords(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });

    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawLabel(ctx, hole, anchor, markerZoom, canvasWidth) {
    const title = String((hole && hole.holeName) || "TH");
    const utility = String((hole && (hole.utilityType || hole.holeName)) || "TH");
    const labelX = anchor.x + 27 * markerZoom;
    const labelY = anchor.y - 21 * markerZoom;
    const paddingX = 5 * markerZoom;
    const paddingY = 3 * markerZoom;
    const maxTextWidth = Math.max(68 * markerZoom, Math.min(120 * markerZoom, canvasWidth - labelX - paddingX * 2 - 4));
    const titleFont = `800 ${8.5 * markerZoom}px Arial, Helvetica, sans-serif`;
    const utilityFont = `800 ${10 * markerZoom}px Arial, Helvetica, sans-serif`;

    ctx.save();
    ctx.font = utilityFont;
    const utilityLines = wrapWords(ctx, utility, maxTextWidth);
    ctx.font = titleFont;
    const titleWidth = ctx.measureText(title).width;
    ctx.font = utilityFont;
    const utilityWidth = Math.max(...utilityLines.map((line) => ctx.measureText(line).width));
    const labelWidth = Math.max(28 * markerZoom, titleWidth, utilityWidth) + paddingX * 2;
    const titleHeight = 10 * markerZoom;
    const lineHeight = 12.5 * markerZoom;
    const labelHeight = paddingY * 2 + titleHeight + utilityLines.length * lineHeight;

    ctx.fillStyle = "#1f4f47";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, 2 * markerZoom);
    roundedRect(ctx, labelX, labelY, labelWidth, labelHeight, 3 * markerZoom);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.font = titleFont;
    ctx.fillText(title, labelX + paddingX, labelY + paddingY);
    ctx.font = utilityFont;
    utilityLines.forEach((line, index) => {
      ctx.fillText(line, labelX + paddingX, labelY + paddingY + titleHeight + index * lineHeight);
    });
    ctx.restore();
  }

  function addVisibleCrosshair(stage, mapBounds, anchor) {
    const marker = document.querySelector("#pinLayer .th-marker.selected") || document.querySelector("#pinLayer .th-marker");
    const markerAnchor = anchor || markerAnchorInMap(marker, mapBounds);
    if (!marker || !markerAnchor) return;

    const markerClone = document.createElement("span");
    markerClone.className = "th-marker selected";
    markerClone.style.position = "absolute";
    markerClone.style.left = `${markerAnchor.x}px`;
    markerClone.style.top = `${markerAnchor.y}px`;
    markerClone.style.width = "0";
    markerClone.style.height = "0";
    markerClone.style.overflow = "visible";
    markerClone.style.zIndex = "20";
    markerClone.style.setProperty("--marker-zoom", marker.style.getPropertyValue("--marker-zoom") || "1");

    marker.childNodes.forEach((child) => markerClone.appendChild(child.cloneNode(true)));

    stage.appendChild(markerClone);
  }

  async function captureVisibleMap() {
    const mapCanvas = byId("mapCanvas");
    if (!mapCanvas || !mapCanvas.classList.contains("has-image")) return "";

    const bounds = mapCanvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return "";
    const hole = selectedMapHole();
    const zoom = (hole && hole.mapZoom) || (typeof state !== "undefined" && state.mapZoom) || 1;
    const contentWidth = Math.ceil(mapCanvas.clientWidth * zoom);
    const contentHeight = Math.ceil(mapCanvas.clientHeight * zoom);
    const scrollLeft = mapCanvas.scrollLeft || 0;
    const scrollTop = mapCanvas.scrollTop || 0;
    const markerAnchor = hole && Number.isFinite(hole.mapX) && Number.isFinite(hole.mapY)
      ? {
        x: ((hole.mapX / 100) * contentWidth) - scrollLeft,
        y: ((hole.mapY / 100) * contentHeight) - scrollTop,
      }
      : null;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const scale = isIos ? 1.4 : 1.8;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(bounds.width * scale);
    canvas.height = Math.ceil(bounds.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.scale(scale, scale);
    ctx.fillStyle = getComputedStyle(mapCanvas).backgroundColor || "#ffffff";
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    try {
      for (const id of ["mapImage", "mapLabelImage"]) {
        const source = byId(id);
        if (!source || !source.getAttribute("src") || getComputedStyle(source).display === "none") continue;
        const image = await loadCanvasImage(source);
        if (image) ctx.drawImage(image, -scrollLeft, -scrollTop, contentWidth, contentHeight);
      }

      if (markerAnchor) {
        const markerZoom = markerZoomLocal(zoom);
        (hole.pipes || []).forEach((pipe) => drawPipe(ctx, pipe, markerAnchor, markerZoom));
        drawCrosshair(ctx, markerAnchor, markerZoom);
        drawLabel(ctx, hole, markerAnchor, markerZoom, bounds.width);
      }

      return canvas.toDataURL("image/jpeg", isIos ? 0.78 : 0.82);
    } catch (error) {
      const stage = document.createElement("div");
      stage.style.position = "fixed";
      stage.style.left = "-10000px";
      stage.style.top = "0";
      stage.style.width = `${Math.ceil(bounds.width)}px`;
      stage.style.height = `${Math.ceil(bounds.height)}px`;
      stage.style.overflow = "hidden";
      stage.style.background = getComputedStyle(mapCanvas).backgroundColor || "#ffffff";

      ["mapImage", "mapLabelImage"].forEach((id) => {
        const source = byId(id);
        if (!source) return;
        if (source.tagName === "IMG" && !source.getAttribute("src")) return;
        if (source.tagName === "IMG" && getComputedStyle(source).display === "none") return;

        const clone = source.cloneNode(true);
        clone.removeAttribute("id");
        clone.style.position = "absolute";
        clone.style.left = `${-scrollLeft}px`;
        clone.style.top = `${-scrollTop}px`;
        clone.style.width = `${contentWidth}px`;
        clone.style.height = `${contentHeight}px`;
        clone.style.right = "auto";
        clone.style.bottom = "auto";
        clone.style.display = "block";
        clone.style.transform = "none";
        clone.style.transformOrigin = "0 0";
        clone.style.pointerEvents = "none";
        if (clone.tagName === "IMG") clone.style.objectFit = "fill";
        stage.appendChild(clone);
      });

      addVisibleCrosshair(stage, bounds, markerAnchor);
      document.body.appendChild(stage);

      try {
        const fallbackCanvas = await window.html2canvas(stage, {
          backgroundColor: "#ffffff",
          scale,
          useCORS: true,
          allowTaint: true,
          logging: false,
          removeContainer: true,
          width: Math.ceil(bounds.width),
          height: Math.ceil(bounds.height),
          windowWidth: Math.ceil(bounds.width),
          windowHeight: Math.ceil(bounds.height),
          scrollX: 0,
          scrollY: 0,
        });
        return fallbackCanvas.toDataURL("image/jpeg", isIos ? 0.78 : 0.82);
      } finally {
        stage.remove();
      }
    }
  }

  function applyMapSnapshot(snapshotUrl) {
    if (!snapshotUrl) return;
    [byId("reportPreview"), byId("printReport")].forEach((root) => {
      if (!root) return;
      root.querySelectorAll(".report-map").forEach((map) => {
        map.innerHTML = `<img src="${snapshotUrl}" alt="Visible aerial map" style="display:block;width:100%;height:100%;object-fit:contain;background:#fff;">`;
      });
    });
  }

  async function renderReportWithVisibleMap() {
    if (typeof renderReport === "function") renderReport();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const snapshot = await captureVisibleMap();
    if (typeof renderReport === "function") renderReport();
    applyMapSnapshot(snapshot);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  async function createPdfBlob(onProgress) {
    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("PDF tools did not load. Check your connection and try again.");
    }

    await renderReportWithVisibleMap();

    const preview = byId("reportPreview");
    const printReport = byId("printReport");
    const sourceSheets = preview ? Array.from(preview.querySelectorAll(".sheet")) : [];
    const fallbackSheets = printReport ? Array.from(printReport.children).filter((element) => element.classList.contains("sheet")) : [];
    const sheets = sourceSheets.length ? sourceSheets : fallbackSheets;
    const stage = document.createElement("div");
    stage.className = "pdf-render-stage";
    document.body.appendChild(stage);

    try {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter", compress: true });
      const captureScale = isIos ? 1.05 : 1.25;
      const jpegQuality = isIos ? 0.68 : 0.72;

      for (let index = 0; index < sheets.length; index += 1) {
        if (onProgress) onProgress(index + 1, sheets.length);
        stage.replaceChildren(sheets[index].cloneNode(true));
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const sheet = stage.firstElementChild;
        const bounds = sheet.getBoundingClientRect();
        const canvas = await window.html2canvas(sheet, {
          backgroundColor: "#ffffff",
          scale: captureScale,
          useCORS: true,
          allowTaint: true,
          logging: false,
          removeContainer: true,
          width: Math.ceil(bounds.width),
          height: Math.ceil(bounds.height),
          windowWidth: Math.ceil(bounds.width),
          scrollX: 0,
          scrollY: 0,
        });

        if (index > 0) pdf.addPage("letter", "portrait");
        pdf.addImage(canvas.toDataURL("image/jpeg", jpegQuality), "JPEG", 0, 0, 8.5, 11, undefined, "FAST");
      }

      return pdf.output("blob");
    } finally {
      stage.remove();
    }
  }

  async function sharePreparedPdf() {
    if (!preparedPdfFile) return false;

    if (navigator.canShare && navigator.canShare({ files: [preparedPdfFile] }) && navigator.share) {
      await navigator.share({
        title: preparedPdfFile.name.replace(/\.pdf$/i, ""),
        text: "Test hole report PDF",
        files: [preparedPdfFile],
      });
      preparedPdfFile = null;
      updateShareReadyState(false);
      return true;
    }

    const url = URL.createObjectURL(preparedPdfFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = preparedPdfFile.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    preparedPdfFile = null;
    updateShareReadyState(false);
    alert("Sharing files is not supported in this browser, so the PDF was downloaded instead.");
    return true;
  }

  async function sharePdfWithMapSnapshot() {
    if (preparedPdfFile) {
      try {
        await sharePreparedPdf();
      } catch (error) {
        if (error.name !== "AbortError") {
          alert("The browser blocked sharing. Tap Share PDF again and choose your app from the share sheet.");
        }
      }
      return;
    }

    setPdfButtonsLocal(true, "Creating PDF...");
    try {
      const filename = pdfFileNameLocal();
      const blob = await createPdfBlob((page, total) => {
        setPdfButtonsLocal(true, `PDF page ${page}/${total}...`);
      });
      preparedPdfFile = new File([blob], filename, { type: "application/pdf" });
      updateShareReadyState(true);
      alert("PDF is ready. Tap Share PDF again to open the share sheet.");
    } catch (error) {
      alert(`PDF sharing failed: ${error.message}`);
    } finally {
      setPdfButtonsLocal(false);
      if (preparedPdfFile) updateShareReadyState(true);
    }
  }

  async function savePdfWithMapSnapshot(pdfWindow) {
    setPdfButtonsLocal(true, "Creating PDF...");

    try {
      const filename = pdfFileNameLocal();
      const blob = await createPdfBlob((page, total) => {
        setPdfButtonsLocal(true, `PDF page ${page}/${total}...`);
      });
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
      setPdfButtonsLocal(false);
    }
  }

  async function printWithMapSnapshot() {
    setPdfButtonsLocal(true, "Preparing Print...");

    try {
      await renderReportWithVisibleMap();
      await new Promise((resolve) => setTimeout(resolve, 120));
      window.print();
    } catch (error) {
      alert(`Print preparation failed: ${error.message}`);
    } finally {
      setPdfButtonsLocal(false);
    }
  }

  function installPdfMapSnapshot() {
    if (document.documentElement.dataset.pdfMapSnapshotBound) return;
    document.documentElement.dataset.pdfMapSnapshotBound = "true";

    document.addEventListener("click", (event) => {
      const button = event.target.closest("#sharePdfBtn, #sharePdfActionBtn, #pdfBtn, #printBtn");
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (button.id === "printBtn") {
        printWithMapSnapshot();
        return;
      }

      if (button.id === "pdfBtn") {
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const pdfWindow = isIos ? window.open("", "_blank") : null;
        if (pdfWindow) {
          pdfWindow.document.write("<p style='font-family:sans-serif;padding:24px'>Creating PDF...</p>");
        }
        savePdfWithMapSnapshot(pdfWindow);
        return;
      }

      sharePdfWithMapSnapshot();
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPdfMapSnapshot);
  } else {
    installPdfMapSnapshot();
  }
}());
