// «RECARGAR DROPS» RECARGA Y NADA MAS; VACIAR LOS AVISOS VA EN SU PROPIO BOTON.
//
// Pedido el 2026-10-01. Hasta 1.3.23 «Recargar drops» vaciaba ademas la lista de avisos, y
// con la lista vacia el siguiente escaneo da por NUEVA cada campaña que casa con tus
// keywords: recargar volvia a poner un 🔔 en todas. Ahora eso lo hace «Restablecer
// alertas», y solo tras confirmar. (En Twitch el boton nuevo devuelve ademas los
// descartados con la ✕; Kick no tiene esa lista.)
//
// Se mira el ALMACEN, no el DOM: lo que importa es si se borra el dato, y el repintado
// tras recargar no existe en jsdom (location.reload no esta implementado).
//
// CONTROL DE SENSIBILIDAD:
//     git show HEAD:kick-drops-highlighter.user.js > /tmp/pub.js
//     KICK_SCRIPT=/tmp/pub.js node tests/test-boton-recargar-no-borra.js
// Con 1.3.23, pulsar «Recargar drops» vacia los avisos y el boton nuevo no existe.
const { run } = require('./harness');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();
const API = [{
    name: 'Temporada de prueba', status: 'active',
    starts_at: iso(ahora - dia), ends_at: iso(ahora + dia),
    category: { name: 'Rust' }, organization: { name: 'Facepunch' },
    rewards: [{ id: 'r1', name: 'Casco', required_units: 60, image_url: 'drops/reward/x.png' }]
}];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok   ' : '  FALLA') + ' ' + msg); if (!ok) fallos++; };

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: '<div></div>' }],
        apiCampaigns: API,
        seed: { kick_drop_keywords: JSON.stringify(['rust']) },
        waitMs: 12000,
        dejarAbierta: true
    });
    const avisos = () => { try { return JSON.parse(r.botones.almacen('kick_drop_notifications') || '[]').length; } catch (e) { return -1; } };

    console.log('\n=== el punto de partida ===');
    // Sin esto, «no se borra» pasaria con una lista que ya estaba vacia.
    const antes = avisos();
    comprobar(antes > 0, 'hay avisos guardados — ' + antes);

    console.log('\n=== «Recargar drops» ===');
    comprobar(await r.botones.pulsar('Recargar drops'), 'el boton esta en el panel');
    comprobar(avisos() === antes, 'no toca los avisos — ' + avisos() + ' de ' + antes);

    console.log('\n=== «Restablecer alertas», diciendo que no ===');
    comprobar(await r.botones.pulsar('Restablecer alertas'), 'el boton nuevo esta en el panel');
    comprobar(await r.botones.pulsar('No', { enPanel: false }), 'pregunta antes de borrar');
    comprobar(avisos() === antes, 'con «No» no se borra nada — ' + avisos());

    console.log('\n=== «Restablecer alertas», diciendo que si ===');
    await r.botones.pulsar('Restablecer alertas');
    comprobar(await r.botones.pulsar('Si', { enPanel: false }) || await r.botones.pulsar('Sí', { enPanel: false }),
        'vuelve a preguntar');
    comprobar(avisos() === 0, 'vacia los avisos — ' + avisos());

    console.log(fallos === 0 ? '\nTODO OK' : '\nFALLOS: ' + fallos);
    process.exit(fallos === 0 ? 0 : 1);
})();
