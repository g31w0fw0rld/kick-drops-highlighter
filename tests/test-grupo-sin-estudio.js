// El grupo que NO tiene estudio, y cuándo su gemelo de la API es un duplicado.
//
// Dos fallos encadenados, los dos vistos el 2026-08-20 en la pestaña de cerradas:
//
//   1. La tarjeta del grupo KICK salia como «KICK - 11 expired drops». Los DOS <p>
//      de la cabecera traen el contador —KICK es su propia organizacion, ahi no hay
//      estudio que leer— asi que distinguir `lg:hidden` de `max-lg:hidden` no
//      bastaba. Y ese titulo es la clave del cruce con la API, o sea que arrastra al
//      siguiente.
//   2. La MISMA campaña salia dos veces: la tarjeta del DOM y la entrada de la API,
//      que no se reconocen por titulo porque esa campaña no trae `category` —su
//      clave es el nombre de la campaña y la fila enseña el del juego—. Se cruzan
//      por el nombre de la sub-campaña, que si esta en las dos fuentes.
//
// Y el limite del arreglo 2, que es lo que mas importa aqui: solo es duplicado
// cuando el grupo tiene UNA sub-campaña, porque entonces la entrada de la API es la
// misma cosa que la tarjeta. Con varias, esa tarjeta es una vista mas fina —una
// sub-campaña concreta, con su ventana y su enfoque propio— y se queda.
//
// El fixture da los dos casos sin retocarlo: Old School RuneScape tiene UNA
// sub-campaña y KICK tiene ONCE.
//
// Los controles positivos son la mitad del test: un arreglo que se limitara a dejar
// todos los titulos sin estudio pasaria el punto 1 y romperia la pagina entera, y uno
// que deduplicara de más se comeria campañas que si hay que mostrar.
//
// El fixture sale de docs/dom-expired-2026-08.html sin retocarlo.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-expired-panel.html');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// Las tres SIN `category`, que es el caso: la clave de la API es el nombre de la
// campaña y la fila enseña el del juego, asi que por titulo no se cruzan.
const campaña = (nombre, org, extra) => Object.assign({
    name: nombre, status: 'expired',
    starts_at: iso(ahora - 40 * dia), ends_at: iso(ahora - 33 * dia),
    organization: { name: org },
    rewards: [{ id: nombre + '-r1', name: 'x1 entry', required_units: 60, image_url: 'x.png' }]
}, extra || {});

const apiCampaigns = [
    // 1:1 — la UNICA sub-campaña del grupo de Old School RuneScape. Es el duplicado.
    campaña('Armadyl Godsword Badge Drop', 'Jagex'),
    // Una de las ONCE del grupo KICK. No es un duplicado: es la vista fina.
    campaña("ED'S DROP", 'KICK'),
    // Control: cerrada que no esta en el DOM por ningun lado. Tiene que salir igual.
    campaña('Rust Wallpaper Pack', 'Facepunch Studios', { category: { name: 'Rust' } })
];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        apiCampaigns, waitMs: 16000,
        seed: { kick_drop_keywords: JSON.stringify(['kick', 'runescape', 'jagex', 'casino', 'rust']) }
    });

    const titulos = r.expired.map(c => c.title);
    console.log(JSON.stringify({
        cerrados: titulos,
        solapas: r.tabLabels,
        marcados: r.matches.map(m => m.title)
    }, null, 2));

    const fallos = [];

    // 1. El titulo del grupo sin estudio
    const kick = titulos.filter(t => /^KICK/.test(t));
    if (kick.length !== 1) fallos.push(`el grupo KICK sale ${kick.length} veces: ${kick.join(' / ')}`);
    else if (kick[0] !== 'KICK') fallos.push(`titulo del grupo KICK: «${kick[0]}» (deberia ser «KICK»)`);
    const conContador = titulos.filter(t => /\d+\s+(expired|claimed|active)?\s*drops?\b/i.test(t));
    if (conContador.length) fallos.push('titulo con el contador dentro: ' + conContador.join(' / '));

    // 2. Controles positivos: los estudios de verdad siguen ahi
    if (!titulos.includes('Old School RuneScape - Jagex'))
        fallos.push('se perdio el estudio de OSRS: ' + titulos.filter(t => /RuneScape/.test(t)).join(' / '));
    if (!titulos.some(t => /^Slots & Casino - Stake\.com$/.test(t)))
        fallos.push('se perdio el estudio de Slots: ' + titulos.filter(t => /Slots/.test(t)).join(' / '));

    // 3. El duplicado 1:1 se va
    if (titulos.some(t => /Armadyl/i.test(t)))
        fallos.push('la unica sub-campaña de OSRS entro otra vez desde la API: ' +
            titulos.filter(t => /Armadyl/i.test(t)).join(' / '));

    // 4. Y la vista fina de un grupo con varias se queda
    if (!titulos.some(t => /ED'S DROP/i.test(t)))
        fallos.push('se perdio la sub-campaña de un grupo con ONCE: KICK no es 1:1 y su tarjeta fina tiene que quedarse');

    // 5. Control: la cerrada que solo tiene la API sigue entrando
    if (!titulos.some(t => /^Rust/.test(t)))
        fallos.push('el cruce nuevo se trago una cerrada que solo tiene la API (Rust)');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
