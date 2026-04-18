// validation.js – Eingabeprüfung
const Validation = (() => {

  const FLOW_SCOPES = ['main', 'side', 'reserve', 'obligation'];
  const STATUSES    = ['open', 'paid', 'cancelled'];

  const amount = (val) => {
    const n = Utils.parseAmount(val);
    if (isNaN(n) || n <= 0)   return { ok: false, msg: 'Betrag muss größer als 0 sein.' };
    if (n > 999999.99)         return { ok: false, msg: 'Betrag zu groß (max. 999.999,99 €).' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  };

  const date = (val) => {
    if (!val) return { ok: false, msg: 'Datum ist erforderlich.' };
    let iso = Utils.toISODate(String(val).trim()) || String(val).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, msg: 'Ungültiges Datumsformat.' };
    const [y, m, d] = iso.split('-').map(Number);
    if (m < 1 || m > 12) return { ok: false, msg: `Ungültiger Monat: ${m}.` };
    if (y < 2000 || y > 2099) return { ok: false, msg: `Jahr außerhalb gültigem Bereich: ${y}.` };
    const maxDay = new Date(y, m, 0).getDate();
    if (d < 1 || d > maxDay) return { ok: false, msg: `Ungültiger Tag ${d} (max. ${maxDay}).` };
    return { ok: true, value: iso };
  };

  const required = (val, name) => {
    if (!val || !String(val).trim()) return { ok: false, msg: `${name} ist erforderlich.` };
    return { ok: true, value: String(val).trim() };
  };

  const transaction = (data) => {
    const errors = [];
    if (!data.type || !['expense', 'income'].includes(data.type)) errors.push('Typ muss "expense" oder "income" sein.');
    const amtR  = amount(data.amount);
    if (!amtR.ok) errors.push(amtR.msg);
    const dateR = date(data.date);
    if (!dateR.ok) errors.push(dateR.msg);
    if (errors.length) return { ok: false, errors };

    // flowScope: Abwärtskompatibel – fehlend = 'main'
    let flowScope = String(data.flowScope || 'main');
    if (!FLOW_SCOPES.includes(flowScope)) flowScope = 'main';

    // status: nur relevant bei obligation oder fixkosten
    let status = String(data.status || '');
    if (!STATUSES.includes(status)) status = '';

    // taxRelevant
    const taxRelevant = data.taxRelevant === true || data.taxRelevant === 'true';
    const taxType     = String(data.taxType || '').trim().slice(0, 50);

    // Kategorie
    let category = String(data.category || '').trim();
    if (!category) category = 'sonstiges';

    return {
      ok: true,
      value: {
        id:          data.id || Utils.uid(),
        type:        data.type,
        date:        dateR.value,
        amount:      amtR.value,
        store:       String(data.store       || '').trim().slice(0, 100),
        description: String(data.description || '').trim().slice(0, 200),
        category,
        flowScope,
        status:      status || undefined,
        taxRelevant: taxRelevant || undefined,
        taxType:     taxType    || undefined,
      },
    };
  };

  return { amount, date, required, transaction, FLOW_SCOPES, STATUSES };
})();
