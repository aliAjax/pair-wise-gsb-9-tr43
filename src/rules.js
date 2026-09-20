// 规则层：纯函数业务逻辑，不触碰 DOM 与存储
export const MAX_PENDING = 2;   // 每人同时最多两项待审
export const REVIEW_DAYS = 14;  // 审稿时限（天）

export const today = () => new Date().toISOString().slice(0, 10);
export const deadline = (base) => {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + REVIEW_DAYS);
  return d.toISOString().slice(0, 10);
};

const clone = (s) => JSON.parse(JSON.stringify(s));
const uid = () => 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

// ---- 查询 ----
export const getMs = (s, id) => s.manuscripts.find((m) => m.id === id);
export const getRv = (s, id) => s.reviewers.find((r) => r.id === id);
export const currentVersion = (ms) => ms.versions[ms.versions.length - 1];
export const msAssignments = (s, msId, v) =>
  s.assignments.filter((a) => a.manuscriptId === msId && (v == null || a.version === v));
export const pendingOf = (s, rid) =>
  s.assignments.filter((a) => a.reviewerId === rid && a.status === '待审');
export const unresolvedRecusals = (s, msId) =>
  s.assignments.filter((a) => a.status === '回避待处理' && (!msId || a.manuscriptId === msId));
export const validReviews = (s, msId, v) =>
  s.assignments.filter((a) => a.manuscriptId === msId && a.version === v && a.status === '已提交');

// ---- 回避校验：同机构 / 共同作者 ----
export function conflictsFor(version, reviewer) {
  const out = [];
  for (const au of version.authors) {
    if (au.name === reviewer.name)
      out.push({ type: '共同作者', detail: `${reviewer.name} 是本版作者之一` });
    else if (au.institution && au.institution === reviewer.institution)
      out.push({ type: '同机构', detail: `${reviewer.name} 与作者 ${au.name} 同属 ${au.institution}` });
  }
  return out;
}

// ---- 分配前校验：回避 + 任务上限 + 重复分配 ----
export function checkAssign(s, msId, reviewerId) {
  const ms = getMs(s, msId);
  const rv = getRv(s, reviewerId);
  const ver = currentVersion(ms);
  const problems = [...conflictsFor(ver, rv)];
  const load = pendingOf(s, reviewerId).length;
  if (load >= MAX_PENDING)
    problems.push({ type: '任务上限', detail: `${rv.name} 已有 ${load} 项待审（上限 ${MAX_PENDING}）` });
  const dup = s.assignments.some(
    (a) => a.manuscriptId === msId && a.version === ver.n && a.reviewerId === reviewerId &&
      ['待审', '已提交', '回避待处理'].includes(a.status));
  if (dup) problems.push({ type: '重复分配', detail: `${rv.name} 在 v${ver.n} 已有任务` });
  return { ok: problems.length === 0, problems, version: ver.n };
}

export function assignReviewer(s, msId, reviewerId) {
  const chk = checkAssign(s, msId, reviewerId);
  if (!chk.ok) return { state: s, error: chk };
  const st = clone(s);
  st.assignments.push({
    id: uid(), manuscriptId: msId, version: chk.version, reviewerId,
    deadline: deadline(), status: '待审', review: null,
  });
  return { state: st };
}

// ---- 提交意见：仅当前版本的待审任务可提交 ----
export function submitReview(s, assignmentId, review) {
  const a = s.assignments.find((x) => x.id === assignmentId);
  if (!a || a.status !== '待审') return { state: s, error: { problems: [{ type: '状态', detail: '任务不在待审状态' }] } };
  const ms = getMs(s, a.manuscriptId);
  if (a.version !== currentVersion(ms).n)
    return { state: s, error: { problems: [{ type: '版本冻结', detail: '该版本已冻结，意见不可提交' }] } };
  const st = clone(s);
  const t = st.assignments.find((x) => x.id === assignmentId);
  t.status = '已提交';
  t.review = { score: +review.score, recommend: review.recommend, comment: review.comment, submittedAt: today() };
  return { state: st };
}

