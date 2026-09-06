// LA EDICION DEL AÑO PASADO NO ESCONDE LA BALDOSA DE ESTA.
//
// Lo reclamado se cruza por `reward.id`, que es unico, y por eso el ✓ del panel no se
// equivoca nunca. Pero para ESCONDER la baldosa de la pagina no hay id: los `<li>` de
// recompensa solo traen imagen y nombre, asi que el indice se guarda tambien por
// NOMBRE, agrupado por el nombre de la campaña (`_claimedRewardNames`).
//
// Ahi estaba el mismo punto ciego que en Twitch: una campaña que vuelve cada temporada
// se llama igual en las dos ediciones y reparte recompensas con el mismo nombre, y
// `/drops/progress` trae las viejas —de ahi sale la pestaña de reclamados—. O sea que
// lo cobrado el año pasado escondia la baldosa de este, con la casilla marcada.
//
// Se prueban las dos ramas del arreglo y su control positivo:
//   1. la edicion vieja YA CERRADA no esconde nada (se acota por vigencia);
//   2. dos vigentes que se llaman igual tampoco: el nombre no distingue, y lo que no
//      se puede juzgar se deja a la vista;
//   3. lo reclamado en ESTA campaña se sigue escondiendo — sin esto, un script que no
//      escondiera nunca nada pasaria los dos primeros sin hacer nada.
//
// El fixture es el mismo volcado de `test-ocultar-reclamado`, tomado justo despues de
// reclamar. En los dos primeros casos los ids de la edicion vieja son OTROS, que es lo
// que hace que el fallo sea solo del indice por nombre: el panel no tacha el badge y la
// pagina escondia la baldosa igual, o sea las dos mitades diciendo cosas distintas.
const { run, readFixture } = require('./harness');

const pane = readFixture('fixture-campaigns-after-claim.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const COBRADA = 'PGS 9 Comic Boom (Spray)';
const VIVA = 'PGS 9 Stay Focused (Emblem)';
const NOMBRE = 'PGS 9 Drops';

// La edicion de ESTE año: la que la pagina esta enseñando. 40 vistos, primer tramo
// hecho, segundo al 67%, que es lo que dice la barra del volcado.
const actual = (claimed) => ({
    name: NOMBRE, status: 'active', progress_units: 40,
    starts_at: iso(ahora - 2 * hora), ends_at: iso(ahora + 22 * hora),
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards: [
        { id: 'pgs-1', name: COBRADA, required_units: 30, image_url: 'a.png', claimed },
        { id: 'pgs-2', name: VIVA, required_units: 60, image_url: 'b.png' }
    ]
});

// Otra campaña con EL MISMO nombre y recompensas homonimas, cobradas. Sus ids son
// distintos —Kick no reutiliza el `id` de la reward; el que se repetiria es
// `external_id`, que este script no lee—, asi que por id no se confunde con nada.
const homonima = (ends, status = 'active') => ({
    name: NOMBRE, status, progress_units: 600,
    starts_at: iso(ahora - 400 * 24 * hora), ends_at: ends,
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards: [
        { id: 'pgs-1-vieja', name: COBRADA, required_units: 30, image_url: 'a.png', claimed: true },
        { id: 'pgs-2-vieja', name: VIVA, required_units: 60, image_url: 'b.png', claimed: true }
    ]
});

const CLAVE_CASILLA = 'kick_show_hide_inventory_expired';
const base = {
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: pane }],
    waitMs: 17000,
    seed: { kick_drop_keywords: JSON.stringify(['pubg']), [CLAVE_CASILLA]: true }
};

