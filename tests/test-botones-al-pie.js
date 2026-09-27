// LOS BOTONES DE LA CABECERA DE CADA TARJETA, AL PIE JUNTO A "MÁS DETALLES".
//
// Pedido el 2026-09-26: en escritorio, "Participar" y "Conectar" (y lo que Kick ponga
// arriba a la derecha) van abajo con "Más detalles", y la cabecera se esconde. En movil
// no cambia nada.
//
// jsdom no carga la hoja de Kick ni hace media queries, asi que lo que se comprueba es
// lo que el script DECLARA: el clon lleva `max-lg:hidden` y la cabecera `lg:hidden`, que
// es lo que en el navegador los reparte entre escritorio y movil segun el breakpoint de
// Kick. Que eso se vea bien hay que mirarlo en el navegador.
//
// El fixture es el recorte del 2026-09-23: tres tarjetas, y solo la de Logitech trae
// "Conectar". Esa es la gracia: las otras dos son el control de que no se clona nada
// donde no hay nada que clonar.
const { run, readFixture } = require('./harness');

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: readFixture('fixture-campaigns-nuevo-dom.html') }],
        waitMs: 9000,
        dejarAbierta: true
    });
    const pies = r.botonesPie;
    console.log(JSON.stringify(pies.map(p => ({ cab: p.cabecera, pie: p.hijos.map(h => h.texto + (h.clon ? '[clon]' : '')) }))));

    comprobar(pies.length === 3, 'el fixture trae tres "Más detalles" (control del volcado)');
    comprobar(pies.every(p => p.cabeceraLgHidden), 'las tres cabeceras quedan con lg:hidden');

    const logi = pies.find(p => p.cabecera && p.cabecera.includes('Conectar'));
    comprobar(!!logi, 'la tarjeta de Logitech conserva su "Conectar" en la cabecera (no se mueve el original)');
    const clones = logi ? logi.hijos.filter(h => h.clon) : [];
    comprobar(clones.length === 1 && clones[0].texto === 'Conectar', 'y en su pie hay UN clon, el de "Conectar"');
    comprobar(clones.length === 1 && clones[0].href === 'https://logitechgplay.com/drop/#panel',
        'con el mismo destino que el original');
    comprobar(clones.length === 1 && clones[0].maxLgHidden && !clones[0].lgHidden,
        'marcado max-lg:hidden: en movil no se ve');
    const orden = logi ? logi.hijos.map(h => h.texto) : [];
    comprobar(orden.join('|') === 'Más detalles|Participar|Conectar',
        'orden del pie: Más detalles, Participar, Conectar (el de la cabecera)');

    const otros = pies.filter(p => p !== logi);
    comprobar(otros.every(p => !p.hijos.some(h => h.clon)), 'las tarjetas sin "Conectar" no reciben ningun clon');
    comprobar(pies.every(p => p.hijos.filter(h => h.texto === 'Participar').length === 1),
        '"Participar" no se duplica: el del pie es el de Kick');

    // React repinta el pie: los clones desaparecen y tienen que volver, uno y no dos.
    const tras = await pies.repintarPie();
    const logi2 = tras.find(p => p.cabecera && p.cabecera.includes('Conectar'));
    const clones2 = logi2 ? logi2.hijos.filter(h => h.clon) : [];
    comprobar(clones2.length === 1 && clones2[0].texto === 'Conectar', 'tras repintar el pie, el clon vuelve (uno)');
    // Eso tambien cubre el bucle que tuvo el primer borrador: contar el clon como gemelo
    // nativo lo borraba en la vuelta siguiente y lo rehacia en la otra, asi que a los
    // 800 ms saldria cero o dos segun el turno.
    console.log(fallos ? `\n${fallos} fallo(s)` : '\ntodo en verde');
    process.exit(fallos ? 1 : 0);
})();
