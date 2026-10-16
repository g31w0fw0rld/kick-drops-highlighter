// EN EL MOVIL DE VERDAD EL SCRIPT ABRIA EL DIALOGO DE ESCRITORIO (2026-10-15).
//
// Reportado con dos capturas en un Galaxy A55 simulado: el modal que abria el script era
// el de ESCRITORIO —«Reclamar tus recompensas», a pantalla completa y con hueco negro
// debajo— y el del menu era el drawer de abajo, que es el que se queria. Kick deja
// montado y oculto el boton del cofre de la barra de escritorio, y el script lo pulsaba
// porque no se veia ningun otro.
//
// 'movil-real' monta lo que hay de verdad: el avatar a la vista y ese boton oculto. El
// modal del arnes es drawer solo si se abrio desde la fila del menu. Tres casos: la
// baldosa, el automatico y, de control, el escritorio, que tiene que seguir yendo por
// su boton. Contra 1.3.28 fallan los dos primeros.
const { run, readFixture } = require('./harness');

const claimed = readFixture('fixture-claimed-panel.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();

const reto = [{
    recurrence: 'daily',
    status: 'in_progress',
    condition: { type: 'watch_time_minutes', progress: 10, threshold: 60 },
    window: { starts_at: iso(Date.now() - 6 * hora), ends_at: iso(Date.now() + 6 * hora) }
}];

// El mismo progreso que el resto de los tests de esta pestaña: dos recompensas ya
// cobradas, para que la rejilla se pinte y la baldosa del cofre tenga donde ir.
const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

const base = {
    url: 'https://kick.com/drops/claimed',
    panels: [{ hidden: false, html: claimed }],
    challenges: reto,
    progress,
    waitMs: 30000,
    clickTarjetaCofre: { at: 20000 },
    seed: { kick_show_hide_inventory_expired: true }
};

(async () => {
    const fallos = [];

    const baldosa = await run({ ...base, cofre: 'movil-real' });
    console.log('baldosa:', JSON.stringify({ drawer: baldosa.dialogoDrawer, abierto: baldosa.dialogoAbierto, botones: baldosa.botonesPulsados }));
    if (!baldosa.dialogoAbierto) fallos.push('pulsar la baldosa no abrio ningun modal');
    else if (!baldosa.dialogoDrawer) fallos.push('pulsar la baldosa abrio el dialogo de ESCRITORIO, no el drawer');
    if ((baldosa.botonesPulsados || []).some(b => /^daily reward$/i.test(b))) fallos.push('se pulso el boton oculto de escritorio');
    if (!(baldosa.botonesPulsados || []).some(b => /Recompensas diarias/i.test(b))) fallos.push('no se pulso la fila del menu: ' + JSON.stringify(baldosa.botonesPulsados));

    const auto = await run({
        ...base, cofre: 'movil-real-disponible', clickTarjetaCofre: null,
        challenges: [{ ...reto[0], status: 'claimable', condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 } }]
    });
    console.log('automatico:', JSON.stringify({ botones: auto.botonesPulsados }));
    if ((auto.botonesPulsados || []).some(b => /^daily reward$/i.test(b))) fallos.push('el automatico pulso el boton oculto de escritorio');
    if (!(auto.botonesPulsados || []).some(b => /Recompensas diarias/i.test(b))) fallos.push('el automatico no fue por la fila del menu: ' + JSON.stringify(auto.botonesPulsados));
    if (!(auto.botonesPulsados || []).some(b => /claim daily reward/i.test(b))) fallos.push('el automatico no cobro: ' + JSON.stringify(auto.botonesPulsados));

    const escritorio = await run({ ...base, cofre: 'cuenta' });
    console.log('escritorio:', JSON.stringify({ drawer: escritorio.dialogoDrawer, abierto: escritorio.dialogoAbierto }));
    if (!escritorio.dialogoAbierto) fallos.push('control: en escritorio la baldosa dejo de abrir el modal');
    if (escritorio.dialogoDrawer) fallos.push('control: en escritorio salio un drawer');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
