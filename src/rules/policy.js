// 审稿规则引擎：纯函数，不依赖 React / DOM / 存储。
// 输入状态 -> 输出新状态与校验结果，不在原状态上修改。

export const MAX_PENDING = 2;          // 每人同时最多两项待审
export const WINDOW_DAYS = 14;         // 审稿时限（天）
export const REVIEW_WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const REQUIRED_REVIEWS = 2;     // 编辑决定所需的最少有效意见

export const RECOMMENDATIONS = {
  accept: '建议接受',
  minor: '建议小修',
  major: '建议大修',
  reject: '建议拒稿',
};

export const DECISIONS = {
  accept: '接受',
  revise: '退修',
  reject: '拒稿',
};

// 限制类型 -> 文案（冲突清单的“限制”列）
export const RESTRICTION_LABEL = {
  affiliation: '同机构回避',
  coauthor: '共同作者回避',
  workload: `待审上限 ${MAX_PENDING} 项`,
  duplicate: '已有在途任务',
};

export const nextDeadline = (now) => now + REVIEW_WINDOW_MS;

// ---------- 基础查询 ----------

export const getManuscript = (s, id) => s.manuscripts.find((m) => m.id === id);
export const getReviewer = (s, id) => s.reviewers.find((r) => r.id === id);
export const getVersion = (m, v) => m.versions.find((x) => x.version === v);
export const versionAssignments = (s, manuscriptId, version) =>
  s.assignments.filter((a) => a.manuscriptId === manuscriptId && a.version === version);

// 在途任务：待审 / 未处理回避 / 已交意见；已作废与已改派的不算
export const isActive = (a) =>
  a.status === 'pending' || a.status === 'submitted' || (a.status === 'recused' && !a.resolved);

export const pendingOfReviewer = (s, reviewerId) =>
  s.assignments.filter((a) => a.reviewerId === reviewerId && a.status === 'pending');

// 回避判定：共同作者（本人即作者，或在审稿人合作者名单内）优先，其次同机构
export function conflictOf(reviewer, version) {
  const coauthor = version.authors.find(
    (a) => a.name === reviewer.name || (reviewer.collaborators || []).includes(a.name)
  );
  if (coauthor) {
    return { kind: 'coauthor', message: `与作者 ${coauthor.name} 存在共同作者关系` };
  }
  const same = version.authors.find((a) => a.affiliation === reviewer.affiliation);
  if (same) {
    return { kind: 'affiliation', message: `与作者 ${same.name} 同属 ${same.affiliation}` };
  }
  return null;
}

// 分配前校验，返回全部违规项（空数组表示可以分配）
export function evaluateAssignment(s, manuscriptId, version, reviewer) {
  const violations = [];
  const busy = versionAssignments(s, manuscriptId, version.version).some(
    (a) =>
      a.reviewerId === reviewer.id &&
      (a.status === 'pending' ||
        a.status === 'submitted' ||
        (a.status === 'recused' && !a.resolved))
  );
  if (busy) violations.push({ kind: 'duplicate', message: '该审稿人在本版本已有在途任务' });
  const conflict = conflictOf(reviewer, version);
  if (conflict) violations.push(conflict);
  if (pendingOfReviewer(s, reviewer.id).length >= MAX_PENDING) {
    violations.push({ kind: 'workload', message: `同时待审已达 ${MAX_PENDING} 项上限` });
  }
  return violations;
}

// 当前版本的有效意见 = 已提交且属于当前版本（旧版意见可查但不计数）
export const validReviews = (s, m) =>
  versionAssignments(s, m.id, m.currentVersion).filter((a) => a.status === 'submitted');

// 未处理回避 = 当前版本上状态为 open 的限制记录
export const openRestrictions = (s, m) =>
  s.restrictions.filter(
    (r) => r.manuscriptId === m.id && r.version === m.currentVersion && r.status === 'open'
  );

// 编辑决定门禁
export function readiness(s, m) {
  const reviews = validReviews(s, m);
  const open = openRestrictions(s, m);
  const reasons = [];
  if (reviews.length < REQUIRED_REVIEWS) {
    reasons.push(`有效意见不足（${reviews.length}/${REQUIRED_REVIEWS}）`);
  }
  if (open.length) reasons.push(`存在 ${open.length} 项未处理回避`);
  return { ready: reasons.length === 0, reviews, open, reasons };
}

export function manuscriptStatus(s, m) {
  const last = m.decisions[m.decisions.length - 1];
  if (last && last.version === m.currentVersion) {
    return { key: 'decided', label: `已${DECISIONS[last.action]} · v${last.version}` };
  }
  if (readiness(s, m).ready) return { key: 'ready', label: '可给出编辑决定' };
  const working = versionAssignments(s, m.id, m.currentVersion).some(
    (a) => a.status === 'pending' || (a.status === 'recused' && !a.resolved)
  );
  return { key: working ? 'reviewing' : 'unassigned', label: working ? '审稿中' : '待指派审稿人' };
}

