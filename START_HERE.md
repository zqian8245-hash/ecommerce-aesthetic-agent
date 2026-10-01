# 电商海报美学专家 Agent v2 使用说明

新版允许大幅重构，输入输出采用小组统一接口。严格阈值保持为8.5/10，六项各≥8/10。改善AI模板感通过可见材质、光照、道具逻辑和排版证据判断。

## 直接试用

复制`完整可复制指令.md`到支持看图的AI；上传当前海报与原始商品图，分别标为poster_image和product_img；按templates/input.json给出卖点、价格、营销目标和C组场景标签。模型只返回统一JSON。

如果要制作新图，由主流程读取修改建议及内部设计方案，或追加请求：“按本轮方案大幅重构海报，并保存提示词和图片为独立产物；不要扩展Agent统一JSON。”实际图片工具缺失时会停在提示词。

不要把旧海报从中裁出的生成商品称为原始商品图。缺原素材可做局部诊断，但不能宣称已验证商品身份或产出合格重构版。

## 文件与用途

| 文件 | 用途 |
|---|---|
| SKILL.md / agent-prompt.md | 入口和完整Agent规则 |
| 完整可复制指令.md | 对话使用的合并版本 |
| config.json / references/rubric.md | 严格门槛、六维锚点、重构触发 |
| schemas/input.schema.json | 精确业务输入 |
| schemas/output.schema.json | 两类Agent共用的固定输出结构 |
| schemas/review.schema.json | 美学模型内部观察结构 |
| templates/input.json | v2业务输入样例 |
| examples/review-v2.demo.json | 虚构接口演示，不代表真实海报评分 |
| scripts/evaluate.mjs | 计算和固定输出、独立报告/重构提示词 |
| references/integration.md | C/A/D接入、调度上下文、Loop及迁移 |

## 演示与验证

```powershell
node scripts/evaluate.mjs --input templates/input.json --review examples/review-v2.demo.json --out runs/demo-v2-local
node --test tests/evaluate.test.mjs
```

命令输出固定JSON，同时保存agent-result.json及内部产物。Node不看图、不生成图片；先由视觉模型实际查看两图并生成internal-review.json。演示数据标有sample_only，不得当实测。

修改配置或指令后运行`node scripts/build-portable.mjs`更新单文件版。不要在对外JSON新增分项分数或generation_prompt；这些产物已有独立文件。

## 当前验证范围

### v2.3新增参考与偏好库

classification库22张案例、27条规则；用户好中差库17张（好9、中3、差5）。读[接入说明](reference-library/参考库接入说明.md)和[偏好校准规则](references/quality-calibration.md)。运行前用C标签检索参考，再按实际商品品类检索好中差例，宿主必须实际看图。

```powershell
node scripts/match-references.mjs --input task/input.json --out task/reference-match.json
node scripts/match-quality-examples.mjs --category home_appliances --out task/quality-match.json
node scripts/evaluate.mjs --input task/input.json --review task/review.json --references task/reference-match.json --quality-examples task/quality-match.json --out task/round-01
node --test tests/evaluate.test.mjs tests/references.test.mjs tests/quality.test.mjs
```

参考和偏好库是提示上下文，脚本不调用模型。12张偏好图用于校准，5张暂保留；全部已用于建库查看，不能声称是新的盲测集。新增31项脚本测试通过，不证明真实海报达标率提升。固定接口及严格阈值不变。

旧618测试曾出现标签重绘和规格变化。本次v2据此调整商品母本和重构策略，并验证固定接口与计算逻辑。尚未收到v2所需的新product_img和完整product_input，因此未进行新版真实视觉评分或大改返图；不能把示例分数当改进效果证据。
