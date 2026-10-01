import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KEYS = ['composition', 'hierarchy', 'color', 'typography', 'consistency', 'finish'];
const STRUCTURAL = ['composition', 'hierarchy', 'typography', 'consistency'];
const validString = x => typeof x === 'string' && x.trim().length > 0;
const check = (condition, message) => {if (!condition) throw new Error(message);};
const exact = (x, keys, label) => check(x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k)), `${label}: wrong fields`);
const textList = (x, label, min = 0) => check(Array.isArray(x) && x.length >= min && x.every(validString), `${label}: string array required`);

export function validateInput(input) {
  exact(input, ['poster_image', 'product_input'], 'input');
  check(validString(input.poster_image), 'poster_image: actual image reference required');
  const p = input.product_input;
  exact(p, ['product_img', 'selling_points', 'price_text', 'marketing_target', 'scene_tags'], 'product_input');
  for (const k of ['product_img', 'price_text', 'marketing_target']) check(validString(p[k]), `${k}: nonempty string required`);
  textList(p.selling_points, 'selling_points', 1); textList(p.scene_tags, 'scene_tags', 1);
}

function validateConfig(c) {
  check(c.schema_version === '2.0' && c.score_scale === 10 && c.score_step === 0.5, 'v2 requires 0..10 score scale and 0.5 step');
  check(Number.isFinite(c.total_threshold) && c.total_threshold >= 0 && c.total_threshold <= 10, 'invalid threshold');
  exact(c.dimensions, KEYS, 'dimensions');
  let sum = 0;
  for (const d of Object.values(c.dimensions)) {
    check(validString(d.label) && Number.isFinite(d.weight) && d.weight > 0 && Number.isFinite(d.threshold) && d.threshold >= 0 && d.threshold <= 10, 'invalid dimension');
    sum += d.weight;
  }
  check(Math.abs(sum - 100) < 1e-9, 'weights must sum to 100');
  check(['auto', 'refine', 'rebuild', 'redesign'].includes(c.redesign?.default), 'invalid redesign default');
  check(Number.isInteger(c.redesign.structural_failure_count) && c.redesign.structural_failure_count >= 1 && c.redesign.structural_failure_count <= 4, 'invalid structural_failure_count');
  check(Number.isFinite(c.redesign.naturalness_rebuild_below) && c.redesign.naturalness_rebuild_below >= 0 && c.redesign.naturalness_rebuild_below <= 10, 'invalid naturalness threshold');
}

function contextGate(context) {
  if (!context) return null;
  check(['standalone', 'integrated'].includes(context.mode), 'invalid context mode');
  check(validString(context.version), 'context version required');
  if (context.mode === 'standalone') return null;
  for (const name of ['hard_check', 'consumer']) {
    const gate = context[name];
    if (!gate || gate.version !== context.version || gate.status !== 'pass' || !validString(gate.report_ref))
      return {status: gate?.status === 'fail' && gate.version === context.version ? 'blocked_upstream' : 'pending_upstream', problem: `无法评价：缺少当前版本${name === 'hard_check' ? '硬性检查' : '消费者Agent'}的真实通过记录`, suggestion: '主流程补齐同版本上游评价后重新调用美学Agent'};
  }
  return null;
}

