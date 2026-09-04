// EL RENOMBRE DE CLASES DE KICK (septiembre de 2026).
//
// Kick renombro entera su escala de tokens de diseño metiendole un segmento `bg`/`fg`:
// `bg-surface-base` paso a `bg-surface-bg-default`, `border-outline-decorative` a
// `border-surface-fg-decorative`, y asi las ocho clases de las que colgaba el escaneo
// de la pagina. Todas a cero de golpe. Como de ellas cuelga TODO lo que leemos del DOM,
// el script se quedo sin encontrar un solo nodo: ni marcaba campañas en la pagina ni
// tenia donde anclar la rejilla de reclamados. Se veian como dos fallos y era uno.
//
// El arreglo NO sustituye unas clases por otras: acepta las dos generaciones, porque no
// se sabe si el despliegue de Kick llega a todo el mundo a la vez. Asi que este test
// corre LAS MISMAS comprobaciones contra los dos marcados y exige el mismo resultado.
// Esa es la gracia: el DOM viejo es el control positivo del nuevo y viceversa —si el
// arreglo hubiera sido un reemplazo, una de las dos mitades saldria en rojo—.
//
// El fixture nuevo se recorto de docs/dom-expired-2026-09.html sin retocar el marcado;
// el viejo es el que ya usaba test-expired.js. Los dos traen la misma campaña (ED'S
// DROP, de KICK), que es lo que hace comparables los dos lados.
const { run, readFixture } = require('./harness');

const ROJO = '#971311';
const CASOS = [
    { etiqueta: 'DOM viejo (agosto)', fixture: 'fixture-expired-panel.html' },
    { etiqueta: 'DOM nuevo (septiembre)', fixture: 'fixture-expired-nuevo-dom.html' }
];

let fallos = 0;
const comprobar = (ok, msg) => {
    console.log((ok ? '  ok    ' : '  FALLA ') + msg);
    if (!ok) fallos++;
};

(async () => {
    for (const caso of CASOS) {
        console.log('\n=== ' + caso.etiqueta + ' ===');
        const r = await run({
            url: 'https://kick.com/drops/expired',
            panels: [{ hidden: false, html: readFixture(caso.fixture) }],
            waitMs: 16000,
            seed: { kick_drop_keywords: JSON.stringify(['kick', 'runescape']) }
        });

        const marcados = r.matches.filter(m => !m.hidden);
        const titulos = marcados.map(m => (m.title || '').trim()).filter(Boolean);
        console.log('  marcados en la pagina:', JSON.stringify(titulos));
        console.log('  solapa de cerrados   :', r.tabLabels.expired);

        // 1. El sintoma que reporto el usuario: en la pagina no se marcaba NADA.
        comprobar(marcados.length > 0, 'se marca al menos una campaña en la propia pagina');

        // 2. Y se marca el GRUPO del juego, no la tarjeta de sub-campaña: si el
        //    selector compuesto se hubiera quedado a medias, casaria la tarjeta —que
        //    lleva la misma clase de superficie— y el borde saldria por dentro.
        comprobar(marcados.some(m => m.isGroup), 'lo marcado es el grupo del juego (.rounded-2xl)');

        // 3. En rojo, que es el color de las cerradas.
        comprobar(marcados.some(m => m.borderColor === ROJO),
            'el borde es el rojo de cerradas (' + ROJO + ')');

        // 4. Solo lo que casa con las keywords. El fixture nuevo trae CUATRO juegos
        //    —KICK, Rust, Old School RuneScape y PUBG— y las keywords son `kick` y
        //    `runescape`: marcar Rust o PUBG seria marcar de mas, que es el fallo
        //    contrario y se ve igual de mal.
        const deMas = titulos.filter(t => /rust|pubg/i.test(t));
        comprobar(deMas.length === 0,
            'no se marca nada que no case con las keywords' +
            (deMas.length ? ' (sobran: ' + deMas.join(', ') + ')' : ''));

        // 5. Y el panel las lista. Va aparte del marcado a proposito: el panel se
        //    llena de la API y sobrevivio al renombre, asi que si esta en verde
        //    mientras las de arriba estan en rojo, el fallo es de lectura del DOM.
        comprobar(r.expired.length > 0, 'el panel lista las cerradas');
    }

    // ---------------------------------------------
    // EL OTRO SINTOMA: LA REJILLA DE RECLAMADOS
    // ---------------------------------------------
    // La rejilla propia del script se cuelga de un grupo de Kick, que localiza con el
    // MISMO selector compuesto que el marcado de la pagina. Por eso los dos sintomas
    // que reporto el usuario eran un solo fallo, y por eso se comprueban juntos: si un
    // dia alguien arregla uno y no el otro, este bloque lo dice.
    const REJILLA = [
        { etiqueta: 'DOM viejo (agosto)', fixture: 'fixture-claimed-panel.html' },
        { etiqueta: 'DOM nuevo (septiembre)', fixture: 'fixture-claimed-nuevo-dom.html' }
    ];
    const progress = [{
        name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
        rewards: [
            { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
            { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
        ]
    }];
    for (const caso of REJILLA) {
        console.log('\n=== rejilla de reclamados · ' + caso.etiqueta + ' ===');
        const r = await run({
            url: 'https://kick.com/drops/claimed',
            panels: [{ hidden: false, html: readFixture(caso.fixture) }],
            waitMs: 20000, progress,
            seed: { kick_show_hide_inventory_expired: true }
        });
        console.log('  rejilla propia:', r.claimedGrid, '| tarjetas:', r.claimedGridCards);
        comprobar(r.claimedGrid === true, 'la rejilla propia se arma');
        comprobar(r.claimedGridCards > 0, 'y trae tarjetas de lo reclamado');
    }

    console.log(fallos === 0
        ? '\nTODO EN VERDE — las dos generaciones de clases funcionan'
        : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
