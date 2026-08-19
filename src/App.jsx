// 画面全体。タブは4つ、起動時は「登録」タブ。
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, touchPark } from './db/db.js';
import {
  getSyncStatus,
  startAutoSync,
  subscribeSync,
  syncNow,
  syncOnStartup,
} from './lib/sync.js';
import SyncBadge from './components/SyncBadge/index.jsx';
import RegisterForm from './components/RegisterForm/index.jsx';
import TreeList from './components/TreeList/index.jsx';
import MapView from './components/MapView/index.jsx';
import Settings from './components/Settings/index.jsx';

const TABS = [
  { key: 'register', label: '登録' },
  { key: 'list', label: '一覧' },
  { key: 'map', label: '地図' },
  { key: 'settings', label: '設定' },
];

export default function App() {
  const [tab, setTab] = useState('register');
  const [currentParkId, setCurrentParkId] = useState(null);
  const [listParkId, setListParkId] = useState(null); // 一覧・地図の絞り込み（null=すべて）
  const [editingTree, setEditingTree] = useState(null);
  const [toast, setToast] = useState('');
  // 「公園を登録してください」導線から来たときは公園の追加フォームを開いた状態にする
  const [autoOpenPark, setAutoOpenPark] = useState(false);
  const [sync, setSync] = useState(getSyncStatus);

  const parks = useLiveQuery(() => db.parks.toArray(), [], null);
  const parkList = parks ?? [];

  // 起動時: 最後に使った公園を選んでおく
  useEffect(() => {
    if (!parks || currentParkId) return;
    const recent = [...parks].sort((a, b) =>
      String(b.lastUsedAt ?? '').localeCompare(String(a.lastUsedAt ?? '')),
    )[0];
    if (recent) {
      setCurrentParkId(recent.id);
      setListParkId(recent.id);
    }
  }, [parks, currentParkId]);

  // 起動時: スプレッドシート（GAS）の内容を取り込み、以後は自動保存を回す。
  // 設定タブでURLを入れていなければ何もしない（端末内だけで動く）。
  useEffect(() => {
    const off = subscribeSync(setSync);
    const stopAuto = startAutoSync();
    syncOnStartup().then((res) => {
      if (res?.pulled?.put || res?.pulled?.removed) {
        showToast(
          `シートから取り込みました（更新 ${res.pulled.put}件${
            res.pulled.removed ? ` / 削除 ${res.pulled.removed}件` : ''
          }）`,
        );
      }
    });
    return () => {
      off();
      stopAuto();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(''), 2600);
  };

  const selectPark = (id) => {
    setCurrentParkId(id);
    touchPark(id);
  };

  const openEdit = (tree) => {
    setEditingTree(tree);
    setTab('register');
  };

  const handleParkDeleted = (deletedId) => {
    if (currentParkId === deletedId) setCurrentParkId(null);
    if (listParkId === deletedId) setListParkId(null);
    if (editingTree?.parkId === deletedId) setEditingTree(null);
  };

  return (
    <div className="app">
      <header className="appbar">
        <h1>
          かんたん樹木登録
          {editingTree && <span className="appbar-sub">編集中</span>}
        </h1>
        <SyncBadge
          status={sync}
          onClick={() => {
            syncNow()
              .then((res) => {
                if (res?.skipped) {
                  showToast('設定タブでGASのURLを入れると、シートと同期します');
                  return;
                }
                showToast(
                  `同期しました（取込 ${res.pulled.put}件 / 送信 ${res.pushed.records}件）`,
                );
              })
              .catch((err) => showToast(`同期できません: ${err?.message ?? err}`));
          }}
        />
      </header>

      <main className="main">
        {parks === null ? (
          <p className="muted pad">読み込み中…</p>
        ) : (
          <>
            {tab === 'register' && (
              <RegisterForm
                parks={parkList}
                currentParkId={currentParkId}
                onSelectPark={selectPark}
                editingTree={editingTree}
                onFinishEdit={() => setEditingTree(null)}
                onToast={showToast}
                onGoSettings={() => {
                  setAutoOpenPark(true);
                  setTab('settings');
                }}
              />
            )}
            {tab === 'list' && (
              <TreeList
                parks={parkList}
                currentParkId={listParkId}
                onSelectPark={setListParkId}
                onEdit={openEdit}
                onToast={showToast}
              />
            )}
            {tab === 'map' && (
              <MapView
                parks={parkList}
                currentParkId={listParkId}
                onSelectPark={setListParkId}
                onEdit={openEdit}
              />
            )}
            {tab === 'settings' && (
              <Settings
                key={autoOpenPark ? 'settings-open' : 'settings'}
                parks={parkList}
                onToast={showToast}
                onParkDeleted={handleParkDeleted}
                autoOpenPark={autoOpenPark}
              />
            )}
          </>
        )}
      </main>

      <footer className="copyright">© 2026 Koh Kitsukawa. All rights reserved.</footer>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={`tabbtn ${tab === t.key ? 'tabbtn-on' : ''}`}
            onClick={() => {
              if (t.key !== 'register') setEditingTree(null);
              if (t.key !== 'settings') setAutoOpenPark(false);
              setTab(t.key);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
