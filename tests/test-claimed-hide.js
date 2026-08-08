// Caso 3: /drops/claimed con la casilla "ocultar reclamados" MARCADA.
// Debe: esconder el bloque de Kick, pintar nuestra rejilla CON titulo, y no
// esconderse a si misma en el proceso.
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
        panels: [{ hidden: false, html: panel }],
        waitMs: 26000, progress,
        seed: { kick_show_hide_inventory_expired: true }
    });
    console.log(JSON.stringify({
        logs: r.logs.filter(l => !l.includes('navigation to another')).slice(0, 4),
        gruposDeKick: r.hiddenGroups,
        tarjetasDeKickVisibles: r.visibleClaimedCards,
        rejillaPropia: r.claimedGrid,
        rejillaTitulo: r.gridTitle,
        rejillaOculta: r.gridHidden,
        rejillaTarjetas: r.claimedGridCards,
        xButtons: r.xButtons
    }, null, 2));
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
