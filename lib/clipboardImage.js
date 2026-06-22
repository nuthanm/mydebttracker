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
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not render tile image.'));
    image.src = src;
  });
}

function formatPixelSize(value) {
  return `${Math.max(1, Math.ceil(Number(value) || 0))}px`;
}

function inlineComputedStyles(source, target, isRoot = false) {
  const computedStyle = window.getComputedStyle(source);
  const styleText = Array.from(computedStyle).map((property) => (
    `${property}:${computedStyle.getPropertyValue(property)};`
  )).join('');
  target.style.cssText = styleText;
  target.style.setProperty('transition', 'none');
  target.style.setProperty('animation', 'none');
  target.style.setProperty('caret-color', 'transparent');

  const expandedWidth = Math.max(source.scrollWidth, source.clientWidth, source.getBoundingClientRect().width);
  const expandedHeight = Math.max(source.scrollHeight, source.clientHeight, source.getBoundingClientRect().height);

  if (isRoot || source.scrollWidth > source.clientWidth + 1) {
    target.style.width = formatPixelSize(expandedWidth);
    target.style.maxWidth = 'none';
  }
  if (isRoot || source.scrollHeight > source.clientHeight + 1) {
    target.style.height = formatPixelSize(expandedHeight);
    target.style.maxHeight = 'none';
  }
  if (source.scrollWidth > source.clientWidth + 1 || source.scrollHeight > source.clientHeight + 1) {
    target.style.overflow = 'visible';
  }

  if (source instanceof HTMLInputElement) {
    if (source.type === 'checkbox' || source.type === 'radio') {
      target.checked = source.checked;
      if (source.checked) target.setAttribute('checked', 'checked');
      else target.removeAttribute('checked');
    } else {
      target.setAttribute('value', source.value);
      target.value = source.value;
    }
  }

  if (source instanceof HTMLTextAreaElement) {
    target.textContent = source.value;
    target.value = source.value;
  }

  if (source instanceof HTMLSelectElement) {
    Array.from(source.options).forEach((option, index) => {
      if (target.options[index]) target.options[index].selected = option.selected;
    });
  }
}

function createStyledSnapshotClone(element) {
  const clone = element.cloneNode(true);
  const sourceNodes = [element, ...element.querySelectorAll('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll('*')];

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    inlineComputedStyles(sourceNode, cloneNode, index === 0);
  });

  clone.style.margin = '0';
  return clone;
}

function blobToDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function elementToPngBlob(element, options = {}) {
  const { padding = 12, backgroundColor = TILE_SNAPSHOT_BG } = options;
  if (document.fonts?.ready) await document.fonts.ready;
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(Math.max(rect.width, element.scrollWidth)));
  const height = Math.max(1, Math.ceil(Math.max(rect.height, element.scrollHeight)));
  const canvasWidth = width + padding * 2;
  const canvasHeight = height + padding * 2;
  // Keep minimum 2x for readability while capping at 3x to avoid very large images.
  const scale = Math.max(MIN_SNAPSHOT_SCALE, Math.min(MAX_SNAPSHOT_SCALE, window.devicePixelRatio || MIN_SNAPSHOT_SCALE));
  const snapshotClone = createStyledSnapshotClone(element);

  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${canvasWidth}px;height:${canvasHeight}px;padding:${padding}px;background:${backgroundColor};box-sizing:border-box;overflow:visible;">
      ${new XMLSerializer().serializeToString(snapshotClone)}
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
    blobToDownload(blob, fileName);
    return 'downloaded';
  }
}

export async function shareOrDownloadElementImage(element, fileName, options = {}) {
  const blob = await elementToPngBlob(element, options);
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({
      files: [file],
      title: options.shareTitle || fileName,
    });
    return 'shared';
  }

  blobToDownload(blob, fileName);
  return 'downloaded';
}
