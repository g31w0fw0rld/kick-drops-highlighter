// EL PANEL NO PUEDE PERDER UNA CAMPAÑA POR ESTAR MIRANDO OTRA PESTAÑA.
//
// Reportado el 2026-09-20: «al pasar de caducadas a activas baja el numero de caducadas».
// Reproducido, y por el camino salio un sintoma peor que el reportado: estando en
// /drops/expired, «Drops Abiertos» decia (0) con una campaña de PUBG corriendo y cinco
// horas para que cerrara.
//
// Son dos cosas y las dos vienen de que la entrada de la API era UNA POR JUEGO:
//   · la deduplicacion tapaba por TITULO, asi que la tarjeta cerrada de PUBG que la
//     pagina lista en /drops/expired tapaba a la entrada ABIERTA del mismo juego;
//   · y lo cerrado de un juego abierto no tenia entrada propia, asi que en /drops/campaigns
//     no habia nada que listar en cerrados y la cuenta bajaba.
// Ahora la entrada es por JUEGO Y ESTADO, y la deduplicacion tapa dentro de su solapa.
//
// LOS CONTROLES:
//   · el caso que estreno la deduplicacion el 2026-08-20 —la MISMA campaña, que la pagina
//     lista abierta y la API tiene por cerrada— tiene que seguir saliendo UNA sola vez.
//     Ahi no la salva el titulo sino la identidad: el nombre de la sub-campaña es el mismo
//     en las dos fuentes. Sin este control, «tapar solo en su solapa» seria
//     indistinguible de «quitar la deduplicacion».
//   · y el duplicado exacto, misma campaña y mismo estado en las dos fuentes, tambien una.
const { run, readFixture } = require('./harness');
const activas = readFixture('fixture-campaigns-active.html');
// El grupo de Rust, con sus doce sub-campañas, que es el caso de «varias».
const grupo = readFixture('fixture-group.html');
const cerradas = readFixture('fixture-expired-nuevo-dom.html');

const dia = 24 * 60 * 60 * 1000;
const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();
const camp = (nombre, juego, org, status, desde, hasta) => ({
    name: nombre, status, starts_at: iso(desde), ends_at: iso(hasta),
    category: { name: juego }, organization: { name: org },
    rewards: [{ id: nombre + '-r1', name: nombre + ' premio', required_units: 120, image_url: 'x.png' }]
});

// PUBG reparte tres jornadas: dos cerradas y la de hoy abierta. Es el caso del reporte.
const apiCampaigns = [
    camp('2026PAS2 Finals Weekend 1 DAY3', 'PUBG: Battlegrounds', 'KRAFTON', 'active', ahora - hora, ahora + 5 * hora),
    camp('2026PAS2 Finals Weekend 1 DAY1', 'PUBG: Battlegrounds', 'KRAFTON', 'expired', ahora - 3 * dia, ahora - 2 * dia),
    camp("ED'S DROP", 'KICK', 'Kick', 'expired', ahora - 40 * dia, ahora - 30 * dia),
    camp('Rust Team Drop', 'Rust', 'Facepunch Studios', 'expired', ahora - 20 * dia, ahora - 15 * dia)
];
const keywords = ['pubg', 'kick', 'rust'];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };
const titulos = arr => arr.map(c => c.title);

const enLaPagina = (url, ruta, html, campañas) => run({
    url, panels: [{ route: ruta, hidden: false, html }],
    apiCampaigns: campañas || apiCampaigns, waitMs: 14000,
    seed: { kick_drop_keywords: JSON.stringify(keywords) }
});

