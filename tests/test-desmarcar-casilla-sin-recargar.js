// QUITAR LA CASILLA EN RECLAMADOS YA NO RECARGA LA PAGINA.
//
// Pedido el 2026-10-02: en la pestaña de campañas quitarla no recargaba y en la de
// reclamados si. Ahora tampoco ahi: lo que el barrido escondio lleva su propia marca y
// vuelve sin recargar, y la rejilla se repinta para que el cofre deje de prometer «se
// reclama solo», que con la casilla quitada ya no es verdad.
//
// La recarga se detecta por su rastro en jsdom: `location.reload()` no esta implementado
// y deja un «Not implemented: navigation» en los logs. Sin recarga no hay ese rastro.
//
// Se mira ademas el pie del cofre, porque «no recarga» se cumple tambien con un manejador
// que no haga nada: lo que tiene que pasar es que la promesa se vaya en el sitio.
//
// CONTROL DE SENSIBILIDAD:
//     git show HEAD:kick-drops-highlighter.user.js > /tmp/pub.js
//     KICK_SCRIPT=/tmp/pub.js node tests/test-desmarcar-casilla-sin-recargar.js
// Con 1.3.23 sale la recarga, y el pie del cofre sigue diciendo que se reclama solo.
const { run, readFixture } = require('./harness');

const panel = readFixture('fixture-claimed-panel.html');
const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];
const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
// Acumulando: es el estado en el que el pie dice «se reclama solo» con la casilla puesta.
const reto = [{
    recurrence: 'daily', status: 'in_progress',
    condition: { type: 'watch_time_minutes', progress: 14, threshold: 60 },
    window: { starts_at: iso(Date.now() - 6 * hora), ends_at: iso(Date.now() + 6 * hora) }
}];
const base = {
    url: 'https://kick.com/drops/claimed',
    panels: [{ hidden: false, html: panel }],
    progress, challenges: reto, waitMs: 26000,
    seed: { kick_show_hide_inventory_expired: true }
};
const recargas = (r) => (r.logs || []).filter(l => /Not implemented: navigation/.test(l)).length;

(async () => {
    const fallos = [];

    // Control: con la casilla puesta y sin tocarla, el pie promete y nadie recarga. Sin
    // esto, un pie vacio en el caso de abajo podria ser que el cofre ya no se pinta.
    const puesta = await run(base);
    console.log(JSON.stringify({ caso: 'casilla puesta', pie: puesta.cofre && puesta.cofre.pieTexto, recargas: recargas(puesta) }));
    if (!puesta.cofre) fallos.push('con la casilla puesta no se pinto el cofre');
    else if (!/reclama/i.test(puesta.cofre.pieTexto)) fallos.push(`con la casilla puesta el pie no promete: "${puesta.cofre.pieTexto}"`);
    if (recargas(puesta) !== 0) fallos.push('sin tocar nada ya hubo una recarga: el detector no sirve');

    // El caso: se quita a mitad de sesion, con la rejilla ya pintada.
    const quitada = await run({ ...base, casilla: { at: 12000 } });
    console.log(JSON.stringify({ caso: 'casilla quitada', pie: quitada.cofre && quitada.cofre.pieTexto, recargas: recargas(quitada),
        guardada: quitada.stored.kick_show_hide_inventory_expired }));
    if (quitada.stored.kick_show_hide_inventory_expired !== false) fallos.push('el clic no llego a quitar la casilla');
    if (recargas(quitada) !== 0) fallos.push(`quitar la casilla recargo la pagina (${recargas(quitada)})`);
    if (!quitada.cofre) fallos.push('al quitar la casilla se fue el cofre: los minutos que faltan siguen siendo ciertos');
    else if (/reclama/i.test(quitada.cofre.pieTexto)) fallos.push(`quitada, el pie sigue prometiendo un reclamo: "${quitada.cofre.pieTexto}"`);

    console.log(fallos.length ? '\nFALLOS:\n  ' + fallos.join('\n  ') : '\nTODO OK');
    process.exit(fallos.length ? 1 : 0);
})();
