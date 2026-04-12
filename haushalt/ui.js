// ui.js – Rendering + UI Logik
const UI = (() => {

  // ── TOAST ──────────────────────────────────────────────────────
  let _toastTimer = null;
  const toast = (msg, type = 'info') => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  };

  // ── LOADING ────────────────────────────────────────────────────
  const setLoading = (show) => {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
  };

  // ── NAVIGATION ─────────────────────────────────────────────────
  const goTab = (tab) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const page = document.getElementById(`p-${tab}`);
    if (page) page.classList.add('on');
    State.set({ activeTab: tab });
    render();
  };

  // ── MONTH NAV ──────────────────────────────────────────────────
  const changeMonth = (dir) => {
    const [y, m] = State.get().currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    State.setCurrentMonth(key);
    render();
  };

  const renderMonthNav = () => {
    const el = document.getElementById('mo-label');
    if (el) el.textContent = Utils.monthLabel(State.get().currentMonth);
  };

  // ── MODAL ──────────────────────────────────────────────────────
  const openModal = (id) => {
    const m = document.getElementById(id);
    if (m) { m.classList.add('on'); }
  };

  const closeModal = (id) => {
    const m = document.getElementById(id);
    if (m) m.classList.remove('on');
  };

  const closeAllModals = () => {
    document.querySelectorAll('.modal-bg').forEach(m => m.classList.remove('on'));
  };

  // ── DASHBOARD ──────────────────────────────────────────────────
  const renderDashboard = () => {
    const key = State.get().currentMonth;
    const txs = State.get().transactions;
    const bal = Months.calcBalance(key, txs);
    const catStats = Transactions.getCategoryStats(key);
    const recent = Transactions.getForMonth(key).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const maxCat = catStats[0]?.amount || 1;

    renderMonthNav();

    // Stats
    document.getElementById('d-income').textContent = Utils.formatMoney(bal.income);
    document.getElementById('d-expenses').textContent = Utils.formatMoney(bal.expenses);
    document.getElementById('d-balance').textContent = Utils.formatMoney(bal.balance);
    document.getElementById('d-balance').className = `stat-val ${bal.balance >= 0 ? 'c-green' : 'c-red'}`;
    const days = Utils.daysInMonth(key);
    document.getElementById('d-daily').textContent = Utils.formatMoney(bal.expenses / days);
    document.getElementById('d-carry').textContent = `Übertrag: ${Utils.formatMoney(bal.carryOver)}`;

    // Category bars
    const catEl = document.getElementById('d-cats');
    if (catEl) {
      if (!catStats.length) {
        catEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Keine Ausgaben</p></div>';
      } else {
        catEl.innerHTML = catStats.slice(0, 8).map(c => {
          const cat = Categories.getById(c.cat);
          const w = Math.round(c.amount / maxCat * 100);
          return `<div class="cat-row">
            <div class="cat-icon">${cat ? cat.icon : '💸'}</div>
            <div class="cat-info">
              <div class="cat-name">${Utils.escHtml(cat ? cat.name : c.cat)}</div>
              <div class="cat-bar-wrap"><div class="cat-bar" style="width:${w}%;background:${cat?.color||'#BA7517'}"></div></div>
            </div>
            <div class="cat-amt">${Utils.formatMoney(c.amount)}</div>
          </div>`;
        }).join('');
      }
    }

    // Recent transactions
    const recEl = document.getElementById('d-recent');
    if (recEl) {
      if (!recent.length) {
        recEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Noch keine Buchungen</p></div>';
      } else {
        recEl.innerHTML = recent.map(t => txRowHTML(t)).join('');
      }
    }
  };

  // ── TRANSACTION ROW ────────────────────────────────────────────
  const txRowHTML = (t, showDelete = true) => {
    const cat = Categories.getById(t.category);
    const sign = t.type === 'expense' ? '-' : '+';
    const cls = t.type === 'expense' ? 'c-red' : 'c-green';
    return `<div class="tx-row" data-id="${t.id}">
      <div class="tx-icon" style="background:${cat?.color||'#666'}22">${cat ? cat.icon : '💸'}</div>
      <div class="tx-info">
        <div class="tx-store">${Utils.escHtml(t.store || t.description || '–')}</div>
        <div class="tx-desc">${Utils.escHtml(t.description || cat?.name || '')} · ${Utils.formatDate(t.date)}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amt ${cls}">${sign}${Utils.formatMoney(t.amount)}</div>
        ${showDelete ? `<button class="tx-del" onclick="App.deleteTx('${t.id}')" aria-label="Löschen">✕</button>` : ''}
      </div>
    </div>`;
  };

  // ── BUCHUNGEN LIST ─────────────────────────────────────────────
  const renderList = () => {
    const { transactions, filterCat, searchQuery } = State.get();
    const q = (searchQuery || '').toLowerCase();

    let txs = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
    if (filterCat && filterCat !== 'all') txs = txs.filter(t => t.category === filterCat);
    if (q) txs = txs.filter(t => (t.store + t.description + t.category).toLowerCase().includes(q));

    // Category chips
    const chipEl = document.getElementById('cat-chips');
    if (chipEl) {
      const all = [{ id: 'all', name: 'Alle', icon: '📋' }, ...Categories.getAll()];
      chipEl.innerHTML = all.map(c => `
        <button class="chip ${filterCat === c.id ? 'on' : ''}" onclick="App.setFilter('${c.id}')">
          ${c.icon || ''} ${Utils.escHtml(c.name)}
        </button>`).join('');
    }

    const wrap = document.getElementById('tx-list-wrap');
    if (!wrap) return;

    if (!txs.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:32px 0"><div class="empty-icon">🔍</div><p>Keine Buchungen gefunden</p></div>';
      return;
    }

    // Group by month
    const groups = {};
    txs.forEach(t => {
      const k = Utils.monthKey(t.date);
      (groups[k] = groups[k] || []).push(t);
    });

    wrap.innerHTML = Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, ts]) => {
        const total = ts.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return `<div class="month-group">
          <div class="month-header">
            <span>${Utils.monthLabel(k)}</span>
            <span class="c-red">${Utils.formatMoney(total)} Ausgaben</span>
          </div>
          <div class="tx-list">${ts.map(t => txRowHTML(t)).join('')}</div>
        </div>`;
      }).join('');
  };

  // ── ADD FORM ───────────────────────────────────────────────────
  const openAddModal = (prefill) => {
    const f = prefill || {};
    document.getElementById('f-type-expense').classList.toggle('on', (f.type || 'expense') === 'expense');
    document.getElementById('f-type-income').classList.toggle('on', f.type === 'income');
    document.getElementById('f-date').value = f.date || Utils.todayISO();
    document.getElementById('f-store').value = f.store || '';
    document.getElementById('f-desc').value = f.description || '';
    document.getElementById('f-amt').value = f.amount || '';
    document.getElementById('f-edit-id').value = f.id || '';

    // Populate category select
    const sel = document.getElementById('f-cat');
    sel.innerHTML = Categories.getAll().map(c =>
      `<option value="${c.id}" ${c.id === (f.category || 'sonstiges') ? 'selected' : ''}>${c.icon} ${c.name}</option>`
    ).join('');

    document.getElementById('f-modal-title').textContent = f.id ? 'Buchung bearbeiten' : 'Buchung hinzufügen';
    openModal('add-modal');
    setTimeout(() => document.getElementById('f-amt').focus(), 100);
  };

  const autoDetectCategory = () => {
    const store = document.getElementById('f-store').value;
    const desc  = document.getElementById('f-desc').value;
    const cat   = Categories.detect(store, desc);
    document.getElementById('f-cat').value = cat;
  };

  // ── SCAN RESULT MODAL ──────────────────────────────────────────
  const showScanResult = (result) => {
    const wrap = document.getElementById('scan-result-wrap');
    if (!wrap) return;

    if (!result.ok) {
      wrap.innerHTML = `<div class="error-box">❌ ${Utils.escHtml(result.msg)}</div>`;
      return;
    }

    const hasItems = result.items && result.items.length > 0;
    const confidence = result.confidence ? Math.round(result.confidence) : '?';
    const uncert = result.uncertain ? '<div class="warn-box">⚠️ Erkennung unsicher – bitte prüfen!</div>' : '';

    wrap.innerHTML = `
      ${uncert}
      <div class="scan-info">
        <span>📍 ${Utils.escHtml(result.store)}</span>
        <span>📅 ${Utils.formatDate(result.date)}</span>
        <span>🎯 ${confidence}% Konfidenz</span>
      </div>
      ${hasItems ? `
        <div class="sec-label">Erkannte Positionen (${result.items.length})</div>
        ${result.items.map((it, i) => {
          const cat = Categories.getById(it.cat);
          return `<div class="scan-item">
            <div class="scan-item-left">
              <input type="text" class="scan-item-desc" id="si-desc-${i}" value="${Utils.escHtml(it.desc)}">
              <select class="scan-item-cat" id="si-cat-${i}">
                ${Categories.getAll().map(c => `<option value="${c.id}" ${c.id === it.cat ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
              </select>
            </div>
            <input type="number" class="scan-item-amt" id="si-amt-${i}" value="${it.amount.toFixed(2)}" step="0.01">
          </div>`;
        }).join('')}
        <button class="btn-primary" onclick="App.saveScanItems(${result.items.length}, '${result.date}', '${Utils.escHtml(result.store)}')">
          ✓ Alle ${result.items.length} Positionen speichern
        </button>
      ` : `
        <div class="scan-fallback">
          <div class="sec-label">Gesamtbetrag</div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
            <input type="number" id="scan-total-amt" value="${result.total.toFixed(2)}" step="0.01" class="inp" style="flex:1">
            <input type="date" id="scan-total-date" value="${result.date}" class="inp" style="flex:1">
          </div>
          <input type="text" id="scan-total-store" value="${Utils.escHtml(result.store)}" class="inp" placeholder="Laden" style="width:100%;margin-bottom:10px">
          <button class="btn-primary" onclick="App.saveScanTotal()">✓ Als Buchung speichern</button>
        </div>
      `}`;
  };

  // ── MEHR/EINSTELLUNGEN ─────────────────────────────────────────
  const renderSettings = () => {
    const couponEl = document.getElementById('coupons-list');
    if (!couponEl) return;
    const shops = ['Rossmann','Kaufland','Edeka','Aldi','Lidl'];
    couponEl.innerHTML = shops.map(s => {
      const val = localStorage.getItem(`coupon_${s}`) || '';
      return `<div class="coupon-row">
        <span class="coupon-shop">${s}</span>
        <input type="number" step="0.01" placeholder="Guthaben €" class="coupon-inp" value="${val}"
          onchange="localStorage.setItem('coupon_${s}',this.value);UI.toast('Gespeichert')">
      </div>`;
    }).join('');
  };

  // ── MAIN RENDER ────────────────────────────────────────────────
  const render = () => {
    const tab = State.get().activeTab;
    renderMonthNav();
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'list') renderList();
    if (tab === 'settings') renderSettings();
  };

  return {
    toast, setLoading, goTab, changeMonth, renderMonthNav,
    openModal, closeModal, closeAllModals,
    renderDashboard, renderList, renderSettings,
    txRowHTML, openAddModal, autoDetectCategory,
    showScanResult, render
  };
})();
