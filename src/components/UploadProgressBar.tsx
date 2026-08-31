import React from "react";
import { UploadCloud, CheckCircle2, AlertCircle, FileVideo, FileImage, FileText, File } from "lucide-react";
import { formatBytes } from "../utils/uploadWithProgress";

export interface UploadProgressState {
  isUploading: boolean;
  progress: number;
  loaded: number;
  total: number;
  fileName: string;
  fileSize?: number;
  statusText?: string;
  isComplete?: boolean;
  isError?: boolean;
  errorMsg?: string;
  resultUrl?: string;
  storageType?: string;
}

interface UploadProgressBarProps {
  uploadState: UploadProgressState;
  onClose?: () => void;
  title?: string;
}

export const UploadProgressBar: React.FC<UploadProgressBarProps> = ({
  uploadState,
  onClose,
  title = "Progresso do Upload"
}) => {
  if (!uploadState.isUploading && !uploadState.isComplete && !uploadState.isError) {
    return null;
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (["mp4", "webm", "mov", "mkv", "avi"].includes(ext)) {
      return <FileVideo className="w-5 h-5 text-purple-400" />;
    }
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
      return <FileImage className="w-5 h-5 text-blue-400" />;
    }
    if (["pdf", "doc", "docx", "txt"].includes(ext)) {
      return <FileText className="w-5 h-5 text-amber-400" />;
    }
    return <File className="w-5 h-5 text-gray-400" />;
  };

  return (
    <div className="bg-[#0f141c] border border-white/10 rounded-2xl p-4 shadow-2xl space-y-3 animate-fade-in relative overflow-hidden backdrop-blur-md">
      {/* Glow Effect */}
      <div 
        className="absolute top-0 left-0 h-1 bg-gradient-to-r from-[#d12a62] via-purple-500 to-emerald-400 transition-all duration-300"
        style={{ width: `${uploadState.progress}%` }}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex-shrink-0">
            {getFileIcon(uploadState.fileName || "arquivo")}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white truncate max-w-xs font-display">
              {uploadState.fileName || title}
            </h4>
            <p className="text-[11px] text-[#8a96a3] flex items-center gap-1.5 mt-0.5">
              <span>{uploadState.statusText || (uploadState.isUploading ? "Enviando para o servidor MinIO..." : "Processando...")}</span>
            </p>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <span className="text-xs font-mono font-black text-white">
            {uploadState.progress}%
          </span>
          {uploadState.total > 0 && (
            <p className="text-[10px] text-gray-400 font-mono">
              {formatBytes(uploadState.loaded)} / {formatBytes(uploadState.total)}
            </p>
          )}
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full bg-black/50 rounded-full h-2.5 p-0.5 border border-white/5 relative overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 relative ${
            uploadState.isError
              ? "bg-red-500"
              : uploadState.isComplete
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-[#d12a62] to-purple-500"
          }`}
          style={{ width: `${Math.max(uploadState.progress, 2)}%` }}
        >
          {uploadState.isUploading && (
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
          )}
        </div>
      </div>

      {/* Status Footer */}
      <div className="flex items-center justify-between text-[11px] pt-1">
        {uploadState.isUploading && (
          <span className="text-amber-400 font-medium flex items-center gap-1.5 animate-pulse">
            <UploadCloud className="w-3.5 h-3.5" />
            Upload em andamento...
          </span>
        )}

        {uploadState.isComplete && (
          <span className="text-emerald-400 font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Upload Concluído com Sucesso! {uploadState.storageType === "minio" ? "(Bucket MinIO)" : "(Local Resiliente)"}
          </span>
        )}

        {uploadState.isError && (
          <span className="text-red-400 font-bold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {uploadState.errorMsg || "Erro no upload"}
          </span>
        )}

        {onClose && (uploadState.isComplete || uploadState.isError) && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-[10px] uppercase font-bold underline cursor-pointer ml-auto"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
};
