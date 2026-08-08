// Resaltado azul en /drops/coming-soon, y el 🔗 de esas tarjetas.
//
// Compartir una proxima SI vale —es lo que interesa avisar con tiempo— pero su enlace
// tiene que ir a SU pestaña. Mandando a la lista de abiertas, quien recibe el texto
// llega a una pagina donde esa campaña no aparece, que es peor que no dar enlace.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');
(async () => {
    const r = await run({
        url: 'https://kick.com/drops/coming-soon',
        panels: [{ hidden: false, html: group }, { hidden: true, html: group.replace('>Rust</h2>', '>GTA</h2>') }]
    });

    const proxima = r.upcoming[0];
    const copiado = proxima && proxima.share ? proxima.clickShare() : null;

    console.log(JSON.stringify({
        matches: r.matches,
        active: r.active.length,
        upcoming: r.upcoming.map(c => ({ title: c.title, share: c.share })),
        expired: r.expired.length,
        pageMarks: r.pageMarks,
        textoCopiado: copiado
    }, null, 2));

    const fallos = [];
    // El texto tiene tres partes: titulo, fechas y enlace. Ni una linea de mas: Kick
    // parte la fecha en varias lineas dentro del <p>, y en texto plano eso se ve.
    if (copiado && copiado.trim().split('\n').length !== 3)
        fallos.push('el texto copiado tiene lineas de mas: ' + JSON.stringify(copiado));
    if (!proxima) fallos.push('no se pinto ninguna tarjeta en proximos');
    else if (!proxima.share) fallos.push('una PROXIMA sin boton de compartir');
    if (proxima && proxima.share) {
        if (!copiado) fallos.push('el boton de compartir no copio nada');
        // El enlace es la ultima linea del texto.
        else {
            const enlace = copiado.trim().split('\n').pop();
            if (!/\/drops\/coming-soon$/.test(enlace))
                fallos.push('el enlace de una proxima no va a su pestaña: ' + enlace);
        }
    }

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
