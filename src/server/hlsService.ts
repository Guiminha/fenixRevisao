import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { storageKey } from "./security.js";

const TTL = 60 * 60 * 1000;
const JOB_BYTES = 256 * 1024 * 1024;
const CACHE_BYTES = 512 * 1024 * 1024;
const ROOT = path.resolve(process.env.HLS_CACHE_DIR || path.join(os.tmpdir(), "fenix-hls-v2"));
const jobs = new Map<string, Promise<string>>();
function directory(hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Identificador HLS inválido.");
  const target = path.resolve(ROOT, hash);
  if (path.dirname(target) !== ROOT) throw new Error("Diretório HLS inválido.");
  return target;
}
function size(dir: string) {
  return fs.readdirSync(dir).reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0);
}
function prune() {
  if (!fs.existsSync(ROOT)) return;
  const entries = fs.readdirSync(ROOT).filter(hash => /^[a-f0-9]{64}$/.test(hash) && !jobs.has(hash))
    .map(hash => ({ hash, dir: directory(hash), time: fs.statSync(directory(hash)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  let bytes = 0;
  for (const entry of entries) {
    bytes += size(entry.dir);
    if (Date.now() - entry.time > TTL || bytes > CACHE_BYTES - JOB_BYTES) {
      fs.rmSync(entry.dir, { recursive: true, force: true });
    }
  }
}
export function hlsObject(hash: string): string | null {
  try {
    const dir = directory(hash);
    const info = JSON.parse(fs.readFileSync(path.join(dir, "object.json"), "utf8"));
    return Date.now() - info.createdAt < TTL ? storageKey(info.key) : null;
  } catch { return null; }
}
export function hlsSegment(hash: string, segment: string): string | null {
  if (!/^seg_\d{3,6}\.ts$/.test(segment)) return null;
  try {
    const file = path.join(directory(hash), segment);
    return fs.existsSync(file) ? file : null;
  } catch { return null; }
}
export async function hlsPlaylist(key: string, streamUrl: string, internalToken: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const dir = directory(hash);
  const playlist = path.join(dir, "index.m3u8");
  if (hlsObject(hash) === key && fs.existsSync(playlist)) return rewrite(fs.readFileSync(playlist, "utf8"), hash);
  const running = jobs.get(hash);
  if (running) return running;
  if (jobs.size >= 2) throw Object.assign(new Error("Processamento de vídeos ocupado."), { status: 429 });
  prune();
  const job = (async () => {
    fs.mkdirSync(dir, { recursive: true });
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", ["-nostdin", "-y", "-loglevel", "error",
          "-protocol_whitelist", "http,tcp,crypto", "-headers", `X-Internal-Ffmpeg: ${internalToken}\r\n`,
          "-i", streamUrl, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-hls_time", "4",
          "-hls_list_size", "0", "-hls_playlist_type", "vod", "-hls_segment_filename",
          path.join(dir, "seg_%03d.ts"), playlist], { windowsHide: true, stdio: "ignore" });
        let stopped = false;
        const stop = () => { stopped = true; proc.kill("SIGKILL"); };
        const deadline = setTimeout(stop, 5 * 60 * 1000);
        const quota = setInterval(() => {
          try { if (size(dir) > JOB_BYTES || fs.readdirSync(dir).length > 6000) stop(); }
          catch { stop(); }
        }, 1000);
        const clear = () => { clearTimeout(deadline); clearInterval(quota); };
        proc.once("error", error => { clear(); reject(error); });
        proc.once("close", code => { clear(); code === 0 && !stopped ? resolve() : reject(new Error("Não foi possível preparar este vídeo.")); });
      });
      const content = fs.readFileSync(playlist, "utf8");
      if (!content.includes("#EXT-X-ENDLIST") || size(dir) > JOB_BYTES) throw new Error("Playlist incompleta.");
      fs.writeFileSync(path.join(dir, "object.json"), JSON.stringify({ key, createdAt: Date.now() }));
      return rewrite(content, hash);
    } catch (error) {
      fs.rmSync(directory(hash), { recursive: true, force: true });
      throw error;
    }
  })();
  jobs.set(hash, job);
  try { return await job; } finally { jobs.delete(hash); }
}
function rewrite(content: string, hash: string): string {
  return content.replace(/seg_\d+\.ts/g, segment => `/api/storage/hls/segment/${hash}/${segment}`);
}
