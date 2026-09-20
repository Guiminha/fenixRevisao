import fs from 'node:fs/promises';
import path from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { RequestHandler } from 'express';

const compress = promisify(gzip);
const MIME: Record<string, string> = {
  js: 'application/javascript; charset=UTF-8',
  css: 'text/css; charset=UTF-8',
  svg: 'image/svg+xml',
  json: 'application/json; charset=UTF-8',
};

// Vite emits flat, immutable asset names. Only real files get a cache entry;
// concurrent requests share the same compression and only the gzip is retained.
export function compressedAssets(root: string): RequestHandler {
  const cache = new Map<string, Promise<Buffer>>();
  return async (req, res, next) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) return next();
      let pathname: string;
      try { pathname = decodeURIComponent(req.path); }
      catch { res.status(404).end(); return; }
      if (!/^\/[^/\\\u0000]+$/.test(pathname) || pathname.startsWith('/.')) {
        res.status(404).end(); return;
      }
      const name = pathname.slice(1);
      // Keep Vite's long-lived browser cache for fonts/images and identity
      // responses too; the downstream static-file guard still validates them.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const mime = MIME[path.extname(name).slice(1).toLowerCase()];
      if (!mime) return next();
      res.vary('Accept-Encoding');
      if (!req.acceptsEncodings('gzip')) return next();
      let pending = cache.get(name);
      if (!pending) {
        const file = path.join(root, name);
        const stat = await fs.stat(file).catch(() => null);
        if (!stat?.isFile()) return next();
        // Another request may have populated the cache while stat was pending.
        pending = cache.get(name);
        if (!pending) {
          pending = fs.readFile(file).then(raw => compress(raw));
          cache.set(name, pending);
          pending.catch(() => cache.delete(name));
        }
      }
      const compressed = await pending;
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', compressed.length);
      res.end(req.method === 'HEAD' ? undefined : compressed);
    } catch (error) { next(error); }
  };
}
