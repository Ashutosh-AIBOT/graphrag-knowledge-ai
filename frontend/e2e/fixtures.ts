/**
 * Playwright fixtures for the GraphRAG E2E suite.
 *
 * Design notes (determinism-first, per the test-automation contract):
 *  - We authenticate through the API, not the UI, because the live register
 *    form is currently broken (KNOWN GAP #1: backend requires `confirm_password`,
 *    frontend omits it). Seeding a session via the API keeps the journey tests
 *    (dashboard/explore/compare/communities/documents) independent of that bug.
 *  - The app persists auth in zustand under localStorage key `graphrag-auth`.
 *    We inject that shape before the app boots via `addInitScript` so every
 *    navigation rehydrates as an authenticated user. No hard sleeps anywhere.
 */
import { test as base } from '@playwright/test';
import axios from 'axios';

export const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api';

export interface AuthUser {
  username: string;
  email: string;
  password: string;
  access: string;
  refresh: string;
}

/**
 * Register a unique user directly against the backend.
 * Backend `RegisterSerializer` REQUIRES `confirm_password` (and rejects 400
 * when it is missing) — so we MUST send it here, which is precisely the field
 * the UI register form forgets to include.
 */
export async function registerViaApi(suffix: string): Promise<AuthUser> {
  const password = 'E2ePassw0rd!9';
  const username = `e2e_${suffix}`;
  const email = `e2e_${suffix}@test.local`;

  try {
    await axios.post(
      `${API_BASE_URL}/auth/register/`,
      { username, email, password, confirm_password: password },
      { timeout: 20000 },
    );
  } catch (err: any) {
    // 400 "user already exists" is acceptable on repeat runs; ignore it and
    // just log in below. Any other error bubbles up from the login call.
    if (err?.response?.status !== 400) {
      // eslint-disable-next-line no-console
      console.warn('[fixtures] register returned', err?.response?.status, err?.message);
    }
  }

  const { data } = await axios.post(
    `${API_BASE_URL}/auth/login/`,
    { username, password },
    { timeout: 20000 },
  );
  return { username, email, password, access: data.access, refresh: data.refresh };
}

/**
 * Inject the persisted zustand auth state into localStorage so the Next.js app
 * boots as an authenticated user. Must be called before `page.goto(...)`.
 */
export async function seedAuth(
  page: import('@playwright/test').Page,
  user: AuthUser,
): Promise<void> {
  await page.addInitScript(
    (token) => {
      localStorage.setItem(
        'graphrag-auth',
        JSON.stringify({
          state: {
            user: { id: 0, username: token.username, email: token.email },
            accessToken: token.access,
            refreshToken: token.refresh,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    },
    { username: user.username, email: user.email, access: user.access, refresh: user.refresh },
  );
}

/**
 * Worker-scoped pre-authenticated user, shared across the authenticated
 * journey tests in a single worker. Unique per worker so parallel runs never
 * collide on the same account.
 */
export const test = base.extend<{}, { apiUser: AuthUser }>({
  apiUser: [
    async ({}, use, workerInfo) => {
      const user = await registerViaApi(`${workerInfo.workerIndex}_${Date.now()}`);
      await use(user);
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
