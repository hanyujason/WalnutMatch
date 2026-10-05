const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
(async () => {
  const root = path.resolve(process.argv[2] || 'release/mac-arm64/WalnutMatch.app');
  const entries = asar.listPackage(path.join(root, 'Contents/Resources/app.asar'));
  assert.ok(!entries.some(x => /sample\.json|\.local-data|key\.enc|\/tests\//.test(x)));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'walnutmatch-package-'));
  const app = await electron.launch({ executablePath: path.join(root, 'Contents/MacOS/WalnutMatch'), args: [], env: { ...process.env, WALNUTMATCH_DATA_DIR: profile } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: '这对核桃，有多配？' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '载入南疆石参考照片' }).count(), 0);
    await page.getByRole('button', { name: '查看离线演示' }).click();
    await page.getByText('离线演示 · 预设结果 · 未调用 API · 不代表上传照片的实际评分').waitFor();
    await page.screenshot({ path: 'qa/06-packaged.png' });
    console.log('发布包验证通过：.app 启动、中文界面、离线演示；未包含商家照片、测试文件或密钥。');
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
