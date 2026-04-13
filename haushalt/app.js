// app.js – Initialisierung + Event Controller
const App = (() => {

  // ── INIT ──────────────────────────────────────────────────────
  const init = async () => {
    Debug.init();
    Debug.log('App', 'Initializing...');
    UI.setLoading(true);

    try {
      await Storage.open();
      await Categories.load();
      await Months.loadAll();
      await Transactions.loadAll();

      // Seed-Daten aus altem localStorage (Migration)
      await migrateFromOld();

      State.set({ initialized: true });
      UI.render();

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
          .then(() => Debug.log('App', 'SW registered'))
          .catch(e => Debug.warn('App', 'SW failed', e));
      }

      Debug.log('App', `Init complete. ${State.get().transactions.length} transactions loaded.`);
    } catch (err) {
      Debug.error('App', 'Init failed', err);
      UI.toast('Fehler beim Laden der App.', 'error');
    } finally {
      UI.setLoading(false);
    }
  };

  // Migration von localStorage (ältere Version)
  const migrateFromOld = async () => {
    const oldTx = localStorage.getItem('hh_tx');
    if (!oldTx) return;
    try {
      const txs = JSON.parse(oldTx);
      const inc = JSON.parse(localStorage.getItem('hh_inc') || '[]');
      if (!txs.length && !inc.length) return;

      const all = [
        ...txs.map(t => ({ ...t, type: 'expense', description: t.desc || '', store: t.store || '' })),
        ...inc.map(t => ({ ...t, type: 'income', store: '', description: t.desc || '' }))
      ];

      const result = await Transactions.importMany(all);
      Debug.log('App', `Migrated ${result.added} transactions from localStorage`);
      localStorage.removeItem('hh_tx');
      localStorage.removeItem('hh_inc');
      localStorage.removeItem('mm_state');
      UI.toast(`${result.added} Buchungen aus alter Version migriert ✓`);
    } catch (e) {
      Debug.warn('App', 'Migration failed', e);
    }
  };

  // ── ADD TRANSACTION ────────────────────────────────────────────
  const saveEntry = async () => {
    const typeEl = document.querySelector('.type-btn.on');
    const type = typeEl ? typeEl.dataset.type : 'expense';
    const id = document.getElementById('f-edit-id')?.value;

    const data = {
      id: id || undefined,
      type,
      date: document.getElementById('f-date').value,
      store: document.getElementById('f-store').value,
      description: document.getElementById('f-desc').value,
      amount: document.getElementById('f-amt').value,
      category: document.getElementById('f-cat').value,
    };

    try {
      if (id) {
        await Transactions.update({ ...data, id });
        UI.toast('Buchung aktualisiert ✓');
      } else {
        await Transactions.add(data);
        UI.toast('Buchung gespeichert ✓');
      }
      UI.closeModal('add-modal');
      UI.render();
    } catch (err) {
      UI.toast(err.message, 'error');
      Debug.error('App', 'Save entry failed', err);
    }
  };

  const setEntryType = (type) => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('on', b.dataset.type === type));
    const storeWrap = document.getElementById('f-store-wrap');
    if (storeWrap) storeWrap.style.display = type === 'expense' ? '' : 'none';
  };

  const deleteTx = async (id) => {
    if (!confirm('Buchung löschen?')) return;
    try {
      await Transactions.remove(id);
      UI.render();
      UI.toast('Gelöscht');
    } catch (err) {
      UI.toast('Fehler beim Löschen', 'error');
    }
  };

  // ── FILTER ─────────────────────────────────────────────────────
  const setFilter = (cat) => {
    State.set({ filterCat: cat });
    UI.renderList();
  };

  const setSearch = (q) => {
    State.set({ searchQuery: q });
    UI.renderList();
  };

  // ── MONTH CARRY OVER ───────────────────────────────────────────
  const editCarryOver = async () => {
    const key = State.get().currentMonth;
    const cur = Months.get(key).carryOver || 0;
    const val = prompt(`Übertrag für ${Utils.monthLabel(key)} (€):`, cur.toFixed(2));
    if (val === null) return;
    const amt = Utils.parseAmount(val);
    if (isNaN(amt)) { UI.toast('Ungültiger Betrag', 'error'); return; }
    await Months.setCarryOver(key, amt);
    UI.render();
    UI.toast('Übertrag gespeichert ✓');
  };

  // ── CSV IMPORT ─────────────────────────────────────────────────
  const handleCSVFile = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const result = CSV.parse(text);
    input.value = '';

    const resEl = document.getElementById('csv-result');
    if (!result.ok) {
      resEl.innerHTML = `<div class="error-box">❌ ${Utils.escHtml(result.msg)}</div>`;
      return;
    }

    if (!result.rows.length) {
      resEl.innerHTML = `<div class="warn-box">⚠️ Keine importierbaren Zeilen gefunden.</div>`;
      return;
    }

    const preview = result.rows.slice(0, 5);
    resEl.innerHTML = `
      <div class="import-preview">
        <div class="import-header">
          <strong>${result.rows.length}</strong> Buchungen gefunden
          ${result.skipped.length ? `· <span class="warn">${result.skipped.length} übersprungen</span>` : ''}
        </div>
        <div class="tx-list">
          ${preview.map(t => UI.txRowHTML(t, false)).join('')}
        </div>
        ${result.rows.length > 5 ? `<div class="import-more">...und ${result.rows.length - 5} weitere</div>` : ''}
        <button class="btn-primary" onclick="App.confirmImport(${JSON.stringify(result.rows).replace(/"/g, '&quot;')})">
          ✓ Alle ${result.rows.length} importieren
        </button>
      </div>`;
  };

  const confirmImport = async (rows) => {
    UI.setLoading(true);
    try {
      const result = await Transactions.importMany(rows);
      document.getElementById('csv-result').innerHTML =
        `<div class="success-box">✓ ${result.added} Buchungen importiert${result.errors.length ? ` · ${result.errors.length} Fehler` : ''}</div>`;
      UI.render();
      UI.toast(`${result.added} Buchungen importiert ✓`);
    } catch (err) {
      UI.toast('Import fehlgeschlagen', 'error');
    } finally {
      UI.setLoading(false);
    }
  };

  // ── CSV EXPORT ─────────────────────────────────────────────────
  const exportCSV = () => {
    const txs = State.get().transactions;
    if (!txs.length) { UI.toast('Keine Daten zum Exportieren', 'error'); return; }
    CSV.exportAll(txs);
    UI.toast(`${txs.length} Buchungen exportiert ✓`);
  };

  // ── PDF EXPORT ─────────────────────────────────────────────────
  const exportPDF = () => {
    const key = State.get().currentMonth;
    const txs = State.get().transactions;
    PDF.exportMonth(key, txs);
  };

  // ── BON SCAN ───────────────────────────────────────────────────
  const handleScan = async (input) => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    const resEl = document.getElementById('scan-result-wrap');
    resEl.innerHTML = '<div class="scan-loading"><div class="spinner"></div><div id="scan-pct">Lade OCR...</div></div>';

    try {
      const result = await OCR.scan(file, (pct) => {
        const el = document.getElementById('scan-pct');
        if (el) el.textContent = `Lese Bon... ${pct}%`;
      });
      UI.showScanResult(result);
    } catch (err) {
      resEl.innerHTML = `<div class="error-box">❌ ${Utils.escHtml(err.message)}</div>`;
    }
  };

  const saveScanItems = async (count, date, store) => {
    let saved = 0;
    for (let i = 0; i < count; i++) {
      const desc = document.getElementById(`si-desc-${i}`)?.value || '';
      const cat  = document.getElementById(`si-cat-${i}`)?.value || 'sonstiges';
      const amt  = parseFloat(document.getElementById(`si-amt-${i}`)?.value || '0');
      if (amt > 0) {
        try {
          await Transactions.add({ type: 'expense', date, store, description: desc, amount: amt, category: cat });
          saved++;
        } catch (e) { Debug.warn('App', 'Scan item save failed', e); }
      }
    }
    document.getElementById('scan-result-wrap').innerHTML = `<div class="success-box">✓ ${saved} Positionen gespeichert</div>`;
    UI.render();
    UI.toast(`${saved} Positionen gespeichert ✓`);
  };

  const saveScanTotal = async () => {
    const amt   = parseFloat(document.getElementById('scan-total-amt')?.value || '0');
    const date  = document.getElementById('scan-total-date')?.value || Utils.todayISO();
    const store = document.getElementById('scan-total-store')?.value || 'Bon-Scan';
    try {
      await Transactions.add({ type: 'expense', date, store, description: 'Kassenbon', amount: amt });
      document.getElementById('scan-result-wrap').innerHTML = '<div class="success-box">✓ Buchung gespeichert</div>';
      UI.render();
      UI.toast('Buchung gespeichert ✓');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  };

  // ── DATA MANAGEMENT ────────────────────────────────────────────
  const clearAll = async () => {
    if (!confirm('ALLE Daten löschen? Dies kann nicht rückgängig gemacht werden.')) return;
    if (!confirm('Wirklich? Alle Buchungen werden permanent gelöscht.')) return;
    await Storage.clearStore('transactions');
    await Storage.clearStore('months');
    State.setTransactions([]);
    State.setMonths({});
    UI.render();
    UI.toast('Alle Daten gelöscht');
  };

  return {
    init, saveEntry, setEntryType, deleteTx, setFilter, setSearch,
    editCarryOver, handleCSVFile, confirmImport, exportCSV, exportPDF,
    handleScan, saveScanItems, saveScanTotal, clearAll
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
