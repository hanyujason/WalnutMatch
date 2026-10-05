const { _electron: electron } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fixture } = require('../dist-main/tests/fixture.js');
const views = ['肚面一', '肚面二', '棱边一', '棱边二', '顶部', '底部'];
// 合成图片仅验证导入流程，不用作核桃视觉评估。
const png = require('node:fs').readFileSync(path.resolve('resources/icon.png'));
async function fillPair(page) {
  for (const v of views) await page.getByLabel(`导入${v}`, { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
  for (const [i, values] of [[1,[41.8,41.6,39.8]],[2,[42,41.8,40]]])
    for (const [j, label] of ['边宽','肚宽','桩高'].entries()) await page.getByRole('spinbutton', { name: `核桃${i}${label}`, exact: true }).fill(String(values[j]));
}

(async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walnutmatch-ui-'));
  const output = path.resolve('qa'); await fs.mkdir(output, { recursive: true });
  const errors = [];
  const options = { executablePath: require('electron'), args: [path.resolve('.')], env: { ...process.env, WALNUTMATCH_DATA_DIR: dataDir } };
  let app;
  let server;
  try {
    app = await electron.launch(options);
    let page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    await page.getByRole('heading', { name: '这对核桃，有多配？' }).waitFor();
    await page.screenshot({ path: path.join(output, '01-home.png'), fullPage: true });
    await page.getByRole('button', { name: '开始配对评分' }).click();
    await page.getByRole('alert').filter({ hasText: '请先确认' }).waitFor();
    await page.getByRole('button', { name: '查看离线演示' }).click();
    await page.getByText('离线演示 · 预设结果 · 未调用 API · 不代表上传照片的实际评分').waitFor();
    assert.match(await page.locator('.score-number').innerText(), /87/);
    await page.screenshot({ path: path.join(output, '02-demo.png'), fullPage: true });
    await page.getByRole('button', { name: '← 返回照片与尺寸' }).click();
    await fillPair(page);
    await page.waitForFunction(() => document.querySelectorAll('.photo img').length === 6);
    assert.equal(await page.locator('.photo img').count(), 6);
    assert.equal(await page.getByRole('spinbutton', { name: '核桃1边宽' }).inputValue(), '41.8');
    await page.getByRole('button', { name: '移除', exact: true }).first().click();
    await page.getByLabel('导入肚面一', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => document.querySelectorAll('.photo img').length === 6);
    assert.equal(await page.locator('.photo img').count(), 6);
    await page.screenshot({ path: path.join(output, '03-sample.png'), fullPage: true });
    await page.getByRole('button', { name: /API 设置/ }).click();
    await page.getByLabel('模型名称', { exact: true }).fill('vision-local-test');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '设置已保存' }).waitFor();
    assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')).model, 'vision-local-test');
    assert.equal((await page.getByRole('button', { name: '测试已保存配置' }).isDisabled()), true);
    await page.screenshot({ path: path.join(output, '04-settings.png'), fullPage: true });
    await app.close();
    app = await electron.launch(options); page = await app.firstWindow();
    await page.getByRole('button', { name: /API 设置/ }).click();
    await page.getByLabel('模型名称', { exact: true }).waitFor();
    // 初始化配置异步加载，等待已保存值。
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'vision-local-test'));
    await page.getByRole('button', { name: /历史报告/ }).click();
    await page.getByRole('heading', { name: '还没有真实评分记录' }).waitFor();
    // 仅隔离测试进程替换解密函数，不读取真实钥匙串、不使用付费服务。
    await app.evaluate(({ safeStorage }) => { safeStorage.decryptStringAsync = async () => ({ result: 'mock-test-key', shouldReEncrypt: false }); });
    await fs.writeFile(path.join(dataDir, 'key.enc'), 'mock-ciphertext');
    let mode = 'ok';
    const captured = [];
    server = http.createServer(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk;
      captured.push({ body: JSON.parse(body), authorization: req.headers.authorization });
      if (mode === 'slow') return;
      const a = fixture(); a.metrics.find(m => m.id === 'bottom').level = 2; a.metrics.find(m => m.id === 'direction').level = 2;
      if (mode === 'partial') a.metrics[0].level = null;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(a) }] }], usage: { input_tokens: 123, output_tokens: 456 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await page.getByRole('button', { name: /API 设置/ }).click();
    await page.getByLabel('API 基础地址').fill(`http://127.0.0.1:${server.address().port}/v1`);
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '设置已保存' }).waitFor();
    await page.getByRole('button', { name: /对子评分/ }).click();
    await fillPair(page);
    await page.waitForFunction(() => document.querySelectorAll('.photo img').length === 6);
    await page.getByLabel('本次照片会发送到我配置的 API 服务进行分析').check();
    await page.getByRole('button', { name: '开始配对评分' }).click();
    await page.locator('.score-number').waitFor();
    assert.match(await page.locator('.score-number').innerText(), /87/);
    assert.equal(captured[0].authorization, 'Bearer mock-test-key');
    assert.equal(captured[0].body.input[0].content.filter(x => x.type === 'input_image').length, 6);
    const names = await fs.readdir(path.join(dataDir, 'reports'));
    assert.equal(names.length, 1);
    const saved = await fs.readFile(path.join(dataDir, 'reports', names[0]), 'utf8');
    assert.ok(!saved.includes('mock-test-key'));
    await page.screenshot({ path: path.join(output, '05-mock-report.png'), fullPage: true });
    await app.evaluate(({ dialog }, output) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: output }); }, path.join(dataDir, 'export.md'));
    await page.getByRole('button', { name: '导出中文报告' }).click();
    await page.getByRole('status').filter({ hasText: '中文报告已导出' }).waitFor();
    assert.match(await fs.readFile(path.join(dataDir, 'export.md'), 'utf8'), /最终分：87/);
    assert.match(await fs.readFile(path.join(dataDir, 'export.md'), 'utf8'), /肚面一/);
    mode = 'partial';
    await page.getByRole('button', { name: '← 返回照片与尺寸' }).click();
    await page.getByRole('button', { name: '开始配对评分' }).click();
    await page.getByText('证据不足，仅展示局部评价', { exact: true }).waitFor();
    assert.match(await page.locator('.score-number').innerText(), /暂评/);
    mode = 'slow';
    await page.getByRole('button', { name: '← 返回照片与尺寸' }).click();
    await page.getByRole('button', { name: '开始配对评分' }).click();
    await page.getByRole('button', { name: '取消分析' }).click();
    await page.getByRole('alert').filter({ hasText: '取消或请求超时' }).waitFor();
    await page.getByRole('button', { name: /历史报告/ }).click();
    assert.equal(await page.locator('.history-item').count(), 2);
    await page.getByRole('button', { name: '删除', exact: true }).first().click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.history-item').length === 1);
    assert.deepEqual(errors, []);
    console.log('桌面验证通过：启动、离线演示、六图导入、配置保存/重启、本地模拟分析、报告持久化/导出/删除、局部报告、取消。未调用真实 API；密钥解密在隔离测试进程中模拟。');
  } finally { if (app) await app.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
})().catch(e => { console.error(e); process.exitCode = 1; });
