const FORMAT_MAP = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  webp: { mime: "image/webp", ext: "webp" },
};

let images = [];
let selected = new Set();
let tabId = null;

const contentEl = document.getElementById("content");
const countEl = document.getElementById("count");
const downloadBtn = document.getElementById("download");
const selectAllBtn = document.getElementById("selectAll");
const formatSelect = document.getElementById("format");

// Initialize
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  tabId = tabs[0].id;
  chrome.tabs.sendMessage(tabId, { action: "getAllImages" }, (response) => {
    if (chrome.runtime.lastError || !response?.images) {
      contentEl.innerHTML = '<div class="empty">Could not scan page. Try refreshing.</div>';
      return;
    }
    images = response.images;
    countEl.textContent = `${images.length} image${images.length !== 1 ? "s" : ""} found`;
    render();
  });
});

function render() {
  if (images.length === 0) {
    contentEl.innerHTML = '<div class="empty">No images found on this page.</div>';
    return;
  }

  contentEl.className = "grid";
  contentEl.innerHTML = images
    .map(
      (img, i) => `
      <div class="card ${selected.has(i) ? "selected" : ""}" data-index="${i}">
        <img src="${escapeAttr(img.src)}" loading="lazy" alt="">
        <div class="check"></div>
        ${img.width ? `<div class="dims">${img.width}&times;${img.height}</div>` : ""}
      </div>`
    )
    .join("");

  contentEl.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = parseInt(card.dataset.index);
      if (selected.has(idx)) selected.delete(idx);
      else selected.add(idx);
      card.classList.toggle("selected");
      updateDownloadBtn();
    });
  });

  updateDownloadBtn();
}

function updateDownloadBtn() {
  const n = selected.size;
  downloadBtn.textContent = `Download (${n})`;
  downloadBtn.disabled = n === 0;
  selectAllBtn.textContent = selected.size === images.length ? "Deselect All" : "Select All";
}

selectAllBtn.addEventListener("click", () => {
  if (selected.size === images.length) {
    selected.clear();
  } else {
    images.forEach((_, i) => selected.add(i));
  }
  render();
});

downloadBtn.addEventListener("click", () => {
  const fmt = FORMAT_MAP[formatSelect.value];
  const selectedImages = [...selected].map((i) => images[i]);

  downloadBtn.disabled = true;
  downloadBtn.textContent = "Downloading...";

  chrome.runtime.sendMessage(
    {
      action: "batchDownload",
      tabId,
      images: selectedImages,
      mime: fmt.mime,
      ext: fmt.ext,
    },
    () => {
      downloadBtn.textContent = "Started!";
      setTimeout(() => window.close(), 1000);
    }
  );
});

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
