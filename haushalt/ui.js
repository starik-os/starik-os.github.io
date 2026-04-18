// ui.js – DOM, Rendering, Navigation, Modals, Anzeige
const UI = (() => {

  let _toastTimer = null;
  const toast = (msg, type='info') => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.className = `toast show ${type}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  };

  const setLoading = (show) => {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
  };

  const openModal  = (id) => { const m = document.getElementById(id); if (m) m.classList.add('on'); };
  const closeModal = (id) => { const m = document.getElementById(id); if (m) m.classList.remove('on'); };

  // ── NAVIGATION ─────────────────────────────────────────────────
  const goTab = (tab) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab===tab));
    const page = document.getElementById(`p-${tab}`);
    if (page) page.classList.add('on');
    State.set({ activeTab: tab });
    if (tab==='dashboard') renderDashboard();
    if (tab==='list')      renderList();
    if (tab==='settings')  renderSettings();
  };

  const changeMonth = (dir) => {
    const [y,m] = State.get().currentMonth.split('-').map(Number);
    const d = new Date(y, m-1+dir, 1);
    State.setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    renderDashboard();
  };

  const renderMonthNav = () => {
    const el = document.getElementById('mo-label');
    if (el) el.textContent = Utils.monthLabel(State.get().currentMonth);
  };

  // ── ADD / EDIT MODAL ───────────────────────────────────────────
  const openAddModal = (prefill) => {
    const p = prefill || {};
    _setVal('f-edit-id',   p.id           || '');
    _setVal('f-date',      p.date          || Utils.todayISO());
    _setVal('f-store',     p.store         || '');
    _setVal('f-desc',      p.description   || '');
    _setVal('f-amt',       p.amount != null ? p.amount : '');
    setEntryType(p.type || 'expense');

    // Kategorie-Select
    const sel = document.getElementById('f-cat');
    if (sel) sel.innerHTML = Categories.getAll().map(c =>
      `<option value="${c.id}" ${c.id===(p.category||'sonstiges')?'selected':''}>${c.icon} ${c.name}</option>`
    ).join('');

    // flowScope
    _setVal('f-flowscope', p.flowScope || 'main');
    _updateFlowScopeUI(p.flowScope || 'main', p);

    const title = document.getElementById('f-modal-title');
    if (title) title.textContent = p.id ? 'Buchung bearbeiten' : 'Buchung hinzufügen';

    openModal('add-modal');
    setTimeout(() => { const a = document.getElementById('f-amt'); if (a) a.focus(); }, 120);
  };

  // flowScope-abhängige Felder ein-/ausblenden
  const _updateFlowScopeUI = (scope, prefill) => {
    const p = prefill || {};
    // Status-Feld: bei obligation immer, bei fixkosten-Kategorien optional
    const statusWrap = document.getElementById('f-status-wrap');
    const dueWrap    = document.getElementById('f-due-wrap');
    const taxWrap    = document.getElementById('f-tax-wrap');
    const storeWrap  = document.getElementById('f-store-wrap');

    if (statusWrap) statusWrap.style.display  = (scope === 'obligation') ? '' : 'none';
    if (dueWrap)    dueWrap.style.display      = (scope === 'obligation') ? '' : 'none';
    if (taxWrap)    taxWrap.style.display      = '';  // immer sichtbar

    if (scope === 'obligation') {
      _setVal('f-status',  p.status || 'open');
      _setVal('f-due',     p.dueDate || '');
    }

    const taxCb = document.getElementById('f-tax-relevant');
    if (taxCb) taxCb.checked = p.taxRelevant === true;
    const taxTypeWrap = document.getElementById('f-taxtype-wrap');
    if (taxTypeWrap) taxTypeWrap.style.display = (p.taxRelevant) ? '' : 'none';
    _setVal('f-taxtype', p.taxType || '');
  };

  const setEntryType = (type) => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('on', b.dataset.type===type));
    const sw = document.getElementById('f-store-wrap');
    if (sw) sw.style.display = type==='expense' ? '' : 'none';
    const title = document.getElementById('f-modal-title');
    if (title && !document.getElementById('f-edit-id')?.value) {
      title.textContent = type==='expense' ? 'Ausgabe hinzufügen' : 'Einnahme hinzufügen';
    }
  };

  const onFlowScopeChange = () => {
    const scope = _getVal('f-flowscope');
    _updateFlowScopeUI(scope, {});
  };

  const onTaxRelevantChange = (cb) => {
    const taxTypeWrap = document.getElementById('f-taxtype-wrap');
    if (taxTypeWrap) taxTypeWrap.style.display = cb.checked ? '' : 'none';
  };

  const autoDetectCategory = () => {
    const cat = Categories.detect(_getVal('f-store'), _getVal('f-desc'));
    const sel = document.getElementById('f-cat');
    if (sel) sel.value = cat;
    // Wenn Fixkosten-Kategorie: Status-Feld anzeigen
    const statusWrap = document.getElementById('f-status-wrap');
    if (statusWrap && _getVal('f-flowscope') === 'main') {
      statusWrap.style.display = Categories.isFixed(cat) ? '' : 'none';
      if (Categories.isFixed(cat) && !_getVal('f-status')) _setVal('f-status', 'open');
    }
  };

  // DOM Helfer
  const _setVal  = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const _getVal  = (id)      => { const el = document.getElementById(id); return el ? el.value : ''; };
  const _setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // ── DASHBOARD ──────────────────────────────────────────────────
  const renderDashboard = () => {
    const key    = State.get().currentMonth;
    const txs    = State.get().transactions;
    const bal    = Months.getMonthSummary(key, txs);

    // Nur main für Fix/Var
    const mainTx  = txs.filter(t => Utils.monthKey(t.date)===key && t.type==='expense' && (!t.flowScope||t.flowScope==='main'));
    const fixTx   = mainTx.filter(t => Categories.isFixed(t.category));
    const varTx   = mainTx.filter(t => !Categories.isFixed(t.category));
    const fixSum  = fixTx.reduce((s,t)=>s+t.amount,0);
    const varSum  = varTx.reduce((s,t)=>s+t.amount,0);

    // Nebenflüsse dieses Monats
    const sideTx  = Transactions.getSideFlows(key);
    const sideSum = sideTx.reduce((s,t)=> t.type==='expense' ? s-t.amount : s+t.amount, 0);

    // Rücklagen (global)
    const reserves    = Transactions.getReserves();
    const reserveSum  = reserves.reduce((s,t)=> t.type==='income' ? s+t.amount : s-t.amount, 0);

    // Offene Verpflichtungen (global)
    const openObl     = Transactions.getOpenObligations();
    const openOblSum  = openObl.reduce((s,t)=>s+t.amount,0);

    // Offene Fixkosten dieses Monats
    const openFix     = Transactions.getOpenFixkosten(key);
    const openFixSum  = openFix.reduce((s,t)=>s+t.amount,0);

    renderMonthNav();

    const carryEl = document.getElementById('d-carry');
    if (carryEl) carryEl.textContent = `Übertrag: ${Utils.formatMoney(bal.carryOver)}${bal.carryOverManual?' ✎':''}`;

    _setText('d-income',   Utils.formatMoney(bal.totalIncome));
    _setText('d-expenses', Utils.formatMoney(bal.totalExpenses));
    const balEl = document.getElementById('d-balance');
    if (balEl) { balEl.textContent = Utils.formatMoney(bal.balance); balEl.className = `stat-val ${bal.balance>=0?'c-green':'c-red'}`; }
    const days = Utils.daysInMonth(key);
    _setText('d-daily', Utils.formatMoney(days>0 ? varSum/days : 0));

    // Fix / Variabel
    const fvEl = document.getElementById('d-fixvar');
    if (fvEl) fvEl.innerHTML = `
      <div class="fixvar-item"><span class="fixvar-lbl">🏠 Fixkosten</span><span class="fixvar-amt c-red">${Utils.formatMoney(fixSum)}</span></div>
      <div class="fixvar-item"><span class="fixvar-lbl">🛒 Variable</span><span class="fixvar-amt c-red">${Utils.formatMoney(varSum)}</span></div>`;

    // ── ERWEITERTE BLÖCKE ─────────────────────────────────────────
    const extraEl = document.getElementById('d-extra');
    if (extraEl) {
      let html = '';

      // Rücklagen
      if (Math.abs(reserveSum) > 0.005) {
        html += `<div class="extra-block reserve-block">
          <div class="extra-head"><span>💰 Rücklagen</span><span class="c-amber">${Utils.formatMoney(reserveSum)}</span></div>
          <div class="extra-hint">Nicht frei verfügbar · getrennt von Haushaltsbilanz</div>
        </div>`;
      }

      // Nebenflüsse
      if (sideTx.length) {
        html += `<div class="extra-block side-block">
          <div class="extra-head"><span>↔️ Nebenflüsse dokumentiert</span><span class="c-muted">${sideTx.length} Einträge · ${Utils.formatMoney(Math.abs(sideSum))}</span></div>
          <div class="extra-hint">Handkasse, Pfand, Bargeld – nicht in Bilanz eingerechnet</div>
        </div>`;
      }

      // Offene Verpflichtungen
      if (openObl.length) {
        html += `<div class="extra-block obligation-block">
          <div class="extra-head"><span>⚠️ Offene Verpflichtungen</span><span class="c-red">${Utils.formatMoney(openOblSum)}</span></div>
          <div class="extra-items">${openObl.slice(0,3).map(t =>
            `<div class="extra-item"><span>${Utils.escHtml(t.description||t.store||'–')}</span><span>${Utils.formatDate(t.date)}${t.dueDate?' · fällig '+Utils.formatDate(t.dueDate):''}</span><span class="c-red">${Utils.formatMoney(t.amount)}</span></div>`
          ).join('')}${openObl.length>3?`<div class="extra-more">...und ${openObl.length-3} weitere</div>`:''}</div>
        </div>`;
      }

      // Offene Fixkosten
      if (openFix.length) {
        const realAvail = bal.balance - openFixSum;
        html += `<div class="extra-block fixstatus-block">
          <div class="extra-head"><span>📋 Offene Fixkosten</span><span class="c-red">${Utils.formatMoney(openFixSum)}</span></div>
          ${openFix.map(t => {
            const cat = Categories.getById(t.category);
            return `<div class="extra-item"><span>${cat?cat.icon:''} ${Utils.escHtml(t.store||cat?.name||'–')}</span><span class="status-badge open">offen</span><span class="c-red">${Utils.formatMoney(t.amount)}</span></div>`;
          }).join('')}
          <div class="extra-real-avail">Real verfügbar nach offenen Fixkosten: <strong class="${realAvail>=0?'c-green':'c-red'}">${Utils.formatMoney(realAvail)}</strong></div>
        </div>`;
      }

      extraEl.innerHTML = html;
    }

    // Verlauf
    const curDay  = Utils.monthKey(Utils.todayISO())===key ? new Date().getDate() : days;
    const avgPerDay = curDay>0 ? varSum/curDay : 0;
    const projected = Math.round(avgPerDay*days*100)/100;
    const progEl = document.getElementById('d-progress');
    if (progEl) {
      const pct = Math.min(100, Math.round(varSum/(Math.max(projected,1))*100));
      progEl.innerHTML = `
        <div class="prog-row">
          <span class="prog-lbl">Ø ${Utils.formatMoney(avgPerDay)}/Tag · Hochrechnung: ${Utils.formatMoney(projected)}</span>
          <span class="prog-day">Tag ${curDay}/${days}</span>
        </div>
        <div class="prog-bar-wrap"><div class="prog-bar" style="width:${pct}%;background:${pct>90?'var(--red)':'#BA7517'}"></div></div>`;
    }

    // Kategorien
    const cats = Transactions.getCategoryStats(key);
    const catEl = document.getElementById('d-cats');
    if (catEl) {
      if (!cats.length) {
        catEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Keine Ausgaben</p></div>';
      } else {
        const maxAmt = cats[0].amount||1;
        catEl.innerHTML = cats.slice(0,8).map(c => {
          const cat = Categories.getById(c.cat);
          const w   = Math.round(c.amount/maxAmt*100);
          return `<div class="cat-row">
            <div class="cat-icon">${cat?cat.icon:'💸'}</div>
            <div class="cat-info">
              <div class="cat-name">${Utils.escHtml(cat?cat.name:c.cat)}${cat?.fixed?'<span class="fix-badge">fix</span>':''}</div>
              <div class="cat-bar-wrap"><div class="cat-bar" style="width:${w}%;background:${cat?.color||'#BA7517'}"></div></div>
            </div>
            <div class="cat-amt">${Utils.formatMoney(c.amount)}</div>
          </div>`;
        }).join('');
      }
    }

    // Letzte Buchungen
    const recent = Transactions.getForMonth(key).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
    const recEl  = document.getElementById('d-recent');
    if (recEl) recEl.innerHTML = recent.length ? recent.map(t=>_txRowHTML(t)).join('') :
      '<div class="empty-state"><div class="empty-icon">📋</div><p>Noch keine Buchungen</p></div>';
  };

  // ── BUCHUNGSLISTE ──────────────────────────────────────────────
  const renderList = () => {
    const { transactions, filterCat, searchQuery, filterScope } = State.get();
    const q = (searchQuery||'').toLowerCase();
    let txs = [...transactions].sort((a,b)=>b.date.localeCompare(a.date));
    if (filterCat && filterCat!=='all') txs = txs.filter(t=>t.category===filterCat);
    if (filterScope && filterScope!=='all') txs = txs.filter(t=>(t.flowScope||'main')===filterScope);
    if (q) txs = txs.filter(t=>(t.store+' '+t.description+' '+t.category).toLowerCase().includes(q));

    // Scope-Filter Tabs
    const scopeTabEl = document.getElementById('scope-tabs');
    if (scopeTabEl) {
      const scopes = [
        { id:'all',         label:'Alle',          icon:'📋' },
        { id:'main',        label:'Hauptbuch',      icon:'📊' },
        { id:'side',        label:'Nebenflüsse',    icon:'↔️' },
        { id:'reserve',     label:'Rücklagen',      icon:'💰' },
        { id:'obligation',  label:'Verpflichtungen',icon:'⚠️' },
      ];
      scopeTabEl.innerHTML = scopes.map(s =>
        `<button class="chip ${(filterScope||'all')===s.id?'on':''}" onclick="App.setFilterScope('${s.id}')">${s.icon} ${s.label}</button>`
      ).join('');
    }

    const chipEl = document.getElementById('cat-chips');
    if (chipEl) {
      const all = [{ id:'all', name:'Alle', icon:'📋' }, ...Categories.getAll()];
      chipEl.innerHTML = all.map(c =>
        `<button class="chip ${(filterCat||'all')===c.id?'on':''}" onclick="App.setFilter('${c.id}')">${c.icon||''} ${Utils.escHtml(c.name)}</button>`
      ).join('');
    }

    const wrap = document.getElementById('tx-list-wrap');
    if (!wrap) return;
    if (!txs.length) { wrap.innerHTML = '<div class="empty-state" style="padding:32px 0"><div class="empty-icon">🔍</div><p>Keine Buchungen gefunden</p></div>'; return; }

    const groups = {};
    txs.forEach(t => { const k = Utils.monthKey(t.date); (groups[k]=groups[k]||[]).push(t); });
    wrap.innerHTML = Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,ts]) => {
      const total = ts.filter(t=>t.type==='expense'&&(!t.flowScope||t.flowScope==='main')).reduce((s,t)=>s+t.amount,0);
      return `<div class="month-group">
        <div class="month-header"><span>${Utils.monthLabel(k)}</span><span class="c-red">${Utils.formatMoney(total)}</span></div>
        <div class="tx-list">${ts.map(t=>_txRowHTML(t)).join('')}</div>
      </div>`;
    }).join('');
  };

  // ── TX ROW ─────────────────────────────────────────────────────
  const _txRowHTML = (t) => {
    const cat     = Categories.getById(t.category);
    const sign    = t.type==='expense' ? '-' : '+';
    const cls     = t.type==='expense' ? 'c-red' : 'c-green';
    const fixTag  = cat?.fixed && (!t.flowScope||t.flowScope==='main') ? '<span class="fix-badge">fix</span>' : '';
    const devName = _resolveDeviceName(t.deviceId);
    const devBadge = devName ? `<span class="device-badge">${Utils.escHtml(devName)}</span>` : '';

    // Scope-Badge (nicht für main)
    const scopeBadges = {
      side:       '<span class="scope-badge side">↔ Nebenfluss</span>',
      reserve:    '<span class="scope-badge reserve">💰 Rücklage</span>',
      obligation: `<span class="scope-badge obligation">⚠ Verpflichtung</span>`,
    };
    const scopeBadge = scopeBadges[t.flowScope] || '';

    // Status-Badge
    const statusBadge = t.status === 'open' ? '<span class="status-badge open">offen</span>'
                      : t.status === 'paid' ? '<span class="status-badge paid">bezahlt</span>'
                      : t.status === 'cancelled' ? '<span class="status-badge cancelled">abgesagt</span>'
                      : '';

    // Tax-Badge
    const taxBadge = t.taxRelevant ? '<span class="tax-badge">§ steuerl.</span>' : '';

    const itemsPreview = (t.items&&t.items.length)
      ? `<div class="tx-items">${t.items.slice(0,3).map(i=>`<span class="tx-item-chip">${Utils.escHtml(i.desc)} ${Utils.formatMoney(i.amount)}</span>`).join('')}${t.items.length>3?`<span class="tx-item-chip">+${t.items.length-3}</span>`:''}</div>` : '';

    const dimmed = t.flowScope && t.flowScope !== 'main' ? 'style="opacity:0.82"' : '';

    return `<div class="tx-row" data-id="${t.id}" ${dimmed}>
      <div class="tx-icon" style="background:${cat?.color||'#666'}22">${cat?cat.icon:'💸'}</div>
      <div class="tx-info" onclick="App.editTx('${t.id}')" style="cursor:pointer">
        <div class="tx-store">${Utils.escHtml(t.store||t.description||'–')}${fixTag}${devBadge}${scopeBadge}${statusBadge}${taxBadge}</div>
        <div class="tx-desc">${Utils.escHtml(t.description||cat?.name||'')} · ${Utils.formatDate(t.date)}${t.dueDate?' · fällig '+Utils.formatDate(t.dueDate):''}</div>
        ${itemsPreview}
      </div>
      <div class="tx-right">
        <div class="tx-amt ${cls}">${sign}${Utils.formatMoney(t.amount)}</div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <button class="tx-del" onclick="App.editTx('${t.id}')" title="Bearbeiten">✎</button>
          <button class="tx-del" onclick="App.deleteTx('${t.id}')" title="Löschen" style="color:var(--txt3)">✕</button>
        </div>
      </div>
    </div>`;
  };

  const _resolveDeviceName = (deviceId) => {
    if (!deviceId) return '';
    const ownId = State.get().deviceId || '';
    if (deviceId === ownId) return '';
    if (deviceId && !/^[0-9a-f-]{30,}$/i.test(deviceId)) return deviceId;
    return '';
  };

  // ── EINSTELLUNGEN ──────────────────────────────────────────────
  const renderSettings = () => {
    const devInfoEl = document.getElementById('device-info');
    if (devInfoEl) devInfoEl.textContent = `Dieses Gerät: ${State.get().deviceName||'(kein Name)'}`;
    const couponEl = document.getElementById('coupons-list');
    if (!couponEl) return;
    const shops = ['Rossmann','Kaufland','Edeka','Aldi','Lidl'];
    couponEl.innerHTML = shops.map(s => {
      const val = localStorage.getItem(`coupon_${s}`) || '';
      return `<div class="coupon-row">
        <span class="coupon-shop">${s}</span>
        <input type="number" step="0.01" placeholder="€" class="coupon-inp"
          value="${Utils.escHtml(val)}"
          onchange="localStorage.setItem('coupon_${s}', this.value); UI.toast('Gespeichert')">
      </div>`;
    }).join('');
  };

  // ── SCAN ERGEBNIS ──────────────────────────────────────────────
  const showScanResult = (result) => {
    const wrap = document.getElementById('scan-result-wrap');
    if (!wrap) return;
    if (!result.ok) { wrap.innerHTML = `<div class="error-box">❌ ${Utils.escHtml(result.msg)}</div>`; return; }
    const hasItems = result.items && result.items.length > 0 && result.hasReliableItems;
    const conf     = result.ocrConfidence !== undefined ? result.ocrConfidence : '?';
    const info = `${result.uncertain?'<div class="warn-box">⚠️ Erkennung unsicher</div>':''}
      ${(result.warnings?.length)?result.warnings.map(w=>`<div class="warn-box" style="margin-bottom:4px">${Utils.escHtml(w)}</div>`).join(''):''}
      <div class="scan-info"><span>📍 ${Utils.escHtml(result.store)}</span><span>📅 ${Utils.formatDate(result.date)}${result.dateUsedFallback?' (heute)':''}</span><span>🎯 OCR ${conf}%</span></div>`;
    if (hasItems) {
      wrap.innerHTML = `${info}<div class="sec-label">Erkannte Positionen (${result.items.length})</div>
        ${result.items.map((it,i)=>`<div class="scan-item"><div class="scan-item-left">
          <input type="text" class="scan-item-desc" id="si-desc-${i}" value="${Utils.escHtml(it.desc)}">
          <select class="scan-item-cat" id="si-cat-${i}">${Categories.getAll().map(c=>`<option value="${c.id}" ${c.id===it.cat?'selected':''}>${c.icon} ${c.name}</option>`).join('')}</select>
        </div><input type="number" class="scan-item-amt" id="si-amt-${i}" value="${it.amount.toFixed(2)}" step="0.01"></div>`).join('')}
        <button class="btn-primary" onclick="App.saveScanItems(${result.items.length},'${Utils.escHtml(result.date)}','${Utils.escHtml(result.store)}')">✓ Alle ${result.items.length} Positionen speichern</button>`;
    } else {
      wrap.innerHTML = `${info}<div class="sec-label">Gesamtbetrag</div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <input type="number" id="scan-total-amt" value="${result.total.toFixed(2)}" step="0.01" class="inp" style="flex:1">
          <input type="date" id="scan-total-date" value="${result.date}" class="inp" style="flex:1">
        </div>
        <input type="text" id="scan-total-store" value="${Utils.escHtml(result.store)}" class="inp" placeholder="Laden" style="width:100%;margin-bottom:10px">
        <button class="btn-primary" onclick="App.saveScanTotal()">✓ Als Buchung speichern</button>`;
    }
  };

  const render = () => {
    const tab = State.get().activeTab;
    if (tab==='dashboard') renderDashboard();
    if (tab==='list')      renderList();
    if (tab==='settings')  renderSettings();
  };

  return {
    toast, setLoading, openModal, closeModal,
    goTab, changeMonth, renderMonthNav,
    openAddModal, setEntryType, autoDetectCategory,
    onFlowScopeChange, onTaxRelevantChange,
    renderDashboard, renderList, renderSettings, showScanResult,
    render,
  };
})();
