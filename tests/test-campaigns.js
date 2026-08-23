// La pestaña de campañas con una campaña ABIERTA de verdad.
//
// Hasta el 2026-08-21 este test era descriptivo, y no por gusto: el único volcado que
// había de `/drops/campaigns` era de un día sin campañas, así que la única forma de
// probar el camino de las abiertas era renombrar a mano un grupo del volcado de
// reclamados. Ahora hay DOM real de PUBG abierta y se le puede dar veredicto.
//
// Lo que este fixture trae y ningún otro tenía:
//
//   1. Un grupo NORMAL, que es el control positivo de `_studioTextOf`: sus dos `<p>`
//      dicen cosas distintas —`lg:hidden` el estudio («KRAFTON») y `max-lg:hidden` el
//      contador («1 active drop»)—, o sea justo lo contrario del grupo KICK, donde los
//      dos traen el contador. El título tiene que salir con estudio.
//   2. El párrafo descriptivo de la pestaña, con `text-neutral-300`, FUERA del grupo y
//      antes de él, tal y como está en la página. Es la trampa que documenta
//      `_dateRangeOf`: ese selector se consulta PRIMERO y en el DOM viejo era la fecha.
//      Si algún día se preguntara desde el documento en vez de desde el nodo, la fecha
//      de la tarjeta pasaría a ser «Los Drops están disponibles automáticamente…».
//   3. Una copia del grupo en una pestaña oculta, que es lo que Kick deja montado de
//      verdad. Se le cambia el juego para poder distinguir la fuga.
// AVISO, y hay que respetarlo al leer el verde: este test pasa TAMBIÉN contra el script
// de antes de la 1.3.0. No prueba ninguno de los arreglos de ese ciclo —de eso se
// encargan `test-grupo-sin-estudio`, `test-badges-proximas` y `test-expiradas-reclamadas`,
// que contra HEAD sí fallan—. Lo que hace es fijar un camino que no tenía NINGUNA
// cobertura: el de la página con una campaña abierta. Comprobado el 2026-08-21.
//
// El caso 1:1 del final tampoco es una prueba del arreglo, por un motivo concreto: esta
// campaña SÍ trae `category`, así que la clave de la API es el nombre del juego y el
// título compuesto coincide exactamente con el de la fila — el cruce por título ya
// bastaba. El 1:1 hace falta cuando `category` falta y la clave pasa a ser el nombre de
// la campaña, que es el caso de KICK y el que cubre `test-grupo-sin-estudio`.
const { run, readFixture } = require('./harness');

const group = readFixture('fixture-campaigns-active.html');
// El grupo oculto va con otro juego que también casa con las keywords: si se leyera,
// se vería como una segunda tarjeta. Con un nombre que no casara, la fuga no se notaría.
const hidden = group.replace(/PUBG: Battlegrounds/g, 'Rust').replace(/alt="PUBG[^"]*"/g, 'alt="Rust"');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// La misma campaña por la API, para comprobar de paso que no se duplica: el grupo tiene
// UNA sub-campaña, así que es el caso 1:1 y el gemelo de la API se va.
const apiCampaigns = [{
    name: 'PGS 9 Drops', status: 'active',
    starts_at: iso(ahora - 2 * hora), ends_at: iso(ahora + 45 * hora),
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards: [
        { id: 'pgs-1', name: 'PGS 9 Comic Boom (Spray)', required_units: 30, image_url: 'a.png' },
        { id: 'pgs-2', name: 'PGS 9 Stay Focused (Emblem)', required_units: 60, image_url: 'b.png' }
    ]
}];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [
            { hidden: false, html: group },
            { hidden: true, html: hidden }
        ],
        waitMs: 20000, apiCampaigns,
        seed: { kick_drop_keywords: JSON.stringify(['pubg', 'rust']) }
    });

    console.log(JSON.stringify({
        matches: r.matches, active: r.active, upcoming: r.upcoming,
        expired: r.expired, pageMarks: r.pageMarks
    }, null, 2));

    const fallos = [];

    // --- 1. Se marca la abierta, en verde, y solo ella ------------------------
    const activos = r.matches.filter(m => m.id.endsWith('-active'));
    if (activos.length !== 1) fallos.push(`se esperaba 1 grupo marcado como abierto, hubo ${activos.length}`);
    const g = activos[0];
    if (g && g.borderColor !== '#3ad900') fallos.push(`el borde no es el verde de abiertas: ${g.borderColor}`);
    if (g && !g.isGroup) fallos.push('lo marcado no es el grupo del juego');
    if (g && g.hidden) fallos.push('el grupo marcado está dentro de una pestaña oculta');
    // La copia oculta no se lee: si se leyera saldría un segundo marcado, y además una
    // tarjeta «Rust» en el panel.
    if (r.matches.some(m => m.hidden)) fallos.push('se marcó algo dentro de la pestaña oculta');

    // --- 2. Una tarjeta, con el estudio en el título --------------------------
    if (r.active.length !== 1) fallos.push(`se esperaba 1 tarjeta en abiertos, hubo ${r.active.length}: ` +
        r.active.map(c => c.title).join(' | '));
    const card = r.active[0];
    if (card && card.title !== 'PUBG: Battlegrounds - KRAFTON')
        fallos.push(`el título es «${card.title}» y se esperaba «PUBG: Battlegrounds - KRAFTON»`);
    // Y no el contador: ese es el fallo que tenía el grupo KICK.
    if (card && /active drop/.test(card.title))
        fallos.push('el título se quedó con el contador en vez del estudio');
    if (r.active.some(c => /Rust/.test(c.title)))
        fallos.push('la pestaña oculta se filtró al panel');

    // --- 3. La fecha es la de la tarjeta, no la del párrafo de la pestaña -----
    if (card && !/21 ago 2026/.test(card.fecha || ''))
        fallos.push(`la fecha es «${card.fecha}» y se esperaba la ventana de la campaña`);
    if (card && /disponibles autom/i.test(card.fecha || ''))
        fallos.push('la fecha se leyó del párrafo descriptivo de la pestaña (text-neutral-300)');
    // Y con la hora dentro, que es lo que distingue la del DOM de la que compone la API:
    // si esta tarjeta hubiera salido del gemelo de la API, aquí no habría hora.
    if (card && !/4:00/.test(card.fecha || ''))
        fallos.push(`la fecha no lleva la hora, así que no es la del DOM: «${card.fecha}»`);

    // --- 4. La marca sobre la propia tarjeta de Kick --------------------------
    // 45 h de cierre entran en las 72 h que el script considera urgentes, así que aquí
    // la marca es el ⏳ con su cuenta atrás y no el ⏱ gris.
    const marcas = r.pageMarks.map(m => String(m).trim());
    if (!marcas.some(t => t.startsWith('⏳'))) fallos.push('falta el ⏳ sobre la tarjeta de la página: ' + JSON.stringify(marcas));

    // --- 5. El gemelo de la API, deduplicado (1:1) ----------------------------
    // La entrada de la API se llama «PGS 9 Drops», que es el nombre de la ÚNICA
    // sub-campaña del grupo, así que se reconoce y no entra como segunda tarjeta.
    if (r.active.some(c => /PGS 9 Drops/.test(c.title)))
        fallos.push('el gemelo de la API entró como tarjeta aparte pese a ser 1:1');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
