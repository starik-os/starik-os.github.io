// categories.js – Kategorien + automatische Erkennung
const Categories = (() => {

  const DEFAULTS = [
    { id: 'lebensmittel',  name: 'Lebensmittel',   icon: '🛒', color: '#16a34a', keywords: ['edeka','rewe','aldi','lidl','kaufland','nahkauf','norma','netto','penny','konsum','rossmann lebensmittel','famila','real ','tegut','globus','markant','lindner'] },
    { id: 'zigaretten',    name: 'Zigaretten',      icon: '🚬', color: '#78716c', keywords: ['zigarett','tabak','marlboro','camel','winston','l&m','philip','heets','iqos','pall mall','kiosk','polenmarkt zigar'] },
    { id: 'energy',        name: 'Energy/Getränke', icon: '⚡', color: '#ca8a04', keywords: ['red bull','redbull','monster','energy drink','burn ','rockstar','effect '] },
    { id: 'kosmetik',      name: 'Kosmetik',        icon: '🧴', color: '#db2777', keywords: ['shampoo','duschgel','deo','parfum','creme','lotion','zahncreme','zahnpasta','tampons','binden','rasier','rossmann','dm ','drogerie','rituals','solarium'] },
    { id: 'putzmittel',    name: 'Putzmittel',      icon: '🧹', color: '#0891b2', keywords: ['pril','fairy','spülmittel','reiniger','wc ','domestos','sagrotan','bref','waschmittel','weichspüler','persil','ariel','lenor','vim','ajax','putztücher'] },
    { id: 'miete',         name: 'Miete',           icon: '🏠', color: '#9333ea', keywords: ['miete','grundstück','putzmann','erbengem','grundst'] },
    { id: 'strom',         name: 'Strom/Gas',       icon: '💡', color: '#ea580c', keywords: ['strom','vattenfall','maingau','montana gas','gasabschlag','erdgas','heizgas','gas '] },
    { id: 'bvg',           name: 'BVG/Fahrkarte',   icon: '🚇', color: '#2563eb', keywords: ['bvg','fahrkarte','s-bahn','u-bahn','bolt '] },
    { id: 'versicherung',  name: 'Versicherung',    icon: '🛡️', color: '#0f766e', keywords: ['versicherung','solidar','docura','barmer','hanse merkur','haftpflicht','sterbegeld'] },
    { id: 'unterhaltung',  name: 'Unterhaltung',    icon: '🎬', color: '#7c3aed', keywords: ['netflix','disney','unterhaltung','spotify','chat gpt','chatgpt','google play','hp drucker','drucker','amazon prime'] },
    { id: 'kg_med',        name: 'KG/Medikamente',  icon: '💊', color: '#dc2626', keywords: ['apotheke','medikament','krankengymnastik','physio','sum up','mediserv','klinik','zahnarzt','bandage','sanitäts','health ag','opta data','apelos','reha','physioth'] },
    { id: 'kaffee',        name: 'Kaffee/Café',     icon: '☕', color: '#92400e', keywords: ['kaffee','café','cafe','espresso','cappuccino','nescafe','jacobs','tchibo','dolce','waldfriede','starbucks','friendly fisch'] },
    { id: 'kleidung',      name: 'Kleidung',        icon: '👕', color: '#1d4ed8', keywords: ['kleidung','new yorker','h&m','woolworth','schuhe','stiefel','sneaker','jeggings','deichmann','pepco','tk maxx'] },
    { id: 'tanken',        name: 'Tanken',          icon: '⛽', color: '#b91c1c', keywords: ['tanken','benzin','diesel','aral','shell','esso','jet ','agip','eko tank','sprint tank','tankstelle','sprit'] },
    { id: 'auto',          name: 'Auto/Parken',     icon: '🚗', color: '#475569', keywords: ['parken','parkgebühr','parkhaus','waschanlage','autowäsche','kfz','tüv','werkstatt'] },
    { id: 'internet',      name: 'Internet/Handy',  icon: '📱', color: '#0284c7', keywords: ['vodafone','telekom','o2 ','internet','mobilfunk','simkarte','prepaid'] },
    { id: 'essen_aus',     name: 'Essen außerhalb', icon: '🍽️', color: '#c2410c', keywords: ['pizza','döner','burger','mcdonald','mc donald','burgermeister','subway','kebab','schnitzel','restaurant','imbiss','chinapfanne','pizzeria','dönerladen','bratpfanne','piraten berlin'] },
    { id: 'baecker',       name: 'Bäcker/Kuchen',   icon: '🥐', color: '#b45309', keywords: ['brötchen','croissant','kuchen','bäcker','bäckerei','konditorei','wiedemann','walff','steinecke','haase'] },
    { id: 'getraenke',     name: 'Getränke',        icon: '🥤', color: '#0369a1', keywords: ['wasser','saft','cola','fanta','sprite','limonade','eistee','pfand','sprudel','mineralwasser','getränke hoffmann'] },
    { id: 'kontogebuehr',  name: 'Kontogebühren',   icon: '🏦', color: '#6b7280', keywords: ['kontogebühr','kontoführung','sparkasse','n26 ','entgeld','bankkarte','kontoentgelt'] },
    { id: 'gez',           name: 'GEZ/Rundfunk',    icon: '📺', color: '#374151', keywords: ['gez','rundfunk','beitragsservice'] },
    { id: 'friseur',       name: 'Friseur',         icon: '✂️', color: '#7c2d12', keywords: ['friseur','frisör','haare schneiden','star herren'] },
    { id: 'freizeit',      name: 'Freizeit/Sport',  icon: '🎯', color: '#065f46', keywords: ['schwimmbad','freizeit','volksfest','museum','kino','konzert','bowling','nagelstudio','solarium jenny'] },
    { id: 'haushalt',      name: 'Haushaltswaren',  icon: '🏡', color: '#78350f', keywords: ['batterie','glühbirne','müllbeutel','schwamm','werkzeug','bauhaus','obi ','hornbach','haushalt','euroshop','euro shop'] },
    { id: 'schulden',      name: 'Schulden/Raten',  icon: '📉', color: '#dc2626', keywords: ['schuldentilg','tilgung','rate ','kredit','darlehen','ba service'] },
    { id: 'sonstiges',     name: 'Sonstiges',       icon: '💸', color: '#6b7280', keywords: [] },
  ];

  let _cats = [];

  const load = async () => {
    const stored = await Storage.get('settings', 'categories');
    _cats = stored ? stored.value : [...DEFAULTS];
    Debug.log('Categories', `Loaded ${_cats.length} categories`);
  };

  const save = async () => {
    await Storage.put('settings', { key: 'categories', value: _cats });
  };

  const getAll = () => _cats;

  const getById = (id) => _cats.find(c => c.id === id) || _cats.find(c => c.id === 'sonstiges');

  const detect = (store, desc) => {
    const combined = ((store || '') + ' ' + (desc || '')).toLowerCase();
    for (const cat of _cats.filter(c => c.id !== 'sonstiges')) {
      if (cat.keywords.some(k => combined.includes(k))) {
        return cat.id;
      }
    }
    return 'sonstiges';
  };

  const reset = async () => {
    _cats = [...DEFAULTS];
    await save();
  };

  return { load, save, getAll, getById, detect, reset, DEFAULTS };
})();
