// Pulsar en el panel una campaña que vive en OTRA pestaña tiene que hacer dos cosas:
// llevarte a su pestaña y dejarte delante de ella. La segunda es la dificil, porque las
// pestañas de Kick RECARGAN la pagina: el clic que apunta el destino es el mismo que
// mata la ejecucion que lo apunto. Por eso el destino va a GM_setValue.
//
// Se prueban las dos mitades por separado, que es como se rompen:
//
//   1. IDA — estando en campañas, pulsar una cerrada apunta el destino en el
//      almacenamiento y pulsa el enlace de la pestaña de cerradas (no el de campañas,
//      que era lo que hacia antes de que /drops/expired existiera).
//   2. VUELTA — arrancando en cerradas con ese destino ya guardado, se hace scroll
//      hasta la campaña y el destino se CONSUME, para que no vuelva a saltar solo en
//      la proxima visita.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-expired-panel.html');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const apiCampaigns = [{
    name: 'KICK drop', status: 'expired',
    starts_at: iso(ahora - 9 * dia), ends_at: iso(ahora - dia),
    category: { name: 'KICK' }, organization: { name: '11 expired drops' },
    rewards: [{ id: 'r1', name: 'x1 entry', required_units: 60, image_url: 'x.png' }]
}];

(async () => {
    // ---- 1. IDA ----
    const ida = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: '' }],
        apiCampaigns, waitMs: 16000,
        seed: { kick_drop_keywords: JSON.stringify(['kick']) },
        clickPaneCard: { pane: 'expired', at: 14000 }
    });

    // ---- 2. VUELTA ----
    const vuelta = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        waitMs: 16000,
        seed: {
            kick_drop_keywords: JSON.stringify(['kick', 'runescape']),
            kick_drops_focus_target: JSON.stringify({
                title: 'KICK - 11 expired drops', status: 'expired', ts: Date.now()
            })
        }
    });

    // ---- 3. PROXIMAS ----
    // La ruta de proximas se asume con la misma forma que campañas y cerradas, asi que
    // la regla tiene que valer igual. Se prueba, no se da por hecho: es una suposicion,
    // y las suposiciones sin test son las que se descubren rotas en produccion.
    const group = readFixture('fixture-group.html');
    const idaProximas = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: '' }],
        waitMs: 16000,
        seed: { kick_drop_keywords: JSON.stringify(['rust']) },
        apiCampaigns: [{
            name: 'Rust drop', status: 'upcoming',
            starts_at: iso(ahora + dia), ends_at: iso(ahora + 9 * dia),
            category: { name: 'Rust' }, organization: { name: 'Facepunch Studios' },
            rewards: [{ id: 'u1', name: 'skin', required_units: 60, image_url: 'x.png' }]
        }],
        clickPaneCard: { pane: 'upcoming', at: 14000 }
    });

    const vueltaProximas = await run({
        url: 'https://kick.com/drops/coming-soon',
        panels: [{ hidden: false, html: group }],
        waitMs: 16000,
        seed: {
            kick_drop_keywords: JSON.stringify(['rust']),
            kick_drops_focus_target: JSON.stringify({
                title: 'Rust - Facepunch Studios', status: 'upcoming', ts: Date.now()
            })
        }
    });

    console.log(JSON.stringify({
        ida: {
            pestañaPulsada: ida.tabClicks,
            destinoGuardado: ida.stored.kick_drops_focus_target || null
        },
        vuelta: {
            scrollHecho: vuelta.scrolls,
            destinoDespues: vuelta.stored.kick_drops_focus_target || '(consumido)'
        },
        proximas: {
            pestañaPulsada: idaProximas.tabClicks,
            scrollHecho: vueltaProximas.scrolls,
            destinoDespues: vueltaProximas.stored.kick_drops_focus_target || '(consumido)'
        }
    }, null, 2));

    const fallos = [];
    const destino = ida.stored.kick_drops_focus_target;
    if (!destino) fallos.push('la ida no guardo destino: al recargar no habria a que enfocar');
    else {
        const d = JSON.parse(destino);
        if (d.status !== 'expired') fallos.push('el destino guardado no dice que es cerrada');
    }
    if (!ida.tabClicks.includes('/drops/expired'))
        fallos.push('la ida no pulso la pestaña de cerradas, pulso: ' + JSON.stringify(ida.tabClicks));

    if (vuelta.scrolls.length === 0)
        fallos.push('la vuelta no hizo scroll a ninguna campaña');
    else if (!/KICK/i.test(vuelta.scrolls[0]))
        fallos.push('la vuelta enfoco otra campaña: ' + vuelta.scrolls[0]);
    if (vuelta.stored.kick_drops_focus_target)
        fallos.push('el destino no se consumio: volveria a saltar solo');

    if (!idaProximas.tabClicks.includes('/drops/coming-soon'))
        fallos.push('una proxima no lleva a su pestaña, lleva a: ' + JSON.stringify(idaProximas.tabClicks));
    if (vueltaProximas.scrolls.length === 0)
        fallos.push('en proximas no se enfoco la campaña al llegar');
    if (vueltaProximas.stored.kick_drops_focus_target)
        fallos.push('en proximas el destino no se consumio');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
