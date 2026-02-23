chrome.runtime.onInstalled.addListener(() => {
  const parent = chrome.contextMenus.create({
    id: "save-image-as",
    title: "Save Image As...",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: "save-as-png",
    parentId: "save-image-as",
    title: "Save as PNG",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: "save-as-jpg",
    parentId: "save-image-as",
    title: "Save as JPG",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: "save-as-webp",
    parentId: "save-image-as",
    title: "Save as WebP",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: "separator",
    parentId: "save-image-as",
    type: "separator",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: "copy-as-png",
    parentId: "save-image-as",
    title: "Copy as PNG",
    contexts: ["image"],
  });

});

const FORMAT_MAP = {
  "save-as-png": { mime: "image/png", ext: "png" },
  "save-as-jpg": { mime: "image/jpeg", ext: "jpg" },
  "save-as-webp": { mime: "image/webp", ext: "webp" },
};

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const isCopy = info.menuItemId === "copy-as-png";
  const format = isCopy
    ? { mime: "image/png", ext: "png" }
    : FORMAT_MAP[info.menuItemId];

  if (!format) return;

  chrome.tabs.sendMessage(
    tab.id,
    {
      action: isCopy ? "copyImage" : "convertImage",
      url: info.srcUrl,
      mime: format.mime,
      ext: format.ext,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        notify("Error", "Failed to reach content script. Try refreshing the page.");
        return;
      }

      if (!response || response.error) {
        notify("Error", response?.error || "Image conversion failed.");
        return;
      }

      if (isCopy) {
        notify("Copied!", "Image copied to clipboard as PNG.");
        return;
      }

      const filename = buildFilename(info.srcUrl, format.ext);

      chrome.downloads.download(
        { url: response.dataUrl, filename, saveAs: false },
        () => {
          if (chrome.runtime.lastError) {
            notify("Download failed", chrome.runtime.lastError.message);
          } else {
            notify("Saved!", `Image saved as ${format.ext.toUpperCase()}.`);
          }
        }
      );
    }
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "batchDownload") {
    handleBatchDownload(message.tabId, message.images, message.mime, message.ext);
    sendResponse({ started: true });
  }
});

async function handleBatchDownload(tabId, images, mime, ext) {
  let success = 0;
  let failed = 0;

  for (const img of images) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: "convertImage",
        url: img.src,
        mime,
        ext,
      });

      if (response?.dataUrl) {
        const filename = buildFilename(img.src, ext);
        await chrome.downloads.download({ url: response.dataUrl, filename, saveAs: false });
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  const parts = [`${success} image${success !== 1 ? "s" : ""} saved`];
  if (failed > 0) parts.push(`${failed} failed`);
  notify("Batch Download", parts.join(", ") + ".");
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

function buildFilename(srcUrl, ext) {
  try {
    const url = new URL(srcUrl);
    let name = url.pathname.split("/").pop() || "image";
    // Remove existing extension
    name = name.replace(/\.[^.]+$/, "");
    // Sanitize
    name = name.replace(/[^a-zA-Z0-9_\-]/g, "_") || "image";
    return `${name}.${ext}`;
  } catch {
    return `image.${ext}`;
  }
}
