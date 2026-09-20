// 数据层：种子数据 + 本地持久化（不包含任何业务规则）
export const STORAGE_KEY = 'preprint-review-desk';

export const seed = {
  reviewers: [
    { id: 'r1', name: '王岚', institution: '清华大学' },
    { id: 'r2', name: '陈默', institution: '北京大学' },
    { id: 'r3', name: '刘知远', institution: '清华大学' },
    { id: 'r4', name: '赵培', institution: '中科院计算所' },
    { id: 'r5', name: '孙彧', institution: '复旦大学' },
  ],
  manuscripts: [
    {
      id: 'ms1',
      title: '面向边缘设备的稀疏注意力推理',
      field: '机器学习系统',
      versions: [
        {
          n: 1,
          submittedAt: '2026-08-12',
          authors: [
            { name: '李卓', institution: '清华大学' },
            { name: '何倩', institution: '上海交通大学' },
          ],
          abstract: '提出一种面向边缘设备的稀疏注意力调度方法，在保持精度的同时降低推理显存占用。',
          body: '1 引言\n移动端大模型推理受限于显存与功耗。\n\n2 方法\n利用注意力分布的长尾特性，对低分键值对进行逐层剪枝，并引入块稀疏核。\n\n3 实验\n在 3 款边缘芯片上，显存下降 41%，精度损失小于 0.4%。',
        },
        {
          n: 2,
          submittedAt: '2026-09-06',
          authors: [
            { name: '李卓', institution: '清华大学' },
            { name: '何倩', institution: '上海交通大学' },
          ],
          abstract: '修订版：补充了剪枝策略的形式化分析与更多芯片上的对照实验。',
          body: '1 引言\n移动端大模型推理受限于显存与功耗。\n\n2 方法\n利用注意力分布的长尾特性进行逐层剪枝；新增阈值选择的理论界。\n\n3 实验\n覆盖 5 款芯片，新增与量化方案的联合对比，显存下降 43%。\n\n4 讨论\n分析剪枝对长上下文任务的影响。',
        },
      ],
      decisions: [
        { version: 1, type: '修改后重审', note: 'v1 两份有效意见一致要求补充理论分析。', at: '2026-08-28' },
      ],
    },
    {
      id: 'ms2',
      title: '低资源语言的检索增强生成评估',
      field: '自然语言处理',
      versions: [
        {
          n: 1,
          submittedAt: '2026-09-10',
          authors: [
            { name: '周晗', institution: '复旦大学' },
            { name: '吴旗', institution: '中科院计算所' },
          ],
          abstract: '构建覆盖 12 种低资源语言的 RAG 评测基准，分析检索噪声对生成质量的影响。',
          body: '1 背景\n低资源语言缺乏系统化的 RAG 评测。\n\n2 基准\n12 种语言、3 个领域、人工标注答案。\n\n3 发现\n检索噪声在低资源语言上被放大，答案忠实度平均下降 18%。',
        },
      ],
      decisions: [],
    },
    {
      id: 'ms3',
      title: '可解释强化学习的约束建模',
      field: '强化学习',
      versions: [
        {
          n: 1,
          submittedAt: '2026-08-20',
          authors: [{ name: '郑铎', institution: '北京大学' }],
          abstract: '将安全约束显式建模进策略梯度，使约束满足过程可被审计。',
          body: '1 问题\n可解释性要求决策依据可追溯。\n\n2 方法\n拉格朗日约束分解 + 决策路径记录。\n\n3 实验\n在 4 个安全基准上约束违反率下降 62%。',
        },
        {
          n: 2,
          submittedAt: '2026-09-15',
          authors: [
            { name: '郑铎', institution: '北京大学' },
            { name: '赵培', institution: '中科院计算所' },
          ],
          abstract: '修订版：新增多智能体场景扩展，赵培加入作者列表负责该部分。',
          body: '1 问题\n可解释性要求决策依据可追溯。\n\n2 方法\n拉格朗日约束分解 + 决策路径记录。\n\n3 扩展\n新增多智能体约束协商机制（赵培执笔）。\n\n4 实验\n单智能体与多智能体场景共 7 个基准。',
        },
      ],
      decisions: [],
    },
  ],
  // 任务状态：待审 / 已提交 / 作废 / 回避待处理 / 已回避
  assignments: [
    { id: 'a1', manuscriptId: 'ms1', version: 1, reviewerId: 'r5', deadline: '2026-08-26', status: '已提交',
      review: { score: 3, recommend: '修改后重审', comment: '实验充分，但剪枝阈值的选择缺少理论依据。', submittedAt: '2026-08-24' } },
    { id: 'a2', manuscriptId: 'ms1', version: 1, reviewerId: 'r2', deadline: '2026-08-26', status: '已提交',
      review: { score: 4, recommend: '修改后重审', comment: '方法新颖，建议补充与量化方案的联合对比。', submittedAt: '2026-08-25' } },
    { id: 'a3', manuscriptId: 'ms1', version: 1, reviewerId: 'r4', deadline: '2026-08-26', status: '作废',
      voidReason: '作者上传 v2，未交意见作废', review: null },
    { id: 'a4', manuscriptId: 'ms1', version: 2, reviewerId: 'r4', deadline: '2026-09-20', status: '已提交',
      review: { score: 4, recommend: '接收', comment: '修订版补充了理论界，问题已解决。', submittedAt: '2026-09-18' } },
    { id: 'a5', manuscriptId: 'ms1', version: 2, reviewerId: 'r2', deadline: '2026-09-27', status: '待审', review: null },

    { id: 'a6', manuscriptId: 'ms2', version: 1, reviewerId: 'r1', deadline: '2026-09-28', status: '待审', review: null },
    { id: 'a7', manuscriptId: 'ms2', version: 1, reviewerId: 'r2', deadline: '2026-09-28', status: '待审', review: null },

    { id: 'a8', manuscriptId: 'ms3', version: 1, reviewerId: 'r4', deadline: '2026-08-30', status: '已提交',
      review: { score: 5, recommend: '接收', comment: '约束分解的思路清晰，审计接口设计实用。', submittedAt: '2026-08-29' } },
    { id: 'a9', manuscriptId: 'ms3', version: 1, reviewerId: 'r5', deadline: '2026-08-30', status: '作废',
      voidReason: '作者上传 v2，未交意见作废', review: null },
    { id: 'a10', manuscriptId: 'ms3', version: 2, reviewerId: 'r4', deadline: '2026-09-29', status: '回避待处理',
      recusal: { type: '共同作者', detail: '赵培出现在 v2 作者列表中', since: '2026-09-15' }, review: null },
    { id: 'a11', manuscriptId: 'ms3', version: 2, reviewerId: 'r5', deadline: '2026-09-29', status: '待审', review: null },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 存储不可用时回落到种子数据 */ }
  return clone(seed);
}

export function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 忽略写入失败 */ }
}
