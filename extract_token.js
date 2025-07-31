// Try to import puppeteer, fallback to puppeteer-core
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('puppeteer-core');
}

const fs = require('fs').promises;
const os = require('os');

const SESAME_URL = 'https://app.sesame.com';
const TOKEN_FILE = 'token.txt';
const MAYA_SELECTOR = 'div[data-testid="maya-button"]';

// Determine Chrome executable path based on platform
function getChromePath() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows paths
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PUPPETEER_EXECUTABLE_PATH
    ].filter(Boolean);
    
    for (const path of possiblePaths) {
      try {
        if (require('fs').existsSync(path)) {
          return path;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    
    // If no Chrome found, return null to use default Puppeteer behavior
    return null;
  } else {
    // Linux/Docker paths
    return process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
  }
}

async function extractToken() {
  console.log('Starting token extraction...');
  const chromePath = getChromePath();
  console.log('Chrome path:', chromePath);
  
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--use-fake-ui-for-media-stream'
    ]
  };

  // Only add executablePath if Chrome is found
  if (chromePath) {
    launchOptions.executablePath = chromePath;
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    console.log('Chrome launched successfully');
  } catch (error) {
    console.error('Failed to launch Chrome:', error);
    return;
  }

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
      console.log('WebSocket URL found:', url.substring(0, 100) + '...');
      const match = url.match(/id_token=([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/);
      if (match && match[1]) {
        tokenFound = match[1];
        console.log('Token found:', tokenFound.substring(0, 20) + '...');
      }
    }
  });

  try {
    console.log('Navigating to Sesame...');
    await page.goto(SESAME_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Page loaded successfully');

    // Wait for Maya button and click it
    console.log('Waiting for Maya button...');
    await page.waitForSelector(MAYA_SELECTOR, { timeout: 15000 });
    await page.click(MAYA_SELECTOR);
    console.log('Maya button clicked');

    // Wait for token to be found (timeout after 30s)
    const start = Date.now();
    while (!tokenFound && Date.now() - start < 30000) {
      await new Promise(res => setTimeout(res, 500));
    }

    if (tokenFound) {
      await fs.writeFile(TOKEN_FILE, tokenFound, 'utf8');
      console.log('id_token extracted and saved to', TOKEN_FILE);
    } else {
      console.log('id_token not found within timeout period.');
    }
  } catch (err) {
    console.error('Error during token extraction:', err);
  } finally {
    try {
      await browser.close();
      console.log('Browser closed');
    } catch (closeError) {
      console.error('Error closing browser:', closeError);
    }
  }
  
  console.log('Token extraction completed');
}

// Run the extraction
extractToken().catch(error => {
  console.error('Fatal error in token extraction:', error);
  process.exit(1);
});