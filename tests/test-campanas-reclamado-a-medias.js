// Una sub-campaña con PARTE reclamada y parte en curso, en el DOM de septiembre de 2026.
//
// El fixture (`fixture-campaigns-partial-claimed.html`, Starseries Sept Drops de CS2)
// entro en la 1.3.16 y hasta aqui no lo leia ningun test. Es el caso que le falta a
// `test-campanas-dom-nuevo`, donde CS2 esta reclamada ENTERA: aqui cinco tickets dicen
// «Pedido» y los otros seis llevan barra (del 20 % al 70 %), asi que con la casilla se
// tienen que ir los cinco y quedarse los seis, y el bloque «Recompensas disponibles» NO
// se esconde, porque le queda algo a la vista.
//
// Lo visto son 418 min en toda la campaña (0.69666666 × 600, 0.46444446 × 900…), y con eso
// cuadran los seis textos del volcado.
//
// PENDIENTE, sin comprobar aqui a proposito: sin API, el modal del ticket de 10 h dice
// «422 / 605 min» y el tramo es de 600. Kick escribe lo que falta redondeado HACIA ARRIBA
// —0.69666666 × 600 = 417.999996, faltan 182.000004, y escribe «3 h y 3 min»—, y
// `_resolveKickProgress` divide ese minuto de mas por (1 − f) = 0.30: salen 603.3, que el
// redondeo a multiplos de 5 manda a 605. El error crece con la barra, y a partir de ~60 %
// un solo minuto ya se sale del margen del redondeo. Arreglarlo es tocar el script (bump
// propio); cuando se haga, el caso C de abajo pasa a exigir «418 / 600 min».
const { run, readFixture } = require('./harness');

const pane = readFixture('fixture-campaigns-partial-claimed.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const HORAS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35];
const nombre = h => `Starseries-ticket-${h}hr`;
const COBRADOS = HORAS.slice(0, 5);
const EN_CURSO = HORAS.slice(5);

// La ventana va lejos a proposito: con menos de 72 h la marca de la pagina pasa a ⏳ y el
// caso dejaria de comprobar el coste para comprobar la urgencia.
const api = [{
    name: 'Starseries Sept Drops', status: 'active', progress_units: 418,
    starts_at: iso(ahora - 20 * hora), ends_at: iso(ahora + 200 * hora),
    category: { name: 'Counter-Strike 2' }, organization: { name: 'Starladder LTD' },
    rewards: HORAS.map(h => ({
        id: `ss-${h}`, name: nombre(h), required_units: h * 60, image_url: 's.png',
        claimed: COBRADOS.includes(h)
    }))
}];

const CLAVE_CASILLA = 'kick_show_hide_inventory_expired';
const base = {
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: pane }],
    seed: { kick_drop_keywords: JSON.stringify(['counter-strike']) },
    waitMs: 17000
};
const li = h => `main li:has(img[alt="${nombre(h)}"])`;
const busca = (r, n) => (r.recompensas || []).find(x => x.nombre === n);