// ---------- 状态迁移（纯函数） ----------

const clone = (s) => structuredClone(s);
const nid = (d, prefix) => `${prefix}${++d.meta.seq}`;

function makeRestriction(d, partial, now) {
  return {
    id: nid(d, 'c'),
    at: now,
    status: 'open',
    deadline: null,
    sourceAssignmentId: null,
    resolution: null,
    resolvedAt: null,
    resolutionAssignmentId: null,
    reroute: false,
    ...partial,
  };
}

export function createManuscript(s, input, now) {
  const d = clone(s);
  const id = nid(d, 'm');
  d.manuscripts.push({
    id,
    title: input.title.trim(),
    currentVersion: 1,
    versions: [
      { version: 1, createdAt: now, authors: input.authors, body: input.body.trim() },
    ],
    decisions: [],
  });
  return { state: d, ok: true, manuscriptId: id };
}

export function addReviewer(s, input, now) {
  const d = clone(s);
  const reviewer = {
    id: nid(d, 'r'),
    name: input.name.trim(),
    affiliation: input.affiliation.trim(),
    collaborators: input.collaborators,
  };
  d.reviewers.push(reviewer);
  return { state: d, ok: true, reviewer };
}

// 分配审稿人：校验不通过则只登记“已拦截”限制，不生成任务
export function assignReviewer(s, { manuscriptId, reviewerId, origin = 'manual' }, now) {
  const m = getManuscript(s, manuscriptId);
  const version = getVersion(m, m.currentVersion);
  const reviewer = getReviewer(s, reviewerId);
  const violations = evaluateAssignment(s, m.id, version, reviewer);
  const d = clone(s);
  if (violations.length) {
    for (const v of violations) {
      d.restrictions.push(
        makeRestriction(d, {
          kind: v.kind,
          manuscriptId: m.id,
          version: version.version,
          reviewerId: reviewer.id,
          status: 'blocked',
          message: v.message,
        }, now)
      );
    }
    return { state: d, ok: false, message: violations.map((v) => v.message).join('；') };
  }
  const assignment = {
    id: nid(d, 'a'),
    manuscriptId: m.id,
    version: version.version,
    reviewerId: reviewer.id,
    assignedAt: now,
    deadline: nextDeadline(now),
    status: 'pending',
    origin,
    review: null,
    conflict: null,
    voidReason: null,
    voidedAt: null,
    resolved: false,
    resolution: null,
    resolutionAssignmentId: null,
  };
  d.assignments.push(assignment);
  return { state: d, ok: true, assignment };
}

// 录入审稿意见
export function submitReview(s, assignmentId, { recommendation, comments }, now) {
  const d = clone(s);
  const a = d.assignments.find((x) => x.id === assignmentId);
  if (!a || a.status !== 'pending') {
    return { state: s, ok: false, message: '只有待审任务可以提交意见' };
  }
  a.status = 'submitted';
  a.review = { recommendation, comments: comments.trim(), submittedAt: now };
  return { state: d, ok: true };
}

// 审稿人申请回避：在当前版本产生“未处理回避”，必须改派后才能决定
export function recuse(s, assignmentId, { kind, note }, now) {
  const d = clone(s);
  const a = d.assignments.find((x) => x.id === assignmentId);
  if (!a || a.status !== 'pending') {
    return { state: s, ok: false, message: '只有待审任务可以申请回避' };
  }
  const m = getManuscript(d, a.manuscriptId);
  const version = getVersion(m, a.version);
  const reviewer = getReviewer(d, a.reviewerId);
  const auto = conflictOf(reviewer, version);
  const finalKind = auto ? auto.kind : kind;
  a.status = 'recused';
  a.conflict = { kind: finalKind, at: now, note: (note || '').trim() };
  d.restrictions.push(
    makeRestriction(d, {
      kind: finalKind,
      manuscriptId: a.manuscriptId,
      version: a.version,
      reviewerId: a.reviewerId,
      deadline: a.deadline,
      message: `审稿人申请回避：${RESTRICTION_LABEL[finalKind]}${note ? `（${note.trim()}）` : ''}`,
      sourceAssignmentId: a.id,
    }, now)
  );
  return { state: d, ok: true };
}

