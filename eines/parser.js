// Lector dels PDF de menús. Mateix codi que el de Code.gs (Apps Script).
// No el toquis aquí sense tocar-lo allà: han de llegir igual.
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


module.exports={parsejarMenu:parsejarMenu};
