// LAS CINCO PESTAÑAS CON EL DOM DEL 2026-09-26, LEIDAS DE LOS VOLCADOS TAL CUAL.
//
// Es un guardarrail, no la prueba de un arreglo: fija lo que el script de 1.3.23 hace
// sobre el marcado que Kick servia ese dia, para que el siguiente cambio del sitio se vea
// como un rojo aqui y no como un reporte. Los volcados se leen de docs/ con
// `panelesDeVolcado` —no hay copia recortada—, asi que cada pestaña trae tambien los
// paneles que Kick deja montados y ocultos: el de campañas lleva detras reclamados y
// cerradas, y nada de lo que hay en ellos puede salir marcado.
//
// Lo que ese marcado trae de nuevo frente a los volcados de septiembre, y por lo que
// merece test propio:
//   · próximas ya no esta vacia: dos juegos, recompensas y un «Conectar» en cabecera.
//   · rewards ya no es el estado vacio: una rejilla de recompensas.
//   · cerradas y reclamados pintan sus recompensas en una rejilla
//     `grid-cols-[repeat(auto-fill,120px)]`, y el boton de reclamar es el de la escala
//     nueva (`state-layer-base`), con `bg-primary-base` todavia dentro.
//   · campañas y cerradas traen cada una UNA recompensa por reclamar, que es lo que deja
//     probar la reclamacion automatica sobre el boton real y no uno de fixture.
//
// Sin API a proposito, salvo en reclamados: la rejilla propia solo se pinta con datos de
// progreso (ver test-claimed.js), y sin ellos no habria nada que mirar.
const { run, panelesDeVolcado } = require('./harness');

const VERDE = '#3ad900', AZUL = '#2d7fff', ROJO = '#971311';
const KW = JSON.stringify(['warcraft', 'minecraft', 'pubg', 'valorant', 'rust', 'kick', 'counter', 'dedsafio', 'marathon', 'halo']);
const CASILLA = 'kick_show_hide_inventory_expired';

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };
const marcadas = (r) => r.matches.filter(m => !m.hidden);
const titulos = (r) => marcadas(r).map(m => (m.title || '').trim()).sort();

const pestaña = (volcado, ruta, casilla, extra = {}) => run({
    url: 'https://kick.com/drops/' + ruta,
    panels: panelesDeVolcado(volcado),
    waitMs: 16000,
    seed: { kick_drop_keywords: KW, [CASILLA]: casilla },
    ...extra
});

const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

