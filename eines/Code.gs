/**
 * MENÚ DEL MENJADOR · Vedruna Escorial Vic
 * Llegeix els PDF mensuals dels menús i publica menus.json a GitHub Pages.
 * Funciona sol: un activador diari mira si hi ha PDF nous o modificats.
 *
 * INSTAL·LACIÓ (un sol cop):
 *  1. Serveis (+) → afegeix "Drive API" (v3). Ha de quedar amb el nom "Drive".
 *  2. Configuració del projecte → Propietats de l'script → GITHUB_TOKEN.
 *  3. Omple el CONFIG d'aquí sota (usuari i repositori de GitHub).
 *  4. Executa veureQueTrobo() i mira el registre: han de sortir els PDF del mes.
 *  5. Executa configurar(). Ja està.
 *
 * SI ALGUN DIA NO S'ACTUALITZA:
 *  · Execucions (menú de l'esquerra): hi surt si l'activador arrenca i si falla.
 *  · veureQueTrobo()  → quins PDF veig i d'on surten.
 *  · veureTextPdf()   → el text tal com el llegeixo, per si canvia el format.
 *  · reprocessarTot() → ho refà tot de zero.
 */
var CONFIG = {
  // Carpetes del Drive on poden aparèixer els menús. Les miro senceres, amb
  // totes les subcarpetes. 'clau' és el resourcekey que surt a l'enllaç.
  CARPETES: [
    { id: '0B5AqbjrBoZq7UUtzOGNldEdWTFU', clau: '0-8k0F8YGmfAhaIZ1bBk16rg' },  // arrel del menjador
    { id: '0B5AqbjrBoZq7LTdTenBjWVAwNVk', clau: '0-oNfjwD8skhxk_khx_YHDzg' }   // subcarpeta "Menús"
  ],
  // Pàgines del Sites: si els pengen només allà, els agafo d'aquí.
  SITES: ['https://sites.google.com/vedruna.cat/escorialmenjador/men%C3%BAs-escola'],

  // Dies sense plats al PDF que SÍ tenen menjador (dinars especials).
  // El que escriguis aquí mana per sobre de tot. Format: 'AAAA-MM-DD': 'text'.
  NOTES: {
    '2026-10-30': 'Dinar especial de la castanyada'
  },

  GITHUB_USUARI: 'poldpm',
  GITHUB_REPO: 'menjadorEscorial',
  GITHUB_BRANCA: 'main',
  GITHUB_FITXER: 'menus.json',
  AVIS_EMAIL: Session.getActiveUser().getEmail(), // on t'arriba un correu si alguna cosa falla
  DIES_A_GUARDAR: 120
};

// ===================== ENTRADES =====================

/** Posa en marxa l'activador diari i fa la primera actualització. */
function configurar() {
  var problema = comprovarGitHub();
  if (problema) { Logger.log('ATURAT. ' + problema); return; }
  Logger.log('GitHub: hi arribo bé (' + CONFIG.GITHUB_USUARI + '/' + CONFIG.GITHUB_REPO + ').');
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('actualitzar').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Activador diari creat (cap a les 6 del matí).');
  actualitzar();
}

