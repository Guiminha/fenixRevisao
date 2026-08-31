import React, { useEffect, useRef, useState } from "react";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  RotateCcw, 
  RotateCw, 
  Settings,
  Tv
} from "lucide-react";

interface CustomVideoPlayerProps {
  src: string; // HLS playlist URL (.m3u8) or standard MP4/WebM stream URL
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  className?: string;
}

export default function CustomVideoPlayer({ src, poster, title, autoPlay = false, className = "" }: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize HLS.js or Native Video (hls.js carregado dinamicamente — só baixa quando há vídeo)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: any = null;
    let cancelled = false;

    const setup = async () => {
      if (src.includes(".m3u8")) {
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({
            autoStartLoad: true,
            capLevelToPlayerSize: true,
            enableWorker: true
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (autoPlay) {
              video.play().catch(() => {});
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
          if (autoPlay) video.play().catch(() => {});
        }
      } else {
        video.src = src;
        if (autoPlay) video.play().catch(() => {});
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (hls) {
        hls.destroy();
      }
    };
  }, [src, autoPlay]);

  // Video Event Handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
      if (video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
            setBufferedEnd(video.buffered.end(i));
            break;
          }
        }
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleDurationChange = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("durationchange", handleDurationChange);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("durationchange", handleDurationChange);
    };
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
        videoRef.current.muted = true;
      } else {
        setIsMuted(false);
        videoRef.current.muted = false;
      }
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
      videoRef.current.volume = volume || 1;
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const changePlaybackSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  const skipSeconds = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSpeedMenu(false);
      }
    }, 3500);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h > 0) {
      return `${h}:${remM < 10 ? "0" : ""}${remM}:${s < 10 ? "0" : ""}${s}`;
    }
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      ref={playerContainerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={`relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl group border border-white/10 ${className}`}
    >
      <video
        ref={videoRef}
        poster={poster}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
        draggable={false}
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Top Overlay Title */}
      {title && (
        <div
          className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 pointer-events-none z-10 flex items-center gap-2 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <Tv className="w-4 h-4 text-[#d12a62]" />
          <span className="text-xs font-bold text-white tracking-wide truncate">{title}</span>
        </div>
      )}

      {/* Center Big Play/Pause Button when paused */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#d12a62]/90 hover:bg-[#d12a62] text-white flex items-center justify-center shadow-2xl backdrop-blur-md transform transition hover:scale-110 z-20 cursor-pointer"
        >
          <Play className="w-8 h-8 fill-current ml-1" />
        </button>
      )}

      {/* Bottom Controls Bar (YouTube/Netflix Style) */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 z-20 ${
          showControls || !isPlaying ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress Bar (Buffer + Current Position) */}
        <div className="relative w-full h-2 mb-3 bg-white/20 rounded-full group/bar cursor-pointer flex items-center">
          {/* Buffer Bar (Light Gray) */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-white/40 rounded-full transition-all"
            style={{ width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%` }}
          />

          {/* Played Progress Bar (YouTube/Fenix Red) */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-[#d12a62] rounded-full"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          >
            {/* Red Draggable Pin */}
            <div className="absolute -right-2 -top-1 w-4 h-4 bg-[#d12a62] rounded-full border-2 border-white shadow-md transform scale-0 group-hover/bar:scale-100 transition-transform" />
          </div>

          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Controls Layout */}
        <div className="flex items-center justify-between text-white text-xs gap-3">
          {/* Left Controls: Play/Pause, Rewind/FastForward, Volume, Time */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-1.5 hover:text-[#d12a62] transition-colors rounded-lg hover:bg-white/10"
              title={isPlaying ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              onClick={() => skipSeconds(-10)}
              className="hidden sm:block p-1.5 hover:text-[#d12a62] transition-colors rounded-lg hover:bg-white/10"
              title="Voltar 10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => skipSeconds(10)}
              className="hidden sm:block p-1.5 hover:text-[#d12a62] transition-colors rounded-lg hover:bg-white/10"
              title="Avançar 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={toggleMute}
                className="p-1.5 hover:text-[#d12a62] transition-colors rounded-lg hover:bg-white/10"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/30 accent-[#d12a62] rounded-lg cursor-pointer"
              />
            </div>

            {/* Time Indicator */}
            <div className="font-mono text-[11px] text-gray-300 ml-1">
              <span>{formatTime(currentTime)}</span>
              <span className="text-gray-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Playback Speed Selector, Fullscreen */}
          <div className="flex items-center gap-2 relative">
            {/* Speed selector menu */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold font-mono transition-colors flex items-center gap-1"
                title="Velocidade de Reprodução"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{playbackRate}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-9 right-0 bg-[#0d121a] border border-white/15 rounded-xl shadow-2xl p-1.5 w-28 flex flex-col gap-1 z-30 animate-fade-in">
                  <span className="text-[10px] uppercase font-mono text-gray-400 px-2 py-1 font-bold border-b border-white/10">
                    Velocidade
                  </span>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changePlaybackSpeed(rate)}
                      className={`text-left px-2 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                        playbackRate === rate ? "bg-[#d12a62] text-white" : "text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      {rate === 1 ? "1x (Normal)" : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:text-[#d12a62] transition-colors rounded-lg hover:bg-white/10"
              title="Tela Cheia"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
