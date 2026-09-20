// 规则引擎自测（node src/rules/selftest.js）：不依赖测试框架
import * as P from './policy.js';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass += 1; }
  else { fail += 1; console.error('  ✗', msg); }
};

const DAY = 24 * 60 * 60 * 1000;
let clock = 1_000_000_000_000;
const now = () => clock;
const tick = (days) => { clock += days * DAY; };

function fresh() {
  const reviewers = [
    { id: 'rA', name: 'Alice', affiliation: 'MIT', collaborators: ['Zoe'] },
    { id: 'rB', name: 'Bob', affiliation: 'CMU', collaborators: [] },
    { id: 'rC', name: 'Cara', affiliation: 'CMU', collaborators: [] },
  ];
  return {
    meta: { seq: 0 },
    reviewers,
    manuscripts: [
      {
        id: 'mA', title: 'Paper A', currentVersion: 1,
        versions: [{ version: 1, createdAt: now(), authors: [{ name: 'Zoe', affiliation: 'MIT' }], body: 'v1 text' }],
        decisions: [],
      },
      {
        id: 'mB', title: 'Paper B', currentVersion: 1,
        versions: [{ version: 1, createdAt: now(), authors: [{ name: 'Dan', affiliation: 'Stanford' }], body: 'text' }],
        decisions: [],
      },
    ],
    assignments: [],
    restrictions: [],
  };
}

// 1. 共同作者/同机构回避在分配前拦截，且不产生任务
{
  let s = fresh();
  const m = s.manuscripts[0];
  const v1 = m.versions[0];
  ok(P.conflictOf(s.reviewers[0], v1)?.kind === 'coauthor', 'Alice 与 Zoe 共同作者应判 coauthor');
  let r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rA' }, now());
  ok(!r.ok && r.state.assignments.length === 0, 'coauthor 被拦截且无任务');
  ok(r.state.restrictions.length === 1 && r.state.restrictions[0].status === 'blocked', '拦截尝试留痕 blocked');
  s = r.state;
  r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now());
  ok(r.ok, 'Bob 无冲突可分配');
  s = r.state;
  // 同人本版重复分配 -> duplicate
  r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now());
  ok(!r.ok, '同一版本重复分配应拦截');
}

// 2. 待审上限 2 项
{
  let s = fresh();
  let r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rC' }, now());
  s = r.state;
  r = P.assignReviewer(s, { manuscriptId: 'mB', reviewerId: 'rC' }, now());
  s = r.state;
  // mA 加一位作者使新稿可测；用第三篇稿
  s.manuscripts.push({ id: 'mC', title: 'C', currentVersion: 1,
    versions: [{ version: 1, createdAt: now(), authors: [{ name: 'Eve', affiliation: 'Oxford' }], body: '' }],
    decisions: [] });
  r = P.assignReviewer(s, { manuscriptId: 'mC', reviewerId: 'rC' }, now());
  ok(!r.ok && P.pendingOfReviewer(r.state, 'rC').length === 2, '第三项待审应被 workload 拦截，仍为 2');
  // 交一份意见后释放名额
  const a = s.assignments.find((x) => x.manuscriptId === 'mA');
  r = P.submitReview(r.state, a.id, { recommendation: 'accept', comments: 'good' }, now());
  s = r.state;
  ok(r.ok && P.pendingOfReviewer(s, 'rC').length === 1, '交意见后待审降为 1');
  r = P.assignReviewer(s, { manuscriptId: 'mC', reviewerId: 'rC' }, now());
  ok(r.ok, '释放名额后可再分配');
}

