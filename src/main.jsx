// 界面层：只负责渲染与交互，业务判断全部走 rules.js
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { load, save } from './data.js';
import * as R from './rules.js';
import './styles.css';

const STATUS_CLS = { 待审: 'pending', 已提交: 'done', 作废: 'void', 回避待处理: 'coi', 已回避: 'recused' };
const Badge = ({ s }) => <span className={'badge ' + (STATUS_CLS[s] || '')}>{s}</span>;
const DECISIONS = ['接收', '修改后重审', '拒稿'];

// 冲突说明框：列出 稿件 / 版本 / 审稿人 / 时限 / 限制
function ConflictBox({ ms, version, reviewer, limit, problems }) {
  return (
    <div className="conflict-box">
      <strong>⚠ 冲突 · 无法分配</strong>
      <div className="conflict-grid">
        <span>稿件</span><b>《{ms.title}》</b>
        <span>版本</span><b>v{version}</b>
        <span>审稿人</span><b>{reviewer.name}（{reviewer.institution}）</b>
        <span>时限</span><b>{limit}</b>
        <span>限制</span>
        <b>{problems.map((p, i) => <em key={i}>[{p.type}] {p.detail}</em>)}</b>
      </div>
    </div>
  );
}

// 分配审稿人
function AssignRow({ data, ms, act }) {
  const [rid, setRid] = useState('');
  const [err, setErr] = useState(null);
  const submit = () => {
    if (!rid) return;
    const res = R.assignReviewer(data, ms.id, rid);
    if (res.error) setErr(res.error);
    else { setErr(null); setRid(''); act(res, '已分配审稿任务'); }
  };
  const rv = rid ? R.getRv(data, rid) : null;
  return (
    <div className="assign-row">
      <div className="assign-line">
        <select value={rid} onChange={(e) => { setRid(e.target.value); setErr(null); }}>
          <option value="">选择审稿人…</option>
          {data.reviewers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.institution} · 待审 {R.pendingOf(data, r.id).length}/{R.MAX_PENDING}
            </option>
          ))}
        </select>
        <button className="primary" onClick={submit}>分配（时限 {R.REVIEW_DAYS} 天）</button>
      </div>
      {err && rv && <ConflictBox ms={ms} version={err.version} reviewer={rv} limit={R.deadline()} problems={err.problems} />}
    </div>
  );
}

// 提交审稿意见（仅当前版本的待审任务）
function ReviewForm({ data, assignment, act }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ score: '4', recommend: '接收', comment: '' });
  const submit = () => {
    if (!form.comment.trim()) return;
    const res = R.submitReview(data, assignment.id, form);
    if (res.error) return;
    act(res, '意见已提交');
  };
  if (!open) return <button className="mini" onClick={() => setOpen(true)}>提交意见</button>;
  return (
    <div className="review-form">
      <div className="rf-line">
        <label>评分
          <select value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>建议
          <select value={form.recommend} onChange={(e) => setForm({ ...form, recommend: e.target.value })}>
            {DECISIONS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
      </div>
      <textarea rows="2" placeholder="审稿意见…" value={form.comment}
        onChange={(e) => setForm({ ...form, comment: e.target.value })} />
      <div className="rf-line">
        <button className="primary" onClick={submit}>提交</button>
        <button className="ghost" onClick={() => setOpen(false)}>取消</button>
      </div>
    </div>
  );
}

// 处理回避：确认移除或改派
function RecusalActions({ data, assignment, act }) {
  const [rid, setRid] = useState('');
  const [err, setErr] = useState(null);
  const ms = R.getMs(data, assignment.manuscriptId);
  const run = (mode) => {
    const res = R.resolveRecusal(data, assignment.id, mode, rid);
    if (res.error) { setErr(res.error); return; }
    setErr(null);
    act(res, mode === '移除' ? '已确认回避并移除任务' : '已改派审稿人');
  };
  return (
    <div className="recusal-actions">
      <button className="mini warn" onClick={() => run('移除')}>确认回避并移除</button>
      <select value={rid} onChange={(e) => setRid(e.target.value)}>
        <option value="">改派给…</option>
        {data.reviewers.filter((r) => r.id !== assignment.reviewerId).map((r) => (
          <option key={r.id} value={r.id}>{r.name} · {r.institution}</option>
        ))}
      </select>
      <button className="mini" disabled={!rid} onClick={() => run('改派')}>改派</button>
      {err && rid && (
        <ConflictBox ms={ms} version={err.version} reviewer={R.getRv(data, rid)} limit={R.deadline()} problems={err.problems} />
      )}
    </div>
  );
}

