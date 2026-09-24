// «Saber más» en los 16 idiomas: la cifra de idiomas va en la ficha y ningún párrafo se
// queda con una frase suelta.
//
// Lo que se vio el 2026-09-23: la descripción terminaba en «16 idiomas.» y el modal agrupa
// las frases de dos en dos, así que con un número impar esa frase salía sola, como un
// párrafo de dos palabras que parecía un resto. En Twitch pasaba en 15 de los 16 idiomas
// desde la 1.3.0 (una frase más cambió la paridad) y en Kick solo en japonés. Dos arreglos,
// y este test mira los dos:
//
//   1. La cifra deja de ser prosa: la ficha trae una fila «Idiomas» contada del propio
//      i18n, y la frase se quita de los 16 textos.
//   2. El agrupado une al párrafo anterior la frase que quede sola al final. Sin esto no
//      vale con cuadrar el texto: cada frase que se añade cambia la paridad.
//
// No se prueba una copia de las funciones: se sacan del script y se corren con su i18n
// real, en los 16 idiomas. La primera comprobación es el control —el mismo agrupado SIN la
// guarda deja frases sueltas en algún idioma—, porque si no las dejara, el caso 2 pasaría
// en verde sin ejercitar nada.
const fs = require('fs');
const path = require('path');

const FICHERO = process.env.TW_SCRIPT || process.env.KICK_SCRIPT ||
    path.join(__dirname, '..', path.basename(path.join(__dirname, '..')) + '.user.js');
const src = fs.readFileSync(FICHERO, 'utf8');

// El literal del i18n, con un escáner que se salta cadenas y comentarios para no contar
// las llaves que haya dentro del texto.
function literalDesde(s, inicio) {
    let prof = 0;
    for (let i = inicio; i < s.length; i++) {
        const c = s[i];
        if (c === '"' || c === "'" || c === '`') {
            for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
            continue;
        }
        if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
        if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2) + 1; continue; }
        if (c === '{') prof++;
        if (c === '}' && --prof === 0) return s.slice(inicio, i + 1);
    }
    throw new Error('literal sin cerrar');
}
const i18n = new Function('return ' + literalDesde(src, src.indexOf('{', src.indexOf('const i18n = {'))))();
const LANGS = Object.keys(i18n);

// Las dos funciones del agrupado, tal cual están en el script. `lang` es una variable del
// script: se les pasa como parámetro del envoltorio.
const desde = src.indexOf('function _splitSentences');
const hasta = src.indexOf('function showInfoModal');
if (desde < 0 || hasta < desde) throw new Error('no se encuentran _splitSentences/_infoParagraphs');
const funciones = src.slice(desde, hasta).replace(/\/\*\*[\s\S]*?\*\/\s*$/, '');
const cargar = (codigo) => new Function('lang', codigo + '\nreturn { _splitSentences, _infoParagraphs };');
const conGuarda = lang => cargar(funciones)(lang);
// El control: la misma función sin el bloque de la guarda.
const sinGuardaSrc = funciones.replace(/\n\s*\/\/ Una frase sola al final[\s\S]*?out\.pop\(\);\n\s*\}/, '');
const sinGuarda = lang => cargar(sinGuardaSrc)(lang);

const fallos = [];
const ok = m => console.log('  ok    ' + m);

if (LANGS.length !== 16) fallos.push(`se esperaban 16 idiomas en el i18n y hay ${LANGS.length}`);
else ok(`16 idiomas en el i18n: ${LANGS.join(' ')}`);

// --- La fila de la ficha -------------------------------------------------------------
if (!/value: String\(Object\.keys\(i18n\)\.length\)/.test(src)) {
    fallos.push('la ficha no trae la fila de idiomas contada del i18n');
} else ok('la fila de idiomas de la ficha sale de Object.keys(i18n).length');

// La etiqueta en los 16, y traducida: los dos fallos de siempre son la clave que falta y
// la que lleva el inglés copiado dentro.
const enLabel = (i18n.en || {}).scriptInfoLanguages;
const sinEtiqueta = LANGS.filter(l => !String((i18n[l] || {}).scriptInfoLanguages || '').trim());
const copiadas = LANGS.filter(l => l !== 'en' && i18n[l].scriptInfoLanguages === enLabel);
if (sinEtiqueta.length) fallos.push(`sin etiqueta de idiomas: ${sinEtiqueta.join(', ')}`);
if (copiadas.length) fallos.push(`etiqueta con el inglés copiado: ${copiadas.join(', ')}`);
if (!sinEtiqueta.length && !copiadas.length) ok('la etiqueta está en los 16 y traducida');

