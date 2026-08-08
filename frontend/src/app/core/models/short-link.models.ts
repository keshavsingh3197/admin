export interface ShortLink {
  id?: string;
  code: string;
  targetUrl: string;
  clicks: number;
  createdAt: string;
  lastAccessedAt?: string | null;
  expiresAt?: string | null;
}

export interface CreateShortLinkRequest {
  targetUrl: string;
  code?: string | null;
  expiresAt?: string | null;
}

export interface UpdateShortLinkRequest {
  targetUrl: string;
  expiresAt?: string | null;
}
