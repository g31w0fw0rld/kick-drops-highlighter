// Estando YA en la pestaña, cada tarjeta del panel lleva a SU titulo:
//
//   · «KICK - 11 expired drops»          -> el titulo del juego
//   · «Football Drop: Jungle Jersey - KICK» -> el de esa sub-campaña
//
// Las dos viven en la misma pagina y una esta DENTRO de la otra, asi que no vale
// con enfocar "la campaña": hay que enfocar lo que dice la tarjeta que pulsaste.
//
// Lo que fallaba: la sub-campaña no tiene nodo escaneado propio —la pagina las
// agrupa por juego y solo el grupo se marca—, asi que el clic se caia al camino de
// "esto vive en otra pestaña" y mandaba a cambiar de pestaña a alguien que ya
// estaba en ella. Resultado: no pasaba nada.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-expired-panel.html');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// La tarjeta de la sub-campaña sale de la API, no del escaneo: la pagina agrupa por
// juego y solo el grupo se marca. Se reproduce el caso real —una campaña SIN
// `category`, que es lo que hace que su titulo sea el suyo propio y no el del juego.
const apiCampaigns = [{
    name: 'Football Drop: Jungle Jersey', status: 'expired',
    starts_at: iso(ahora - 40 * dia), ends_at: iso(ahora - dia),
    organization: { name: 'KICK' },
    rewards: [{ id: 'j1', name: 'Jungle Jersey', required_units: 600, image_url: 'x.png' }]
}];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        waitMs: 18000, apiCampaigns,
        seed: { kick_drop_keywords: JSON.stringify(['kick']) },
        clickPaneCards: {
            pane: 'expired',
            at: 15000,
            titles: ['KICK - 11 expired drops', 'Football Drop: Jungle Jersey - KICK']
        }
    });

    console.log(JSON.stringify({
        tarjetasDelPanel: r.expired.map(c => c.title),
        scrolls: r.scrolls,
        comoSeHizoElScroll: r.scrollDetalles,
        pestañasPulsadas: r.tabClicks
    }, null, 2));

    const fallos = [];
    const [alJuego, aLaSub] = r.scrolls;

    if (r.scrolls.length < 2)
        fallos.push('se esperaban 2 scrolls (uno por tarjeta), hubo ' + r.scrolls.length);
    // Igualdad EXACTA, no "empieza por": lo que anota el arnes es el texto del nodo al
    // que se hizo scroll, y un titulo suelto y la tarjeta que lo contiene empiezan los
    // dos por el titulo. Comparando por el principio, hacer scroll al contenedor —que
    // mide varias pantallas y deja el titulo fuera de la vista— pasaba por bueno. Es
    // justo el fallo que se vio: no enfocaba el texto, enfocaba el medio del div.
    if (alJuego && alJuego !== 'KICK')
        fallos.push('la tarjeta del juego no llevo a su titulo: ' + alJuego);
    if (aLaSub && aLaSub !== 'Football Drop: Jungle Jersey')
        fallos.push('la sub-campaña no llevo a SU titulo: ' + aLaSub);
    if (alJuego && aLaSub && alJuego === aLaSub)
        fallos.push('las dos tarjetas llevan al mismo sitio: no se distingue la sub-campaña');
    if (r.tabClicks.length)
        fallos.push('se cambio de pestaña estando ya en ella: ' + JSON.stringify(r.tabClicks));
    for (const d of r.scrollDetalles) {
        if (d.block !== 'start')
            fallos.push('el titulo se centro en vez de ponerse arriba: block=' + d.block);
        if (!d.margenArriba)
            fallos.push('sin scroll-margin-top: el titulo queda debajo de la cabecera fija');
    }

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
