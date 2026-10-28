// SIN LA CUENTA DEL JUEGO VINCULADA, NO SE PULSA «PEDIR».
//
// Visto el 2026-10-27 en cerradas con «VCT 26 Champs Shanghai - "Prepared"» de
// VALORANT: Kick deja el boton activo aunque falte la cuenta de Riot, y al pulsarlo
// pinta «Error al reclamar la recompensa … verifica que tus cuentas estan
// conectadas». El reclamo automatico lo pulsaba en cada visita.
//
// La señal es de /drops/progress y son dos campos JUNTOS: `connect_url` (la campaña
// pide vincular) y `user_app_connected: false`. El caso que obliga a mirar los dos es
// real: «ED'S DROP» llega con `user_app_connected: false` y SIN `connect_url` en
// docs/api-drops-progress-expired-2026-09.json, y ahi no hay nada que vincular.
//
// Se reutiliza el volcado y la API de test-reclamar-en-cerradas, con el nombre de la
// campaña que trae la tarjeta del volcado —el freno cruza por nombre, y aquel test usa
// uno que no casa porque no le hace falta— y cambiando solo esos dos campos. Tres casos:
//   · pide conexion y no la tiene   -> NO se pulsa, y la tarjeta sigue a la vista
//   · pide conexion y la tiene      -> se pulsa (control: el freno no es «nunca»)
//   · no pide conexion, aunque diga false -> se pulsa (el caso de ED'S DROP)
const { run, readFixture } = require('./harness');

const panel = readFixture('fixture-expired-claimable.html');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const apiCampaigns = [{
    name: 'K3Soju TFT x Kick Invitational 2026', status: 'expired',
    starts_at: iso(ahora - 40 * dia), ends_at: iso(ahora - 10 * dia),
    category: { name: 'Teamfight Tactics' }, organization: { name: 'Riot Games' },
    rewards: [{ id: 'tft-r1', name: 'Slouched Emote', required_units: 60, image_url: 'x.png' }]
}];
const progressCon = (extra) => [Object.assign({
    name: 'K3Soju TFT x Kick Invitational 2026', progress_units: 120,
    rewards: [{ id: 'tft-r1', name: 'Slouched Emote', claimed: false, required_units: 60 }]
}, extra)];

const reclamo = (r) => (r.botonesPulsados || []).filter(e => /Slouched Emote/.test(String(e || '')));

(async () => {
    const fallos = [];
    const caso = (progress) => run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        apiCampaigns, progress,
        waitMs: 17000,
        seed: {
            kick_drop_keywords: JSON.stringify(['teamfight']),
            kick_show_hide_inventory_expired: true
        }
    });

    const sin = await caso(progressCon({ connect_url: 'https://auth.riotgames.com/x', user_app_connected: false }));
    console.log(JSON.stringify({ sinVincular: sin.botonesPulsados }));
    if (reclamo(sin).length > 0) {
        fallos.push('con la cuenta sin vincular se pulso igual: ' + JSON.stringify(sin.botonesPulsados));
    }
    if ((sin.expired || []).length === 0) {
        fallos.push('la pestaña de cerradas se quedo sin tarjetas: algo se escondio');
    }

    const con = await caso(progressCon({ connect_url: 'https://auth.riotgames.com/x', user_app_connected: true }));
    console.log(JSON.stringify({ vinculada: con.botonesPulsados }));
    if (reclamo(con).length !== 1) {
        fallos.push('CONTROL: con la cuenta vinculada no se reclamo una vez: ' + JSON.stringify(con.botonesPulsados));
    }

    const sinUrl = await caso(progressCon({ connect_url: '', user_app_connected: false }));
    console.log(JSON.stringify({ sinConnectUrl: sinUrl.botonesPulsados }));
    if (reclamo(sinUrl).length !== 1) {
        fallos.push('una campaña que no pide vincular (false sin connect_url) dejo de reclamarse: ' +
            JSON.stringify(sinUrl.botonesPulsados));
    }

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})();
