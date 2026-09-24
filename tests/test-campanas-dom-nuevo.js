// La pestaña de CAMPAÑAS con el DOM de septiembre de 2026 (tokens `bg-surface-bg-*`).
//
// Hasta aqui, todos los tests de esta pestaña corrian sobre fixtures de agosto, con las
// clases viejas (`bg-surface-base`…). El renombre de la escala de tokens solo estaba
// cubierto en reclamados y cerradas (`test-dom-nuevo-clases`), y en campañas quedaba
// «sin validar» porque los volcados de septiembre de esa pestaña eran estados vacios.
// El fixture sale de `docs/dom-campaigns-emotes-badges-2026-09-23.html`, el primero con
// campañas de verdad, y trae cosas que ningun otro tenia:
//
//   1. TRES grupos de juego a la vez, y uno de ellos (CS2, «Logitech G Play Connect») con
//      las doce recompensas reclamadas —la baldosa dice «Pedido»—. Es el caso de «ocultar
//      completados» en el que la sub-campaña se queda sin nada a la vista: se esconde su
//      bloque de recompensas y el grupo del juego NO, que lleva el resaltado y la marca.
//   2. Dos sub-campañas de la organizacion KICK (World of Warcraft: Forever y DEDsafio 4
//      Minecraft) que reparten un emote y un emblema. En Kick eso no es un camino aparte
//      —se reclaman como cualquier drop—, asi que lo unico que hay que ver es que salen
//      con su coste como el resto.
//   3. La fila «Tu progreso» con los filtros por juego (Todas / CS2 / WoW / Minecraft),
//      que en agosto no salian en esta pestaña. El script solo los esconde en reclamados:
//      aqui tienen que quedarse.
//   4. Barras casi a cero: `data-value` 0.004 / 0.002 / 0.0013333333 con
//      `aria-valuetext="0%"`. Es lo que pone a prueba la reconstruccion del tramo sin API
//      (`total = faltan / (1 − f)`): leyendo el porcentaje redondeado saldria f = 0, y el
//      de Minecraft da 1499 / (1 − 0.0013333) ≈ 1501, que solo el redondeo a multiplos de
//      5 devuelve a los 1500 que cuesta de verdad.
//
// AVISO al leer el verde, como en `test-campaigns`: pasa con el script de hoy, asi que no
// prueba ningun arreglo. Es un guardarrail: si el script dejara de reconocer las clases
// nuevas en esta pestaña, falla. Comprobado con una copia del script a la que se le quita
// la generacion nueva de `CLS_SURFACE` y `CLS_CARD_BORDER` (via `KICK_SCRIPT`).
const { run, readFixture } = require('./harness');

const pane = readFixture('fixture-campaigns-nuevo-dom.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// Los minutos vistos cuadran con el volcado: 6 en la de WoW (1500 − 6 = 1494 = «24 h y
// 54 min», 3000 − 6 = 2994 = «49 h y 54 min») y 1 en la de Minecraft («24 h y 59 min»).
const tickets = Array.from({ length: 12 }, (_, i) => ({
    id: `lgpc-${i + 1}`, name: `LGPC - Ticket #${i + 1}`, required_units: (i + 1) * 30, image_url: 't.png'
}));
const api = (ticketsCobrados) => [
    {
        name: 'Logitech G Play Connect', status: 'active', progress_units: 400,
        starts_at: iso(ahora - 12 * hora), ends_at: iso(ahora + 30 * hora),
        category: { name: 'Counter-Strike 2' }, organization: { name: 'Logitech' },
        rewards: tickets.map(t => ({ ...t, claimed: ticketsCobrados }))
    },
    {
        name: 'World of Warcraft: Forever', status: 'active', progress_units: 6,
        starts_at: iso(ahora - 17 * hora), ends_at: iso(ahora + 900 * hora),
        category: { name: 'World of Warcraft: Forever' }, organization: { name: 'KICK' },
        rewards: [
            { id: 'wow-1', name: 'MurlocJam Emote', required_units: 1500, image_url: 'a.png' },
            { id: 'wow-2', name: 'World of Warcraft Forever Badge', required_units: 3000, image_url: 'b.png' }
        ]
    },
    {
        name: 'DEDsafio 4 Minecraft', status: 'active', progress_units: 1,
        starts_at: iso(ahora - 1 * hora), ends_at: iso(ahora + 700 * hora),
        category: { name: 'Minecraft' }, organization: { name: 'KICK' },
        rewards: [{ id: 'ded-1', name: 'DEDsafio Nutria', required_units: 1500, image_url: 'c.png' }]
    }
];

const CLAVE_CASILLA = 'kick_show_hide_inventory_expired';
const KEYWORDS = JSON.stringify(['counter-strike', 'warcraft', 'minecraft']);
const base = {
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: pane }],
    waitMs: 17000
};