/** Diari. Només treballa si hi ha PDF nous o canviats del mes anterior endavant. */
function actualitzar(forcar, deZero) {
  var inici = Date.now();
  var props = PropertiesService.getScriptProperties();
  var vistos = JSON.parse(props.getProperty('PROCESSATS') || '{}');
  var ara = new Date();
  var mesMinim = ara.getFullYear() * 12 + ara.getMonth() - 1;

  comprovarGitHub();  // de passada, mira quan caduca el token i avisa si toca
  var tots = buscarPdfs(), origens = tots.origens || {};
  var pdfs = tots.filter(function (f) {
    var m = f.getName().match(RE_NOM);
    var mes = MESOS.indexOf(m[1].toUpperCase().replace('MARC', 'MARÇ'));
    var any = +m[0].match(/20\d\d/)[0];
    return any * 12 + mes >= mesMinim;
  });
  var pendents = pdfs.filter(function (f) { return forcar === true || vistos[f.getId()] !== String(f.getLastUpdated().getTime()); });
  Logger.log('PDF actuals: ' + pdfs.length + ' · pendents de llegir: ' + pendents.length);
  if (!pendents.length) return;

  var dades = (deZero === true) ? { dietes: {}, pdfs: {}, dies: {} } : (llegirDeGitHub() || { dietes: {}, pdfs: {}, dies: {} });
  var errors = [], falten = false;

  for (var i = 0; i < pendents.length; i++) {
    if (Date.now() - inici > 4.5 * 60 * 1000) { falten = true; break; }
    var f = pendents[i], v = varianteDelNom(f.getName());
    Logger.log('Llegint ' + f.getName() + '  [' + (origens[f.getId()] || '?') + ']  →  ' + v.clau);
    try {
      var r = parsejarMenu(extreureText(f));
      aplicarNotes(r.dies);
      dades.dietes[v.clau] = { nom: v.nom, ordre: v.ordre };
      dades.pdfs[r.any + '-' + String(r.mes + 1).padStart(2, '0') + '|' + v.clau] = f.getUrl();
      Object.keys(r.dies).forEach(function (dia) {
        dades.dies[dia] = dades.dies[dia] || {};
        dades.dies[dia][v.clau] = r.dies[dia];
      });
      vistos[f.getId()] = String(f.getLastUpdated().getTime());
    } catch (e) {
      errors.push(f.getName() + ': ' + e.message);
      vistos[f.getId()] = String(f.getLastUpdated().getTime()); // no reintentar cada dia el mateix PDF trencat
    }
  }

  var limit = new Date(Date.now() - CONFIG.DIES_A_GUARDAR * 86400000).toISOString().slice(0, 10);
  Object.keys(dades.dies).forEach(function (d) { if (d < limit) delete dades.dies[d]; });
  // Fora les dietes que ja no tenen cap dia, perquè no quedin botons orfes
  var vives = {};
  Object.keys(dades.dies).forEach(function (d) { Object.keys(dades.dies[d]).forEach(function (c) { vives[c] = 1; }); });
  Object.keys(dades.dietes).forEach(function (c) { if (!vives[c]) delete dades.dietes[c]; });

  dades.actualitzat = new Date().toISOString();
  escriureAGitHub(dades);
  props.setProperty('PROCESSATS', JSON.stringify(vistos));
  Logger.log('Publicat a GitHub.' + (falten ? ' Falten PDF: continuo d\'aquí a 1 minut.' : ''));

  if (falten) ScriptApp.newTrigger('continuar').timeBased().after(60 * 1000).create();
  if (errors.length) {
    MailApp.sendEmail(CONFIG.AVIS_EMAIL, 'Menú menjador: no he pogut llegir algun PDF',
      'Aquests PDF no s\'han pogut llegir i no sortiran a la web:\n\n' + errors.join('\n') +
      '\n\nSi l\'empresa ha canviat el format del PDF, cal revisar el lector.');
  }
}

/** La crida sol l'script quan s'ha de reprendre la feina. */
function continuar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'continuar') ScriptApp.deleteTrigger(t); });
  actualitzar();
}

/** Les notes escrites a mà a CONFIG.NOTES manen per sobre del que digui el PDF. */
function aplicarNotes(dies) {
  Object.keys(CONFIG.NOTES || {}).forEach(function (k) {
    if (!dies[k]) return;
    dies[k].nota = CONFIG.NOTES[k];
    delete dies[k].festiu;
  });
}

/** Prova: llegeix el PDF del mes més nou i mostra el resultat al registre. No publica res. */
function provarUnPdf() {
  var f = pdfMesNou();
  if (!f) { Logger.log('No trobo cap PDF de menús. Executa veureQueTrobo().'); return; }
  Logger.log('PDF: ' + f.getName() + '  →  ' + JSON.stringify(varianteDelNom(f.getName())));
  var r = parsejarMenu(extreureText(f));
  aplicarNotes(r.dies);
  Object.keys(r.dies).sort().forEach(function (d) { Logger.log(d + '  ' + JSON.stringify(r.dies[d])); });
}

/** Si mai cal refer-ho tot. Comença de zero: no arrossega dietes ni dies antics. */
function reprocessarTot() {
  PropertiesService.getScriptProperties().deleteProperty('PROCESSATS');
  actualitzar(true, true);
}

/** El PDF del mes més recent (ordenant pel mes del nom, no per la data del fitxer). */
function pdfMesNou() {
  var pes = function (f) {
    var m = f.getName().match(RE_NOM);
    return (+m[0].match(/20\d\d/)[0]) * 12 + MESOS.indexOf(m[1].toUpperCase().replace('MARC', 'MARÇ'));
  };
  var tots = buscarPdfs();
  var pdfs = tots.filter(function (f) { return !/_/.test(f.getName()); }); // el general, sense sufix de dieta
  if (!pdfs.length) pdfs = tots;
  return pdfs.sort(function (a, b) { return pes(b) - pes(a); })[0] || null;
}

