// csv.js – CSV Import/Export – robust, mit deviceId-Unterstützung
const CSV = (() => {

  // ── SEPARATOR ERKENNUNG ─────────────────────────────────────────
  const detectSeparator = (text) => {
    const candidates = [';', ',', '\t'];
    const lines = text.split(/\r?\n/).slice(0, 5).filter(l => l.trim());
    const scores = {};
    for (const sep of candidates) {
      const counts = lines.map(l => l.split(sep).length - 1);
      const min = Math.min(...counts), max = Math.max(...counts);
      scores[sep] = min >= 1 && max - min <= 2 ? counts[0] : 0;
    }
    const best = candidates.reduce((a, b) => scores[a] >= scores[b] ? a : b);
    return scores[best] > 0 ? best : ';';
  };

  // ── ZEILENPARSER (Anführungszeichen-sicher) ─────────────────────
  const parseLine = (line, sep) => {
    const result = []; let cur = ''; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === sep && !inQuote) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  // ── HEADER-ERKENNUNG ────────────────────────────────────────────
  const normalizeHeader = (s) =>
    String(s||'').toLowerCase()
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]/g,' ').trim();

  const findCol = (headers, ...terms) => {
    const norm = headers.map(normalizeHeader);
    for (const term of terms) {
      const idx = norm.findIndex(h => h.includes(term));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  // ── DATUM PARSEN ────────────────────────────────────────────────
  const parseDate = (str) => {
    if (!str) return null;
    str = str.trim();
    let y, m, d;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) { [d,m,y] = str.split('.').map(Number); }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { [y,m,d] = str.split('-').map(Number); }
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) { [d,m,y] = str.split('/').map(Number); }
    else if (/^\d{2}\.\d{2}\.\d{2}$/.test(str)) { const p = str.split('.').map(Number); d=p[0]; m=p[1]; y=2000+p[2]; }
    else { return null; }
    if (m<1||m>12||d<1||d>31||y<2000||y>2099) return null;
    const maxDay = new Date(y,m,0).getDate();
    if (d > maxDay) return null;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  };

  // ── BETRAG PARSEN ────────────────────────────────────────────────
  const parseAmount = (str) => {
    if (!str && str !== 0) return null;
    let s = String(str).trim();
    if (!s) return null;
    const isNegClamp = /^\(.*\)$/.test(s);
    if (isNegClamp) s = '-' + s.slice(1,-1);
    s = s.replace(/^−/,'-');
    if (/^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s.replace(/^-/,''))) {
      s = s.replace(/\./g,'').replace(',','.');
    } else if (/^-?\d{1,3}(,\d{3})*\.\d{1,2}$/.test(s.replace(/^-/,''))) {
      s = s.replace(/,/g,'');
    } else { s = s.replace(',','.'); }
    s = s.replace(/[€$£\s]/g,'');
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n*100)/100;
  };

  // ── PARSE (Haupt-Import) ─────────────────────────────────────────
  const parse = (text) => {
    if (!text || !text.trim()) return { ok: false, msg: 'Datei ist leer.' };

    const sep = detectSeparator(text);
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { ok: false, msg: 'Keine Datenzeilen gefunden.' };

    // Header-Zeile suchen
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const norm = parseLine(lines[i], sep).map(normalizeHeader).join(' ');
      if (norm.includes('datum')||norm.includes('betrag')||norm.includes('umsatz')||norm.includes('date')||norm.includes('buchung')) {
        headerIdx = i; break;
      }
    }

    const headers = parseLine(lines[headerIdx], sep);
    const dateCol   = findCol(headers, 'buchungstag','buchungsdatum','datum','date','wertstellung','valuta');
    const descCol   = findCol(headers, 'verwendungszweck','buchungstext','payee','empfaenger','zahlungsempfaenger','beschreibung','text','reference','auftraggeber');
    const amtCol    = findCol(headers, 'betrag','umsatz','amount','summe','wert','value');
    // Partner-Export-Felder
    const idCol     = findCol(headers, 'buchungs-id','id');
    const devCol    = findCol(headers, 'gerat','device','geraet','von');
    const catCol    = findCol(headers, 'kategorie','category','cat');
    const typeCol   = findCol(headers, 'typ','type');

    if (amtCol < 0) return { ok: false, msg: 'Betrag-Spalte nicht gefunden.' };

    const validRows = [], skippedRows = [];

    for (let i = headerIdx+1; i < lines.length; i++) {
      const lineNum = i+1;
      const cols    = parseLine(lines[i], sep);
      if (cols.length < 2 || cols.every(c => !c)) continue;

      const rawAmt  = amtCol < cols.length ? cols[amtCol] : '';
      const amt     = parseAmount(rawAmt);
      if (amt === null || amt === 0) { skippedRows.push({ line: lineNum, reason: `Betrag nicht erkennbar: "${rawAmt}"` }); continue; }

      const rawDate = dateCol >= 0 && dateCol < cols.length ? cols[dateCol] : '';
      const isoDate = parseDate(rawDate);
      if (!isoDate) { skippedRows.push({ line: lineNum, reason: `Datum nicht erkennbar: "${rawDate}"` }); continue; }

      const rawDesc = descCol >= 0 && descCol < cols.length ? cols[descCol] : '';
      const desc    = rawDesc.replace(/\s+/g,' ').trim().slice(0,200);

      // Typ: aus Spalte lesen falls vorhanden, sonst aus Vorzeichen
      let type = amt < 0 ? 'expense' : 'income';
      if (typeCol >= 0 && typeCol < cols.length) {
        const t = cols[typeCol].toLowerCase();
        if (t.includes('ausgabe') || t.includes('expense')) type = 'expense';
        else if (t.includes('einnahme') || t.includes('income')) type = 'income';
      }

      // ID aus Spalte lesen falls vorhanden (Partner-Export)
      const existingId  = (idCol  >= 0 && idCol  < cols.length) ? cols[idCol]  : '';
      const deviceId    = (devCol >= 0 && devCol < cols.length) ? cols[devCol] : '';
      const category    = (catCol >= 0 && catCol < cols.length) ? cols[catCol] : 'sonstiges';

      // Timestamps aus Partner-Export lesen (Spalten 8+9 oder benannte Spalten)
      const caIdx = findCol(headers, 'createdat','erstellt');
      const uaIdx = findCol(headers, 'updatedat','geaendert');
      const createdAtRaw  = caIdx >= 0 && caIdx  < cols.length ? cols[caIdx]  : '';
      const updatedAtRaw  = uaIdx >= 0 && uaIdx  < cols.length ? cols[uaIdx]  : '';
      const createdAt     = parseInt(createdAtRaw)  || 0;
      const updatedAt     = parseInt(updatedAtRaw)  || 0;

      validRows.push({
        id:          existingId || Utils.uid(),
        type,
        date:        isoDate,
        amount:      Math.abs(amt),
        store:       desc.slice(0,50),
        description: desc,
        category,
        deviceId:    deviceId || '',
        createdAt:   createdAt || undefined,
        updatedAt:   updatedAt || undefined,
      });
    }

    if (!validRows.length) return { ok: false, msg: `Keine importierbaren Zeilen. ${skippedRows.length} übersprungen.`, skippedRows };

    Debug.log('CSV', `Parse OK: ${validRows.length} valide, ${skippedRows.length} übersprungen`);
    return { ok: true, rows: validRows, skippedRows, warnings: skippedRows.map(s=>`Zeile ${s.line}: ${s.reason}`) };
  };

  // ── EXPORT (Standard) ───────────────────────────────────────────
  const _quoteCell = (val) => {
    const s = String(val===null||val===undefined ? '' : val);
    if (s.includes(';')||s.includes('"')||s.includes('\n')) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  };

  const exportAll = (transactions) => {
    if (!transactions || !transactions.length) { Debug.warn('CSV', 'exportAll: keine Daten'); return; }
    const header = ['Datum','Laden','Beschreibung','Kategorie','Typ','Betrag'];
    const rows = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).map(t => {
      const cat = Categories.getById(t.category);
      return [
        Utils.formatDate(t.date), t.store||'', t.description||'',
        cat ? cat.name : (t.category||''),
        t.type==='expense' ? 'Ausgabe' : 'Einnahme',
        (t.type==='expense'?'-':'') + t.amount.toFixed(2).replace('.',','),
      ];
    });
    _download([header,...rows], `haushalt_export_${Utils.todayISO()}.csv`);
    Debug.log('CSV', `exportAll: ${transactions.length} Buchungen`);
  };

  // ── PARTNER-EXPORT (mit ID und Gerätename) ──────────────────────
  // Dieser Export enthält Buchungs-ID und Gerätename für den Merge
  const exportForPartner = (transactions, deviceName) => {
    if (!transactions || !transactions.length) { Debug.warn('CSV', 'exportForPartner: keine Daten'); return; }
    // Partner-Export enthält Buchungs-ID, Timestamps und Geräteinfos für sauberes Merge
    const header = ['Buchungs-ID','Datum','Laden','Beschreibung','Kategorie','Typ','Betrag','Gerät','createdAt','updatedAt'];
    const now    = Date.now();
    const rows   = [...transactions].sort((a,b) => b.date.localeCompare(a.date)).map(t => {
      const cat = Categories.getById(t.category);
      return [
        t.id,
        Utils.formatDate(t.date), t.store||'', t.description||'',
        cat ? cat.name : (t.category||''),
        t.type==='expense' ? 'Ausgabe' : 'Einnahme',
        (t.type==='expense'?'-':'') + t.amount.toFixed(2).replace('.',','),
        deviceName || t.deviceId || '',
        String(t.createdAt || now),   // Unix-Timestamp in ms
        String(t.updatedAt || now),   // Unix-Timestamp in ms
      ];
    });
    const name = deviceName ? deviceName.toLowerCase().replace(/\s/g,'_') : 'partner';
    _download([header,...rows], `haushalt_${name}_${Utils.todayISO()}.csv`);
    Debug.log('CSV', `exportForPartner: ${transactions.length} Buchungen (mit Timestamps)`);
  };

  const _download = (rows, filename) => {
    const csvContent = rows.map(row => row.map(_quoteCell).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF'+csvContent], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return { parse, exportAll, exportForPartner };
})();
