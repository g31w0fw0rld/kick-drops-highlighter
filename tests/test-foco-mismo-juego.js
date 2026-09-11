// EL CLIC QUE SE QUEDABA EN LA PAGINA EQUIVOCADA.
//
// Pulsar una tarjeta del panel primero busca la campaña EN ESTA PAGINA y solo cambia de
// pestaña si no esta. Esa busqueda, cuando no hay nodo escaneado, va por NOMBRE — y el
// nombre propio de un grupo es el del JUEGO. Un juego con campañas en dos estados
// escribe el mismo encabezado en las dos paginas, asi que estando en abiertas la cerrada
// «Rust - Old Sponsor» encontraba el «Rust» de la pagina de abiertas, hacia scroll hasta
// el y daba el trabajo por hecho: la pestaña de cerradas no se pulsaba nunca.
//
// De ahi el "no en todas las pestañas": falla solo cuando la pagina que tienes delante
// trae el mismo nombre de juego, y acierta cuando no.
//
// Se prueban las dos mitades, porque un arreglo que solo cortara la busqueda por nombre
// pasaria la primera y romperia la segunda:
//   1. COLISION — la busqueda por nombre NO puede resolver una campaña de otra pestaña.
//      Tres sitios donde el mismo juego esta delante: abiertas, proximas y reclamados.
//   2. CONTROL POSITIVO — dentro de su propia pestaña la busqueda por nombre sigue
//      siendo la que enfoca las sub-campañas, que no tienen nodo escaneado propio.
const { run, readFixture } = require('./harness');

const grupoRust = readFixture('fixture-group.html');          // encabezado «Rust», del DOM nuevo
const panelReclamados = readFixture('fixture-claimed-panel.html'); // tambien agrupa por «Rust»
const panelCerradas = readFixture('fixture-expired-panel.html');   // grupo «KICK» con sus sub-campañas

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const premio = [{ id: 'r1', name: 'x1 entry', required_units: 60, image_url: 'x.png' }];

// La campaña que NO esta en la pagina de delante, pero cuyo juego SI. La organizacion es
// distinta a proposito: con la misma, el titulo coincidiria con el de la tarjeta ya
// escaneada y se deduplicaria antes de llegar al clic.
const cerradaRust = {
    name: 'Rust old drop', status: 'expired',
    starts_at: iso(ahora - 9 * dia), ends_at: iso(ahora - dia),
    category: { name: 'Rust' }, organization: { name: 'Old Sponsor' }, rewards: premio
};
const abiertaRust = {
    name: 'Rust new drop', status: 'active',
    starts_at: iso(ahora - dia), ends_at: iso(ahora + dia),
    category: { name: 'Rust' }, organization: { name: 'New Sponsor' }, rewards: premio
};
const proximaRust = {
    name: 'Rust next drop', status: 'upcoming',
    starts_at: iso(ahora + dia), ends_at: iso(ahora + 9 * dia),
    category: { name: 'Rust' }, organization: { name: 'Next Sponsor' }, rewards: premio
};

const COLISIONES = [
    {
        nombre: 'en abiertas, con el grupo «Rust» delante, pulsar la CERRADA de Rust',
        url: 'https://kick.com/drops/campaigns', html: grupoRust,
        api: [cerradaRust], pane: 'expired', destino: '/drops/expired'
    },
    {
        nombre: 'en proximas, con el grupo «Rust» delante, pulsar la ABIERTA de Rust',
        url: 'https://kick.com/drops/coming-soon', html: grupoRust,
        api: [abiertaRust], pane: 'active', destino: '/drops/campaigns'
    },
    {
        // Reclamados no lista ninguno de los tres estados y agrupa por juego igual, asi
        // que desde ahi NINGUN clic deberia resolverse en la propia pagina.
        nombre: 'en reclamados, con el grupo «Rust» delante, pulsar la PROXIMA de Rust',
        url: 'https://kick.com/drops/claimed', html: panelReclamados,
        api: [proximaRust], pane: 'upcoming', destino: '/drops/coming-soon'
    }
];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok   ' : '  FALLA') + ' ' + msg); if (!ok) fallos++; };

(async () => {
    for (const c of COLISIONES) {
        console.log('\n=== ' + c.nombre + ' ===');
        const r = await run({
            url: c.url,
            panels: [{ hidden: false, html: c.html }],
            apiCampaigns: c.api,
            seed: { kick_drop_keywords: JSON.stringify(['rust']) },
            waitMs: 16000,
            clickPaneCard: { pane: c.pane, at: 14000 }
        });
        console.log('  ' + JSON.stringify({ tarjetas: r[c.pane].map(x => x.title), scrolls: r.scrolls, tabClicks: r.tabClicks }));
        comprobar(r[c.pane].length > 0, 'la tarjeta esta en el panel para poder pulsarla');
        comprobar(r.tabClicks.includes(c.destino),
            'lleva a ' + c.destino + ' (pulso: ' + JSON.stringify(r.tabClicks) + ')');
        comprobar(r.scrolls.length === 0,
            'no se queda enfocando el juego de esta pagina (scrolls: ' + JSON.stringify(r.scrolls) + ')');
        const destino = r.stored.kick_drops_focus_target;
        comprobar(!!destino, 'apunta el destino para enfocarlo al llegar');
        if (destino) {
            const d = JSON.parse(destino);
            comprobar(d.status === (c.pane === 'active' ? 'active' : c.pane === 'upcoming' ? 'upcoming' : 'expired'),
                'el destino guardado dice en que pestaña vive');
        }
    }

    // ---- CONTROL POSITIVO ----
    // La sub-campaña «Football Drop: Jungle Jersey» esta en la pagina de cerradas y NO
    // tiene nodo escaneado propio: solo se llega a ella por nombre. Si el arreglo hubiera
    // apagado esa busqueda en vez de acotarla, aqui no habria scroll.
    console.log('\n=== control: en cerradas, la sub-campaña de la propia pagina SI se enfoca ===');
    const control = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panelCerradas }],
        apiCampaigns: [{
            name: 'Football Drop: Jungle Jersey', status: 'expired',
            starts_at: iso(ahora - 40 * dia), ends_at: iso(ahora - dia),
            organization: { name: 'KICK' },
            rewards: [{ id: 'j1', name: 'Jungle Jersey', required_units: 600, image_url: 'x.png' }]
        }],
        seed: { kick_drop_keywords: JSON.stringify(['kick']) },
        waitMs: 18000,
        clickPaneCards: { pane: 'expired', at: 15000, titles: ['Football Drop: Jungle Jersey - KICK'] }
    });
    console.log('  ' + JSON.stringify({ scrolls: control.scrolls, tabClicks: control.tabClicks }));
    comprobar(control.scrolls.some(s => /Jungle Jersey/i.test(s)),
        'la sub-campaña se enfoca por nombre dentro de su pestaña');
    comprobar(control.tabClicks.length === 0, 'y no se cambia de pestaña estando ya en ella');

    console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'TODO OK'));
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
