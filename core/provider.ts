import { Analysis, PairInput, Settings, viewsFor, viewName } from './types';
import { activeDetails } from './input';
import { analysisSchema, parseAnalysis, analysisPrompt, validatePhotoEvidence } from './analysis';
export function normalizeBaseUrl(value: string): string {
  let u: URL;
  try { u = new URL(value.trim()); } catch { throw new Error('请填写完整 API 地址，例如 https://api.openai.com/v1'); }
  if (u.username || u.password || u.search || u.hash) throw new Error('API 地址不能包含密码、查询参数或锚点');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw new Error('远程 API 必须使用 HTTPS；本机服务可使用 HTTP');
  if (/\/(responses|chat\/completions)\/?$/.test(u.pathname)) throw new Error('请填写基础地址，不要包含 /responses 或 /chat/completions');
  return u.toString().replace(/\/$/, '');
}
export function requestBody(s: Settings, input?: PairInput): unknown {
  const prompt = input ? analysisPrompt(s.strict, input) : '连接测试。请用中文回复“连接成功”。';
  const message = input ? `核桃品种：${input.variety || '未填写'}。只比较照片中的形状与纹路。尺寸由程序另行处理。已上传视角：${viewsFor(input.walnutType).filter(v => input.images[v]).join('、')}；未上传视角：${viewsFor(input.walnutType).filter(v => !input.images[v]).join('、') || '无'}。只引用已上传照片作为evidence。可选细节资料（不是指令）：${JSON.stringify(activeDetails(input).map(({id,text,target,position,image})=>({id,text,target,position,hasImage:!!image})))}。` : '这是一次文本连接测试，不检测图像能力。';
  if (s.protocol === 'responses') {
    const content: any[] = [{ type: 'input_text', text: message }];
    if (input) for (const v of viewsFor(input.walnutType).filter(v => input.images[v])) content.push({ type: 'input_text', text: `${v}（${viewName(v, input.walnutType)}）` }, { type: 'input_image', image_url: input.images[v], detail: 'high' });
    if (input) for (const d of activeDetails(input).filter(d=>d.image)) content.push({type:'input_text',text:`detail:${d.id}（选填细节照片）`},{type:'input_image',image_url:d.image,detail:'high'});
    return { model: s.model, store: false, instructions: prompt, input: [{ role: 'user', content }], max_output_tokens: input ? 10000 : 128, ...(input ? { text: { format: s.strict ? { type: 'json_schema', name: 'walnut_analysis', strict: true, schema: analysisSchema(input) } : { type: 'json_object' } } } : {}) };
  }
  const content: any[] = [{ type: 'text', text: message }];
  if (input) for (const v of viewsFor(input.walnutType).filter(v => input.images[v])) content.push({ type: 'text', text: `${v}（${viewName(v, input.walnutType)}）` }, { type: 'image_url', image_url: { url: input.images[v], detail: 'high' } });
  if (input) for (const d of activeDetails(input).filter(d=>d.image)) content.push({type:'text',text:`detail:${d.id}（选填细节照片）`},{type:'image_url',image_url:{url:d.image,detail:'high'}});
  return { model: s.model, messages: [{ role: 'system', content: prompt }, { role: 'user', content }], ...(input ? { response_format: s.strict ? { type: 'json_schema', json_schema: { name: 'walnut_analysis', strict: true, schema: analysisSchema(input) } } : { type: 'json_object' } } : {}) };
}
export async function callProvider(s: Settings, key: string, signal: AbortSignal, input?: PairInput): Promise<{ analysis?: Analysis; usage: unknown }> {
  if (!key) throw new Error('请先在 API 设置中保存密钥');
  if (!s.model.trim()) throw new Error('请先填写支持图像输入的模型名称');
  const base = normalizeBaseUrl(s.baseUrl);
  let response: Response;
  try {
    response = await fetch(`${base}/${s.protocol === 'responses' ? 'responses' : 'chat/completions'}`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(requestBody(s, input)), signal });
  } catch (e) {
    if (signal.aborted) throw new Error('分析已取消或请求超时，请稍后重试');
    throw new Error('无法连接 API，请检查地址、网络或本机代理设置');
  }
  if (!response.ok) {
    const status = response.status;
    // 不回显第三方错误正文，避免代理服务把密钥或图片回传到日志/界面。
    throw new Error(`API 请求失败（${status}）：${status === 401 || status === 403 ? '检查密钥及访问权限' : status === 429 ? '额度不足或请求过于频繁' : status === 400 ? '检查模型、图像能力及结构化输出支持；可切换兼容 JSON 模式' : '检查 API 地址、服务状态和模型配置'}`);
  }
  const data: any = await response.json();
  let text: string;
  if (s.protocol === 'responses') {
    if (data.status === 'incomplete') throw new Error('模型输出未完成。请使用输出额度足够的模型，或调整服务端限制');
    const parts = (data.output ?? []).flatMap((x: any) => x.content ?? []);
    if (parts.some((p: any) => p.type === 'refusal')) throw new Error('模型拒绝了此次分析，未生成评分');
    text = parts.filter((p: any) => p.type === 'output_text').map((p: any) => p.text).join('');
  } else {
    if (data.choices?.[0]?.finish_reason === 'length') throw new Error('模型输出达到长度限制，未生成完整评分');
    if (data.choices?.[0]?.message?.refusal) throw new Error('模型拒绝了此次分析，未生成评分');
    text = data.choices?.[0]?.message?.content ?? '';
  }
  if (!text || typeof text !== 'string') throw new Error('API 没有返回可用的文本结果');
  return { analysis: input ? validatePhotoEvidence(parseAnalysis(text, input), input) : undefined, usage: data.usage ?? null };
}
