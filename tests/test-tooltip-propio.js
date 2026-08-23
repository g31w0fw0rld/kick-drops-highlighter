// Los avisos los pinta el SCRIPT, no el navegador.
//
// Hasta el 2026-08-20 solo la fila de progreso tenía caja propia —siguiendo al ratón—
// y los ocho controles del panel se quedaban con el `title`: caja del sistema
// operativo, con un segundo de retraso, en medio de un panel que no se le parece en
// nada. Ahora es una sola caja para todo, anclada y con la paleta del widget.
//
// Se comprueba lo observable, no las funciones:
//
//   1. Al apuntar un control sale la caja con SU texto.
//   2. El peso 600 se reserva para los avisos que son un VALOR («30 min»); la prosa
//      va en normal. Es la única diferencia entre los dos tipos, y vive en el texto.
//   3. El `title` se GUARDA mientras la caja está arriba y VUELVE al salir. Eso es lo
//      que mantiene el respaldo y el nombre accesible: si la caja fallara, el usuario
//      sigue teniendo el aviso del navegador.
//   4. Y sigue funcionando DESPUÉS de que el panel se repinte, que es la razón por la
//      que el enganche es por delegación: `fillPane` hace `innerHTML = ""` en cada
//      filtro, cada orden y cada dato que llega, así que cualquier listener por nodo
//      moriría en el primer repintado.
const { run, readFixture } = require('./harness');
const group = readFixture('fixture-group.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const apiCampaigns = [{
    name: 'Kick + Rust Wallpaper Pack', status: 'active',
    starts_at: iso(ahora - 2 * hora), ends_at: iso(ahora + 200 * hora),
    category: { name: 'Rust' }, organization: { name: 'Facepunch Studios' },
    rewards: [{ id: 'rust-r1', name: 'Wallpaper Pack', required_units: 30, image_url: 'x.png' }]
}];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: group }],
        waitMs: 20000, apiCampaigns,
        seed: { kick_drop_keywords: JSON.stringify(['rust']) },
        hover: {
            at: 13000,
            sels: [
                // Prosa: el aviso de los cuatro filtros.
                '.kick-view-filter',
                // Valor: el badge de recompensa, cuyo aviso es el tiempo que pide.
                // Se pide por su redondeo Y su `title`: el 🔗 de la cabecera es otro
                // <span title> de la misma tarjeta y sale antes en orden de documento.
                '#kick-drops-active-pane span[style*="border-radius: 8px"][title]'
            ]
        }
    });

    // Por selector y no por orden de llegada: los dos casos se resuelven con sus
    // propios temporizadores y el orden no es algo que este test deba dar por hecho.
    const caso = frag => r.tip.casos.find(c => c.sel.includes(frag));
    const filtro = caso('kick-view-filter');
    const badge = caso('border-radius');
    console.log(JSON.stringify({ casos: r.tip.casos }, null, 2));

    const fallos = [];
    const revisa = (caso, nombre, esValor) => {
        if (!caso) { fallos.push('no se llegó a apuntar ' + nombre); return; }
        if (caso.error) { fallos.push(nombre + ': ' + caso.error + ' (' + caso.sel + ')'); return; }
        if (!caso.visible) fallos.push(nombre + ': la caja no apareció');
        if (!caso.texto) fallos.push(nombre + ': la caja salió vacía');
        if (caso.peso !== (esValor ? '600' : '400'))
            fallos.push(`${nombre}: peso ${caso.peso}, se esperaba ${esValor ? '600 (valor)' : '400 (prosa)'} para «${caso.texto}»`);
        // El title se esconde mientras la caja está arriba y se guarda aparte.
        if (caso.tituloMientras) fallos.push(nombre + ': el `title` siguió puesto con la caja arriba, así que salen los dos avisos');
        if (!caso.guardado) fallos.push(nombre + ': el `title` no se guardó en el atributo, así que se perdió el respaldo');
        // Y vuelve al salir.
        if (caso.visibleDespues) fallos.push(nombre + ': la caja no se cerró al salir del control');
        if (caso.tituloDespues !== caso.guardado)
            fallos.push(`${nombre}: el \`title\` no volvió al salir (quedó «${caso.tituloDespues}»)`);
        if (caso.guardadoDespues) fallos.push(nombre + ': el atributo de guardado se quedó puesto');
    };

    revisa(filtro, 'filtro (prosa)', false);
    revisa(badge, 'badge (valor)', true);

    // El texto de cada uno es el suyo, no el del otro.
    if (filtro && filtro.texto && /^\d/.test(filtro.texto))
        fallos.push('el aviso del filtro parece un valor y no una frase: ' + filtro.texto);
    if (badge && badge.texto && !/min|h\b|Reclamad/i.test(badge.texto))
        fallos.push('el aviso del badge no es el tiempo que pide: ' + badge.texto);

    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
