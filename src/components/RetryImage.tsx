import { useEffect, useRef, useState } from "react";
import { imageVariant } from "../utils/imageVariants";

// Falhas temporárias do Storage não devem deixar a imagem quebrada até o reload.
export default function RetryImage({ src, alt = "", className = "" }: { src: string; alt?: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const optimized = imageVariant(src, 960);
  const url = attempt && optimized.startsWith("/api/storage/preview/")
    ? `${optimized}${optimized.includes("?") ? "&" : "?"}retry=${attempt}` : optimized;
  return (
    <>
      <img key={attempt} src={url} alt={alt} loading="lazy" decoding="async" className={className}
        onLoad={() => setFailed(false)}
        onError={() => {
          if (attempt >= 2) { setFailed(true); return; }
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setAttempt(value => value + 1), (attempt + 1) * 1500);
        }} />
      {failed && <button type="button" className="m-4 rounded-lg border border-amber-300/40 px-4 py-2 text-sm text-amber-200" onClick={() => { setFailed(false); setAttempt(0); }}>Tentar carregar imagem novamente</button>}
    </>
  );
}
