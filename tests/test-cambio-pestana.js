// Dos fallos que solo se ven CAMBIANDO DE PESTAÑA, nunca entrando por la URL directa.
// Por eso este test navega en vez de arrancar ya colocado: el arranque hace lo correcto
// y tapa los dos.
//
//   1. Al llegar a /drops/expired por la pestaña no se marcaba NADA. El reparto de la
//      navegacion iba por descarte —"si no es campañas ni proximas, es reclamados"— asi
//      que las cerradas ejecutaban el trabajo del escaparate en vez del escaneo.
//
//   2. Pulsar una SUB-campaña no enfocaba nada. El panel las lista de una en una
//      ("ED'S DROP - KICK") y la pagina las agrupa por juego, con marca solo en el grupo
//      ("KICK - 11 expired drops"), asi que el titulo de la tarjeta no le corresponde a
//      ningun nodo escaneado y el cruce por titulo se quedaba corto.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-expired-panel.html');

(async () => {
    // ---- 1. Llegar a cerradas cambiando de pestaña ----
    const llegada = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: '' }],
        waitMs: 22000,
        seed: { kick_drop_keywords: JSON.stringify(['kick', 'runescape']) },
        navigateTo: { url: 'https://kick.com/drops/expired', html: panel, at: 9000 }
    });

    // ---- 2. Enfocar una sub-campaña ----
    const subcampaña = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        waitMs: 16000,
        seed: {
            kick_drop_keywords: JSON.stringify(['kick']),
            kick_drops_focus_target: JSON.stringify({
                title: "ED'S DROP - KICK", status: 'expired', ts: Date.now()
            })
        }
    });

    // ---- 3. Y al reves: llegar a ABIERTAS desde otra pestaña ----
    // La regla es la misma para las tres que se escanean, asi que se prueba tambien en
    // la direccion contraria. Entrando desde reclamados, que es la que NO se escanea y
    // por tanto la que mas facil deja el escaneo sin arrancar.
    const group = readFixture('fixture-group.html');
    const aAbiertas = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: '' }],
        waitMs: 22000,
        seed: { kick_drop_keywords: JSON.stringify(['rust']) },
        navigateTo: { url: 'https://kick.com/drops/campaigns', html: group, at: 9000 }
    });

    console.log(JSON.stringify({
        aAbiertasDesdeReclamados: {
            marcados: aAbiertas.matches.map(m => ({ titulo: m.title, color: m.borderColor })),
            panelesDuplicados: aAbiertas.paneles
        },
        alCambiarDePestaña: {
            marcados: llegada.matches.map(m => ({ titulo: m.title, color: m.borderColor })),
            solapaCerrados: llegada.tabLabels.expired
        },
        alPulsarSubcampaña: {
            scroll: subcampaña.scrolls,
            destinoDespues: subcampaña.stored.kick_drops_focus_target || '(consumido)'
        }
    }, null, 2));

    const fallos = [];
    if (aAbiertas.matches.length === 0)
        fallos.push('llegando a abiertas desde reclamados no se marco NADA');
    else if (!aAbiertas.matches.every(m => m.borderColor === '#3ad900'))
        fallos.push('llegando a abiertas no se marco en verde: ' +
            aAbiertas.matches.map(m => m.borderColor).join(', '));
    if (aAbiertas.paneles !== 1)
        fallos.push('re-escanear dejo ' + aAbiertas.paneles + ' paneles en la pagina');

    if (llegada.matches.length === 0)
        fallos.push('al llegar por la pestaña no se marco NADA');
    else if (!llegada.matches.every(m => m.borderColor === '#971311'))
        fallos.push('al llegar por la pestaña no se marco en rojo: ' +
            llegada.matches.map(m => m.borderColor).join(', '));

    if (subcampaña.scrolls.length === 0)
        fallos.push('pulsar una sub-campaña no enfoco nada');
    else if (!/ED'S DROP/i.test(subcampaña.scrolls[0]))
        fallos.push('se enfoco otra cosa: ' + subcampaña.scrolls[0]);

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
