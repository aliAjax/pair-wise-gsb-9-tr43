// 界面层：审稿人名册。展示机构、合作者回避名单与实时待审负荷。
import React from 'react';
import * as P from '../rules/policy.js';

export default function ReviewersView({ s, fmt }) {
  return (
    <section className="pane-wide">
      <div className="pane-head">
        <div>
          <span className="crumb">REVIEWERS</span>
          <h1>审稿人名册</h1>
        </div>
      </div>
      <div className="reviewer-grid">
        {s.reviewers.map((r) => {
          const pending = P.pendingOfReviewer(s, r);
          const active = s.assignments.filter((a) => a.reviewerId === r.id && P.isActive(a));
          return (
            <div className="reviewer-card" key={r.id}>
              <div className="reviewer-id">{r.id}</div>
              <h3>{r.name}</h3>
              <p className="aff">{r.affiliation}</p>
              <div className="load-bar" title={`待审 ${pending.length}/${P.MAX_PENDING}`}>
                {Array.from({ length: P.MAX_PENDING }).map((_, i) => (
                  <i key={i} className={i < pending.length ? 'fill' : ''} />
                ))}
                <span>待审 {pending.length}/{P.MAX_PENDING}</span>
              </div>
              <div className="collab-line">
                <small>共同作者回避名单</small>
                {r.collaborators.length
                  ? <div>{r.collaborators.map((c) => <span className="tag-warn" key={c}>{c}</span>)}</div>
                  : <em className="muted">无登记合作者</em>}
              </div>
              <div className="task-line">
                <small>在途任务 {active.length} 项</small>
                {active.map((a) => {
                  const m = P.getManuscript(s, a.manuscriptId);
                  return (
                    <span key={a.id} className="task-chip">
                      {m.title.slice(0, 14)}… · v{a.version} ·
                      <i className={'astatus a-' + a.status}>
                        {a.status === 'pending' ? '待审' : a.status === 'submitted' ? '已交' : '回避'}
                      </i>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
