import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeFor, scoreAnalysis, sizePenalty } from '../core/rules';
import { parseAnalysis } from '../core/analysis';
import { fixture, input } from './fixture';
test('尺寸扣分连续，0.5、1、2mm 边界正确', () => {
  for (const [d, p] of [[0,0],[.2,0],[.5,0],[.75,1.5],[1,3],[1.5,7.5],[2,12],[3,12]]) assert.ok(Math.abs(sizePenalty(d) - p) < 1e-8);
  assert.throws(() => sizePenalty(NaN));
});
test('南疆石模拟87分，0.2mm尺寸差不扣分；交换尺寸不影响评分', () => {
  const a = fixture(); a.metrics.find(m => m.id === 'bottom')!.level = 2; a.metrics.find(m => m.id === 'direction')!.level = 2;
  const ds = input().dimensions; const s = scoreAnalysis(a, ds);
  assert.equal(s.visual,87); assert.equal(s.penalty,0); assert.equal(s.final,87); assert.equal(s.grade,'A');
  assert.deepEqual(scoreAnalysis(a,[ds[1],ds[0]]),s);
});
test('任一尺寸差达到2mm触发D，但仍保留视觉分', () => {
  const s = scoreAnalysis(fixture(0),[{edge:39,belly:40,height:40},{edge:41,belly:40,height:40}]);
  assert.equal(s.visual,100); assert.equal(s.final,88); assert.equal(s.grade,'D'); assert.equal(s.sizeMismatch,true);
});
test('照片质量不扣配对分，缺失指标或不可用视角不给完整分', () => {
  const a = fixture(); a.quality[0].severity='minor'; a.quality[0].issues=['略倾斜'];
  assert.equal(scoreAnalysis(a,input().dimensions).final,90); assert.equal(scoreAnalysis(a,input().dimensions).confidence,'中');
  a.metrics[0].level=null; assert.equal(scoreAnalysis(a,input().dimensions).final,null);
  a.metrics[0].level=1; a.quality[0].usable=false; assert.equal(scoreAnalysis(a,input().dimensions).grade,null);
});
test('等级边界；尺寸浮点误差不会把0.5误判成超标', () => {
  for(const [n,g] of [[95,'S'],[94.99,'A'],[85,'A'],[84.99,'B'],[70,'B'],[69.99,'C'],[55,'C'],[54.99,'D']] as const) assert.equal(gradeFor(n),g);
  assert.equal(scoreAnalysis(fixture(),[{edge:39.1,belly:40,height:40},{edge:39.6,belly:40,height:40}]).penalty,0);
});
test('无效尺寸和差异档不能生成评分', () => {
  const a=fixture(); a.metrics[0].level=6; assert.throws(()=>scoreAnalysis(a,input().dimensions));
  assert.throws(()=>scoreAnalysis(fixture(),[{edge:NaN,belly:40,height:40},{edge:40,belly:40,height:40}]));
});
test('模型缺项、重复视角、非法等级和无照片依据均被拒绝', () => {
  assert.deepEqual(parseAnalysis(JSON.stringify(fixture())),fixture());
  const a=fixture(); a.metrics.pop(); assert.throws(()=>parseAnalysis(JSON.stringify(a)));
  const b=fixture(); b.views[1].view=b.views[0].view; assert.throws(()=>parseAnalysis(JSON.stringify(b)));
  const c=fixture(); c.metrics[0].level=1.5; assert.throws(()=>parseAnalysis(JSON.stringify(c)));
  const d=fixture(); d.metrics[0].evidence=[]; assert.throws(()=>parseAnalysis(JSON.stringify(d)));
});

test('结构错误指出固定字段，空数组成员不会造成未处理异常', () => {
  assert.throws(()=>parseAnalysis(JSON.stringify({summary:'说明',views:[],metrics:[]})),/quality/);
  const a:any=fixture();a.views[0]=null;assert.throws(()=>parseAnalysis(JSON.stringify(a)),/六个视角/);
  const b:any=fixture();b.metrics[0]=null;assert.throws(()=>parseAnalysis(JSON.stringify(b)),/指标/);
});
