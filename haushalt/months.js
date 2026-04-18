// months.js – Monatslogik + Übertrag (fachlich final korrekt)
//
// Kernformel (unveränderlich):
//   balance = carryOver + totalIncome - totalExpenses
//   carryOver(Monat N+1) = balance(Monat N)
//
// Manuelle Überträge:
//   carryOverManual = true  → dieser Wert bleibt bei automatischer Propagation erhalten
//   carryOverManual = false → wird von Propagation überschrieben
//
// Lücken:
//   Zwischen zwei vorhandenen Monaten liegende Zwischenmonate werden
//   in getAllRelevantMonthKeys() durch Interpolation einbezogen.

const Months = (() => {

  // ── LOAD ALL ────────────────────────────────────────────────────
  const loadAll = async () => {
    const rows = await Storage.getAll('months');
    const map  = {};
    rows.forEach(r => { map[r.id] = r; });
    State.setMonths(map);
    Debug.log('Months', `Geladen: ${rows.length} Monatsdatensätze`);
    return map;
  };

  // ── GET MONTH RECORD ────────────────────────────────────────────
  // Gibt gespeicherten Datensatz zurück; Fallback: leerer Monat carryOver=0.
  const get = (key) => {
    const months = State.get().months;
    return months[key] || { id: key, carryOver: 0, carryOverManual: false };
  };

  // ── GET ALL RELEVANT MONTH KEYS ─────────────────────────────────
  // Ermittelt alle Monate, für die Buchungen oder Monatsdaten existieren,
  // UND füllt Lücken zwischen dem frühesten und spätesten Monat auf.
  // Rückgabe: chronologisch aufsteigendes Array.
  const getAllRelevantMonthKeys = (transactions) => {
    const txs = transactions || State.get().transactions;
    const keys = new Set();

    txs.forEach(t => { const k = Utils.monthKey(t.date); if (k) keys.add(k); });
    Object.keys(State.get().months).forEach(k => { if (k) keys.add(k); });

    if (!keys.size) return [];

    const sorted = [...keys].sort(); // aufsteigend
    const first  = sorted[0];
    const last   = sorted[sorted.length - 1];

    // Lücken auffüllen
    const filled = [];
    let [fy, fm] = first.split('-').map(Number);
    const [ly, lm] = last.split('-').map(Number);

    while (fy < ly || (fy === ly && fm <= lm)) {
      filled.push(`${fy}-${String(fm).padStart(2, '0')}`);
      fm++;
      if (fm > 12) { fm = 1; fy++; }
    }

    return filled; // chronologisch, lückenlos
  };

  // Alias für Abwärtskompatibilität
  const allMonthKeys = (transactions) => getAllRelevantMonthKeys(transactions);

  // ── GET MONTH SUMMARY ───────────────────────────────────────────
  // EINZIGE Rechenstelle für Monatszahlen.
  //
  //   balance = carryOver + totalIncome - totalExpenses
  //
  const getMonthSummary = (key, transactions) => {
    const allMonthTxs = (transactions || State.get().transactions)
                          .filter(t => Utils.monthKey(t.date) === key);
    // Hauptbilanz: NUR flowScope === 'main' (oder undefined = Altdaten)
    const txs      = allMonthTxs.filter(t => !t.flowScope || t.flowScope === 'main');
    const income   = txs.filter(t => t.type === 'income')
                       .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const expenses = txs.filter(t => t.type === 'expense')
                       .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const rec       = get(key);
    const carryOver = Number(rec.carryOver) || 0;
    const balance   = Math.round((carryOver + income - expenses) * 100) / 100;

    return {
      monthId:          key,
      carryOver:        Math.round(carryOver * 100) / 100,
      carryOverManual:  rec.carryOverManual || false,
      totalIncome:      Math.round(income   * 100) / 100,
      totalExpenses:    Math.round(expenses * 100) / 100,
      balance,
    };
  };

  // Alias für UI-Kompatibilität (ui.js nutzt calcBalance)
  const calcBalance = (key, transactions) => getMonthSummary(key, transactions);

  // ── SET CARRY OVER (manuell) ────────────────────────────────────
  // Setzt carryOverManual=true – dieser Wert wird bei Propagation NICHT
  // durch den Vorgänger-Balance überschrieben.
  // Löst anschließend recalculateFrom aus.
  const setCarryOver = async (key, amount) => {
    const n = Math.round(Number(amount) * 100) / 100;
    if (isNaN(n)) { Debug.warn('Months', `setCarryOver: ungültiger Betrag ${amount}`); return; }

    const existing = get(key);
    const updated  = { ...existing, id: key, carryOver: n, carryOverManual: true };

    await _persistMonth(updated);
    Debug.log('Months', `carryOver manuell gesetzt: ${key} = ${n}`);

    // Folgemonate propagieren
    await recalculateFrom(key);
  };

  // ── PERSIST MONTH (intern) ──────────────────────────────────────
  const _persistMonth = async (rec) => {
    await Storage.put('months', rec);
    const months = State.get().months;
    State.setMonths({ ...months, [rec.id]: rec });
  };

  // ── RECALCULATE MONTH ───────────────────────────────────────────
  // Berechnet einen einzelnen Monat neu und persistiert das Ergebnis.
  // carryOver wird NICHT überschrieben – nur totalIncome, totalExpenses, balance.
  const recalculateMonth = async (key, transactions) => {
    const summary  = getMonthSummary(key, transactions || State.get().transactions);
    const existing = get(key);
    const updated  = {
      ...existing,
      id:            key,
      carryOver:     summary.carryOver,
      totalIncome:   summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      balance:       summary.balance,
    };
    await _persistMonth(updated);
    Debug.log('Months', `recalculateMonth ${key}: carryOver=${summary.carryOver} income=${summary.totalIncome} expenses=${summary.totalExpenses} balance=${summary.balance}`);
    return summary;
  };

  // ── RECALCULATE FROM ────────────────────────────────────────────
  // Kernfunktion: Ab fromKey alle Folgemonate chronologisch neu berechnen.
  //
  // Regeln:
  // - Ausgangspunkt: fromKey (inklusive)
  // - Für jeden Monat ab dem zweiten: carryOver = balance des Vormonats
  //   AUSNAHME: carryOverManual=true → manueller Wert bleibt erhalten
  // - Lücken werden berücksichtigt (getAllRelevantMonthKeys)
  //
  const recalculateFrom = async (fromKey, transactions) => {
    const txs     = transactions || State.get().transactions;
    const allKeys = getAllRelevantMonthKeys(txs);
    const startIdx = allKeys.indexOf(fromKey);
    const begin    = startIdx >= 0 ? startIdx : 0;

    Debug.log('Months', `recalculateFrom: ${fromKey} (idx=${begin}) – ${allKeys.length - begin} Monate`);

    for (let i = begin; i < allKeys.length; i++) {
      const thisKey = allKeys[i];

      // carryOver des aktuellen Monats aus Vorgänger ableiten
      // (außer: manuell gesetzt ODER erster Monat insgesamt)
      if (i > begin) {
        const prevKey     = allKeys[i - 1];
        const prevState   = State.get().months[prevKey];
        const prevBalance = prevState ? (Number(prevState.balance) || 0) : 0;

        const thisRec = get(thisKey);
        // Manuellen Override respektieren
        if (!thisRec.carryOverManual) {
          const withCarry = { ...thisRec, id: thisKey, carryOver: prevBalance, carryOverManual: false };
          State.setMonths({ ...State.get().months, [thisKey]: withCarry });
          await Storage.put('months', withCarry);
        }
      }

      await recalculateMonth(thisKey, txs);
    }

    Debug.log('Months', `recalculateFrom abgeschlossen: ${allKeys.length - begin} Monate aktualisiert`);
  };

  // Alias für app.js
  const propagateCarryOver = (fromKey, transactions) => recalculateFrom(fromKey, transactions);

  return {
    loadAll,
    get,
    setCarryOver,
    getMonthSummary,
    calcBalance,
    getAllRelevantMonthKeys,
    allMonthKeys,
    recalculateMonth,
    recalculateFrom,
    propagateCarryOver,
  };
})();
