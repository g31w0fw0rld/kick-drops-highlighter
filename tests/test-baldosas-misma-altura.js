// TODAS LAS BALDOSAS DE LA REJILLA MIDEN LO MISMO.
//
// Reportado el 2026-09-17 con una captura: la baldosa de la «Recompensa diaria» salia mas
// alta que las de los drops que tenia al lado, asi que la fila quedaba escalonada.
//
// La causa no era el tamaño del recuadro sino QUIEN lo decidia. El recuadro es hijo de un
// flex en columna, o sea que lleva `min-height: auto` y no puede quedar mas bajo que su
// contenido; y su contenido era la propia <img> con `h-full`, que contra una altura
// indefinida se resuelve en la altura NATURAL de la imagen escalada al ancho. Con una
// imagen cuadrada las dos cuentas dan lo mismo —por eso las de recompensa estaban bien— y
// con una que no lo es manda la imagen: el cofre mide 288x231 y la carta que toca viene
// mas alta que ancha.
//
// LO QUE ESTE TEST PUEDE COMPROBAR Y LO QUE NO. jsdom no hace layout: no hay alturas de
// verdad que medir, asi que preguntarle «¿miden lo mismo?» seria inventarse una respuesta.
// Lo que si es cierto y comprobable es la CAJA DECLARADA: que las dos baldosas declaren la
// misma proporcion y que en ninguna de las dos sea la imagen la que manda. Es la
// diferencia que existia entre ellas, y es la que se cierra. Que se vea bien, en el
// navegador.
//
// CONTROL DE SENSIBILIDAD:
//     git show HEAD:kick-drops-highlighter.user.js > /tmp/pub.js
//     KICK_SCRIPT=/tmp/pub.js node tests/test-baldosas-misma-altura.js
// Con el codigo publicado, el recuadro del cofre no declara proporcion y su imagen va en
// el flujo, que es justo lo que la estiraba.
const { run, readFixture } = require('./harness');

const panel = readFixture('fixture-claimed-panel.html');
const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();

const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

// Ya cobrado y con carta: es el estado de la captura, y el unico en el que la baldosa
// enseña una imagen que NO es el cofre.
const reto = [{
    recurrence: 'daily', status: 'claimed',
    condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 },
    window: { starts_at: iso(Date.now() - 6 * hora), ends_at: iso(Date.now() + 6 * hora) },
    claimed_at: iso(Date.now() - 2 * hora),
    winner: { id: 'w1', rarity: 'rare', card_url: 'drops/reward-image/carta.png' }
}];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/claimed',
        panels: [{ hidden: false, html: panel }],
        progress, challenges: reto, waitMs: 26000,
        seed: { kick_show_hide_inventory_expired: true }
    });
    const cajas = r.cajasRejilla || [];
    comprobar(cajas.length > 0, 'la rejilla se pinto');
    const cofre = cajas.find(x => x.cofre) || null;
    const drops = cajas.filter(x => !x.cofre);

    console.log('  cofre:', JSON.stringify(cofre));
    console.log('  drops:', JSON.stringify(drops));

    comprobar(!!cofre, 'la baldosa del cofre se pinto');
    comprobar(drops.length >= 2, `y al menos dos de drop — ${drops.length}`);
    if (!cofre || !drops.length) { console.log('\n' + (fallos || 1) + ' COMPROBACIONES EN ROJO'); process.exit(1); }

    comprobar(cofre.proporcion === '1 / 1', `el recuadro del cofre declara cuadrado — "${cofre.proporcion}"`);
    comprobar(drops.every(x => x.proporcion === '1 / 1'), 'y los de drop tambien');
    comprobar(cofre.fueraDelFlujo, 'la imagen del cofre no manda sobre la altura de su recuadro');
    comprobar(drops.every(x => x.fueraDelFlujo), 'ni las de los drops sobre los suyos');
    comprobar(cofre.alto === '100%' && drops.every(x => x.alto === '100%'),
        'las tres imagenes llenan el alto de su recuadro');
    // Y la del cofre va ENTERA, que es la contrapartida de la altura fija: lo que no llena
    // se queda centrado en vez de recortarse. La carta viene mas alta que ancha, asi que
    // recortarla le quitaria el marco y el nombre, que es lo unico que dice cual te toco.
    comprobar(cofre.ajuste === 'contain', `la carta del cofre se ve entera — "${cofre.ajuste}"`);

    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
