// EL BARRIDO DE RECLAMADOS SE QUEDA CORRIENDO EN LA PESTAÑA SIGUIENTE.
//
// Reportado el 2026-09-04: «cuando me coloco en expiradas de Kick A VECES oculta los drops
// reclamados […] y seguro lo mismo pasara en proximos».
//
// La causa esta en el codigo y explica el «a veces». `cleanInventory` corre en un
// setInterval de 15 intentos x 600 ms —NUEVE SEGUNDOS— que nadie cancela, y decide si
// esconde asi:
//
//     const doHide = isTrophyCase ? false : (type === "expired");
//
// `type` se congela al llamar (vale 'expired' porque se arranco desde reclamados) mientras
// `isTrophyCase` se recalcula cada vuelta y exige `_isClaimedPage()`. Asi que en cuanto te
// vas de reclamados dentro de esa ventana, `isTrophyCase` pasa a false, `doHide` se queda
// en true, y en la pestaña NUEVA se ejecuta
//
//     if (isClaimed && doHide) li.style.display = 'none';
//
// que es literalmente esconder los drops reclamados de expiradas. Si tardas mas de nueve
// segundos en cambiar de pestaña no pasa nada: de ahi que sea intermitente.
//
// El volcado de expiradas sirve para probarlo porque trae 17 «Claimed» y CERO barras de
// progreso, que es justo la forma que el barrido lee como «esto ya esta cobrado».
const { run, readFixture } = require('./harness');

const claimed = readFixture('fixture-claimed-nuevo-dom.html');
const expired = readFixture('fixture-expired-nuevo-dom.html');
const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };

// LAS DOS PESTAÑAS SIN PROGRESO NI RECLAMACION. Expiradas es la que se reporto y proximas
// la que el usuario predijo; se comprueban las dos porque el defecto no distingue —lo unico
// que mira es que ya no estas en reclamados— y dejarlo en una sola invitaria a arreglar media.
const TABS = [
    { nombre: 'expiradas', url: 'https://kick.com/drops/expired' },
    { nombre: 'proximas', url: 'https://kick.com/drops/coming-soon' }
];

(async () => {
  for (const tab of TABS) {
    console.log('\n=== al pasar a ' + tab.nombre + ' ===');
    const r = await run({
        // Se ARRANCA en reclamados con la casilla puesta, que es lo que lanza el barrido
        // con type='expired'.
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: claimed }],
        progress,
        seed: { kick_show_hide_inventory_expired: true },
        // Y se cambia a expiradas DENTRO de los nueve segundos. El `at` es lo que decide
        // que el fallo se vea: a los 12 s el barrido ya habria muerto y esto pasaria en
        // verde con el defecto dentro.
        navigateTo: [{ url: tab.url, html: expired, reactSwap: true, at: 2500 }],
        waitMs: 16000,
        seedKeywords: ['kick', 'runescape']
    });

    console.log('  <li> escondidos:', r.hiddenLis, 'de', r.totalLis);
    console.log('  grupos escondidos           :', (r.hiddenGroups || []).filter(g => g.display === 'none').length,
                'de', (r.hiddenGroups || []).length);

    // LO QUE SE PIDE: en expiradas no se esconde nada. No hay progreso ni reclamacion que
    // «completar» ahi, asi que la casilla no tiene nada que despejar.
    comprobar(r.hiddenLis === 0,
        'no se esconde ninguna recompensa en ' + tab.nombre + ' (' + r.hiddenLis + ')');
    comprobar((r.hiddenGroups || []).filter(g => g.display === 'none').length === 0,
        'ni ningun grupo de campaña');
  }

    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
