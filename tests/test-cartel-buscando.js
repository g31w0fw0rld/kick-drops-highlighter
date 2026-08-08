// El cartel naranja del panel ("leyendo la API" / "buscando") no se veia NUNCA.
// Nacia con `display: _apiDataReady ? "none" : "flex"`, y la API contesta antes de que
// el panel exista, asi que salia escondido de fabrica. Lo unico visible mientras el
// script trabajaba era el cartel del centro, y dentro del panel no habia nada hasta
// el texto final de cada solapa.
//
// El fallo es de los que no se ven al final: cuando funciona, al terminar tampoco
// esta. Por eso se mira a mitad de vuelo (snapAt) y no solo el estado final.
//
// El caso es el del reporte: /drops/campaigns SIN campañas abiertas, que es cuando el
// escaneo agota sus 10 intentos y se tarda de verdad.
const { run } = require('./harness');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const apiCampaigns = [{
    name: 'Rust drop', status: 'expired',
    starts_at: iso(ahora - 9 * dia), ends_at: iso(ahora - dia),
    category: { name: 'Rust' }, organization: { name: 'Facepunch Studios' },
    rewards: [{ id: 'r1', name: 'Rust skin', required_units: 60, image_url: 'x.png' }]
}];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: '' }],
        apiCampaigns, waitMs: 16000,
        seed: { kick_drop_keywords: JSON.stringify(['rust']) },
        // 1,5 s: el panel ya existe y el escaneo acaba de empezar.
        // 4 s: la API entro hace rato y el escaneo sigue.
        snapAt: { arranque: 1500, mitad: 4000 }
    });

    console.log(JSON.stringify({
        arranque: r.snaps.arranque,
        mitad: r.snaps.mitad,
        alFinal: r.banner,
        solapaCerrados: r.expired.map(c => c.title)
    }, null, 2));

    const fallos = [];
    const a = r.snaps.arranque || {}, m = r.snaps.mitad || {}, f = r.banner || {};
    if (!a.existe) fallos.push('al arrancar no hay cartel en el panel');
    else if (!a.visible) fallos.push('el cartel nace escondido: es el fallo reportado');
    if (!m.visible) fallos.push('el cartel desaparece mientras aun se esta buscando');
    if (m.visible && !/[Bb]uscando|[Ss]earching/.test(m.texto || ''))
        fallos.push('con la API ya dentro el cartel sigue diciendo que lee la API: "' + m.texto + '"');
    if (f.visible) fallos.push('el cartel se queda puesto despues de terminar');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
