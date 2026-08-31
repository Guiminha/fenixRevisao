import { Vimeo } from "vimeo";

export interface VimeoVideoItem {
  id: string;
  uri: string;
  title: string;
  description: string;
  durationSeconds: number;
  durationFormatted: string;
  thumbnail: string;
  embedUrl: string;
  link: string;
  hash?: string;
  privacy: {
    view?: string;
    embed?: string;
    download?: boolean;
  };
  createdTime?: string;
}

export function createVimeoSDKClient(clientId?: string, clientSecret?: string, accessToken?: string) {
  if (!clientId || !clientSecret || !accessToken) {
    return null;
  }
  return new Vimeo(clientId, clientSecret, accessToken);
}

export function vimeoRequest(client: InstanceType<typeof Vimeo>, options: { method: string; path: string; query?: any }): Promise<any> {
  return new Promise((resolve, reject) => {
    client.request(options, (error: any, body: any, statusCode: number) => {
      if (error) return reject(error);
      if (statusCode >= 400) {
        const errorMsg = body?.error || body?.developer_message || `Erro API Vimeo (${statusCode})`;
        return reject(new Error(errorMsg));
      }
      resolve(body);
    });
  });
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function constructProtectedEmbedUrl(videoId: string, hash?: string): string {
  const hQuery = hash ? `h=${hash}&` : "";
  // Anti-redirect & clean embed parameters for Vimeo Player
  return `https://player.vimeo.com/video/${videoId}?${hQuery}title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479&transparent=0&dnt=1`;
}

export function extractVimeoHash(url: string): string {
  if (!url) return "";
  const match = url.match(/[?&]h=([0-9a-f]+)/i);
  return match ? match[1] : "";
}

export async function getVimeoAccountDetails(clientId: string, clientSecret: string, accessToken: string) {
  const client = createVimeoSDKClient(clientId, clientSecret, accessToken);
  if (!client) {
    throw new Error("Credenciais do Vimeo incompletas.");
  }

  const accountInfo: any = await vimeoRequest(client, {
    method: "GET",
    path: "/me"
  });

  return {
    name: accountInfo.name || "Conta Vimeo",
    link: accountInfo.link || "",
    accountType: accountInfo.account || "Standard",
    avatar: accountInfo.pictures?.sizes?.[0]?.link || "",
    bio: accountInfo.bio || ""
  };
}

export async function fetchMyVimeoVideos(
  clientId: string,
  clientSecret: string,
  accessToken: string,
  page: number = 1,
  perPage: number = 25,
  searchQuery: string = ""
): Promise<{ videos: VimeoVideoItem[]; total: number; page: number; perPage: number }> {
  const client = createVimeoSDKClient(clientId, clientSecret, accessToken);
  if (!client) {
    throw new Error("Credenciais do Vimeo não configuradas. Insira o Client ID, Client Secret e Access Token.");
  }

  const queryParams: any = {
    page,
    per_page: perPage,
    fields: "uri,name,description,duration,pictures,player_embed_url,privacy,link,created_time"
  };

  if (searchQuery && searchQuery.trim().length > 0) {
    queryParams.query = searchQuery.trim();
  }

  const data: any = await vimeoRequest(client, {
    method: "GET",
    path: "/me/videos",
    query: queryParams
  });

  const total = data.total || 0;
  const rawList = data.data || [];

  const videos: VimeoVideoItem[] = rawList.map((item: any) => {
    const uriParts = (item.uri || "").split("/");
    const videoId = uriParts[uriParts.length - 1] || "";
    
    // Extract thumbnail
    const pictures = item.pictures?.sizes || [];
    const thumbnail = pictures.length > 0 ? pictures[pictures.length - 1].link : "";

    // Extract the private hash from the player embed URL or the video link
    const hash = extractVimeoHash(item.player_embed_url || item.link || "");

    return {
      id: videoId,
      uri: item.uri || "",
      title: item.name || "Sem título",
      description: item.description || "",
      durationSeconds: item.duration || 0,
      durationFormatted: formatDuration(item.duration || 0),
      thumbnail,
      embedUrl: constructProtectedEmbedUrl(videoId, hash),
      link: item.link || "",
      hash: hash || undefined,
      privacy: {
        view: item.privacy?.view || "public",
        embed: item.privacy?.embed || "public",
        download: item.privacy?.download || false
      },
      createdTime: item.created_time || ""
    };
  });

  return { videos, total, page, perPage };
}