// Con la misma puntuación que la de «Autor», que es la fila de al lado.
const puntuacion = s => (String(s).match(/\s*[:：]\s*$/) || [''])[0];
const distinta = LANGS.filter(l => puntuacion(i18n[l].scriptInfoLanguages) !== puntuacion(i18n[l].scriptInfoAuthor));
if (distinta.length) fallos.push(`etiqueta con otra puntuación que «Autor»: ${distinta.join(', ')}`);
else ok('y con los mismos dos puntos que «Autor» en cada idioma');

// --- La frase ya no está en la prosa -----------------------------------------------------
// La palabra puede llevar espacio dentro («16 ngôn ngữ.», «16개 언어.»), así que no vale \S.
const COLA = /(?:支持\s*)?16\s*[^.。।]{0,14}[.。।]$/;
const conCola = LANGS.filter(l => COLA.test(String(i18n[l].scriptInfoDescriptionText || '').trim()));
if (conCola.length) fallos.push(`la descripción sigue terminando en la cifra de idiomas: ${conCola.join(', ')}`);
else ok('ninguna descripción termina ya en «16 idiomas.»');

// --- El agrupado ---------------------------------------------------------------------
const sueltas = (mod, l) => {
    const { _splitSentences, _infoParagraphs } = mod(l);
    const texto = i18n[l].scriptInfoDescriptionText;
    const parrafos = _infoParagraphs(texto, 2);
    const ultima = parrafos[parrafos.length - 1];
    return parrafos.length > 1 && _splitSentences(ultima).length === 1 ? ultima : null;
};

const control = LANGS.filter(l => sueltas(sinGuarda, l));
if (!control.length) {
    fallos.push('CONTROL: sin la guarda ningún idioma deja una frase sola, así que el caso de abajo no prueba nada');
} else ok(`CONTROL: sin la guarda quedaría una frase sola en ${control.length} idioma(s): ${control.join(' ')}`);

const conFrase = LANGS.map(l => [l, sueltas(conGuarda, l)]).filter(([, u]) => u);
if (conFrase.length) {
    fallos.push('queda una frase sola al final de «Saber más»: ' +
        conFrase.map(([l, u]) => `${l} «${u.slice(0, 50)}»`).join(' · '));
} else ok('con la guarda, ningún idioma termina en una frase suelta');

// Y la guarda no pierde texto: lo unido es exactamente lo que había.
const perdido = LANGS.filter(l => {
    const { _splitSentences, _infoParagraphs } = conGuarda(l);
    const texto = i18n[l].scriptInfoDescriptionText;
    return _splitSentences(_infoParagraphs(texto, 2).join(' ')).length !== _splitSentences(texto).length;
});
if (perdido.length) fallos.push(`el agrupado pierde o parte frases en: ${perdido.join(', ')}`);
else ok('y no pierde ni parte ninguna frase');

// --- Y en pantalla: la ficha abierta de verdad, en español ----------------------------
// Lo de arriba lee el dato; esto comprueba que la fila se pinta —`i18n` tiene que estar al
// alcance de showInfoModal, o el clic en ℹ️ lanza—. El arnés de Kick aplana el texto del
// modal, así que etiqueta y valor salen pegados.
(async () => {
    const { run } = require('./harness');
    const r = await run({ url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        clickDrop: { sel: '#kick-drops-info-btn', at: 4000, z: '99999' }, waitMs: 6000 });
    const txt = r.modal.texto || '';
    if (!r.modal.abierto) fallos.push('en pantalla: el ℹ️ no abrió la ficha' + (r.modal.error ? ` (${r.modal.error})` : ''));
    else if (!txt.includes('Idiomas:16')) fallos.push(`en pantalla: la ficha no dice «Idiomas: 16»: ${txt.slice(0, 200)}`);
    else if (/16 idiomas\./.test(txt)) fallos.push('en pantalla: la descripción sigue diciendo «16 idiomas.»');
    else ok('en pantalla: la ficha dice «Idiomas: 16» y la descripción ya no lo repite');
    const errores = (r.logs || []).filter(l => /jsdomError|THROW|ReferenceError/.test(l));
    if (errores.length) fallos.push('en pantalla: errores al abrir la ficha: ' + errores.slice(0, 3).join(' | '));

    if (fallos.length) {
        console.log('\nFALLOS:\n - ' + fallos.join('\n - '));
        process.exit(1);
    }
    console.log('\nTODO EN VERDE');
    process.exit(0);
})();