// 3. 不足两位有效意见不得决定
{
  let s = fresh();
  let r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now());
  s = r.state;
  r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rC' }, now());
  s = r.state;
  ok(P.readiness(s, s.manuscripts[0]).ready === false, '0 份意见不可决定');
  const [a1] = s.assignments;
  r = P.submitReview(s, a1.id, { recommendation: 'accept', comments: 'ok' }, now());
  s = r.state;
  ok(!P.readiness(s, s.manuscripts[0]).ready, '1 份意见仍不可决定');
  r = P.recordDecision(s, 'mA', { action: 'accept' }, now());
  ok(!r.ok && s.manuscripts[0].decisions.length === 0, '门禁拒绝写入决定');
  const a2 = s.assignments[1];
  r = P.submitReview(s, a2.id, { recommendation: 'minor', comments: 'ok' }, now());
  s = r.state;
  ok(P.readiness(s, s.manuscripts[0]).ready, '2 份意见可决定');
  r = P.recordDecision(s, 'mA', { action: 'accept', comment: 'done' }, now());
  s = r.state;
  ok(r.ok && s.manuscripts[0].decisions.length === 1, '决定写入成功');
}

// 4. 回避未处理不得决定；改派后解除
{
  let s = fresh();
  let r = P.assignReviewer(s, { manuscriptId: 'mB', reviewerId: 'rB' }, now());
  s = r.state;
  r = P.assignReviewer(s, { manuscriptId: 'mB', reviewerId: 'rC' }, now());
  s = r.state;
  const [a1, a2] = s.assignments.filter((x) => x.manuscriptId === 'mB');
  s = P.submitReview(s, a1.id, { recommendation: 'accept', comments: 'x' }, now()).state;
  s = P.submitReview(s, a2.id, { recommendation: 'accept', comments: 'x' }, now()).state;
  // 此时意见已满足，但模拟另一个 pending 任务申请回避
  r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now()); // mA 作者 Zoe@MIT, Bob 可
  s = r.state;
  const a3 = s.assignments.find((x) => x.manuscriptId === 'mA');
  r = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rC' }, now());
  s = r.state;
  const a4 = s.assignments.find((x) => x.id !== a3.id && x.manuscriptId === 'mA');
  // mA 上制造 2 份意见
  s = P.submitReview(s, a3.id, { recommendation: 'accept', comments: 'x' }, now()).state;
  s = P.submitReview(s, a4.id, { recommendation: 'accept', comments: 'x' }, now()).state;
  // 再加第三个任务并回避
  s.manuscripts.push({ id: 'mD', title: 'D', currentVersion: 1,
    versions: [{ version: 1, createdAt: now(), authors: [{ name: 'Fay', affiliation: 'ETH' }], body: '' }],
    decisions: [] });
  r = P.assignReviewer(s, { manuscriptId: 'mD', reviewerId: 'rB' }, now());
  s = r.state;
  const a5 = s.assignments.find((x) => x.manuscriptId === 'mD');
  r = P.recuse(s, a5.id, { kind: 'coauthor', note: '私下合作' }, now());
  s = r.state;
  const flag = s.restrictions.find((x) => x.status === 'open');
  ok(!!flag && flag.kind === 'coauthor', '回避生成 open 限制');
  // mD 本身无意见，双重原因；但 mA 意见满足且无 open，应可决定
  ok(P.readiness(s, s.manuscripts.find((m) => m.id === 'mA')).ready, 'mA 无回避可决定');
  ok(!P.readiness(s, s.manuscripts.find((m) => m.id === 'mD')).ready, 'mD 有未处理回避不可决定');
  // 改派给 Cara：Cara 当前待审？之前 mB 两份都 submitted -> 0 pending，可改派
  r = P.reassign(s, flag.id, 'rC', now());
  s = r.state;
  ok(r.ok, '改派成功');
  ok(s.restrictions.find((x) => x.id === flag.id).status === 'resolved', '限制解除');
}

