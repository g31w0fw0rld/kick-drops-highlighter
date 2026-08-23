// La reclamación automática en la pestaña de CAMPAÑAS.
//
// Desde el rediseño de agosto de 2026 el botón de reclamar ya no vive en el inventario:
// sale en la propia tarjeta de la campaña, en cuanto la barra del tramo llega al final.
// El fixture es el volcado `docs/dom-campaigns-claim-button-2026-08.html`, tomado el
// 2026-08-22 con PUBG a medias: el primer tramo completo y con su botón, el segundo al
// 50% y con «30 min to unlock».
//
// Lo que se comprueba es lo que de verdad decide el asunto, y es una sola cosa: que el
// script PULSE ese botón, y sólo cuando la casilla está marcada. En jsdom un clic sobre
// un botón de Kick no tiene ningún efecto observable —no hay servidor al otro lado—, así
// que el arnés anota los botones pulsados; sin eso, reclamar y no reclamar se ven igual.
//
// Los dos primeros casos dan la sensibilidad el uno al otro: la casilla es la única
// diferencia entre ellos, así que si el de «apagada» también pulsara, el de «encendida»
// no probaría nada.
//
// El tercero es el fallo del 2026-08-22: MARCAR la casilla con la página ya cargada no
// reclamaba nada. El barrido ya había terminado con la casilla apagada y sólo volvía a
// correr en la siguiente carga, así que el drop se quedaba con su botón «Claim» delante
// hasta que recargabas.
//
// Ojo con lo que este test NO dice: si el tramo reclamado DESAPARECE de la pestaña de
// campañas es cosa del servidor de Kick, y el volcado es de antes de reclamar. Eso hay
// que verlo en la página, no aquí.
const { run, readFixture } = require('./harness');

const pane = readFixture('fixture-campaigns-claim.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// 30 vistos: el primer tramo (30) está completo y el segundo (60) va por la mitad, que es
// exactamente lo que dicen las dos barras del volcado (100% y 50%).
const api = [{
    name: 'PGS 9 Drops', status: 'active', progress_units: 30,
    starts_at: iso(ahora - 2 * hora), ends_at: iso(ahora + 22 * hora),
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards: [
        { id: 'pgs-1', name: 'PGS 9 Comic Boom (Spray)', required_units: 30, image_url: 'a.png' },
        { id: 'pgs-2', name: 'PGS 9 Stay Focused (Emblem)', required_units: 60, image_url: 'b.png' }
    ]
}];

const base = {
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: pane }],
    apiCampaigns: api, progress: api,
    waitMs: 17000
};

const CLAVE_CASILLA = 'kick_show_hide_inventory_expired';
const esDeReclamar = etiqueta => /claim/i.test(String(etiqueta || ''));

(async () => {
    const fallos = [];

    // --- Casilla marcada: se reclama ---------------------------------------------
    const on = await run({
        ...base,
        seed: {
            kick_drop_keywords: JSON.stringify(['pubg']),
            [CLAVE_CASILLA]: true
        }
    });

    console.log(JSON.stringify({ conCasilla: on.botonesPulsados }, null, 2));

    const pulsados = (on.botonesPulsados || []).filter(esDeReclamar);
    if (pulsados.length === 0) {
        fallos.push('con la casilla marcada no se pulsó el botón de reclamar; ' +
            `se pulsaron: ${JSON.stringify(on.botonesPulsados)}`);
    } else if (!pulsados.some(e => e.includes('PGS 9 Comic Boom (Spray)'))) {
        // El aria-label lleva el nombre del tramo, así que se puede exigir que sea el
        // tramo COMPLETO y no cualquier botón: el del 50% no tiene botón ninguno.
        fallos.push(`se pulsó un botón de reclamar que no es el del tramo completo: ${JSON.stringify(pulsados)}`);
    }
    if (pulsados.length > 1) {
        fallos.push(`el botón de reclamar se pulsó ${pulsados.length} veces (sólo hay un tramo completo)`);
    }

    // --- Casilla sin marcar: no se toca nada --------------------------------------
    const off = await run({
        ...base,
        seed: { kick_drop_keywords: JSON.stringify(['pubg']) }
    });

    console.log(JSON.stringify({ sinCasilla: off.botonesPulsados }, null, 2));

    const pulsadosOff = (off.botonesPulsados || []).filter(esDeReclamar);
    if (pulsadosOff.length > 0) {
        fallos.push(`con la casilla sin marcar se reclamó igual: ${JSON.stringify(pulsadosOff)}`);
    }

    // --- Marcar la casilla con la página ya cargada también reclama ----------------
    const toggled = await run({
        ...base,
        seed: { kick_drop_keywords: JSON.stringify(['pubg']) },
        // Después del primer barrido, que es cuando se veía el fallo: si se marcara
        // antes, el barrido de siempre la encontraría ya puesta y el caso no probaría
        // nada distinto del primero.
        casilla: { id: 'cb-hide-expired', at: 12000 },
        waitMs: 22000
    });

    console.log(JSON.stringify({ alMarcarla: toggled.botonesPulsados }, null, 2));

    const pulsadosToggle = (toggled.botonesPulsados || []).filter(esDeReclamar);
    if (pulsadosToggle.length === 0) {
        fallos.push('marcar la casilla con la página cargada no reclamó nada; ' +
            `se pulsaron: ${JSON.stringify(toggled.botonesPulsados)}`);
    }

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})();
