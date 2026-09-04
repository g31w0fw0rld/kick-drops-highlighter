// LA REJILLA DE RECLAMADOS NO VUELVE TRAS UN REPINTADO.
//
// Reportado el 2026-09-04: «al moverme entre pestañas y regresar a reclamados, tarda en
// repintar nuestro grid o no lo hace».
//
// La causa esta en el codigo: `_renderClaimedInventorySoon` sondea hasta que ve la rejilla
// puesta y entonces PARA —y hace bien, si no sondearia para siempre—, asi que un repintado
// de React POSTERIOR se la lleva y ya no hay nadie mirando. El observer de repintado que
// cubre las pestañas que marcan se saltaba reclamados a proposito («ahi el trabajo es
// otro»), y esa conclusion estaba mal: el trabajo es otro, no es ninguno.
//
// Y en esta pestaña es lo que peor sienta, porque nuestra rejilla SUSTITUYE a la lista de
// Kick: si se la lleva un repintado, no queda ni lo nuestro ni lo suyo.
//
// DOS INTENTOS ANTERIORES DE ESTE TEST SALIERON VERDES CON EL FALLO DENTRO, y merece la
// pena dejarlo escrito:
//   · el primero esperaba al final de una ventana larga, y ahi la rejilla acaba pintandose
//     por otro camino (el barrido de `cleanInventory` termina pidiendo el inventario);
//   · el segundo intento simular la barra de pestañas llegando tarde a la URL, pero el
//     arnés BORRA la barra al sustituir el contenido, y sin barra el codigo ya tolera la
//     URL sola: el desacuerdo que yo creia estar creando no existia.
// De ahi que este mida el repintado y nada mas, y que se compruebe en rojo antes de darlo
// por bueno.
const { run, readFixture } = require('./harness');

const claimed = readFixture('fixture-claimed-nuevo-dom.html');
const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: claimed }],
        progress,
        seed: { kick_show_hide_inventory_expired: true },
        // El repintado llega a los 14 s, con la rejilla ya pintada y el sondeo terminado
        // —que es la condicion del fallo: si llegara antes, el sondeo lo taparia—.
        lateHtml: claimed, lateMs: 14000,
        waitMs: 22000
    });

    console.log('  rejilla tras el repintado:', r.claimedGrid, '| tarjetas:', r.claimedGridCards);

    comprobar(r.claimedGrid === true, 'la rejilla vuelve a pintarse despues del repintado');
    comprobar(r.claimedGridCards > 0, 'y trae sus tarjetas');

    // No se esconde la lista de Kick sin haber puesto lo que la sustituye. Es la peor de
    // las combinaciones —la pestaña se queda sin nada— y va aparte porque puede darse
    // aunque lo de arriba este en verde.
    const escondidos = (r.hiddenGroups || []).filter(g => g.display === 'none').length;
    console.log('  grupos de Kick escondidos:', escondidos);
    comprobar(!(escondidos > 0 && r.claimedGrid !== true),
        'no queda lo de Kick escondido sin rejilla que lo sustituya');

    // Y que no se repinte en bucle viendose a si mismo: pintar la rejilla INSERTA nodos,
    // asi que un observer mal encuadrado se dispara con su propio trabajo. Un repintado
    // provocado tiene que dar un puñado de re-pintados, no una racha.
    const veces = r.logs.filter(l => l.includes('re-pintando la rejilla')).length;
    console.log('  re-pintados               :', veces, '(1 repintado provocado)');
    comprobar(veces >= 1, 'el repintado se detecta (el observer llega a reclamados)');
    comprobar(veces <= 3, 'y NO se re-pinta en bucle viendose a si mismo');

    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
