// Los controles de la cabecera que NUNCA tuvieron aviso.
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
//
// Aquí hubo un tercero, la ✕ que callaba el recordatorio de la racha, con el aviso
// «Silenciar hasta mañana». Se fue con el control el 2026-08-27: el aviso del reto del
// día es ahora una fila más de la pestaña 🔔 y se calla con su 👁️, que es el mismo botón
// que el de cualquier otra alerta y ya se explica desde la propia pestaña.
//
// Contra HEAD los dos salen «la caja no apareció», porque sin `title` el motor no
// tiene nada que servir.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');

const DIA = 24 * 60 * 60 * 1000;
const medianocheUTC = ms => new Date(ms).toISOString().slice(0, 10) + 'T00:00:00Z';
const AHORA = Date.now();

// Un reto a medias. Ya no hay ✕ que apuntar, pero se conserva a propósito: con un aviso
// pendiente el panel abre por la pestaña 🔔, y estos dos controles viven en la cabecera,
// que está delante en cualquier pestaña. O sea que además comprueba que no dependen de
// cuál esté abierta.
const CHALLENGES = [{
    id: '00000000-0000-7000-8000-000000000001',
    recurrence: 'daily', status: 'in_progress',
    condition: { progress: 25, threshold: 60, type: 'watch_time_minutes' },
    window: { starts_at: medianocheUTC(AHORA), ends_at: medianocheUTC(AHORA + DIA) },
    drop_table: [{ rarity: 'common', weighting: 550000 }]
}];

const SELS = ['#kick-drops-info-btn', '#kick-drops-collapse-btn'];

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
    // El aviso del día tiene que estar pendiente de verdad: es lo que hace que el panel
    // abra por la pestaña 🔔, que es el escenario que se quería probar aquí.
    if (!abierto.racha || !abierto.racha.visible)
        fallos.push('el aviso del reto del día no está pendiente, así que el caso no vale');

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

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
