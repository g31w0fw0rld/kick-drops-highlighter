// Caso 4 (la regresion reportada): /drops/claimed cuyo panel se monta TARDE, que
// es lo que pasa al volver de campañas por la SPA. Con el intento unico a los 3 s
// la rejilla no aparecia NUNCA; con el reintento tiene que aparecer igual.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-claimed-panel.html');
const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];
(async () => {
    const r = await run({
        url: 'https://kick.com/drops/claimed',
        // Arranca VACIO: no hay ningun grupo del que colgar la rejilla.
        panels: [{ hidden: false, html: '' }],
        lateHtml: panel, lateMs: 9000,
        waitMs: 26000, progress,
        seed: { kick_show_hide_inventory_expired: true }
    });
    console.log(JSON.stringify({
        logs: r.logs.filter(l => !l.includes('navigation to another')).slice(0, 4),
        rejillaPropia: r.claimedGrid,
        rejillaTitulo: r.gridTitle,
        rejillaTarjetas: r.claimedGridCards,
        rejillaOculta: r.gridHidden
    }, null, 2));
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
