// 数据层：领域数据、种子数据、localStorage 持久化与订阅。
// 不包含任何业务判断（业务判断全部在 rules/policy.js）。

import { useSyncExternalStore } from 'react';
import * as policy from '../rules/policy.js';

const STORAGE_KEY = 'preprint-desk-v1';

const DAY = 24 * 60 * 60 * 1000;

function seedState(now) {
  const t = (days) => now - days * DAY;
  const s = {
    meta: { seq: 100 },
    reviewers: [],
    manuscripts: [],
    assignments: [],
    restrictions: [],
  };

  // ---- 审稿人 ----
  s.reviewers = [
    { id: 'r1', name: '陈静', affiliation: '北京大学认知科学实验室', collaborators: [] },
    { id: 'r2', name: 'David Park', affiliation: 'MIT Media Lab', collaborators: ['Anna Lee'] },
    { id: 'r3', name: '林远航', affiliation: '清华人工智能研究院', collaborators: ['赵启铭'] },
    { id: 'r4', name: 'Sarah Kline', affiliation: 'MIT Media Lab', collaborators: [] },
    { id: 'r5', name: '何平', affiliation: '复旦行为科学中心', collaborators: [] },
    { id: 'r6', name: 'Marco Bianchi', affiliation: '米兰比可卡大学心理学系', collaborators: [] },
  ];

  // ---- 稿件 1：跨两版，演示冻结、作废重排、回避与决定门禁 ----
  s.manuscripts.push({
    id: 'm1',
    title: '延展认知的再审视：具身媒介与分布式推理',
    currentVersion: 2,
    versions: [
      {
        version: 1,
        createdAt: t(40),
        authors: [
          { name: '周岚', affiliation: '北大哲学系' },
          { name: '刘钊', affiliation: '中科院心理所' },
        ],
        body:
          '本研究通过三项受控实验考察外部工具如何参与推理过程。v1 版本报告，' +
          '当被试允许使用结构化笔记本时，延迟推理任务的正确率提升 18%。\n\n' +
          '我们据此认为认知过程并非封闭于颅内，而是与稳定可得的外部符号耦合；' +
          '但 v1 的样本量较小（n=32），且未排除工作记忆容量的个体差异。',
      },
      {
        version: 2,
        createdAt: t(12),
        authors: [
          { name: '周岚', affiliation: '北京大学认知科学实验室' },
          { name: '刘钊', affiliation: '中科院心理所' },
          { name: 'Anna Lee', affiliation: 'MIT Media Lab' },
        ],
        body:
          '修订版将样本扩大至 n=124，并加入工作记忆容量作为协变量。' +
          '主要效应在控制协变量后依然显著（β=0.31, p<.01）。\n\n' +
          '新增第三作者 Anna Lee 负责计算建模章节，提出外部符号通道的' +
          '注意再分配机制，并补充了跨文化样本的稳健性检验。',
      },
    ],
    decisions: [],
  });

  // v1：两位审稿人按时交了意见（保留在旧版，永久可查，但不计入当前版本）
  s.assignments.push(
    {
      id: 'a1', manuscriptId: 'm1', version: 1, reviewerId: 'r3',
      assignedAt: t(39), deadline: t(25), status: 'submitted', origin: 'manual',
      review: {
        recommendation: 'major',
        comments: '选题重要但样本量不足，建议扩大样本并控制个体差异。',
        submittedAt: t(28),
      },
      conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    },
    {
      id: 'a2', manuscriptId: 'm1', version: 1, reviewerId: 'r6',
      assignedAt: t(39), deadline: t(25), status: 'submitted', origin: 'manual',
      review: {
        recommendation: 'minor',
        comments: '理论框架清晰，建议补充与分布式认知文献的对话。',
        submittedAt: t(30),
      },
      conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    },
    // v2 上传时这位审稿人尚在待审：任务作废，并自动重排到新版
    {
      id: 'a3', manuscriptId: 'm1', version: 1, reviewerId: 'r5',
      assignedAt: t(20), deadline: t(6), status: 'void', origin: 'manual',
      review: null, conflict: null, voidReason: 'superseded', voidedAt: t(12),
      resolved: false, resolution: null, resolutionAssignmentId: null,
    },
    // r2（David Park）v1 时尚在待审：v2 上传后任务作废，重排被共同作者规则拦截
    {
      id: 'a11', manuscriptId: 'm1', version: 1, reviewerId: 'r2',
      assignedAt: t(26), deadline: t(12), status: 'void', origin: 'manual',
      review: null, conflict: null, voidReason: 'superseded', voidedAt: t(12),
      resolved: false, resolution: null, resolutionAssignmentId: null,
    }
  );

  // v2：r5 重排成功（已提交）；r6 重排后已交；陈静（r1，现同机构+合作者）改派被回避
  s.assignments.push(
    {
      id: 'a4', manuscriptId: 'm1', version: 2, reviewerId: 'r5',
      assignedAt: t(12), deadline: t(2), status: 'submitted', origin: 'reroute',
      review: {
        recommendation: 'accept',
        comments: '扩样与协变量控制解决了主要顾虑，建模章节尤其出色。',
        submittedAt: t(5),
      },
      conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    },
    {
      id: 'a5', manuscriptId: 'm1', version: 2, reviewerId: 'r6',
      assignedAt: t(12), deadline: t(2), status: 'submitted', origin: 'reroute',
      review: {
        recommendation: 'minor',
        comments: '新增分析稳健，建议在讨论中明确机制边界条件。',
        submittedAt: t(4),
      },
      conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    },
    // 陈静（r1）在新版上传后被指派，发现已与第一作者同机构，申请回避
    {
      id: 'a10', manuscriptId: 'm1', version: 2, reviewerId: 'r1',
      assignedAt: t(11), deadline: t(3), status: 'recused', origin: 'manual',
      review: null,
      conflict: { kind: 'affiliation', at: t(9), note: '本人已调入北大认知科学实验室，与第一作者同组' },
      voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    }
  );

  // ---- 稿件 2：审稿中，仅 1 份有效意见，演示“不足两位不得决定” ----
  s.manuscripts.push({
    id: 'm2',
    title: '情境反馈如何重塑设计学习中的直觉判断',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        createdAt: t(22),
        authors: [
          { name: '赵启铭', affiliation: '清华设计学系' },
          { name: 'Ellen Ross', affiliation: 'MIT Media Lab' },
        ],
        body:
          '我们追踪了 58 名设计专业学生在 8 周工作室课程中的判断变化，' +
          '比较即时反馈与延迟反馈对方案评估准确性的影响。\n\n' +
          '初步结果显示即时反馈组在中期评估中收敛更快，但终期作品的' +
          '原创性评分反而更低，提示反馈节奏与探索深度之间存在权衡。',
      },
    ],
    decisions: [],
  });
  s.assignments.push(
    {
      id: 'a6', manuscriptId: 'm2', version: 1, reviewerId: 'r6',
      assignedAt: t(21), deadline: t(-7), status: 'submitted', origin: 'manual',
      review: {
        recommendation: 'major',
        comments: '反馈节奏的视角新颖，但原创性评分的信度需要补充报告。',
        submittedAt: t(10),
      },
      conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    },
    {
      id: 'a7', manuscriptId: 'm2', version: 1, reviewerId: 'r5',
      assignedAt: t(21), deadline: t(-7), status: 'pending', origin: 'manual',
      review: null, conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    }
  );

  // ---- 稿件 3：已有 2 份有效意见并记录了编辑决定 ----
  s.manuscripts.push({
    id: 'm3',
    title: '数据驱动设计：定性洞察到可行动决策的转译框架',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        createdAt: t(60),
        authors: [
          { name: 'Nina Ortiz', affiliation: '代尔夫特理工大学' },
          { name: '高源', affiliation: '同济设计创意学院' },
        ],
        body:
          '本文提出一套把田野访谈与行为日志整合为设计决策的转译框架，' +
          '并在三个公共服务项目中进行了行动研究验证。\n\n' +
          '结果显示框架使跨团队的证据引用一致性提升 40%，' +
          '同时显著缩短了从洞察到原型的周期。',
      },
    ],
    decisions: [
      { id: 'd1', action: 'accept', comment: '两份意见一致认可，直接接受。', version: 1, at: t(30) },
    ],
  });
  s.assignments.push(
    {
      id: 'a8', manuscriptId: 'm3', version: 1, reviewerId: 'r3',
      assignedAt: t(58), deadline: t(44), status: 'submitted', origin: 'manual',
      review: {
        recommendation: 'accept',
        comments: '框架实用、案例扎实，是方法论文献的有益补充。',
        submittedAt: t(47),
      },
      conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    },
    {
      id: 'a9', manuscriptId: 'm3', version: 1, reviewerId: 'r2',
      assignedAt: t(58), deadline: t(44), status: 'submitted', origin: 'manual',
      review: {
        recommendation: 'accept',
        comments: '转译步骤清晰可复制，建议增加适用边界的讨论。',
        submittedAt: t(45),
      },
      conflict: null, voidReason: null, voidedAt: null,
      resolved: false, resolution: null, resolutionAssignmentId: null,
    }
  );

  // ---- 未处理回避 / 拦截记录（均为当前版本上的活记录） ----
  s.restrictions = [
    {
      id: 'c1', at: t(9), kind: 'affiliation', manuscriptId: 'm1', version: 2, reviewerId: 'r1',
      deadline: t(3), status: 'open',
      message: '审稿人申请回避：同机构回避（陈静调入北大认知科学实验室，与周岚同组）',
      sourceAssignmentId: 'a10', resolution: null, resolvedAt: null,
      resolutionAssignmentId: null, reroute: false,
    },
    {
      id: 'c2', at: t(12), kind: 'coauthor', manuscriptId: 'm1', version: 2, reviewerId: 'r2',
      deadline: t(-2), status: 'open',
      message: '任务重排失败：与作者 Anna Lee 存在共同作者关系',
      sourceAssignmentId: 'a11', resolution: null, resolvedAt: null,
      resolutionAssignmentId: null, reroute: true,
    },
    {
      id: 'c3', at: t(20), kind: 'coauthor', manuscriptId: 'm2', version: 1, reviewerId: 'r3',
      deadline: null, status: 'blocked',
      message: '与作者 赵启铭 存在共同作者关系',
      sourceAssignmentId: null, resolution: null, resolvedAt: null,
      resolutionAssignmentId: null, reroute: false,
    },
    {
      id: 'c4', at: t(20), kind: 'affiliation', manuscriptId: 'm2', version: 1, reviewerId: 'r2',
      deadline: null, status: 'blocked',
      message: '与作者 Ellen Ross 同属 MIT Media Lab',
      sourceAssignmentId: null, resolution: null, resolvedAt: null,
      resolutionAssignmentId: null, reroute: false,
    },
  ];

  // 校正 seq，使后续新 id 不与种子冲突
  s.meta.seq = 200;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // 存储损坏时回退到种子数据
  }
  return seedState(Date.now());
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等情况下忽略写入失败
  }
}

function apply(fn, ...args) {
  const result = fn(state, ...args, Date.now());
  if (result.state !== state) {
    state = result.state;
    persist();
    listeners.forEach((l) => l());
  }
  return result;
}

export const store = {
  getState: () => state,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  createManuscript: (input) => apply(policy.createManuscript, input),
  addReviewer: (input) => apply(policy.addReviewer, input),
  assignReviewer: (input) => apply(policy.assignReviewer, input),
  submitReview: (id, input) => apply(policy.submitReview, id, input),
  recuse: (id, input) => apply(policy.recuse, id, input),
  reassign: (restrictionId, reviewerId) => apply(policy.reassign, restrictionId, reviewerId),
  uploadVersion: (id, input) => apply(policy.uploadVersion, id, input),
  recordDecision: (id, input) => apply(policy.recordDecision, id, input),
  resetDemo() {
    state = seedState(Date.now());
    persist();
    listeners.forEach((l) => l());
  },
};

export function useStore() {
  return useSyncExternalStore(store.subscribe, store.getState);
}
