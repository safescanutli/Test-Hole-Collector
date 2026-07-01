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
    ["pdfBtn", "sharePdfBtn", "sharePdfActionBtn"].forEach((id) => {
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

  async function captureVisibleMap() {
    const mapCanvas = byId("mapCanvas");
    if (!mapCanvas || !mapCanvas.classList.contains("has-image") || !window.html2canvas) return "";

    const bounds = mapCanvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return "";

    const stage = document.createElement("div");
    stage.style.position = "fixed";
    stage.style.left = "-10000px";
    stage.style.top = "0";
    stage.style.width = `${Math.ceil(bounds.width)}px`;
    stage.style.height = `${Math.ceil(bounds.height)}px`;
    stage.style.overflow = "hidden";
    stage.style.background = getComputedStyle(mapCanvas).backgroundColor || "#ffffff";

    ["mapImage", "mapLabelImage", "pinLayer"].forEach((id) => {
      const source = byId(id);
      if (!source) return;
      if (source.tagName === "IMG" && !source.getAttribute("src")) return;
      if (source.tagName === "IMG" && getComputedStyle(source).display === "none") return;

      const sourceRect = source.getBoundingClientRect();
      const clone = source.cloneNode(true);
      clone.removeAttribute("id");
      clone.style.position = "absolute";
      clone.style.left = `${sourceRect.left - bounds.left}px`;
      clone.style.top = `${sourceRect.top - bounds.top}px`;
      clone.style.width = `${sourceRect.width}px`;
      clone.style.height = `${sourceRect.height}px`;
      clone.style.right = "auto";
      clone.style.bottom = "auto";
      clone.style.display = "block";
      clone.style.transform = "none";
      clone.style.transformOrigin = "0 0";
      clone.style.pointerEvents = "none";
      if (clone.tagName === "IMG") {
        clone.style.objectFit = "contain";
      }
      stage.appendChild(clone);
    });

    document.body.appendChild(stage);

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    try {
      const canvas = await window.html2canvas(stage, {
        backgroundColor: "#ffffff",
        scale: isIos ? 1.4 : 1.8,
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

      return canvas.toDataURL("image/jpeg", isIos ? 0.78 : 0.82);
    } finally {
      stage.remove();
    }
  }

  function applyMapSnapshot(snapshotUrl) {
    if (!snapshotUrl) return;
    [byId("reportPreview"), byId("printReport")].forEach((root) => {
      if (!root) return;
      root.querySelectorAll(".report-map").forEach((map) => {
        map.innerHTML = `<img src="${snapshotUrl}" alt="Visible aerial map" style="display:block;width:100%;height:100%;object-fit:cover;">`;
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

  function installPdfMapSnapshot() {
    if (document.documentElement.dataset.pdfMapSnapshotBound) return;
    document.documentElement.dataset.pdfMapSnapshotBound = "true";

    document.addEventListener("click", (event) => {
      const button = event.target.closest("#sharePdfBtn, #sharePdfActionBtn, #pdfBtn");
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();

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
