// 界面层：所有模态对话框。只负责收集输入与展示校验结果，业务调用走 store。
import React, { useState } from 'react';
import * as P from '../rules/policy.js';
import { store } from '../data/store.js';

export function ModalShell({ title, sub, onClose, wide, children }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">{sub}</span>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}{hint && <em>{hint}</em>}</span>
      {children}
    </label>
  );
}

// 作者录入：每行 “姓名 / 机构”
export function parseAuthorLines(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[/｜|]/).map((x) => x.trim());
      return { name: parts[0] || '', affiliation: parts[1] || '' };
    })
    .filter((a) => a.name);
}
export const authorsToLines = (authors) =>
  authors.map((a) => `${a.name} / ${a.affiliation}`).join('\n');

// ---------- 指派审稿人 ----------
export function AssignModal({ s, m, version, onClose, notify }) {
  const [rid, setRid] = useState('');
  const reviewer = s.reviewers.find((r) => r.id === rid) || null;
  const violations = reviewer ? P.evaluateAssignment(s, m.id, version, reviewer) : [];
  const pending = reviewer ? P.pendingOfReviewer(s, reviewer.id).length : 0;

  const confirm = () => {
    const r = store.assignReviewer({ manuscriptId: m.id, reviewerId: rid });
    notify(r, `已向 ${reviewer.name} 发出审稿邀请（v${version.version}）`);
    if (r.ok) onClose();
  };

  return (
    <ModalShell title="指派审稿人" sub={`ASSIGN · v${version.version}`} onClose={onClose}>
      <Field label="选择审稿人" hint={`每人最多 ${P.MAX_PENDING} 项待审；同机构与共同作者自动回避`}>
        <select value={rid} onChange={(e) => setRid(e.target.value)}>
          <option value="">— 请选择 —</option>
          {s.reviewers.map((r) => {
            const v = P.evaluateAssignment(s, m.id, version, r);
            const n = P.pendingOfReviewer(s, r.id).length;
            return (
              <option key={r.id} value={r.id}>
                {r.name}（{r.affiliation}）· 待审 {n}/{P.MAX_PENDING}
                {v.length ? ` · 不可：${v.map((x) => P.RESTRICTION_LABEL[x.kind]).join('、')}` : ''}
              </option>
            );
          })}
        </select>
      </Field>
      {reviewer && (
        <div className={'check-panel ' + (violations.length ? 'bad' : 'good')}>
          {violations.length ? (
            <>
              <b>校验未通过，不能指派：</b>
              <ul>{violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
            </>
          ) : (
            <b>校验通过：无同机构 / 共同作者冲突，当前待审 {pending}/{P.MAX_PENDING} 项。</b>
          )}
        </div>
      )}
      <button className="primary full" disabled={!rid || violations.length > 0} onClick={confirm}>
        确认指派
      </button>
    </ModalShell>
  );
}

// ---------- 改派（处理未处理回避） ----------
export function ReassignModal({ s, flag, onClose, notify }) {
  const m = P.getManuscript(s, flag.manuscriptId);
  const version = P.getVersion(m, flag.version);
  const oldReviewer = P.getReviewer(s, flag.reviewerId);
  const [rid, setRid] = useState('');
  const reviewer = s.reviewers.find((r) => r.id === rid) || null;
  const violations = reviewer ? P.evaluateAssignment(s, m.id, version, reviewer) : [];
  const pending = reviewer ? P.pendingOfReviewer(s, reviewer.id).length : 0;

  const confirm = () => {
    const r = store.reassign(flag.id, rid);
    notify(r, `已改派给 ${reviewer.name}，原回避项关闭`);
    if (r.ok) onClose();
  };

  return (
    <ModalShell title="改派审稿人" sub={`REROUTE · v${flag.version}`} onClose={onClose}>
      <div className="check-panel bad">
        <b>待处理回避：</b>{flag.message}
        <br />原审稿人：{oldReviewer.name}
      </div>
      <Field label="改派给">
        <select value={rid} onChange={(e) => setRid(e.target.value)}>
          <option value="">— 请选择 —</option>
          {s.reviewers.map((r) => {
            const v = P.evaluateAssignment(s, m.id, version, r);
            const n = P.pendingOfReviewer(s, r.id).length;
            return (
              <option key={r.id} value={r.id}>
                {r.name}（{r.affiliation}）· 待审 {n}/{P.MAX_PENDING}
                {v.length ? ` · 不可：${v.map((x) => P.RESTRICTION_LABEL[x.kind]).join('、')}` : ''}
              </option>
            );
          })}
        </select>
      </Field>
      {reviewer && (
        <div className={'check-panel ' + (violations.length ? 'bad' : 'good')}>
          {violations.length ? (
            <ul>{violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
          ) : (
            <b>校验通过：当前待审 {pending}/{P.MAX_PENDING} 项，时限 {P.WINDOW_DAYS} 天。</b>
          )}
        </div>
      )}
      <button className="primary full" disabled={!rid || violations.length > 0} onClick={confirm}>
        确认改派
      </button>
    </ModalShell>
  );
}

// ---------- 审稿人申请回避 ----------
export function RecuseModal({ s, a, onClose, notify }) {
  const m = P.getManuscript(s, a.manuscriptId);
  const version = P.getVersion(m, a.version);
  const reviewer = P.getReviewer(s, a.reviewerId);
  const auto = P.conflictOf(reviewer, version);
  const [kind, setKind] = useState(auto ? auto.kind : 'affiliation');
  const [note, setNote] = useState('');
  return (
    <ModalShell title="申请回避" sub={`RESCUSE · v${a.version}`} onClose={onClose}>
      {auto && (
        <div className="check-panel bad">系统自动检出：{auto.message}</div>
      )}
      <Field label="回避理由">
        <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={!!auto}>
          <option value="affiliation">同机构回避</option>
          <option value="coauthor">共同作者回避</option>
        </select>
      </Field>
      <Field label="补充说明">
        <textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="例如：近期已转入作者所在机构 / 存在未登记的合作" />
      </Field>
      <button className="primary full" onClick={() => {
        const r = store.recuse(a.id, { kind, note });
        notify(r, '已登记回避，该版本在改派完成前不得决定');
        if (r.ok) onClose();
      }}>提交回避申请</button>
    </ModalShell>
  );
}

// ---------- 录入审稿意见 ----------
export function ReviewModal({ a, onClose, notify }) {
  const [recommendation, setRec] = useState('minor');
  const [comments, setComments] = useState('');
  return (
    <ModalShell title="录入审稿意见" sub={`REVIEW · v${a.version}`} onClose={onClose} wide>
      <Field label="建议">
        <select value={recommendation} onChange={(e) => setRec(e.target.value)}>
          {Object.entries(P.RECOMMENDATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="意见正文">
        <textarea rows="6" value={comments} onChange={(e) => setComments(e.target.value)}
          placeholder="意见将冻结在当前版本；上传新版后旧意见保留可查，但不再计入决定门禁。" />
      </Field>
      <button className="primary full" disabled={!comments.trim()} onClick={() => {
        const r = store.submitReview(a.id, { recommendation, comments });
        notify(r, '审稿意见已提交并冻结于该版本');
        if (r.ok) onClose();
      }}>提交意见</button>
    </ModalShell>
  );
}

// ---------- 编辑决定 ----------
export function DecisionModal({ s, m, onClose, notify }) {
  const check = P.readiness(s, m);
  const [action, setAction] = useState('accept');
  const [comment, setComment] = useState('');
  return (
    <ModalShell title="记录编辑决定" sub={`DECISION · v${m.currentVersion}`} onClose={onClose}>
      <div className={'check-panel ' + (check.ready ? 'good' : 'bad')}>
        <div>有效意见：{check.reviews.length}/{P.REQUIRED_REVIEWS}</div>
        <div>未处理回避：{check.open.length} 项</div>
        {!check.ready && <ul>{check.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      </div>
      <Field label="决定">
        <select value={action} onChange={(e) => setAction(e.target.value)} disabled={!check.ready}>
          {Object.entries(P.DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="决定说明">
        <textarea rows="3" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <button className="primary full" disabled={!check.ready} onClick={() => {
        const r = store.recordDecision(m.id, { action, comment });
        notify(r, `编辑决定已记录：${P.DECISIONS[action]}`);
        if (r.ok) onClose();
      }}>{check.ready ? '确认决定' : '门禁未满足，不能决定'}</button>
    </ModalShell>
  );
}

// ---------- 上传新版 ----------
export function VersionModal({ m, onClose, notify }) {
  const current = P.getVersion(m, m.currentVersion);
  const [lines, setLines] = useState(authorsToLines(current.authors));
  const [body, setBody] = useState('');
  const authors = parseAuthorLines(lines);
  const valid = authors.length > 0 && body.trim();
  return (
    <ModalShell title={`上传新版 · v${m.currentVersion + 1}`} sub="NEW VERSION · 旧版将冻结为只读"
      onClose={onClose} wide>
      <div className="check-panel">
        正文与作者按版本冻结。新版上传后：旧版待审任务立即作废并自动重排，
        未交意见作废；旧意见保留可查；重排失败会进入未处理回避清单。
      </div>
      <Field label="作者（每行 “姓名 / 机构”）">
        <textarea rows={authors.length + 1} value={lines} onChange={(e) => setLines(e.target.value)} />
      </Field>
      <Field label="新版正文">
        <textarea rows="7" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="粘贴新版正文……" />
      </Field>
      {authors.length === 0 && <div className="form-error">至少需要一位作者</div>}
      <button className="primary full" disabled={!valid} onClick={() => {
        const r = store.uploadVersion(m.id, { authors, body });
        notify(r, `v${r.number} 已冻结：作废 ${r.voided} 项，重排 ${r.rerouted} 项，失败 ${r.failed} 项`);
        if (r.ok) onClose();
      }}>冻结并发布新版</button>
    </ModalShell>
  );
}

// ---------- 新稿件 ----------
export function ManuscriptModal({ onClose, notify, onCreated }) {
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState('');
  const [body, setBody] = useState('');
  const authors = parseAuthorLines(lines);
  const valid = title.trim() && authors.length > 0 && body.trim();
  return (
    <ModalShell title="登记新稿件" sub="NEW MANUSCRIPT · v1 将被冻结" onClose={onClose} wide>
      <Field label="标题"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="作者（每行 “姓名 / 机构”）">
        <textarea rows="3" value={lines} onChange={(e) => setLines(e.target.value)}
          placeholder={'周岚 / 北京大学认知科学实验室'} />
      </Field>
      <Field label="正文">
        <textarea rows="7" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {lines.trim() && authors.length === 0 && <div className="form-error">作者行需包含姓名</div>}
      <button className="primary full" disabled={!valid} onClick={() => {
        const r = store.createManuscript({ title, authors, body });
        notify(r, '稿件已登记，v1 正文与作者已冻结');
        if (r.ok) { onCreated(r.manuscriptId); onClose(); }
      }}>提交稿件</button>
    </ModalShell>
  );
}

// ---------- 新审稿人 ----------
export function ReviewerModal({ onClose, notify }) {
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [collabs, setCollabs] = useState('');
  const valid = name.trim() && affiliation.trim();
  return (
    <ModalShell title="登记审稿人" sub="NEW REVIEWER" onClose={onClose}>
      <Field label="姓名"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="所属机构"><input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} /></Field>
      <Field label="共同作者名单" hint="逗号分隔的姓名，用于共同作者回避">
        <input value={collabs} onChange={(e) => setCollabs(e.target.value)} placeholder="例如：Anna Lee, 周岚" />
      </Field>
      <button className="primary full" disabled={!valid} onClick={() => {
        const collaborators = collabs.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
        const r = store.addReviewer({ name, affiliation, collaborators });
        notify(r, `审稿人 ${name} 已登记`);
        if (r.ok) onClose();
      }}>保存审稿人</button>
    </ModalShell>
  );
}
