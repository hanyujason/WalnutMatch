import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Analysis, PairInput, Report, Settings, VIEWS, VIEW_NAMES } from '../core/types';
import { normalizeBaseUrl, callProvider } from '../core/provider';
import { RULE_VERSION, scoreAnalysis, validateDimensions } from '../core/rules';
import { PROMPT_VERSION } from '../core/analysis';

app.setName('WalnutMatch');
app.setPath('userData', process.env.WALNUTMATCH_DATA_DIR ? path.resolve(process.env.WALNUTMATCH_DATA_DIR) : path.join(app.getPath('appData'), 'WalnutMatch'));
let win: BrowserWindow | null = null;
let controller: AbortController | null = null;
let busy = false;
const defaults: Settings = { baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'responses', strict: true, hasKey: false };
const dataPath = (...p: string[]) => path.join(app.getPath('userData'), ...p);
async function readJson(file: string, fallback: any): Promise<any> { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e: any) { if (e.code === 'ENOENT') return fallback; throw new Error('本地数据无法读取，请保留文件并检查数据目录'); } }
async function writeJson(file: string, value: unknown) { await fs.mkdir(path.dirname(file), { recursive: true }); const tmp = file + '.' + randomUUID() + '.tmp'; await fs.writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 }); await fs.rename(tmp, file); }
async function settings(): Promise<Settings> { const s = await readJson(dataPath('settings.json'), defaults); let hasKey = false; try { await fs.access(dataPath('key.enc')); hasKey = true; } catch {} return { ...defaults, ...s, hasKey }; }
async function apiKey(): Promise<string> { try { return (await safeStorage.decryptStringAsync(await fs.readFile(dataPath('key.enc')))).result; } catch (e: any) { if (e.code === 'ENOENT') return ''; throw new Error('无法解密已保存密钥，请在设置中重新填写'); } }
function validateInput(input: PairInput) {
  if (!input || typeof input.name !== 'string' || input.name.length > 120 || typeof input.variety !== 'string' || input.variety.length > 80) throw new Error('样本名称或品种无效');
  validateDimensions(input.dimensions);
  for (const v of VIEWS) {
    const image = input.images?.[v];
    if (typeof image !== 'string' || image.length > 8 * 1024 * 1024 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('请为六个视角各导入一张有效图片（单张小于 6MB）');
  }
}
async function history(): Promise<Report[]> {
  let names: string[];
  try { names = await fs.readdir(dataPath('reports')); } catch (e: any) { if (e.code === 'ENOENT') return []; throw e; }
  const reports = await Promise.all(names.filter(n => /^[a-f0-9-]+\.json$/.test(n)).map(n => readJson(dataPath('reports', n), null)));
  return reports.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function reportMarkdown(r: Report) {
  const s = r.score;
  return `# ${r.input.name || '核桃配对报告'}\n\n${r.demo ? '**离线演示，不是真实模型评分。**\n\n' : ''}时间：${r.createdAt}\n\n品种：${r.input.variety || '未填写'}\n\n模型：${r.model}；规则：${r.ruleVersion}；提示词：${r.promptVersion}\n\n最终分：${s.final ?? '未生成'}；等级：${s.grade ?? '暂评'}；可信度：${s.confidence}\n\n视觉基础分：${s.visual ?? '证据不足'}；尺寸扣分：${s.penalty}；尺寸不适配：${s.sizeMismatch ? '是' : '否'}\n\n${r.analysis.summary}\n\n|指标|得分|满分|依据|\n|---|---:|---:|---|\n${s.items.map(i => `|${i.name}|${i.points === null ? '无法判断' : i.points.toFixed(2)}|${i.weight}|${i.reason.replace(/\|/g, '／').replace(/\n/g, ' ')}|`).join('\n')}\n\n## 实测尺寸（毫米）\n${JSON.stringify(r.input.dimensions)}\n\n差值：${JSON.stringify(s.differences)}\n\n## 六面对比\n${r.analysis.views.map(v => `### ${VIEW_NAMES[v.view]}\n相似：${v.similarities}\n\n差异：${v.differences}`).join('\n\n')}\n\n## 照片质量\n${r.analysis.quality.map(q => `${VIEW_NAMES[q.view]}：${q.issues.join('；') || '未报告明显拍摄问题'}`).join('\n\n')}\n\n本报告仅供配对参考，不构成品相鉴定或价格评估。可信度描述证据充分程度，不是统计准确率。\n`;
}
function handle(name: string, fn: (...args: any[]) => Promise<any>) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('调用来源无效');
    try { return { ok: true, value: await fn(...args) }; } catch (e: any) { return { ok: false, error: e?.message || '操作失败' }; }
  });
}
function register() {
  handle('settings', settings);
  handle('save-settings', async (s: Settings & { apiKey: string; clearKey?: boolean }) => {
    if (busy) throw new Error('请等待当前请求结束后再修改配置');
    if (!s || typeof s.model !== 'string' || s.model.length > 160 || !['responses', 'chat'].includes(s.protocol) || typeof s.strict !== 'boolean' || typeof s.apiKey !== 'string' || s.apiKey.length > 4096) throw new Error('API 设置无效');
    const baseUrl = normalizeBaseUrl(s.baseUrl);
    if (s.apiKey.trim()) {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('系统密钥保护不可用，未保存密钥');
      await fs.mkdir(dataPath(), { recursive: true });
      await fs.writeFile(dataPath('key.enc'), await safeStorage.encryptStringAsync(s.apiKey.trim()), { mode: 0o600 });
    } else if (s.clearKey) await fs.rm(dataPath('key.enc'), { force: true });
    await writeJson(dataPath('settings.json'), { baseUrl, model: s.model.trim(), protocol: s.protocol, strict: s.strict });
    return settings();
  });
  async function request(input?: PairInput) {
    if (busy) throw new Error('已有请求正在进行');
    busy = true; controller = new AbortController();
    const active = controller;
    const timer = setTimeout(() => active.abort(), 240000);
    try { return { result: await callProvider(await settings(), await apiKey(), active.signal, input), config: await settings() }; }
    finally { clearTimeout(timer); controller = null; busy = false; }
  }
  handle('test-connection', async () => { await request(); return '文本连接成功。图像能力与结构化输出需通过实际照片分析验证。'; });
  handle('cancel', async () => { controller?.abort(); });
  handle('analyze', async (input: PairInput) => {
    validateInput(input);
    const { result, config } = await request(input);
    const analysis = result.analysis as Analysis;
    const report: Report = { id: randomUUID(), createdAt: new Date().toISOString(), input, analysis, score: scoreAnalysis(analysis, input.dimensions), model: config.model, endpoint: config.baseUrl, protocol: config.protocol, ruleVersion: RULE_VERSION, promptVersion: PROMPT_VERSION, demo: false, usage: result.usage };
    await writeJson(dataPath('reports', report.id + '.json'), report);
    return report;
  });
  handle('history', history);
  handle('export-report', async (id: string, format: string) => {
    if (!['json', 'md'].includes(format)) throw new Error('导出格式无效');
    const r = (await history()).find(r => r.id === id);
    if (!r) throw new Error('报告不存在');
    const choice = await dialog.showSaveDialog(win!, { title: '导出配对报告', defaultPath: `WalnutMatch-${id.slice(0, 8)}.${format}`, filters: [{ name: format === 'json' ? '完整数据（含分析图片）' : '中文报告', extensions: [format] }] });
    if (choice.canceled || !choice.filePath) return false;
    await fs.writeFile(choice.filePath, format === 'json' ? JSON.stringify(r, null, 2) : reportMarkdown(r), { mode: 0o600 }); return true;
  });
  handle('delete-report', async (id: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('报告编号无效');
    await fs.rm(dataPath('reports', id + '.json'), { force: true });
  });
  handle('sample', async () => {
    // 开发时可加载用户提供的真实样本；不把商家照片打包进应用。
    if (app.isPackaged) return null;
    return readJson(path.join(app.getAppPath(), '.local-data', 'sample.json'), null);
  });
}
function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 1000, minHeight: 700, title: 'WalnutMatch · 核桃配对', backgroundColor: '#f7f5f0', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  if (process.env.WALNUTMATCH_SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 1200));
        const state = await win!.webContents.executeJavaScript('({title:document.title,text:document.body.innerText})');
        console.log(JSON.stringify(state));
        await fs.writeFile(process.env.WALNUTMATCH_SMOKE!, (await win!.webContents.capturePage()).toPNG());
        app.quit();
      } catch (e) { console.error(e); app.exit(1); }
    });
  }
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'WalnutMatch', submenu: [{ label: '关于 WalnutMatch', role: 'about' }, { type: 'separator' }, { label: '退出', role: 'quit' }] }, { label: '编辑', submenu: [{ label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' }, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }] }, { label: '视图', submenu: [{ label: '放大', role: 'zoomIn' }, { label: '缩小', role: 'zoomOut' }, { label: '实际大小', role: 'resetZoom' }] }]));
  register(); createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { controller?.abort(); app.quit(); });
