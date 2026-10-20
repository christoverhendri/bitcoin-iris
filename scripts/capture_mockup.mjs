import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML_FILE = 'c:\\Users\\NITRO\\Downloads\\IRIS Terminal Redesign.html';
const OUTPUT_DIR = 'C:\\Users\\NITRO\\.gemini\\antigravity\\brain\\c5ae82c1-6332-419c-8a82-28b7607da4f0\\scratch';

async function main() {
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1680,
      height: 5000,
      deviceScaleFactor: 1.5,
    });

    const fileUrl = `file:///${HTML_FILE.replace(/\\/g, '/')}`;
    console.log(`Navigating to: ${fileUrl}`);
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    console.log('Waiting 5 seconds for rendering...');
    await new Promise(r => setTimeout(r, 5000));

    // Full page screenshot
    const fullPath = path.join(OUTPUT_DIR, 'mockup_full.png');
    console.log(`Taking full-page screenshot -> ${fullPath}`);
    await page.screenshot({
      path: fullPath,
      fullPage: true,
    });
    console.log('Full-page screenshot saved.');

  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
