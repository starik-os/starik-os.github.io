// state.js – Globaler Zustand
const State = (() => {
  let _state = {
    currentMonth: Utils.monthKey(Utils.todayISO()),
    activeTab: 'dashboard',
    transactions: [],
    months: {},
    filterCat: 'all',
    filterScope: 'all',
    searchQuery: '',
    loading: false,
    initialized: false,
    deviceId: '',
    deviceName: '',
  };

  const get = () => _state;

  const set = (updates) => {
    _state = { ..._state, ...updates };
  };

  const setCurrentMonth = (key) => {
    _state.currentMonth = key;
  };

  const setTransactions = (txs) => {
    _state.transactions = txs;
  };

  const setMonths = (months) => {
    _state.months = months;
  };

  const setLoading = (val) => {
    _state.loading = val;
  };

  // Filtered transactions for current month
  const currentMonthTransactions = () => {
    return _state.transactions.filter(t => Utils.monthKey(t.date) === _state.currentMonth);
  };

  return { get, set, setCurrentMonth, setTransactions, setMonths, setLoading, currentMonthTransactions };
})();
