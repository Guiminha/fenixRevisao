import { Request, Response, NextFunction } from "express";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message: string; // Error message when limit exceeded
  keyGenerator?: (req: Request) => string;
}

interface ClientRecord {
  hits: number[];
}

/**
 * Creates an in-memory sliding-window rate limiter middleware.
 * Automatically cleans up stale IP entries to avoid memory leaks.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, max, message, keyGenerator } = config;
  const hitsMap = new Map<string, ClientRecord>();

  // Periodically clean up expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hitsMap.entries()) {
      record.hits = record.hits.filter((timestamp) => now - timestamp < windowMs);
      if (record.hits.length === 0) {
        hitsMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction) => {
    // Determine client identifier using the socket/express-derived IP only.
    // req.ip respects the configured "trust proxy" setting in server.ts; the raw
    // X-Forwarded-For header is NOT used to prevent spoofing.
    let clientKey = "";
    if (keyGenerator) {
      clientKey = keyGenerator(req);
    } else {
      clientKey = req.ip || req.socket.remoteAddress || "127.0.0.1";
    }

    const now = Date.now();
    let record = hitsMap.get(clientKey);

    if (!record) {
      record = { hits: [] };
      hitsMap.set(clientKey, record);
    }

    // Filter out hits older than windowMs
    record.hits = record.hits.filter((timestamp) => now - timestamp < windowMs);

    // Set standard RateLimit headers
    const currentHits = record.hits.length;
    const remaining = Math.max(0, max - currentHits - 1);
    const resetTime = Math.ceil((now + windowMs) / 1000);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetTime);

    if (currentHits >= max) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - record.hits[0])) / 1000);
      res.setHeader("Retry-After", Math.max(1, retryAfterSeconds));
      return res.status(429).json({
        error: message,
        retryAfterSeconds: Math.max(1, retryAfterSeconds)
      });
    }

    // Record this hit
    record.hits.push(now);
    next();
  };
}

export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

// Chave de rate limit SEMPRE por IP. Dados do corpo/nome de usuário nunca entram
// na chave (campo manipulável por atacante permitia zerar o contador por request).
function getUserOrIpKey(req: Request): string {
  return `ip:${getClientIp(req)}`;
}

// Pre-configured rate limiters for different application endpoints

// 1. Strict Auth / Login Limiter: 10 attempts per 15 minutes by IP
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 mins
  message: "Muitas tentativas de login a partir deste endereço IP. Por favor, aguarde 15 minutos antes de tentar novamente."
});

// 2. Contact / Ouvidoria Form Submission Limiter: 5 submissions per 10 minutes by IP
export const ouvidoriaRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Limite de envio de mensagens atingido. Por favor, aguarde 10 minutos para enviar outra mensagem."
});

// 3. File Upload Limiter: 20 uploads per 15 minutes by User/IP
export const uploadRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Limite de upload de arquivos excedido. Aguarde alguns minutos antes de realizar novos envios.",
  keyGenerator: getUserOrIpKey
});

// 4. Social Posts Limiter: 10 posts per 15 minutes by User/IP
export const fenixSocialPostRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Você está criando publicações muito rapidamente. Por favor, aguarde alguns minutos.",
  keyGenerator: getUserOrIpKey
});

// 5. Social Comments & Likes Limiter: 30 interactions per 5 minutes by User/IP
export const fenixSocialInteractionRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "Muitas interações em curto período. Por favor, diminua a frequência.",
  keyGenerator: getUserOrIpKey
});

// 6. Global API Rate Limiter: 150 requests per minute by IP
export const globalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 150,
  message: "Muitas requisições enviadas ao servidor. Por favor, diminua a velocidade."
});

// 7. Vimeo Info Limiter: 60 consultas de vídeo por 15 minutos por IP
export const vimeoInfoRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Muitas consultas de vídeo em pouco tempo. Por favor, aguarde alguns minutos."
});

// 8. Moderação do Fênix Social: 30 ações por 15 minutos por IP (protege o
// brute-force do x-moderator-token — a entropia do token + este limite dificultam
// a enumeração mesmo para atacantes com botnet de IPs).
export const fenixModeracaoRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Muitas tentativas de moderação. Por favor, aguarde alguns minutos."
});

// 9. Troca de senha do suporte / reset pelo admin: 8 tentativas por 15 min.
export const passwordChangeRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Muitas tentativas de alterar a senha. Por favor, aguarde 15 minutos antes de tentar novamente.",
  keyGenerator: getUserOrIpKey
});
