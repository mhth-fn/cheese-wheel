export const MAX_FOOD_PHOTOS = 4;
export const MAX_FOOD_PHOTO_BYTES = 100 * 1024 * 1024;
export const FOOD_PHOTO_COMPRESSION_THRESHOLD_BYTES = 10 * 1024 * 1024;

const FOOD_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const FOOD_PHOTO_TYPE_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.heic', 'image/heic'],
  ['.heif', 'image/heif'],
]);

const HEIF_PHOTO_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const MAX_CONVERTED_DIMENSION = 4096;

export const FOOD_PHOTO_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
].join(',');

export function resolveFoodPhotoType(file) {
  const mimeType = String(file?.type || '').trim().toLowerCase();
  if (FOOD_PHOTO_TYPES.has(mimeType)) return mimeType;

  const fileName = String(file?.name || '').trim().toLowerCase();
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  return FOOD_PHOTO_TYPE_BY_EXTENSION.get(extension) || null;
}

export function validateFoodPhoto(file) {
  if (!resolveFoodPhotoType(file)) {
    return 'Поддерживаются JPG, PNG, WebP, HEIC и HEIF';
  }
  if (!Number.isFinite(file?.size) || file.size < 1) {
    return 'Фотография пустая';
  }
  if (file.size > MAX_FOOD_PHOTO_BYTES) {
    return 'Фотография больше 100 МБ';
  }
  return null;
}

function loadPhoto(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = document.createElement('img');
    image.decoding = 'async';
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Не удалось прочитать HEIC/HEIF-фотографию'));
    };
    image.src = objectUrl;
  });
}

function encodeJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось преобразовать фотографию в JPEG'));
    }, 'image/jpeg', quality);
  });
}

function jpegName(fileName) {
  const name = String(fileName || 'photo').replace(/\.[^.]+$/, '') || 'photo';
  return `${name}.jpg`;
}

async function convertHeifPhoto(file) {
  const { image, objectUrl } = await loadPhoto(file);
  try {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Не удалось определить размер HEIC/HEIF-фотографии');
    }

    const scale = Math.min(
      1,
      MAX_CONVERTED_DIMENSION / Math.max(sourceWidth, sourceHeight)
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Браузер не смог подготовить фотографию');

    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let converted;
    for (const quality of [0.9, 0.82, 0.72]) {
      converted = await encodeJpeg(canvas, quality);
      if (converted.size <= FOOD_PHOTO_COMPRESSION_THRESHOLD_BYTES) break;
    }
    if (!converted || converted.size > FOOD_PHOTO_COMPRESSION_THRESHOLD_BYTES) {
      throw new Error('После преобразования фотография всё ещё больше 10 МБ');
    }

    return new File([converted], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareFoodPhoto(file) {
  const mimeType = resolveFoodPhotoType(file);
  if (HEIF_PHOTO_TYPES.has(mimeType)) return convertHeifPhoto(file);
  if (mimeType && String(file.type || '').toLowerCase() !== mimeType) {
    return new File([file], file.name, {
      type: mimeType,
      lastModified: file.lastModified || Date.now(),
    });
  }
  return file;
}