// 上传新版本
function UploadModal({ data, ms, act, close }) {
  const cur = R.currentVersion(ms);
  const [form, setForm] = useState({
    authors: cur.authors.map((a) => `${a.name}, ${a.institution}`).join('\n'),
    abstract: cur.abstract,
    body: cur.body,
  });
  const submit = () => {
    const authors = form.authors.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, institution = ''] = l.split(/[,，]/).map((x) => x.trim());
      return { name, institution };
    });
    if (!authors.length || !form.abstract.trim() || !form.body.trim()) return;
    const res = R.uploadVersion(data, ms.id, { authors, abstract: form.abstract, body: form.body });
    const flagged = res.requeued.filter((a) => a.status === '回避待处理').length;
    act(res, `v${res.version} 已上传：旧版冻结只读，未交意见作废并重排${flagged ? `，${flagged} 项重排触发回避` : ''}`);
    close();
  };
  return (
    <div className="modal-bg">
      <div className="modal">
        <button className="close" onClick={close}>×</button>
        <span className="crumb">NEW VERSION</span>
        <h2>上传 v{cur.n + 1}（上传后 v{cur.n} 冻结只读）</h2>
        <label>作者（每行：姓名, 机构）
          <textarea rows="3" value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} />
        </label>
        <label>摘要
          <textarea rows="2" value={form.abstract} onChange={(e) => setForm({ ...form, abstract: e.target.value })} />
        </label>
        <label>正文
          <textarea rows="6" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </label>
        <button className="primary full" onClick={submit}>冻结并上传新版本</button>
      </div>
    </div>
  );
}