// 构造一个带 open 回避的小状态用于拦截改派
function freshWithOpen() {
  let s = fresh();
  s = P.assignReviewer(s, { manuscriptId: 'mB', reviewerId: 'rB' }, now()).state;
  const a = s.assignments[0];
  s = P.recuse(s, a.id, { kind: 'coauthor', note: 'n' }, now()).state;
  return s;
}
{
  const s = freshWithOpen();
  const flag = s.restrictions.find((x) => x.status === 'open');
  // mB 作者 Dan@Stanford；Alice@MIT 无机构冲突，但 collaborators 无 Dan -> 可改派
  let r = P.reassign(s, flag.id, 'rA', now());
  ok(r.ok, '无冲突审稿人可改派');
  const s2 = freshWithOpen();
  const f2 = s2.restrictions.find((x) => x.status === 'open');
  // workload: 先让 Alice 占满 2 个待审（mB 之外两篇）
  s2.manuscripts.push(
    { id: 'mE', currentVersion: 1, title: 'E', versions: [{ version: 1, createdAt: now(), authors: [{ name: 'X1', affiliation: 'U1' }], body: '' }], decisions: [] },
    { id: 'mF', currentVersion: 1, title: 'F', versions: [{ version: 1, createdAt: now(), authors: [{ name: 'X2', affiliation: 'U2' }], body: '' }], decisions: [] }
  );
  let t = P.assignReviewer(s2, { manuscriptId: 'mE', reviewerId: 'rA' }, now()).state;
  t = P.assignReviewer(t, { manuscriptId: 'mF', reviewerId: 'rA' }, now()).state;
  r = P.reassign(t, f2.id, 'rA', now());
  ok(!r.ok, '改派时 workload 同样拦截');
}

// 5. 上传新版：冻结、旧任务作废、意见保留、自动重排与失败
{
  let s = fresh();
  s.reviewers.push({ id: 'rD', name: 'Dee', affiliation: 'ETH', collaborators: [] });
  // rB 待审（将因新版作者 Bob 共同作者而重排失败）；rD 待审（无冲突，重排成功）
  s = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now()).state;
  s = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rD' }, now()).state;
  // 另有 rC 已交意见 -> 永不重排，但意见保留可查
  s = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rC' }, now()).state;
  const ac = s.assignments.find((x) => x.reviewerId === 'rC');
  s = P.submitReview(s, ac.id, { recommendation: 'reject', comments: 'old review' }, now()).state;

  tick(5);
  const r = P.uploadVersion(s, 'mA', {
    authors: [{ name: 'Zoe', affiliation: 'MIT' }, { name: 'Bob', affiliation: 'CMU' }],
    body: 'v2 text',
  }, now());
  s = r.state;
  const m = s.manuscripts[0];
  ok(r.rerouted === 1 && r.failed === 1, '重排：rD 成功 1 项，rB 因共同作者失败 1 项');
  ok(m.versions[0].body === 'v1 text' && m.versions[1].body === 'v2 text', 'v1 正文冻结不变，v2 独立快照');
  const oldTasks = P.versionAssignments(s, 'mA', 1);
  ok(oldTasks.filter((x) => x.status === 'void').length === 2, '旧版两项待审任务作废');
  ok(oldTasks.find((x) => x.status === 'submitted')?.review.comments === 'old review', '旧意见保留可查');
  const newTasks = P.versionAssignments(s, 'mA', 2);
  ok(newTasks.length === 1 && newTasks[0].reviewerId === 'rD' && newTasks[0].origin === 'reroute',
    '仅 pending 且无冲突的 rD 重排到新版；已交意见者不重排');
  ok(newTasks[0].deadline === now() + 14 * DAY, '重排任务重新起算 14 天时限');
  ok(P.validReviews(s, m).length === 0, '旧意见不计入当前版本门禁');
}

// 6. 重排失败 -> 当前版本未处理回避，阻止决定
{
  let s = fresh();
  // mA v1 作者 Zoe@MIT；rA 因 coauthor 不能分。换一个后续会冲突的路径：
  // 分配 rB（CMU? Bob@CMU 无冲突）pending，新版给作者加一位 Bob 的同机构 CMU 的人
  s = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now()).state;
  tick(3);
  const r = P.uploadVersion(s, 'mA', {
    authors: [{ name: 'Zoe', affiliation: 'MIT' }, { name: 'Hal', affiliation: 'CMU' }],
    body: 'v2',
  }, now());
  s = r.state;
  ok(r.failed === 1, '重排因同机构失败计数 1');
  const flag = s.restrictions.find((x) => x.status === 'open' && x.reroute);
  ok(flag && flag.kind === 'affiliation' && flag.version === 2, '重排失败成为 v2 未处理回避(同机构)');
  const m = s.manuscripts[0];
  ok(!P.readiness(s, m).ready, '未处理回避阻止决定');
  // 改派给 rC？rC 也在 CMU -> 同样冲突；给 rA？rA 与 Zoe coauthor。无人可派 -> 登记新审稿人即可
  s.reviewers.push({ id: 'rD', name: 'Dee', affiliation: 'ETH', collaborators: [] });
  const rr = P.reassign(s, flag.id, 'rD', now());
  ok(rr.ok, '新审稿人无冲突，改派成功，回避解除');
  ok(P.readiness(rr.state, m).reasons.join('').includes('有效意见'), '回避解除后仅剩意见不足原因');
}

