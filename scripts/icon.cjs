const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const app = await electron.launch({ executablePath: require('electron'), args: [path.resolve('.')], env: { ...process.env, WALNUTMATCH_DATA_DIR: '/private/tmp/walnutmatch-icon-profile' } });
  try {
    const page = await app.firstWindow();
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 1024;
      const x = c.getContext('2d');
      x.fillStyle = '#795738'; x.beginPath(); x.roundRect(40, 40, 944, 944, 220); x.fill();
      x.strokeStyle = '#ddc7a1'; x.lineWidth = 13; x.beginPath(); x.roundRect(85, 85, 854, 854, 180); x.stroke();
      x.fillStyle = '#fff5df'; x.font = '520px "Songti SC", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('核', 512, 514);
      return c.toDataURL('image/png').split(',')[1];
    });
    await fs.mkdir('resources', { recursive: true }); await fs.writeFile('resources/icon.png', Buffer.from(png, 'base64'));
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
