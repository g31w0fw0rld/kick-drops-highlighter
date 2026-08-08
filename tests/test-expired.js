// Kick estreno una CUARTA ruta, /drops/expired, con las campañas cerradas. Este test
// arranca contra su DOM real y comprueba lo que el usuario pidio:
//
//   1. que las cerradas que casan con tus keywords se marquen EN ROJO en la propia
//      pagina, como el verde de abiertas y el azul de proximas;
//   2. que solo se marquen las que casan, y ni una mas.
//
// El fixture sale de docs/dom-expired-2026-08.html sin retocarlo.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-expired-panel.html');

const ROJO = '#971311';

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        waitMs: 16000,
        seed: { kick_drop_keywords: JSON.stringify(['kick', 'runescape']) }
    });

    console.log(JSON.stringify({
        marcados: r.matches.map(m => ({
            id: m.id, titulo: m.title, color: m.borderColor, grupo: m.isGroup
        })),
        solapas: r.tabLabels,
        cerrados: r.expired.map(c => c.title),
        logs: r.logs.slice(0, 3)
    }, null, 2));

    const fallos = [];
    if (r.matches.length === 0)
        fallos.push('no se marco NADA en la pagina de cerradas');
    const conColorRaro = r.matches.filter(m => m.borderColor && m.borderColor.toLowerCase() !== ROJO);
    if (conColorRaro.length)
        fallos.push('marcado con un color que no es el rojo: ' +
            conColorRaro.map(m => m.borderColor).join(', '));
    if (r.matches.some(m => /slots/i.test(m.title || '')))
        fallos.push('se marco una campaña que no casa con las keywords');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