/** Bolca al registre el text que llegeixo del PDF més nou. Per veure què falla. */
function veureTextPdf() {
  var f = pdfMesNou();
  if (!f) { Logger.log('No trobo cap PDF.'); return; }
  Logger.log('=== ' + f.getName() + ' ===');
  var t = extreureText(f).replace(/\s+/g, ' ');
  for (var i = 0; i < t.length; i += 4000) Logger.log(t.slice(i, i + 4000));
}

// ===================== DRIVE =====================

var RE_NOM = /(GENER|FEBRER|MAR[ÇC]|ABRIL|MAIG|JUNY|JULIOL|AGOST|SETEMBRE|OCTUBRE|NOVEMBRE|DESEMBRE)\s*20\d\d/i;

/**
 * Busca els PDF de menús a tot arreu i es queda amb els que no estiguin repetits:
 *   1. Les carpetes de CONFIG.CARPETES, amb totes les seves subcarpetes.
 *   2. Tot el Drive, buscant pel nom del mes (per si els deixen en una altra banda).
 *   3. Les pàgines del Sites.
 * El filtre és el nom: ha de portar un mes i un any (p. ex. "NOVEMBRE 2026").
 */
function buscarPdfs() {
  var trobats = {}, origens = {};
  function afegir(f, origen) {
    try {
      if (f.getMimeType() !== MimeType.PDF) return;
      if (!RE_NOM.test(f.getName())) return;
      if (trobats[f.getId()]) return;
      trobats[f.getId()] = f;
      origens[f.getId()] = origen;
    } catch (e) {}
  }

  // 1. Carpetes (i subcarpetes)
  (CONFIG.CARPETES || []).forEach(function (c) {
    try {
      var carpeta = c.clau ? DriveApp.getFolderByIdAndResourceKey(c.id, c.clau) : DriveApp.getFolderById(c.id);
      recorrerCarpeta(carpeta, function (f) { afegir(f, 'carpeta: ' + carpeta.getName()); }, 0);
    } catch (e) { Logger.log('No puc obrir la carpeta ' + c.id + ': ' + e.message); }
  });

  // 2. Tot el Drive, mes a mes (del mes passat fins d'aquí a tres mesos)
  var ara = new Date();
  for (var k = -1; k <= 3; k++) {
    var d = new Date(ara.getFullYear(), ara.getMonth() + k, 1);
    var terme = MESOS[d.getMonth()];
    try {
      var it = DriveApp.searchFiles("mimeType = 'application/pdf' and trashed = false and title contains '" + terme + "'");
      var n = 0;
      while (it.hasNext() && n++ < 200) afegir(it.next(), 'drive');
    } catch (e) { Logger.log('Cerca al Drive (' + terme + '): ' + e.message); }
  }

  // 3. Sites
  (CONFIG.SITES || []).forEach(function (url) {
    idsDelSites(url).forEach(function (id) {
      try { afegir(DriveApp.getFileById(id), 'sites'); } catch (e) {}
    });
  });

  var llista = Object.keys(trobats).map(function (k) { return trobats[k]; });
  llista.origens = origens;
  return llista;
}

function recorrerCarpeta(carpeta, afegir, nivell) {
  if (nivell > 4) return;
  var fs = carpeta.getFiles();
  while (fs.hasNext()) afegir(fs.next());
  var subs = carpeta.getFolders();
  while (subs.hasNext()) recorrerCarpeta(subs.next(), afegir, nivell + 1);
}

/** Llegeix una pàgina del Sites i en treu els identificadors dels fitxers del Drive. */
function idsDelSites(url) {
  var html;
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) { Logger.log('Sites ' + r.getResponseCode() + ': ' + url); return []; }
    html = r.getContentText();
  } catch (e) { Logger.log('No puc llegir el Sites: ' + e.message); return []; }

  var ids = {}, m;
  var patrons = [/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^"']*id=)([A-Za-z0-9_-]{25,60})/g,
                 /"(?:fileId|docid|resourceId)"\s*:\s*"([A-Za-z0-9_-]{25,60})"/g];
  patrons.forEach(function (re) { while ((m = re.exec(html)) !== null) ids[m[1]] = 1; });

  if (!Object.keys(ids).length) {
    var re2 = /["']([01][A-Za-z0-9_-]{27,43})["']/g, n = 0;
    while ((m = re2.exec(html)) !== null && n < 150) { ids[m[1]] = 1; n++; }
  }
  return Object.keys(ids);
}

