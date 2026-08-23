// Ocultar en la pestaña de CAMPAÑAS la recompensa que ya está reclamada.
//
// Reportado el 2026-08-22 con PGS 9 Comic Boom (Spray): reclamada y con la casilla
// marcada, el badge del panel ya salía tachado pero la baldosa seguía en la página. El
// fixture es el volcado `docs/dom-campaigns-after-claim-2026-08.html`, tomado justo
// después de reclamar: la baldosa cobrada se queda pelada —imagen, nombre y nada más—
// mientras la otra sigue con su barra al 67%.
//
// Lo que hace falta comprobar aquí es que se esconde LA QUE TOCA y sólo esa, y que la
// decisión sale de la API y no de la forma del DOM. Por eso el segundo caso: el MISMO
// fixture con la API diciendo que no hay nada reclamado. Ahí la baldosa sigue igual de
// pelada, así que si el script se guiara por «no tiene barra → está reclamada» —que es
// la conclusión tentadora y falsa; en `dom-campaigns-2026-08` las DOS recompensas de
// PUBG salen sin barra por tener el contador a cero— la escondería igual y el caso
// fallaría.
//
// El tercero es la casilla apagada: sin ella no se esconde nada, que es lo que da
// sensibilidad al primero.
const { run, readFixture } = require('./harness');

const pane = readFixture('fixture-campaigns-after-claim.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// 40 vistos: el primer tramo (30) está hecho y cobrado, el segundo (60) va por 2/3, que
// es lo que dice la barra del volcado (67%).
const campana = (claimed) => [{
    name: 'PGS 9 Drops', status: 'active', progress_units: 40,
    starts_at: iso(ahora - 2 * hora), ends_at: iso(ahora + 22 * hora),
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards: [
        { id: 'pgs-1', name: 'PGS 9 Comic Boom (Spray)', required_units: 30, image_url: 'a.png', claimed },
        { id: 'pgs-2', name: 'PGS 9 Stay Focused (Emblem)', required_units: 60, image_url: 'b.png' }
    ]
}];

// Las dos cobradas: es el estado real de la página el 2026-08-22, cuando el hueco vacío
// se hizo visible.
const campanaAmbas = campana(true).map(c => ({
    ...c,
    rewards: c.rewards.map(r => ({ ...r, claimed: true }))
}));

const CLAVE_CASILLA = 'kick_show_hide_inventory_expired';
const base = {
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: pane }],
    waitMs: 17000
};

const COBRADA = 'PGS 9 Comic Boom (Spray)';
const VIVA = 'PGS 9 Stay Focused (Emblem)';
const busca = (r, nombre) => (r.recompensas || []).find(x => x.nombre === nombre);