const CASOS = [
    {
        // La forma REAL, la del volcado del 2026-09-06: la campaña cerrada llega con
        // `status: "expired"` y con su `ends_at` ya pasado, las dos señales a la vez.
        nombre: 'la edicion cerrada del año pasado no esconde la de este',
        progress: [actual(false), homonima(iso(ahora - 300 * 24 * hora), 'expired')],
        esperaEscondida: false
    },
    {
        // Las dos señales, por separado. Van aparte porque son independientes y el
        // volcado no las distingue —ahi coinciden siempre—, asi que sin separarlas no
        // se sabria cual de las dos esta sosteniendo el caso de arriba.
        nombre: 'cerrada solo por la fecha, sin que el status lo diga',
        progress: [actual(false), homonima(iso(ahora - 300 * 24 * hora), 'active')],
        esperaEscondida: false
    },
    {
        nombre: 'cerrada solo por el status, con la fecha aun por delante',
        progress: [actual(false), homonima(iso(ahora + 22 * hora), 'expired')],
        esperaEscondida: false
    },
    {
        nombre: 'dos campañas vigentes con el mismo nombre: no se esconde ninguna',
        progress: [actual(false), homonima(iso(ahora + 22 * hora))],
        esperaEscondida: false
    },
    {
        // LA MISMA VIEJA, PERO SIN NINGUNA DE LAS DOS SEÑALES. Hoy no es la forma del
        // dato —el volcado del 2026-09-06 trae `status` y las dos fechas—, pero es lo
        // que queda si un dia dejan de llegar, y entonces las dos cuentan como
        // vigentes y quien sostiene el arreglo es la unicidad del nombre. El resultado
        // observable es el mismo y el camino no, que es justo lo que hay que asegurar.
        nombre: 'sin status ni fechas tampoco esconde: manda el nombre repetido',
        progress: [actual(false), (() => {
            const c = homonima('', ''); delete c.ends_at; delete c.starts_at; delete c.status; return c;
        })()],
        esperaEscondida: false
    },
    {
        // Control positivo. Mismo codigo y mismo fixture, con lo reclamado en la
        // campaña que la pagina esta enseñando.
        nombre: 'lo reclamado en ESTA campaña se sigue escondiendo',
        progress: [actual(true)],
        esperaEscondida: true
    }
];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok   ' : '  FALLA') + ' ' + msg); if (!ok) fallos++; };
const busca = (r, nombre) => (r.recompensas || []).find(x => x.nombre === nombre);

(async () => {
    for (const c of CASOS) {
        console.log('\n=== ' + c.nombre + ' ===');
        const r = await run({ ...base, apiCampaigns: [actual(false)], progress: c.progress });

        const cobrada = busca(r, COBRADA);
        const viva = busca(r, VIVA);
        comprobar(!!cobrada, `el fixture trae la baldosa «${COBRADA}»`);
        comprobar(!!viva, `el fixture trae la baldosa «${VIVA}»`);
        if (!cobrada || !viva) continue;

        comprobar(cobrada.visible === !c.esperaEscondida,
            `«${COBRADA}» ${c.esperaEscondida ? 'escondida' : 'a la vista'}` +
            (cobrada.visible === !c.esperaEscondida ? '' :
                ` (esta ${cobrada.visible ? 'a la vista' : 'escondida'})`));
        // La que sigue en curso no se toca en ningun caso.
        comprobar(viva.visible, `«${VIVA}» sigue a la vista: no esta reclamada`);

        // Las dos mitades del mismo dato. El panel cruza por id y no se equivoca, asi
        // que sirve de arbitro: si tacha, esconder es correcto; si no tacha, esconder
        // es la pagina contradiciendo al panel, que es como se veia este fallo.
        const badges = (r.active[0] || {}).badges || [];
        const tachada = badges.some(b => b.includes('✓') && b.includes(COBRADA));
        comprobar(tachada === c.esperaEscondida,
            `el panel ${c.esperaEscondida ? 'tacha' : 'NO tacha'} «${COBRADA}», igual que la pagina` +
            (tachada === c.esperaEscondida ? '' : ` (badges: ${JSON.stringify(badges)})`));
    }
    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})();
