export interface UploadProgressEvent {
  percent: number;
  loaded: number;
  total: number;
}

export function uploadFileWithProgress(
  file: File,
  folder: string,
  headers: Record<string, string>,
  onProgress?: (event: UploadProgressEvent) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress({
            percent,
            loaded: e.loaded,
            total: e.total
          });
        }
      };
    }

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(response);
        } else {
          resolve(response); // Handle grace responses with error/warning message
        }
      } catch {
        reject(new Error(`Erro ao processar resposta do servidor (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Erro de rede durante o upload do arquivo."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Tempo limite de conexão excedido no upload."));
    };

    xhr.open("POST", "/api/minio/upload");
    xhr.timeout = 0; // Tempo de upload ilimitado para arquivos grandes de qualquer tamanho
    
    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
      if (value) {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.send(formData);
  });
}

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
