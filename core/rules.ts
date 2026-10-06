import { Analysis, Dimensions, Score, WalnutType, viewsFor } from './types';
export const RULE_VERSION = '0.2.0';
export const METRICS = [
  { id: 'outline', name: '整体轮廓与桩型', weight: 20, group: 'shape', hint: '高宽比例、胖瘦、轮廓收放' },
  { id: 'shoulder', name: '肩部与肚部', weight: 10, group: 'shape', hint: '肩高、坡度、饱满度、肚部鼓起位置与弧度' },
  { id: 'edge', name: '棱边形态', weight: 10, group: 'shape', hint: '棱边宽厚比例、曲线、转折' },
  { id: 'axis', name: '轴线与偏斜形态', weight: 10, group: 'shape', hint: '每张同框图的尖棱底位置及偏斜协调性；不核验跨图身份' },
  { id: 'top', name: '顶部形态', weight: 5, group: 'shape', hint: '顶轮廓、尖位置、突出程度' },
  { id: 'bottom', name: '底部形态', weight: 5, group: 'shape', hint: '底轮廓、收底、底脐位置、可见凹凸' },
  { id: 'density', name: '纹路粗细与疏密', weight: 15, group: 'texture', hint: '纹块粗细、沟纹密度及分布' },
  { id: 'direction', name: '主纹走势', weight: 15, group: 'texture', hint: '主筋走向、分叉、连续性和相对位置' },
  { id: 'blocks', name: '纹块与起伏风格', weight: 10, group: 'texture', hint: '纹块形态和大小分布，不从阴影推断真实深度' }
] as const;
export const COEFFICIENTS = [1, .9, .75, .5, .2, 0];
export const LEVEL_NAMES = ['几乎无差异', '轻微差异', '中等差异', '明显差异', '严重差异', '完全不匹配'];
const round = (v: number) => Math.round((v + Number.EPSILON) * 10) / 10;
export function sizePenalty(d: number): number {
  if (!Number.isFinite(d) || d < 0) throw new Error('尺寸差无效');
  if (d <= .5) return 0;
  if (d <= 1) return 6 * (d - .5);
  if (d < 2) return 3 + 9 * (d - 1);
  return 12;
}
export function gradeFor(n: number): string { return n >= 95 ? 'S' : n >= 85 ? 'A' : n >= 70 ? 'B' : n >= 55 ? 'C' : 'D'; }
export function validateDimensions(dimensions: unknown): asserts dimensions is [Dimensions, Dimensions] {
  if (!Array.isArray(dimensions) || dimensions.length !== 2) throw new Error('请填写两颗核桃的尺寸');
  for (const d of dimensions) for (const k of ['edge', 'belly', 'height']) {
    if (!d || !(d[k] === null || typeof d[k] === 'number' && Number.isFinite(d[k]) && d[k] > 0 && d[k] <= 100)) throw new Error('尺寸须为大于 0 且不超过 100 的毫米数');
  }
}
export function scoreAnalysis(a: Analysis, ds: [Dimensions, Dimensions], estimatePartial = false, walnutType: WalnutType = 'two'): Score {
  validateDimensions(ds);
  const difference = (key: keyof Dimensions) => ds[0][key] === null || ds[1][key] === null ? null : Math.round(Math.abs(ds[0][key]! - ds[1][key]!) * 1e6) / 1e6;
  const differences = { edge: difference('edge'), belly: difference('belly'), height: difference('height') };
  const compared = Object.values(differences).filter((d): d is number => d !== null);
  const rawPenalty = compared.reduce((sum, d) => sum + sizePenalty(d), 0);
  const penalty = round(rawPenalty);
  const sizeMismatch = compared.some(d => d >= 2);
  const sizeMode = compared.length === 0 ? 'none' : compared.length === 3 ? 'full' : 'partial';
  const items = METRICS.map(m => {
    const x = a.metrics.find(x => x.id === m.id);
    if (!x || (x.level !== null && (!Number.isInteger(x.level) || x.level < 0 || x.level > 5))) throw new Error('分析指标不完整或差异档无效');
    return { id: m.id, name: m.name, weight: m.weight, points: x.level === null ? null : m.weight * COEFFICIENTS[x.level], reason: x.reason };
  });
  const unusable = viewsFor(walnutType).some(v => !a.quality.find(q => q.view === v)?.usable);
  const major = a.quality.some(q => q.severity === 'major');
  const partial = unusable || items.some(x => x.points === null);
  const shape = Math.round(items.slice(0, 6).reduce((s, x) => s + (x.points ?? 0), 0) * 100) / 100;
  const texture = Math.round(items.slice(6).reduce((s, x) => s + (x.points ?? 0), 0) * 100) / 100;
  const assessed = items.filter(x => x.points !== null);
  const assessedPoints = assessed.reduce((sum, x) => sum + x.points!, 0);
  const assessedMax = assessed.reduce((sum, x) => sum + x.weight, 0);
  const estimated = partial && estimatePartial && assessedMax > 0;
  const rawVisual = !partial ? assessedPoints : estimated ? assessedPoints / assessedMax * 100 : null;
  const visual = rawVisual === null ? null : round(rawVisual);
  const rawFinal = rawVisual === null ? null : Math.max(0, rawVisual - rawPenalty);
  const final = rawFinal === null ? null : round(rawFinal);
  return { visual, shape, texture, penalty, final, grade: rawFinal === null ? null : sizeMismatch ? 'D' : gradeFor(rawFinal), sizeMismatch, confidence: partial || major ? '低' : a.quality.some(q => q.severity === 'minor') ? '中' : '高', partial, estimated, sizeMode, assessedPoints: Math.round(assessedPoints * 100) / 100, assessedMax, differences, items };
}
