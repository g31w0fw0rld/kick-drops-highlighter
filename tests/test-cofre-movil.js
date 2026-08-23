// EL COFRE CUANDO KICK LO BAJA AL MENU DE MOVIL (2026-08-22).
//
// En pantallas estrechas el cofre NO esta en la barra de arriba. Kick lo baja a una fila
// del menu de acciones —«Recompensas diarias»—, que es otro nodo distinto: un <button>
// pelado, sin `aria-haspopup="dialog"` y sin el <video> del CTA, con el mismo icono en
// SVG. El buscador prefiltraba por ese atributo, asi que en movil no encontraba nada y
// pulsar la baldosa no hacia absolutamente nada.
//
// Lo que se prueba es lo unico que el usuario ve: que pulsar la baldosa abre el modal de
// Kick, este el cofre donde este. Y que no reclama nada por el camino, que es la mitad
// que impide arreglar esto pulsando de mas.
//
// El reconocimiento va por FORMA —el path del cofre— y no por el texto de la fila, que
// dice «Recompensas diarias» o «Daily rewards» segun el idioma de la cuenta. Por eso la
// fila del menu que monta el harness lleva una segunda fila («Ajustes») con otro icono:
// si el buscador se agarrara a la posicion o al primer boton del menu, la elegiria a ella.
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

    // MOVIL: el cofre solo existe como fila del menu.
    const movil = await run({ ...base, cofre: 'movil' });
    console.log(JSON.stringify({ movil: { modalAbierto: movil.dialogoAbierto, botones: movil.botonesPulsados, cofre: !!movil.cofre } }, null, 2));

    if (!movil.cofre) fallos.push('en móvil no se llegó a pintar la baldosa del cofre');
    if (!movil.dialogoAbierto) {
        fallos.push('pulsar la baldosa en móvil no abrió el modal: no encontró la fila del menú');
    }
    if ((movil.botonesPulsados || []).some(b => /claim|reclamar/i.test(b))) {
        fallos.push(`al abrir el modal en móvil se pulsó algo que reclama: ${JSON.stringify(movil.botonesPulsados)}`);
    }

    // ESCRITORIO: el mismo clic, con el cofre en la barra. Esta mitad es la que sujeta
    // que el arreglo no se llevo por delante el camino que ya funcionaba.
    const escritorio = await run({ ...base, cofre: 'cuenta' });
    console.log(JSON.stringify({ escritorio: { modalAbierto: escritorio.dialogoAbierto, botones: escritorio.botonesPulsados } }, null, 2));

    if (!escritorio.dialogoAbierto) {
        fallos.push('con el cofre en la barra, pulsar la baldosa dejó de abrir el modal');
    }

    // MENU CERRADO, que es el caso de verdad: la fila del cofre NO existe en el DOM
    // hasta que se pulsa el avatar. Verificado en el volcado. Aqui el clic en la baldosa
    // tiene que hacer los DOS pasos —abrir el menu, esperar a que React monte la fila,
    // pulsarla— y acabar con el modal abierto sin haber cobrado nada.
    const cerrado = await run({ ...base, cofre: 'movil-cerrado' });
    console.log(JSON.stringify({ menuCerrado: { modalAbierto: cerrado.dialogoAbierto, botones: cerrado.botonesPulsados } }, null, 2));

    if (!cerrado.dialogoAbierto) {
        fallos.push('con el menú cerrado, pulsar la baldosa no abrió el modal: no dio los dos pasos');
    }
    if (!(cerrado.botonesPulsados || []).some(b => /Recompensas diarias/i.test(b))) {
        fallos.push(`no se llegó a pulsar la fila del menú: ${JSON.stringify(cerrado.botonesPulsados)}`);
    }
    if ((cerrado.botonesPulsados || []).some(b => /claim daily reward/i.test(b))) {
        fallos.push(`abrir el modal con el menú cerrado acabó cobrando: ${JSON.stringify(cerrado.botonesPulsados)}`);
    }

    // Y EL AUTOMATICO POR ESE MISMO CAMINO. Sin tocar la baldosa: reto cumplido y en
    // `claimable`, menu cerrado, y tiene que abrirlo y cobrar el. En movil la fila no
    // tiene video ninguno, asi que la señal de «se puede» sale del reto y no del boton:
    // antes esto se cortaba en seco al no encontrar boton.
    const auto = await run({
        ...base,
        cofre: 'movil-cerrado',
        clickTarjetaCofre: null,
        challenges: [{ ...reto[0], status: 'claimable', condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 } }]
    });
    console.log(JSON.stringify({ automatico: { botones: auto.botonesPulsados } }, null, 2));

    if (!(auto.botonesPulsados || []).some(b => /Recompensas diarias/i.test(b))) {
        fallos.push(`el automático no llegó a la fila del menú: ${JSON.stringify(auto.botonesPulsados)}`);
    }
    if (!(auto.botonesPulsados || []).some(b => /claim daily reward/i.test(b))) {
        fallos.push(`el automático abrió el modal pero no cobró: ${JSON.stringify(auto.botonesPulsados)}`);
    }

    // La otra mitad, sin la que «cobra» no significa nada: con el reto A MEDIAS el
    // automático no toca nada, ni siquiera abre el menú.
    const espera = await run({ ...base, cofre: 'movil-cerrado', clickTarjetaCofre: null });
    console.log(JSON.stringify({ aMedias: { botones: espera.botonesPulsados } }, null, 2));

    if ((espera.botonesPulsados || []).length) {
        fallos.push(`con el reto a medias el automático pulsó algo: ${JSON.stringify(espera.botonesPulsados)}`);
    }

    if (fallos.length) {
        console.log('\nFALLOS:\n - ' + fallos.join('\n - '));
        process.exit(1);
    }
    console.log('\nTODO OK');
    process.exit(0);
})();
