// El progreso ahora se ve en la pestaña de CAMPAÑAS, y ahí es donde tienen que salir el
// aviso al apuntar y el modal al pulsar —lo que antes solo pasaba en el inventario—.
//
// Por qué hacía falta este test: hasta el 2026-08-22 no había ningún volcado de
// `/drops/campaigns` con barras de progreso, así que el único DOM sobre el que se había
// probado el par aviso+modal era el del inventario viejo. El fixture de aquí sale del
// volcado `docs/dom-campaigns-progress-2026-08.html`, con PUBG abierta y dos tiers en
// curso (27% y 13%), y lo que trae de nuevo respecto a `fixture-campaigns-active.html` es
// justamente eso: los `<li>` con `[role="progressbar"][data-state="loading"]` y el texto
// «22 min to unlock» / «52 min to unlock».
//
// Los tres casos son distintos a propósito:
//
//   A. Con la API diciendo lo mismo que el DOM. Comprueba el camino entero —aviso, texto,
//      guardado y devolución del `title`, y el modal con sus cifras— y de paso dos cosas
//      que sólo se ven por omisión: que la copia de la pestaña OCULTA no recibe nada, y
//      que el `title="Watch to redeem"` del propio Kick NO lo secuestra nuestra caja.
//
//   B. Un caso donde acertar el tier por cercanía de minutos NO basta. Es el que da
//      sensibilidad: contra el script de antes del 2026-08-22 sale «22m» y con el nombre
//      leído del DOM sale «32m» (ver el comentario del selector en cleanInventory).
//
//   C. Sin API ninguna. Contra el script de antes del respaldo por la barra no sale ni
//      aviso ni modal, así que también tiene sensibilidad propia.
const { run, readFixture } = require('./harness');

const pane = readFixture('fixture-campaigns-progress.html');
// La copia oculta va con otro juego: si se leyera, se vería como una segunda tarjeta y
// como un aviso sobre un `<li>` que no está en pantalla.
const oculto = pane.replace(/PUBG: Battlegrounds/g, 'Rust').replace(/alt="PUBG[^"]*"/g, 'alt="Rust"');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// 8 minutos vistos, que es lo que dicen las dos barras del volcado: 27% de 30 → 8, y
// 30 − 8 = 22 («22 min to unlock»); 8 de 60 → 13%, y 60 − 8 = 52.
const campana = (rewards) => [{
    name: 'PGS 9 Drops', status: 'active', progress_units: 8,
    starts_at: iso(ahora - 2 * hora), ends_at: iso(ahora + 45 * hora),
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards
}];

const tiersReales = [
    { id: 'pgs-1', name: 'PGS 9 Comic Boom (Spray)', required_units: 30, image_url: 'a.png' },
    { id: 'pgs-2', name: 'PGS 9 Stay Focused (Emblem)', required_units: 60, image_url: 'b.png' }
];

// El mismo `<li>` de siempre, pero con la API cambiada: su tier cuesta 40 y hay otro de
// 30. Estimando por el DOM (8 vistos + 22 que faltan = 30) el más cercano es el de 30,
// que es el equivocado. Sólo el nombre lo desempata.
const tiersAmbiguos = [
    { id: 'pgs-1', name: 'PGS 9 Comic Boom (Spray)', required_units: 40, image_url: 'a.png' },
    { id: 'otro', name: 'Otra cosa', required_units: 30, image_url: 'b.png' }
];

const base = {
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: pane }, { hidden: true, html: oculto }],
    seed: { kick_drop_keywords: JSON.stringify(['pubg']) },
    waitMs: 17000
};

