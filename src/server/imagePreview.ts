import sharp from 'sharp';

export function previewWidth(query: Record<string, unknown>, download: boolean): number | null {
  if (download || query.format !== 'webp' || typeof query.w !== 'string') return null;
  const width = Number(query.w);
  return [320, 640, 960, 1600].includes(width) ? width : null;
}

export async function resizePreview(data: Buffer, mime: string, width: number) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return { data, mime };
  try {
    const options = { limitInputPixels: 32_000_000 };
    const metadata = await sharp(data, options).metadata();
    if ((metadata.pages || 1) > 1) return { data, mime };
    const variant = await sharp(data, options).rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer();
    return variant.length < data.length ? { data: variant, mime: 'image/webp' } : { data, mime };
  } catch {
    // Um original válido para o navegador continua disponível se a conversão falhar.
    return { data, mime };
  }
}
