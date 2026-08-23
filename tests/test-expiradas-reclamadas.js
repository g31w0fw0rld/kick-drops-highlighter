// La cerrada que ya reclamaste NO va en cerradas: la pagina la tiene en Reclamados.
//
// Visto el 2026-08-20 con los dos volcados del mismo rato: /drops/claimed traia Rust
// con sus doce sub-campañas, y /drops/expired solo KICK y Old School RuneScape. El
// panel, en cambio, sacaba una tarjeta «Rust - Facepunch Studios» en Cerradas —de la
// API, sin fila en la pagina—, o sea una seccion inventada: no se puede marcar porque
// no hay tarjeta que marcar, y al pulsarla no pasa nada.
//
// El limite es lo que Kick escribe en esa pestaña: «Rewards you fully unlocked before
// they closed are still claimable». Lo que aun te debe algo SE QUEDA en cerradas. Asi
// que la condicion es que conste reclamado TODO, y por eso el test lleva las dos
// formas en la misma vuelta:
//
//   · Rust  -> sus dos recompensas constan reclamadas -> fuera.
//   · GTA   -> una reclamada y otra no                -> se queda.
//
// Y el tercer caso es el que evita que esto se convierta en un panel que esconde cosas
// sin saber: sin datos de inventario no se juzga nada (ver la vuelta 2).
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-expired-panel.html');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const cerrada = (juego, org, rewards) => ({
    name: juego + ' drop', status: 'expired',
    starts_at: iso(ahora - 40 * dia), ends_at: iso(ahora - 30 * dia),
    category: { name: juego }, organization: { name: org },
    rewards
});

const apiCampaigns = [
    cerrada('Rust', 'Facepunch Studios', [
        { id: 'rust-r1', name: 'Wallpaper', required_units: 60, image_url: 'x.png' },
        { id: 'rust-r2', name: 'Frost AR', required_units: 120, image_url: 'y.png' }
    ]),
    cerrada('GTA', 'Rockstar', [
        { id: 'gta-r1', name: 'Jacket', required_units: 60, image_url: 'x.png' },
        { id: 'gta-r2', name: 'Cap', required_units: 120, image_url: 'y.png' }
    ])
];

// Lo que dice el inventario: Rust entero, GTA a medias.
const progress = [
    {
        name: 'Rust drop', progress_units: 300,
        rewards: [
            { id: 'rust-r1', name: 'Wallpaper', claimed: true, required_units: 60 },
            { id: 'rust-r2', name: 'Frost AR', claimed: true, required_units: 120 }
        ]
    },
    {
        name: 'GTA drop', progress_units: 60,
        rewards: [
            { id: 'gta-r1', name: 'Jacket', claimed: true, required_units: 60 },
            { id: 'gta-r2', name: 'Cap', claimed: false, required_units: 120 }
        ]
    }
];

const keywords = JSON.stringify(['kick', 'runescape', 'rust', 'grand theft auto', 'gta']);

(async () => {
    // ---- 1. Con inventario: Rust fuera, GTA dentro ----
    const conInventario = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        waitMs: 16000, apiCampaigns, progress,
        seed: { kick_drop_keywords: keywords }
    });

    // ---- 2. Sin inventario: no se esconde nada ----
    // Lo que no se puede juzgar no se esconde. Es la misma regla que los filtros de
    // vista, y aqui es lo que evita que el panel aparezca vacio durante el arranque,
    // cuando /drops/progress todavia no ha contestado y NADA consta reclamado.
    const sinInventario = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        waitMs: 16000, apiCampaigns,
        seed: { kick_drop_keywords: keywords }
    });

    const titulos = r => r.expired.map(c => c.title);
    console.log(JSON.stringify({
        conInventario: titulos(conInventario),
        sinInventario: titulos(sinInventario),
        solapaCon: conInventario.tabLabels.expired,
        solapaSin: sinInventario.tabLabels.expired
    }, null, 2));

    const fallos = [];
    const con = titulos(conInventario);
    const sin = titulos(sinInventario);

    // 1. La reclamada del todo se va
    if (con.some(t => /^Rust/.test(t)))
        fallos.push('una cerrada con todo reclamado sigue en el panel: ' + con.filter(t => /^Rust/.test(t)).join(' / '));

    // 2. La que aun debe algo se queda
    if (!con.some(t => /^GTA/.test(t)))
        fallos.push('se fue una cerrada que todavia tiene una recompensa sin reclamar (GTA)');

    // 3. Y lo que la PAGINA lista no se toca: son filas de verdad, con su marca.
    if (!con.some(t => /^KICK/.test(t)))
        fallos.push('desaparecio la cerrada que si esta en la pagina (KICK)');
    if (!con.some(t => /RuneScape/.test(t)))
        fallos.push('desaparecio la cerrada que si esta en la pagina (Old School RuneScape)');

    // 4. Sin inventario no se esconde nada
    if (!sin.some(t => /^Rust/.test(t)))
        fallos.push('sin datos de inventario se escondio una cerrada que no se puede juzgar');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