(async () => {
    const fallos = [];

    // --- Con la casilla marcada y la API diciendo que está cobrada -----------------
    const on = await run({
        ...base,
        apiCampaigns: campana(true), progress: campana(true),
        seed: { kick_drop_keywords: JSON.stringify(['pubg']), [CLAVE_CASILLA]: true }
    });

    console.log(JSON.stringify({ conCasilla: on.recompensas, badges: (on.active[0] || {}).badges }, null, 2));

    const cobrada = busca(on, COBRADA);
    const viva = busca(on, VIVA);
    if (!cobrada) fallos.push(`el fixture no trae la baldosa "${COBRADA}"`);
    else if (cobrada.visible) fallos.push('la recompensa ya reclamada sigue a la vista en la página');
    if (!viva) fallos.push(`el fixture no trae la baldosa "${VIVA}"`);
    else if (!viva.visible) fallos.push('se escondió también la recompensa que todavía está en curso');

    // El panel es la otra mitad de lo mismo y las dos salen del MISMO dato: si la página
    // la esconde, el badge tiene que salir tachado. Discrepar sería peor que no esconder.
    const badges = (on.active[0] || {}).badges || [];
    if (!badges.some(b => b.includes('✓') && b.includes(COBRADA))) {
        fallos.push(`el panel no tacha la recompensa que la página esconde: ${JSON.stringify(badges)}`);
    }

    // --- La misma baldosa pelada, pero sin reclamar --------------------------------
    const sinReclamar = await run({
        ...base,
        apiCampaigns: campana(false), progress: campana(false),
        seed: { kick_drop_keywords: JSON.stringify(['pubg']), [CLAVE_CASILLA]: true }
    });

    console.log(JSON.stringify({ sinReclamar: sinReclamar.recompensas }, null, 2));

    const noCobrada = busca(sinReclamar, COBRADA);
    if (noCobrada && !noCobrada.visible) {
        fallos.push('se escondió una recompensa que la API NO da por reclamada: ' +
            'la decisión se está tomando por la forma del DOM (sin barra ≠ reclamada)');
    }

    // --- Casilla apagada: no se toca nada ------------------------------------------
    const off = await run({
        ...base,
        apiCampaigns: campana(true), progress: campana(true),
        seed: { kick_drop_keywords: JSON.stringify(['pubg']) }
    });

    console.log(JSON.stringify({ sinCasilla: off.recompensas }, null, 2));

    const offCobrada = busca(off, COBRADA);
    if (offCobrada && !offCobrada.visible) {
        fallos.push('con la casilla apagada se escondió la recompensa igual');
    }

    // --- Marcar la casilla con la página ya cargada también esconde ----------------
    // El otro medio fallo del 2026-08-22: la casilla no hacía efecto hasta recargar.
    const toggled = await run({
        ...base,
        apiCampaigns: campana(true), progress: campana(true),
        seed: { kick_drop_keywords: JSON.stringify(['pubg']) },
        casilla: { id: 'cb-hide-expired', at: 12000 },
        waitMs: 22000
    });

    console.log(JSON.stringify({ alMarcarla: toggled.recompensas }, null, 2));

    const tras = busca(toggled, COBRADA);
    if (tras && tras.visible) {
        fallos.push('marcar la casilla con la página ya cargada no escondió la reclamada ' +
            '(hacía falta recargar)');
    }

    // --- Quitar la casilla la devuelve, sin recargar --------------------------------
    // Es la mitad que se olvida: si esconder no tiene vuelta, la baldosa se queda fuera
    // para siempre y el usuario no tiene forma de recuperarla salvo recargar.
    const restaurada = await run({
        ...base,
        apiCampaigns: campana(true), progress: campana(true),
        seed: { kick_drop_keywords: JSON.stringify(['pubg']), [CLAVE_CASILLA]: true },
        casilla: { id: 'cb-hide-expired', at: 12000 },
        waitMs: 22000
    });

    console.log(JSON.stringify({ alQuitarla: restaurada.recompensas }, null, 2));

    const vuelta = busca(restaurada, COBRADA);
    if (!vuelta || !vuelta.visible) {
        fallos.push('quitar la casilla no devolvió la recompensa escondida');
    }

    // --- Con TODO reclamado se va el bloque de recompensas, no la tarjeta ----------
    // Lo que se vio el 2026-08-22 con las dos recompensas de PUBG cobradas: escondidas
    // las dos baldosas quedaba un «Available rewards» encima de una fila vacía y el
    // marco de color alrededor del hueco. Se esconde ese bloque y NADA más: el nombre
    // del juego y el de la sub-campaña siguen ahí, que es lo que se eligió.
    const todo = await run({
        ...base,
        apiCampaigns: campanaAmbas, progress: campanaAmbas,
        seed: { kick_drop_keywords: JSON.stringify(['pubg']), [CLAVE_CASILLA]: true }
    });

    console.log(JSON.stringify({ todoReclamado: todo.recompensas, encabezados: todo.encabezados }, null, 2));

    (todo.recompensas || []).forEach(r => {
        if (r.visible) fallos.push(`con todo reclamado sigue a la vista "${r.nombre}"`);
    });
    const enc = nombre => (todo.encabezados || []).find(h => h.texto === nombre);
    const rewards = enc('Available rewards');
    if (!rewards) fallos.push('el fixture no trae el encabezado «Available rewards»');
    else if (rewards.visible) {
        fallos.push('con todas las baldosas escondidas sigue a la vista el título «Available rewards» ' +
            '(y con él la fila vacía)');
    }
    ['PUBG: Battlegrounds', 'PGS 9 Drops'].forEach(nombre => {
        const h = enc(nombre);
        if (!h) fallos.push(`el fixture no trae el encabezado "${nombre}"`);
        else if (!h.visible) fallos.push(`se escondió de más: "${nombre}" tenía que quedarse`);
    });

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})();
