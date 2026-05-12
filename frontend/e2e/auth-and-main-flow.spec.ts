import { test, expect, type Page } from '@playwright/test';

const COG_USER = process.env.COGuser;
const COG_PW = process.env.COGpw;
const FRONTEND_URL = process.env.FRONTEND_URL!;
const API_GATEWAY_URL = process.env.API_GATEWAY_URL!;

test.beforeAll(() => {
  if (!COG_USER || !COG_PW) {
    throw new Error('COGuser / COGpw environment variables are required');
  }
});

async function signInWithCognito(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.waitForURL(/amazoncognito\.com\/(login|oauth2\/authorize)/, { timeout: 30_000 });

  const usernameInput = page.locator('input[name="username"]:visible').first();
  const passwordInput = page.locator('input[name="password"]:visible').first();

  await usernameInput.waitFor({ state: 'visible', timeout: 20_000 });
  await usernameInput.fill(COG_USER!);
  await passwordInput.fill(COG_PW!);

  const submitButton = page.locator(
    'input[type="submit"]:visible, button[type="submit"]:visible',
  ).first();
  await submitButton.click();

  await page.waitForURL(new RegExp(`^${FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(callback|$)`), {
    timeout: 30_000,
  });

  await page.waitForFunction(() => !!localStorage.getItem('id_token'), { timeout: 20_000 });
}

test.describe('NoEatToStop frontend E2E - login → API → main screens', () => {
  test('full golden path: cognito login, dashboard, API calls, navigate all main screens', async ({ page }) => {
    const apiCalls: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      const url = res.url();
      if (url.startsWith(API_GATEWAY_URL)) {
        apiCalls.push({ url, status: res.status() });
      }
    });

    await signInWithCognito(page);

    await expect(page).toHaveURL(new RegExp(`^${FRONTEND_URL}/?$`), { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    await expect(page.getByTestId('session-status')).toBeVisible();
    await expect(page.getByTestId('stop-count')).toBeVisible();
    await expect(page.getByTestId('confidence')).toBeVisible();

    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const routes: { path: string; expectText: RegExp }[] = [
      { path: '/meal-history', expectText: /食事/ },
      { path: '/chewing-states', expectText: /咀嚼/ },
      { path: '/evidence', expectText: /エビデンス/ },
      { path: '/settings', expectText: /設定/ },
      { path: '/emergency', expectText: /緊急|制御/ },
      { path: '/tv-control', expectText: /TV|テレビ/ },
      { path: '/error-analysis', expectText: /エラー|分析/ },
    ];

    for (const route of routes) {
      await test.step(`navigate to ${route.path}`, async () => {
        await page.goto(route.path);
        await expect(page.locator('body')).toContainText(route.expectText, { timeout: 15_000 });
      });
    }

    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    expect(apiCalls.length, 'at least one API Gateway call must have been made').toBeGreaterThan(0);
    const non2xx = apiCalls.filter((c) => c.status >= 400 && c.status !== 404);
    expect(
      non2xx,
      `unexpected API errors: ${JSON.stringify(non2xx, null, 2)}`,
    ).toEqual([]);

    console.log(`Total API calls: ${apiCalls.length}`);
    console.log(`Sample: ${JSON.stringify(apiCalls.slice(0, 5), null, 2)}`);
  });
});
