(function () {
  if (window.sharePdf) return;

  let preparedPdfFile = null;

  function getButton(id) {
    return document.getElementById(id);
  }

  function setPdfButtons(disabled, text) {
    ["pdfBtn", "sharePdfBtn", "sharePdfActionBtn"].forEach((id) => {
      const button = getButton(id);
      if (!button) return;
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.disabled = disabled;
      button.textContent = disabled && text ? text : button.dataset.originalText;
    });
  }

  function pdfFileName() {
    const project = window.state && window.state.project ? window.state.project : {};
    const raw = project.projectFileName || project.projectNumber || project.projectName || "test-hole-project";
    return `${safeFilePart(raw)}.pdf`;
  }

  function updateShareReadyState(isReady) {
    ["sharePdfBtn", "sharePdfActionBtn"].forEach((id) => {
      const button = getButton(id);
      if (!button) return;
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.textContent = isReady ? "Tap to Share PDF" : button.dataset.originalText;
      button.classList.toggle("primary", isReady || id === "sharePdfBtn");
    });
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateSelectedMapViewport() {
    if (typeof window.selectedHole !== "function") return;
    const hole = window.selectedHole();
    const canvas = getButton("mapCanvas");
    if (!hole || !canvas || !canvas.clientWidth || !canvas.clientHeight) return;

    hole.mapViewLeft = canvas.scrollLeft / canvas.clientWidth * 100;
    hole.mapViewTop = canvas.scrollTop / canvas.clientHeight * 100;
  }

  function installReportMapViewportOverride() {
    if (window.reportMapLayerStyle && !window.reportMapLayerStyle.__usesFieldViewport) {
      const originalReportMapLayerStyle = window.reportMapLayerStyle;
      window.reportMapLayerStyle = function reportMapLayerStyleWithFieldViewport(hole, mapZoom) {
        const zoom = Math.max(1, Number(mapZoom) || 1);
        const widthPct = zoom * 100;
        const heightPct = zoom * 100;

        if (Number.isFinite(hole.mapViewLeft) && Number.isFinite(hole.mapViewTop)) {
          const leftPct = clampNumber(-hole.mapViewLeft, 100 - widthPct, 0);
          const topPct = clampNumber(-hole.mapViewTop, 100 - heightPct, 0);
          return `--map-zoom:1;width:${widthPct}%;height:${heightPct}%;left:${leftPct}%;top:${topPct}%;`;
        }

        return originalReportMapLayerStyle(hole, mapZoom);
      };
      window.reportMapLayerStyle.__usesFieldViewport = true;
    }
  }

  function installMapViewportSync() {
    const canvas = getButton("mapCanvas");
    if (!canvas || canvas.dataset.viewportSyncBound) return;
    canvas.dataset.viewportSyncBound = "true";

    let saveTimer = 0;
    canvas.addEventListener("scroll", () => {
      updateSelectedMapViewport();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (typeof window.save === "function") window.save();
        if (typeof window.renderReport === "function") window.renderReport();
      }, 150);
    }, { passive: true });

    requestAnimationFrame(updateSelectedMapViewport);
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

  function lockReportMarkerPositions(sourceSheet, targetSheet) {
    if (!sourceSheet || !targetSheet) return;

    const sourceMarkers = Array.from(sourceSheet.querySelectorAll(".report-th-marker"));
    const targetMarkers = Array.from(targetSheet.querySelectorAll(".report-th-marker"));

    sourceMarkers.forEach((sourceMarker, index) => {
      const targetMarker = targetMarkers[index];
      const sourceMap = sourceMarker.closest(".report-map");
      const targetMap = targetMarker && targetMarker.closest(".report-map");
      const targetLayer = targetMarker && targetMarker.closest(".report-map-layer");
      if (!targetMarker || !sourceMap || !targetMap || !targetLayer) return;

      const sourceMarkerRect = sourceMarker.getBoundingClientRect();
      const sourceMapRect = sourceMap.getBoundingClientRect();
      const targetMapRect = targetMap.getBoundingClientRect();
      const targetLayerRect = targetLayer.getBoundingClientRect();
      const xInMap = sourceMarkerRect.left - sourceMapRect.left;
      const yInMap = sourceMarkerRect.top - sourceMapRect.top;

      targetMarker.style.left = `${xInMap - (targetLayerRect.left - targetMapRect.left)}px`;
      targetMarker.style.top = `${yInMap - (targetLayerRect.top - targetMapRect.top)}px`;
    });
  }

  async function createReportPdfBlob(onProgress) {
    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("PDF tools did not load. Check your internet connection and try again.");
    }

    updateSelectedMapViewport();
    installReportMapViewportOverride();
    renderReport();

    const preview = getButton("reportPreview");
    const printReport = getButton("printReport");
    const sourceSheets = Array.from(preview.querySelectorAll(".sheet"));
    const fallbackSheets = Array.from(printReport.children).filter((element) => element.classList.contains("sheet"));
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
        lockReportMarkerPositions(sheets[index], sheet);
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const bounds = sheet.getBoundingClientRect();
        const canvas = await window.html2canvas(sheet, {
          backgroundColor: "#ffffff",
          scale: captureScale,
          useCORS: true,
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

  async function sharePdf() {
    if (preparedPdfFile) {
      try {
        await sharePreparedPdf();
      } catch (error) {
        if (error.name !== "AbortError") {
          alert("The browser blocked sharing. Tap Share PDF again and choose Egnyte from the share sheet.");
        }
      }
      return;
    }

    setPdfButtons(true, "Creating PDF...");

    try {
      const filename = pdfFileName();
      const blob = await createReportPdfBlob((page, total) => {
        setPdfButtons(true, `PDF page ${page}/${total}...`);
      });
      preparedPdfFile = new File([blob], filename, { type: "application/pdf" });
      updateShareReadyState(true);
      alert("PDF is ready. Tap Share PDF again to open the share sheet.");
    } catch (error) {
      if (error.name !== "AbortError") {
        alert(`PDF sharing failed: ${error.message}`);
      }
    } finally {
      setPdfButtons(false);
      if (preparedPdfFile) updateShareReadyState(true);
    }
  }

  async function savePdfWithLockedMarker(event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    setPdfButtons(true, "Creating PDF...");

    try {
      const filename = pdfFileName();
      const blob = await createReportPdfBlob((page, total) => {
        setPdfButtons(true, `PDF page ${page}/${total}...`);
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      alert(`PDF creation failed: ${error.message}`);
    } finally {
      setPdfButtons(false);
    }
  }

  function installAddHoleFallback() {
    const addButton = getButton("addHoleBtn");
    if (!addButton || addButton.dataset.addFallbackBound) return;
    addButton.dataset.addFallbackBound = "true";
    addButton.disabled = false;
    addButton.addEventListener("click", (event) => {
      if (typeof window.addHole !== "function") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.addHole();
    }, true);
  }

  window.sharePdf = sharePdf;

  window.addEventListener("load", () => {
    const topButton = getButton("sharePdfBtn");
    const actionButton = getButton("sharePdfActionBtn");
    const pdfButton = getButton("pdfBtn");
    if (topButton) topButton.addEventListener("click", sharePdf);
    if (actionButton) actionButton.addEventListener("click", sharePdf);
    if (pdfButton) pdfButton.addEventListener("click", savePdfWithLockedMarker, true);
    installReportMapViewportOverride();
    installMapViewportSync();
    installAddHoleFallback();
    setTimeout(installAddHoleFallback, 1000);
    setTimeout(installMapViewportSync, 1000);
  });
}());
