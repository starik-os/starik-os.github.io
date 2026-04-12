// csv.js – CSV Import/Export
const CSV = (() => {

  // ── IMPORT ─────────────────────────────────────────────────────
  const detectSeparator = (text) => text.includes(';') ? ';' : ',';

  const detectBankFormat = (headers) => {
    const h = headers.map(s => s.toLowerCase());
    if (h.some(s => s.includes('buchungstag') || s.includes('buchungsdatum'))) return 'sparkasse';
    if (h.some(s => s.includes('wertstellung') && s.includes('verwendungszweck'))) return 'dkb';
    if (h.some(s => s.includes('buchungstext') && s.includes('betrag'))) return 'n26';
    if (h.some(s => s.includes('datum') && s.includes('umsatz'))) return 'generic';
    return 'generic';
  };

  const findColIndex = (headers, ...terms) => {
    const h = headers.map(s => s.toLowerCase().trim());
    for (const term of terms) {
      const idx = h.findIndex(s => s.includes(term));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const parseDate = (str) => {
    if (!str) return '';
    str = str.trim();
    // dd.mm.yyyy
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
      const [d, m, y] = str.split('.');
      return `${y}-${m}-${d}`;
    }
    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // dd/mm/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [d, m, y] = str.split('/');
      return `${y}-${m}-${d}`;
    }
    return '';
  };

  const parseCSVLine = (line, sep) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === sep && !inQuote) {
        result.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const parse = (text) => {
    const sep = detectSeparator(text);
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { ok: false, msg: 'Datei leer oder kein gültiges Format.' };

    const headers = parseCSVLine(lines[0], sep);
    const format = detectBankFormat(headers);
    Debug.log('CSV', `Detected format: ${format}, sep: '${sep}', headers:`, headers);

    const dateCol = findColIndex(headers, 'buchungstag', 'buchungsdatum', 'datum', 'date', 'wertstellung');
    const descCol = findColIndex(headers, 'verwendungszweck', 'buchungstext', 'empfänger', 'zahlungsempfänger', 'beschreibung', 'text', 'reference');
    const amtCol  = findColIndex(headers, 'betrag', 'amount', 'umsatz', 'summe', 'wert');

    if (amtCol < 0) return { ok: false, msg: 'Betrag-Spalte nicht gefunden.' };

    const rows = [];
    const skipped = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], sep);
      if (cols.length < 2 || cols.every(c => !c)) continue;

      const rawAmt = amtCol < cols.length ? cols[amtCol] : '';
      const amt = Utils.parseAmount(rawAmt);
      if (!amt || isNaN(amt)) { skipped.push(i + 1); continue; }

      const rawDate = dateCol >= 0 && dateCol < cols.length ? cols[dateCol] : '';
      const isoDate = parseDate(rawDate);
      if (!isoDate) { skipped.push(i + 1); continue; }

      const rawDesc = descCol >= 0 && descCol < cols.length ? cols[descCol] : '';
      const desc = rawDesc.replace(/\s+/g, ' ').trim().slice(0, 200);
      const type = rawAmt.trim().startsWith('-') ? 'expense' : 'income';

      rows.push({
        id: Utils.uid(),
        type,
        date: isoDate,
        amount: Math.abs(amt),
        store: desc.slice(0, 50),
        description: desc,
        category: 'sonstiges',
      });
    }

    Debug.log('CSV', `Parsed ${rows.length} rows, skipped ${skipped.length}`);
    return { ok: true, rows, skipped, format };
  };

  // ── EXPORT ─────────────────────────────────────────────────────
  const exportAll = (transactions) => {
    const header = ['Datum', 'Laden', 'Beschreibung', 'Kategorie', 'Typ', 'Betrag'];
    const rows = transactions
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(t => {
        const cat = Categories.getById(t.category);
        return [
          Utils.formatDate(t.date),
          t.store,
          t.description,
          cat ? cat.name : t.category,
          t.type === 'expense' ? 'Ausgabe' : 'Einnahme',
          (t.type === 'expense' ? '-' : '') + t.amount.toFixed(2).replace('.', ',')
        ];
      });

    const csvContent = [header, ...rows]
      .map(row => row.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `haushalt_export_${Utils.todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Debug.log('CSV', `Exported ${transactions.length} rows`);
  };

  return { parse, exportAll };
})();
