# 电商海报美学 Agent

小组D模块的美学评价与改图反馈，当前迭代规则为v2.4。输入当前海报、原始商品素材和产品营销信息，返回固定JSON；内部保存六维依据、问题、修改建议、制作提示词与迭代记录。

## 核心规则

- 六维权重：构图20%、层级20%、配色15%、排版20%、场景适配15%、完成度10%。
- 总分≥8.5、各项≥8，且商品身份、Logo、价格及卖点内容保护通过，才判正式通过。
- 最多8轮；连续2轮相对历史最佳提升不足0.2时换设计方向，继续剩余预算；始终保存最高分候选。
- 允许大幅重构构图、字体、背景、配色和光线，禁止改写真实商品、价格及卖点。
- 缺少实际图像或正式依据时不得编造完成评价；对外score=0可表示未评价占位，真实视觉诊断另存内部文件。

## 使用

先阅读[SKILL.md](SKILL.md)、[完整指令](agent-prompt.md)和[开始使用](START_HERE.md)。宿主需提供支持图像理解的模型及图像制作工具。Node脚本只做检索、校验、分数计算及文件输出，不直接调用模型或生成图片。

```sh
node scripts/match-references.mjs --input task/input.json --out task/reference-match.json
node scripts/match-quality-examples.mjs --category cleaning --out task/quality-match.json
node scripts/evaluate.mjs --input task/input.json --review task/review.json --references task/reference-match.json --quality-examples task/quality-match.json --out task/round-01
node --test tests/evaluate.test.mjs tests/references.test.mjs tests/quality.test.mjs
```

`task/input.json`使用[输入Schema](schemas/input.schema.json)，宿主实际看图后的观察记录使用[内部review Schema](schemas/review.schema.json)。实际回应以[输出Schema](schemas/output.schema.json)为准；分项分数、提示词与图片不添加到固定外部JSON。

## 文件

|目录/文件|用途|
|---|---|
|SKILL.md、agent-prompt.md、config.json|入口、指令和严格配置|
|schemas/、scripts/、tests/|接口、执行辅助与31项逻辑检查|
|references/|评分量表、制作及集成规则|
|assets/classification-source/|分类库文字资料：27条规则、18个标签；案例图片不公开|
|reference-library/|参考索引与17个好中差案例的文字观察；图片不公开|
|runs/|三个案例的文字报告、逐轮评分、诊断与提示词；图片不公开|

## 三个测试案例

|案例|原图视觉分|最佳视觉分|正式pass|测试报告|
|---|---:|---:|---|---|
|护肤品|5.93|8.58|false|[8轮续测](runs/618-v23-test-20261001/8轮规则测试报告.md)|
|乌龙茶|7.38|8.63|false|[记录](runs/oolong-eight-round-test-20261001/测试报告.md)|
|卫浴|6.13|8.60|false|[记录](runs/bathroom-eight-round-test-20261001/测试报告.md)|

这些是2026-10-01同模型实际查看后的视觉诊断，**不是独立盲评或稳定达标率证明**。均缺独立商品母本或完整确认信息，部分商品文字与细节发生重绘，因此正式pass保持false。旧规则阶段的文件保留原记录，新8轮规则不倒写历史停止原因。[机器可读测试索引](runs/index.json)。

参考检索与好中差偏好校准不等于参数训练；原分类案例为draft，用户整体分类不等于逐维标准分。12张偏好图用于校准、5张暂保留，但建库时都已查看，不能声称是真正新盲测。