(async () => {
    const enCampañas = await enLaPagina('https://kick.com/drops/campaigns', '/drops/campaigns', activas);
    console.log('  en /drops/campaigns:', JSON.stringify(enCampañas.tabLabels.active),
        JSON.stringify(titulos(enCampañas.expired)));
    comprobar(titulos(enCampañas.active).some(t => /^PUBG/.test(t)),
        'en campañas, la abierta de PUBG esta en abiertos');

    const enCerradas = await enLaPagina('https://kick.com/drops/expired', '/drops/expired', cerradas);
    console.log('  en /drops/expired:  ', JSON.stringify(enCerradas.tabLabels.active),
        JSON.stringify(titulos(enCerradas.expired)));
    comprobar(titulos(enCerradas.active).some(t => /^PUBG/.test(t)),
        'y en cerradas TAMBIEN: la abierta no se pierde por estar en otra pestaña');
    comprobar(titulos(enCerradas.active).filter(t => /^PUBG/.test(t)).length === 1,
        'y sale una sola vez, no dos');
    comprobar(titulos(enCerradas.expired).some(t => /^KICK/.test(t)),
        'las cerradas que la pagina lista siguen en cerrados');

    // CONTROL del caso que estreno la deduplicacion: la pagina la tiene por ABIERTA y la
    // API por cerrada. Manda la pagina y sale una sola vez.
    const alReves = [camp('PGS 9 Drops', 'PUBG: Battlegrounds', 'KRAFTON', 'expired', ahora - 3 * dia, ahora - 60e3)];
    const r3 = await enLaPagina('https://kick.com/drops/campaigns', '/drops/campaigns', activas, alReves);
    const todas3 = titulos(r3.active).concat(titulos(r3.upcoming), titulos(r3.expired));
    console.log('  DOM abierta + API cerrada:', JSON.stringify(todas3));
    comprobar(todas3.filter(t => /PUBG/i.test(t)).length === 1,
        'CONTROL: la pagina la lista abierta y la API la tiene por cerrada -> una sola tarjeta');

    // CONTROL del duplicado exacto: mismo estado en las dos fuentes.
    const igual = [camp('PGS 9 Drops', 'PUBG: Battlegrounds', 'KRAFTON', 'active', ahora - dia, ahora + 5 * dia)];
    const r4 = await enLaPagina('https://kick.com/drops/campaigns', '/drops/campaigns', activas, igual);
    const todas4 = titulos(r4.active).concat(titulos(r4.upcoming), titulos(r4.expired));
    console.log('  duplicado exacto:        ', JSON.stringify(todas4));
    comprobar(todas4.filter(t => /PUBG/i.test(t)).length === 1,
        'CONTROL: la misma campaña en las dos fuentes y en el mismo estado -> una sola tarjeta');

    // Y LA CUENTA, que es lo que se reporto. Tiene que ser la misma en las dos paginas:
    // el panel dice lo que hay, no lo que la pestaña de Kick tiene delante.
    comprobar(enCampañas.expired.length === enCerradas.expired.length,
        `la cuenta de cerrados no cambia al cambiar de pestaña (${enCampañas.expired.length} y ${enCerradas.expired.length})`);
    comprobar(enCampañas.expired.some(c => /^PUBG/.test(c.title)),
        'y en campañas tambien esta la cerrada de PUBG, que solo existe en la API');
    comprobar(enCampañas.active.length === enCerradas.active.length,
        `y la de abiertos tampoco (${enCampañas.active.length} y ${enCerradas.active.length})`);

    // CONTROL DE LOS GRUPOS DE VARIAS SUB-CAMPAÑAS. La pagina lista Rust como abierto,
    // con sus doce campañas dentro. Si la API tiene una de ESAS por cerrada, es la misma
    // cosa clasificada distinto y va una sola tarjeta; si tiene ademas otra que la pagina
    // no enseña, esa si es una tarjeta mas, y es lo unico que la hace visible.
    // Van en DOS corridas y no en una: en una sola caerian en la misma entrada —mismo
    // juego, mismo estado— y la tarjeta saldria igual por culpa de la que la pagina no
    // tiene, sin decir nada de la otra.
    const suya = await enLaPagina('https://kick.com/drops/campaigns', '/drops/campaigns', grupo,
        [camp('Kick + Rust Wallpaper Pack', 'Rust', 'Facepunch Studios', 'expired', ahora - 9 * dia, ahora - dia)]);
    console.log('  grupo, campaña que SI esta delante:', JSON.stringify(titulos(suya.active)),
        JSON.stringify(titulos(suya.expired)));
    comprobar(titulos(suya.active).some(t => /Rust/i.test(t)),
        'CONTROL: el grupo de Rust sigue en abiertos, como lo lista la pagina');
    comprobar(!titulos(suya.expired).some(t => /Rust/i.test(t)),
        'CONTROL: y su campaña, que la API tiene por cerrada, no abre una segunda tarjeta');

    const ajena = await enLaPagina('https://kick.com/drops/campaigns', '/drops/campaigns', grupo,
        [camp('Team Fantasma + Nada', 'Rust', 'Facepunch Studios', 'expired', ahora - 9 * dia, ahora - dia)]);
    console.log('  grupo, campaña que NO esta delante:', JSON.stringify(titulos(ajena.active)),
        JSON.stringify(titulos(ajena.expired)));
    comprobar(titulos(ajena.expired).some(t => /Rust/i.test(t)),
        'y una cerrada del mismo juego que la pagina NO enseña si tiene tarjeta: es lo unico que la ve');

    console.log(fallos ? `\n  ${fallos} FALLAN` : '\n  todo en verde');
    process.exit(fallos ? 1 : 0);
})();