/** Diagnòstic: mostra al registre tots els PDF que veig i d'on surten. No publica res. */
function veureQueTrobo() {
  var pdfs = buscarPdfs(), org = pdfs.origens || {};
  Logger.log('He trobat ' + pdfs.length + ' PDF de menús:');
  pdfs.sort(function (a, b) { return a.getName().localeCompare(b.getName()); }).forEach(function (f) {
    Logger.log('  · ' + f.getName() + '   →  ' + JSON.stringify(varianteDelNom(f.getName())) + '   [' + (org[f.getId()] || '?') + ']');
  });
  var mesos = {};
  pdfs.forEach(function (f) { mesos[f.getName().match(RE_NOM)[0].toUpperCase().replace(/\s+/g, ' ')] = 1; });
  Logger.log('Mesos detectats: ' + (Object.keys(mesos).join(', ') || 'cap'));
}

/** Converteix el PDF a Document de Google (temporal) per treure'n el text. */
function extreureText(file) {
  var tmp = Drive.Files.create({ name: 'tmp-menu-' + file.getId(), mimeType: MimeType.GOOGLE_DOCS }, file.getBlob(), { ocrLanguage: 'ca' });
  try { return DocumentApp.openById(tmp.id).getBody().getText(); }
  finally { Drive.Files.remove(tmp.id); }
}

/**
 * Quina dieta és, a partir del nom del fitxer. No depèn de com l'escriguin:
 * busco les paraules clau on sigui del nom, amb accents o sense.
 */
var DIETES = [
  { re: /sense\s*gluten|sin\s*gluten|s\s*\/\s*gluten|celi/i,            clau: 'sense-gluten',      nom: 'Sense gluten',               ordre: 1 },
  { re: /sense\s*lactosa|sin\s*lactosa/i,                               clau: 'sense-lactosa',     nom: 'Sense lactosa',              ordre: 2 },
  { re: /sense\s*(ou|ous|huevo)/i,                                      clau: 'sense-ou',          nom: 'Sense ou',                   ordre: 3 },
  { re: /sense\s*peix|sin\s*pescado|marisc|mariscos/i,                  clau: 'sense-peix',        nom: 'Sense peix ni marisc',       ordre: 4 },
  { re: /\bplv\b|proteina.*llet|prote[ií]na.*vaca/i,                    clau: 'sense-plv',         nom: 'Sense PLV',                  ordre: 5 },
  { re: /fructosa|sorbitol/i,                                           clau: 'sense-fructosa',    nom: 'Sense fructosa ni sorbitol', ordre: 6 },
  { re: /fruits?\s*secs?|frutos\s*secos|closca|c[àa]scara/i,            clau: 'sense-fruits-secs', nom: 'Sense fruits secs',          ordre: 7 },
  { re: /vegetari|vegan/i,                                              clau: 'vegetaria',         nom: 'Vegetarià',                  ordre: 8 },
  { re: /\bhal{1,2}al\b/i,                                              clau: 'halal',             nom: 'Halal',                      ordre: 9 }
];

function varianteDelNom(nom) {
  var base = String(nom).replace(/\.pdf$/i, '');
  var llar = /llar|bressol|triturat/i.test(base);
  // Trec el tros "ESCORIAL-NOVEMBRE 2026" perquè no confongui la cerca
  var resta = base.replace(RE_NOM, ' ').replace(/escorial/i, ' ');

  for (var i = 0; i < DIETES.length; i++) {
    if (DIETES[i].re.test(resta)) {
      return { clau: (llar ? 'llar-' : '') + DIETES[i].clau,
               nom: (llar ? 'Llar · ' : '') + DIETES[i].nom,
               ordre: (llar ? 100 : 0) + DIETES[i].ordre };
    }
  }

  // Cap dieta coneguda: si hi ha un sufix (després de _ o -), el faig servir tal qual.
  var m = resta.match(/[_–-]\s*([^_–-]{3,40})\s*$/);
  var sufix = m ? m[1].replace(/\(\d+\)/g, '').trim() : '';
  if (sufix && !/^\d+$/.test(sufix)) {
    return { clau: (llar ? 'llar-' : '') + clauDeText(sufix),
             nom: (llar ? 'Llar · ' : '') + sufix.charAt(0).toUpperCase() + sufix.slice(1),
             ordre: (llar ? 100 : 0) + 50 };
  }
  return { clau: llar ? 'llar-general' : 'general', nom: (llar ? 'Llar · ' : '') + 'General', ordre: llar ? 100 : 0 };
}

