import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, Save, Calendar, X, Home, Wallet } from 'lucide-react';

// À partir du 15, on travaille sur le mois suivant (prélèvement le 5 du mois suivant)
const getActiveMonth = (now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth() + (now.getDate() >= 15 ? 1 : 0), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const DEFAULT_MONTH = getActiveMonth();

const DEFAULT_CATEGORIES = [
  {
    id: '1',
    name: 'Appartement',
    items: [
      { id: '1-1', name: 'Prêt', amount: 0 },
      { id: '1-2', name: 'Charges copro', amount: 0 },
      { id: '1-3', name: 'Internet', amount: 0 },
      { id: '1-4', name: 'Électricité', amount: 0 },
    ],
  },
  {
    id: '2',
    name: 'Enfants',
    items: [
      { id: '2-1', name: 'École', amount: 0 },
      { id: '2-2', name: 'Crèche', amount: 0 },
    ],
  },
];

const DEFAULT_DATA = {
  month: DEFAULT_MONTH,
  person1: { name: 'Personne 1', income: 0 },
  person2: { name: 'Personne 2', income: 0 },
  categories: DEFAULT_CATEGORIES,
  helloBank: { amount: 1100 },
};

const DEFAULT_HELLO_AMOUNT = 1100;
const helloAmountOf = (d) => parseFloat(d?.helloBank?.amount ?? DEFAULT_HELLO_AMOUNT) || 0;

// Versements déjà effectués avant la mise en place du suivi (saisie manuelle)
// Format : [mois, banque, [date Bertrand, montant], [date Cyrielle, montant]]
const SEED_ROWS = [
  ['2026-05', 'ccf', ['2026-04-30', 1400], ['2026-05-02', 1800]],
  ['2026-06', 'ccf', ['2026-06-02', 1400], ['2026-05-27', 1800]],
  ['2026-07', 'ccf', ['2026-07-03', 1540], ['2026-06-26', 1643]],
  ['2026-08', 'ccf', ['2026-07-31', 1700], ['2026-07-29', 1500]],
  ['2026-09', 'ccf', ['2026-09-02', 1500], ['2026-08-27', 1700]],
  ['2026-05', 'hello', ['2026-04-28', 500], ['2026-05-02', 500]],
  ['2026-06', 'hello', ['2026-06-02', 600], ['2026-05-27', 600]],
  ['2026-07', 'hello', ['2026-07-03', 600], ['2026-06-26', 600]],
  ['2026-08', 'hello', ['2026-07-31', 500], ['2026-07-29', 500]],
  ['2026-09', 'hello', ['2026-09-02', 500], ['2026-08-27', 500]],
];

// bertrandKey / cyrielleKey : 'person1' | 'person2' selon les prénoms saisis dans l'app
const buildSeedPayments = (bertrandKey, cyrielleKey) => {
  const out = {};
  SEED_ROWS.forEach(([month, bank, [bd, ba], [cd, ca]]) => {
    out[month] = out[month] || {};
    out[month][bank] = {
      [bertrandKey]: { date: bd, amount: ba },
      [cyrielleKey]: { date: cd, amount: ca },
    };
  });
  return out;
};

const BANKS = [['ccf', 'CCF'], ['hello', 'HelloBank']];
const PERSONS = ['person1', 'person2'];
const isMonthComplete = (payments, m) =>
  BANKS.every(([b]) => PERSONS.every((k) => payments[m]?.[b]?.[k]));

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : '');

const formatMonth = (monthStr) => {
  const [year, month] = monthStr.split('-');
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];
  return `${months[parseInt(month) - 1]} ${year}`;
};

const fmt = (n) => Number(n).toFixed(2);

const loadData = async (key) => {
  try {
    const res = await fetch(`/api/get-data?key=${key}`);
    const data = await res.json();
    return data.value ? JSON.parse(data.value) : null;
  } catch {
    return null;
  }
};

const saveData = async (key, value) => {
  try {
    await fetch('/api/save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: JSON.stringify(value) }),
    });
  } catch {
    // silently fail — data will re-sync on next load
  }
};

