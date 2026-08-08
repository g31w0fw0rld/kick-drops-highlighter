// La casilla "ocultar reclamados" DESMARCADA. Antes se veia la lista dos veces:
// el bloque de Kick y nuestra rejilla, diciendo lo mismo. Ahora el bloque de Kick
// se esconde igual: no duplicar no es lo mismo que ocultar.
//
// Y la rejilla es un escaparate, asi que va LIMPIA: ni un boton nuestro encima de
// las tarjetas. La ✕ de descartar estaba en la cabecera del bloque de Kick, que ya
// no se ve; se probo moverla aqui y se descarto. Ese es el motivo de vigilar que no
// haya ninguna: al mover cosas de sitio es justo lo que se cuela.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-claimed-panel.html');

const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: panel }],
        waitMs: 26000, progress
        // sin seed: la casilla queda apagada, que es el caso que se rompia
    });

    console.log(JSON.stringify({
        gruposDeKick: r.hiddenGroups.map(g => g.display || '(visible)'),
        tarjetasDeKickVisibles: r.visibleClaimedCards,
        rejillaPropia: r.claimedGrid,
        rejillaTitulo: r.gridTitle,
        rejillaTarjetas: r.claimedGridCards,
        xButtons: r.xButtons
    }, null, 2));

    const fallos = [];
    if (!r.claimedGrid) fallos.push('la rejilla no se pinto: sin ella no hay nada que comprobar');
    if (!r.hiddenGroups.every(g => g.display === 'none'))
        fallos.push('el bloque de Kick sigue visible con la rejilla puesta: lista duplicada');
    if (r.claimedGridCards !== 2)
        fallos.push('la rejilla deberia tener 2 tarjetas, tiene ' + r.claimedGridCards);
    if (r.xButtons !== 0)
        fallos.push('hay ' + r.xButtons + ' ✕ en la rejilla: el escaparate va limpio');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
