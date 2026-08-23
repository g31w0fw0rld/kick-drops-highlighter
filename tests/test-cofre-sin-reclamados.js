// EL COFRE EN UNA PESTAÑA DE RECLAMADOS VACIA (2026-08-22).
//
// Reportado con la pestaña delante: el cofre no se construia. Y no era un fallo de la
// tarjeta —el resto de sus casos estan en test-cofre-diario— sino de la rejilla que la
// contiene, que se rendia antes de mirar si habia cofre. Dos cortes, los dos con la
// misma idea equivocada de que «cero drops reclamados» significa que no hay nada:
//
//   · la rejilla salia si `_interceptedClaimedCampaigns` venia vacio. Cero cobrados es
//     una respuesta valida, no un dato que falte, y desde que el cofre es una baldosa
//     mas la rejilla puede tener contenido sin un solo drop.
//   · y aunque no saliera, no habia ancla: sin grupos de juego, la pestaña solo trae el
//     estado vacio de Kick. Ese pasa a ser el ancla.
//
// Los dos casos son el mismo escenario cambiando SOLO si hay cofre, que es lo que le da
// la sensibilidad: con cofre la rejilla aparece y el cartel de «no hay nada» se esconde;
// sin cofre no se toca nada, porque ahi el cartel dice la verdad. Sin la segunda mitad,
// «pinta la rejilla» lo cumpliria tambien algo que la pintara siempre, vacia.
const { run, readFixture } = require('./harness');

// La pestaña tal cual la sirve Kick sin nada cobrado: el parrafo de la seccion y el
// estado vacio. Ni un grupo de juego, ni los filtros por juego.
const vacio = readFixture('fixture-claimed-vacio.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();

const reto = [{
    recurrence: 'daily',
    status: 'in_progress',
    condition: { type: 'watch_time_minutes', progress: 14, threshold: 60 },
    window: { starts_at: iso(Date.now() - 6 * hora), ends_at: iso(Date.now() + 6 * hora) }
}];

const base = {
    url: 'https://kick.com/drops/claimed',
    panels: [{ hidden: false, html: vacio }],
    // Cero reclamados, que es el escenario: la respuesta llega, y viene sin nada.
    progress: [],
    waitMs: 26000,
    seed: { kick_show_hide_inventory_expired: true }
};

(async () => {
    const fallos = [];

    const conCofre = await run({ ...base, challenges: reto });
    console.log(JSON.stringify({
        conCofre: {
            rejilla: conCofre.claimedGrid, tarjetas: conCofre.claimedGridCards,
            cofre: conCofre.cofre, estadoVacio: conCofre.estadoVacioVisible
        }
    }, null, 2));

    if (!conCofre.claimedGrid) {
        fallos.push('sin drops reclamados y con cofre, la rejilla no se pintó');
    } else {
        if (conCofre.claimedGridCards !== 1) {
            fallos.push(`la rejilla trae ${conCofre.claimedGridCards} baldosas y tenía que traer solo la del cofre`);
        }
        if (!conCofre.cofre) fallos.push('la única baldosa no es la del cofre');
        else if (conCofre.cofre.pie !== 'nota') {
            fallos.push(`el pie del cofre es "${conCofre.cofre.pie}" y tenía que ser la nota`);
        }
        if (conCofre.estadoVacioVisible !== false) {
            fallos.push('el «No claimed campaigns yet» de Kick se quedó encima de la rejilla');
        }
    }

    // Y sin cofre no hay nada que enseñar: ni rejilla, ni tocar el cartel de Kick.
    const sinCofre = await run({ ...base, challenges: [] });
    console.log(JSON.stringify({
        sinCofre: {
            rejilla: sinCofre.claimedGrid, tarjetas: sinCofre.claimedGridCards,
            estadoVacio: sinCofre.estadoVacioVisible
        }
    }, null, 2));

    if (sinCofre.claimedGrid) fallos.push('sin cofre y sin reclamados se pintó una rejilla vacía');
    if (sinCofre.estadoVacioVisible !== true) {
        fallos.push('sin nada que poner en su sitio, el estado vacío de Kick se escondió igual');
    }

    if (fallos.length) {
        console.log('\nFALLOS:\n - ' + fallos.join('\n - '));
        process.exit(1);
    }
    console.log('\nTODO OK');
    process.exit(0);
})();
