// 界面层：冲突清单。逐行列出稿件、版本、审稿人、时限与限制；
// “未处理回避”可直接改派，被拦截的分配尝试仅留痕。
import React from 'react';
import * as P from '../rules/policy.js';

export default function ConflictsView({ s, fmt, onAction, goManuscript }) {
  const sorted = [...s.restrictions].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.at - a.at;
  });
  const open = sorted.filter((r) => r.status === 'open');
  const closed = sorted.filter((r) => r.status !== 'open');

  const Row = ({ flag }) => {
    const m = P.getManuscript(s, flag.manuscriptId);
    const r = P.getReviewer(s, flag.reviewerId);
    const current = flag.version === m.currentVersion;
    return (
      <tr className={'flag-row ' + flag.status}>
        <td>
          <button className="link" onClick={() => goManuscript(m.id)}>{m.title}</button>
        </td>
        <td>
          v{flag.version}
          {flag.reroute && <span className="badge-reroute">新版重排</span>}
          {!current && <span className="badge-old">旧版</span>}
        </td>
        <td><b>{r.name}</b><div className="muted small">{r.affiliation}</div></td>
        <td className="muted">{fmt.deadline(flag.deadline, flag.status === 'open' ? 'pending' : 'void')}</td>
        <td><span className={'restriction r-' + flag.kind}>{P.RESTRICTION_LABEL[flag.kind]}</span></td>
        <td className="msg-cell">{flag.message}</td>
        <td>
          {flag.status === 'open' ? (
            <>
              <small className="astatus a-recused">未处理回避</small>
              <button className="mini-btn primary-mini"
                onClick={() => onAction({ type: 'reassign', flag })}>改派</button>
            </>
          ) : flag.status === 'blocked' ? (
            <small className="astatus a-void">已拦截</small>
          ) : (
            <small className="astatus a-submitted">已处理</small>
          )}
          {flag.resolution && <div className="muted small">{flag.resolution} · {fmt.date(flag.resolvedAt)}</div>}
        </td>
      </tr>
    );
  };

  return (
    <section className="pane-wide">
      <div className="pane-head">
        <div>
          <span className="crumb">CONFLICTS</span>
          <h1>冲突与回避清单</h1>
          <p className="sub-desc">
            未处理回避会阻止对应稿件给出编辑决定；“已拦截”是分配前校验拦下的尝试，仅留痕。
          </p>
        </div>
        <div className="head-stats">
          <div className="stat-box warn"><b>{open.length}</b><small>未处理回避</small></div>
          <div className="stat-box"><b>{closed.length}</b><small>已拦截 / 已处理</small></div>
        </div>
      </div>
      <table className="conflict-table">
        <thead>
          <tr><th>稿件</th><th>版本</th><th>审稿人</th><th>时限</th><th>限制</th><th>说明</th><th>状态 / 操作</th></tr>
        </thead>
        <tbody>
          {open.map((f) => <Row key={f.id} flag={f} />)}
          {closed.map((f) => <Row key={f.id} flag={f} />)}
          {!sorted.length && <tr><td colSpan={7} className="muted center">暂无冲突记录</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
