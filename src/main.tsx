import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Analysis, Bridge, Dimensions, PairInput, Report, Settings, VIEWS, View, VIEW_NAMES } from '../core/types';
import { COEFFICIENTS, LEVEL_NAMES, METRICS, RULE_VERSION, scoreAnalysis } from '../core/rules';
import './style.css';
declare global { interface Window { walnut: Bridge } }
type Tab = 'pair' | 'history' | 'settings' | 'rules';
const blankImages = () => Object.fromEntries(VIEWS.map(v => [v, ''])) as Record<View, string>;
const date = (v: string) => new Date(v).toLocaleString('zh-CN');
async function loadImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 25 * 1024 * 1024) throw new Error('原图请控制在 25MB 以内');
  const src = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('图片读取失败')); r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('图片无法解码，请转换为 JPG 或 PNG')); i.src = src; });
  const ratio = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * ratio); canvas.height = Math.round(img.naturalHeight * ratio);
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .92);
}
function demoReport(): Report {
  const analysis: Analysis = {
    summary: '离线示例：整体轮廓与粗纹风格接近，主纹分叉和底部存在差异。此内容是预设演示，不是对你上传照片的分析。',
    views: VIEWS.map(view => ({ view, similarities: '预设示例：整体风格协调。', differences: '预设示例：局部走势有差异。' })),
    quality: VIEWS.map(view => ({ view, usable: true, severity: view === 'top' || view === 'bottom' ? 'minor' : 'none', issues: view === 'top' || view === 'bottom' ? ['示例：手持角度略倾斜'] : [] })),
    metrics: METRICS.map(m => ({ id: m.id, level: ['bottom', 'direction'].includes(m.id) ? 2 : 1, reason: '预设示例，展示差异档到分数的转换，不是实际图像分析。', evidence: [m.id === 'top' ? 'top' : m.id === 'bottom' ? 'bottom' : 'front'] as View[] }))
  };
  const input: PairInput = { name: '离线演示 · 南疆石', variety: '南疆石', images: blankImages(), dimensions: [{ edge: 41.8, belly: 41.6, height: 39.8 }, { edge: 42, belly: 41.8, height: 40 }] };
  return { id: 'demo', createdAt: new Date().toISOString(), input, analysis, score: scoreAnalysis(analysis, input.dimensions), model: '未调用 API', endpoint: '', protocol: '离线演示', ruleVersion: RULE_VERSION, promptVersion: '0.1.0', demo: true, usage: null };
}
function App() {
  const [tab, setTab] = useState<Tab>('pair');
  const [settings, setSettings] = useState<Settings>({ baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'responses', strict: true, hasKey: false });
  const [key, setKey] = useState('');
  const [name, setName] = useState(''); const [variety, setVariety] = useState('');
  const [images, setImages] = useState(blankImages);
  const [dims, setDims] = useState([['', '', ''], ['', '', '']]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(''); const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const [reports, setReports] = useState<Report[]>([]); const [report, setReport] = useState<Report | null>(null);
  const [sampleAvailable, setSampleAvailable] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const refresh = async () => setReports(await window.walnut.history());
  useEffect(() => { window.walnut.settings().then(setSettings).catch(e => setError(e.message)); refresh().catch(e => setError(e.message)); window.walnut.sample().then(x => setSampleAvailable(!!x)).catch(() => {}); }, []);
  useEffect(() => { if (!busy) return; setElapsed(0); const t = setInterval(() => setElapsed(x => x + 1), 1000); return () => clearInterval(t); }, [busy]);
  const action = async (label: string, fn: () => Promise<void>) => { if (busy) return; setError(''); setNotice(''); setBusy(label); try { await fn(); } catch (e: any) { setError(e.message || '操作失败'); } finally { setBusy(''); } };
  const switchTab = (t: Tab) => { setTab(t); setNotice(''); setError(''); };
  const analyze = () => action('正在分析已上传照片', async () => {
    if (!consent) throw new Error('请先确认本次照片会发送到你配置的 API 服务');
    if (!settings.hasKey) throw new Error('请先在 API 设置中保存密钥');
    if (!VIEWS.some(v => images[v])) throw new Error('请至少导入一张两颗同框的照片');
    const dimensions = dims.map(d => ({ edge: Number(d[0]), belly: Number(d[1]), height: Number(d[2]) })) as [Dimensions, Dimensions];
    const result = await window.walnut.analyze({ name: name.trim() || '未命名对子', variety: variety.trim(), images, dimensions });
    setReport(result); await refresh();
  });
  const fillSample = () => action('加载本地样本', async () => {
    const s = await window.walnut.sample(); if (!s) throw new Error('没有本地参考样本，请自行导入照片');
    setImages(s.images); setName(s.name); setVariety(s.variety); setDims(s.dimensions.map(d => [String(d.edge), String(d.belly), String(d.height)])); setReport(null); setNotice('已载入真实照片与实测尺寸，尚未调用 API。侧向视角标签请按需要核对。');
  });
  return <div className="shell">
    <aside><div className="brand"><span className="brand-mark">核</span><div>WalnutMatch<small>文玩核桃 · 配对参考</small></div></div>
      <div className="nav-caption">我的工作台</div>
      {([['pair', '◈', '对子评分'], ['history', '◷', '历史报告'], ['settings', '⚙', 'API 设置'], ['rules', '≡', '评分规则']] as const).map(([t, icon, label]) => <button key={t} className={`nav ${tab === t ? 'active' : ''}`} onClick={() => switchTab(t)}><span>{icon}</span>{label}{t === 'history' && <em>{reports.length}</em>}</button>)}
      <div className="sidebar-bottom"><span className="dot"/>本地桌面版 <b>V0.1.2</b><p>报告保存在本机<br/>分析使用你配置的 API</p></div>
    </aside>
    <main><header><span>{tab === 'pair' ? '评价一对，理解每一分' : tab === 'history' ? '让每一次比较都有记录' : tab === 'settings' ? '连接你选择的视觉模型' : '公开规则，逐步校准'}</span><span className="status">{settings.hasKey ? '密钥已保存' : '尚未配置 API'} · 规则 {RULE_VERSION}</span></header>
      {error && <div role="alert" className="alert error">{error}<button onClick={() => setError('')}>关闭</button></div>}
      {notice && <div role="status" className="alert">{notice}<button onClick={() => setNotice('')}>关闭</button></div>}
      {busy && <div role="status" className="alert loading"><span className="spinner"/>{busy} · 已等待 {elapsed} 秒{busy.includes('分析') && <button onClick={() => window.walnut.cancel()}>取消分析</button>}</div>}
      {tab === 'pair' && <>
        <div className="page-heading"><div><span className="eyebrow">PAIR EVALUATOR</span><h1>这对核桃，有多配？</h1><p>六面看形，细看纹路。实测尺寸单独计算。</p></div><button className="secondary" disabled={!!busy} onClick={() => { setError(''); setReport(demoReport()); setNotice('离线演示使用预设结果，不调用 API，也不评价已上传照片。'); }}>查看离线演示</button></div>
        {report ? <><div className="report-toolbar"><button className="secondary" onClick={() => setReport(null)}>← 返回照片与尺寸</button><span>{report.demo ? '预设演示' : date(report.createdAt)}</span>{!report.demo && <><button className="secondary" onClick={() => action('导出报告', async () => { if (await window.walnut.exportReport(report.id, 'md')) setNotice('中文报告已导出'); })}>导出中文报告</button><button className="secondary" onClick={() => action('导出数据', async () => { if (await window.walnut.exportReport(report.id, 'json')) setNotice('完整报告数据已导出'); })}>导出数据</button></>}</div><ReportView report={report}/></> : <>
          <section className="card"><div className="section-title"><h2><i>01</i> 样本信息</h2>{sampleAvailable && <button className="text-button" disabled={!!busy} onClick={fillSample}>载入南疆石参考照片</button>}</div>
          <div className="two-fields"><label>对子名称<input value={name} maxLength={120} disabled={!!busy} onChange={e => setName(e.target.value)} placeholder="例如：南疆石 · 第一对"/></label><label>核桃品种<input value={variety} maxLength={80} disabled={!!busy} onChange={e => setVariety(e.target.value)} placeholder="例如：南疆石、曹大龙"/></label></div></section>
          <section className="card"><div className="section-title"><h2><i>02</i> 六面同框照片</h2><span>{VIEWS.filter(v => images[v]).length} / 6 已导入</span></div><p className="hint">至少上传一张，两颗需同框；缺少的视角可留空，会生成局部报告。支持 JPG、PNG、WebP；保留你自己的原图。</p>
          <div className="photo-grid">{VIEWS.map((v, i) => <div className="photo-slot" key={v}><label className={images[v] ? 'photo filled' : 'photo'}>{images[v] ? <img src={images[v]} alt={VIEW_NAMES[v]}/> : <><span className="upload-symbol">＋</span><strong>{VIEW_NAMES[v]}</strong><small>点击导入同框照片</small></>}<input type="file" aria-label={`导入${VIEW_NAMES[v]}`} accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) action('读取照片', async () => { const data = await loadImage(f); setImages(x => ({ ...x, [v]: data })); }); }}/></label><div className="photo-caption"><span><b>{String(i + 1).padStart(2, '0')}</b> {VIEW_NAMES[v]}</span>{images[v] && <button disabled={!!busy} onClick={() => setImages(x => ({ ...x, [v]: '' }))}>移除</button>}</div></div>)}</div></section>
          <section className="card"><div className="section-title"><h2><i>03</i> 实测尺寸</h2><span>单位：毫米（mm）</span></div><p className="hint">填写卡尺数据，只比较差值，不必对应照片左右。尺寸接近不加分，差异较大才扣分。</p><div className="dimension-grid"><span/><strong>边宽</strong><strong>肚宽</strong><strong>桩高</strong>{dims.map((d, row) => <React.Fragment key={row}><b>核桃 {row + 1}</b>{d.map((x, col) => <input key={col} aria-label={`核桃${row + 1}${['边宽', '肚宽', '桩高'][col]}`} type="number" min="0.1" max="100" step="0.1" value={x} disabled={!!busy} placeholder="—" onChange={e => setDims(ds => ds.map((r, ri) => ri === row ? r.map((n, ci) => ci === col ? e.target.value : n) : r))}/>)}</React.Fragment>)}</div></section>
          <div className="submit-row"><div><label className="checkbox"><input type="checkbox" disabled={!!busy} checked={consent} onChange={e => setConsent(e.target.checked)}/>本次照片会发送到我配置的 API 服务进行分析</label><p>仅供配对参考，不构成品相鉴定或价格评估。</p></div><button className="primary" disabled={!!busy} onClick={analyze}>开始配对评分 <span>→</span></button></div>
        </>}
      </>}
      {tab === 'settings' && <><div className="page-heading"><div><span className="eyebrow">MODEL CONNECTION</span><h1>API 设置</h1><p>使用支持图片输入的模型。配置保存在本机。</p></div></div><section className="card settings-card"><label>接口协议<select disabled={!!busy} value={settings.protocol} onChange={e => setSettings(s => ({ ...s, protocol: e.target.value as Settings['protocol'] }))}><option value="responses">OpenAI Responses</option><option value="chat">兼容 Chat Completions</option></select></label><label>API 基础地址<input disabled={!!busy} value={settings.baseUrl} onChange={e => setSettings(s => ({ ...s, baseUrl: e.target.value }))}/><small>例如 https://api.openai.com/v1，不包含 /responses 或 /chat/completions。</small></label><label>模型名称<input disabled={!!busy} value={settings.model} onChange={e => setSettings(s => ({ ...s, model: e.target.value }))} placeholder="填写服务商提供的视觉模型名称"/></label><label>API 密钥<input type="password" autoComplete="off" disabled={!!busy} value={key} onChange={e => setKey(e.target.value)} placeholder={settings.hasKey ? '已保存；留空保留原密钥' : '输入 API Key'}/><small>通过系统加密保护，不会写进导出报告。</small></label><label className="checkbox"><input type="checkbox" disabled={!!busy} checked={settings.strict} onChange={e => setSettings(s => ({ ...s, strict: e.target.checked }))}/>严格结构化输出</label><p className="hint">服务不支持 JSON Schema 时可取消勾选，使用兼容 JSON 模式。程序仍会验证返回结构。</p><div className="button-row"><button className="primary" disabled={!!busy} onClick={() => action('保存设置', async () => { setSettings(await window.walnut.saveSettings({ ...settings, apiKey: key })); setKey(''); setNotice('设置已保存'); })}>保存设置</button><button className="secondary" disabled={!!busy || !settings.hasKey} onClick={() => action('测试文本连接', async () => { setNotice(await window.walnut.testConnection()); })}>测试已保存配置</button><button className="text-button" disabled={!!busy || !settings.hasKey} onClick={() => action('移除密钥', async () => { setSettings(await window.walnut.saveSettings({ ...settings, apiKey: '', clearKey: true })); setKey(''); setNotice('已移除本地密钥'); })}>移除密钥</button></div><div className="callout">连接测试会发送一次简短文本请求，可能产生少量 API 费用；成功不代表模型支持图片。正式分析会发送已上传的处理后照片。修改配置后请先保存再测试。</div></section></>}
      {tab === 'history' && <><div className="page-heading"><div><span className="eyebrow">LOCAL ARCHIVE</span><h1>历史报告</h1><p>保留每次独立评价，方便观察模型与规则的变化。</p></div><button className="secondary" disabled={!!busy} onClick={() => action('刷新报告', refresh)}>刷新</button></div>{reports.length === 0 ? <div className="empty-state"><span>◷</span><h2>还没有真实评分记录</h2><p>完成一次 API 分析后，报告会自动保存在本机。离线演示不进入历史。</p><button className="primary" onClick={() => switchTab('pair')}>评价第一对</button></div> : <div className="history-list">{reports.map(r => <article className="card history-item" key={r.id}><div className="grade-badge">{r.score.estimated ? `暂${r.score.grade}` : r.score.grade ?? '暂'}</div><div className="history-meta"><h3>{r.input.name}</h3><p>{r.input.variety || '未填品种'} · {date(r.createdAt)}</p><small>{r.model} · 规则 {r.ruleVersion} · 可信度{r.score.confidence}</small></div><strong>{r.score.final ?? '—'}<small>分</small></strong><button className="secondary" onClick={() => { setReport(r); switchTab('pair'); }}>查看报告</button>{pendingDelete === r.id ? <><button className="danger" disabled={!!busy} onClick={() => action('删除报告', async () => { await window.walnut.deleteReport(r.id); if (report?.id === r.id) setReport(null); setPendingDelete(null); await refresh(); })}>确认删除</button><button className="text-button" onClick={() => setPendingDelete(null)}>取消</button></> : <button className="text-button" onClick={() => setPendingDelete(r.id)}>删除</button>}</article>)}</div>}</>}
      {tab === 'rules' && <><div className="page-heading"><div><span className="eyebrow">SCORING STANDARD</span><h1>评分规则 · {RULE_VERSION}</h1><p>WalnutMatch 的实验性尺度，不是市场统一标准。</p></div></div><section className="card"><h2>视觉基础分 − 尺寸扣分 = 最终分</h2><p>形状占 60 分，纹路占 40 分。模型判定差异档，程序负责计算。可信度单独展示，不扣配对分。</p><table><thead><tr><th>指标</th><th>满分</th><th>比较内容</th></tr></thead><tbody>{METRICS.map(m => <tr key={m.id}><td>{m.name}</td><td>{m.weight}</td><td>{m.hint}</td></tr>)}</tbody></table></section><section className="card"><h2>差异档与系数</h2><div className="tier-grid">{LEVEL_NAMES.map((n, i) => <div key={n}><b>{n}</b><span>满分 × {COEFFICIENTS[i]}</span></div>)}</div><p className="hint">无法判断的指标留空，不默认为满分或零分。任一指标缺失或任一视角不可用时，按已评项目得分÷已评项目满分×100估算，再扣尺寸差，明确标为暂评；全部无法判断则不出分。</p></section><section className="card"><h2>尺寸扣分与等级</h2><p>边、肚、高分别计算绝对差值：≤0.5mm 不扣；0.5–1mm 连续扣 0–3 分；1–2mm 连续扣 3–12 分；≥2mm 单项扣 12 分并触发 D。三项扣分累加。</p><div className="tier-grid">{[['S','95–100'],['A','85–＜95'],['B','70–＜85'],['C','55–＜70'],['D','0–＜55']].map(([g,n]) => <div key={g}><b>{g} 级</b><span>{n} 分</span></div>)}</div><p className="hint">等级使用未舍入分数判定。显示值保留一位小数，可能在边界处出现显示值与等级的舍入差异。</p></section></>}
      <footer>WalnutMatch · 每一分都有依据，也保留不确定性。</footer>
    </main>
  </div>;
}
function ReportView({ report: r }: { report: Report }) {
  const s = r.score;
  const assessed = s.items.filter(i => i.points !== null);
  const assessedPoints = Math.round(assessed.reduce((sum, i) => sum + i.points!, 0) * 100) / 100;
  const assessedMax = assessed.reduce((sum, i) => sum + i.weight, 0);
  const shapeMax = assessed.filter(i => METRICS.find(m => m.id === i.id)?.group === 'shape').reduce((sum,i)=>sum+i.weight,0);
  const textureMax = assessedMax - shapeMax;
  return <div className="report">{r.demo && <div className="demo-banner">离线演示 · 预设结果 · 未调用 API · 不代表上传照片的实际评分</div>}
    <section className="score-card"><div><span className="eyebrow">{r.input.name}</span><div className="score-number">{s.final ?? '—'}<small>/ 100</small><span className="grade-badge">{s.estimated ? `暂评 ${s.grade}` : s.grade ?? '暂评'}</span></div><p>{s.partial ? s.estimated ? `暂评估分：已评项目 ${assessedPoints} / ${assessedMax}，按比例折算到100分后扣尺寸差；缺失部分可能改变等级` : '证据不足，仅展示局部评价' : s.sizeMismatch ? '尺寸不适配触发 D，视觉分保留供参考' : '基于六面视觉比较与实测尺寸'}</p></div><div className="score-breakdown"><div><span>{s.estimated ? '估算视觉分' : '视觉基础分'}</span><b>{s.visual ?? '未生成'}</b></div><div><span>尺寸扣分</span><b>−{s.penalty}</b></div><div><span>评价可信度</span><b>{s.confidence}</b></div></div></section>
    <section className="card"><h2>配对评价</h2><p className="summary">{r.analysis.summary}</p><p className="hint">可信度表示当前照片支持判断的程度，不是准确率。规则 {r.ruleVersion} · 提示词 {r.promptVersion} · 模型 {r.model}</p></section>
    <section className="card"><div className="section-title"><h2>评分明细</h2><span>形状 {s.shape}/{s.partial ? shapeMax : 60} · 纹路 {s.texture}/{s.partial ? textureMax : 40}{s.partial ? '（仅已评项目）' : ''}</span></div><div className="metric-list">{s.items.map(i => { const m = r.analysis.metrics.find(m => m.id === i.id)!; return <div className="metric-row" key={i.id}><div><h3>{i.name}<small>{m.level === null ? '无法判断' : LEVEL_NAMES[m.level]}</small></h3><p>{i.reason}</p><small>依据：{m.evidence.map(v => VIEW_NAMES[v]).join('、') || '证据不足'}</small></div><div className="metric-score"><b>{i.points === null ? '—' : i.points.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}</b><span>/ {i.weight}</span><div className="bar"><i style={{ width: `${(i.points ?? 0) / i.weight * 100}%` }}/></div></div></div>; })}</div></section>
    <section className="card"><h2>实测尺寸差</h2><table><thead><tr><th>尺寸</th><th>核桃 1</th><th>核桃 2</th><th>差值</th></tr></thead><tbody>{(['edge','belly','height'] as const).map((k,i) => <tr key={k}><td>{['边宽','肚宽','桩高'][i]}</td><td>{r.input.dimensions[0][k]} mm</td><td>{r.input.dimensions[1][k]} mm</td><td>{s.differences[k].toFixed(2)} mm</td></tr>)}</tbody></table></section>
    <section className="card"><h2>六面对比与照片质量</h2><div className="view-results">{r.analysis.views.map(v => { const q = r.analysis.quality.find(q => q.view === v.view)!; return <article key={v.view}>{r.input.images[v.view] && <img src={r.input.images[v.view]} alt={VIEW_NAMES[v.view]}/>}<div><h3>{VIEW_NAMES[v.view]}</h3><p><b>相似：</b>{v.similarities}</p><p><b>差异：</b>{v.differences}</p><p className={q.severity === 'major' || !q.usable ? 'quality-warning' : 'hint'}>照片质量：{q.issues.join('；') || '未报告明显问题'}{!q.usable ? ' · 不足以比较' : ''}</p></div></article>; })}</div></section>
    <details className="card"><summary>查看结构化分析与用量</summary><pre>{JSON.stringify({ analysis: r.analysis, usage: r.usage }, null, 2)}</pre></details>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
