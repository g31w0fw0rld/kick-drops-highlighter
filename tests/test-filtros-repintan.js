// LOS FILTROS DE KICK SE LLEVAN EL MARCADO Y NADIE LO REPONE.
//
// Reportado el 2026-09-04: en /drops/expired, con una campaña ya marcada en rojo, pulsar
// uno de los chips de juego de Kick («All», «KICK», «Rust»…) deja la campaña a la vista
// pero SIN su borde. Y volver a cambiar el filtro tampoco lo devuelve.
//
// El motivo esta en el codigo, no es una suposicion: el marcado se aplica poniendo un
// `id` (`drop-match-N-status`) en el nodo y un `style` con el borde en su padre. Kick
// repinta la lista al pulsar un chip, asi que React sustituye esos nodos y se lleva las
// dos cosas. Y `highlightAndLinkDrops()` solo se llama en tres sitios —al llegar la API,
// en el barrido de arranque, y un refresco acotado a `_isCampaignsPage()`—, ninguno de
// los cuales dispara al cambiar de filtro. En /drops/expired, despues del marcado
// inicial, NO existe ningun camino que vuelva a marcar. No hay ni un MutationObserver.
//
// Se reproduce sustituyendo el `innerHTML` de la lista despues del primer escaneo, que es
// exactamente lo que hace el repintado de React. El fixture es el MISMO en las dos
// mitades: lo que cambia no es el contenido —el filtro «All» y el filtro «KICK» muestran
// esta campaña igual— sino que los nodos son nuevos. Por eso el test no mide el filtrado
// de Kick, mide si sabemos volver a marcar lo que ya marcamos una vez.
const { run, readFixture } = require('./harness');

const ROJO = '#971311';
const panel = readFixture('fixture-expired-nuevo-dom.html');

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/expired',
        panels: [{ hidden: false, html: panel }],
        // El repintado llega a los 12 s, con el escaneo inicial ya hecho y bien pasado.
        lateHtml: panel, lateMs: 12000,
        waitMs: 26000,
        seed: { kick_drop_keywords: JSON.stringify(['kick', 'runescape']) }
    });

    const marcados = r.matches.filter(m => !m.hidden);
    const titulos = marcados.map(m => (m.title || '').trim()).filter(Boolean);
    console.log('  marcados DESPUES del repintado:', JSON.stringify(titulos));
    console.log('  con borde rojo               :', marcados.filter(m => m.borderColor === ROJO).length);

    // Control positivo implicito: este mismo fixture, sin repintado, marca dos campañas
    // —lo comprueba test-dom-nuevo-clases.js—. Asi que un cero aqui es el repintado, no
    // el fixture ni las keywords.
    comprobar(marcados.length > 0, 'sigue habiendo campañas marcadas tras el repintado');
    comprobar(marcados.some(m => m.borderColor === ROJO), 'y conservan el borde rojo');
    comprobar(titulos.includes('KICK'), 'la campaña de KICK vuelve a estar marcada');

    // Y LO QUE MAS IMPORTA: que el observer no se vea a si mismo. Marcar ESCRIBE en el
    // DOM —el `id`, el `style` del borde y las marcas de pagina, que son nodos nuevos—,
    // asi que un observer mal encuadrado se dispara con su propio trabajo y repinta en
    // bucle para siempre. Ya paso una vez y el sintoma no fue «bucle» sino «no salen los
    // tooltips», que no se parece en nada a la causa.
    //
    // Se cuenta el log del script: UN repintado provocado tiene que dar UN re-marcado, no
    // una racha. El margen de 3 cubre que Kick repinte en dos tandas; lo que se descarta
    // es la decena.
    const remarcas = r.logs.filter(l => l.includes('repintado detectado')).length;
    console.log('  re-marcados                  :', remarcas, '(1 repintado provocado)');
    comprobar(remarcas >= 1, 'el repintado se detecta (el observer esta vivo)');
    comprobar(remarcas <= 3, 'y NO se re-marca en bucle viendose a si mismo');

    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