const li = alt => `main li:has(img[alt="${alt}"])`;
const EMOTE = 'MurlocJam Emote';
const BADGE = 'World of Warcraft Forever Badge';
const NUTRIA = 'DEDsafio Nutria';
const busca = (r, nombre) => (r.recompensas || []).find(x => x.nombre === nombre);
const esTicket = x => /^LGPC - Ticket #/.test(x.nombre);

(async () => {
    const fallos = [];

    // --- A. Con API, la casilla marcada y los tickets cobrados ----------------------
    const a = await run({
        ...base,
        apiCampaigns: api(true), progress: api(true),
        seed: { kick_drop_keywords: KEYWORDS, [CLAVE_CASILLA]: true }
    });

    console.log(JSON.stringify({
        recompensas: a.recompensas, pageMarks: a.pageMarks, hiddenGroups: a.hiddenGroups,
        filtrosKick: a.filtrosKickVisibles, encabezados: a.encabezados,
        active: (a.active || []).map(c => ({ title: c.title, chips: c.chips, badges: c.badges }))
    }, null, 2));

    const recs = a.recompensas || [];
    if (recs.length !== 15) fallos.push(`el fixture deberia traer 15 recompensas y trae ${recs.length}`);
    const ticketsVisibles = recs.filter(esTicket).filter(x => x.visible);
    if (ticketsVisibles.length) {
        fallos.push(`con la casilla, siguen a la vista ${ticketsVisibles.length} tickets ya reclamados`);
    }
    [EMOTE, BADGE, NUTRIA].forEach(n => {
        const r = busca(a, n);
        if (!r) fallos.push(`el fixture no trae la baldosa "${n}"`);
        else if (!r.visible) fallos.push(`se escondio "${n}", que no esta reclamada`);
    });

    // El bloque «Recompensas disponibles» de CS2 se va con sus baldosas; los otros dos no.
    const disp = (a.encabezados || []).filter(e => e.texto === 'Recompensas disponibles');
    if (disp.length !== 3) {
        fallos.push(`se esperaban 3 encabezados «Recompensas disponibles» y hay ${disp.length}`);
    } else if (disp[0].visible || !disp[1].visible || !disp[2].visible) {
        fallos.push(`«Recompensas disponibles» deberia esconderse SOLO en CS2: ${JSON.stringify(disp.map(e => e.visible))}`);
    }

    // Los tres grupos de juego se reconocen —sin esto no hay ids drop-match-*— y ninguno
    // se esconde, tampoco el de CS2 aunque no le quede nada.
    const grupos = a.hiddenGroups || [];
    if (grupos.length !== 3) {
        fallos.push(`se esperaban 3 grupos de juego marcados y hay ${grupos.length}: ${JSON.stringify(grupos)}`);
    }
    if (grupos.some(g => g.display === 'none')) {
        fallos.push(`se escondio un grupo de juego entero: ${JSON.stringify(grupos)}`);
    }

    // La marca de coste en la tarjeta de la pagina: lo mas caro que queda, por campaña.
    // En WoW es el emblema (49h 54m), no el emote; CS2 no lleva, que ya no le queda nada.
    const marcas = (a.pageMarks || []).map(m => String(m).trim());
    const coste = marcas.filter(m => m.startsWith('⏱'));
    if (coste.length !== 2) fallos.push(`se esperaban 2 marcas ⏱ (WoW y Minecraft) y hay: ${JSON.stringify(coste)}`);
    if (!coste.includes('⏱ 49h 54m')) fallos.push(`WoW deberia marcar «⏱ 49h 54m» (su emblema): ${JSON.stringify(coste)}`);
    if (!coste.includes('⏱ 24h 59m')) fallos.push(`Minecraft deberia marcar «⏱ 24h 59m»: ${JSON.stringify(coste)}`);

    // El panel: las tres, con el titulo compuesto y cada recompensa con su coste.
    const tarjeta = t => (a.active || []).find(c => c.title === t);
    const wow = tarjeta('World of Warcraft: Forever - KICK');
    const mc = tarjeta('Minecraft - KICK');
    const cs = tarjeta('Counter-Strike 2 - Logitech G Play Connect');
    if (!wow) fallos.push('el panel no trae la tarjeta «World of Warcraft: Forever - KICK»');
    else if (JSON.stringify(wow.badges) !== JSON.stringify([`${EMOTE} (25 h)`, `${BADGE} (50 h)`])) {
        fallos.push(`badges de WoW: ${JSON.stringify(wow.badges)}`);
    }
    if (!mc) fallos.push('el panel no trae la tarjeta «Minecraft - KICK»');
    else if (JSON.stringify(mc.badges) !== JSON.stringify([`${NUTRIA} (25 h)`])) {
        fallos.push(`badges de Minecraft: ${JSON.stringify(mc.badges)}`);
    }
    if (!cs) fallos.push('el panel no trae la tarjeta de CS2');
    else if ((cs.badges || []).length !== 12 || !cs.badges.every(b => b.startsWith('✓ '))) {
        fallos.push(`CS2 deberia salir con los 12 tickets tachados: ${JSON.stringify(cs.badges)}`);
    }

    // Los filtros por juego de Kick se quedan en campañas.
    if (a.filtrosKickVisibles !== 1) {
        fallos.push(`los filtros por juego de Kick deberian seguir a la vista en campañas (${a.filtrosKickVisibles})`);
    }

    // --- B. Casilla apagada: no se esconde nada -------------------------------------
    // Es lo que da sensibilidad a A: sin esto, un fixture que se leyera mal y dejara las
    // baldosas sin reconocer tambien daria «ningun ticket a la vista»... si el arnes no
    // las encontrara. Aqui tienen que estar las quince, y visibles.
    const b = await run({
        ...base,
        apiCampaigns: api(true), progress: api(true),
        seed: { kick_drop_keywords: KEYWORDS }
    });
    const ocultasSinCasilla = (b.recompensas || []).filter(x => !x.visible);
    if (ocultasSinCasilla.length) {
        fallos.push(`sin la casilla se escondieron ${ocultasSinCasilla.length} recompensas`);
    }

    // --- C. Sin API: el tramo sale de la barra, con fracciones casi a cero -----------
    const c = await run({
        ...base,
        apiCampaigns: null, progress: null,
        seed: { kick_drop_keywords: KEYWORDS },
        hover: { sels: [li(EMOTE), li(BADGE), li(NUTRIA)], at: 11000 },
        clickDrop: { sel: li(NUTRIA), at: 14500 }
    });

    console.log(JSON.stringify({ sinApi: c.tip.casos, modal: c.modal }, null, 2));

    const tipDe = sel => (c.tip.casos || []).find(x => x.sel === sel);
    [[EMOTE, 'Tiempo restante: 24h 54m'], [BADGE, 'Tiempo restante: 49h 54m'], [NUTRIA, 'Tiempo restante: 24h 59m']]
        .forEach(([n, esperado]) => {
            const t = tipDe(li(n));
            if (!t || !t.visible) fallos.push(`sin API: no salio el aviso sobre "${n}"`);
            else if (t.texto !== esperado) fallos.push(`sin API, "${n}": "${t.texto}" (se esperaba "${esperado}")`);
        });

    if (!c.modal.abierto) {
        fallos.push('sin API: pulsar DEDsafio Nutria no abrio el modal' + (c.modal.error ? ` (${c.modal.error})` : ''));
    } else if (!(c.modal.texto || '').includes('/ 1500 min')) {
        // 1499 / (1 − 0.0013333) ≈ 1501: sin el redondeo a multiplos de 5 saldria 1501.
        fallos.push(`sin API, el modal no reconstruye el tramo de 1500 min: ${c.modal.texto}`);
    }

    if (fallos.length) {
        console.log('\nFALLOS:\n - ' + fallos.join('\n - '));
        process.exit(1);
    }
    console.log('\nTODO OK');
    process.exit(0);
})();
