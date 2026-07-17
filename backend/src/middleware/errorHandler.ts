/**
 * Central error handling: a typed ApiError, an async wrapper that forwards
 * rejected promises to Express, a 404 handler, and the final error handler.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../lib/logger';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static badRequest(message = 'Bad request', details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }
}

/** Wrap an async route handler so thrown/rejected errors reach errorHandler. */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { status: 404, message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof ApiError ? err.status : 500;
  const message =
    err instanceof Error ? err.message : 'Internal server error';

  if (status >= 500) {
    logger.error(`${status} ${message}`, err);
  }

  const body: { error: { status: number; message: string; details?: unknown } } = {
    error: { status, message },
  };
  if (err instanceof ApiError && err.details !== undefined) {
    body.error.details = err.details;
  }
  res.status(status).json(body);
};
