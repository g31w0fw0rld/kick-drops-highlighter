// Caso 2: /drops/claimed con el panel REAL del volcado (12 sub-campañas de Rust).
// Interesa: cuantos ❌ se inyectan (uno por juego, no uno por sub-campaña), que
// no se oculte nada (la pestaña es entera lo reclamado) y que la rejilla propia
// encuentre donde insertarse ahora que no hay <h1> "Reclamado".
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-claimed-panel.html');
(async () => {
    const r = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: panel }],
        waitMs: 14000,
        apiCampaigns: null
    });
    console.log(JSON.stringify({
        logs: r.logs.slice(0, 6),
        xButtons: r.xButtons,
        matches: r.matches.length,
        hiddenGroups: r.hiddenGroups,
        ocultos_li: null,
        claimedGrid: r.claimedGrid
    }, null, 2));
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
