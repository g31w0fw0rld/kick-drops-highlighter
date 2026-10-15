// Una campaña PROXIMA no tiene nada que reclamar, asi que no lleva 🎁.
//
// Reportado el 2026-10-15 con «Counter-Strike 2 - Stake Pulse» en la solapa de
// proximas: varios tickets en naranja y con 🎁, que dice «pulsa y es tuyo» sobre algo
// que Kick no deja cobrar hasta que abra. No se sabe por cual de los dos caminos le
// llegaba el «ganado», asi que el test lleva los dos a la vez:
//   · /drops/progress trae la propia edicion proxima con el tramo cumplido;
//   · y una edicion anterior, ya cerrada, con los MISMOS ids de recompensa cumplidos
//     y sin cobrar —que es lo que hace una campaña semanal—.
//
// El control positivo es la misma campaña ABIERTA con el mismo progreso: ahi el 🎁
// tiene que seguir saliendo. Sin el, un arreglo que apagara el 🎁 en todas partes
// pasaria la primera mitad.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const rewards = [
    { id: 'sp-r1', name: 'Stake Pulse - 1 Ticket (1 Hour)', required_units: 60, image_url: 'x.png' },
    { id: 'sp-r2', name: 'Stake Pulse - 1 Ticket (2 Hours)', required_units: 120, image_url: 'y.png' }
];

const campaña = (status, desde, hasta) => ({
    name: 'Stake Pulse', status,
    starts_at: iso(desde), ends_at: iso(hasta),
    category: { name: 'Counter-Strike 2' }, organization: { name: 'Stake Pulse' },
    rewards
});

// Lo que dice /drops/progress: los dos tramos cumplidos y ninguno cobrado.
const conProgreso = c => Object.assign({}, c, {
    progress_units: 180,
    rewards: rewards.map(r => Object.assign({}, r, { claimed: false, progress: 1 }))
});

const edicionAnterior = campaña('expired', ahora - 9 * 24 * hora, ahora - 2 * 24 * hora);

(async () => {
    const proxima = campaña('upcoming', ahora + 10 * hora, ahora + 72 * hora);
    const enProximas = await run({
        url: 'https://kick.com/drops/coming-soon',
        panels: [{ hidden: false, html: group }],
        waitMs: 16000,
        apiCampaigns: [proxima],
        progress: [conProgreso(proxima), conProgreso(edicionAnterior)],
        seed: { kick_drop_keywords: JSON.stringify(['counter-strike']) }
    });

    const abierta = campaña('active', ahora - 2 * hora, ahora + 40 * hora);
    const enAbiertas = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: group }],
        waitMs: 16000,
        apiCampaigns: [abierta],
        progress: [conProgreso(abierta)],
        seed: { kick_drop_keywords: JSON.stringify(['counter-strike']) }
    });

    const prox = enProximas.upcoming[0];
    const abie = enAbiertas.active[0];
    console.log(JSON.stringify({
        proxima: prox ? { titulo: prox.title, badges: prox.badges } : null,
        abierta: abie ? { titulo: abie.title, badges: abie.badges } : null
    }, null, 2));

    const fallos = [];
    if (!prox) fallos.push('no se pinto ninguna tarjeta en proximos');
    else {
        const texto = (prox.badges || []).join(' | ');
        if (!/1 Ticket \(1 Hour\)/.test(texto) || !/1 Ticket \(2 Hours\)/.test(texto))
            fallos.push('faltan las recompensas en la proxima: ' + texto);
        if (/🎁/.test(texto)) fallos.push('una PROXIMA con 🎁: ' + texto);
    }
    if (!abie) fallos.push('no se pinto ninguna tarjeta en abiertos');
    else {
        const texto = (abie.badges || []).join(' | ');
        if (!/🎁/.test(texto)) fallos.push('se perdio el 🎁 de ABIERTOS: ' + texto);
    }

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
