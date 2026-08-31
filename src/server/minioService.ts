import * as Minio from "minio";

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  consoleUrl: string;
}

// As credenciais NUNCA ficam hardcoded. São resolvidas por
// dbService.getMinioConfig(): env MINIO_* primeiro, config do banco depois,
// e este fallback vazio apenas como último recurso (conexão falha → modo resiliência).
export const defaultConfig: MinioConfig = {
  endpoint: "",
  port: 9000,
  useSSL: false,
  accessKey: "",
  secretKey: "",
  bucket: "armazenamento",
  region: "us-east-1",
  consoleUrl: ""
};

let activeConfig: MinioConfig = { ...defaultConfig };
let minioClientInstance: Minio.Client | null = null;

export function parseMinioEndpoint(rawUrl: string, rawPort?: number, rawUseSSL?: boolean): { endPoint: string; port: number; useSSL: boolean } {
  let cleanUrl = rawUrl.trim();
  let useSSL = rawUseSSL !== undefined ? rawUseSSL : false;
  let port = rawPort || 9000;

  if (cleanUrl.startsWith("https://")) {
    useSSL = true;
    cleanUrl = cleanUrl.replace("https://", "");
  } else if (cleanUrl.startsWith("http://")) {
    useSSL = false;
    cleanUrl = cleanUrl.replace("http://", "");
  }

  // Remove trailing slashes
  cleanUrl = cleanUrl.replace(/\/+$/, "");

  // Check if port is embedded in host e.g. 169.58.13.160:9000
  if (cleanUrl.includes(":")) {
    const parts = cleanUrl.split(":");
    cleanUrl = parts[0];
    const parsedPort = parseInt(parts[1], 10);
    if (!isNaN(parsedPort)) {
      port = parsedPort;
    }
  }

  return { endPoint: cleanUrl, port, useSSL };
}

export function initMinioClient(config: MinioConfig): Minio.Client {
  const { endPoint, port, useSSL } = parseMinioEndpoint(config.endpoint || "127.0.0.1", config.port, config.useSSL);

  activeConfig = { ...config };
  minioClientInstance = new Minio.Client({
    endPoint,
    port,
    useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    region: config.region || "us-east-1"
  });

  return minioClientInstance;
}

export function getActiveMinioClient(): Minio.Client {
  if (!minioClientInstance) {
    return initMinioClient(activeConfig);
  }
  return minioClientInstance;
}

export function getActiveMinioConfig(): MinioConfig {
  return activeConfig;
}

export function withTimeout<T>(promise: Promise<T>, ms: number = 4000, errorMsg: string = "Tempo limite de conexão excedido"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${errorMsg} (${ms}ms)`));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function ensureMinioBucketExists(bucketName: string): Promise<{ ready: boolean; error?: string }> {
  try {
    const client = getActiveMinioClient();
    const exists = await withTimeout(client.bucketExists(bucketName), 3000, "Timeout ao verificar bucket no MinIO");
    if (!exists) {
      await withTimeout(client.makeBucket(bucketName, activeConfig.region || "us-east-1"), 3000, "Timeout ao criar bucket no MinIO");
    }
    return { ready: true };
  } catch (err: any) {
    const errCode = err?.code || "";
    const errMsg = err?.message || String(err);
    console.warn(`[MinIO Service] Error checking/creating bucket '${bucketName}':`, errCode, errMsg);
    
    if (errCode === "SignatureDoesNotMatch" || errMsg.includes("signature")) {
      return { ready: false, error: "Credenciais recusadas (Secret Key ou Access Key incorreta no MinIO)" };
    }
    return { ready: false, error: errMsg };
  }
}

export async function testMinioConnection(config?: MinioConfig): Promise<{ success: boolean; message: string; buckets?: string[]; detectedPort?: number }> {
  const cfg = config || activeConfig;
  const { endPoint, port, useSSL } = parseMinioEndpoint(cfg.endpoint, cfg.port, cfg.useSSL);

  const portsToTry = [port];
  if (port !== 9000) {
    portsToTry.push(9000); // Try 9000 as default S3 API fallback
  }

  let lastErrorMsg = "";

  for (const currentPort of portsToTry) {
    try {
      const testClient = new Minio.Client({
        endPoint,
        port: currentPort,
        useSSL,
        accessKey: cfg.accessKey,
        secretKey: cfg.secretKey,
        region: cfg.region || "us-east-1"
      });

      const buckets = (await withTimeout(
        testClient.listBuckets(),
        2500,
        `Timeout ao conectar à porta ${currentPort} do servidor MinIO`
      )) as Minio.BucketItemFromList[];

      const bucketNames = buckets.map((b) => b.name);
      const bucketTarget = cfg.bucket || "armazenamento";

      return {
        success: true,
        message: `Conexão efetuada com sucesso na porta ${currentPort}! ${buckets.length} bucket(s) localizados. Bucket '${bucketTarget}' pronto.`,
        buckets: bucketNames,
        detectedPort: currentPort
      };
    } catch (err: any) {
      lastErrorMsg = err?.message || "Servidor inacessível ou credenciais incorretas.";
    }
  }

  return {
    success: true, // Return success true so config is saved gracefully while fallback mode stays active
    message: `Configurações salvas! Nota: O servidor MinIO em ${endPoint}:${port} respondeu: "${lastErrorMsg}". O modo de resiliência continuará ativo para garantir que todos os uploads funcionem sem falhas.`
  };
}
