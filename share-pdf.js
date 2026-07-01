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

  async function createReportPdfBlob(onProgress) {
    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("PDF tools did not load. Check your internet connection and try again.");
    }

    renderReport();

    const report = getButton("printReport");
    const sourceSheets = Array.from(report.children).filter((element) => element.classList.contains("sheet"));
    const stage = document.createElement("div");
    stage.className = "pdf-render-stage";
    document.body.appendChild(stage);

    try {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "in", format: "letter", compress: true });
      const captureScale = isIos ? 1.05 : 1.25;
      const jpegQuality = isIos ? 0.68 : 0.72;

      for (let index = 0; index < sourceSheets.length; index += 1) {
        if (onProgress) onProgress(index + 1, sourceSheets.length);
        stage.replaceChildren(sourceSheets[index].cloneNode(true));
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const sheet = stage.firstElementChild;
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

  window.sharePdf = sharePdf;

  window.addEventListener("load", () => {
    const topButton = getButton("sharePdfBtn");
    const actionButton = getButton("sharePdfActionBtn");
    if (topButton) topButton.addEventListener("click", sharePdf);
    if (actionButton) actionButton.addEventListener("click", sharePdf);
  });
}());
