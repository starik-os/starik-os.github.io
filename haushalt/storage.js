// storage.js – IndexedDB Layer – final gehärtet
const Storage = (() => {

  const DB_NAME    = 'haushalt_db';
  const DB_VERSION = 2;

  let _db          = null;
  let _openPromise = null;

  // ── OPEN ────────────────────────────────────────────────────────
  const open = () => {
    if (_db) return Promise.resolve(_db);
    if (_openPromise) return _openPromise;

    if (!window.indexedDB) {
      return Promise.reject(new Error('IndexedDB nicht verfügbar.'));
    }

    _openPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        Debug.log('Storage', `DB upgrade v${e.oldVersion} -> v${DB_VERSION}`);

        if (!db.objectStoreNames.contains('transactions')) {
          const ts = db.createObjectStore('transactions', { keyPath: 'id' });
          ts.createIndex('date',     'date',     { unique: false });
          ts.createIndex('type',     'type',     { unique: false });
          ts.createIndex('category', 'category', { unique: false });
        } else {
          const ts = e.target.transaction.objectStore('transactions');
          if (!ts.indexNames.contains('date'))     ts.createIndex('date',     'date',     { unique: false });
          if (!ts.indexNames.contains('type'))     ts.createIndex('type',     'type',     { unique: false });
          if (!ts.indexNames.contains('category')) ts.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains('months'))   db.createObjectStore('months',   { keyPath: 'id'  });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };

      req.onsuccess = (e) => {
        _db = e.target.result;
        _db.onversionchange = () => { _db.close(); _db = null; _openPromise = null; };
        _db.onerror = (ev) => Debug.error('Storage', 'DB-Laufzeitfehler', ev.target.error);
        Debug.log('Storage', `DB geöffnet: ${DB_NAME} v${DB_VERSION}`);
        _openPromise = null;
        resolve(_db);
      };

      req.onerror  = (e) => { _openPromise = null; Debug.error('Storage', 'DB öffnen fehlgeschlagen', e.target.error); reject(e.target.error); };
      req.onblocked = () => Debug.warn('Storage', 'DB-Upgrade blockiert');
    });

    return _openPromise;
  };

  const _tx = (storeNames, mode) => {
    if (!_db) throw new Error('DB nicht geöffnet.');
    return _db.transaction(storeNames, mode || 'readonly');
  };

  // ── CRUD ────────────────────────────────────────────────────────
  const get = (storeName, key) => new Promise((resolve, reject) => {
    try {
      const t = _tx(storeName); const req = t.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror   = () => { Debug.error('Storage', `get(${storeName})`, req.error); reject(req.error); };
      t.onerror     = () => reject(t.error);
      t.onabort     = () => reject(t.error || new Error('aborted'));
    } catch (err) { reject(err); }
  });

  const getAll = (storeName) => new Promise((resolve, reject) => {
    try {
      const t = _tx(storeName); const req = t.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
      t.onerror     = () => reject(t.error);
    } catch (err) { reject(err); }
  });

  const put = (storeName, value) => new Promise((resolve, reject) => {
    if (!value) { reject(new Error(`put(${storeName}): kein Wert`)); return; }
    try {
      const t = _tx(storeName, 'readwrite'); t.objectStore(storeName).put(value);
      t.oncomplete = () => resolve();
      t.onerror    = () => { Debug.error('Storage', `put(${storeName})`, t.error); reject(t.error); };
      t.onabort    = () => reject(t.error || new Error('aborted'));
    } catch (err) { reject(err); }
  });

  const remove = (storeName, key) => new Promise((resolve, reject) => {
    try {
      const t = _tx(storeName, 'readwrite'); t.objectStore(storeName).delete(key);
      t.oncomplete = () => resolve();
      t.onerror    = () => reject(t.error);
      t.onabort    = () => reject(t.error || new Error('aborted'));
    } catch (err) { reject(err); }
  });
  const deleteRecord = remove;

  const clearStore = (storeName) => new Promise((resolve, reject) => {
    try {
      const t = _tx(storeName, 'readwrite'); t.objectStore(storeName).clear();
      t.oncomplete = () => { Debug.log('Storage', `Store geleert: ${storeName}`); resolve(); };
      t.onerror    = () => reject(t.error);
    } catch (err) { reject(err); }
  });

  // ── PUT MANY (atomare Batch-Transaktion) ────────────────────────
  const putMany = (storeName, items) => new Promise((resolve, reject) => {
    if (!items || !items.length) { resolve(0); return; }
    try {
      const t = _tx(storeName, 'readwrite'); const os = t.objectStore(storeName);
      t.oncomplete = () => resolve(items.length);
      t.onerror    = () => { Debug.error('Storage', `putMany(${storeName})`, t.error); reject(t.error); };
      t.onabort    = () => reject(t.error || new Error('aborted'));
      for (const item of items) {
        const req = os.put(item);
        req.onerror = (ev) => Debug.error('Storage', 'putMany item fehlgeschlagen', ev.target.error);
      }
    } catch (err) { reject(err); }
  });

  const getAllByIndex = (storeName, indexName, value) => new Promise((resolve, reject) => {
    try {
      const t = _tx(storeName); const req = t.objectStore(storeName).index(indexName).getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    } catch (err) { reject(err); }
  });

  // ── MIGRATIONS-MARKER ───────────────────────────────────────────
  const isMigrated  = async () => { try { return !!(await get('settings', '__migrated_v1__')); } catch(e) { return false; } };
  const setMigrated = async () => { await put('settings', { key: '__migrated_v1__', value: true, ts: Date.now() }); };

  // ── GERÄTEVERWALTUNG ────────────────────────────────────────────
  // deviceId: einmalig generiert, eindeutig pro Gerät
  // deviceName: frei wählbar (z.B. "Danni" oder "Jenny")

  const getDeviceId = async () => {
    try {
      const rec = await get('settings', '__device_id__');
      if (rec && rec.value) return rec.value;
      const newId = Utils.uuid();
      await put('settings', { key: '__device_id__', value: newId });
      Debug.log('Storage', `Neue deviceId generiert: ${newId}`);
      return newId;
    } catch (e) {
      Debug.warn('Storage', 'getDeviceId fehlgeschlagen', e);
      return 'local';
    }
  };

  const getDeviceName = async () => {
    try { const rec = await get('settings', '__device_name__'); return rec ? rec.value : ''; }
    catch (e) { return ''; }
  };

  const setDeviceName = async (name) => {
    await put('settings', { key: '__device_name__', value: String(name).trim().slice(0, 20) });
  };

  return {
    open,
    get, getAll, put, remove, deleteRecord, clearStore,
    putMany, getAllByIndex,
    isMigrated, setMigrated,
    getDeviceId, getDeviceName, setDeviceName,
  };
})();
