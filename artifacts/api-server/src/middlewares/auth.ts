import type { NextFunction, Request, Response } from "express";
import {
  getBearerToken,
  getPrincipalFromToken,
  hasPermission,
  type AuthPrincipal,
} from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
    }
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    req.auth = await getPrincipalFromToken(
      getBearerToken(req.headers.authorization),
    ) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!hasPermission(req.auth, permission)) {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    next();
  };
}

export function requireAnyPermission(permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!permissions.some((permission) => hasPermission(req.auth!, permission))) {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    next();
  };
}