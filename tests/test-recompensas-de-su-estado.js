// UNA TARJETA ABIERTA NO LISTA PREMIOS DE SUB-CAMPAÑAS YA CERRADAS.
//
// La entrada del panel va indexada por JUEGO y acumula todas sus sub-campañas —hace
// falta: un juego reparte varias y ninguna puede perderse—, pero se pinta como UNA
// tarjeta en UNA solapa, la del estado mas vivo. Las sub-campañas de otro estado no
// tenian donde salir y salian ahi.
//
// Reportado el 2026-09-20 con PUBG: la tarjeta abierta de «PUBG: Battlegrounds -
// KRAFTON» listaba «THE ORIGINAL IS BACK T-Shirt» y «Peculiar Greeting» —de dos
// sub-campañas cerradas— junto a la unica que la pagina tenia delante, «PUBG Varsity
// Jacket». Y de esos mismos tramos sale el «te faltan» y el texto del 🔗.
//
// Control negativo (tiene que salir en ROJO con el codigo publicado):
//   git show HEAD:kick-drops-highlighter.user.js > /tmp/pub-kick.js
//   KICK_SCRIPT=/tmp/pub-kick.js node tests/test-recompensas-de-su-estado.js
const { run } = require('./harness');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const campaña = (nombre, juego, org, status, desde, hasta, premios) => ({
    name: nombre, status,
    starts_at: iso(desde), ends_at: iso(hasta),
    category: { name: juego }, organization: { name: org },
    rewards: premios.map((p, i) => ({
        id: nombre + '-r' + i, name: p[0], required_units: p[1], image_url: 'x.png'
    }))
});

const apiCampaigns = [
    // La que corre hoy, la que la pagina tiene delante.
    campaña('2026PEC Finals Weekend 1 DAY3', 'PUBG: Battlegrounds', 'KRAFTON',
        'active', ahora - 2 * 60 * 60 * 1000, ahora + 2 * 60 * 60 * 1000,
        [['PUBG Varsity Jacket', 120]]),
    // Dos sub-campañas del MISMO juego, ya cerradas. Sus premios no son de ninguna
    // solapa: la entrada es una por juego y esta vive en abiertos.
    campaña('2026PEC Finals Weekend 1 DAY1', 'PUBG: Battlegrounds', 'KRAFTON',
        'expired', ahora - 9 * dia, ahora - 8 * dia,
        [['THE ORIGINAL IS BACK T-Shirt', 240]]),
    campaña('2026PEC Finals Weekend 1 DAY2', 'PUBG: Battlegrounds', 'KRAFTON',
        'expired', ahora - 8 * dia, ahora - 7 * dia,
        [['Peculiar Greeting', 180]])
];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ route: '/drops/campaigns', hidden: false, html: '<div></div>' }],
        apiCampaigns, waitMs: 14000, keywords: ['pubg']
    });
    const pubg = r.active.find(c => /^PUBG/.test(c.title));
    console.log(JSON.stringify({
        abiertos: r.active.map(c => c.title),
        cerrados: r.expired.map(c => c.title),
        badges: pubg ? pubg.badges : null,
        urgencia: pubg ? pubg.urgencia : null
    }, null, 2));

    const fallos = [];
    if (!pubg) fallos.push('la campaña abierta de PUBG no llego al panel');
    else {
        const texto = (pubg.badges || []).join(' | ');
        if (!/PUBG Varsity Jacket/.test(texto))
            fallos.push('falta el premio de la sub-campaña que SI esta abierta');
        if (/THE ORIGINAL IS BACK|Peculiar Greeting/.test(texto))
            fallos.push('la tarjeta abierta lista premios de sub-campañas cerradas: ' + texto);
    }

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
