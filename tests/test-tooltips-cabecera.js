// Los tres controles que NUNCA tuvieron aviso.
//
// La migración del 2026-08-20 cambió la CAJA de los avisos que ya existían, pero no
// creó ninguno: los controles que se explicaban solos con su etiqueta —«Editar
// Keywords», «Recargar drops», la casilla— siguen sin aviso, y eso es correcto (la
// etiqueta ya carga el destino). Lo que no lo era: tres controles que son SOLO un
// icono y no decían nada de sí mismos.
//
//   ℹ️        abre la ficha del script. Reutiliza la clave que ya nombra ese modal en
//             los 16 idiomas, así que no estrena traducción.
//   🔼 / 🔽   contrae y despliega el panel. Su aviso dice lo que va a hacer el CLIC,
//             no cómo está el panel, así que cambia con el icono: por eso se compueba
//             en los dos estados y no solo en uno.
//   ✕         calla el recordatorio de la racha. «Cerrar» sería mentira a medias: el
//             silencio dura lo que dure el reto de hoy, no la sesión, y eso es
//             exactamente lo que hay que saber ANTES de pulsar.
//
// Contra HEAD los tres salen «la caja no apareció», porque sin `title` el motor no
// tiene nada que servir.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');

const DIA = 24 * 60 * 60 * 1000;
const medianocheUTC = ms => new Date(ms).toISOString().slice(0, 10) + 'T00:00:00Z';
const AHORA = Date.now();

// Un reto a medias, que es el único estado en el que la tira se ve (ver
// test-racha-diaria.js): sin él no hay ✕ que apuntar.
const CHALLENGES = [{
    id: '00000000-0000-7000-8000-000000000001',
    recurrence: 'daily', status: 'in_progress',
    condition: { progress: 25, threshold: 60, type: 'watch_time_minutes' },
    window: { starts_at: medianocheUTC(AHORA), ends_at: medianocheUTC(AHORA + DIA) },
    drop_table: [{ rarity: 'common', weighting: 550000 }]
}];

const SELS = ['#kick-drops-info-btn', '#kick-drops-collapse-btn',
              '#kick-drops-daily-reminder span[title]'];

const vuelta = (collapsado) => run({
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: group }],
    waitMs: 20000, challenges: CHALLENGES,
    seed: {
        kick_drop_keywords: JSON.stringify(['rust']),
        kick_drops_collapse_preview: collapsado
    },
    hover: { at: 13000, sels: SELS }
});

(async () => {
    // Desplegado y contraído. Dos vueltas y no un clic a mitad de una: el aviso del
    // 🔼 se escribe en DOS sitios —al crearlo y al pulsarlo— y hay que ver los dos.
    const [abierto, cerrado] = [await vuelta(false), await vuelta(true)];

    const caso = (r, frag) => r.tip.casos.find(c => c.sel.includes(frag));
    console.log(JSON.stringify({
        desplegado: abierto.tip.casos, contraido: cerrado.tip.casos,
        racha: abierto.racha
    }, null, 2));

    const fallos = [];
    // La tira tiene que estar de verdad a la vista: si no, el ✕ que se apunta no es
    // uno que el usuario pueda encontrar y el caso no prueba nada.
    if (!abierto.racha || !abierto.racha.visible)
        fallos.push('la tira de la racha no se ve, así que el caso del ✕ no vale');

    const revisa = (c, nombre, esperado) => {
        if (!c) { fallos.push('no se llegó a apuntar ' + nombre); return; }
        if (c.error) { fallos.push(nombre + ': ' + c.error); return; }
        if (!c.visible) fallos.push(nombre + ': la caja no apareció');
        if (!c.texto) fallos.push(nombre + ': la caja salió vacía');
        // Prosa, los tres: son frases, no cifras.
        if (c.peso !== '400') fallos.push(`${nombre}: peso ${c.peso}, se esperaba 400 (prosa)`);
        if (c.tituloMientras) fallos.push(nombre + ': el `title` siguió puesto con la caja arriba');
        if (!c.guardado) fallos.push(nombre + ': el `title` no se guardó, se perdió el respaldo');
        if (c.visibleDespues) fallos.push(nombre + ': la caja no se cerró al salir');
        if (c.tituloDespues !== c.guardado)
            fallos.push(`${nombre}: el \`title\` no volvió al salir (quedó «${c.tituloDespues}»)`);
        if (esperado && c.texto !== esperado)
            fallos.push(`${nombre}: dice «${c.texto}» y se esperaba «${esperado}»`);
    };

    // Los textos se escriben literales para que un error de teclado en una clave se
    // vea: comprobar solo que «hay texto» dejaría pasar un aviso equivocado.
    revisa(caso(abierto, 'info-btn'), 'ℹ️', 'Informacion del script');
    revisa(caso(abierto, 'collapse-btn'), '🔼 (desplegado)', 'Ocultar el panel');
    revisa(caso(cerrado, 'collapse-btn'), '🔽 (contraído)', 'Mostrar el panel');
    revisa(caso(abierto, 'daily-reminder'), '✕ de la racha', 'Silenciar hasta mañana');

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
