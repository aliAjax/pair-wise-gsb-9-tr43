// 界面层：稿件视图。版本选项卡、任务表、意见区、决定门禁都只读取规则层的派生结果。
import React, { useState } from 'react';
import * as P from '../rules/policy.js';

const ASSIGN_PILL = {
  pending: '待审',
  submitted: '已交意见',
  recused: '回避',
  void: '已作废',
};

function Authors({ authors }) {
  return (
    <div className="author-list">
      {authors.map((a, i) => (
        <div className="author-chip" key={i}>
          <b>{a.name}</b><span>{a.affiliation}</span>
        </div>
      ))}
    </div>
  );
}

function ManuscriptRow({ m, s, active, onSelect }) {
  const status = P.manuscriptStatus(s, m);
  const v = P.versionAssignments(s, m.id, m.currentVersion);
  const reviews = v.filter((a) => a.status === 'submitted').length;
  const open = s.restrictions.filter(
    (r) => r.manuscriptId === m.id && r.version === m.currentVersion && r.status === 'open'
  ).length;
  return (
    <button className={'paper ' + (active ? 'selected' : '')} onClick={() => onSelect(m.id)}>
      <div className="paper-year">v{m.currentVersion}</div>
      <div className="paper-copy">
        <h3>{m.title}</h3>
        <p>{m.versions[m.versions.length - 1].authors.map((a) => a.name).join('、')}</p>
        <div className="mini-metrics">
          <span>意见 {reviews}/{P.REQUIRED_REVIEWS}</span>
          <span>未处理回避 {open}</span>
          <span>任务 {v.length}</span>
        </div>
      </div>
      <small className={'mstatus ' + status.key}>{status.label}</small>
    </button>
  );
}