// 编辑决定面板
function DecisionPanel({ data, ms, act }) {
  const [note, setNote] = useState('');
  const gate = R.decisionGate(data, ms.id);
  const decide = (type) => {
    const res = R.recordDecision(data, ms.id, type, note);
    if (res.error) return;
    setNote('');
    act(res, `已记录决定：${type}（v${gate.version}）`);
  };
  return (
    <div className="detail-section">
      <h4>编辑决定 <span>DECISION · v{gate.version}</span></h4>
      <div className="gate">
        <span className={gate.valid >= 2 ? 'ok' : 'bad'}>有效意见 {gate.valid}/2</span>
        <span className={gate.recusals === 0 ? 'ok' : 'bad'}>未处理回避 {gate.recusals}</span>
        {!gate.ok && <small>{gate.reasons.join('；')}，不得给出编辑决定</small>}
      </div>
      <div className="decide-line">
        <input placeholder="决定说明（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
        {DECISIONS.map((d) => (
          <button key={d} className="primary" disabled={!gate.ok} onClick={() => decide(d)}>{d}</button>
        ))}
      </div>
      {(ms.decisions || []).length > 0 && (
        <ul className="decision-history">
          {ms.decisions.map((d, i) => (
            <li key={i}><b>v{d.version}</b> · {d.type} · {d.at}{d.note ? ` — ${d.note}` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 稿件详情
function Detail({ data, ms, act }) {
  const curN = R.currentVersion(ms).n;
  const [v, setV] = useState(curN);
  const [showUpload, setShowUpload] = useState(false);
  useEffect(() => { setV(R.currentVersion(ms).n); }, [ms.id, ms.versions.length]);
  const ver = ms.versions.find((x) => x.n === v);
  const isCur = v === curN;
  const asg = R.msAssignments(data, ms.id, v);
  const lastDecision = (ms.decisions || []).slice(-1)[0];
  return (
    <section className="detail">
      <div className="detail-top">
        <span className="crumb">MANUSCRIPT / {ms.id.toUpperCase()} · {ms.field}</span>
        {lastDecision && <span className="badge decision">最近决定：{lastDecision.type}（v{lastDecision.version}）</span>}
      </div>
      <h2>{ms.title}</h2>
      <div className="version-tabs">
        {ms.versions.map((x) => (
          <button key={x.n} className={v === x.n ? 'on' : ''} onClick={() => setV(x.n)}>
            v{x.n}{x.n === curN ? ' · 当前' : ' · 只读'}
          </button>
        ))}
        {isCur && <button className="upload" onClick={() => setShowUpload(true)}>⇧ 上传 v{curN + 1}</button>}
      </div>
      {!isCur && <div className="frozen-banner">▣ 此版本已冻结：正文与作者只读，意见不可再提交，历史意见保留可查。</div>}
      <div className="detail-section">
        <h4>作者 <span>{isCur ? 'CURRENT' : 'FROZEN'}</span></h4>
        <div className="author-chips">
          {ver.authors.map((a, i) => <span key={i} className="chip">{a.name}<small>{a.institution}</small></span>)}
        </div>
      </div>
      <div className="detail-section">
        <h4>摘要 <span>ABSTRACT</span></h4>
        <p>{ver.abstract}</p>
      </div>
      <div className="detail-section">
        <h4>正文 <span>v{v} · 提交于 {ver.submittedAt}</span></h4>
        <pre className="body-box">{ver.body}</pre>
      </div>
      <div className="detail-section">
        <h4>审稿任务与意见 <span>{asg.length} 项</span></h4>
        {asg.length === 0 && <p className="muted">本版本暂无审稿任务。</p>}
        {asg.map((a) => {
          const rv = R.getRv(data, a.reviewerId);
          return (
            <div key={a.id} className={'task ' + (STATUS_CLS[a.status] || '')}>
              <div className="task-head">
                <b>{rv.name}</b><small>{rv.institution}</small>
                <span className="deadline">时限 {a.deadline}</span>
                <Badge s={a.status} />
              </div>
              {a.voidReason && <p className="muted">作废原因：{a.voidReason}</p>}
              {a.recusal && <p className="coi-line">回避：{a.recusal.type} — {a.recusal.detail}（{a.recusal.since}）</p>}
              {a.review && (
                <div className="review-box">
                  <div><b>评分 {a.review.score}/5</b> · 建议 {a.review.recommend} · {a.review.submittedAt}</div>
                  <p>{a.review.comment}</p>
                </div>
              )}
              {isCur && a.status === '待审' && <ReviewForm data={data} assignment={a} act={act} />}
              {a.status === '回避待处理' && <RecusalActions data={data} assignment={a} act={act} />}
            </div>
          );
        })}
        {isCur && <AssignRow data={data} ms={ms} act={act} />}
      </div>
      {isCur && <DecisionPanel data={data} ms={ms} act={act} />}
      {showUpload && <UploadModal data={data} ms={ms} act={act} close={() => setShowUpload(false)} />}
    </section>
  );
}

// 审稿人视图
function ReviewersView({ data }) {
  return (
    <section className="detail wide">
      <span className="crumb">REVIEWERS</span>
      <h2>审稿人负荷</h2>
      <p className="muted">每人同时最多 {R.MAX_PENDING} 项待审。</p>
      <div className="reviewer-grid">
        {data.reviewers.map((r) => {
          const pend = R.pendingOf(data, r.id);
          const mine = data.assignments.filter((a) => a.reviewerId === r.id);
          return (
            <div key={r.id} className={'reviewer-card' + (pend.length >= R.MAX_PENDING ? ' full' : '')}>
              <div className="rc-head">
                <b>{r.name}</b><small>{r.institution}</small>
                <span className="load">{pend.length}/{R.MAX_PENDING} 待审</span>
              </div>
              <ul>
                {mine.map((a) => {
                  const ms = R.getMs(data, a.manuscriptId);
                  return <li key={a.id}>《{ms.title}》 v{a.version} · 时限 {a.deadline} · <Badge s={a.status} /></li>;
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// 冲突与回避视图：列出 稿件 / 版本 / 审稿人 / 时限 / 限制
function ConflictsView({ data, goto }) {
  const recusals = R.unresolvedRecusals(data);
  const full = data.reviewers.filter((r) => R.pendingOf(data, r.id).length >= R.MAX_PENDING);
  return (
    <section className="detail wide">
      <span className="crumb">CONFLICTS</span>
      <h2>冲突与回避</h2>
      <div className="detail-section">
        <h4>未处理回避 <span>{recusals.length} 项</span></h4>
        {recusals.length === 0 && <p className="muted">暂无未处理回避。</p>}
        {recusals.map((a) => {
          const ms = R.getMs(data, a.manuscriptId);
          const rv = R.getRv(data, a.reviewerId);
          return (
            <div key={a.id} className="conflict-box row">
              <div className="conflict-grid">
                <span>稿件</span><b>《{ms.title}》</b>
                <span>版本</span><b>v{a.version}</b>
                <span>审稿人</span><b>{rv.name}（{rv.institution}）</b>
                <span>时限</span><b>{a.deadline}</b>
                <span>限制</span><b><em>[{a.recusal.type}] {a.recusal.detail}</em></b>
              </div>
              <button className="mini" onClick={() => goto(ms.id)}>去处理</button>
            </div>
          );
        })}
      </div>
      <div className="detail-section">
        <h4>任务上限 <span>限制：每人 ≤ {R.MAX_PENDING} 项待审</span></h4>
        {full.length === 0 && <p className="muted">暂无审稿人达到上限。</p>}
        {full.map((r) => (
          <div key={r.id} className="conflict-box row">
            <div className="conflict-grid">
              <span>审稿人</span><b>{r.name}（{r.institution}）</b>
              <span>限制</span><b><em>[任务上限] 已有 {R.MAX_PENDING} 项待审，新分配将被拒绝</em></b>
              <span>稿件</span>
              <b>{R.pendingOf(data, r.id).map((a) => {
                const ms = R.getMs(data, a.manuscriptId);
                return `《${ms.title}》v${a.version}（时限 ${a.deadline}）`;
              }).join('；')}</b>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [data, setData] = useState(load);
  const [view, setView] = useState('ms');
  const [sel, setSel] = useState(data.manuscripts[0].id);
  const [notice, setNotice] = useState('');
  const issues = useMemo(() => R.reconcile(data), [data]);
  useEffect(() => { save(data); }, [data]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const act = (res, okMsg) => {
    if (res.error) { setNotice('⚠ ' + res.error.problems.map((p) => p.detail).join('；')); return; }
    setData(res.state);
    if (okMsg) setNotice(okMsg);
  };
  const ms = R.getMs(data, sel) || data.manuscripts[0];
  const recCount = R.unresolvedRecusals(data).length;
  const pendCount = data.assignments.filter((a) => a.status === '待审').length;

  return (
    <div className="app">
      <aside>
        <div className="logo"><span>∴</span> PREPRINT DESK</div>
        <div className="library-head">
          <span>预印本审稿台</span>
          <strong>{data.manuscripts.length}<small> 篇在审</small></strong>
        </div>
        <nav>
          <button className={view === 'ms' ? 'active' : ''} onClick={() => setView('ms')}>▤ <span>稿件</span><b>{data.manuscripts.length}</b></button>
          <button className={view === 'rv' ? 'active' : ''} onClick={() => setView('rv')}>♟ <span>审稿人</span><b>{pendCount} 待审</b></button>
          <button className={view === 'cf' ? 'active' : ''} onClick={() => setView('cf')}>⚠ <span>冲突与回避</span><b>{recCount}</b></button>
        </nav>
        <div className="side-tags">
          <small>规则</small>
          <button>≤ {R.MAX_PENDING} 项待审 / 人</button>
          <button>≥ 2 份有效意见方可决定</button>
          <button>时限 {R.REVIEW_DAYS} 天</button>
        </div>
        <div className="side-foot">
          <small className={issues.length ? 'inconsistent' : 'consistent'}>
            {issues.length ? `⚠ 一致性：${issues.length} 处异常` : '✓ 版本 / 任务 / 决定一致'}
          </small>
          {issues.map((i, k) => <small key={k} className="inconsistent">{i}</small>)}
          <small>本地数据库 · 刷新后保持</small>
        </div>
      </aside>
      <main>
        {view === 'ms' && (
          <div className="body">
            <section className="paper-list">
              {data.manuscripts.map((m) => {
                const cur = R.currentVersion(m);
                const gate = R.decisionGate(data, m.id);
                const last = (m.decisions || []).slice(-1)[0];
                return (
                  <button key={m.id} className={'paper ' + (sel === m.id ? 'selected' : '')} onClick={() => setSel(m.id)}>
                    <div className="paper-year">v{cur.n}</div>
                    <div className="paper-copy">
                      <h3>{m.title}</h3>
                      <p>{cur.authors.map((a) => a.name).join('、')} · {m.field}</p>
                      <div>
                        <span>有效意见 {gate.valid}/2</span>
                        {gate.recusals > 0 && <span className="warn-text">回避 {gate.recusals}</span>}
                      </div>
                    </div>
                    <small className={'status ' + (last ? 'done' : gate.ok ? 'ready' : 'pending')}>
                      {last ? last.type : gate.ok ? '可决定' : '审理中'}
                    </small>
                  </button>
                );
              })}
            </section>
            <Detail data={data} ms={ms} act={act} />
          </div>
        )}
        {view === 'rv' && <ReviewersView data={data} />}
        {view === 'cf' && <ConflictsView data={data} goto={(id) => { setSel(id); setView('ms'); }} />}
      </main>
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