function clauDeText(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'altre';
}

// ===================== GITHUB =====================

function urlGitHub() {
  return 'https://api.github.com/repos/' + CONFIG.GITHUB_USUARI + '/' + CONFIG.GITHUB_REPO + '/contents/' + CONFIG.GITHUB_FITXER;
}
function urlRepo() {
  return 'https://api.github.com/repos/' + CONFIG.GITHUB_USUARI + '/' + CONFIG.GITHUB_REPO;
}
function capGitHub() {
  return { Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' };
}

/** Explica en català què vol dir el codi que ha tornat GitHub. */
function problemaGitHub(codi) {
  if (codi === 404) return 'GitHub diu que no troba el repositori "' + CONFIG.GITHUB_USUARI + '/' + CONFIG.GITHUB_REPO +
    '". O està mal escrit al CONFIG, o el token ha caducat o no té permís sobre aquest repositori ' +
    '(GitHub respon 404 i no 403 per no dir si el repositori existeix).';
  if (codi === 401) return 'GitHub no accepta el token: mira la propietat GITHUB_TOKEN.';
  if (codi === 403) return 'GitHub ha denegat la petició (permisos o límit de peticions).';
  return 'GitHub ha respost ' + codi + '.';
}

/** Comprova que puc arribar al repositori. Torna '' si tot va bé, o el problema. */
function comprovarGitHub() {
  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')) {
    return 'No hi ha cap GITHUB_TOKEN a les propietats de l\'script.';
  }
  var r = UrlFetchApp.fetch(urlRepo(), { headers: capGitHub(), muteHttpExceptions: true });
  vigilarToken(r);
  return r.getResponseCode() === 200 ? '' : problemaGitHub(r.getResponseCode());
}

/**
 * GitHub diu quan caduca el token en una capçalera de cada resposta.
 * Quan falta menys d'un mes, avisa per correu. Un avís per setmana, no més.
 */
function vigilarToken(resposta) {
  try {
    var caps = resposta.getAllHeaders(), quan = '';
    Object.keys(caps).forEach(function (k) {
      if (k.toLowerCase() === 'github-authentication-token-expiration') quan = String(caps[k]);
    });
    if (!quan) return;  // els tokens clàssics no la porten

    var data = new Date(quan.replace(' UTC', 'Z').replace(' ', 'T'));
    if (isNaN(data)) return;
    var dies = Math.floor((data - new Date()) / 86400000);
    Logger.log('El token de GitHub caduca el ' + quan + ' (d\'aquí a ' + dies + ' dies).');
    if (dies > 30) return;

    var props = PropertiesService.getScriptProperties();
    var ultim = props.getProperty('AVIS_TOKEN');
    if (ultim && (Date.now() - +ultim) < 7 * 86400000) return;
    props.setProperty('AVIS_TOKEN', String(Date.now()));

    MailApp.sendEmail(CONFIG.AVIS_EMAIL,
      'Menú menjador: el token de GitHub caduca d\'aquí a ' + dies + ' dies',
      'El token que fa servir l\'script per publicar els menús caduca el ' + quan + '.\n\n' +
      'Quan caduqui, la web es quedarà amb el mes que hi hagi i no s\'actualitzarà més.\n\n' +
      'Per renovar-lo:\n' +
      '1. https://github.com/settings/personal-access-tokens\n' +
      '2. Obre el token del menjador i fes "Regenerate", o crea\'n un de nou amb\n' +
      '   accés només al repositori ' + CONFIG.GITHUB_USUARI + '/' + CONFIG.GITHUB_REPO + '\n' +
      '   i permís Contents: Read and write.\n' +
      '3. Copia\'l a Apps Script → Configuració del projecte → Propietats de l\'script\n' +
      '   → GITHUB_TOKEN (substitueix el valor que hi ha).\n' +
      '4. Executa configurar(). Ha de sortir "GitHub: hi arribo bé".\n');
  } catch (e) { Logger.log('No he pogut mirar la caducitat del token: ' + e.message); }
}

