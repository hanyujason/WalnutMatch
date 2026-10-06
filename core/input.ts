import { ALL_VIEWS, Detail, PairInput, viewsFor } from './types';
import { validateDimensions } from './rules';
export const MAX_DETAILS = 8;
function imageValid(value: unknown) { return typeof value === 'string' && value.length <= 8 * 1024 * 1024 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value); }
export function validateInput(input: PairInput) {
  if (!input || typeof input.name !== 'string' || input.name.length > 120 || typeof input.variety !== 'string' || input.variety.length > 80) throw new Error('样本名称或品种无效');
  if (input.walnutType !== undefined && !['two','three'].includes(input.walnutType)) throw new Error('请选择两棱或三棱');
  validateDimensions(input.dimensions);
  const views = viewsFor(input.walnutType);
  if (!input.images || typeof input.images !== 'object' || Array.isArray(input.images)) throw new Error('照片数据无效');
  for (const [v,image] of Object.entries(input.images)) {
    if (!ALL_VIEWS.includes(v as any) || image && !views.includes(v as any)) throw new Error('照片视角与核桃类型不匹配');
    if (image !== '' && image !== undefined && !imageValid(image)) throw new Error('请导入有效图片（单张小于6MB）');
  }
  if (!views.some(v => input.images[v])) throw new Error('请至少导入一张两颗同框的整体照片；细节图不能替代整体图');
  if (input.details !== undefined && (!Array.isArray(input.details) || input.details.length > MAX_DETAILS)) throw new Error(`细节补充最多${MAX_DETAILS}条`);
  const ids = new Set<string>();
  for (const d of input.details ?? []) {
    if (!d || typeof d.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(d.id) || ids.has(d.id) || typeof d.text !== 'string' || d.text.length > 2000 || typeof d.position !== 'string' || d.position.length > 120 || !['unknown','left','right','both'].includes(d.target) || typeof d.image !== 'string' || d.image && !imageValid(d.image)) throw new Error('细节补充内容或图片无效');
    ids.add(d.id);
  }
}
export const activeDetails = (input: PairInput): Detail[] => (input.details ?? []).filter(d => d.text.trim() || d.image);
