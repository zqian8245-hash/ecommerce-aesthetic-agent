import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const jsonBlock = p => '```json\n' + read(p).trim() + '\n```';
const content = [
  '# 美学专家Agent v2.3 完整可复制指令\n\n复制本文件全部内容给支持图像理解的模型，再实际提供poster_image和原始product_img。默认评价响应严格为单个JSON；图片制作及内部文件由主流程另行执行。视觉参考及好中差案例需另外实际附图，文字不代表图像已提供。\n',
  read('agent-prompt.md'), read('references/rubric.md'),
  '# 实际配置\n\n' + jsonBlock('config.json'),
  read('references/integration.md'), read('references/image-edit.md'), read('references/reference-library.md'), read('references/quality-calibration.md'),
  '# 固定输入Schema\n\n' + jsonBlock('schemas/input.schema.json'),
  '# 固定输出Schema\n\n' + jsonBlock('schemas/output.schema.json'),
  '# 内部观察Schema（只用于宿主记录）\n\n' + jsonBlock('schemas/review.schema.json')
].join('\n\n');
fs.writeFileSync(path.join(root, '完整可复制指令.md'), content, 'utf8');
console.log('Built v2 portable instructions');
