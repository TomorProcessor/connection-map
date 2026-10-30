// Embedded raster images keep profile pictures portable and offline.
export const PHOTO_MAX_CHARS = 64 * 1024;
export const PHOTO_SIZE = 320;
export const PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;
// Most 320 px photos fit at the top quality; detailed ones step down and still stay well under PHOTO_MAX_CHARS.
const PHOTO_TARGET_CHARS = 40 * 1024;

export function normalizePhoto(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const invalid = () => new Error('Profile pictures must be embedded JPEG, PNG, or WebP images under 64 KB of encoded text.');
  if (typeof value !== 'string' || value.length > PHOTO_MAX_CHARS ||
      !/^data:image\/(?:jpeg|png|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) ||
      !value.split(',')[1]) {
    throw invalid();
  }
  const mime = value.slice(5, value.indexOf(';')), bytes = atob(value.split(',')[1]);
  const starts = (...values) => values.every((n, i) => bytes.charCodeAt(i) === n);
  const valid = mime === 'image/jpeg' ? starts(0xff, 0xd8, 0xff)
    : mime === 'image/png' ? starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (!valid) throw invalid();
  return value;
}

export function squareCrop(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('This image has invalid dimensions.');
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, size: side };
}

export async function preparePhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP picture.');
  if (file.size > PHOTO_UPLOAD_BYTES) throw new Error('Choose a picture smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This picture could not be opened. Try another JPEG, PNG, or WebP file.'));
      image.src = url;
    });
    const crop = squareCrop(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_SIZE; canvas.height = PHOTO_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the picture.');
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fffefa';
    context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    let data;
    for (const quality of [.82, .68, .54, .4]) {
      data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= PHOTO_TARGET_CHARS) break;
    }
    return normalizePhoto(data);
  } finally {
    URL.revokeObjectURL(url);
  }
}
