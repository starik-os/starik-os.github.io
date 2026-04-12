// validation.js – Eingabeprüfung
const Validation = (() => {

  const amount = (val) => {
    const n = Utils.parseAmount(val);
    if (isNaN(n) || n <= 0) return { ok: false, msg: 'Betrag muss größer als 0 sein.' };
    if (n > 999999) return { ok: false, msg: 'Betrag zu groß.' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  };

  const date = (val) => {
    if (!val) return { ok: false, msg: 'Datum ist erforderlich.' };
    const iso = Utils.toISODate(val) || val;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, msg: 'Ungültiges Datum.' };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { ok: false, msg: 'Ungültiges Datum.' };
    if (d.getFullYear() < 2000 || d.getFullYear() > 2099) return { ok: false, msg: 'Datum außerhalb des gültigen Bereichs.' };
    return { ok: true, value: iso };
  };

  const required = (val, name) => {
    if (!val || !String(val).trim()) return { ok: false, msg: `${name} ist erforderlich.` };
    return { ok: true, value: String(val).trim() };
  };

  const transaction = (data) => {
    const errors = [];

    const amtR = amount(data.amount);
    if (!amtR.ok) errors.push(amtR.msg);

    const dateR = date(data.date);
    if (!dateR.ok) errors.push(dateR.msg);

    if (!data.type || !['expense', 'income'].includes(data.type)) errors.push('Ungültiger Typ.');

    if (errors.length) return { ok: false, errors };

    return {
      ok: true,
      value: {
        id: data.id || Utils.uid(),
        type: data.type,
        date: dateR.value,
        amount: amtR.value,
        store: String(data.store || '').trim().slice(0, 100),
        description: String(data.description || '').trim().slice(0, 200),
        category: data.category || 'sonstiges',
      }
    };
  };

  return { amount, date, required, transaction };
})();
