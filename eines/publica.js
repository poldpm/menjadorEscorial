#!/usr/bin/env node
/**
 * Publica un menú al menus.json, comprovant abans que la lectura sigui bona.
 *
 *   node eines/publica.js estat
 *       Diu què hi ha publicat ara mateix i si va endarrerit.
 *
 *   node eines/publica.js afegeix --clau sense-gluten --nom "Sense gluten" --ordre 1 \
 *                                 --pdf <id_del_drive> --text fitxer.txt
 *       Llegeix el text del PDF, el comprova i l'afegeix. Si alguna comprovació
 *       falla, NO toca el menus.json i surt amb error.
 *
 *   node eines/publica.js nota --dia 2026-12-19 --text "Dinar especial de Nadal"
 *       Posa una nota a un dia sense plats (dinars especials).
 */
var fs = require('fs');
var path = require('path');
var parser = require(path.join(__dirname, 'parser.js'));

var ARREL = path.join(__dirname, '..');
var FITXER = path.join(ARREL, 'menus.json');
var DIES_A_GUARDAR = 120;
var MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

// ---------- comprovacions ----------
// Qualsevol d'aquestes que falli vol dir que el PDF s'ha llegit malament.
// Val més no publicar res que publicar un menú equivocat: ho llegeixen famílies.
function comprovar(r, text) {
  var problemes = [];
  var dies = Object.keys(r.dies).sort();

  if (dies.length < 15) problemes.push('només ' + dies.length + ' dies (n\'hi hauria d\'haver uns 25)');

  var ambPlats = dies.filter(function (k) { return r.dies[k].primer || r.dies[k].segon; });
  if (ambPlats.length < 12) problemes.push('només ' + ambPlats.length + ' dies amb plats');

  var pla = String(text).replace(/\s+/g, ' ');
  var MAJ = /(?:^|\s)[A-ZÀÁÈÉÍÏÒÓÚÜÇÑ][A-ZÀÁÈÉÍÏÒÓÚÜÇÑ0-9·’-]+(?:\s+[A-ZÀÁÈÉÍÏÒÓÚÜÇÑ][A-ZÀÁÈÉÍÏÒÓÚÜÇÑ0-9·’-]+)+/;

  dies.forEach(function (k) {
    var d = r.dies[k];
    ['primer', 'segon', 'guarnicio', 'postres'].forEach(function (camp) {
      var v = d[camp];
      if (!v) return;
      if (/\bSetmana\b|\bSin\b|\bBasal\b|Llistat d|Dieta |Ordre /.test(v)) problemes.push(k + ' ' + camp + ': hi ha text del llistat → "' + v + '"');
      if (MAJ.test(v)) problemes.push(k + ' ' + camp + ': hi ha al·lèrgens enganxats → "' + v + '"');
      if (v.length > 95) problemes.push(k + ' ' + camp + ': massa llarg → "' + v.slice(0, 60) + '…"');
      if (pla.indexOf(v) < 0) problemes.push(k + ' ' + camp + ': no surt literalment al PDF → "' + v + '"');
    });
  });
  return problemes;
}

function llegir() {
  if (!fs.existsSync(FITXER)) return { dietes: {}, pdfs: {}, dies: {} };
  return JSON.parse(fs.readFileSync(FITXER, 'utf8'));
}
function desar(d) {
  var limit = new Date(Date.now() - DIES_A_GUARDAR * 86400000).toISOString().slice(0, 10);
  Object.keys(d.dies).forEach(function (k) { if (k < limit) delete d.dies[k]; });
  var vives = {};
  Object.keys(d.dies).forEach(function (k) { Object.keys(d.dies[k]).forEach(function (c) { vives[c] = 1; }); });
  Object.keys(d.dietes).forEach(function (c) { if (!vives[c]) delete d.dietes[c]; });
  d.actualitzat = new Date().toISOString();
  fs.writeFileSync(FITXER, JSON.stringify(d));
}
function args() {
  var a = {}, v = process.argv.slice(3);
  for (var i = 0; i < v.length; i++) if (v[i].slice(0, 2) === '--') a[v[i].slice(2)] = v[i + 1];
  return a;
}

