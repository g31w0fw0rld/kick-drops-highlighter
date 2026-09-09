// Kick estreno /drops/rewards en septiembre de 2026: un escaparate de badges, emotes y
// KICKs, sin una sola campaña. El script no la reconoce —ni debe: no es una seccion de
// campañas— y el problema era que las dos puertas de entrada no hacian lo mismo.
//
//   · llegando por la barra de pestañas, onUrlChange ya exigia `_kindOfPath()` y no hacia
//     nada;
//   · llegando por la URL o recargando, se escaneaba igual.
//
// Y escanear ahi no es inofensivo: sin campañas, los dos selectores buenos dan cero, eso
// activa el barrido de respaldo por `[data-state], .bg-surface-base` —que dentro del
// <main> alcanza el bloque «Rewards» de Kick— y en processCampaignNode
// `status = routeStatus || 'active'` convierte una ruta sin reconocer en campaña ABIERTA.
//
// La keyword es `war` y no es un capricho: casa por dentro de «Re-war-ds» igual que `rage`
// casaba dentro de «Ave-rage-Aden», y es de las realistas (Warframe, War Thunder,
// Warzone). Con las keywords por defecto el fallo no se ve, asi que un test con `rust`
// habria pasado con el fallo dentro.
const { run, readFixture } = require('./harness');
const rewards = readFixture('fixture-rewards.html');

const seed = { kick_drop_keywords: JSON.stringify(['war']) };

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok   ' : '  FALLA') + ' ' + msg); if (!ok) fallos++; };

(async () => {
    // 1. CONTROL POSITIVO. El mismo DOM y la misma keyword en una ruta que SI es de
    // campañas: aqui la tarjeta fantasma tiene que salir. Sin esto, el cero de abajo se
    // explicaria igual porque el fixture no case con nada, y el test no probaria nada.
    console.log('\n=== control: el mismo bloque en /drops/campaigns (tiene que marcarlo) ===');
    const ctrl = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: rewards }],
        apiCampaigns: [], seed, waitMs: 8000
    });
    comprobar(ctrl.active.length === 1 && ctrl.active[0].title === 'Rewards',
        'en campañas el bloque «Rewards» si entra al panel — ' + JSON.stringify(ctrl.active.map(x => x.title)));
    comprobar(ctrl.matches.length === 1, 'y se marca en la pagina — ' + ctrl.matches.length + ' nodo(s)');

    // 2. LO QUE SE ARREGLA. Misma pagina, misma keyword, entrando por la URL.
    console.log('\n=== /drops/rewards entrando por la URL ===');
    const url = await run({
        url: 'https://kick.com/drops/rewards', panels: [{ hidden: false, html: rewards }],
        apiCampaigns: [], seed, waitMs: 8000
    });
    comprobar(url.active.length === 0, 'no se inventa ninguna campaña abierta — ' + JSON.stringify(url.active.map(x => x.title)));
    comprobar(url.matches.length === 0, 'no marca nada en la pagina — ' + url.matches.length + ' nodo(s)');
    comprobar(url.paneles === 1, 'el panel se pinta igual (se llena de la API, ahi sigue sirviendo)');
    comprobar(url.estadoVacioVisible === true, 'el estado vacio de Kick se queda como estaba');

    // 3. Y llegando por la barra, que ya iba bien: se comprueba para que no se rompa al
    // tocar el reparto de arriba.
    console.log('\n=== /drops/rewards pulsando la pestaña (navegacion SPA) ===');
    const nav = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        apiCampaigns: [], seed, waitMs: 14000,
        navigateTo: { url: 'https://kick.com/drops/rewards', html: rewards, at: 7000 }
    });
    comprobar(nav.active.length === 0, 'sigue sin inventarse nada — ' + JSON.stringify(nav.active.map(x => x.title)));
    comprobar(nav.matches.length === 0, 'y sin marcar nada — ' + nav.matches.length + ' nodo(s)');

    // 4. Y LO QUE COSTABA DE VERDAD: el cofre diario. No escanear estaba bien; lo que
    // estaba mal es que el `return` se saltara el cierre de la revision.
    // `_dropsReviewInProgress` se pone a true al entrar y solo lo baja
    // `_finishDropsReview`, asi que quedandose arriba `_checkDailyReward` se abstiene en
    // todas sus vueltas: estando en esta pestaña la recompensa diaria NO se reclama.
    // El interval de respaldo es de 3 minutos, o sea que dentro de la ventana del test
    // —y de la paciencia de cualquiera— el unico disparo es el del cierre.
    //
    // Va con control positivo en el MISMO fichero y con los mismos datos: sin el, un
    // cero se explicaria igual porque el cofre no se pueda pulsar en el arnes.
    const cofreOpts = {
        cofre: 'disponible',
        challenges: [{
            recurrence: 'daily', status: 'claimable',
            condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 },
            window: {
                starts_at: new Date(Date.now() - 6 * 3600e3).toISOString(),
                ends_at: new Date(Date.now() + 6 * 3600e3).toISOString()
            }
        }],
        seed: { ...seed, kick_show_hide_inventory_expired: true },
        panels: [{ hidden: false, html: rewards }],
        apiCampaigns: []
    };
    const pulsaElCofre = r => (r.botonesPulsados || []).some(b => /daily reward/i.test(b || ''));

    console.log('\n=== control: el cofre se reclama en una pestaña conocida ===');
    const cofreCtrl = await run({ ...cofreOpts, url: 'https://kick.com/drops/campaigns', waitMs: 20000 });
    comprobar(pulsaElCofre(cofreCtrl),
        'en campañas se pulsa el cofre — ' + JSON.stringify(cofreCtrl.botonesPulsados));

    console.log('\n=== el cofre TAMBIEN se reclama en /drops/rewards ===');
    const cofreRw = await run({ ...cofreOpts, url: 'https://kick.com/drops/rewards', waitMs: 20000 });
    comprobar(pulsaElCofre(cofreRw),
        'la revision se cierra y el cofre se pulsa — ' + JSON.stringify(cofreRw.botonesPulsados));

    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})();
