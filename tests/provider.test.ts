import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { callProvider, normalizeBaseUrl, requestBody } from '../core/provider';
import { Settings } from '../core/types';
import { fixture, input } from './fixture';
const settings: Settings = { baseUrl:'https://api.openai.com/v1',model:'vision-test',protocol:'responses',strict:true,hasKey:true };
test('接口地址限制，拒绝凭证/查询和不安全远程HTTP',()=>{
  assert.equal(normalizeBaseUrl(' https://api.openai.com/v1/ '),'https://api.openai.com/v1');
  for(const s of ['http://example.com/v1','https://x/v1?key=secret','https://a:b@x/v1','https://x/v1/responses']) assert.throws(()=>normalizeBaseUrl(s));
});
test('两种协议均携带六张图片，不把价格/评级/尺寸交给视觉模型',()=>{
  const r:any=requestBody(settings,input()); assert.equal(r.input[0].content.filter((x:any)=>x.type==='input_image').length,6); assert.equal(r.store,false);
  const c:any=requestBody({...settings,protocol:'chat'},input()); assert.equal(c.messages[1].content.filter((x:any)=>x.type==='image_url').length,6);
  assert.equal(c.response_format.type,'json_schema');
  assert.equal((requestBody({...settings,strict:false},input()) as any).text.format.type,'json_object');
});
test('真实HTTP流程覆盖两种协议解析、认证失败和取消', async()=>{
  let mode='ok'; const seen:any[]=[];
  const server=http.createServer(async(req,res)=>{
    let body=''; for await(const chunk of req) body+=chunk;
    seen.push({url:req.url,body:JSON.parse(body),auth:req.headers.authorization});
    if(mode==='401'){res.writeHead(401);res.end('secret-should-not-leak');return;}
    if(mode==='slow')return;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('responses')?{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fixture())}]}],usage:{input_tokens:1}}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture())}}]}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as any).port; const s={...settings,baseUrl:`http://127.0.0.1:${port}/v1`};
  try {
    assert.deepEqual((await callProvider(s,'test-key',new AbortController().signal,input())).analysis,fixture());
    assert.deepEqual((await callProvider({...s,protocol:'chat',strict:false},'test-key',new AbortController().signal,input())).analysis,fixture());
    assert.equal(seen[0].auth,'Bearer test-key');
    mode='401'; await assert.rejects(callProvider(s,'test-key',new AbortController().signal,input()),e=>e instanceof Error&&e.message.includes('401')&&!e.message.includes('secret-should-not-leak'));
    mode='slow';const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),50); await assert.rejects(callProvider(s,'test-key',ctl.signal,input()),/取消或请求超时/);clearTimeout(timer);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('兼容JSON模式在两种协议中显式提供完整结构和示例', () => {
  for (const protocol of ['chat', 'responses'] as const) {
    const body:any=requestBody({...settings,protocol,strict:false},input());
    const prompt=protocol==='chat'?body.messages[0].content:body.instructions;
    assert.ok(prompt.includes('JSON Schema'));
    assert.ok(prompt.includes('仅演示完整字段'));
    for (const key of ['summary','views','quality','metrics','usable','severity','issues','level','reason','evidence']) assert.ok(prompt.includes(`"${key}"`));
    for (const id of fixture().metrics.map(m=>m.id)) assert.ok(prompt.includes(`"id":"${id}"`));
    assert.ok(prompt.includes('不能照抄'));
  }
});

test('部分照片只发送实际上传图片，两种协议显式列出缺失视角',()=>{
  const pair=input(); pair.images.back='';pair.images.left='';pair.images.right='';
  for (const protocol of ['chat','responses'] as const) {
    const b:any=requestBody({...settings,protocol,strict:false},pair);
    const content=protocol==='chat'?b.messages[1].content:b.input[0].content;
    assert.equal(content.filter((x:any)=>['image_url','input_image'].includes(x.type)).length,3);
    assert.match(content[0].text,/未上传视角：back、left、right/);
  }
});