/**
 * Llegeix el menus.json publicat.
 * Torna null NOMÉS si el repositori es veu bé i el fitxer encara no hi és.
 * Si no puc arribar al repositori, peto: val més aturar-se que no pas tornar a
 * començar de zero i publicar un fitxer que es cruspeixi tots els altres mesos.
 */
function llegirDeGitHub() {
  var r = UrlFetchApp.fetch(urlGitHub() + '?ref=' + CONFIG.GITHUB_BRANCA, { headers: capGitHub(), muteHttpExceptions: true });
  var codi = r.getResponseCode();
  if (codi === 200) {
    var j = JSON.parse(r.getContentText());
    return JSON.parse(Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8'));
  }
  var problema = comprovarGitHub();
  if (problema) throw new Error(problema);
  if (codi === 404) { Logger.log('El ' + CONFIG.GITHUB_FITXER + ' encara no hi és: començo de zero.'); return null; }
  throw new Error(problemaGitHub(codi));
}

function escriureAGitHub(dades) {
  // Xarxa de seguretat: no publiquis mai un fitxer escanyolit per sobre d'un de bo.
  var dies = Object.keys(dades.dies || {}).length;
  if (dies < 10) throw new Error('No publico: només hi hauria ' + dies + ' dies. Alguna cosa ha anat malament en llegir els PDF.');

  var r = UrlFetchApp.fetch(urlGitHub() + '?ref=' + CONFIG.GITHUB_BRANCA, { headers: capGitHub(), muteHttpExceptions: true });
  var sha = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()).sha : undefined;
  var cos = { message: 'Menús actualitzats', branch: CONFIG.GITHUB_BRANCA,
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(dades), 'application/json').getBytes()) };
  if (sha) cos.sha = sha;
  var w = UrlFetchApp.fetch(urlGitHub(), { method: 'put', headers: capGitHub(), contentType: 'application/json', payload: JSON.stringify(cos), muteHttpExceptions: true });
  if (w.getResponseCode() >= 300) throw new Error(problemaGitHub(w.getResponseCode()) + ' · ' + w.getContentText().slice(0, 200));
}

// ===================== LECTOR DEL PDF =====================
var MESOS = ['GENER','FEBRER','MARÇ','ABRIL','MAIG','JUNY','JULIOL','AGOST','SETEMBRE','OCTUBRE','NOVEMBRE','DESEMBRE'];
var DIES = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres'];