// ---- 上传新版：旧版只读，未交意见作废并重排，旧意见保留可查 ----
export function uploadVersion(s, msId, { authors, abstract, body }) {
  const st = clone(s);
  const ms = getMs(st, msId);
  const prev = currentVersion(ms);
  const n = prev.n + 1;
  ms.versions.push({ n, submittedAt: today(), authors, abstract, body });
  const requeued = [];
  for (const a of st.assignments.filter((x) => x.manuscriptId === msId && x.version === prev.n && x.status === '待审')) {
    a.status = '作废';
    a.voidReason = `作者上传 v${n}，未交意见作废`;
    const rv = getRv(st, a.reviewerId);
    const conflicts = conflictsFor(ms.versions[ms.versions.length - 1], rv);
    const na = { id: uid(), manuscriptId: msId, version: n, reviewerId: a.reviewerId, deadline: deadline(), review: null };
    if (conflicts.length) {
      na.status = '回避待处理';
      na.recusal = { ...conflicts[0], since: today() };
    } else {
      na.status = '待审';
    }
    st.assignments.push(na);
    requeued.push(na);
  }
  return { state: st, version: n, requeued };
}

// ---- 处理回避：确认移除，或改派其他审稿人 ----
export function resolveRecusal(s, assignmentId, mode, newReviewerId) {
  const a = s.assignments.find((x) => x.id === assignmentId);
  if (!a || a.status !== '回避待处理')
    return { state: s, error: { problems: [{ type: '状态', detail: '该任务无待处理回避' }] } };
  const st = clone(s);
  const t = st.assignments.find((x) => x.id === assignmentId);
  if (mode === '移除') {
    t.status = '已回避';
    t.resolvedAt = today();
    return { state: st };
  }
  const chk = checkAssign(st, t.manuscriptId, newReviewerId);
  if (!chk.ok) return { state: s, error: chk };
  t.status = '已回避';
  t.resolvedAt = today();
  t.replacedBy = newReviewerId;
  st.assignments.push({
    id: uid(), manuscriptId: t.manuscriptId, version: t.version, reviewerId: newReviewerId,
    deadline: deadline(), status: '待审', review: null,
  });
  return { state: st };
}

// ---- 编辑决定门槛：≥2 位有效意见 且 无未处理回避 ----
export function decisionGate(s, msId) {
  const ms = getMs(s, msId);
  const v = currentVersion(ms).n;
  const valid = validReviews(s, msId, v).length;
  const rec = unresolvedRecusals(s, msId).length;
  const reasons = [];
  if (valid < 2) reasons.push(`有效意见不足：v${v} 仅 ${valid}/2`);
  if (rec > 0) reasons.push(`未处理回避 ${rec} 项`);
  return { ok: reasons.length === 0, reasons, valid, recusals: rec, version: v };
}

export function recordDecision(s, msId, type, note) {
  const g = decisionGate(s, msId);
  if (!g.ok) return { state: s, error: g };
  const st = clone(s);
  const ms = getMs(st, msId);
  (ms.decisions = ms.decisions || []).push({ version: g.version, type, note, at: today() });
  return { state: st };
}

// ---- 一致性校验：刷新/载入后核对 版本-任务-决定 ----
export function reconcile(s) {
  const issues = [];
  for (const ms of s.manuscripts) {
    const cur = currentVersion(ms).n;
    ms.versions.forEach((v, i) => {
      if (v.n !== i + 1) issues.push(`《${ms.title}》版本号不连续`);
    });
    for (const a of s.assignments.filter((x) => x.manuscriptId === ms.id)) {
      if (a.status === '待审' && a.version !== cur)
        issues.push(`《${ms.title}》v${a.version} 已冻结但仍挂有待审任务`);
      if (a.status === '已提交' && !a.review)
        issues.push(`《${ms.title}》v${a.version} 存在缺少意见的已提交任务`);
    }
    for (const d of ms.decisions || []) {
      if (d.version === cur && !decisionGate(s, ms.id).ok)
        issues.push(`《${ms.title}》当前版本的决定与规则不一致`);
    }
  }
  return issues;
}
