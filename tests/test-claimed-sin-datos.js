// El fallo reportado: entrando a /drops/claimed desde campañas o proximas, la pestaña
// se quedaba EN BLANCO — ni la lista de Kick ni nuestra rejilla.
//
// Pasaba porque las dos mitades las decidian sitios distintos. El barrido de
// cleanInventory escondia el bloque de Kick por su cuenta, en su propio intervalo, y la
// rejilla se pintaba —o no— en otro. Si los datos de reclamado no llegaban (sin token no
// hay /drops/progress, y sin progress no se sabe que tienes), lo de Kick ya estaba
// escondido y no venia nada a sustituirlo.
//
// Aqui se reproduce ese estado: pestaña de reclamados, DOM real, y NINGUN dato de
// progreso. La regla que se comprueba es la que lo hace imposible: solo puede esconder
// la lista de Kick el hecho de haber pintado la nuestra.
//
// Caso 2, el de siempre: con datos, la sustitucion si ocurre.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-claimed-panel.html');

const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

const ver = r => ({
    gruposDeKick: r.hiddenGroups.map(g => g.display || '(visible)'),
    tarjetasVisibles: r.visibleClaimedCards,
    rejillaPropia: r.claimedGrid,
    rejillaTarjetas: r.claimedGridCards
});

(async () => {
    // La casilla marcada, que es como lo tiene el usuario: antes era justo lo que
    // disparaba el ocultado sin mirar si habia con que sustituir.
    const sinDatos = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: panel }],
        waitMs: 26000,
        seed: { kick_show_hide_inventory_expired: true }
    });

    const conDatos = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: panel }],
        waitMs: 26000, progress,
        seed: { kick_show_hide_inventory_expired: true }
    });

    console.log(JSON.stringify({
        sinDatosDeReclamado: ver(sinDatos),
        conDatosDeReclamado: ver(conDatos)
    }, null, 2));

    const fallos = [];
    if (sinDatos.claimedGrid)
        fallos.push('sin datos no deberia haber rejilla, y la hay: el caso no se esta probando');
    if (sinDatos.hiddenGroups.some(g => g.display === 'none'))
        fallos.push('PESTAÑA EN BLANCO: se escondio lo de Kick sin tener rejilla que poner');
    if (sinDatos.visibleClaimedCards === 0)
        fallos.push('no queda ni una tarjeta visible: el usuario no ve nada');
    if (!conDatos.claimedGrid)
        fallos.push('con datos la rejilla no se pinto');
    if (!conDatos.hiddenGroups.every(g => g.display === 'none'))
        fallos.push('con la rejilla puesta, lo de Kick sigue visible: lista duplicada');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
