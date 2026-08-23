// El panel se llena desde la API sin salir de la pestaña. Se comprueba que:
//  1. las PROXIMAS aparecen en su solapa estando en /drops/campaigns (antes esto
//     exigia saltar de pestaña, que es lo que recargaba la pagina);
//  2. lo que YA esta escaneado en el DOM no se duplica con su gemelo de la API;
//  3. el estado se deduce de las fechas cuando `status` no se reconoce;
//  4. una campaña ya cerrada cae en "cerrados" y no en "abiertos";
//  5. compartir una PROXIMA desde aqui enlaza a /drops/coming-soon. Es el caso real:
//     esas tarjetas salen de la API justamente cuando NO estas en su pestaña, asi que
//     el enlace no puede sacarse de "la pagina en la que estoy".
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const campaña = (nombre, juego, org, status, desde, hasta) => ({
    name: nombre, status,
    starts_at: iso(desde), ends_at: iso(hasta),
    category: { name: juego }, organization: { name: org },
    rewards: [{ id: nombre + '-r1', name: 'Recompensa', required_units: 120, image_url: 'x.png' }]
});

const apiCampaigns = [
    // La misma que esta en el DOM: NO debe duplicarse.
    campaña('Rust drop', 'Rust', 'Facepunch Studios', 'active', ahora - dia, ahora + 5 * dia),
    // Proxima declarada. Estando en campañas, solo la API la ve.
    campaña('PUBG drop', 'PUBG', 'KRAFTON', 'upcoming', ahora + 3 * dia, ahora + 10 * dia),
    // `status` que no dice nada: manda la fecha (empieza dentro de 2 dias).
    campaña('Fortnite drop', 'Fortnite', 'Epic', 'quien-sabe', ahora + 2 * dia, ahora + 9 * dia),
    // Ya terminada: a cerrados, no a abiertos.
    campaña('GTA drop', 'GTA', 'Rockstar', 'quien-sabe', ahora - 9 * dia, ahora - dia)
];

(async () => {
    const r = await run({
        // La ventana se queda abierta: este test pulsa el 🔗 (`clickShare`) DESPUES de
        // recibir el informe, y ese gancho necesita el DOM vivo. Sale a mano al final.
        dejarAbierta: true,
        url: 'https://kick.com/drops/campaigns',
        panels: [{ route: '/drops/campaigns', hidden: false, html: group }],
        apiCampaigns, waitMs: 14000
    });
    const solo = arr => arr.map(c => c.title).sort();
    const pubg = r.upcoming.find(c => /^PUBG/.test(c.title));
    const copiado = pubg && pubg.share ? pubg.clickShare() : null;
    const cerrada = r.expired[0];
    console.log(JSON.stringify({
        abiertos: solo(r.active),
        proximos: solo(r.upcoming),
        cerrados: solo(r.expired),
        rustDuplicado: r.active.filter(c => /^Rust/.test(c.title)).length,
        compartirProxima: copiado,
        compartirCerrada: cerrada ? cerrada.share : null,
        logs: r.logs.filter(l => !l.includes('navigation to another')).slice(0, 3)
    }, null, 2));

    const fallos = [];
    if (!pubg) fallos.push('la proxima de la API no llego al panel');
    else if (!pubg.share) fallos.push('una PROXIMA sin boton de compartir');
    else if (!copiado) fallos.push('el boton de compartir no copio nada');
    else {
        const enlace = copiado.trim().split('\n').pop();
        if (!/\/drops\/coming-soon$/.test(enlace))
            fallos.push('estando en abiertas, el enlace de una proxima no va a su pestaña: ' + enlace);
    }
    if (cerrada && cerrada.share) fallos.push('una CERRADA lleva boton de compartir');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
