import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../errors.js";
import type { AuthServiceContract, RoleCode } from "./types.js";

export function requireAuthentication(authService: AuthServiceContract): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const authorization = request.get("authorization");
      const match = authorization?.match(/^Bearer\s+(.+)$/i);
      if (!match?.[1]) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
      }
      request.auth = await authService.authenticateAccessToken(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...allowedRoles: RoleCode[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }
    if (!request.auth.roles.some((role) => allowedRoles.includes(role))) {
      next(new AppError(403, "INSUFFICIENT_ROLE", "You do not have permission for this action."));
      return;
    }
    next();
  };
}

