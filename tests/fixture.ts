import { Analysis, PairInput, VIEWS } from '../core/types';
import { METRICS } from '../core/rules';
export function fixture(level = 1): Analysis {
  return { summary: '测试分析', views: VIEWS.map(view => ({ view, similarities: '轮廓接近', differences: '局部有差异' })), quality: VIEWS.map(view => ({ view, usable: true, severity: 'none', issues: [] })), metrics: METRICS.map(m => ({ id: m.id, level, reason: '依据同框照片比较', evidence: ['front'] })) };
}
export function input(): PairInput { return { name: '测试', variety: '南疆石', dimensions: [{ edge: 41.8, belly: 41.6, height: 39.8 }, { edge: 42, belly: 41.8, height: 40 }], images: Object.fromEntries(VIEWS.map(v => [v, 'data:image/jpeg;base64,YQ=='])) as PairInput['images'] }; }
