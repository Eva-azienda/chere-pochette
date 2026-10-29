/**
 * Photo pipeline (runs entirely on the phone, before anything is uploaded).
 *
 * For every photo we produce three JPEGs: 1600, 900 and 400 px wide
 * (never upscaled, aspect ratio kept). Re-drawing the photo on a canvas also
 * removes all EXIF metadata, including the GPS position — important for privacy,
 * because the repository and the website are public.
 */

export const PHOTO_WIDTHS = [1600, 900, 400];
export const JPEG_QUALITY = 0.82;

/**
 * Decodes an image file with the correct rotation (phones store rotation in EXIF).
 * Returns { source, width, height, close() }.
 *
 * <img> first: every current browser (iOS Safari 13.4+, Chrome, Firefox) applies the EXIF
 * rotation to <img> and to drawImage(img). createImageBitmap is only a fallback, because
 * some Safari versions ignore the EXIF rotation there (photos would come out sideways).
 */
async function decode(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    if (img.decode) await img.decode().catch(() => {}); // finish decoding off the main thread
    if (img.naturalWidth && img.naturalHeight) {
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    }
  } catch {
    // not decodable as <img>: try createImageBitmap below
  }
  URL.revokeObjectURL(url);
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close && bitmap.close() };
    } catch {
      /* unsupported format */
    }
  }
  throw new Error('Formato della foto non supportato. Prova a scattarla di nuovo (o scegli una foto JPEG).');
}

/** Frees a canvas' memory right away (iOS Safari limits the total canvas memory per page). */
function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    if (canvas.getContext('2d')) return canvas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toJpeg(canvas) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Il telefono non è riuscito a preparare la foto (memoria piena?).'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Turns a photo file into the three web sizes.
 * @param {File|Blob} file
 * @returns {Promise<{w: number, h: number, blobs: {1600: Blob, 900: Blob, 400: Blob}}>}
 *          w/h are the dimensions of the 1600 version (as stored in the product JSON).
 */
export async function prepareImage(file) {
  const image = await decode(file);
  try {
    if (!image.width || !image.height) throw new Error('Foto vuota o danneggiata.');
    const out = {};
    // Each size is drawn from the previous (bigger) one: sharper results and less memory.
    let source = image.source;
    let previousCanvas = null;
    let sw = image.width;
    let sh = image.height;
    for (const target of PHOTO_WIDTHS) {
      const w = Math.min(target, image.width); // never upscale
      const h = Math.max(1, Math.round((image.height * w) / image.width));
      const canvas = makeCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // JPEG has no transparency: avoid black backgrounds for PNGs
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, sw, sh, 0, 0, w, h);
      if (previousCanvas) releaseCanvas(previousCanvas);
      out[target] = { blob: await toJpeg(canvas), w, h };
      source = canvas;
      previousCanvas = canvas;
      sw = w;
      sh = h;
    }
    if (previousCanvas) releaseCanvas(previousCanvas);
    return {
      w: out[1600].w,
      h: out[1600].h,
      blobs: { 1600: out[1600].blob, 900: out[900].blob, 400: out[400].blob },
    };
  } finally {
    image.close();
  }
}
