// Pruebas de navegador (Playwright) contra el servidor de Cloudflare corriendo en la compu (wrangler dev).
// Uso: npm install && npx playwright install chromium && npm run navegador
// En GitHub Actions corren antes de publicar (.github/workflows/servidor.yml).
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:8787', trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1280, height: 800 },
    // para usar un Chrome ya instalado en vez del de Playwright: CHROME=/ruta/al/chrome
    ...(process.env.CHROME ? { launchOptions: { executablePath: process.env.CHROME } } : {}) },
  webServer: {
    command: 'npx wrangler dev --ip 127.0.0.1 --port 8787 --log-level warn',
    url: 'http://127.0.0.1:8787/api/salud',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