// ---------- estat ----------
function estat() {
  var d = llegir();
  var dies = Object.keys(d.dies).sort();
  var edat = d.actualitzat ? Math.floor((Date.now() - new Date(d.actualitzat)) / 86400000) : 999;
  console.log('Actualitzat fa ' + edat + ' dies (' + (d.actualitzat || '?') + ')');
  console.log('Dies publicats: ' + dies.length + (dies.length ? '  (' + dies[0] + ' → ' + dies[dies.length - 1] + ')' : ''));
  console.log('Dietes: ' + Object.keys(d.dietes).map(function (c) { return c; }).join(', '));

  var permes = {};
  dies.forEach(function (k) {
    var m = k.slice(0, 7);
    permes[m] = permes[m] || {};
    Object.keys(d.dies[k]).forEach(function (c) { permes[m][c] = 1; });
  });
  console.log('\nPer mes:');
  Object.keys(permes).sort().forEach(function (m) {
    console.log('  ' + m + ': ' + Object.keys(permes[m]).sort().join(', '));
  });

  // El mes en curs ha d'estar publicat sempre. El següent, l'empresa el penja
  // els últims dies del mes (el novembre de 2026, el dia 30): fins a l'1 que no
  // hi sigui encara és normal, i només cal mirar-ho, no alarmar-se.
  var ara = new Date();
  var actual = mesClau(ara, 0), vinent = mesClau(ara, 1);
  var faltaActual = !permes[actual] || !permes[actual].general;
  var faltaVinent = !permes[vinent] || !permes[vinent].general;

  console.log('');
  if (faltaActual) console.log('FALTA EL MENÚ DEL MES EN CURS (' + actual + '). Això sí que és un problema.');
  else console.log('El mes en curs (' + actual + ') hi és.');

  if (ara.getDate() >= 27) {
    console.log(faltaVinent
      ? 'Pendent: el mes vinent (' + vinent + ') encara no hi és. Mira si ja han penjat els PDF.'
      : 'El mes vinent (' + vinent + ') ja hi és.');
  }
  if (edat > 40) console.log('AVÍS: fa més de 40 dies que no s\'actualitza.');
  process.exitCode = (faltaActual || edat > 40) ? 1 : 0;
}
function mesClau(d, suma) {
  var x = new Date(d.getFullYear(), d.getMonth() + suma, 1);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
}

// ---------- afegeix ----------
function afegeix() {
  var a = args();
  ['clau', 'nom', 'text'].forEach(function (k) { if (!a[k]) { console.error('Falta --' + k); process.exit(2); } });
  var text = fs.readFileSync(a.text, 'utf8');
  var r;
  try { r = parser.parsejarMenu(text); }
  catch (e) { console.error('NO PUBLICO: el lector ha fallat → ' + e.message); process.exit(1); }

  var problemes = comprovar(r, text);
  if (problemes.length) {
    console.error('NO PUBLICO, la lectura no quadra (' + problemes.length + ' problemes):');
    problemes.slice(0, 12).forEach(function (p) { console.error('  · ' + p); });
    process.exit(1);
  }

  var d = llegir();
  var mes = r.any + '-' + String(r.mes + 1).padStart(2, '0');
  var nous = 0;
  d.dietes[a.clau] = { nom: a.nom, ordre: a.ordre ? +a.ordre : 50 };
  if (a.pdf) {
    d.pdfs[mes + '|' + a.clau] = 'https://drive.google.com/file/d/' + a.pdf + '/view';
    // el PDF d'un mes també cobreix els primers dies del mes següent
    var seg = mesClau(new Date(r.any, r.mes, 1), 1);
    if (!d.pdfs[seg + '|' + a.clau]) d.pdfs[seg + '|' + a.clau] = d.pdfs[mes + '|' + a.clau];
  }
  Object.keys(r.dies).forEach(function (dia) {
    if (!d.dies[dia]) { d.dies[dia] = {}; }
    if (!d.dies[dia][a.clau]) nous++;
    // una nota escrita a mà no es perd en tornar a llegir el PDF
    var abans = d.dies[dia][a.clau];
    d.dies[dia][a.clau] = r.dies[dia];
    if (abans && abans.nota && !r.dies[dia].nota) {
      d.dies[dia][a.clau].nota = abans.nota;
      delete d.dies[dia][a.clau].festiu;
    }
  });
  desar(d);
  console.log('PUBLICAT  ' + a.clau + '  ' + MESOS[r.mes] + ' ' + r.any +
              '  (' + Object.keys(r.dies).length + ' dies, ' + nous + ' de nous)');
}

// ---------- nota ----------
function nota() {
  var a = args();
  if (!a.dia || !a.text) { console.error('Cal --dia AAAA-MM-DD i --text "..."'); process.exit(2); }
  var d = llegir();
  if (!d.dies[a.dia]) { console.error('El dia ' + a.dia + ' no hi és.'); process.exit(1); }
  Object.keys(d.dies[a.dia]).forEach(function (c) {
    d.dies[a.dia][c].nota = a.text;
    delete d.dies[a.dia][c].festiu;
  });
  desar(d);
  console.log('Nota posada al ' + a.dia + ' en ' + Object.keys(d.dies[a.dia]).length + ' dietes.');
}

var ordre = process.argv[2];
if (ordre === 'estat') estat();
else if (ordre === 'afegeix') afegeix();
else if (ordre === 'nota') nota();
else { console.error('Ordres: estat | afegeix | nota'); process.exit(2); }
