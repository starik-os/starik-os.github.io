// ocr.js – Bon-Scan mit Tesseract.js (lazy loaded, konservativ, ehrlich)
//
// Prinzip: Lieber konservativ und stabil als "magisch, aber falsch."
// Wenn etwas unsicher ist, wird das klar kommuniziert – nicht versteckt.

const OCR = (() => {

  // ── TESSERACT LADEN ─────────────────────────────────────────────
  let _tesseractReady   = false;
  let _loadPromise      = null;  // gecachte Lade-Promise – verhindert mehrfaches Laden

  const ensureTesseract = () => {
    if (_tesseractReady) return Promise.resolve();
    if (_loadPromise)    return _loadPromise;

    _loadPromise = new Promise((resolve, reject) => {
      if (typeof Tesseract !== 'undefined') {
        _tesseractReady = true;
        _loadPromise    = null;
        resolve();
        return;
      }

      const script    = document.createElement('script');
      script.src      = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload   = () => {
        _tesseractReady = true;
        _loadPromise    = null;
        Debug.log('OCR', 'Tesseract.js geladen');
        resolve();
      };
      script.onerror  = () => {
        _loadPromise = null;
        const err    = new Error('Tesseract.js konnte nicht geladen werden. Internetverbindung prüfen.');
        Debug.error('OCR', err.message);
        reject(err);
      };
      document.head.appendChild(script);
      Debug.log('OCR', 'Tesseract.js wird geladen...');
    });

    return _loadPromise;
  };

  // ── TEXT NORMALISIEREN ───────────────────────────────────────────
  // Bereinigt OCR-Ausgabe vorsichtig – keine aggressiven Korrekturen.
  const normalizeText = (raw) => {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      // Typische OCR-Müllzeilen entfernen (nur eindeutige Fälle)
      .filter(l => !/^[|_\-=~*#]{3,}$/.test(l))   // reine Linienseparatoren
      .filter(l => !/^\s*$/.test(l))
      .join('\n');
  };

  // ── STORE ERKENNEN ───────────────────────────────────────────────
  // Confidence: 'high' = Keyword gefunden, 'low' = Fallback aus Text
  const detectStore = (text) => {
    const lower = text.toLowerCase();

    const knownStores = [
      { key: 'lidl',      name: 'Lidl'       },
      { key: 'edeka',     name: 'Edeka'      },
      { key: 'rewe',      name: 'Rewe'       },
      { key: 'aldi',      name: 'Aldi'       },
      { key: 'kaufland',  name: 'Kaufland'   },
      { key: 'nahkauf',   name: 'Nahkauf'    },
      { key: 'rossmann',  name: 'Rossmann'   },
      { key: 'dm ',       name: 'DM'         },
      { key: 'penny',     name: 'Penny'      },
      { key: 'netto',     name: 'Netto'      },
      { key: 'norma',     name: 'Norma'      },
      { key: 'mcdonald',  name: 'McDonald\'s'},
      { key: 'burger king',name:'Burger King'},
      { key: 'starbucks', name: 'Starbucks'  },
      { key: 'subway',    name: 'Subway'     },
      { key: 'aral',      name: 'Aral'       },
      { key: 'shell',     name: 'Shell'      },
      { key: 'sparkasse', name: 'Sparkasse'  },
      { key: 'n26',       name: 'N26'        },
      { key: 'vodafone',  name: 'Vodafone'   },
    ];

    for (const s of knownStores) {
      if (lower.includes(s.key)) return { name: s.name, confidence: 'high' };
    }

    // Fallback: erste nicht-leere, nicht-ziffern-dominierte Zeile
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    for (const line of lines.slice(0, 5)) {
      // Zeile muss überwiegend Buchstaben enthalten
      const letterRatio = (line.match(/[a-zA-ZäöüÄÖÜ]/g) || []).length / line.length;
      if (letterRatio > 0.5 && line.length <= 40) {
        return { name: line.slice(0, 30), confidence: 'low' };
      }
    }

    return { name: 'Unbekannt', confidence: 'none' };
  };

  // ── DATUM ERKENNEN ───────────────────────────────────────────────
  const detectDate = (text) => {
    // Suche nach typischen Bon-Datumsformaten
    const patterns = [
      { re: /(\d{2})\.(\d{2})\.(\d{4})/, parse: m => `${m[3]}-${m[2]}-${m[1]}` },
      { re: /(\d{4})-(\d{2})-(\d{2})/,   parse: m => `${m[1]}-${m[2]}-${m[3]}` },
      { re: /(\d{2})\/(\d{2})\/(\d{4})/, parse: m => `${m[3]}-${m[2]}-${m[1]}` },
    ];

    for (const p of patterns) {
      const m = text.match(p.re);
      if (m) {
        const iso = p.parse(m);
        // Plausibilitätsprüfung
        const [y, mo, d] = iso.split('-').map(Number);
        if (y >= 2020 && y <= 2030 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
          return { date: iso, confidence: 'high', usedFallback: false };
        }
      }
    }

    // Kein Datum gefunden – Fallback auf heute, aber klar markiert
    Debug.warn('OCR', 'Kein Datum im Bon erkannt – Fallback auf heute');
    return { date: Utils.todayISO(), confidence: 'none', usedFallback: true };
  };

  // ── TOTAL ERKENNEN ───────────────────────────────────────────────
  const detectTotal = (text) => {
    // Priorität: explizite Gesamtbetrag-Schlüsselwörter
    const patterns = [
      /zu\s*zahlen[\s:=]*(\d+[,.]\d{2})/i,
      /^betrag[\s:=]*(\d+[,.]\d{2})/im,
      /gesamt[\s:=]*(\d+[,.]\d{2})/i,
      /total[\s:=]*(\d+[,.]\d{2})/i,
      /^summe[\s:=]*(\d+[,.]\d{2})/im,
      /EUR\s*(\d+[,.]\d{2})/i,
      /(\d+[,.]\d{2})\s*EUR/i,
    ];

    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const n = _parseDecimal(m[1]);
        if (n > 0 && n < 9999) return { total: n, confidence: 'high' };
      }
    }

    // Fallback: alle Dezimalzahlen sammeln, plausiblen Kandidaten wählen
    const allNums = [...text.matchAll(/\d+[,.]\d{2}/g)]
      .map(m => _parseDecimal(m[0]))
      .filter(n => n > 0.1 && n < 9999);

    if (allNums.length) {
      // Letzten plausiblen Betrag nehmen (typischerweise Gesamtsumme am Ende)
      const candidate = allNums[allNums.length - 1];
      return { total: candidate, confidence: 'low' };
    }

    return { total: 0, confidence: 'none' };
  };

  const _parseDecimal = (str) => {
    let s = String(str).trim();
    // 1.234,56 → 1234.56
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  };

  // ── POSITIONEN ERKENNEN ──────────────────────────────────────────
  // Konservativ: lieber weniger als falsche Positionen.
  const detectItems = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Zeilen die definitiv keine Artikel sind
    const SKIP_WORDS = [
      'mwst','mehrwertsteuer','steuer','netto','brutto',
      'karte','girocard','ec-karte','mastercard','visa',
      'bargeld','rückgeld','wechselgeld',
      'filiale','kassierer','kasse','adresse','telefon','tel.',
      'danke','vielen','wiedersehen','servicenummer','hotline',
      'www.','http','ust','tse','signatur','transaktion',
      'bon-nr','belegnr','beleg-nr','receipt',
      'lidl plus','rabatt','coupon','gutschein','bonuspunkt',
      'summe','gesamt','total','zu zahlen','betrag','zwischensumme',
    ];

    const items = [];

    for (const line of lines) {
      const ll = line.toLowerCase();
      if (SKIP_WORDS.some(w => ll.includes(w))) continue;

      // Muster: "Artikelname   Preis"  (Preis am Ende, getrennt durch Leerzeichen)
      const m = line.match(/^(.{2,35?}?)\s{2,}(\d+[,.]\d{2})\s*[ABab]?\s*$/);
      if (m) {
        const desc = m[1].trim().replace(/\s+/g, ' ');
        const amt  = _parseDecimal(m[2]);

        // Plausibilitätsprüfung
        if (amt <= 0 || amt > 500)       continue;
        if (desc.length < 2)             continue;
        // Zeile darf nicht hauptsächlich aus Ziffern bestehen
        const digitRatio = (desc.match(/\d/g) || []).length / desc.length;
        if (digitRatio > 0.6)            continue;

        items.push({
          desc,
          amount: amt,
          cat: Categories.detect('', desc),
        });
      }
    }

    return items;
  };

  // ── HAUPTFUNKTION: SCAN ─────────────────────────────────────────
  const scan = async (file, onProgress) => {
    // Tesseract laden
    try {
      await ensureTesseract();
    } catch (loadErr) {
      return { ok: false, msg: loadErr.message };
    }

    // Objekt-URL erstellen
    let imgUrl = null;
    try {
      imgUrl = URL.createObjectURL(file);
    } catch (e) {
      return { ok: false, msg: 'Datei konnte nicht gelesen werden.' };
    }

    try {
      // OCR ausführen
      const result = await Tesseract.recognize(imgUrl, 'deu', {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      // Objekt-URL freigeben
      URL.revokeObjectURL(imgUrl);
      imgUrl = null;

      const rawText  = result.data.text || '';
      const ocrConf  = result.data.confidence || 0;
      const normText = normalizeText(rawText);

      Debug.log('OCR', `OCR abgeschlossen. Konfidenz: ${ocrConf}%`);
      Debug.log('OCR', `Text (erste 300 Zeichen): ${normText.slice(0, 300)}`);

      if (!normText.trim()) {
        return { ok: false, msg: 'Kein Text erkannt. Bitte schärferes Foto verwenden.' };
      }

      // Einzelkomponenten erkennen
      const storeResult = detectStore(normText);
      const dateResult  = detectDate(normText);
      const totalResult = detectTotal(normText);
      const items       = detectItems(normText);

      // Gesamtunsicherheit bewerten
      const uncertain =
        ocrConf < 40 ||
        totalResult.confidence === 'none' ||
        storeResult.confidence === 'none';

      // Items nur übernehmen wenn plausibel
      const hasReliableItems =
        items.length >= 2 &&
        items.length <= 30 &&
        totalResult.confidence !== 'none' &&
        Math.abs(items.reduce((s, i) => s + i.amount, 0) - totalResult.total) < totalResult.total * 0.25;

      const warnings = [];
      if (dateResult.usedFallback)                 warnings.push('Datum nicht erkannt – heutiges Datum verwendet.');
      if (storeResult.confidence === 'none')        warnings.push('Laden nicht erkannt.');
      if (totalResult.confidence === 'none')        warnings.push('Gesamtbetrag nicht erkannt.');
      if (totalResult.confidence === 'low')         warnings.push('Gesamtbetrag unsicher – bitte prüfen.');
      if (!hasReliableItems && items.length > 0)   warnings.push('Einzelpositionen unvollständig – Gesamtbetrag wird verwendet.');
      if (ocrConf < 40)                            warnings.push(`OCR-Qualität niedrig (${Math.round(ocrConf)}%) – Foto verbessern.`);

      return {
        ok:               true,
        store:            storeResult.name,
        storeConfidence:  storeResult.confidence,
        date:             dateResult.date,
        dateConfidence:   dateResult.confidence,
        dateUsedFallback: dateResult.usedFallback,
        total:            totalResult.total,
        totalConfidence:  totalResult.confidence,
        items:            hasReliableItems ? items : [],
        hasReliableItems,
        ocrConfidence:    Math.round(ocrConf),
        uncertain,
        warnings,
        rawText,
      };

    } catch (err) {
      // Objekt-URL in jedem Fall freigeben
      if (imgUrl) { try { URL.revokeObjectURL(imgUrl); } catch (_) {} }
      Debug.error('OCR', 'Scan fehlgeschlagen', err);
      return { ok: false, msg: `OCR-Fehler: ${err.message}` };
    }
  };

  return { scan };
})();
