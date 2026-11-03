# Com actualitzar els menús

Aquest repositori publica la web dels menús del menjador de Vedruna Escorial Vic
(GitHub Pages). El contingut surt dels PDF mensuals que l'empresa del menjador
penja al Drive.

Hi ha **dues vies** que fan la mateixa feina, i no passa res si totes dues
funcionen alhora:

1. **Apps Script** (al compte de Google d'en Pol). S'executa cada matí sol.
2. **Aquesta via**, que fa en Claude des d'una tasca programada. És la xarxa de
   seguretat: si l'Apps Script s'atura, com va passar l'octubre de 2026, aquesta
   continua.

---

## Passos

### 1. Mirar com estem

```bash
node eines/publica.js estat
```

Diu quins mesos i dietes hi ha publicats i si falta el mes actual. Si acaba amb
"No falta cap mes" i fa pocs dies que s'ha actualitzat, **no cal fer res més**.

### 2. Buscar els PDF al Drive

Són a la carpeta arrel del menjador:

- Carpeta: `0B5AqbjrBoZq7UUtzOGNldEdWTFU` (resourcekey `0-8k0F8YGmfAhaIZ1bBk16rg`)
- Hi ha una subcarpeta `Menús` (`0B5AqbjrBoZq7LTdTenBjWVAwNVk`), que també cal mirar.

Cerca amb `parentId = '<carpeta>' and trashed = false`. Els menús es diuen
`ESCORIAL-<MES> <ANY>...pdf`. **El cercador general del Drive no els indexa:**
cal entrar per la carpeta.

Si no hi són, mira també la pàgina del Sites, que és on de vegades els pengen:
<https://sites.google.com/vedruna.cat/escorialmenjador/menús-escola>

### 3. Llegir cada PDF i publicar-lo

Per a cada PDF que encara no estigui publicat (del mes actual endavant):

1. Llegeix-ne el text amb el connector del Drive (`read_file_content`).
2. Desa'l tal qual a un fitxer, sense arreglar-lo ni resumir-lo.
3. Publica'l:

```bash
node eines/publica.js afegeix \
  --clau sense-gluten --nom "Sense gluten" --ordre 1 \
  --pdf <id_del_fitxer_al_drive> --text <el_fitxer_de_text>
```

`publica.js` comprova la lectura abans de tocar res: nombre de dies, que cap
plat no porti text del llistat ni al·lèrgens enganxats, i que tots els plats
surtin literalment al PDF. **Si alguna cosa no quadra, no publica i surt amb
error.** Això és volgut: val més no publicar res que publicar un menú equivocat.

Claus i ordre de les dietes (fes-les servir sempre iguals):

| clau | nom | ordre |
|---|---|---|
| `general` | General | 0 |
| `sense-gluten` | Sense gluten | 1 |
| `sense-lactosa` | Sense lactosa | 2 |
| `sense-ou` | Sense ou | 3 |
| `sense-peix` | Sense peix ni marisc | 4 |
| `sense-plv` | Sense PLV | 5 |
| `sense-fructosa` | Sense fructosa ni sorbitol | 6 |

Si apareix una dieta nova, posa-li una clau en minúscules i amb guions, i ordre 7
o més.

### 4. Dinars especials

Alguns dies el PDF no diu els plats, només que hi ha un dinar especial
(castanyada, Nadal...). El lector ho detecta sol, però si no ho enganxa:

```bash
node eines/publica.js nota --dia 2026-12-19 --text "Dinar especial de Nadal"
```

Important: aquests dies **sí que hi ha menjador**. Si es queden sense nota, la
web diu "No hi ha servei de menjador", que és fals.

### 5. Comprovar i pujar

```bash
node eines/publica.js estat
```

Obre la web localment (`python3 -m http.server`) i mira la setmana actual abans
de pujar res. Després, commit en català i `git push`.

⚠️ **El push publica la web a l'instant.** Famílies i mestres la veuen al moment.
Puja només quan el canvi està fet i comprovat.

---

## Què dir-li a en Pol

- Si ha calgut publicar algun mes: digues quins mesos i dietes han entrat.
- Si `publica.js` ha rebutjat algun PDF: digues quin i per què, i que caldrà
  mirar-lo. Això vol dir que l'empresa ha canviat el format del PDF.
- Si l'Apps Script ja ho havia fet tot i no calia fer res, digues-ho en una
  línia i prou.
- Res de detalls tècnics a la web: qui la llegeix són les famílies.

## Si el format del PDF canvia

El lector és `eines/parser.js`, i és **el mateix codi** que hi ha dins del
`Code.gs` de l'Apps Script. Si l'has de tocar, toca'ls tots dos, o les dues vies
deixaran de llegir igual.

Coses que ja han passat i que el lector contempla:

- Els al·lèrgens de la capçalera s'enganxen al nom del plat (`Paella marinera
  LLET OU PEIX...`). Es treuen perquè els plats mai no van en majúscules.
- El número de setmana surt partit pel títol (`Setmana (no 1 e Dilluns`).
- El nom del plat queda tallat al llistat i es completa amb la graella de dalt.
- L'etiqueta de la dieta (`Basal`, `Sin gluten`...) va enganxada a cada plat.