function parsejarMenu(text) {
  var t = String(text).replace(/\\-/g, '-').replace(/\s+/g, ' ').trim();

  // 1. Mes i any
  var mRe = new RegExp('(' + MESOS.join('|') + ') (20\\d\\d)', 'i');
  var mm = t.match(mRe);
  if (!mm) throw new Error('No trobo el mes i l\'any al PDF');
  var mes = MESOS.indexOf(mm[1].toUpperCase().replace('MARC','MARÇ'));
  var any = parseInt(mm[2], 10);

  // 2. Separar graella (dalt) i llistat d'al·lèrgens (baix)
  var iLlistat = t.search(/Setmana[^\d]{0,24}1\s*(?:\S{1,4}\s+)?Dilluns\s+Primer/);
  if (iLlistat < 0) throw new Error('No trobo el llistat de plats (Setmana 1 Dilluns Primer)');
  var graella = t.slice(0, iLlistat);
  var llistat = t.slice(iLlistat);
  var iFi = llistat.search(/ Els al·lèrgens| Pa blanc\/integral:| a blanc\/integral:/);
  if (iFi > 0) llistat = llistat.slice(0, iFi);

  // 3. Files del llistat: "Setmana N Dia Ordre plat <Etiqueta>"
  // El número de setmana de vegades queda separat pel text que s'hi cola enmig
  // (p. ex. "Setmana (no esp 1 Dilluns"), així que permeto text sense xifres entremig.
  var re = /Setmana[^\d]{0,24}(\d)\s*(?:\S{1,4}\s+)?(Dilluns|Dimarts|Dimecres|Dijous|Divendres)\s+(Primer|Segon|Guarnició|Postres)\s/g;
  var hits = [], h;
  while ((h = re.exec(llistat)) !== null) hits.push({ s: +h[1], d: h[2], o: h[3], ini: h.index, fi: re.lastIndex });
  if (hits.length < 10) throw new Error('Massa pocs plats detectats (' + hits.length + ')');
  var trossos = hits.map(function (x, i) {
    return llistat.slice(x.fi, i + 1 < hits.length ? hits[i + 1].ini : llistat.length).trim();
  });
  // L'etiqueta de la dieta (p. ex. "Basal") és el sufix comú de tots els trossos menys l'últim
  var etiqueta = sufixComu(trossos.slice(0, -1));
  var netejar = function (s, esUltim) {
    if (etiqueta && s.slice(-etiqueta.length) === etiqueta) s = s.slice(0, -etiqueta.length);
    s = treureAllergens(s).trim();
    return (s === '-' || s === '') ? '' : completarNom(s, graella);
  };

  // 4. Data del dilluns de la setmana 1
  var primer = new Date(Date.UTC(any, mes, 1));
  var dw = primer.getUTCDay(); // 0 dg ... 6 ds
  var offset = (dw === 0) ? 1 : (dw === 6 ? 2 : 1 - dw);
  var dilluns1 = new Date(Date.UTC(any, mes, 1 + offset));

  var dies = {};
  hits.forEach(function (x, i) {
    var dt = new Date(dilluns1.getTime() + ((x.s - 1) * 7 + DIES.indexOf(x.d)) * 86400000);
    var k = dt.toISOString().slice(0, 10);
    dies[k] = dies[k] || { primer: '', segon: '', guarnicio: '', postres: '', kcal: null };
    var camp = { Primer: 'primer', Segon: 'segon', 'Guarnició': 'guarnicio', Postres: 'postres' }[x.o];
    dies[k][camp] = netejar(trossos[i], i === hits.length - 1);
  });

  // 5. Postres i kcal des de la graella (en ordre, dia a dia)
  var claus = Object.keys(dies).sort();
  var actius = claus.filter(function (k) { return dies[k].primer || dies[k].segon; });
  var postres = graella.match(/\bPa (?:blanc\/integral|integral|blanc|sense gluten|sense lactosa|\S+) i (?:fruita fresca|iogurt(?: natural| de soja| sense lactosa)?|\S+ \S+)/g) || [];
  if (postres.length === actius.length) actius.forEach(function (k, i) { if (!dies[k].postres) dies[k].postres = postres[i]; });
  var kcal = (graella.match(/Kcal: ([\d.,]+)/g) || []).map(function (s) { return Math.round(parseFloat(s.replace('Kcal: ', '').replace(',', '.'))); });
  if (kcal.length === claus.length) claus.forEach(function (k, i) { if (kcal[i] > 0) dies[k].kcal = kcal[i]; });

  // 6. Dinars especials: dies sense plats però amb una nota a la graella
  notesDeLaGraella(graella).forEach(function (nota, setmana) {
    if (!nota) return;
    var buits = [];
    for (var j = 0; j < 5; j++) {
      var dt = new Date(dilluns1.getTime() + (setmana * 7 + j) * 86400000);
      var kk = dt.toISOString().slice(0, 10);
      if (dies[kk] && !dies[kk].primer && !dies[kk].segon && +kk.slice(5, 7) - 1 === mes) buits.push(kk);
    }
    if (buits.length === 1) dies[buits[0]].nota = nota;  // només si no hi ha dubte de quin dia és
  });

  // Treure dies fora del mes que estiguin buits; la resta, festius
  claus.forEach(function (k) {
    var d = dies[k];
    if (!d.primer && !d.segon && !d.nota) {
      if (+k.slice(5, 7) - 1 !== mes) delete dies[k]; else d.festiu = true;
    }
  });
  return { mes: mes, any: any, etiqueta: etiqueta, dies: dies };
}

/**
 * Busca a la graella els dinars especials ("Dinar especial castanyada" i semblants).
 * Torna una nota per setmana, o cadena buida si no n'hi ha cap.
 * La graella ve partida en blocs per les files de números: "23 24 25 26 27".
 */
// El nucli de la nota d'un dinar especial. El que ve després s'hi afegeix
// paraula per paraula (vegeu notesDeLaGraella), no d'una revolada.
var ESPECIALS = /(?:dinar|sopar|àpat|apat|berenar|men[úu])\s+especial|dinar\s+de\s+(?:nadal|carnestoltes|fi\s+de\s+curs|sant\s+jordi)|castanyada|panellets|xocolatada|p[ií]cnic|barbacoa|cal[çc]otada/i;
// Paraules que ja són una altra cosa del PDF i on s'ha de tallar la nota
var TALL = /^(?:Llistat|Kcal|Pots|Els|La|El|Men[úu]|Pa|Setmana|Dieta|Fruita|Enciam|Patates|Arròs|Crema|Sopa|DILLUNS|DIMARTS|DIMECRES|DIJOUS|DIVENDRES|FESTIU)$/;

