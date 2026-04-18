// app.js – Orchestrierung, Use Cases, Initialisierung
const App = (() => {

  // ── INIT ───────────────────────────────────────────────────────
  const init = async () => {
    Debug.init();
    Debug.log('App', 'Init...');
    UI.setLoading(true);
    try {
      await Storage.open();
      await Categories.load();
      await Months.loadAll();
      await Transactions.loadAll();
      await _migrateFromOld();
      await _initDevice();

      let startMonth = Utils.monthKey(Utils.todayISO());
      const allTxs   = State.get().transactions;
      if (allTxs.length && !allTxs.some(t => Utils.monthKey(t.date) === startMonth)) {
        const allKeys = Months.getAllRelevantMonthKeys(allTxs);
        if (allKeys.length) startMonth = allKeys[allKeys.length - 1];
      }
      State.setCurrentMonth(startMonth);
      State.set({ initialized: true, activeTab: 'dashboard' });

      UI.render();
      _bindEvents();

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
          .then(() => Debug.log('App', 'SW registriert'))
          .catch(e => Debug.warn('App', 'SW fehlgeschlagen', e));
      }
      Debug.log('App', `Init OK. ${allTxs.length} Buchungen.`);
    } catch (err) {
      Debug.error('App', 'Init fehlgeschlagen', err);
      UI.toast('Fehler beim Laden. Seite neu laden.', 'error');
    } finally {
      UI.setLoading(false);
    }
  };

  // ── GERÄT INITIALISIEREN ───────────────────────────────────────
  const _initDevice = async () => {
    const deviceId   = await Storage.getDeviceId();
    const deviceName = await Storage.getDeviceName();
    State.set({ deviceId, deviceName: deviceName || '' });
    Utils.setDevicePrefix(deviceId.slice(0, 8)); // Kurz-Präfix für UIDs
    Debug.log('App', `Gerät: ${deviceName || '(unbenannt)'} [${deviceId.slice(0,8)}]`);
  };

  // ── EVENT BINDINGS ─────────────────────────────────────────────
  const _bindEvents = () => {
    const fab = document.getElementById('nav-fab');
    if (fab) fab.addEventListener('click', () => UI.openAddModal());

    const dz = document.getElementById('drop-zone');
    if (dz) {
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
      dz.addEventListener('drop', e => {
        e.preventDefault(); dz.classList.remove('drag');
        const file = e.dataTransfer?.files?.[0];
        if (file) _processCSVFile(file);
      });
    }

    // Partner-Import Dropzone
    const pdz = document.getElementById('partner-drop-zone');
    if (pdz) {
      pdz.addEventListener('dragover', e => { e.preventDefault(); pdz.classList.add('drag'); });
      pdz.addEventListener('dragleave', () => pdz.classList.remove('drag'));
      pdz.addEventListener('drop', e => {
        e.preventDefault(); pdz.classList.remove('drag');
        const file = e.dataTransfer?.files?.[0];
        if (file) _processPartnerFile(file);
      });
    }

    const addModal = document.getElementById('add-modal');
    if (addModal) addModal.addEventListener('click', e => { if (e.target===addModal) UI.closeModal('add-modal'); });

    const settingsModal = document.getElementById('device-modal');
    if (settingsModal) settingsModal.addEventListener('click', e => { if (e.target===settingsModal) UI.closeModal('device-modal'); });

    Debug.log('App', 'Events gebunden');
  };

  // ── MIGRATION ─────────────────────────────────────────────────
  const _migrateFromOld = async () => {
    const oldTx = localStorage.getItem('hh_tx');
    if (!oldTx) return;
    const alreadyDone = await Storage.isMigrated();
    if (alreadyDone) { localStorage.removeItem('hh_tx'); localStorage.removeItem('hh_inc'); return; }
    try {
      const txs = JSON.parse(oldTx);
      const inc = JSON.parse(localStorage.getItem('hh_inc') || '[]');
      if (!txs.length && !inc.length) { await Storage.setMigrated(); return; }
      const all = [
        ...txs.map(t => ({ ...t, type:'expense', description:t.desc||t.description||'', store:t.store||'' })),
        ...inc.map(t => ({ ...t, type:'income',  store:'', description:t.desc||t.description||'' })),
      ];
      const result = await Transactions.importMany(all);
      await Storage.setMigrated();
      localStorage.removeItem('hh_tx'); localStorage.removeItem('hh_inc'); localStorage.removeItem('mm_state');
      if (result.added > 0) UI.toast(`${result.added} Buchungen aus älterer Version übernommen`);
    } catch (e) { Debug.warn('App', 'Migration fehlgeschlagen', e); }
  };

  // ── BUCHUNG SPEICHERN ──────────────────────────────────────────
  const saveEntry = async () => {
    const typeBtn = document.querySelector('.type-btn.on');
    const type    = typeBtn?.dataset.type || 'expense';
    const id      = document.getElementById('f-edit-id')?.value || '';
    const taxCb   = document.getElementById('f-tax-relevant');
    const data = {
      id: id || undefined, type,
      date:        document.getElementById('f-date')?.value        || '',
      store:       document.getElementById('f-store')?.value       || '',
      description: document.getElementById('f-desc')?.value        || '',
      amount:      document.getElementById('f-amt')?.value         || '',
      category:    document.getElementById('f-cat')?.value         || 'sonstiges',
      flowScope:   document.getElementById('f-flowscope')?.value   || 'main',
      status:      document.getElementById('f-status')?.value      || undefined,
      dueDate:     document.getElementById('f-due')?.value         || undefined,
      taxRelevant: taxCb ? taxCb.checked : false,
      taxType:     document.getElementById('f-taxtype')?.value     || undefined,
    };
    try {
      if (id) { await Transactions.update({ ...data, id }); UI.toast('Buchung aktualisiert ✓'); }
      else     { await Transactions.add(data);               UI.toast('Buchung gespeichert ✓'); }
      UI.closeModal('add-modal');
      UI.render();
    } catch (err) {
      Debug.error('App', 'saveEntry fehlgeschlagen', err);
      UI.toast(err.message, 'error');
    }
  };

  const setEntryType = (type) => UI.setEntryType(type);

  // ── BUCHUNG BEARBEITEN ─────────────────────────────────────────
  const editTx = (id) => {
    const tx = State.get().transactions.find(t => t.id === id);
    if (!tx) { UI.toast('Buchung nicht gefunden', 'error'); return; }
    UI.openAddModal({ id:tx.id, type:tx.type, date:tx.date, store:tx.store, description:tx.description, amount:tx.amount, category:tx.category });
  };

  // ── BUCHUNG LÖSCHEN ────────────────────────────────────────────
  const deleteTx = async (id) => {
    if (!confirm('Buchung löschen?')) return;
    try { await Transactions.remove(id); UI.render(); UI.toast('Gelöscht'); }
    catch (err) { Debug.error('App', 'deleteTx fehlgeschlagen', err); UI.toast('Fehler beim Löschen', 'error'); }
  };

  // ── FILTER / SUCHE ─────────────────────────────────────────────
  const setFilter      = (cat)   => { State.set({ filterCat: cat }); UI.renderList(); };
  const setFilterScope = (scope) => { State.set({ filterScope: scope }); UI.renderList(); };
  const setSearch = (q)   => { State.set({ searchQuery: q }); UI.renderList(); };

  // ── ÜBERTRAG ───────────────────────────────────────────────────
  const editCarryOver = async () => {
    const key = State.get().currentMonth;
    const cur = Months.get(key).carryOver || 0;
    const val = prompt(`Übertrag für ${Utils.monthLabel(key)} (€):`, cur.toFixed(2));
    if (val === null) return;
    const amt = Utils.parseAmount(val);
    if (isNaN(amt)) { UI.toast('Ungültiger Betrag', 'error'); return; }
    try { await Months.setCarryOver(key, amt); UI.render(); UI.toast('Übertrag gespeichert ✓'); }
    catch (err) { UI.toast('Fehler beim Speichern', 'error'); }
  };

  // ── CSV IMPORT (Standard) ──────────────────────────────────────
  const handleCSVFile = async (input) => {
    const file = input?.files?.[0]; if (!file) return;
    if (input) input.value = '';
    await _processCSVFile(file);
  };

  const _processCSVFile = async (file) => {
    const resEl = document.getElementById('csv-result');
    if (!resEl) return;
    let text;
    try { text = await file.text(); }
    catch (e) { resEl.innerHTML = `<div class="error-box">❌ Datei konnte nicht gelesen werden.</div>`; return; }

    const result = CSV.parse(text);
    if (!result.ok) {
      const skipInfo = result.skippedRows?.length
        ? `<div class="warn-box" style="margin-top:8px">${result.skippedRows.slice(0,3).map(s=>Utils.escHtml(s.reason)).join(' · ')}</div>` : '';
      resEl.innerHTML = `<div class="error-box">❌ ${Utils.escHtml(result.msg)}</div>${skipInfo}`;
      return;
    }
    _showImportPreview(resEl, result, false);
  };

  // ── PARTNER-IMPORT ─────────────────────────────────────────────
  const handlePartnerFile = async (input) => {
    const file = input?.files?.[0]; if (!file) return;
    if (input) input.value = '';
    await _processPartnerFile(file);
  };

  const _processPartnerFile = async (file) => {
    const resEl = document.getElementById('partner-result');
    if (!resEl) return;
    let text;
    try { text = await file.text(); }
    catch (e) { resEl.innerHTML = `<div class="error-box">❌ Datei konnte nicht gelesen werden.</div>`; return; }

    const result = CSV.parse(text);
    if (!result.ok) {
      resEl.innerHTML = `<div class="error-box">❌ ${Utils.escHtml(result.msg)}</div>`;
      return;
    }
    // Partner-Import: Vorschau mit Merge-Hinweis
    _showImportPreview(resEl, result, true);
  };

  const _showImportPreview = (resEl, result, isPartner) => {
    const preview  = result.rows.slice(0, 5);
    const rowsJson = JSON.stringify(result.rows).replace(/"/g, '&quot;');
    const fn       = isPartner ? 'App.confirmPartnerImport' : 'App.confirmImport';
    const btnLabel = isPartner
      ? `🔀 ${result.rows.length} Buchungen zusammenführen`
      : `✓ Alle ${result.rows.length} importieren`;
    const hint = isPartner
      ? `<div class="info-box">🔀 Bereits vorhandene Buchungen werden übersprungen. Nur neue Einträge werden hinzugefügt.</div>`
      : '';

    resEl.innerHTML = `
      <div class="import-preview">
        ${hint}
        <div class="import-header">
          <strong>${result.rows.length}</strong> Buchungen erkannt
          ${result.skippedRows?.length ? `· <span class="warn">${result.skippedRows.length} übersprungen</span>` : ''}
        </div>
        <div class="tx-list">
          ${preview.map(t => `
            <div class="tx-row">
              <div class="tx-info">
                <div class="tx-store">${Utils.escHtml(t.store||'–')}${t.deviceId?`<span class="device-badge">${Utils.escHtml(t.deviceId)}</span>`:''}</div>
                <div class="tx-desc">${Utils.formatDate(t.date)}</div>
              </div>
              <div class="tx-right">
                <div class="tx-amt ${t.type==='expense'?'c-red':'c-green'}">
                  ${t.type==='expense'?'-':'+'}${Utils.formatMoney(t.amount)}
                </div>
              </div>
            </div>`).join('')}
        </div>
        ${result.rows.length > 5 ? `<div class="import-more">...und ${result.rows.length-5} weitere</div>` : ''}
        <button class="btn-primary" onclick="${fn}('${rowsJson}')">${btnLabel}</button>
      </div>`;
  };

  const confirmImport = async (rowsRaw) => {
    UI.setLoading(true);
    try {
      const rows   = typeof rowsRaw==='string' ? JSON.parse(rowsRaw) : rowsRaw;
      const result = await Transactions.importMany(rows);
      document.getElementById('csv-result').innerHTML =
        `<div class="success-box">✓ ${result.added} importiert${result.errors.length?` · ${result.errors.length} Fehler`:''}</div>`;
      UI.render(); UI.toast(`${result.added} Buchungen importiert ✓`);
    } catch (err) { UI.toast('Import fehlgeschlagen', 'error'); }
    finally { UI.setLoading(false); }
  };

  const confirmPartnerImport = async (rowsRaw) => {
    UI.setLoading(true);
    try {
      const rows   = typeof rowsRaw==='string' ? JSON.parse(rowsRaw) : rowsRaw;
      const result = await Transactions.mergeFromPartner(rows);

      // Ergebnis-Zusammenfassung mit allen drei Fällen
      const parts = [];
      if (result.added   > 0) parts.push(`✓ ${result.added} neue Buchungen hinzugefügt`);
      if (result.updated > 0) parts.push(`🔄 ${result.updated} Buchungen aktualisiert`);
      if (result.skipped > 0) parts.push(`⏭ ${result.skipped} bereits aktueller – unverändert`);
      if (result.tieBreakCount > 0) parts.push(`⚖️ ${result.tieBreakCount} Konflikt${result.tieBreakCount > 1 ? 'e' : ''} per Tie-Break entschieden`);
      if (result.errors.length)     parts.push(`⚠️ ${result.errors.length} Fehler`);

      const hasChanges = result.added > 0 || result.updated > 0;
      const box = hasChanges ? 'success-box' : 'warn-box';
      const msg = parts.length ? parts.join('<br>') : 'Keine Änderungen – alles bereits aktuell.';

      document.getElementById('partner-result').innerHTML = `<div class="${box}">${msg}</div>`;

      UI.render();
      const toastParts = [
        result.added          ? `${result.added} neu`              : '',
        result.updated        ? `${result.updated} aktualisiert`   : '',
        result.tieBreakCount  ? `${result.tieBreakCount} Tie-Break` : '',
      ].filter(Boolean);
      if (toastParts.length) UI.toast(`Merge: ${toastParts.join(', ')} ✓`);
      else                   UI.toast('Alles bereits aktuell ✓');
    } catch (err) {
      Debug.error('App', 'confirmPartnerImport', err);
      UI.toast('Merge fehlgeschlagen', 'error');
    }
    finally { UI.setLoading(false); }
  };

  // ── PARTNER-EXPORT ─────────────────────────────────────────────
  const exportForPartner = () => {
    const txs  = State.get().transactions;
    const name = State.get().deviceName || 'Haushalt';
    if (!txs.length) { UI.toast('Keine Daten vorhanden', 'error'); return; }
    CSV.exportForPartner(txs, name);
    UI.toast(`${txs.length} Buchungen für Partner exportiert ✓`);
  };

  // ── GERÄT EINRICHTEN ───────────────────────────────────────────
  const openDeviceSettings = () => {
    const nameEl = document.getElementById('device-name-input');
    if (nameEl) nameEl.value = State.get().deviceName || '';
    const idEl = document.getElementById('device-id-display');
    if (idEl) idEl.textContent = (State.get().deviceId || '').slice(0, 16) + '...';
    UI.openModal('device-modal');
  };

  const saveDeviceName = async () => {
    const name = document.getElementById('device-name-input')?.value?.trim() || '';
    if (!name) { UI.toast('Bitte Namen eingeben', 'error'); return; }
    await Storage.setDeviceName(name);
    State.set({ deviceName: name });
    UI.toast(`Gerät gespeichert: ${name} ✓`);
    UI.closeModal('device-modal');
    UI.render();
  };

  // ── EXPORT ────────────────────────────────────────────────────
  const exportCSV = () => {
    const txs = State.get().transactions;
    if (!txs.length) { UI.toast('Keine Daten vorhanden', 'error'); return; }
    CSV.exportAll(txs); UI.toast(`${txs.length} Buchungen exportiert ✓`);
  };

  const exportPDF = () => {
    try { PDF.exportMonth(State.get().currentMonth, State.get().transactions); }
    catch (err) { Debug.error('App', 'exportPDF', err); UI.toast('PDF fehlgeschlagen', 'error'); }
  };

  // ── BON SCAN ──────────────────────────────────────────────────
  const handleScan = async (input) => {
    const file = input?.files?.[0]; if (!file) return; if (input) input.value = '';
    const resEl = document.getElementById('scan-result-wrap');
    if (resEl) resEl.innerHTML = `<div class="scan-loading"><div class="spinner"></div><div id="scan-pct">Lade OCR-Engine...</div></div>`;
    try {
      const result = await OCR.scan(file, pct => {
        const el = document.getElementById('scan-pct');
        if (el) el.textContent = `Lese Bon... ${pct}%`;
      });
      UI.showScanResult(result);
    } catch (err) {
      if (resEl) resEl.innerHTML = `<div class="error-box">❌ ${Utils.escHtml(err.message)}</div>`;
    }
  };

  const saveScanItems = async (count, date, store) => {
    const items = [];
    for (let i = 0; i < count; i++) {
      const desc = document.getElementById(`si-desc-${i}`)?.value || '';
      const cat  = document.getElementById(`si-cat-${i}`)?.value  || 'sonstiges';
      const amt  = parseFloat(document.getElementById(`si-amt-${i}`)?.value || '0');
      if (amt > 0) items.push({ desc, amount: amt, cat });
    }
    if (!items.length) { UI.toast('Keine Positionen', 'error'); return; }
    const total = Math.round(items.reduce((s,i) => s+i.amount, 0) * 100) / 100;
    try {
      await Transactions.add({ type:'expense', date, store, description:`Einkauf (${items.length} Positionen)`, amount:total, category:'lebensmittel', items });
      document.getElementById('scan-result-wrap').innerHTML = `<div class="success-box">✓ ${items.length} Positionen gespeichert</div>`;
      UI.render(); UI.toast(`${items.length} Positionen gespeichert ✓`);
    } catch (err) { UI.toast(err.message, 'error'); }
  };

  const saveScanTotal = async () => {
    const amt   = parseFloat(document.getElementById('scan-total-amt')?.value  || '0');
    const date  = document.getElementById('scan-total-date')?.value  || Utils.todayISO();
    const store = document.getElementById('scan-total-store')?.value || 'Bon-Scan';
    try {
      await Transactions.add({ type:'expense', date, store, description:'Kassenbon', amount:amt });
      document.getElementById('scan-result-wrap').innerHTML = '<div class="success-box">✓ Buchung gespeichert</div>';
      UI.render(); UI.toast('Buchung gespeichert ✓');
    } catch (err) { UI.toast(err.message, 'error'); }
  };

  // ── ALLE DATEN LÖSCHEN ────────────────────────────────────────
  const clearAll = async () => {
    if (!confirm('ALLE Daten löschen? Nicht rückgängig machbar.')) return;
    if (!confirm('Wirklich alle Buchungen und Monatsdaten permanent löschen?')) return;
    try {
      await Storage.clearStore('transactions'); await Storage.clearStore('months');
      State.setTransactions([]); State.setMonths({});
      State.setCurrentMonth(Utils.monthKey(Utils.todayISO()));
      UI.render(); UI.toast('Alle Daten gelöscht');
    } catch (err) { UI.toast('Fehler beim Löschen', 'error'); }
  };

  // Verpflichtung als bezahlt markieren + echte Ausgabe erzeugen
  const markObligationPaid = async (id) => {
    const tx = State.get().transactions.find(t => t.id === id);
    if (!tx) return;
    try {
      // Status auf paid setzen
      await Transactions.update({ ...tx, status: 'paid' });
      // Echte Hauptbuch-Ausgabe erzeugen
      await Transactions.add({
        type:        'expense',
        date:        Utils.todayISO(),
        store:       tx.store,
        description: `Verpflichtung bezahlt: ${tx.description||tx.store}`,
        amount:      tx.amount,
        category:    tx.category,
        flowScope:   'main',
        taxRelevant: tx.taxRelevant,
        taxType:     tx.taxType,
      });
      UI.render();
      UI.toast('Als bezahlt markiert und in Hauptbuch gebucht ✓');
    } catch (err) {
      Debug.error('App', 'markObligationPaid', err);
      UI.toast(err.message, 'error');
    }
  };

  return {
    init,
    saveEntry, setEntryType, editTx, deleteTx,
    setFilter, setFilterScope, setSearch, editCarryOver,
    handleCSVFile, confirmImport,
    handlePartnerFile, confirmPartnerImport, exportForPartner,
    openDeviceSettings, saveDeviceName,
    exportCSV, exportPDF,
    handleScan, saveScanItems, saveScanTotal,
    markObligationPaid,
    clearAll,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
