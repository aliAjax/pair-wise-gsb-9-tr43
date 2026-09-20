import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { store, useStore } from './data/store.js';
import * as P from './rules/policy.js';
import ManuscriptView from './ui/ManuscriptView.jsx';
import ReviewersView from './ui/ReviewersView.jsx';
import ConflictsView from './ui/ConflictsView.jsx';
import {
  AssignModal, ReassignModal, RecuseModal, ReviewModal,
  DecisionModal, VersionModal, ManuscriptModal, ReviewerModal,
} from './ui/Modals.jsx';

const pad = (n) => String(n).padStart(2, '0');

function makeFmt(now) {
  const date = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  // 时限：在途任务给出绝对截止时间与剩余/逾期天数；其余状态显示 —
  const deadline = (ts, status) => {
    if (!ts) return '—';
    if (status === 'submitted' || status === 'void' || status === 'blocked' || status === 'resolved') {
      return '—';
    }
    const diffDays = Math.ceil((ts - now) / (24 * 60 * 60 * 1000));
    const tail = diffDays > 0 ? `剩 ${diffDays} 天` : diffDays === 0 ? '今日截止' : `逾期 ${-diffDays} 天`;
    return `${date(ts)} · ${tail}`;
  };
  return { date, deadline };
}

function App() {
  const s = useStore();
  const [view, setView] = useState('manuscripts');
  const [selectedId, setSelectedId] = useState(s.manuscripts[0]?.id);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const fmt = makeFmt(Date.now());
  const close = () => setModal(null);
  const notify = (result, okMsg) =>
    setToast({ msg: result.ok ? okMsg : result.message || '操作被规则拒绝', kind: result.ok ? 'ok' : 'err' });
  const onAction = setModal;

  const selected = P.getManuscript(s, selectedId) || s.manuscripts[0];
  const openCount = s.restrictions.filter((r) => r.status === 'open').length;

  const nav = [
    { key: 'manuscripts', icon: '▤', label: '稿件台', badge: s.manuscripts.length },
    { key: 'conflicts', icon: '⚡', label: '冲突与回避', badge: openCount, warn: openCount > 0 },
    { key: 'reviewers', icon: '☷', label: '审稿人名册', badge: s.reviewers.length },
  ];

  return (
    <div className="app">
      <aside>
        <div className="logo"><span>∴</span> PREPRINT DESK</div>
        <div className="library-head">
          <span>预印本审稿台</span>
          <strong>{s.manuscripts.length}<small> 篇在审稿件</small></strong>
        </div>
        <nav>
          {nav.map((n) => (
            <button key={n.key} className={view === n.key ? 'active' : ''} onClick={() => setView(n.key)}>
              {n.icon} <span>{n.label}</span>
              <b className={n.warn ? 'nav-warn' : ''}>{n.badge}</b>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button onClick={() => {
            if (window.confirm('恢复演示数据？当前本地修改将被清除。')) {
              store.resetDemo();
              setSelectedId(store.getState().manuscripts[0].id);
              setToast({ msg: '已恢复演示数据', kind: 'ok' });
            }
          }}>↺ 恢复演示数据</button>
          <small>本地数据库 · 版本/任务/决定联动</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <span className="crumb">RESEARCH / {view === 'manuscripts' ? 'DESK' : view.toUpperCase()}</span>
            <h1>{view === 'manuscripts' ? '稿件台' : view === 'conflicts' ? '冲突与回避' : '审稿人名册'}</h1>
          </div>
          <div className="actions">
            {view === 'reviewers' && (
              <button className="primary" onClick={() => setModal({ type: 'reviewer' })}>＋ 登记审稿人</button>
            )}
            {view === 'manuscripts' && (
              <button className="primary" onClick={() => setModal({ type: 'manuscript' })}>＋ 登记新稿件</button>
            )}
          </div>
        </header>

        {view === 'manuscripts' && selected && (
          <ManuscriptView
            key={selected.id}
            s={s}
            selectedId={selected.id}
            onSelect={setSelectedId}
            fmt={fmt}
            onAction={onAction}
            notify={notify}
          />
        )}
        {view === 'reviewers' && <ReviewersView s={s} fmt={fmt} />}
        {view === 'conflicts' && (
          <ConflictsView
            s={s}
            fmt={fmt}
            onAction={onAction}
            goManuscript={(id) => { setSelectedId(id); setView('manuscripts'); }}
          />
        )}
      </main>

      {/* 弹窗编排：全部动作经规则层校验后写 store，刷新后由同一份持久状态重建 */}
      {modal?.type === 'assign' && (
        <AssignModal s={s} m={selected} version={P.getVersion(selected, selected.currentVersion)}
          onClose={close} notify={notify} />
      )}
      {modal?.type === 'reassign' && (
        <ReassignModal s={s} flag={modal.flag} onClose={close} notify={notify} />
      )}
      {modal?.type === 'recuse' && (
        <RecuseModal s={s} a={modal.assignment} onClose={close} notify={notify} />
      )}
      {modal?.type === 'review' && (
        <ReviewModal a={modal.assignment} onClose={close} notify={notify} />
      )}
      {modal?.type === 'decision' && (
        <DecisionModal s={s} m={selected} onClose={close} notify={notify} />
      )}
      {modal?.type === 'version' && (
        <VersionModal m={selected} onClose={close} notify={notify} />
      )}
      {modal?.type === 'manuscript' && (
        <ManuscriptModal onClose={close} notify={notify}
          onCreated={(id) => setSelectedId(id)} />
      )}
      {modal?.type === 'reviewer' && <ReviewerModal onClose={close} notify={notify} />}

      {toast && <div className={'toast ' + toast.kind}>{toast.msg}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
