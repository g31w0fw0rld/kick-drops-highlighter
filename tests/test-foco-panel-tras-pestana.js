// AL LLEGAR DESDE UNA TARJETA DEL PANEL, EL PANEL VUELVE A ESA TARJETA.
//
// Pedido el 2026-10-02. Pulsar en el panel una campaña que vive en otra pestaña te lleva
// alli y la enfoca en la pagina (eso lo cubre test-foco-entre-pestanas), pero las
// pestañas de Kick RECARGAN y el panel se construye de cero: la lista vuelve arriba y a
// la solapa que toque —🔔 si hay avisos—, y la tarjeta que pulsaste ya no esta delante.
// Ahora el panel abre su solapa, la desplaza hasta ella y la marca.
//
// Se arranca en la pestaña de destino con el destino YA apuntado, que es lo que deja el
// clic de la pagina anterior. Es el mismo arranque que la VUELTA de
// test-foco-entre-pestanas, con la marca de «vino del panel» añadida.
//
// Lo que NO se puede comprobar es el desplazamiento: jsdom no hace layout. Se mira la
// solapa abierta y la marca, que es lo que decide si la tarjeta esta delante.
//
//   A. desde una tarjeta cerrada del panel: la solapa de cerrados delante, aunque haya
//      avisos que normalmente se llevarian el panel a 🔔, y la tarjeta marcada;
//   B. control: el mismo destino sin la marca de «vino del panel» no marca nada. Es lo
//      que demuestra que A no sale verde por casualidad.
//
// Y EL TITULO NO COINCIDE, a proposito: es el caso real. La tarjeta que pulsaste en
// campañas salio de la API, «KICK - 11 expired drops», y al llegar a cerrados la misma
// campaña la pinta el DOM como «KICK» a secas. La primera version cruzaba por titulo
// exacto y aqui no encontraba nada; ahora cae al nombre del juego si en esa solapa hay
// una sola tarjeta suya.
//
// CONTROL DE SENSIBILIDAD:
//     git show HEAD:kick-drops-highlighter.user.js > /tmp/pub.js
//     KICK_SCRIPT=/tmp/pub.js node tests/test-foco-panel-tras-pestana.js
// Con 1.3.23 A falla: el panel no abre cerrados y no marca ninguna tarjeta.
const { run, readFixture } = require('./harness');
const panel = readFixture('fixture-expired-panel.html');

// Un aviso pendiente, para que el panel tenga motivo para irse a 🔔 al arrancar: es la
// situacion en la que mas facil es perder la tarjeta.
const aviso = JSON.stringify([{
    id: 'n1', title: 'Rust - Facepunch', key: 'Rust - Facepunch|api', status: 'active',
    dataSnapshot: '', seen: false, changed: true, createdAt: Date.now(), updatedAt: Date.now()
}]);
const arrancar = (panelFlag) => run({
    url: 'https://kick.com/drops/expired',
    panels: [{ hidden: false, html: panel }],
    waitMs: 16000,
    seed: {
        kick_drop_keywords: JSON.stringify(['kick', 'runescape', 'rust']),
        kick_drop_notifications: aviso,
        kick_drops_focus_target: JSON.stringify({
            title: 'KICK - 11 expired drops', status: 'expired', panel: panelFlag, ts: Date.now()
        })
    }
});

(async () => {
    const fallos = [];

    const a = await arrancar(true);
    console.log(JSON.stringify({ caso: 'desde el panel', focoPanel: a.focoPanel, cerradas: a.expired.map(c => c.title) }));
    if (!a.expired.some(c => c.title === 'KICK')) fallos.push('A: la tarjeta «KICK» no esta en la solapa de cerrados (el fixture no da para el caso)');
    if (a.focoPanel.solapaVisible !== 'expired') fallos.push(`A: la solapa delante es "${a.focoPanel.solapaVisible}" y tenia que ser cerrados`);
    if (JSON.stringify(a.focoPanel.marcadas) !== JSON.stringify(['KICK'])) {
        fallos.push(`A: las tarjetas marcadas son ${JSON.stringify(a.focoPanel.marcadas)}`);
    }

    const b = await arrancar(false);
    console.log(JSON.stringify({ caso: 'sin venir del panel', focoPanel: b.focoPanel }));
    if (b.focoPanel.marcadas.length !== 0) fallos.push(`B: sin venir del panel se marco ${JSON.stringify(b.focoPanel.marcadas)}`);
    if (b.focoPanel.solapaVisible === 'expired') fallos.push('B: sin venir del panel tambien se abrio cerrados: A no prueba nada');

    console.log(fallos.length ? '\nFALLOS:\n  ' + fallos.join('\n  ') : '\nTODO OK');
    process.exit(fallos.length ? 1 : 0);
})();
