// El panel se mete DEBAJO de los modales de Kick, y vuelve a su sitio al cerrarse.
//
// Reportado el 2026-10-15: con «Mas detalles» o el cofre abiertos, el velo de Kick
// oscurecia la pagina pero no el panel, que en movil tapaba parte del modal. El modal
// de aqui es el que se midio ese dia en escritorio: velo y dialogo de Radix con
// `z-index: 601`, los dos colgados de <body>. jsdom no lee las clases de Tailwind, asi
// que el 601 va en linea: lo que se prueba es que el script lo LEE del modal, no que
// lo sepa de memoria.
//
// Tres fotos: antes (9999), con el modal (600, una capa por debajo) y despues (9999).
// Y el control: el centro de privacidad de OneTrust, que Kick deja montado y oculto con
// `role="dialog"` y sin `data-state`, esta desde el principio y no tiene que mover
// nada —si lo moviera, la foto de antes ya no saldria 9999—.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');

const oneTrust = '<div id="onetrust-pc-sdk" role="dialog" style="position:fixed;z-index:2147483647;display:none">Your Privacy Choices</div>';
const modal =
    '<div data-state="open" class="fixed inset-0 z-dialog bg-black/75" style="position:fixed;z-index:601"></div>' +
    '<div role="dialog" id="radix-_r_14_" data-state="open" style="position:fixed;z-index:601">World of Warcraft: Forever</div>';

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: group + oneTrust }],
        waitMs: 14000,
        dialogo: oneTrust + modal,
        dialogoMs: 8000,
        dialogoFueraMs: 10000,
        snapAt: { antes: 7000, conModal: 9000, despues: 12000 },
        seed: { kick_drop_keywords: JSON.stringify(['rust']) }
    });

    const z = n => (r.snaps[n] || {}).panelZ;
    const fotos = { antes: z('antes'), conModal: z('conModal'), despues: z('despues') };
    console.log(JSON.stringify(fotos));

    const fallos = [];
    if (fotos.antes !== '9999') fallos.push('antes del modal el panel no esta en 9999: ' + fotos.antes);
    if (fotos.conModal !== '600') fallos.push('con el modal abierto el panel no queda una capa por debajo (600): ' + fotos.conModal);
    if (fotos.despues !== '9999') fallos.push('al cerrar el modal el panel no vuelve a 9999: ' + fotos.despues);

    // EL MENU DE LA CUENTA (2026-10-15): un popper de Radix con `z-dropdown` = 701, por
    // encima de los dialogos. El panel tiene que quedar en 700. Y un tooltip de Radix
    // —mismo popper, contenido en `delayed-open`— no mueve nada.
    const menu = '<div data-radix-popper-content-wrapper="" style="position:fixed;z-index:701">' +
        '<div role="menu" data-state="open" class="z-dropdown" style="z-index:701">Menu de la cuenta</div></div>';
    const tooltip = '<div data-radix-popper-content-wrapper="" style="position:fixed;z-index:650">' +
        '<div data-state="delayed-open" role="tooltip">Aviso</div></div>';
    const rm = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: group }],
        waitMs: 14000, dialogo: tooltip + menu, dialogoMs: 8000, dialogoFueraMs: 10000,
        snapAt: { conMenu: 9000, despues: 12000 },
        seed: { kick_drop_keywords: JSON.stringify(['rust']) }
    });
    const zm = n => (rm.snaps[n] || {}).panelZ;
    console.log(JSON.stringify({ conMenu: zm('conMenu'), despues: zm('despues') }));
    if (zm('conMenu') !== '700') fallos.push('con el menu de la cuenta abierto el panel no queda en 700: ' + zm('conMenu'));
    if (zm('despues') !== '9999') fallos.push('al cerrar el menu el panel no vuelve a 9999: ' + zm('despues'));

    // LA BASE ES LA BARRA (2026-10-15, movil): con `nav.z-navbar` a 301 el panel vive en
    // 300 desde el principio —el menu movil y la busqueda cuelgan de barras a 301 y 402—,
    // y un menu a 701 no lo sube ni lo baja.
    const barra = '<nav class="fixed top-0 z-navbar" style="position:fixed;z-index:301">barra</nav>';
    const rb = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: barra + group }],
        waitMs: 14000, dialogo: menu, dialogoMs: 8000, dialogoFueraMs: 10000,
        snapAt: { antes: 7000, conMenu: 9000, despues: 12000 },
        seed: { kick_drop_keywords: JSON.stringify(['rust']) }
    });
    const zb = n => (rb.snaps[n] || {}).panelZ;
    console.log(JSON.stringify({ barra: { antes: zb('antes'), conMenu: zb('conMenu'), despues: zb('despues') } }));
    for (const n of ['antes', 'conMenu', 'despues']) {
        if (zb(n) !== '300') fallos.push('con la barra de Kick a 301 el panel no esta en 300 (' + n + '): ' + zb(n));
    }

    // LA BUSQUEDA MOVIL DESMONTA LA BARRA (2026-10-15): Kick quita `nav.z-navbar` y monta
    // la de busqueda (`nav` con `z-[402]`, sin `fixed`). El panel tiene que seguir en 300
    // con la barra vieja ya fuera, recordando la base, y no volver a 9999.
    const busqueda = '<nav class="top-0 z-[402]" style="position:relative;z-index:402"><input value="halo"><p>Canales</p></nav>';
    const rs = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: barra + group }],
        waitMs: 14000, dialogo: busqueda, dialogoMs: 8000,
        quitar: { sel: 'nav.z-navbar', ms: 8000 },
        snapAt: { antes: 7000, buscando: 10000 },
        seed: { kick_drop_keywords: JSON.stringify(['rust']) }
    });
    const zs = n => (rs.snaps[n] || {}).panelZ;
    console.log(JSON.stringify({ busqueda: { antes: zs('antes'), buscando: zs('buscando') } }));
    if (zs('buscando') !== '300') fallos.push('con la busqueda movil abierta (barra desmontada) el panel no esta en 300: ' + zs('buscando'));

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
