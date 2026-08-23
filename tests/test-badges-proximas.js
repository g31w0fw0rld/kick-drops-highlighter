// Los badges de recompensa en las tarjetas de PROXIMAS.
//
// Son lo que la campaña reparte y lo que cuesta cada tramo, y en una proxima es lo
// unico que hay que decidir: si te interesa estar cuando abra. Hasta el 2026-08-20
// solo se pintaban en abiertos, asi que la solapa de proximas enseñaba el titulo y
// las fechas y nada mas.
//
// Lo que NO va es la linea de urgencia, y es la mitad del test: dice «cierra en …»
// —y «te faltan …»— sobre algo que todavia no se puede ver. No es un caso teorico:
// la campaña de PUBG que abre el 2026-08-21 cierra 63 h despues, o sea DENTRO de las
// 72 h que el script considera urgentes, asi que se reproduce aqui con esa forma
// exacta: proxima que abre hoy mismo y cierra dentro de 63 h.
//
// El control positivo es la segunda vuelta: la MISMA campaña en abiertos tiene que
// seguir sacando badges Y linea de urgencia. Sin eso, un arreglo que se limitara a
// no pintar nunca la urgencia pasaria la primera mitad y romperia la pestaña que ya
// funcionaba.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// Los dos tramos de la campaña: uno corto y uno de horas, para ver que el coste se
// escribe en la unidad de cada uno (min / h).
const rewards = [
    { id: 'rust-r1', name: 'Wallpaper Pack', required_units: 30, image_url: 'x.png' },
    { id: 'rust-r2', name: 'Frost AR', required_units: 120, image_url: 'y.png' }
];

const campaña = (status, desde, hasta) => [{
    name: 'Kick + Rust Wallpaper Pack', status,
    starts_at: iso(desde), ends_at: iso(hasta),
    category: { name: 'Rust' }, organization: { name: 'Facepunch Studios' },
    rewards
}];

(async () => {
    // ---- 1. Proxima: abre en 10 h y cierra a las 63 (dentro del umbral de prisa) ----
    const proximas = await run({
        url: 'https://kick.com/drops/coming-soon',
        panels: [{ hidden: false, html: group }],
        waitMs: 16000,
        apiCampaigns: campaña('upcoming', ahora + 10 * hora, ahora + 63 * hora),
        seed: { kick_drop_keywords: JSON.stringify(['rust']) }
    });

    // ---- 2. Control: la misma en abiertos, cerrando en 10 h ----
    const abiertas = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: group }],
        waitMs: 16000,
        apiCampaigns: campaña('active', ahora - 2 * hora, ahora + 10 * hora),
        seed: { kick_drop_keywords: JSON.stringify(['rust']) }
    });

    const prox = proximas.upcoming[0];
    const abierta = abiertas.active[0];

    console.log(JSON.stringify({
        proxima: prox ? { titulo: prox.title, badges: prox.badges, urgencia: prox.urgencia } : null,
        abierta: abierta ? { titulo: abierta.title, badges: abierta.badges, urgencia: abierta.urgencia } : null
    }, null, 2));

    const fallos = [];

    // 1. Badges en proximas
    if (!prox) fallos.push('no se pinto ninguna tarjeta en proximos');
    else {
        const texto = (prox.badges || []).join(' | ');
        if (!prox.badges || prox.badges.length === 0)
            fallos.push('la tarjeta de proximas salio sin badges');
        else {
            if (!/Wallpaper Pack/.test(texto) || !/Frost AR/.test(texto))
                fallos.push('faltan recompensas en los badges de proximas: ' + texto);
            if (!/\(30 min\)/.test(texto)) fallos.push('el tramo corto no dice su coste en minutos: ' + texto);
            if (!/\(2 h\)/.test(texto)) fallos.push('el tramo largo no dice su coste en horas: ' + texto);
        }
        // 2. Y NADA de urgencia: la campaña cierra dentro de las 72 h, asi que esto
        //    solo pasa si el corte esta puesto de verdad.
        if (prox.urgencia) fallos.push('una PROXIMA con linea de urgencia: «' + prox.urgencia + '»');
    }

    // 3. Control positivo: abiertos sigue con las dos cosas
    if (!abierta) fallos.push('no se pinto ninguna tarjeta en abiertos');
    else {
        if (!abierta.badges || abierta.badges.length === 0)
            fallos.push('se perdieron los badges de ABIERTOS');
        if (!abierta.urgencia)
            fallos.push('se perdio la linea de urgencia de ABIERTOS');
        else if (!/⏳/.test(abierta.urgencia))
            fallos.push('la linea de urgencia de abiertos no es la de siempre: ' + abierta.urgencia);
    }

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