export default function ManuscriptView({ s, selectedId, onSelect, fmt, onAction, notify }) {
  const m = P.getManuscript(s, selectedId) || s.manuscripts[0];
  const [verNum, setVerNum] = useState(null);
  if (!m) return <div className="empty-hint">还没有稿件，先登记一篇。</div>;
  const version = P.getVersion(m, verNum ?? m.currentVersion) || P.getVersion(m, m.currentVersion);
  const isCurrent = version.version === m.currentVersion;
  const tasks = P.versionAssignments(s, m.id, version.version);
  const check = P.readiness(s, m);
  const decision = [...m.decisions].reverse().find((d) => d.version === version.version) || null;
  const reviewerOf = (id) => P.getReviewer(s, id);

  const decisionAtCurrent = m.decisions.some((d) => d.version === m.currentVersion);

  const rowActions = (a) => {
    if (a.status !== 'pending' || !isCurrent) return null;
    return (
      <span className="row-actions">
        <button onClick={() => onAction({ type: 'review', assignment: a })}>录入意见</button>
        <button onClick={() => onAction({ type: 'recuse', assignment: a })}>回避</button>
      </span>
    );
  };

  return (
    <div className="desk-body">
      <section className="paper-list">
        {s.manuscripts.map((x) => (
          <ManuscriptRow key={x.id} m={x} s={s} active={x.id === m.id} onSelect={onSelect} />
        ))}
      </section>

      <section className="detail detail-wide">
        <div className="detail-top">
          <span className={'mstatus ' + P.manuscriptStatus(s, m).key}>{P.manuscriptStatus(s, m).label}</span>
          {isCurrent && (
            <div className="detail-btns">
              <button className="mini-btn" onClick={() => onAction({ type: 'version' })}>↑ 上传新版</button>
              <button className="mini-btn primary-mini"
                disabled={decisionAtCurrent}
                title={decisionAtCurrent ? '当前版本已有决定，请上传新版' : ''}
                onClick={() => onAction({ type: 'assign' })}>＋ 指派审稿人</button>
            </div>
          )}
        </div>

        <h2>{m.title}</h2>
        <div className="version-tabs">
          {m.versions.map((v) => {
            const openCount = s.restrictions.filter(
              (r) => r.manuscriptId === m.id && r.version === v.version && r.status === 'open'
            ).length;
            return (
              <button key={v.version}
                className={'vtab' + (v.version === version.version ? ' on' : '') + (v.version !== m.currentVersion ? ' frozen' : '')}
                onClick={() => setVerNum(v.version)}>
                v{v.version}
                {v.version !== m.currentVersion ? ' · 只读冻结' : ' · 当前版本'}
                {openCount > 0 && <em className="dot">{openCount}</em>}
              </button>
            );
          })}
        </div>

        <div className="detail-section">
          <h4>冻结作者 <span>AUTHORS · 冻结于 {fmt.date(version.createdAt)}</span></h4>
          <Authors authors={version.authors} />
        </div>

        <div className="detail-section">
          <h4>冻结正文 <span>MANUSCRIPT TEXT</span></h4>
          <div className="body-text">{version.body.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>
        </div>

        <div className="detail-section">
          <h4>审稿任务 <span>ASSIGNMENTS · 时限 {P.WINDOW_DAYS} 天 · 每人最多 {P.MAX_PENDING} 项待审</span></h4>
          <table className="task-table">
            <thead>
              <tr><th>审稿人</th><th>机构</th><th>状态</th><th>时限</th><th>来源</th><th>操作</th></tr>
            </thead>
            <tbody>
              {tasks.map((a) => {
                const r = reviewerOf(a.reviewerId);
                const overdue = a.status === 'pending' && a.deadline < Date.now();
                return (
                  <tr key={a.id} className={a.status}>
                    <td>{r.name}</td>
                    <td className="muted">{r.affiliation}</td>
                    <td><small className={'astatus a-' + a.status}>
                      {ASSIGN_PILL[a.status]}
                      {a.status === 'void' && a.voidedAt && <i> · {fmt.date(a.voidedAt)}</i>}
                      {a.resolved && <i> · 已改派处理</i>}
                    </small></td>
                    <td className={overdue ? 'overdue' : 'muted'}>
                      {fmt.deadline(a.deadline, a.status)}
                    </td>
                    <td className="muted">{a.origin === 'reroute' ? '重排' : '手动'}</td>
                    <td>{rowActions(a)}</td>
                  </tr>
                );
              })}
              {!tasks.length && (
                <tr><td colSpan={6} className="muted center">该版本暂无任务</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="detail-section">
          <h4>审稿意见 <span>REVIEWS{isCurrent ? ` · 有效 ${check.reviews.length}/${P.REQUIRED_REVIEWS}` : ' · 旧版归档，不计入门禁'}</span></h4>
          {tasks.filter((a) => a.review).map((a) => {
            const r = reviewerOf(a.reviewerId);
            return (
              <div className="review-card" key={a.id}>
                <div className="review-head">
                  <b>{r.name}</b>
                  <span className={'rec rec-' + a.review.recommendation}>
                    {P.RECOMMENDATIONS[a.review.recommendation]}
                  </span>
                  <small>{fmt.date(a.review.submittedAt)}</small>
                </div>
                <p>{a.review.comments}</p>
              </div>
            );
          })}
          {!tasks.some((a) => a.review) && <p className="muted">该版本尚无意见。</p>}
        </div>

        <div className="detail-section">
          <h4>编辑决定 <span>DECISION GATE</span></h4>
          {decision ? (
            <div className="decision-card made">
              <div>
                <span className={'rec rec-' + decision.action}>v{decision.version} · {P.DECISIONS[decision.action]}</span>
                <small>{fmt.date(decision.at)}</small>
              </div>
              {decision.comment && <p>{decision.comment}</p>}
            </div>
          ) : isCurrent ? (
            <div className="decision-card">
              <div className={'gate ' + (check.ready ? 'ok' : 'block')}>
                <div><b>有效意见</b> {check.reviews.length}/{P.REQUIRED_REVIEWS}</div>
                <div><b>未处理回避</b> {check.open.length} 项</div>
              </div>
              {check.ready
                ? <p>门禁已满足，可以记录编辑决定。</p>
                : <ul className="gate-reasons">{check.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              <button className="primary" disabled={!check.ready}
                onClick={() => onAction({ type: 'decision' })}>
                {check.ready ? '给出编辑决定' : '门禁未满足'}
              </button>
            </div>
          ) : (
            <p className="muted">旧版本未作决定；新版本的决定将在其选项卡中处理。</p>
          )}
        </div>
      </section>
    </div>
  );
}
