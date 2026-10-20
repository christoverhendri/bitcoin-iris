import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://127.0.0.1:3000';
const OUTPUT_DIR = path.resolve('public', 'screenshots');

const ALL_TABS = [
  { slug: 'overview', name: '01_Overview', url: '/overview' },
  { slug: 'quant-seasonality', name: '02_Quant_Seasonality', url: '/quant/seasonality' },
  { slug: 'quant-cycle', name: '03_Quant_Halving_Cycle', url: '/quant/cycle' },
  { slug: 'quant-corridor', name: '04_Quant_Power_Law', url: '/quant/corridor' },
  { slug: 'chain-etf', name: '05_OnChain_ETF_Flows', url: '/chain/etf' },
  { slug: 'chain-long-short', name: '06_OnChain_Long_Short', url: '/chain/long-short' },
  { slug: 'chain-wallets', name: '07_OnChain_Wallets_Transfer', url: '/chain/wallets' },
  { slug: 'sentiment', name: '08_Global_Sentiment', url: '/sentiment' },
  { slug: 'macro-data', name: '09_Macro_Economic_Data', url: '/macro/data' },
  { slug: 'macro-regime', name: '10_Macro_Regime', url: '/macro/regime' },
  { slug: 'macro-markets', name: '11_Macro_Global_Markets', url: '/macro/markets' },
  { slug: 'forecast-weekly', name: '12_Forecast_Weekly', url: '/forecast/weekly' },
  { slug: 'forecast-30d', name: '13_Forecast_Monthly_30d', url: '/forecast/30d' },
];

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1680,1050',
    ],
    defaultViewport: {
      width: 1680,
      height: 1050,
      deviceScaleFactor: 1.5,
    },
  });

  const page = await browser.newPage();

  for (let i = 0; i < ALL_TABS.length; i++) {
    const tab = ALL_TABS[i];
    const fullUrl = `${BASE_URL}${tab.url}`;
    const filename = `${tab.name}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);

    console.log(`[${i + 1}/${ALL_TABS.length}] Capturing ${tab.name} (${fullUrl})...`);

    try {
      await page.goto(fullUrl, { waitUntil: 'load', timeout: 35000 });
      // Allow dynamic charts, WebGL, SVG and feeds to load and render
      await new Promise((r) => setTimeout(r, 3500));

      // Expand containers if needed for full page
      await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        docEl.style.height = 'auto';
        body.style.height = 'auto';
        docEl.style.overflow = 'visible';
        body.style.overflow = 'visible';

        const main = document.querySelector('main');
        if (main) {
          main.style.height = 'auto';
          main.style.overflow = 'visible';
          main.style.minHeight = '0';
        }

        const allDivs = document.querySelectorAll('div');
        allDivs.forEach((div) => {
          if (div.style.height === '100dvh' || div.style.height === '100vh') {
            div.style.height = 'auto';
            div.style.minHeight = '100vh';
          }
          if (div.style.overflow === 'hidden') {
            div.style.overflow = 'visible';
          }
        });

        const aside = document.querySelector('aside');
        if (aside) {
          aside.style.minHeight = '100%';
        }
      });

      await new Promise((r) => setTimeout(r, 500));

      await page.screenshot({
        path: filepath,
        fullPage: true,
      });

      const stats = fs.statSync(filepath);
      console.log(`  -> Saved: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`  -> Failed: ${tab.name}:`, err.message);
    }
  }

  await browser.close();
  console.log('Finished capturing all tabs!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
