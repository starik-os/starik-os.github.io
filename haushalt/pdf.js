// pdf.js – PDF Export via Browser Print
const PDF = (() => {

  const exportMonth = (key, transactions) => {
    const monthTx = transactions.filter(t => Utils.monthKey(t.date) === key);
    const bal = Months.calcBalance(key, transactions);
    const catStats = Transactions.getCategoryStats(key);
    const label = Utils.monthLabel(key);

    const expenses = monthTx.filter(t => t.type === 'expense').sort((a, b) => b.date.localeCompare(a.date));
    const incomes  = monthTx.filter(t => t.type === 'income').sort((a, b) => b.date.localeCompare(a.date));

    const catRows = catStats.map(c => {
      const cat = Categories.getById(c.cat);
      return `<tr><td>${cat ? cat.icon + ' ' + cat.name : c.cat}</td><td class="amt neg">${Utils.formatMoney(c.amount)}</td></tr>`;
    }).join('');

    const txRows = (arr, sign) => arr.map(t => {
      const cat = Categories.getById(t.category);
      return `<tr>
        <td>${Utils.formatDate(t.date)}</td>
        <td>${Utils.escHtml(t.store)}</td>
        <td>${Utils.escHtml(t.description)}</td>
        <td>${cat ? cat.name : t.category}</td>
        <td class="amt ${sign === '-' ? 'neg' : 'pos'}">${sign}${Utils.formatMoney(t.amount)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Haushalt ${label}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 24px; }
  h1 { font-size: 22px; color: #BA7517; margin-bottom: 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; border-bottom: 2px solid #BA7517; padding-bottom: 4px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .stat { background: #f5f5f0; border-radius: 8px; padding: 12px; text-align: center; }
  .stat-lbl { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .06em; }
  .stat-val { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .pos { color: #16a34a; }
  .neg { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #BA7517; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  .amt { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) { background: #fafafa; }
  .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h1>Haushalt Danni &amp; Jenny</h1>
<div style="color:#888;font-size:13px">${label}</div>
<div class="stats">
  <div class="stat"><div class="stat-lbl">Übertrag</div><div class="stat-val">${Utils.formatMoney(bal.carryOver)}</div></div>
  <div class="stat"><div class="stat-lbl">Einnahmen</div><div class="stat-val pos">${Utils.formatMoney(bal.income)}</div></div>
  <div class="stat"><div class="stat-lbl">Ausgaben</div><div class="stat-val neg">${Utils.formatMoney(bal.expenses)}</div></div>
  <div class="stat"><div class="stat-lbl">Bilanz</div><div class="stat-val ${bal.balance >= 0 ? 'pos' : 'neg'}">${Utils.formatMoney(bal.balance)}</div></div>
</div>
<h2>Ausgaben nach Kategorie</h2>
<table><thead><tr><th>Kategorie</th><th style="text-align:right">Betrag</th></tr></thead>
<tbody>${catRows}</tbody></table>
<h2>Alle Ausgaben (${expenses.length})</h2>
<table><thead><tr><th>Datum</th><th>Laden</th><th>Beschreibung</th><th>Kategorie</th><th style="text-align:right">Betrag</th></tr></thead>
<tbody>${txRows(expenses, '-')}</tbody></table>
<h2>Einnahmen (${incomes.length})</h2>
<table><thead><tr><th>Datum</th><th>Quelle</th><th>Beschreibung</th><th>Kategorie</th><th style="text-align:right">Betrag</th></tr></thead>
<tbody>${txRows(incomes, '+')}</tbody></table>
<div class="footer">Erstellt am ${new Date().toLocaleDateString('de-DE')} · Haushalt Danni &amp; Jenny</div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { UI.toast('Bitte Pop-ups erlauben.'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
    Debug.log('PDF', `Export ${label}: ${monthTx.length} Buchungen`);
  };

  return { exportMonth };
})();
