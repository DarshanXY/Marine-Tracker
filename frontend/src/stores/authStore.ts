/**
 * Authentication store (zustand + localStorage).
 *
 * Logs in against the backend `/api/auth/*` endpoints and stores the real JWT
 * pair. If the backend is unreachable it falls back to an offline demo session
 * (matching the seeded users, password Demo@1234!) so the routed app still
 * works with no server. Tokens are mirrored into `authToken` for the API client.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, UserRole } from '@/types';
import { ROLE_LEVEL } from '@/types';
import { api, OFFLINE } from '@/lib/api';
import { authToken } from '@/lib/authToken';

interface DemoAccount {
  username: string;
  email: string;
  role: UserRole;
  displayName: string;
}

export const DEMO_PASSWORD = 'Demo@1234!';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'admin',         email: 'admin@marine-tracker.local',      role: 'ADMIN',      displayName: 'System Administrator' },
  { username: 'cg_officer',    email: 'coastguard@marine-tracker.local', role: 'COASTGUARD', displayName: 'Coast Guard Command' },
  { username: 'field_analyst', email: 'field@marine-tracker.local',      role: 'FIELD',      displayName: 'Field Analyst' },
];

function findAccount(identifier: string): DemoAccount | undefined {
  const id = identifier.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.username.toLowerCase() === id || a.email.toLowerCase() === id);
}

function toAuthUser(a: DemoAccount): AuthUser {
  return {
    id: `usr_${a.role.toLowerCase()}`,
    username: a.username,
    email: a.email,
    role: a.role,
    level: ROLE_LEVEL[a.role],
    displayName: a.displayName,
    totpEnabled: false,
  };
}

export interface LoginResult {
  ok: boolean;
  needsTotp?: boolean;
  error?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (identifier: string, password: string, totp?: string) => Promise<LoginResult>;
  loginAs: (role: UserRole) => Promise<LoginResult>;
  register: (username: string, email: string, password: string) => Promise<LoginResult>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (identifier, password, totp) => {
        try {
          const payload = await api.authLogin(identifier, password, totp);
          if (payload.needsTotp) return { ok: false, needsTotp: true };
          if (payload.user && payload.accessToken) {
            set({
              user: payload.user,
              accessToken: payload.accessToken,
              refreshToken: payload.refreshToken ?? null,
              isAuthenticated: true,
            });
            return { ok: true };
          }
          return { ok: false, error: 'Unexpected server response' };
        } catch (err) {
          const msg = (err as Error).message;
          if (msg === OFFLINE) {
            // Offline demo fallback
            const account = findAccount(identifier);
            if (!account) return { ok: false, error: 'Backend offline — try a demo user like "cg_officer".' };
            if (password !== DEMO_PASSWORD) return { ok: false, error: 'Incorrect password. Demo password is Demo@1234!' };
            set({ user: toAuthUser(account), accessToken: null, refreshToken: null, isAuthenticated: true });
            return { ok: true };
          }
          return { ok: false, error: msg };
        }
      },

      loginAs: async (role) => {
        const account = DEMO_ACCOUNTS.find((a) => a.role === role) ?? DEMO_ACCOUNTS[2];
        return get().login(account.username, DEMO_PASSWORD);
      },

      register: async (username, email, password) => {
        try {
          const payload = await api.authRegister(username, email, password);
          if (payload.user && payload.accessToken) {
            set({
              user: payload.user,
              accessToken: payload.accessToken,
              refreshToken: payload.refreshToken ?? null,
              isAuthenticated: true,
            });
            return { ok: true };
          }
          return { ok: false, error: 'Unexpected server response' };
        } catch (err) {
          const msg = (err as Error).message;
          if (msg === OFFLINE) {
            return { ok: false, error: 'Backend offline — sign-up needs the API running on :3001.' };
          }
          return { ok: false, error: msg };
        }
      },

      refreshUser: async () => {
        const current = get().user;
        if (!current || !get().accessToken) return; // offline demo session — nothing to refresh
        const fresh = await api.authMe();
        if (fresh) set({ user: fresh });
      },

      logout: async () => {
        await api.authLogout(get().refreshToken);
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'mpt-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);

// Keep the API client's token in sync with the store (incl. after rehydrate).
authToken.set(useAuthStore.getState().accessToken, useAuthStore.getState().refreshToken);
useAuthStore.subscribe((s) => authToken.set(s.accessToken, s.refreshToken));