// 7. 旧版未处理回避在新版上传后随旧版关闭
{
  let s = fresh();
  s = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now()).state;
  const a = s.assignments[0];
  s = P.recuse(s, a.id, { kind: 'coauthor', note: 'n' }, now()).state;
  ok(P.openRestrictions(s, s.manuscripts[0]).length === 1, 'v1 有未处理回避');
  tick(2);
  s = P.uploadVersion(s, 'mA', { authors: [{ name: 'Zoe', affiliation: 'MIT' }], body: 'v2' }, now()).state;
  const m = s.manuscripts[0];
  ok(P.openRestrictions(s, m).length === 0, '旧版回避随新版上传关闭');
  ok(P.versionAssignments(s, 'mA', 1).every((x) => !(x.status === 'recused' && !x.resolved)), '旧版回避任务标记已处理');
}

// 8. 纯函数：动作不修改原状态
{
  const s = fresh();
  const snap = JSON.stringify(s);
  P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rA' }, now());
  P.uploadVersion(s, 'mA', { authors: [{ name: 'Q', affiliation: 'U' }], body: 'v2' }, now());
  ok(JSON.stringify(s) === snap, '所有迁移均不可变（输入状态未被修改）');
}

// 9. 已决定版本再传新版，旧决定归档但门禁重置
{
  let s = fresh();
  s = P.assignReviewer(s, { manuscriptId: 'mB', reviewerId: 'rB' }, now()).state;
  s = P.assignReviewer(s, { manuscriptId: 'mB', reviewerId: 'rC' }, now()).state;
  const [a1, a2] = s.assignments;
  s = P.submitReview(s, a1.id, { recommendation: 'accept', comments: 'x' }, now()).state;
  s = P.submitReview(s, a2.id, { recommendation: 'accept', comments: 'x' }, now()).state;
  s = P.recordDecision(s, 'mB', { action: 'accept' }, now()).state;
  tick(10);
  s = P.uploadVersion(s, 'mB', { authors: [{ name: 'Dan', affiliation: 'Stanford' }], body: 'v2' }, now()).state;
  const m = s.manuscripts.find((x) => x.id === 'mB');
  ok(m.decisions.length === 1 && m.decisions[0].version === 1, '旧决定保留并绑定 v1');
  ok(!P.readiness(s, m).ready, 'v2 门禁重置，需要新意见');
  const st = P.manuscriptStatus(s, m);
  ok(st.key === 'reviewing' || st.key === 'unassigned', '状态不再是已决定');
}

// 10. 只对旧版本读：submit/recuse 走状态判断（void 任务不能交意见）
{
  let s = fresh();
  s = P.assignReviewer(s, { manuscriptId: 'mA', reviewerId: 'rB' }, now()).state;
  const a = s.assignments[0];
  s = P.uploadVersion(s, 'mA', { authors: [{ name: 'Zoe', affiliation: 'MIT' }], body: 'v2' }, now()).state;
  const voided = s.assignments.find((x) => x.id === a.id);
  const r1 = P.submitReview(s, voided.id, { recommendation: 'accept', comments: 'x' }, now());
  ok(!r1.ok, '旧版作废任务不能补交意见');
  const r2 = P.recuse(s, voided.id, { kind: 'coauthor' }, now());
  ok(!r2.ok, '旧版作废任务不能申请回避');
}

console.log(fail === 0 ? `\n全部通过：${pass} 项断言` : `\n${fail} 项失败，${pass} 项通过`);
process.exit(fail === 0 ? 0 : 1);
