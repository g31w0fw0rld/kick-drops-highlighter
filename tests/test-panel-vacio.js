// La regresion reportada: entrando por una pestaña que NO es campañas, el panel
// se quedaba en blanco —sin tarjetas, sin el "no se encontro nada" y sin las
// cuentas de las solapas— porque el mensaje se escribia en un contenedor
// display:none y el repintado se rendia cuando el escaneo no encontraba nada.
//
// Se comprueba en las tres pestañas y con dos DOM distintos: uno vacio (lo que
// enseña Kick hoy en proximas) y uno con una campaña delante.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');
const claimedPanel = readFixture('fixture-claimed-panel.html');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();
const campaña = (nombre, juego, org, status, desde, hasta, img) => ({
    name: nombre, status, starts_at: iso(desde), ends_at: iso(hasta),
    category: { name: juego, image_url: img },
    organization: { name: org },
    rewards: [{ id: nombre + '-r1', name: 'Recompensa', required_units: 120, image_url: 'drops/reward/x.png' }]
});

// Lo que devuelve la API de verdad ahora mismo, segun la consola del usuario:
// solo campañas cerradas.
const apiCampaigns = [
    campaña('Rust drop', 'Rust', 'Facepunch Studios', 'expired', ahora - 9 * dia, ahora - dia,
            'images/subcategory/rust.jpg'),
    // Sin imagen de categoria: debe caer a la de la recompensa, no quedarse vacia.
    campaña('GTA drop', 'GTA', 'Rockstar', 'expired', ahora - 9 * dia, ahora - dia, '')
];

const CASOS = [
    { nombre: 'coming-soon vacia', url: '/drops/coming-soon', html: '' },
    { nombre: 'claimed', url: '/drops/claimed', html: claimedPanel },
    { nombre: 'campaigns vacia', url: '/drops/campaigns', html: '' },
    { nombre: 'campaigns con campaña', url: '/drops/campaigns', html: group }
];

(async () => {
    for (const c of CASOS) {
        const r = await run({
            url: 'https://kick.com' + c.url,
            panels: [{ route: c.url, hidden: false, html: c.html }],
            apiCampaigns, waitMs: 16000
        });
        console.log(JSON.stringify({
            caso: c.nombre,
            solapas: r.tabLabels,
            abiertos: r.active.map(x => x.title),
            cerrados: r.expired.map(x => x.title),
            mensajeVisible: r.paneMessage,
            imagenes: r.expiredImgs,
            logs: r.logs.filter(l => !l.includes('navigation to another')).slice(0, 2)
        }));
    }
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
