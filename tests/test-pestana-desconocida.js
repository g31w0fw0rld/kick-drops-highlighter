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

    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})();