(async () => {
    const fallos = [];

    // --- A. Con API y la casilla: se van los cobrados y solo ellos -------------------
    const a = await run({
        ...base,
        apiCampaigns: api, progress: api,
        seed: { ...base.seed, [CLAVE_CASILLA]: true }
    });

    console.log(JSON.stringify({
        recompensas: a.recompensas, pageMarks: a.pageMarks, encabezados: a.encabezados,
        hiddenGroups: a.hiddenGroups, active: (a.active || []).map(c => ({ title: c.title, badges: c.badges }))
    }, null, 2));

    if ((a.recompensas || []).length !== 11) {
        fallos.push(`el fixture deberia traer 11 recompensas y trae ${(a.recompensas || []).length}`);
    }
    COBRADOS.forEach(h => {
        const r = busca(a, nombre(h));
        if (!r) fallos.push(`el fixture no trae "${nombre(h)}"`);
        else if (r.visible) fallos.push(`"${nombre(h)}" esta reclamado y sigue a la vista`);
    });
    EN_CURSO.forEach(h => {
        const r = busca(a, nombre(h));
        if (!r) fallos.push(`el fixture no trae "${nombre(h)}"`);
        else if (!r.visible) fallos.push(`se escondio "${nombre(h)}", que va en curso`);
    });

    const disp = (a.encabezados || []).find(e => e.texto === 'Recompensas disponibles');
    if (!disp) fallos.push('el fixture no trae «Recompensas disponibles»');
    else if (!disp.visible) fallos.push('se escondio «Recompensas disponibles» con seis recompensas todavia a la vista');

    const grupos = a.hiddenGroups || [];
    if (grupos.length !== 1) fallos.push(`se esperaba 1 grupo de juego marcado y hay ${grupos.length}`);
    else if (grupos[0].display === 'none') fallos.push('se escondio el grupo de juego');

    // Lo mas caro que queda es el de 35 h: 2100 − 418 = 1682 = 28h 2m.
    const coste = (a.pageMarks || []).map(m => String(m).trim()).filter(m => m.startsWith('⏱'));
    if (JSON.stringify(coste) !== JSON.stringify(['⏱ 28h 2m'])) {
        fallos.push(`la marca de coste deberia ser «⏱ 28h 2m» (el ticket de 35 h): ${JSON.stringify(coste)}`);
    }

    const tarjeta = (a.active || []).find(c => c.title === 'Counter-Strike 2 - Starladder LTD');
    if (!tarjeta) {
        fallos.push(`el panel no trae «Counter-Strike 2 - Starladder LTD»: ${JSON.stringify((a.active || []).map(c => c.title))}`);
    } else {
        const tachados = (tarjeta.badges || []).filter(b => b.startsWith('✓ '));
        const pendientes = (tarjeta.badges || []).filter(b => !b.startsWith('✓ '));
        if (tachados.length !== 5) fallos.push(`el panel deberia tachar 5 tickets: ${JSON.stringify(tarjeta.badges)}`);
        if (pendientes.length !== 6) fallos.push(`el panel deberia dejar 6 sin tachar: ${JSON.stringify(tarjeta.badges)}`);
    }

    // --- B. La misma pagina con la API diciendo que no hay nada cobrado --------------
    // Las cinco baldosas siguen diciendo «Pedido», que es lo tentador; lo que decide es
    // la API. Si se escondieran aqui, el script estaria leyendo el texto de la baldosa.
    const sinCobrar = api.map(c => ({ ...c, rewards: c.rewards.map(r => ({ ...r, claimed: false })) }));
    const b = await run({
        ...base,
        apiCampaigns: sinCobrar, progress: sinCobrar,
        seed: { ...base.seed, [CLAVE_CASILLA]: true }
    });
    const escondidas = (b.recompensas || []).filter(x => !x.visible).map(x => x.nombre);
    if (escondidas.length) {
        fallos.push(`con la API diciendo que no hay nada cobrado se escondieron: ${JSON.stringify(escondidas)} ` +
            '(la decision se esta tomando por el «Pedido» de la baldosa)');
    }

    // --- C. Sin API: el aviso repite el texto de Kick y el modal reconstruye el tramo -
    const c = await run({
        ...base,
        apiCampaigns: null, progress: null,
        hover: { sels: EN_CURSO.map(li), at: 11000 },
        clickDrop: { sel: li(15), at: 11000 + EN_CURSO.length * 800 + 500 },
        waitMs: 17000 + EN_CURSO.length * 800
    });

    console.log(JSON.stringify({ sinApi: (c.tip.casos || []).map(x => [x.sel, x.texto]), modal: c.modal }, null, 2));

    const esperado = { 10: '3h 3m', 15: '8h 2m', 20: '13h 3m', 25: '18h 2m', 30: '23h 2m', 35: '28h 2m' };
    EN_CURSO.forEach(h => {
        const t = (c.tip.casos || []).find(x => x.sel === li(h));
        const debe = `Tiempo restante: ${esperado[h]}`;
        if (!t || !t.visible) fallos.push(`sin API: no salio el aviso sobre "${nombre(h)}"`);
        else if (t.texto !== debe) fallos.push(`sin API, "${nombre(h)}": "${t.texto}" (se esperaba "${debe}")`);
    });

    // El de 15 h, y no el de 10 h: ver el PENDIENTE de la cabecera.
    if (!c.modal.abierto) {
        fallos.push('sin API: pulsar el ticket de 15 h no abrio el modal' + (c.modal.error ? ` (${c.modal.error})` : ''));
    } else if (!(c.modal.texto || '').includes('418 / 900 min')) {
        fallos.push(`sin API, el modal del ticket de 15 h no dice «418 / 900 min»: ${c.modal.texto}`);
    }

    if (fallos.length) {
        console.log('\nFALLOS:\n - ' + fallos.join('\n - '));
        process.exit(1);
    }
    console.log('\nTODO OK');
    process.exit(0);
})();
