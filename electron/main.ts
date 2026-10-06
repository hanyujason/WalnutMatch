import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Analysis, PairInput, Report, Settings, viewName } from '../core/types';
import { normalizeBaseUrl, callProvider } from '../core/provider';
import { RULE_VERSION, scoreAnalysis } from '../core/rules';
import { validateInput } from '../core/input';
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
async function history(): Promise<Report[]> {
  let names: string[];
  try { names = await fs.readdir(dataPath('reports')); } catch (e: any) { if (e.code === 'ENOENT') return []; throw e; }
  const reports = await Promise.all(names.filter(n => /^[a-f0-9-]+\.json$/.test(n)).map(n => readJson(dataPath('reports', n), null)));
  return reports.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function reportMarkdown(r: Report) {
  const s = r.score;
  const dim = (n: number | null) => n === null ? '未提供' : String(n);
  const safe = (text: string) => text.replace(/\|/g, '／').replace(/\n/g,' ');
  const sizeLabel = s.sizeMode === 'none' ? '仅视觉评级；未提供可比较尺寸，未计尺寸扣分' : s.sizeMode === 'partial' ? '部分尺寸比较；未填写项不参与扣分' : '包含尺寸比较的评级';
  return `# ${r.input.name || '核桃配对报告'}\n\n${r.demo ? '**离线演示，不是真实模型评分。**\n\n' : ''}时间：${r.createdAt}\n\n品种：${r.input.variety || '未填写'}；类型：${r.input.walnutType === 'three' ? '三棱' : '两棱'}\n\n模型：${r.model}；规则：${r.ruleVersion}；提示词：${r.promptVersion}\n\n${s.estimated ? '暂评估算分' : '最终分'}：${s.final ?? '未生成'}；等级：${s.estimated ? '暂评 ' : ''}${s.grade ?? '暂缺'}；照片可信度：${s.confidence}\n\n${sizeLabel}\n\n视觉基础分：${s.visual ?? '证据不足'}；尺寸扣分：${s.penalty}；尺寸不适配：${s.sizeMismatch ? '是' : '否'}\n\n${r.analysis.summary}\n\n${s.estimated ? `暂评：已评项目 ${s.assessedPoints}/${s.assessedMax}，按比例折算到100分后扣尺寸差；未观察部分可能改变结果。\n\n` : ''}|指标|得分|满分|依据|\n|---|---:|---:|---|\n${s.items.map(i=>`|${i.name}|${i.points === null ? '无法判断' : i.points.toFixed(2)}|${i.weight}|${safe(i.reason)}|`).join('\n')}\n\n## 实测尺寸（毫米）\n|项目|核桃1|核桃2|差值|\n|---|---:|---:|---:|\n${(['edge','belly','height'] as const).map((k,i)=>`|${['边宽','肚宽','桩高'][i]}|${dim(r.input.dimensions[0][k])}|${dim(r.input.dimensions[1][k])}|${dim(s.differences[k])}|`).join('\n')}\n\n## 视角对比\n${r.analysis.views.map(v=>`### ${viewName(v.view,r.input.walnutType)}\n相似：${v.similarities}\n\n差异：${v.differences}`).join('\n\n')}\n\n## 照片质量\n${r.analysis.quality.map(q=>`${viewName(q.view,r.input.walnutType)}：${q.issues.join('；') || '未报告明显拍摄问题'}`).join('\n\n')}\n\n## 细节补充（不直接扣配对分）\n${(r.input.details ?? []).filter(d=>d.text.trim() || d.image).map((d,i)=>`### 补充${i+1}\n用户描述：${d.text || '未填写'}\n对象：${{unknown:'未指定',left:'左颗',right:'右颗',both:'两颗'}[d.target]}；位置：${d.position || '未指定'}\n细节照片：${d.image ? '已提供（完整图片见JSON报告）' : '未提供'}\n模型观察：${r.analysis.details?.find(x=>x.id===d.id)?.observation || '旧报告未记录'}`).join('\n\n') || '未填写，不影响评分或可信度。'}\n\n本报告仅供配对参考，不构成品相鉴定或价格评估。照片可信度不是准确率。\n`;
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
    const report: Report = { id: randomUUID(), createdAt: new Date().toISOString(), input, analysis, score: scoreAnalysis(analysis, input.dimensions, true, input.walnutType), model: config.model, endpoint: config.baseUrl, protocol: config.protocol, ruleVersion: RULE_VERSION, promptVersion: PROMPT_VERSION, demo: false, usage: result.usage };
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
