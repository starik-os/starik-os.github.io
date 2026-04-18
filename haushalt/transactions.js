// transactions.js – Einnahmen/Ausgaben Logik
// Datenmodell: createdAt + updatedAt + flowScope + status + taxRelevant
const Transactions = (() => {

  const _safeUpdatedAt = (tx) => {
    if (tx && tx.updatedAt) return tx.updatedAt;
    if (tx && tx.createdAt) return tx.createdAt;
    return 0;
  };
  const _safeDeviceId = (tx) => (tx && tx.deviceId) ? String(tx.deviceId) : '';

  // Deterministischer Tie-Breaker
  const _resolveConflict = (incoming, local) => {
    const inTs = _safeUpdatedAt(incoming), lcTs = _safeUpdatedAt(local);
    const inDev = _safeDeviceId(incoming), lcDev = _safeDeviceId(local);
    if (inTs > lcTs)  return 'update';
    if (inTs < lcTs)  return 'skip';
    return inDev > lcDev ? 'tiebreak_update' : 'tiebreak_skip';
  };

  // ── LOAD ALL ────────────────────────────────────────────────────
  const loadAll = async () => {
    const txs = await Storage.getAll('transactions');
    State.setTransactions(txs);
    Debug.log('Transactions', `Geladen: ${txs.length} Buchungen`);
    return txs;
  };

  // ── ADD ─────────────────────────────────────────────────────────
  const add = async (data) => {
    const v = Validation.transaction(data);
    if (!v.ok) throw new Error(v.errors.join(' / '));
    const now = Date.now();
    const tx  = v.value;
    tx.createdAt   = data.createdAt || now;
    tx.updatedAt   = now;
    if (!tx.deviceId) tx.deviceId = State.get().deviceId || 'local';
    if (!tx.category || tx.category === 'sonstiges') {
      tx.category = Categories.detect(tx.store, tx.description);
    }
    if (data.items && Array.isArray(data.items) && data.items.length) {
      tx.items = data.items
        .map(it => ({ desc: String(it.desc||'').trim().slice(0,100), amount: Math.round((Number(it.amount)||0)*100)/100, cat: String(it.cat||'sonstiges') }))
        .filter(it => it.amount > 0);
    }
    await Storage.put('transactions', tx);
    const current = State.get().transactions;
    State.setTransactions([...current.filter(t => t.id !== tx.id), tx]);
    // Monatslogik nur bei main-Buchungen neu berechnen
    if (!tx.flowScope || tx.flowScope === 'main') {
      await Months.recalculateFrom(Utils.monthKey(tx.date));
    }
    Debug.log('Transactions', `add: ${tx.type} ${tx.amount} [${tx.flowScope}] (${tx.date})`);
    return tx;
  };

  // ── REMOVE ──────────────────────────────────────────────────────
  const remove = async (id) => {
    const current      = State.get().transactions;
    const existing     = current.find(t => t.id === id);
    const affectedMonth = existing ? Utils.monthKey(existing.date) : null;
    const wasMain       = !existing?.flowScope || existing?.flowScope === 'main';
    await Storage.remove('transactions', id);
    State.setTransactions(current.filter(t => t.id !== id));
    if (affectedMonth && wasMain) await Months.recalculateFrom(affectedMonth);
    Debug.log('Transactions', `remove: ${id}`);
  };

  // ── UPDATE ──────────────────────────────────────────────────────
  const update = async (data) => {
    const v = Validation.transaction(data);
    if (!v.ok) throw new Error(v.errors.join(' / '));
    const tx = v.value;
    const existing = State.get().transactions.find(t => t.id === tx.id);
    tx.createdAt    = existing?.createdAt || Date.now();
    tx.updatedAt    = Date.now();
    if (existing?.deviceId) tx.deviceId = existing.deviceId;
    if (!tx.category || tx.category === 'sonstiges') {
      tx.category = Categories.detect(tx.store, tx.description);
    }
    const current  = State.get().transactions;
    const oldMonth = existing ? Utils.monthKey(existing.date) : null;
    const newMonth = Utils.monthKey(tx.date);
    await Storage.put('transactions', tx);
    State.setTransactions(current.map(t => t.id === tx.id ? tx : t));
    // Nur main neu berechnen
    const isMain = !tx.flowScope || tx.flowScope === 'main';
    const wasMain = !existing?.flowScope || existing?.flowScope === 'main';
    if (isMain || wasMain) {
      const recalcFrom = (oldMonth && oldMonth < newMonth) ? oldMonth : newMonth;
      await Months.recalculateFrom(recalcFrom);
    }
    Debug.log('Transactions', `update: ${tx.id} [${tx.flowScope}]`);
    return tx;
  };

  // ── IMPORT MANY ─────────────────────────────────────────────────
  const importMany = async (items) => {
    const valid = [], errors = [];
    const now   = Date.now();
    for (const item of items) {
      const v = Validation.transaction(item);
      if (v.ok) {
        const tx = v.value;
        tx.createdAt = item.createdAt || now;
        tx.updatedAt = item.updatedAt || now;
        if (item.deviceId) tx.deviceId = item.deviceId;
        if (!tx.category || tx.category === 'sonstiges') {
          tx.category = Categories.detect(tx.store, tx.description);
        }
        valid.push(tx);
      } else { errors.push({ item, errors: v.errors }); }
    }
    if (valid.length) {
      await Storage.putMany('transactions', valid);
      const current = State.get().transactions;
      const map = {}; current.forEach(t => { map[t.id] = t; }); valid.forEach(t => { map[t.id] = t; });
      State.setTransactions(Object.values(map));
      const months = valid.filter(t => !t.flowScope || t.flowScope === 'main').map(t => Utils.monthKey(t.date)).filter(Boolean).sort();
      if (months.length) await Months.recalculateFrom(months[0]);
    }
    return { added: valid.length, updated: 0, skipped: 0, errors };
  };

  // ── MERGE FROM PARTNER ───────────────────────────────────────────
  const mergeFromPartner = async (items) => {
    const now = Date.now();
    const current = State.get().transactions;
    const localMap = {}; current.forEach(t => { localMap[t.id] = t; });
    const toAdd = [], toUpdate = [], tieBreaks = [], skipped = [], errors = [];

    for (const item of items) {
      const v = Validation.transaction(item);
      if (!v.ok) { errors.push({ item, errors: v.errors }); continue; }
      const incoming = v.value;
      incoming.createdAt = item.createdAt || now;
      incoming.updatedAt = item.updatedAt || now;
      if (item.deviceId) incoming.deviceId = item.deviceId;
      if (!incoming.category || incoming.category === 'sonstiges') {
        incoming.category = Categories.detect(incoming.store, incoming.description);
      }
      const local = localMap[incoming.id];
      if (!local) {
        toAdd.push(incoming);
      } else {
        const decision = _resolveConflict(incoming, local);
        if (decision === 'update' || decision === 'tiebreak_update') {
          incoming.createdAt    = local.createdAt || incoming.createdAt;
          incoming.lastSyncedAt = now;
          toUpdate.push(incoming);
          if (decision === 'tiebreak_update') tieBreaks.push(incoming.id);
        } else {
          if (decision === 'tiebreak_skip') tieBreaks.push(incoming.id);
          skipped.push(incoming.id);
        }
      }
    }

    const allChanges = [...toAdd, ...toUpdate];
    if (allChanges.length) {
      await Storage.putMany('transactions', allChanges);
      const newMap = {}; current.forEach(t => { newMap[t.id] = t; }); allChanges.forEach(t => { newMap[t.id] = t; });
      State.setTransactions(Object.values(newMap));
      const months = allChanges.filter(t => !t.flowScope || t.flowScope === 'main').map(t => Utils.monthKey(t.date)).filter(Boolean).sort();
      if (months.length) await Months.recalculateFrom(months[0]);
    }
    return { added: toAdd.length, updated: toUpdate.length, skipped: skipped.length, tieBreakCount: tieBreaks.length, errors };
  };

  // ── STATS HELPERS ────────────────────────────────────────────────
  const getForMonth = (key) =>
    State.get().transactions.filter(t => Utils.monthKey(t.date) === key);

  // Nur main-Buchungen für Kategorie-Stats
  const getCategoryStats = (key) => {
    const map = {};
    getForMonth(key)
      .filter(t => t.type === 'expense' && (!t.flowScope || t.flowScope === 'main'))
      .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map)
      .map(([cat, amount]) => ({ cat, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);
  };

  // Nebenflüsse für einen Monat
  const getSideFlows = (key) =>
    getForMonth(key).filter(t => t.flowScope === 'side');

  // Rücklagen (alle, nicht monatsgebunden)
  const getReserves = () =>
    State.get().transactions.filter(t => t.flowScope === 'reserve');

  // Offene Verpflichtungen
  const getOpenObligations = () =>
    State.get().transactions.filter(t => t.flowScope === 'obligation' && t.status !== 'paid' && t.status !== 'cancelled');

  // Offene Fixkosten für einen Monat
  const getOpenFixkosten = (key) =>
    getForMonth(key).filter(t =>
      (!t.flowScope || t.flowScope === 'main') &&
      t.type === 'expense' &&
      Categories.isFixed(t.category) &&
      t.status === 'open'
    );

  // Steuerrelevante Buchungen
  const getTaxRelevant = () =>
    State.get().transactions.filter(t => t.taxRelevant === true);

  return {
    loadAll, add, remove, update, importMany, mergeFromPartner,
    getForMonth, getCategoryStats,
    getSideFlows, getReserves, getOpenObligations, getOpenFixkosten, getTaxRelevant
  };
})();
