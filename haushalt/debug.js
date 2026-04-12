// debug.js – Logging System
const Debug = (() => {
  let enabled = false;

  const init = () => {
    enabled = localStorage.getItem('hh_debug') === '1';
  };

  const enable = () => {
    enabled = true;
    localStorage.setItem('hh_debug', '1');
    log('DEBUG', 'Debug-Modus aktiviert');
  };

  const disable = () => {
    enabled = false;
    localStorage.removeItem('hh_debug');
  };

  const log = (module, msg, data) => {
    if (!enabled) return;
    const ts = new Date().toISOString().slice(11, 23);
    if (data !== undefined) {
      console.log(`[${ts}][${module}] ${msg}`, data);
    } else {
      console.log(`[${ts}][${module}] ${msg}`);
    }
  };

  const warn = (module, msg, data) => {
    const ts = new Date().toISOString().slice(11, 23);
    if (data !== undefined) {
      console.warn(`[${ts}][${module}] ⚠️ ${msg}`, data);
    } else {
      console.warn(`[${ts}][${module}] ⚠️ ${msg}`);
    }
  };

  const error = (module, msg, err) => {
    const ts = new Date().toISOString().slice(11, 23);
    console.error(`[${ts}][${module}] ❌ ${msg}`, err || '');
  };

  return { init, enable, disable, log, warn, error };
})();
