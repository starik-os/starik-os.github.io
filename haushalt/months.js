// months.js – Monatslogik + Übertrag
const Months = (() => {

  const loadAll = async () => {
    const rows = await Storage.getAll('months');
    const map = {};
    rows.forEach(r => { map[r.id] = r; });
    State.setMonths(map);
    Debug.log('Months', `Loaded ${rows.length} month records`);
    return map;
  };

  const get = (key) => {
    const months = State.get().months;
    return months[key] || { id: key, carryOver: 0 };
  };

  const setCarryOver = async (key, amount) => {
    const months = State.get().months;
    const rec = { ...(months[key] || { id: key }), carryOver: amount };
    await Storage.put('months', rec);
    const updated = { ...months, [key]: rec };
    State.setMonths(updated);
    Debug.log('Months', `CarryOver ${key} = ${amount}`);
  };

  // Berechne Bilanz für einen Monat
  const calcBalance = (key, transactions) => {
    const monthTx = transactions.filter(t => Utils.monthKey(t.date) === key);
    const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const carryOver = get(key).carryOver || 0;
    return {
      carryOver,
      income,
      expenses,
      balance: Math.round((carryOver + income - expenses) * 100) / 100,
    };
  };

  // Alle Monate mit Transaktionen ermitteln
  const allMonthKeys = (transactions) => {
    const keys = new Set(transactions.map(t => Utils.monthKey(t.date)));
    const months = State.get().months;
    Object.keys(months).forEach(k => keys.add(k));
    return [...keys].filter(Boolean).sort().reverse();
  };

  // Übertrag automatisch weiterführen
  const propagateCarryOver = async (fromKey, transactions) => {
    const allKeys = allMonthKeys(transactions).sort();
    const startIdx = allKeys.indexOf(fromKey);
    if (startIdx < 0) return;

    for (let i = startIdx; i < allKeys.length - 1; i++) {
      const thisKey = allKeys[i];
      const nextKey = allKeys[i + 1];
      const bal = calcBalance(thisKey, transactions);
      await setCarryOver(nextKey, bal.balance);
      Debug.log('Months', `Propagated carryOver ${thisKey}→${nextKey}: ${bal.balance}`);
    }
  };

  return { loadAll, get, setCarryOver, calcBalance, allMonthKeys, propagateCarryOver };
})();
