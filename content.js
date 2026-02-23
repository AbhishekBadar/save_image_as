chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "convertImage") {
    convertImage(message.url, message.mime)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === "getAllImages") {
    const images = getAllImages();
    sendResponse({ images });
    return;
  }

  if (message.action === "copyImage") {
    copyImageToClipboard(message.url)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

function getAllImages() {
  const seen = new Set();
  const results = [];
  const minSize = 50;

  // Collect from <img> tags
  document.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:") || seen.has(src)) return;
    if (img.naturalWidth < minSize || img.naturalHeight < minSize) return;
    seen.add(src);
    results.push({
      src,
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  });

  // Collect from CSS background images
  document.querySelectorAll("*").forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    const match = bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ src: match[1], width: 0, height: 0 });
    }
  });

  // Collect from <picture> <source>
  document.querySelectorAll("picture source").forEach((source) => {
    const srcset = source.srcset;
    if (!srcset) return;
    const url = srcset.split(",")[0].trim().split(/\s+/)[0];
    if (url && !url.startsWith("data:") && !seen.has(url)) {
      seen.add(url);
      results.push({ src: url, width: 0, height: 0 });
    }
  });

  return results;
}

async function convertImage(url, mime) {
  const blob = await fetchImage(url);
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);

  const quality = mime === "image/png" ? undefined : 0.92;
  const outputBlob = await canvas.convertToBlob({ type: mime, quality });

  return blobToDataUrl(outputBlob);
}

async function fetchImage(url) {
  // First try fetching directly (works for same-origin and CORS-enabled images)
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (resp.ok) return await resp.blob();
  } catch {
    // Fall through to next method
  }

  // Try loading via an <img> tag which can access cached/cross-origin images
  // the browser already loaded on the page
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed — image may be CORS-restricted"));
        },
        "image/png"
      );
    };
    img.onerror = () =>
      reject(new Error("Could not load image. It may be restricted by CORS policy."));
    img.src = url;
  });
}

async function copyImageToClipboard(url) {
  const blob = await fetchImage(url);
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);

  const pngBlob = await canvas.convertToBlob({ type: "image/png" });
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": pngBlob }),
  ]);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read blob as data URL"));
    reader.readAsDataURL(blob);
  });
}
