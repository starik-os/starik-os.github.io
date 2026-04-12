// transactions.js – Einnahmen/Ausgaben Logik
const Transactions = (() => {

  const loadAll = async () => {
    const txs = await Storage.getAll('transactions');
    State.setTransactions(txs);
    Debug.log('Transactions', `Loaded ${txs.length} transactions`);
    return txs;
  };

  const add = async (data) => {
    const v = Validation.transaction(data);
    if (!v.ok) throw new Error(v.errors.join(' / '));

    const tx = v.value;
    if (!tx.category || tx.category === 'sonstiges') {
      tx.category = Categories.detect(tx.store, tx.description);
    }

    await Storage.put('transactions', tx);
    const current = State.get().transactions;
    State.setTransactions([...current.filter(t => t.id !== tx.id), tx]);
    Debug.log('Transactions', `Added ${tx.type} ${tx.amount} (${tx.store})`);
    return tx;
  };

  const remove = async (id) => {
    await Storage.remove('transactions', id);
    const current = State.get().transactions;
    State.setTransactions(current.filter(t => t.id !== id));
    Debug.log('Transactions', `Removed ${id}`);
  };

  const update = async (data) => {
    const v = Validation.transaction(data);
    if (!v.ok) throw new Error(v.errors.join(' / '));
    await Storage.put('transactions', v.value);
    const current = State.get().transactions;
    State.setTransactions(current.map(t => t.id === v.value.id ? v.value : t));
    return v.value;
  };

  const importMany = async (items) => {
    const valid = [];
    const errors = [];
    for (const item of items) {
      const v = Validation.transaction(item);
      if (v.ok) {
        if (!v.value.category || v.value.category === 'sonstiges') {
          v.value.category = Categories.detect(v.value.store, v.value.description);
        }
        valid.push(v.value);
      } else {
        errors.push({ item, errors: v.errors });
      }
    }
    if (valid.length) {
      await Storage.putMany('transactions', valid);
      const current = State.get().transactions;
      const existingIds = new Set(current.map(t => t.id));
      const newTxs = valid.filter(t => !existingIds.has(t.id));
      State.setTransactions([...current, ...newTxs]);
    }
    Debug.log('Transactions', `Import: ${valid.length} OK, ${errors.length} errors`);
    return { added: valid.length, errors };
  };

  const getForMonth = (key) => {
    return State.get().transactions.filter(t => Utils.monthKey(t.date) === key);
  };

  const getCategoryStats = (key) => {
    const txs = getForMonth(key).filter(t => t.type === 'expense');
    const map = {};
    txs.forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([cat, amt]) => ({ cat, amount: Math.round(amt * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);
  };

  return { loadAll, add, remove, update, importMany, getForMonth, getCategoryStats };
})();