(async () => {
    const fallos = [];

    // --- A. El camino completo, con la API de acuerdo con el DOM ------------------
    const a = await run({
        ...base,
        apiCampaigns: campana(tiersReales), progress: campana(tiersReales),
        // El cuarto selector es el botón propio de Kick, que trae su `title`. El tercero
        // es un `<li>` de la pestaña oculta.
        hover: {
            sels: [
                'main li',
                'main li + li',
                'div[style*="display: none"] li',
                'button[title="Watch to redeem"]'
            ], at: 11000
        },
        clickDrop: { sel: 'main li', at: 14500 }
    });

    console.log(JSON.stringify({ tip: a.tip, modal: a.modal, pageMarks: a.pageMarks }, null, 2));

    const caso = i => a.tip.casos.find(c => c.sel === (
        ['main li', 'main li + li', 'div[style*="display: none"] li', 'button[title="Watch to redeem"]'][i]));

    const primero = caso(0);
    if (!primero || !primero.visible) {
        fallos.push('el aviso no salió sobre el primer tier de la pestaña de campañas');
    } else {
        if (primero.texto !== 'Tiempo restante: 22m') {
            fallos.push(`aviso del primer tier: "${primero.texto}" (se esperaba "Tiempo restante: 22m")`);
        }
        // El `title` es el respaldo y el nombre accesible: se guarda mientras la caja
        // está arriba y vuelve al salir.
        if (primero.tituloMientras !== null) fallos.push('el title no se guardó mientras la caja estaba arriba');
        if (primero.guardado !== 'Tiempo restante: 22m') fallos.push('el title guardado no es el del aviso');
        if (primero.tituloDespues !== 'Tiempo restante: 22m') fallos.push('el title no volvió al salir');
        if (primero.visibleDespues) fallos.push('la caja se quedó abierta al salir del <li>');
    }

    const segundo = caso(1);
    if (!segundo || !segundo.visible) fallos.push('el aviso no salió sobre el segundo tier');
    else if (segundo.texto !== 'Tiempo restante: 52m') {
        fallos.push(`aviso del segundo tier: "${segundo.texto}" (se esperaba "Tiempo restante: 52m")`);
    }

    const enOculta = caso(2);
    if (enOculta && enOculta.visible) {
        fallos.push(`salió un aviso sobre un <li> de la pestaña oculta: "${enOculta.texto}"`);
    }

    const deKick = caso(3);
    if (deKick && deKick.visible) {
        fallos.push(`nuestra caja secuestró un title de Kick: "${deKick.texto}"`);
    }

    // El modal, con las mismas cifras que el aviso y el nombre del tier.
    if (!a.modal.abierto) {
        fallos.push('pulsar el <li> no abrió el modal de progreso' + (a.modal.error ? ` (${a.modal.error})` : ''));
    } else {
        const txt = a.modal.texto || '';
        const debe = [
            'PGS 9 Comic Boom (Spray)',     // título, del tier
            'Detalle del drop',             // subtítulo
            'Progreso: 8 / 30 min · 27%',   // lo visto contra lo que cuesta
            'Tiempo restante: 22m'          // lo mismo que dice el aviso
        ];
        debe.forEach(frag => { if (!txt.includes(frag)) fallos.push(`al modal le falta "${frag}" — dice: ${txt}`); });
    }

    // La tarjeta del panel tiene que conservar sus badges y su línea de urgencia después
    // de que llegue el progreso. Esto NO es decoración: la llegada de `/drops/progress`
    // rehace el escaneo de la página para repintar las marcas, y el escaneo crea tarjetas
    // nuevas en el panel. El 2026-08-22 eso dejó la tarjeta sin los dos chips y sin el
    // «te faltan», visible en la página antes que en ningún test.
    const tarjeta = (a.active || [])[0];
    if (!tarjeta) {
        fallos.push('el panel se quedó sin la tarjeta de la campaña abierta');
    } else {
        if ((tarjeta.badges || []).length !== 2) {
            fallos.push(`la tarjeta perdió los badges de recompensas: ${JSON.stringify(tarjeta.badges)}`);
        }
        if (!tarjeta.urgencia || !tarjeta.urgencia.includes('52m')) {
            fallos.push(`la tarjeta perdió la línea de urgencia con lo que falta: ${JSON.stringify(tarjeta.urgencia)}`);
        }
    }

    // Y la marca sobre la tarjeta de Kick tiene que decir lo MISMO que el panel: las dos
    // salen del mismo dato y antes del 2026-08-22 la de la página se quedaba con la
    // cuenta de antes del progreso («1h» contra «52m»).
    const marca = (a.pageMarks || []).map(m => String(m).trim()).find(m => m.includes('⏳'));
    if (!marca) fallos.push('no se pintó la marca ⏳ sobre la tarjeta de Kick');
    else if (!marca.includes('52m')) {
        fallos.push(`la marca de la página no se actualizó con el progreso: "${marca}" (se esperaba "52m", ` +
            'como en el panel; "1h" es la cuenta de antes de que llegara /drops/progress)');
    }

    // --- B. El tier se elige por NOMBRE, no sólo por cercanía de minutos ----------
    const b = await run({
        ...base,
        apiCampaigns: campana(tiersAmbiguos), progress: campana(tiersAmbiguos),
        hover: { sels: ['main li'], at: 11000 }
    });

    console.log(JSON.stringify({ ambiguo: b.tip.casos }, null, 2));

    const amb = b.tip.casos[0];
    if (!amb || !amb.visible) {
        fallos.push('caso ambiguo: no salió el aviso');
    } else if (amb.texto !== 'Tiempo restante: 32m') {
        fallos.push(`caso ambiguo: "${amb.texto}" (se esperaba "Tiempo restante: 32m"; ` +
            '"22m" significa que se eligió el tier por cercanía y se ignoró el nombre del DOM)');
    }

    // --- C. Sin API: el progreso sale de la propia barra --------------------------
    // El respaldo que se añadio el 2026-08-22. Antes de el, sin `/drops/progress` no
    // habia ni aviso ni modal: `_resolveKickProgress` devolvia null y el <li> se quedaba
    // mudo. Ahora la fraccion de la barra (0.26666668) mas los minutos que faltan (22)
    // reconstruyen el tramo entero: 22 / (1 - 0.26666668) = 30.
    //
    // El nombre del modal tambien vale de prueba: sin API no hay `image_url` ni `name`
    // que copiar, asi que si sale es porque se leyo del DOM.
    const c = await run({
        ...base,
        apiCampaigns: null, progress: null,
        hover: { sels: ['main li'], at: 11000 },
        clickDrop: { sel: 'main li', at: 14500 }
    });

    console.log(JSON.stringify({ sinApi: c.tip.casos, modal: c.modal }, null, 2));

    const sinApi = c.tip.casos[0];
    if (!sinApi || !sinApi.visible) {
        fallos.push('sin API: no salió el aviso (el respaldo por la barra no entró)');
    } else if (sinApi.texto !== 'Tiempo restante: 22m') {
        fallos.push(`sin API: "${sinApi.texto}" (se esperaba "Tiempo restante: 22m")`);
    }
    if (!c.modal.abierto) {
        fallos.push('sin API: pulsar el <li> no abrió el modal');
    } else {
        const txt = c.modal.texto || '';
        ['PGS 9 Comic Boom (Spray)', 'Progreso: 8 / 30 min · 27%', 'Tiempo restante: 22m']
            .forEach(frag => { if (!txt.includes(frag)) fallos.push(`sin API, al modal le falta "${frag}" — dice: ${txt}`); });
    }

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})();