export function evaluate(input, review, config, context = null) {
  validateInput(input); validateConfig(config);
  const protectedContent = ['商品主体：以product_img为身份依据，保护包装、标签、形状和比例', ...input.product_input.selling_points.map(x => `卖点原文：${x}`), `价格文案：${input.product_input.price_text}`, '可确认的Logo及必要活动事实（如存在）：从原素材保留，不重绘'];
  const labels = KEYS.map(k => config.dimensions[k].label);
  const result = {
    public: {agent_name: 'aesthetic_agent', score: 0, pass: false, problem_list: [], modify_suggestion: [], protected_content: protectedContent, meta: {judge_dimensions: labels, confidence: 0}},
    internal: {schema_version: '2.0', status: 'incomplete', score_unrounded: null, threshold: config.total_threshold, dimensions: [], below_threshold: [], config_snapshot: config, design_plan: null, generation_assets_ready: false, overall_qualified: false}
  };
  const halt = (status, problem, suggestion) => {
    result.internal.status = status;
    result.public.problem_list.push(problem); result.public.modify_suggestion.push(suggestion);
    return result;
  };
  const gate = contextGate(context);
  if (gate) return halt(gate.status, gate.problem, gate.suggestion);
  check(review && review.schema_version === '2.0', 'v2 internal review required');
  for (const k of ['poster_inspected', 'product_inspected', 'generation_assets_ready']) check(typeof review[k] === 'boolean', `${k}: boolean required`);
  check(validString(review.source_poster) && validString(review.source_product), 'review image binding required');
  check(review.source_poster === input.poster_image && review.source_product === input.product_input.product_img, 'review source image mismatch');
  if (!review.poster_inspected || !review.product_inspected)
    return halt('incomplete', '无法评价：当前海报或原始商品图尚未实际查看', '提供可读取的两张原图，实际查看后重新评价；不要用旧海报代替商品母本');
  check(['pass', 'fail', 'unverified'].includes(review.protected_content_check), 'invalid protected content status');
  exact(review.dimensions, KEYS, 'review dimensions');
  check(Array.isArray(review.issues), 'issues array required');
  const ids = new Set();
  for (const issue of review.issues) {
    exact(issue, ['id', 'dimension', 'priority', 'problem', 'suggestion'], 'issue');
    check(validString(issue.id) && !ids.has(issue.id), 'unique issue IDs required'); ids.add(issue.id);
    check(KEYS.includes(issue.dimension) && ['P0', 'P1', 'P2'].includes(issue.priority), 'invalid issue dimension/priority');
    check(validString(issue.problem) && validString(issue.suggestion), 'problem and corresponding suggestion required');
  }
  if (review.protected_content_check === 'fail') check(review.issues.some(x => x.priority === 'P0'), 'content failure requires P0 evidence/action');
  let total = 0, confidence = 0, missing = false;
  for (const k of KEYS) {
    const d = review.dimensions[k], rule = config.dimensions[k];
    exact(d, ['score', 'evidence', 'confidence'], `dimension ${k}`);
    check(validString(d.evidence), `evidence required: ${k}`);
    check(Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1, `invalid confidence: ${k}`);
    check(d.score === null || (Number.isFinite(d.score) && d.score >= 0 && d.score <= 10 && Number.isInteger(d.score * 2)), `invalid score: ${k}`);
    const pass = d.score === null ? null : d.score >= rule.threshold;
    result.internal.dimensions.push({key: k, label: rule.label, score: d.score, threshold: rule.threshold, gap: d.score === null ? null : Math.max(0, rule.threshold - d.score), pass, evidence: d.evidence, confidence: d.confidence});
    if (d.score === null) missing = true;
    else total += d.score * rule.weight / 100;
    confidence += d.confidence * rule.weight / 100;
    if (pass === false) {
      result.internal.below_threshold.push(k);
      check(review.issues.some(x => x.dimension === k && ['P0', 'P1'].includes(x.priority)), `low dimension requires issue/action: ${k}`);
    }
  }
  if (missing) return halt('incomplete', '无法评价：至少一个维度缺少可见依据；不能计算完整总分', '补齐该维度所需的清晰图像或场景依据后重评');
  const plan = review.design_plan;
  exact(plan, ['strategy', 'direction', 'product_presentation', 'layout', 'typography', 'palette', 'background', 'lighting', 'remove_elements', 'preserve_additional'], 'design_plan');
  check(['auto', 'refine', 'rebuild', 'redesign'].includes(plan.strategy), 'invalid strategy');
  for (const k of ['direction', 'product_presentation', 'layout', 'typography', 'palette', 'background', 'lighting']) check(validString(plan[k]), `design plan ${k} required`);
  textList(plan.remove_elements, 'remove_elements'); textList(plan.preserve_additional, 'preserve_additional');
  result.public.protected_content.push(...plan.preserve_additional);
  const order = {refine: 0, rebuild: 1, redesign: 2};
  const structural = STRUCTURAL.filter(k => result.internal.below_threshold.includes(k)).length;
  const naturalnessFailure = review.dimensions.finish.score < config.redesign.naturalness_rebuild_below;
  const automatic = naturalnessFailure ? 'redesign' : structural >= config.redesign.structural_failure_count ? 'rebuild' : 'refine';
  const configured = config.redesign.default === 'auto' ? automatic : config.redesign.default;
  const proposed = plan.strategy === 'auto' ? configured : plan.strategy;
  const strategy = order[proposed] >= order[configured] ? proposed : configured;
  result.internal.design_plan = {...plan, strategy, strategy_reason: {structural_failed_count: structural, naturalness_failure: naturalnessFailure, model_proposal: plan.strategy}};
  result.internal.generation_assets_ready = review.generation_assets_ready;
  result.internal.score_unrounded = total;
  result.public.score = Math.round((total + 1e-10) * 100) / 100;
  result.public.meta.confidence = Math.round(confidence * 100) / 100;
  const aestheticPass = total + 1e-9 >= config.total_threshold && result.internal.below_threshold.length === 0;
  const hardFailure = review.protected_content_check === 'fail' || review.issues.some(x => x.priority === 'P0');
  result.public.pass = aestheticPass && !hardFailure && review.protected_content_check === 'pass';
  result.internal.status = hardFailure ? 'content_failure' : review.protected_content_check === 'unverified' ? 'content_unverified' : result.public.pass ? 'pass' : 'revise';
  result.internal.overall_qualified = result.public.pass && context?.mode === 'integrated';
  for (const issue of [...review.issues].sort((a, b) => a.priority.localeCompare(b.priority))) {
    result.public.problem_list.push(`[${config.dimensions[issue.dimension].label}/${issue.priority}] ${issue.problem}`);
    result.public.modify_suggestion.push(issue.suggestion);
  }
  if (!aestheticPass && result.internal.below_threshold.length === 0) {
    result.public.problem_list.push(`各单项达到各自门槛，但加权总分${result.public.score}低于${config.total_threshold}`);
    result.public.modify_suggestion.push(`按${plan.direction}整合视觉关系，具体执行：${plan.layout}；${plan.typography}；根据实际新图复评，不靠抬高评分过线`);
  }
  if (review.protected_content_check === 'unverified') {
    result.public.problem_list.push('商品、价格、卖点或确认Logo的内容保护核验尚未完成');
    result.public.modify_suggestion.push('逐项对照product_img与product_input核验；缺少Logo母本时补原素材，完成前不判通过');
  }
  if (strategy !== 'refine' && !result.public.pass) {
    result.public.problem_list.push(`现有视觉方案需要${strategy === 'redesign' ? '整体重新设计' : '重新组织构图与信息结构'}，局部微调不足以解决主要问题`);
    result.public.modify_suggestion.push(`重构方向：${plan.direction}；商品呈现：${plan.product_presentation}；布局：${plan.layout}；移除：${plan.remove_elements.join('、') || '仅删除无信息作用的元素'}；保护商品身份与输入事实，允许换背景、字体、配色及位置`);
  }
  return result;
}

