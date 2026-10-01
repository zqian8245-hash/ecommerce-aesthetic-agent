import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluate, buildPrompt, validateInput, KEYS} from '../scripts/evaluate.mjs';
const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const config = read('../config.json'), input = read('../templates/input.json'), demo = read('../examples/review-v2.demo.json');
const clone = x => structuredClone(x);
function reviewWith(value) {
  const r = clone(demo); r.issues = []; r.design_plan.strategy = 'auto';
  for (const k of KEYS) {
    r.dimensions[k].score = value;
    if (value < 8) r.issues.push({id: k, dimension: k, priority: 'P1', problem: `可见${k}缺陷`, suggestion: `执行${k}具体修复`});
  }
  return r;
}
function low(r, k, value) {
  r.dimensions[k].score = value;
  r.issues.push({id: k, dimension: k, priority: 'P1', problem: `可见${k}缺陷`, suggestion: `执行${k}具体修复`});
}

test('public result has exactly specified fields and aesthetic role', () => {
  const r = evaluate(input, demo, config);
  assert.deepEqual(Object.keys(r.public), ['agent_name','score','pass','problem_list','modify_suggestion','protected_content','meta']);
  assert.deepEqual(Object.keys(r.public.meta), ['judge_dimensions','confidence']);
  assert.equal(r.public.agent_name, 'aesthetic_agent'); assert.equal(r.public.score, 6.7);
  assert.equal(r.public.problem_list.length, r.public.modify_suggestion.length);
  assert.equal(r.public.pass, false); assert.equal(r.internal.design_plan.strategy, 'redesign');
});
test('reject legacy or extra business input fields', () => {
  assert.throws(() => validateInput({...input, run_id: 'x'}), /wrong fields/);
  const i = clone(input); i.product_input.logo = 'logo'; assert.throws(() => validateInput(i), /wrong fields/);
});
test('missing original product image is rejected', () => {
  const i = clone(input); i.product_input.product_img = ''; assert.throws(() => validateInput(i), /product_img/);
});
test('strict boundary 8.5 passes, standalone never claims overall project qualification', () => {
  const r = evaluate(input, reviewWith(8.5), config);
  assert.equal(r.public.score, 8.5); assert.equal(r.public.pass, true); assert.equal(r.internal.overall_qualified, false);
});
test('all dimensions at 8 do not meet strict total', () => {
  const r = evaluate(input, reviewWith(8), config);
  assert.equal(r.public.score, 8); assert.equal(r.public.pass, false);
  assert.equal(r.internal.below_threshold.length, 0); assert.ok(r.public.problem_list[0].includes('加权总分'));
});
test('high total cannot conceal failed dimension', () => {
  const raw = reviewWith(10); low(raw, 'finish', 7.5);
  const r = evaluate(input, raw, config);
  assert.equal(r.public.score, 9.75); assert.equal(r.public.pass, false);
});
test('display rounding does not promote pass', () => {
  const raw = reviewWith(8.5); raw.dimensions.hierarchy.score = 8; raw.dimensions.color.score = 9;
  const c = clone(config); c.dimensions.color.weight = 19; c.dimensions.finish.weight = 6;
  const r = evaluate(input, raw, c);
  assert.equal(r.public.score, 8.5); assert.ok(r.internal.score_unrounded < 8.5); assert.equal(r.public.pass, false);
});
test('unviewed image produces explicit zero/confidence-zero incomplete sentinel', () => {
  const raw = clone(demo); raw.product_inspected = false;
  const r = evaluate(input, raw, config);
  assert.equal(r.public.score, 0); assert.equal(r.public.meta.confidence, 0); assert.equal(r.internal.status, 'incomplete');
  assert.ok(r.public.problem_list[0].startsWith('无法评价'));
});
test('review cannot be reused with another source image', () => {
  const raw = clone(demo); raw.source_product = 'different.png'; assert.throws(() => evaluate(input, raw, config), /mismatch/);
});
test('missing score does not renormalize weights', () => {
  const raw = reviewWith(9); raw.dimensions.color.score = null;
  const r = evaluate(input, raw, config);
  assert.equal(r.public.score, 0); assert.equal(r.internal.score_unrounded, null); assert.equal(r.public.pass, false);
});
test('two structural failures automatically permit rebuilding', () => {
  const raw = reviewWith(9); low(raw, 'composition', 7); low(raw, 'hierarchy', 7); raw.design_plan.strategy = 'refine';
  assert.equal(evaluate(input, raw, config).internal.design_plan.strategy, 'rebuild');
});
test('poor natural material quality automatically permits redesign', () => {
  const raw = reviewWith(9); low(raw, 'finish', 6.5);
  assert.equal(evaluate(input, raw, config).internal.design_plan.strategy, 'redesign');
});
test('explicit redesign is not reduced to local edits', () => {
  const raw = reviewWith(9); raw.design_plan.strategy = 'redesign';
  assert.equal(evaluate(input, raw, config).internal.design_plan.strategy, 'redesign');
});
test('content failure cannot be hidden by high aesthetic score', () => {
  const raw = reviewWith(9.5); raw.protected_content_check = 'fail';
  raw.issues.push({id:'P0',dimension:'finish',priority:'P0',problem:'价格与母本不一致',suggestion:'使用输入价格原文重新排版'});
  const r = evaluate(input, raw, config);
  assert.equal(r.public.score, 9.5); assert.equal(r.public.pass, false); assert.equal(r.internal.status, 'content_failure');
});
test('unverified content cannot pass', () => {
  const raw = reviewWith(9); raw.protected_content_check = 'unverified';
  const r = evaluate(input, raw, config); assert.equal(r.public.pass, false); assert.equal(r.internal.status, 'content_unverified');
});
test('integrated gates are context, must match the current version', () => {
  const context = {mode:'integrated',version:'v2',hard_check:{version:'v1',status:'pass',report_ref:'h'},consumer:{version:'v2',status:'pass',report_ref:'c'}};
  const r = evaluate(input, reviewWith(9), config, context);
  assert.equal(r.public.pass, false); assert.equal(r.internal.status, 'pending_upstream');
});
test('real same-version upstream records and aesthetic pass qualify', () => {
  const context = {mode:'integrated',version:'v2',hard_check:{version:'v2',status:'pass',report_ref:'h'},consumer:{version:'v2',status:'pass',report_ref:'c'}};
  assert.equal(evaluate(input, reviewWith(9), config, context).internal.overall_qualified, true);
});
test('redesign prompt is separate, includes both actual references and literal copy', () => {
  const i = clone(input); i.product_input.price_text = '售价 ¥199，满2件9折'; i.product_input.selling_points = ['卖点"原文"'];
  const raw = clone(demo);
  const r = evaluate(i, raw, config), prompt = buildPrompt(i, r);
  assert.ok(prompt.includes(i.poster_image)); assert.ok(prompt.includes(i.product_input.product_img));
  assert.ok(prompt.includes('售价 ¥199，满2件9折')); assert.ok(prompt.includes(JSON.stringify(i.product_input.selling_points[0])));
  assert.ok(prompt.includes('重新设计')); assert.equal(Object.hasOwn(r.public, 'prompt'), false);
});
test('no asset readiness does not promise an executable image result', () => {
  const raw = clone(demo); raw.generation_assets_ready = false;
  assert.ok(buildPrompt(input, evaluate(input, raw, config)).includes('当前未生成图片'));
});
test('reject invalid scores, confidence, weight and missing low-score actions', () => {
  const raw = clone(demo); raw.dimensions.finish.score = 11; assert.throws(() => evaluate(input, raw, config));
  raw.dimensions.finish.score = 6; raw.dimensions.finish.confidence = 1.2; assert.throws(() => evaluate(input, raw, config));
  const c = clone(config); c.dimensions.finish.weight = 11; assert.throws(() => evaluate(input, demo, c), /sum to 100/);
  const raw2 = reviewWith(9); raw2.dimensions.finish.score = 6; assert.throws(() => evaluate(input, raw2, config), /requires issue/);
});
