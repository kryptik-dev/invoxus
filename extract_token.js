const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const SESAME_URL = 'https://app.sesame.com';
const TOKEN_FILE = 'token.txt';
const MAYA_SELECTOR = 'div[data-testid="maya-button"]';
const LOOP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function extractToken() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-fake-ui-for-media-stream'
    ]
  });

  console.log('Chrome is open');

  const page = await browser.newPage();

  // Grant mic permissions
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(SESAME_URL, ['microphone']);

  let tokenFound = null;

  // Attach CDP session and listen for WebSocket creation
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');
  client.on('Network.webSocketCreated', ({ url }) => {
    if (url.includes('id_token=')) {
      console.log('WebSocket URL:', url); // Debug log
      const match = url.match(/id_token=([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/);
      if (match && match[1]) {
        tokenFound = match[1];
      }
    }
  });

  try {
    await page.goto(SESAME_URL, { waitUntil: 'networkidle2' });

    // Wait for Maya button and click it
    await page.waitForSelector(MAYA_SELECTOR, { timeout: 15000 });
    await page.click(MAYA_SELECTOR);

    // Wait for token to be found (timeout after 30s)
    const start = Date.now();
    while (!tokenFound && Date.now() - start < 30000) {
      await new Promise(res => setTimeout(res, 500));
    }

    if (tokenFound) {
      await fs.writeFile(TOKEN_FILE, tokenFound, 'utf8');
      console.log('id_token extracted and saved.');
    } else {
      console.log('id_token not found.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

(async function mainLoop() {
  while (true) {
    await extractToken();
    await new Promise(res => setTimeout(res, LOOP_INTERVAL_MS));
  }
})();