// LA REJILLA DE RECLAMADOS, AL CAMBIAR DE PESTAÑA (reportado el 2026-08-22).
//
// El viaje es reclamados → cerradas → reclamados, sin recargar, que es como se ve el
// fallo: la rejilla se quedaba colgando DEBAJO del contenido de cerradas, con su
// título «Reclamados», sus baldosas y el cofre diario incluido.
//
// La causa no está en ninguna comprobación de ruta: nuestra sección no la gestiona
// React. Vive como un hijo más del contenedor que Kick reutiliza entre pestañas, y al
// cambiar de pestaña React reemplaza SUS hijos y deja donde estaban los ajenos. Con
// ella se quedaba puesto el `display:none` de los bloques que habíamos escondido, que
// es lo que dejaba la pestaña siguiente en blanco.
//
// Por eso el arnés navega con `reactSwap`: su modo de siempre borra el contenedor con
// `innerHTML` y eso se lleva también la rejilla, o sea que limpiaba él solito el
// desorden que venía a buscar. Contra el script de antes del arreglo, este test tiene
// que FALLAR en el paso de cerradas; si pasa, es que el modo de navegación no es el
// bueno.
//
// Las tres cosas que se comprueban son distintas entre sí:
// De paso comprueba los filtros por juego de Kick (All / Rust / PUBG…), que se esconden
// en reclamados —ahi ya no filtran nada, porque lo que recortaban son los bloques que
// escondemos nosotros— y NO en cerradas, donde esos bloques se quedan y sus filtros siguen
// sirviendo. Las dos mitades hacen falta: sin la de cerradas, «los esconde» lo cumpliria
// tambien un arreglo que los escondiera en toda la seccion.
//
//   · en cerradas no queda NI UNA rejilla —no basta con que esté escondida: la de
//     reclamados se vuelve a pintar entera al llegar, así que lo que sobreviva solo
//     puede duplicarse—;
//   · los bloques de cerradas se ven, o sea que no nos llevamos por delante su
//     contenido al esconder el nuestro;
//   · y de vuelta en reclamados la rejilla está otra vez, UNA sola.
const { run, readFixture } = require('./harness');

const reclamados = readFixture('fixture-claimed-panel.html');
const cerradas = readFixture('fixture-expired-panel.html');

const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

(async () => {
    const fallos = [];

    const r = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: reclamados }],
        progress,
        seed: { kick_show_hide_inventory_expired: true },
        navigateTo: [
            { url: 'https://kick.com/drops/expired', html: cerradas, at: 16000, reactSwap: true },
            { url: 'https://kick.com/drops/claimed', html: reclamados, at: 26000, reactSwap: true }
        ],
        snapAt: { enReclamados: 15000, enCerradas: 24000 },
        waitMs: 40000
    });

    console.log(JSON.stringify({
        enReclamados: r.snaps.enReclamados,
        enCerradas: r.snaps.enCerradas,
        alVolver: {
            rejilla: r.claimedGrid,
            grupos: r.hiddenGroups.map(g => g.display),
            filtrosKick: r.filtrosKickVisibles
        }
    }, null, 2));

    const ida = r.snaps.enReclamados || {};
    const fuera = r.snaps.enCerradas || {};

    // Control positivo: sin esto, «en cerradas no hay rejilla» lo cumpliría también un
    // script que no la pinte nunca.
    if (ida.rejillas !== 1) {
        fallos.push(`en reclamados tenía que haber 1 rejilla y hubo ${ida.rejillas}`);
    }

    if (fuera.ruta !== '/drops/expired') {
        fallos.push(`la foto de cerradas se tomó en ${fuera.ruta}; hay que ajustar los tiempos`);
    }
    if (fuera.rejillas !== 0) {
        fallos.push(`la rejilla de reclamados se quedó en la pestaña de cerradas (${fuera.rejillas})`);
    }
    if ((fuera.grupos || []).some(d => d === 'none')) {
        fallos.push(`en cerradas quedaron bloques escondidos por nosotros: ${JSON.stringify(fuera.grupos)}`);
    }

    if (ida.filtros !== 0) {
        fallos.push(`en reclamados quedaron ${ida.filtros} filtros por juego de Kick a la vista, y ahí ya no filtran nada`);
    }
    if (fuera.filtros !== 1) {
        fallos.push(`en cerradas los filtros por juego tienen que quedarse y se vieron ${fuera.filtros}`);
    }

    if (!r.claimedGrid) {
        fallos.push('al volver a reclamados la rejilla no se volvió a pintar');
    }
    if (r.filtrosKickVisibles !== 0) {
        fallos.push(`al volver a reclamados los filtros de Kick salieron otra vez (${r.filtrosKickVisibles})`);
    }

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