(async () => {
    const [campOff, campOn, soon, expOff, expOn, claimed, rewards] = await Promise.all([
        pestaña('dom-campaigns-2026-09-26.html', 'campaigns', false),
        pestaña('dom-campaigns-2026-09-26.html', 'campaigns', true),
        pestaña('dom-soon-2026-09-26.html', 'coming-soon', false),
        pestaña('dom-expired-2026-09-26.html', 'expired', false),
        pestaña('dom-expired-2026-09-26.html', 'expired', true),
        pestaña('dom-claimed-2026-09-26.html', 'claimed', true, { progress, waitMs: 22000 }),
        pestaña('dom-rewards-2026-09-26.html', 'rewards', true)
    ]);

    console.log('\n=== campañas ===');
    console.log('  marcadas:', JSON.stringify(titulos(campOff)));
    comprobar(JSON.stringify(titulos(campOff)) ===
        JSON.stringify(['Minecraft', 'PUBG: Battlegrounds', 'VALORANT', 'World of Warcraft: Forever']),
        'los cuatro juegos abiertos que casan, marcados');
    comprobar(marcadas(campOff).every(m => m.isGroup && m.borderColor === VERDE),
        'en verde y sobre el grupo del juego, no sobre la tarjeta');
    comprobar(campOff.matches.every(m => !m.hidden),
        'nada marcado en los paneles de reclamados y cerradas que Kick deja ocultos detras');
    comprobar(campOff.tabLabels.active === 'Drops Abiertos (4)', 'la solapa cuenta 4 abiertas');
    const pies = campOff.botonesPie.filter(p => p.cabecera);
    const conClon = pies.filter(p => p.hijos.some(h => h.clon));
    comprobar(pies.length > 0 && pies.every(p => p.cabeceraLgHidden), 'todas las cabeceras con «Participar» quedan con lg:hidden');
    comprobar(conClon.length === pies.filter(p => p.cabecera.includes('Conectar')).length && conClon.length > 0,
        'y las que llevan «Conectar» —y solo esas— tienen su clon al pie (' + conClon.length + ')');
    comprobar(conClon.every(p => p.hijos.map(h => h.texto).join('|') === 'Más detalles|Participar|Conectar'),
        'en el orden Más detalles, Participar, Conectar');
    comprobar(campOff.botonesPulsados.length === 0, 'con la casilla quitada no se reclama nada');
    comprobar(JSON.stringify(campOn.botonesPulsados) === JSON.stringify(['Reclamar recompensa de "Prepared" Title']),
        'con la casilla puesta se reclama la unica recompensa pendiente, y solo esa');

    console.log('\n=== próximas ===');
    console.log('  marcadas:', JSON.stringify(titulos(soon)));
    comprobar(JSON.stringify(titulos(soon)) === JSON.stringify(['Just Chatting']) &&
        marcadas(soon).every(m => m.borderColor === AZUL), '«Just Chatting» en azul (casa por «kick»: su estudio es KICK)');
    // Y «Return Of The King» NO, aunque su sub-campaña se llame «ROTK X Kick Skin Set»: la
    // fila casa por titulo + estudio, y el nombre de la campaña solo entra por la API
    // (`_apiEntryForCard`), que aqui no hay. En el DOM de septiembre ese nombre ya sale en
    // la tarjeta, asi que el «la fila no lo enseña» del comentario del script envejecio;
    // con la API delante no deberia notarse. Se fija para que un cambio aqui sea a
    // proposito.
    comprobar(!titulos(soon).includes('Return Of The King'),
        'sin API, «Return Of The King» no se marca: el nombre de su campaña solo cuenta por la API');
    comprobar(soon.tabLabels.upcoming === 'Drops Próximos (1)', 'la solapa cuenta 1 próxima');
    comprobar(soon.pageMarks.length === 0, 'sin ⏳ ni ⏱ en la página: una próxima nunca lleva plazo');
    // Hoy el traslado al pie se engancha en el «Participar» de la cabecera, y una próxima
    // no lo tiene: su «Conectar» se queda arriba. Si se decide llevarlo tambien, este es el
    // test que tiene que cambiar.
    comprobar(soon.botonesPie.every(p => !p.hijos.some(h => h.clon)), 'en próximas no se clona nada al pie (hoy)');

    console.log('\n=== cerradas ===');
    console.log('  marcadas:', JSON.stringify(titulos(expOff)));
    comprobar(JSON.stringify(titulos(expOff)) === JSON.stringify(['KICK', 'PUBG: Battlegrounds', 'Rust']) &&
        marcadas(expOff).every(m => m.borderColor === ROJO), 'KICK, PUBG y Rust en rojo');
    comprobar(expOff.tabLabels.expired === 'Drops Cerrados (3)', 'la solapa cuenta 3 cerradas');
    comprobar(expOff.botonesPulsados.length === 0, 'con la casilla quitada no se reclama nada');
    comprobar(JSON.stringify(expOn.botonesPulsados) === JSON.stringify(['Reclamar recompensa de Slouched Emote']),
        'con la casilla puesta se cobra desde cerradas lo ya desbloqueado, y solo eso');

    console.log('\n=== reclamados (con datos de progreso) ===');
    comprobar(claimed.claimedGrid && claimed.gridTitle === 'Reclamados' && claimed.claimedGridCards === 2,
        'la rejilla propia se pinta, con título y las dos recompensas de los datos');
    comprobar(claimed.hiddenGroups.length > 0 && claimed.hiddenGroups.every(g => g.display === 'none'),
        'los ' + claimed.hiddenGroups.length + ' bloques de Kick quedan escondidos detrás');
    comprobar(claimed.filtrosKickVisibles === 0, 'y sus filtros por juego también');

    console.log('\n=== rewards ===');
    comprobar(marcadas(rewards).length === 0 && !rewards.claimedGrid, 'no se marca nada ni se pinta rejilla');
    comprobar(rewards.tabLabels.active === 'Drops Abiertos', 'y la pestaña no se clasifica: las solapas van sin cuenta');

    console.log(fallos ? `\n${fallos} fallo(s)` : '\ntodo en verde');
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