// ── Modal de confirmation ───────────────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel = 'Confirmer', danger = false }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Suivi des versements ────────────────────────────────────────────────────
function PersonPayment({ name, due, payment, onSet, onClear }) {
  const [amount, setAmount] = useState(String(Math.round(due * 100) / 100));
  const [date, setDate] = useState(todayStr());

  useEffect(() => { setAmount(String(Math.round(due * 100) / 100)); }, [due]);

  if (payment) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">{name}</p>
          <span className="text-xs font-medium text-emerald-700">✓ Réglé</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={payment.amount}
            onChange={(e) => onSet({ ...payment, amount: parseFloat(e.target.value) || 0 })}
            step="0.01"
            className="w-24 border border-emerald-200 rounded-lg px-2 py-1 text-right text-sm bg-white"
          />
          <span className="text-gray-400 text-sm">€</span>
          <input
            type="date"
            value={payment.date}
            onChange={(e) => onSet({ ...payment, date: e.target.value })}
            className="flex-1 min-w-0 border border-emerald-200 rounded-lg px-2 py-1 text-sm bg-white"
          />
          <button onClick={onClear} className="text-red-400 hover:text-red-600" title="Annuler ce versement">
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700">{name}</p>
        <span className="text-xs text-gray-400">à verser : {fmt(due)} €</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="0.01"
          className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm"
        />
        <span className="text-gray-400 text-sm">€</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-sm"
        />
      </div>
      <button
        onClick={() => onSet({ amount: parseFloat(amount) || 0, date: date || todayStr() })}
        className="mt-2 w-full py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
      >
        Charges réglées
      </button>
    </div>
  );
}

function PaymentCard({ title, subtitle, total, dues, names, entries, onSet, onClear }) {
  const paidTotal = ['person1', 'person2'].reduce((s, k) => s + (entries?.[k]?.amount || 0), 0);
  const allPaid = entries?.person1 && entries?.person2;
  return (
    <div className="bg-white rounded-lg shadow-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <p className="text-sm text-gray-400">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-800">{fmt(total)} €</p>
          <p className={`text-xs font-medium ${allPaid ? 'text-emerald-600' : 'text-gray-400'}`}>
            Versé : {fmt(paidTotal)} €
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {['person1', 'person2'].map((k) => (
          <PersonPayment
            key={k}
            name={names[k]}
            due={dues[k]}
            payment={entries?.[k]}
            onSet={(v) => onSet(k, v)}
            onClear={() => onClear(k)}
          />
        ))}
      </div>
    </div>
  );
}