/**
 * Busca a la graella els dinars especials ("Dinar especial castanyada" i semblants).
 * Torna una nota per setmana, o cadena buida si no n'hi ha cap.
 * La graella ve partida en blocs per les files de números: "23 24 25 26 27".
 *
 * La nota s'allarga mentre les paraules segueixin l'estil del nucli: si el PDF
 * ho escriu en majúscules, mentre siguin majúscules; si no, mentre siguin
 * minúscules. Els noms dels plats comencen amb majúscula, i així no s'hi colen.
 */
function notesDeLaGraella(graella) {
  var blocs = String(graella).split(/\s(?=\d{2} \d{2} \d{2} \d{2} \d{2}\s)/);
  // El primer tros només és capçalera si no comença ja amb una fila de números.
  if (blocs.length > 1 && !/^\d{2} \d{2} \d{2} \d{2} \d{2}\s/.test(blocs[0])) blocs = blocs.slice(1);

  return blocs.map(function (b) {
    var pla = String(b).replace(/\s+/g, ' ');
    var m = pla.match(ESPECIALS);
    if (!m) return '';
    var nucli = m[0].replace(/\s+/g, ' ');
    var majuscules = (nucli === nucli.toUpperCase());
    var paraules = pla.slice(m.index + m[0].length).trim().split(' ');
    var cua = [];
    for (var i = 0; i < paraules.length && cua.length < 8; i++) {
      var p = paraules[i];
      if (!p || TALL.test(p)) break;
      var nomes = p.replace(/[^\wÀ-ÿ]/g, '');
      if (!nomes) break;
      if (majuscules) { if (nomes !== nomes.toUpperCase()) break; }
      else { if (nomes.charAt(0) !== nomes.charAt(0).toLowerCase()) break; }
      cua.push(p);
    }
    var t = (nucli + ' ' + cua.join(' ')).trim().replace(/[\s,;:.-]+$/, '');
    if (t.length < 4) return '';
    if (t === t.toUpperCase()) t = t.toLowerCase();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    // els noms propis de les festes van amb majúscula
    return t.replace(/\b(nadal|sant jordi|carnestoltes|pasqua|reis|tots sants)\b/gi, function (x) {
      return x.replace(/\b[a-zà-ÿ]/g, function (c) { return c.toUpperCase(); });
    });
  });
}

function sufixComu(arr) {
  if (!arr.length) return '';
  var paraules = arr.map(function (s) { return s.split(' '); });
  var suf = [];
  for (var i = 1; ; i++) {
    var w = paraules[0][paraules[0].length - i];
    if (w === undefined) break;
    var ok = paraules.every(function (p) { return p.length > i && p[p.length - i] === w; });
    if (!ok) break;
    suf.unshift(w);
  }
  return suf.join(' ');
}

/**
 * Treu del nom del plat els al·lèrgens que de vegades s'hi enganxen
 * ("Paella marinera (peix i marisc) LLET OU PEIX MOL·LUSCS ...").
 * Els noms de plats van en minúscules, així que qualsevol tros de dues o més
 * paraules seguides en MAJÚSCULES no forma part del plat.
 */
function treureAllergens(s) {
  var MAJ = "[A-ZÀÁÈÉÍÏÒÓÚÜÇÑ][A-ZÀÁÈÉÍÏÒÓÚÜÇÑ0-9·’-]+";
  var re = new RegExp("(?:^|\\s)" + MAJ + "(?:\\s+" + MAJ + ")+(?=\\s|$)", "g");
  return String(s).replace(re, " ").replace(/\s{2,}/g, " ").trim();
}

// El llistat talla els noms llargs: els completem amb la graella
function completarNom(nom, graella) {
  var obertes = (nom.match(/\(/g) || []).length - (nom.match(/\)/g) || []).length;
  if (obertes <= 0 && nom.length < 50) return nom;
  var i = graella.indexOf(nom);
  if (i < 0) return obertes > 0 ? nom + '…)' : nom;
  var resta = graella.slice(i + nom.length);
  if (obertes > 0) { var j = resta.indexOf(')'); if (j >= 0 && j < 60) return nom + resta.slice(0, j + 1); }
  return nom;
}