export function buildPrompt(input, result, context = null) {
  const x = result.internal, p = input.product_input, plan = x.design_plan;
  if (!plan || !x.generation_assets_ready) return `当前未生成图片。\n状态：${x.status}\n需要原始商品/Logo等可保留素材与完整观察，再形成可执行制作方案。\n评价输出保存在agent-result.json；不能用提示词声明代替素材保护能力。\n`;
  const mode = plan.strategy === 'redesign' ? '围绕原始商品重新设计海报，可大幅改变旧海报的构图、背景、字体、配色与光影。图1不是必须模仿的风格模板。' : plan.strategy === 'rebuild' ? '重建构图与信息层级，允许重做背景和排版，而非小幅百分比调整。' : '现有方向成立，按具体问题做局部精修。';
  const canvas = context?.canvas;
  if (canvas) check(Number.isInteger(canvas.width) && canvas.width > 0 && Number.isInteger(canvas.height) && canvas.height > 0 && validString(canvas.format), 'invalid measured canvas');
  return `任务：${mode}\n\n实际图像输入：\n图1 当前海报：${input.poster_image}\n图2 原始商品图：${p.product_img}\n执行时必须附上真实图像，路径文本不代替图像输入。图2是商品身份依据，商品不允许由图1中的生成物替代。\n\n营销目标：${p.marketing_target}\nC组场景标签：${p.scene_tags.join('、')}\n\n本轮统一设计方向：${plan.direction}\n商品呈现：${plan.product_presentation}\n信息架构：${plan.layout}\n字体与排版：${plan.typography}\n配色：${plan.palette}\n背景：${plan.background}\n光照/材质：${plan.lighting}\n去除的非必要元素：${plan.remove_elements.join('、') || '无指定删除项，按方案控制道具'}\n\n必须逐字保留的价格文案：${JSON.stringify(p.price_text)}\n必须保留的卖点原文：\n${p.selling_points.map(s => '- ' + JSON.stringify(s)).join('\n')}\n其他保护项：\n${result.public.protected_content.map(s => '- ' + s).join('\n')}\n\n具体问题与修改：\n${result.public.problem_list.map((s, i) => `${i + 1}. ${s}\n   动作：${result.public.modify_suggestion[i]}`).join('\n')}\n\n可以移动和等比例缩放真实商品、重排全部文案，但不得更改包装、标签、商品形状或价格数字。原始商品与Logo优先真实素材合成，文字精确排版；不生成微小标签假字，不新增卖点或功效承诺。改善塑料高光、透视/阴影矛盾和无功能装饰，保持所选场景的合理表达，不一律改成极简米白背景。\n输出一张新候选图，${canvas ? `${canvas.width}×${canvas.height}，${canvas.format}` : '保持当前海报实际宽高比，尺寸由制作阶段读取实际图像元数据确认'}。工具无法支持精确素材保留/尺寸时记录限制。\n验收：核对原商品、所有卖点、价格、确认Logo及必要活动信息；查看新图并按相同量表重新评分。任何身份或事实变化都不得判pass=true。\n`;
}

