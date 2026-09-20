// Só transforma previews do próprio site. Downloads e mídias externas não mudam.
export function imageVariant(src: string, width: number): string {
  if (!src.startsWith('/api/storage/preview/')) return src;
  const [path, query = ''] = src.split('?');
  const params = new URLSearchParams(query);
  if (params.has('download')) return src;
  params.set('w', String(width));
  params.set('format', 'webp');
  return `${path}?${params}`;
}
export function imageSources(src: string, widths: number[]): string | undefined {
  if (!src.startsWith('/api/storage/preview/')) return undefined;
  return widths.map(width => `${imageVariant(src, width)} ${width}w`).join(', ');
}
