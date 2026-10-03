import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, requireMinLevel } from '../middleware/auth';
import * as auth from '../services/auth.service';
import { ROLE_LEVEL } from '../types/auth';

const router = Router();

// Brute-force guard, scoped to credential attempts only — kept independent of
// the app-wide polling budget in index.ts so a busy dashboard tab can never
// eat into the quota that's actually protecting these endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { status: 429, message: 'Too many sign-in attempts — try again in a few minutes.' } },
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
  totp: z.string().optional(),
});

const registerSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function parse<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw ApiError.badRequest('Validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}

// POST /api/auth/register
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(registerSchema, req.body);
    const user = await auth.register(body);
    const tokens = auth.issueTokens(user);
    res.status(201).json({ data: { user: auth.toPublic(user), ...tokens } });
  }),
);

// POST /api/auth/login  (handles TOTP-enabled accounts)
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, password, totp } = parse(loginSchema, req.body);
    const user = await auth.validateCredentials(identifier, password);
    if (!user) throw new ApiError(401, 'Invalid username or password');

    if (user.totpEnabled) {
      if (!totp) {
        res.json({ data: { needsTotp: true } });
        return;
      }
      if (!auth.verifyTotp(user, totp)) throw new ApiError(401, 'Invalid 2FA code');
    }

    const tokens = auth.issueTokens(user);
    res.json({ data: { user: auth.toPublic(user), ...tokens } });
  }),
);

// POST /api/auth/refresh  (rotating refresh tokens)
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(1) }), req.body);
    const result = await auth.rotateRefresh(refreshToken);
    if (!result) throw new ApiError(401, 'Invalid or expired refresh token');
    res.json({ data: { user: auth.toPublic(result.user), ...result.tokens } });
  }),
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    if (body.refreshToken) auth.revokeRefresh(body.refreshToken);
    res.json({ data: { ok: true } });
  }),
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await auth.findById(req.user!.sub);
    if (!user) throw new ApiError(404, 'User not found');
    res.json({ data: auth.toPublic(user) });
  }),
);

// GET /api/auth/users — RBAC demo: admin only (level 7)
router.get(
  '/users',
  authenticate,
  requireMinLevel(ROLE_LEVEL.ADMIN),
  asyncHandler(async (_req, res) => {
    res.json({ data: await auth.listUsers() });
  }),
);

// ── TOTP 2FA ─────────────────────────────────────────────────────────────────
router.post(
  '/2fa/setup',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await auth.findById(req.user!.sub);
    if (!user) throw new ApiError(404, 'User not found');
    res.json({ data: await auth.setupTotp(user) });
  }),
);

router.post(
  '/2fa/enable',
  authenticate,
  asyncHandler(async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(6) }), req.body);
    const user = await auth.findById(req.user!.sub);
    if (!user) throw new ApiError(404, 'User not found');
    const ok = await auth.enableTotp(user, token);
    if (!ok) throw new ApiError(400, 'Invalid 2FA code — is your authenticator time synced?');
    res.json({ data: { totpEnabled: true } });
  }),
);

router.post(
  '/2fa/disable',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await auth.findById(req.user!.sub);
    if (!user) throw new ApiError(404, 'User not found');
    await auth.disableTotp(user);
    res.json({ data: { totpEnabled: false } });
  }),
);

export default router;
