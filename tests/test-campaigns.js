// Caso 1: /drops/campaigns con el grupo visible y una copia del MISMO grupo en
// una pestaña oculta (que es exactamente lo que Kick manda). El grupo oculto
// lleva el juego renombrado a PUBG para poder distinguir la fuga.
const { run, readFixture } = require('./harness');

const group = readFixture('fixture-group.html');
const hiddenGroup = group.replace('>Rust</h2>', '>PUBG</h2>').replace(/alt="Rust"/g, 'alt="PUBG"');

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [
            { hidden: false, html: group },
            { hidden: true, html: hiddenGroup }
        ]
    });
    console.log(JSON.stringify({
        logs: r.logs.slice(0, 6),
        matches: r.matches,
        active: r.active,
        upcoming: r.upcoming,
        expired: r.expired,
        pageMarks: r.pageMarks,
        xButtons: r.xButtons
    }, null, 2));
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
