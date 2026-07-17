/**
 * Auth + RBAC middleware.
 *   authenticate      — require a valid Bearer access token (sets req.user)
 *   requireMinLevel   — require a minimum clearance level
 *   requireRole       — require one of the listed roles
 */
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env';
import { ApiError } from './errorHandler';
import type { AuthPayload, Role } from '../types/auth';

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'));
  }
  try {
    req.user = jwt.verify(header.slice(7), env.auth.jwtSecret) as AuthPayload;
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired access token'));
  }
};

export const requireMinLevel =
  (level: number): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (req.user.level < level) {
      return next(new ApiError(403, `Requires clearance level ≥ ${level}`));
    }
    next();
  };

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, `Requires role: ${roles.join(', ')}`));
    }
    next();
  };
