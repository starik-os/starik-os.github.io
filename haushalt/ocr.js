// ocr.js – Bon-Scan mit Tesseract.js (lazy loaded)
const OCR = (() => {
  let tesseractLoaded = false;

  const ensureTesseract = () => new Promise((resolve, reject) => {
    if (tesseractLoaded) { resolve(); return; }
    if (typeof Tesseract !== 'undefined') { tesseractLoaded = true; resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => { tesseractLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Tesseract konnte nicht geladen werden.'));
    document.head.appendChild(script);
    Debug.log('OCR', 'Loading Tesseract.js...');
  });

  const parseTotal = (text) => {
    // Suche nach Gesamtbetrag-Mustern
    const patterns = [
      /zu\s*zahlen[\s:]*(\d+[,.]\d{2})/i,
      /^betrag[\s:]*(\d+[,.]\d{2})/im,
      /gesamt[\s:]*(\d+[,.]\d{2})/i,
      /total[\s:]*(\d+[,.]\d{2})/i,
      /^summe[\s:]*(\d+[,.]\d{2})/im,
      /EUR[\s]*(\d+[,.]\d{2})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return Utils.parseAmount(m[1]);
    }
    // Fallback: letzter Betrag im Text
    const nums = text.match(/\d+[,.]\d{2}/g);
    if (nums) {
      const candidates = nums.map(n => Utils.parseAmount(n)).filter(n => n > 0.5 && n < 500);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return 0;
  };

  const parseStore = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const lower = text.toLowerCase();
    const stores = [
      'lidl','edeka','rewe','aldi','kaufland','nahkauf','rossmann','dm ',
      'penny','netto','norma','eko tank','tankstelle','mcdonald','burger king',
      'starbucks','subway','sparkasse','n26 ','vodafone'
    ];
    for (const s of stores) {
      if (lower.includes(s)) return s.charAt(0).toUpperCase() + s.slice(1).trim();
    }
    return lines[0]?.slice(0, 30) || 'Unbekannt';
  };

  const parseDate = (text) => {
    const m = text.match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${y}-${m[2]}-${m[1]}`;
    }
    return Utils.todayISO();
  };

  const parseItems = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const skipWords = ['summe','gesamt','total','mwst','steuer','zahlen','karte','bargeld',
      'rückgeld','bon','datum','uhr','kasse','filiale','danke','vielen','service',
      'telefon','www','ust','tse','sig','rabatt','lidl plus','gutschein'];
    const items = [];

    for (const line of lines) {
      const ll = line.toLowerCase();
      if (skipWords.some(w => ll.includes(w))) continue;
      const m = line.match(/^(.{3,35?})\s+(\d+[,.]\d{2})\s*[ABab]?\s*$/);
      if (m) {
        const desc = m[1].trim().replace(/\s+/g, ' ');
        const amt = Utils.parseAmount(m[2]);
        if (amt > 0 && amt < 200 && desc.length > 2) {
          items.push({ desc, amount: amt, cat: Categories.detect('', desc) });
        }
      }
    }
    return items;
  };

  const scan = async (file, onProgress) => {
    await ensureTesseract();
    const imgUrl = URL.createObjectURL(file);
    try {
      const result = await Tesseract.recognize(imgUrl, 'deu', {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(Math.round((m.progress || 0) * 100));
          }
        }
      });
      URL.revokeObjectURL(imgUrl);
      const text = result.data.text;
      Debug.log('OCR', 'Raw text:', text.slice(0, 200));

      const total = parseTotal(text);
      const store = parseStore(text);
      const date  = parseDate(text);
      const items = parseItems(text);

      return {
        ok: true,
        store,
        date,
        total: Math.round(total * 100) / 100,
        items,
        rawText: text,
        confidence: result.data.confidence,
        uncertain: total === 0 || result.data.confidence < 40,
      };
    } catch (err) {
      URL.revokeObjectURL(imgUrl);
      Debug.error('OCR', 'Scan failed', err);
      return { ok: false, msg: err.message };
    }
  };

  return { scan };
})();
