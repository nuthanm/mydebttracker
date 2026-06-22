export const TILE_SNAPSHOT_BG = '#f6f3e8';
const MIN_SNAPSHOT_SCALE = 2;
const MAX_SNAPSHOT_SCALE = 3;

export function sanitizeImageName(value) {
  return String(value || 'snapshot')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'snapshot';
}

export function buildSnapshotFilename(name, kind = 'tile') {
  return `${sanitizeImageName(name)}-${sanitizeImageName(kind)}.png`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not render tile image.'));
    image.src = src;
  });
}

export async function elementToPngBlob(element, options = {}) {
  const { padding = 12, backgroundColor = TILE_SNAPSHOT_BG } = options;
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(Math.max(rect.width, element.scrollWidth)));
  const height = Math.max(1, Math.ceil(Math.max(rect.height, element.scrollHeight)));
  const canvasWidth = width + padding * 2;
  const canvasHeight = height + padding * 2;
  // Keep minimum 2x for readability while capping at 3x to avoid very large images.
  const scale = Math.max(MIN_SNAPSHOT_SCALE, Math.min(MAX_SNAPSHOT_SCALE, window.devicePixelRatio || MIN_SNAPSHOT_SCALE));

  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${canvasWidth}px;height:${canvasHeight}px;padding:${padding}px;background:${backgroundColor};box-sizing:border-box;">
      ${new XMLSerializer().serializeToString(element)}
    </div>
  `;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(canvasWidth * scale);
  canvas.height = Math.round(canvasHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare image context.');
  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((blobValue) => (blobValue ? resolve(blobValue) : reject(new Error('Failed to convert canvas to PNG blob.'))), 'image/png');
  });
  return blob;
}

async function writeBlobToClipboard(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard API not supported in this browser.');
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

export async function copyElementAsImage(element, options) {
  const blob = await elementToPngBlob(element, options);
  await writeBlobToClipboard(blob);
}

export async function copyOrDownloadElementImage(element, fileName, options) {
  const blob = await elementToPngBlob(element, options);
  try {
    await writeBlobToClipboard(blob);
    return 'copied';
  } catch (copyErr) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    return 'downloaded';
  }
}