function PaymentMonth({ month: m, payments, names, archivedAt, onSet, onClear }) {
  const complete = isMonthComplete(payments, m);
  const grand = BANKS.reduce(
    (s, [b]) => s + PERSONS.reduce((ss, k) => ss + (payments[m]?.[b]?.[k]?.amount || 0), 0),
    0
  );
  return (
    <div className="bg-white rounded-lg shadow-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">{formatMonth(m)}</h3>
          <p className={`text-xs ${complete ? 'text-emerald-600' : 'text-gray-400'}`}>
            {complete
              ? `✓ Archivé le ${new Date(archivedAt || Date.now()).toLocaleDateString('fr-FR')}`
              : 'En cours — versements incomplets'}
          </p>
        </div>
        <p className="text-lg font-bold text-gray-800">{fmt(grand)} €</p>
      </div>
      {BANKS.map(([bank, label]) => {
        const e = payments[m]?.[bank];
        const tot = (e?.person1?.amount || 0) + (e?.person2?.amount || 0);
        return (
          <div key={bank} className="mb-3 last:mb-0">
            <div className="flex justify-between text-sm font-semibold text-gray-600 mb-1">
              <span>{label}</span>
              <span>{fmt(tot)} €</span>
            </div>
            <div className="space-y-1">
              {PERSONS.map((k) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-24 truncate text-gray-600">{names[k]}</span>
                  {e?.[k] ? (
                    <>
                      <input
                        type="number"
                        value={e[k].amount}
                        onChange={(ev) => onSet(m, bank, k, { ...e[k], amount: parseFloat(ev.target.value) || 0 })}
                        step="0.01"
                        className="w-24 border border-gray-200 rounded px-2 py-0.5 text-right"
                      />
                      <span className="text-gray-400">€</span>
                      <input
                        type="date"
                        value={e[k].date}
                        onChange={(ev) => onSet(m, bank, k, { ...e[k], date: ev.target.value })}
                        className="border border-gray-200 rounded px-2 py-0.5"
                      />
                      <button onClick={() => onClear(m, bank, k)} className="text-red-300 hover:text-red-500">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-300">non réglé</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Composant principal ─────────────────────────────────────────────────────
export default function App() {
  const [currentData, setCurrentData] = useState(DEFAULT_DATA);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('home');
  const [editingIncome, setEditingIncome] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [splitMode, setSplitMode] = useState('income'); // 'income' | 'equal'
  const [payments, setPayments] = useState({}); // { 'YYYY-MM': { ccf|hello: { person1|person2: {amount, date} } } }

  // Chargement initial
  useEffect(() => {
    (async () => {
      const [cur, hist, pay] = await Promise.all([
        loadData('expenses-current'),
        loadData('expenses-history'),
        loadData('expenses-payments'),
      ]);
      if (cur) {
        const active = getActiveMonth();
        setCurrentData({
          ...cur,
          month: cur.month < active ? active : cur.month,
          helloBank: cur.helloBank || { amount: DEFAULT_HELLO_AMOUNT },
        });
      }
      if (pay) {
        setPayments(pay);
      } else {
        // Première ouverture : pré-remplissage des versements de mai à septembre 2026
        const p2IsBertrand = /bertrand/i.test(cur?.person2?.name || '') && !/bertrand/i.test(cur?.person1?.name || '');
        setPayments(p2IsBertrand ? buildSeedPayments('person2', 'person1') : buildSeedPayments('person1', 'person2'));
      }
      if (hist) setHistory(hist);
      setLoaded(true);
    })();
  }, []);

  // Sauvegarde automatique
  useEffect(() => { if (loaded) saveData('expenses-current', currentData); }, [currentData, loaded]);
  useEffect(() => { if (loaded) saveData('expenses-history', history); }, [history, loaded]);
  useEffect(() => { if (loaded) saveData('expenses-payments', payments); }, [payments, loaded]);

  // Archivage automatique : un mois est archivé dès que CCF et HelloBank sont réglés par les deux
  useEffect(() => {
    if (!loaded) return;
    setHistory((h) => {
      const next = h.filter((e) => !e.auto || isMonthComplete(payments, e.month));
      Object.keys(payments).filter((m) => isMonthComplete(payments, m)).forEach((m) => {
        if (next.some((e) => e.month === m)) return;
        const dates = BANKS.flatMap(([b]) => PERSONS.map((k) => payments[m][b][k].date)).sort();
        next.push({ month: m, auto: true, archivedAt: `${dates[dates.length - 1]}T12:00:00` });
      });
      return next.length === h.length && next.every((e, i) => e === h[i]) ? h : next;
    });
  }, [payments, loaded]);

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // ── Calculs ──
  const ccfTotal = currentData.categories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0),
    0
  );
  const helloTotal = helloAmountOf(currentData);
  const totalIncome = (parseFloat(currentData.person1.income) || 0) + (parseFloat(currentData.person2.income) || 0);
  const p1PctIncome = totalIncome > 0 ? ((parseFloat(currentData.person1.income) || 0) / totalIncome) * 100 : 50;
  const p1Pct = splitMode === 'equal' ? 50 : p1PctIncome;
  const p2Pct = 100 - p1Pct;
  const ccfDues = { person1: (ccfTotal * p1Pct) / 100, person2: (ccfTotal * p2Pct) / 100 };
  const helloDues = { person1: (helloTotal * p1Pct) / 100, person2: (helloTotal * p2Pct) / 100 };

  // ── Handlers ──
  const updateIncome = (person, value) => {
    setCurrentData((d) => ({ ...d, [person]: { ...d[person], income: parseFloat(value) || 0 } }));
  };

  const updateName = (person, value) => {
    setCurrentData((d) => ({ ...d, [person]: { ...d[person], name: value } }));
  };

  const updateItemName = (catId, itemId, value) => {
    setCurrentData((d) => ({
      ...d,
      categories: d.categories.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, name: value } : it)) }
          : c
      ),
    }));
  };

  const updateItemAmount = (catId, itemId, value) => {
    setCurrentData((d) => ({
      ...d,
      categories: d.categories.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, amount: parseFloat(value) || 0 } : it)) }
          : c
      ),
    }));
  };

  const addItem = (catId) => {
    const newId = `${catId}-${Date.now()}`;
    setCurrentData((d) => ({
      ...d,
      categories: d.categories.map((c) =>
        c.id === catId ? { ...c, items: [...c.items, { id: newId, name: 'Nouvelle charge', amount: 0 }] } : c
      ),
    }));
  };

  const deleteItem = (catId, itemId) => {
    setCurrentData((d) => ({
      ...d,
      categories: d.categories.map((c) =>
        c.id === catId ? { ...c, items: c.items.filter((it) => it.id !== itemId) } : c
      ),
    }));
  };

  const deleteCategory = (catId) => {
    setConfirmModal({
      title: 'Supprimer la catégorie',
      message: 'Toutes les charges de cette catégorie seront supprimées. Continuer ?',
      danger: true,
      confirmLabel: 'Supprimer',
      onConfirm: () => {
        setCurrentData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== catId) }));
        setConfirmModal(null);
      },
    });
  };

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    const newId = Date.now().toString();
    setCurrentData((d) => ({
      ...d,
      categories: [...d.categories, { id: newId, name: newCategoryName.trim(), items: [] }],
    }));
    setNewCategoryName('');
  };

  const deleteArchive = (monthStr) => {
    setConfirmModal({
      title: 'Supprimer l\'archive',
      message: `Supprimer définitivement l'archive de ${formatMonth(monthStr)} ?`,
      danger: true,
      confirmLabel: 'Supprimer',
      onConfirm: () => {
        setHistory((h) => h.filter((entry) => entry.month !== monthStr));
        setConfirmModal(null);
      },
    });
  };

  const updateHelloAmount = (value) => {
    setCurrentData((d) => ({ ...d, helloBank: { ...(d.helloBank || {}), amount: parseFloat(value) || 0 } }));
  };

  const setPayment = (month, bank, person, value) => {
    setPayments((p) => ({
      ...p,
      [month]: { ...p[month], [bank]: { ...p[month]?.[bank], [person]: value } },
    }));
  };

  const clearPayment = (month, bank, person) => {
    setPayments((p) => {
      const bankEntries = { ...p[month]?.[bank] };
      delete bankEntries[person];
      return { ...p, [month]: { ...p[month], [bank]: bankEntries } };
    });
  };

  const historyMonths = [...new Set([...Object.keys(payments), ...history.map((e) => e.month)])].sort().reverse();

  const names = { person1: currentData.person1.name, person2: currentData.person2.name };

  // ── Render ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Toast */}
      {successMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg">
          {successMessage}
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-indigo-700">💰 Charges</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-4">
        {/* ── Vue historique ── */}
        {view === 'history' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-700">Historique</h2>
            {historyMonths.length === 0 && (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400">
                Aucun mois pour l'instant.
              </div>
            )}
            {historyMonths.map((m) => {
              if (payments[m]) {
                return (
                  <PaymentMonth
                    key={m}
                    month={m}
                    payments={payments}
                    names={names}
                    archivedAt={history.find((e) => e.month === m)?.archivedAt}
                    onSet={setPayment}
                    onClear={clearPayment}
                  />
                );
              }
              const entry = history.find((e) => e.month === m);
              const hb = helloAmountOf(entry);
              const tot = hb + entry.categories.reduce(
                (s, c) => s + c.items.reduce((ss, it) => ss + (parseFloat(it.amount) || 0), 0),
                0
              );
              const inc = (parseFloat(entry.person1.income) || 0) + (parseFloat(entry.person2.income) || 0);
              const pc1 = inc > 0 ? ((parseFloat(entry.person1.income) || 0) / inc) * 100 : 50;
              const pc2 = 100 - pc1;
              const s1 = (tot * pc1) / 100;
              const s2 = (tot * pc2) / 100;
              return (
                <div key={entry.month} className="bg-white rounded-lg shadow-lg p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-800 text-lg">{formatMonth(entry.month)}</h3>
                      <p className="text-xs text-gray-400">
                        Archivé le {new Date(entry.archivedAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteArchive(entry.month)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{fmt(tot)} € total</p>
                  <p className="text-xs text-gray-400 mb-3">dont HelloBank {fmt(hb)} €</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: entry.person1.name, share: s1, pct: pc1 },
                      { name: entry.person2.name, share: s2, pct: pc2 },
                    ].map((p) => (
                      <div key={p.name} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-semibold text-gray-700">{p.name}</p>
                        <p className="text-lg font-bold text-indigo-600">{fmt(p.share)} €</p>
                        <p className="text-xs text-gray-400">{fmt(p.pct)}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Accueil ── */}
        {view === 'home' && (
          <>
            {/* Versements du mois */}
            <div className="bg-white rounded-lg shadow-lg p-5 text-center">
              <p className="text-sm text-gray-500">Mois à payer</p>
              <h2 className="text-2xl font-bold text-indigo-700">{formatMonth(currentData.month)}</h2>
              <p className="text-xs text-gray-400 mb-3">Prélèvement le 5 · total {fmt(ccfTotal + helloTotal)} €</p>
              <div className="grid grid-cols-2 gap-3">
                {PERSONS.map((k) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm font-semibold text-gray-700 truncate">{names[k]}</p>
                    <p className="text-lg font-bold text-indigo-600">{fmt(ccfDues[k] + helloDues[k])} €</p>
                    <p className="text-xs text-gray-400">CCF {fmt(ccfDues[k])} · Hello {fmt(helloDues[k])}</p>
                  </div>
                ))}
              </div>
            </div>
            <PaymentCard
              title="Charges communes — CCF"
              subtitle="Prélèvement le 5"
              total={ccfTotal}
              dues={ccfDues}
              names={names}
              entries={payments[currentData.month]?.ccf}
              onSet={(k, v) => setPayment(currentData.month, 'ccf', k, v)}
              onClear={(k) => clearPayment(currentData.month, 'ccf', k)}
            />
            <PaymentCard
              title="Dépenses courantes — HelloBank"
              subtitle="Prélèvement le 5"
              total={helloTotal}
              dues={helloDues}
              names={names}
              entries={payments[currentData.month]?.hello}
              onSet={(k, v) => setPayment(currentData.month, 'hello', k, v)}
              onClear={(k) => clearPayment(currentData.month, 'hello', k)}
            />

          </>
        )}

        {/* ── Revenus / Charges ── */}
        {view === 'settings' && (
          <>
            {/* Revenus */}
            <div className="bg-white rounded-lg shadow-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-gray-800">Revenus</h2>
                  <input
                    type="month"
                    value={currentData.month}
                    onChange={(e) => setCurrentData((d) => ({ ...d, month: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="flex items-center gap-3">
                <button
                  onClick={() => setSplitMode((m) => (m === 'income' ? 'equal' : 'income'))}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    splitMode === 'equal'
                      ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {splitMode === 'equal' ? '50/50 ✓' : 'Selon revenus'}
                </button>
                <button
                  onClick={() => setEditingIncome((v) => !v)}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  {editingIncome ? <Save size={16} /> : <Edit2 size={16} />}
                  {editingIncome ? 'Sauvegarder' : 'Modifier'}
                </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['person1', 'person2'].map((p) => {
                  const person = currentData[p];
                  const pct = p === 'person1' ? p1Pct : p2Pct;
                  return (
                    <div key={p} className="border border-gray-200 rounded-lg p-4">
                      {editingIncome ? (
                        <input
                          type="text"
                          value={person.name}
                          onChange={(e) => updateName(p, e.target.value)}
                          className="w-full border-b border-indigo-300 text-lg font-semibold text-gray-700 mb-2 focus:outline-none focus:border-indigo-500 bg-transparent"
                        />
                      ) : (
                        <p className="text-lg font-semibold text-gray-700 mb-2">{person.name}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={person.income || ''}
                          onChange={(e) => updateIncome(p, e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.01"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <span className="text-gray-500 font-medium">€</span>
                      </div>
                      <p className="text-right text-sm text-indigo-600 font-medium mt-1">{fmt(pct)}%</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Catégories */}
            {currentData.categories.map((cat) => {
              const catTotal = cat.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
              return (
                <div key={cat.id} className="bg-white rounded-lg shadow-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">{cat.name}</h3>
                      <p className="text-sm text-gray-400">{fmt(catTotal)} €</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addItem(cat.id)}
                        className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
                        title="Ajouter une charge"
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        onClick={() => deleteCategory(cat.id)}
                        className="p-1.5 bg-red-100 text-red-500 rounded-lg hover:bg-red-200 transition-colors"
                        title="Supprimer la catégorie"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {cat.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItemName(cat.id, item.id, e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <input
                          type="number"
                          value={item.amount || ''}
                          onChange={(e) => updateItemAmount(cat.id, item.id, e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.01"
                          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <span className="text-gray-400 text-sm">€</span>
                        <button
                          onClick={() => deleteItem(cat.id, item.id)}
                          className="text-red-300 hover:text-red-500"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {cat.items.length === 0 && (
                      <p className="text-sm text-gray-300 text-center py-2">Aucune charge — cliquez + pour en ajouter</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* HelloBank */}
            <div className="bg-white rounded-lg shadow-lg p-5">
              <h3 className="text-lg font-bold text-gray-800">HelloBank</h3>
              <p className="text-sm text-gray-400 mb-3">Dépenses courantes (en général 1000 à 1200 €)</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={currentData.helloBank?.amount || ''}
                  onChange={(e) => updateHelloAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="10"
                  className="w-32 border border-gray-200 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-gray-400">€</span>
              </div>
            </div>

            {/* Ajouter une catégorie */}
            <div className="bg-white rounded-lg shadow-lg p-5">
              <h3 className="text-base font-semibold text-gray-600 mb-3">Ajouter une catégorie</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nom de la catégorie"
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  onClick={addCategory}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl z-40">
        <div className="max-w-2xl mx-auto grid grid-cols-3">
          {[
            ['home', 'Accueil', Home],
            ['settings', 'Revenus / Charges', Wallet],
            ['history', 'Historique', Calendar],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                view === id ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={22} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Modals */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

    </div>
  );
}
