import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisPrompt, analysisSchema, parseAnalysis, validatePhotoEvidence } from '../core/analysis';
import { validateInput } from '../core/input';
import { scoreAnalysis, validateDimensions } from '../core/rules';
import { requestBody } from '../core/provider';
import { Analysis, Dimensions, Settings, THREE_VIEWS } from '../core/types';
import { fixture, input } from './fixture';
const blank = (): [Dimensions, Dimensions] => [{edge:null,belly:null,height:null},{edge:null,belly:null,height:null}];
const settings: Settings = {baseUrl:'https://example.test/v1',model:'mock',protocol:'chat',strict:false,hasKey:true};
function triple() {
  const p=input();p.walnutType='three';p.images.side3=p.images.front;p.images.edge3=p.images.front;
  const a:Analysis={...fixture(),views:THREE_VIEWS.map(view=>({view,similarities:'布局相近',differences:'局部差异'})),quality:THREE_VIEWS.map(view=>({view,usable:true,severity:'none',issues:[]}))};
  return {p,a};
}
test('尺寸全空正常视觉评级，confidence与完整尺寸一致',()=>{
  const s=scoreAnalysis(fixture(),blank());
  assert.equal(s.final,90);assert.equal(s.grade,'A');assert.equal(s.sizeMode,'none');assert.equal(s.penalty,0);assert.equal(s.confidence,'高');assert.equal(s.estimated,false);
  assert.deepEqual(s.differences,{edge:null,belly:null,height:null});
});
test('只比较双方已填的相同尺寸，单方填写不当成0',()=>{
  const s=scoreAnalysis(fixture(),[{edge:40,belly:42,height:null},{edge:41,belly:null,height:null}]);
  assert.equal(s.penalty,3);assert.equal(s.final,87);assert.equal(s.sizeMode,'partial');assert.equal(s.differences.edge,1);assert.equal(s.differences.belly,null);
  const lone=scoreAnalysis(fixture(),[{edge:40,belly:null,height:null},{edge:null,belly:null,height:null}]);assert.equal(lone.sizeMode,'none');assert.equal(lone.penalty,0);
});
test('整数与小数等价，0负数NaN字符串及缺少字段仍拒绝',()=>{
  assert.equal(scoreAnalysis(fixture(),[{edge:40,belly:null,height:null},{edge:40.0,belly:null,height:null}]).penalty,0);
  for(const edge of [0,-1,NaN,Infinity,101,'40',undefined]) assert.throws(()=>validateDimensions([{edge,belly:null,height:null},{edge:null,belly:null,height:null}]));
});
test('三棱8视角结构有效，缺少第3视角仍只能暂评',()=>{
  const {p,a}=triple();validateInput(p);assert.deepEqual(parseAnalysis(JSON.stringify(a),p),a);
  assert.equal(scoreAnalysis(a,p.dimensions,true,'three').partial,false);
  const short={...a,quality:a.quality.filter(q=>q.view!=='edge3')};assert.equal(scoreAnalysis(short,p.dimensions,true,'three').estimated,true);
  assert.throws(()=>parseAnalysis(JSON.stringify(fixture()),p),/8个视角/);
});
test('三棱提示按布局对应比较，保持原权重；两种协议传8图',()=>{
  const {p}=triple();assert.match(analysisPrompt(false,p),/正奔对正奔、Y字对Y字/);
  assert.match(analysisPrompt(false,p),/同类布局不直接等于高相似度/);
  for(const protocol of ['responses','chat'] as const){
    const b:any=requestBody({...settings,protocol,strict:true},p);
    const content=protocol==='chat'?b.messages[1].content:b.input[0].content;
    assert.equal(content.filter((x:any)=>['input_image','image_url'].includes(x.type)).length,8);
    const schema:any=analysisSchema(p);assert.equal(schema.properties.views.items.properties.view.enum.length,8);
  }
});
test('无补充和空补充不会改变得分或可信度，细节图片只能辅助',()=>{
  const p=input();p.details=[];assert.deepEqual(scoreAnalysis(validatePhotoEvidence(fixture(),p),blank()),scoreAnalysis(fixture(),blank()));
  p.details=[{id:'extra1',text:'用户描述：有黄',target:'left',position:'顶部',image:p.images.front!}];
  const a={...fixture(),details:[{id:'extra1',observation:'可见偏黄区域，仅备注'}]};
  a.metrics[0].evidence.push('detail:extra1');
  assert.deepEqual(parseAnalysis(JSON.stringify(a),p),a);
  assert.equal(scoreAnalysis(validatePhotoEvidence(a,p),blank()).final,90);
  p.images.top='';const missing=validatePhotoEvidence(a,p);assert.equal(missing.metrics.find(m=>m.id==='top')?.level,null);assert.equal(scoreAnalysis(missing,blank(),true).estimated,true);
});
test('文字描述不能冒充确认事实；未知细节或无图补充不能作为视觉证据',()=>{
  const p=input();p.details=[{id:'note',text:'我说有黄',target:'unknown',position:'',image:''}];
  const a={...fixture(),details:[{id:'note',observation:'模型声称已确认'}]};
  assert.match(validatePhotoEvidence(parseAnalysis(JSON.stringify(a),p),p).details![0].observation,/仅用户描述/);
  a.metrics[0].evidence=['detail:note'];assert.throws(()=>parseAnalysis(JSON.stringify(a),p),/照片依据/);
});
test('细节图片请求携带独立ID，用户文字作为资料，尺寸不送视觉模型',()=>{
  const p=input();p.details=[{id:'one',text:'局部纹路',target:'both',position:'棱',image:p.images.front!},{id:'empty',text:'',target:'unknown',position:'',image:''}];
  for(const protocol of ['responses','chat'] as const){
    const b:any=requestBody({...settings,protocol},p);const c=protocol==='chat'?b.messages[1].content:b.input[0].content;
    assert.equal(c.filter((x:any)=>['input_image','image_url'].includes(x.type)).length,7);
    assert.ok(c.some((x:any)=>x.text?.includes('detail:one')));assert.ok(!c[0].text.includes('empty'));assert.ok(!c[0].text.includes('41.8'));
  }
});
test('输入验证拒绝类型不匹配、细节代替整体图、重复ID及过量补充',()=>{
  const p=input();p.walnutType='two';p.images.edge3=p.images.front;assert.throws(()=>validateInput(p),/不匹配/);
  p.images={};p.details=[{id:'a',text:'',target:'both',position:'',image:'data:image/png;base64,YQ=='}];assert.throws(()=>validateInput(p),/整体照片/);
  p.images=input().images;p.details.push(p.details[0]);assert.throws(()=>validateInput(p),/细节补充/);
  p.details=Array.from({length:9},(_,i)=>({id:String(i),text:'说明',target:'unknown',position:'',image:''}));assert.throws(()=>validateInput(p),/最多8条/);
});
test('旧分析不含细节字段仍可读，两棱默认模板不需要迁移',()=>{
  const legacy:any=fixture();delete legacy.details;assert.deepEqual(parseAnalysis(JSON.stringify(legacy)).details,[]);
  const p=input();delete p.walnutType;validateInput(p);assert.equal(scoreAnalysis(fixture(),p.dimensions).final,90);
});
