import type { Request, Response, NextFunction } from "express";
import axios from "axios";
import dotenv from "dotenv";
import { prisma } from "../database/connection.js";
import { redisClient } from "../services/redis.service.js";

dotenv.config();

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string; // Keycloak sub
        email: string;
        name: string;
        roles: string[];
        isAdmin: boolean;
      };
    }
  }
}

type IntrospectionResponse = {
  active: boolean;
  sub?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  exp?: number;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [type, token] = auth.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

async function introspectToken(token: string): Promise<IntrospectionResponse | null> {
  const keycloakUrl = requiredEnv("KEYCLOAK_URL");
  const realm = requiredEnv("KEYCLOAK_REALM");
  const clientId = requiredEnv("KEYCLOAK_CLIENT_ID");
  const clientSecret = requiredEnv("KEYCLOAK_CLIENT_SECRET");

  const url = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token/introspect`;

  const body = new URLSearchParams({
    token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const { data } = await axios.post<IntrospectionResponse>(url, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 8000,
  });

  if (!data?.active || !data.sub) return null;
  return data;
}

// ===========================================
// Authentication Middleware
// ===========================================
export async function keycloakMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authorization header missing or invalid" });
      return;
    }

    // Cache curto por token (evita bater no Keycloak/DB em toda requisição)
    const cacheKey = `auth:v1:${token}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { user: Express.Request["user"]; blocked?: boolean };

      if (parsed.blocked) {
        res.status(403).json({ error: "Conta desativada" });
        return;
      }

      req.user = parsed.user;
      next();
      return;
    }

    const decoded = await introspectToken(token);
    if (!decoded) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const clientId = process.env.KEYCLOAK_CLIENT_ID || "artifyme-app";
    const realmRoles = decoded.realm_access?.roles ?? [];
    const clientRoles = decoded.resource_access?.[clientId]?.roles ?? [];
    const allRoles = Array.from(new Set([...realmRoles, ...clientRoles]));

    const user = {
      id: decoded.sub!,
      email: decoded.email || "", // se vier vazio, user.routes pode falhar ao criar (aí precisa ajustar mappers/scopes)
      name: decoded.name || decoded.preferred_username || "",
      roles: allRoles,
      isAdmin: allRoles.includes("admin"),
    };

    // Bloqueio soft-delete no banco
    const dbUser = await prisma.user.findUnique({
      where: { keycloakId: user.id },
      select: { deletedAt: true },
    });

    const blocked = Boolean(dbUser?.deletedAt);

    // TTL bem curto (pra refletir disable rápido)
    const ttlSeconds = 60;
    await redisClient.set(cacheKey, JSON.stringify({ user, blocked }), "EX", ttlSeconds);

    if (blocked) {
      res.status(403).json({ error: "Conta desativada" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Auth error" });
  }
}

// ===========================================
// Admin Only Middleware
// ===========================================
export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// ===========================================
// Optional Authentication
// ===========================================
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getBearerToken(req);
    if (!token) return next();

    const decoded = await introspectToken(token);
    if (!decoded) return next();

    const clientId = process.env.KEYCLOAK_CLIENT_ID || "artifyme-app";
    const realmRoles = decoded.realm_access?.roles ?? [];
    const clientRoles = decoded.resource_access?.[clientId]?.roles ?? [];
    const allRoles = Array.from(new Set([...realmRoles, ...clientRoles]));

    req.user = {
      id: decoded.sub!,
      email: decoded.email || "",
      name: decoded.name || decoded.preferred_username || "",
      roles: allRoles,
      isAdmin: allRoles.includes("admin"),
    };

    next();
  } catch {
    
    next();
  }
}

export function keycloakMiddlewareWithRoles(options: { requiredRoles: string[] }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await keycloakMiddleware(req, res, next);
    if (req.user && !options.requiredRoles.some(role => req.user!.roles.includes(role))) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
  };
}
