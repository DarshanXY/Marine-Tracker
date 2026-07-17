import type { AuthPayload } from './auth';

// Augment Express Request with the authenticated user (set by `authenticate`).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export {};
