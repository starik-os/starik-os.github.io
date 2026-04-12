// storage.js – IndexedDB Layer
const Storage = (() => {
  const DB_NAME = 'haushalt_db';
  const DB_VERSION = 2;
  let db = null;

  const open = () => new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('transactions')) {
        const ts = d.createObjectStore('transactions', { keyPath: 'id' });
        ts.createIndex('date', 'date', { unique: false });
        ts.createIndex('type', 'type', { unique: false });
        ts.createIndex('category', 'category', { unique: false });
      }
      if (!d.objectStoreNames.contains('months')) {
        d.createObjectStore('months', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
      Debug.log('Storage', 'DB upgrade complete');
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => { Debug.error('Storage', 'DB open failed', e.target.error); reject(e.target.error); };
  });

  const tx = (stores, mode = 'readonly') => {
    const t = db.transaction(stores, mode);
    return t;
  };

  const get = (store, key) => new Promise((resolve, reject) => {
    const req = tx(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const getAll = (store) => new Promise((resolve, reject) => {
    const req = tx(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const put = (store, obj) => new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').objectStore(store).put(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const remove = (store, key) => new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  const putMany = (store, items) => new Promise((resolve, reject) => {
    const t = tx(store, 'readwrite');
    const os = t.objectStore(store);
    let done = 0;
    if (!items.length) { resolve(0); return; }
    items.forEach(item => {
      const req = os.put(item);
      req.onsuccess = () => { done++; if (done === items.length) resolve(done); };
      req.onerror = () => reject(req.error);
    });
  });

  const clearStore = (store) => new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  const getAllByIndex = (store, index, value) => new Promise((resolve, reject) => {
    const req = tx(store).objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  return { open, get, getAll, put, remove, putMany, clearStore, getAllByIndex };
})();
