// utils.js – Hilfsfunktionen
const Utils = (() => {

  const formatMoney = (n) => {
    if (isNaN(n) || n === null || n === undefined) return '0,00 €';
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

  const toISODate = (str) => {
    if (!str) return '';
    // dd.mm.yyyy → yyyy-mm-dd
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
      const [d, m, y] = str.split('.');
      return `${y}-${m}-${d}`;
    }
    // already iso
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    return '';
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const monthKey = (iso) => iso ? iso.slice(0, 7) : '';

  const monthLabel = (key) => {
    if (!key) return '';
    const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const [y, m] = key.split('-');
    return `${months[parseInt(m) - 1]} ${y}`;
  };

  const parseAmount = (str) => {
    if (typeof str === 'number') return Math.abs(str);
    str = String(str || '').trim().replace(/\s/g, '');
    // German: 1.234,56 → 1234.56
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(str)) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(',', '.');
    }
    const n = parseFloat(str);
    return isNaN(n) ? 0 : Math.abs(n);
  };

  const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Einfacher UUID-Generator (RFC4122 v4 kompatibel)
  const uuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };

  // uid() nutzt deviceId-Präfix sobald verfügbar (wird von Storage.getDeviceId gesetzt)
  let _devicePrefix = 'local';
  const setDevicePrefix = (prefix) => { _devicePrefix = prefix || 'local'; };
  const uid = () => `${_devicePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const daysInMonth = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };

  const sortDesc = (arr, key) => [...arr].sort((a, b) => (b[key] || '').localeCompare(a[key] || ''));

  return { formatMoney, formatDate, toISODate, todayISO, monthKey, monthLabel, parseAmount, escHtml, uid, uuid, setDevicePrefix, daysInMonth, sortDesc };
})();
