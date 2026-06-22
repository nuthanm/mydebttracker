export function sanitizeImageName(value) {
  return String(value || 'snapshot')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'snapshot';
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
  const { padding = 12, backgroundColor = '#f6f3e8' } = options;
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(Math.max(rect.width, element.scrollWidth)));
  const height = Math.max(1, Math.ceil(Math.max(rect.height, element.scrollHeight)));
  const canvasWidth = width + padding * 2;
  const canvasHeight = height + padding * 2;
  const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 2));

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
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not generate image.'))), 'image/png', 1);
  });
  return blob;
}

export async function copyElementAsImage(element, options) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is not available.');
  }
  const blob = await elementToPngBlob(element, options);
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}
