// El «¡Reclamado!» de la pestaña Recompensas se cierra solo, y SOLO con la casilla puesta.
//
// Pedido el 2026-10-15 con captura y el HTML del dialogo: al cobrar en /drops/rewards,
// Kick tapa la pantalla con un dialogo de Radix a pantalla completa —un video en bucle,
// «¡Reclamado!» y la recompensa— que solo se va con su X. Con la reclamacion automatica
// puesta nadie esta mirando, asi que el script lo cierra.
//
// El dialogo es el que pego el usuario, recortado a lo que se usa para reconocerlo: el
// video `/rewards/open-reveal` y el boton con el icono `Cross`. El `aria-label` del boton
// va en español («Salir») a proposito: el script no tiene que leerlo.
//
// Tres casos, y los dos ultimos son el control: sin la casilla, y en otra pestaña, el
// dialogo se queda como lo pinta Kick. Contra 1.3.27 falla el primero.
const { run } = require('./harness');

const reclamado =
    '<div role="dialog" data-state="open" class="fixed z-dialog" style="position:fixed;z-index:601">' +
    '<video src="https://static.kick.com/rewards/open-reveal.webm" loop autoplay aria-hidden="true"></video>' +
    '<h2 class="sr-only">Unboxing de recompensa</h2>' +
    '<div><span>¡Reclamado!</span><img alt="Adrien Halloween" src="x.webp"><span>Adrien Halloween</span></div>' +
    '<button aria-label="Salir"><svg data-ds-icon="Cross" width="20" height="20"><path d=""></path></svg></button>' +
    '</div>';

const caso = (url, casilla) => run({
    url,
    panels: [{ hidden: false, html: '' }],
    waitMs: 9000,
    dialogo: reclamado, dialogoMs: 4000, dialogoRadix: true,
    seed: { kick_show_hide_inventory_expired: casilla }
});

(async () => {
    const fallos = [];

    const conCasilla = await caso('https://kick.com/drops/rewards', true);
    console.log('recompensas + casilla:', JSON.stringify(conCasilla.clicsDialogo), 'abierto al final:', conCasilla.dialogoAbiertoAlFinal);
    if (conCasilla.clicsDialogo.length !== 1) fallos.push('con la casilla, el boton se pulso ' + conCasilla.clicsDialogo.length + ' veces (se esperaba 1)');
    if (conCasilla.dialogoAbiertoAlFinal) fallos.push('con la casilla, el dialogo sigue abierto');

    const sinCasilla = await caso('https://kick.com/drops/rewards', false);
    console.log('recompensas sin casilla:', JSON.stringify(sinCasilla.clicsDialogo));
    if (sinCasilla.clicsDialogo.length !== 0) fallos.push('SIN la casilla se cerro el dialogo');
    if (!sinCasilla.dialogoAbiertoAlFinal) fallos.push('control: sin la casilla el dialogo deberia seguir abierto');

    const otraPestaña = await caso('https://kick.com/drops/campaigns', true);
    console.log('campañas + casilla:', JSON.stringify(otraPestaña.clicsDialogo));
    if (otraPestaña.clicsDialogo.length !== 0) fallos.push('en la pestaña de campañas se cerro el dialogo');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