export function buildReport(result) {
  const x = result.internal, y = result.public;
  const escape = s => String(s ?? '缺失').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return `# v2内部美学评价\n\n状态：${x.status}；总分：${x.score_unrounded === null ? '未评价（对外0是占位）' : y.score + '/10'}；标准：${x.threshold}；pass=${y.pass}。\n\n| 维度 | 分数 | 门槛 | 差距 | 依据 |\n|---|---:|---:|---:|---|\n${x.dimensions.map(d => `| ${d.label} | ${d.score ?? '无法评价'} | ${d.threshold} | ${d.gap ?? '—'} | ${escape(d.evidence)} |`).join('\n')}\n\n重构强度：${x.design_plan?.strategy || '未形成方案'}。\n\n${y.problem_list.map((s, i) => `- ${s}\n  修改：${y.modify_suggestion[i]}`).join('\n\n')}\n\n对外接口仅agent-result.json，本文和redesign-prompt.txt均为独立内部产物。脚本不生成图片，不证明素材已经正确保留。\n`;
}

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    check(['--input', '--review', '--config', '--context', '--references', '--quality-examples', '--out'].includes(process.argv[i]) && process.argv[i + 1], 'Use --input INPUT --review REVIEW --out DIR [--config CONFIG] [--context CONTEXT] [--references MATCH] [--quality-examples MATCH]');
    args[process.argv[i].slice(2)] = process.argv[i + 1];
  }
  check(args.input && args.review && args.out, 'input, review and out required');
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  const input = read(args.input), config = read(args.config || path.join(ROOT, 'config.json'));
  const context = args.context ? read(args.context) : null;
  const result = evaluate(input, read(args.review), config, context);
  const references = args.references ? read(args.references) : null;
  if (references) {
    check(JSON.stringify(references.input_scene_tags) === JSON.stringify(input.product_input.scene_tags), 'reference scene tags mismatch');
    check(references.library_version === '2.2' && Array.isArray(references.cases), 'invalid reference match');
    const index = read(path.join(ROOT, 'reference-library/index.json'));
    for (const c of references.cases) {
      const original = index.cases.find(x => x.case_id === c.case_id);
      check(original && original.image_path === c.image_path && original.image_sha256 === c.image_sha256, 'unknown or altered reference case');
    }
  }
  const output = path.resolve(args.out);
  const quality = args['quality-examples'] ? read(args['quality-examples']) : null;
  if (quality) {
    check(quality.use_mode === 'preference_calibration_not_numeric_ground_truth' && Array.isArray(quality.selected_cases), 'invalid quality match');
    const manifest = read(path.join(ROOT, 'reference-library/quality-cases/manifest.json'));
    for (const c of quality.selected_cases) {
      const original = manifest.cases.find(x => x.case_id === c.case_id);
      check(original && original.split === 'calibration' && original.image_path === c.image_path && original.image_sha256 === c.image_sha256 && original.user_quality_label === c.user_quality_label, 'unknown, altered or reserved quality case');
    }
  }
  const files = {'agent-result.json': JSON.stringify(result.public, null, 2), 'assessment-internal.json': JSON.stringify(result.internal, null, 2), 'redesign-plan.json': JSON.stringify(result.internal.design_plan, null, 2), 'report-internal.md': buildReport(result), 'redesign-prompt.txt': buildPrompt(input, result, context)};
  if (references) {
    files['reference-match.json'] = JSON.stringify(references, null, 2);
    if (result.internal.design_plan && result.internal.generation_assets_ready) files['redesign-prompt.txt'] += '\n视觉参考（不是分数标准）：\n' + JSON.stringify(references, null, 2) + '\n先实际查看所选案例图，选择一条统一方向，仅借鉴构图、信息层级及材质光线，不复制参考商品、Logo、文案或功效。跨品类仅借视觉关系。原始商品图始终为身份依据。图片路径相对于Agent包根目录；宿主须读取真实图像。规则为建议，不替代本轮设计判断及内容核验。\n';
  }
  if (quality) {
    files['quality-match.json'] = JSON.stringify(quality, null, 2);
    if (result.internal.design_plan && result.internal.generation_assets_ready) files['redesign-prompt.txt'] += '\n用户偏好案例：\n' + JSON.stringify(quality, null, 2) + '\n执行前查看实际案例图，借正例的视觉关系、避负例的具体缺陷；禁止按类别预设分数，不复制商品、文案或Logo。只能选一个统一方向，严格保护本轮输入事实。\n';
  }
  fs.mkdirSync(output, {recursive: true});
  for (const name of Object.keys(files)) check(!fs.existsSync(path.join(output, name)), `Refusing overwrite: ${name}; use a new version directory`);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(output, name), data + '\n', {encoding: 'utf8', flag: 'wx'});
  process.stdout.write(JSON.stringify(result.public, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {main();} catch (e) {process.stderr.write(e.message + '\n'); process.exitCode = 1;}
}