// 改派：为未处理回避指派新的审稿人；校验不过则维持原状并登记拦截
export function reassign(s, restrictionId, reviewerId, now) {
  const flag = s.restrictions.find((r) => r.id === restrictionId);
  if (!flag || flag.status !== 'open') {
    return { state: s, ok: false, message: '该限制项不处于待处理状态' };
  }
  const m = getManuscript(s, flag.manuscriptId);
  const version = getVersion(m, flag.version);
  const reviewer = getReviewer(s, reviewerId);
  const violations = evaluateAssignment(s, m.id, version, reviewer);
  const d = clone(s);
  if (violations.length) {
    for (const v of violations) {
      d.restrictions.push(
        makeRestriction(d, {
          kind: v.kind,
          manuscriptId: m.id,
          version: version.version,
          reviewerId: reviewer.id,
          status: 'blocked',
          message: `改派被拦截：${v.message}`,
        }, now)
      );
    }
    return { state: d, ok: false, message: violations.map((v) => v.message).join('；') };
  }
  const assignment = {
    id: nid(d, 'a'),
    manuscriptId: m.id,
    version: version.version,
    reviewerId: reviewer.id,
    assignedAt: now,
    deadline: nextDeadline(now),
    status: 'pending',
    origin: 'reroute',
    review: null,
    conflict: null,
    voidReason: null,
    voidedAt: null,
    resolved: false,
    resolution: null,
    resolutionAssignmentId: null,
  };
  d.assignments.push(assignment);
  const f = d.restrictions.find((x) => x.id === restrictionId);
  f.status = 'resolved';
  f.resolvedAt = now;
  f.resolutionAssignmentId = assignment.id;
  f.resolution = `改派给 ${reviewer.name}`;
  if (f.sourceAssignmentId) {
    const old = d.assignments.find((x) => x.id === f.sourceAssignmentId);
    if (old && old.status === 'recused') {
      old.resolved = true;
      old.resolvedAt = now;
      old.resolutionAssignmentId = assignment.id;
      old.resolution = `已改派 ${reviewer.name}`;
    }
  }
  return { state: d, ok: true, assignment };
}

// 上传新版：冻结新快照；旧版只读；旧版未交意见作废并按规则重排；
// 旧版未处理回避随旧版关闭；重排失败成为新版的未处理回避；旧意见保留可查。
export function uploadVersion(s, manuscriptId, input, now) {
  const d = clone(s);
  const m = getManuscript(d, manuscriptId);
  const previous = m.currentVersion;
  const number = previous + 1;
  m.versions.push({
    version: number,
    createdAt: now,
    authors: input.authors,
    body: input.body.trim(),
  });
  m.currentVersion = number;

  let voided = 0;
  const rerouteReviewers = [];
  for (const a of versionAssignments(d, m.id, previous)) {
    if (a.status === 'pending') {
      a.status = 'void';
      a.voidReason = 'superseded';
      a.voidedAt = now;
      voided += 1;
      rerouteReviewers.push({ reviewerId: a.reviewerId, sourceAssignmentId: a.id });
    } else if (a.status === 'recused' && !a.resolved) {
      a.resolved = true;
      a.resolvedAt = now;
      a.resolution = `v${number} 上传后随旧版关闭`;
    }
  }
  for (const r of d.restrictions) {
    if (r.manuscriptId === m.id && r.version === previous && r.status === 'open') {
      r.status = 'resolved';
      r.resolvedAt = now;
      r.resolution = `v${number} 上传后随旧版关闭`;
    }
  }

  const version = getVersion(m, number);
  let rerouted = 0;
  let failed = 0;
  for (const { reviewerId, sourceAssignmentId } of rerouteReviewers) {
    const reviewer = getReviewer(d, reviewerId);
    const violations = evaluateAssignment(d, m.id, version, reviewer);
    if (violations.length) {
      failed += 1;
      const v = violations[0];
      d.restrictions.push(
        makeRestriction(d, {
          kind: v.kind,
          manuscriptId: m.id,
          version: number,
          reviewerId,
          deadline: nextDeadline(now),
          message: `任务重排失败：${v.message}`,
          sourceAssignmentId,
          reroute: true,
        }, now)
      );
    } else {
      rerouted += 1;
      d.assignments.push({
        id: nid(d, 'a'),
        manuscriptId: m.id,
        version: number,
        reviewerId,
        assignedAt: now,
        deadline: nextDeadline(now),
        status: 'pending',
        origin: 'reroute',
        review: null,
        conflict: null,
        voidReason: null,
        voidedAt: null,
        resolved: false,
        resolution: null,
        resolutionAssignmentId: null,
      });
    }
  }

  return { state: d, ok: true, number, voided, rerouted, failed };
}

// 编辑决定：有效意见不足两位或存在未处理回避时一律拒绝
export function recordDecision(s, manuscriptId, { action, comment }, now) {
  const d = clone(s);
  const m = getManuscript(d, manuscriptId);
  const check = readiness(d, m);
  if (!check.ready) {
    return { state: s, ok: false, message: `不能给出编辑决定：${check.reasons.join('；')}` };
  }
  m.decisions.push({
    id: nid(d, 'd'),
    action,
    comment: (comment || '').trim(),
    version: m.currentVersion,
    at: now,
  });
  return { state: d, ok: true };
}
