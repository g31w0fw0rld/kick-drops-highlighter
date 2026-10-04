// QUIEN ESTA EN VIVO EN EL DIALOGO DE CANALES PARTICIPANTES.
//
// El dialogo es de Kick y no se toca: a cada fila se le añade una marca propia y la lista
// se reordena con `order` —en vivo primero, de mas a menos espectadores; despues los que
// no emiten, por orden alfabetico; al final lo que no se sabe—, sin mover un solo nodo,
// porque las filas son de React.
//
// OJO, EL DIALOGO ESTA RECONSTRUIDO, NO VOLCADO. No hay volcado de «Más detalles» en
// docs/ (2026-10-03): esta forma sale de la captura del usuario —titulo, pestañas
// «Canales participantes» / «Cómo conseguirlas», una frase, filas con foto, nombre y un
// corazon, y «Sobre este Drop» al pie— y del `<a href="/solrac">` que ya conocia el
// manejador de pestaña nueva. Lo que este test prueba es la REGLA (marca, orden, que no
// se mueven nodos, que no hay bucle); que la regla encuentre las filas de verdad solo lo
// dice el navegador, o un volcado que sustituya a este.
//
// Los casos que importan, cada uno con su forma de fallar:
//   · la frase de arriba es HERMANA de las filas: si la lista se reordenara sin contar
//     con ella, acabaria en medio;
//   · un canal que da 404 sale con «?» y AL FINAL, no como offline: no se sabe;
//   · ese 404 se pide UNA vez: guardar el fallo sin su hora lo volveria a pedir en cada
//     pasada del observer, que es un bucle de peticiones;
//   · nunca mas de cuatro peticiones a la vez;
//   · React repinta una fila y se lleva la marca: el observer la vuelve a poner, y una
//     sola.
const { run } = require('./harness');

const fila = (slug) => `
      <div class="flex items-center justify-between" data-fila-canal="${slug}">
        <a href="/${slug}" class="flex items-center gap-3 py-3"><img src="https://files.kick.com/${slug}.webp" alt=""><span>${slug}</span></a>
        <button aria-label="Seguir"><svg viewBox="0 0 24 24"></svg></button>
      </div>`;
const SLUGS = ['solrac', 'chibidoki', 'simbionte', 'emanuelzpk', 'westcol', 'soypan', 'mingod', 'rarito'];
const dialogo = `
<div role="dialog" data-state="open" aria-labelledby="t">
  <h2 id="t">DEDsafio 4 Minecraft</h2>
  <div role="tablist"><button role="tab" aria-selected="true">Canales participantes</button><button role="tab">Cómo conseguirlas</button></div>
  <div role="tabpanel">
    <div class="overflow-y-auto" data-lista-canales>
      <p data-frase>Mira cualquiera de los canales seleccionados a continuación para ganar recompensas.</p>
      ${SLUGS.map(fila).join('')}
    </div>
  </div>
  <a href="https://kick.com/about-this-drop" target="_blank">Sobre este Drop</a>
  <button aria-label="Cerrar">×</button>
</div>`;

// La forma de `/livestream`, medida en el navegador el 2026-10-03: `data` null sin directo
// y, con directo, un objeto con `viewers` (no `viewer_count`, que es el de la ruta completa).
const vivo = (n) => ({ data: { id: 1, slug: 'x', viewers: n, category: { slug: 'minecraft' } } });
const apagado = { data: null };
const canalesApi = {
    solrac: apagado,
    chibidoki: vivo(1200),
    simbionte: vivo(85000),
    // emanuelzpk: sin entrada -> 404
    westcol: vivo(9300),
    soypan: apagado,
    // Otra forma en la ruta ligera: cae a la completa, que si contesta.
    mingod: { slug: 'mingod' },
    // Y otra forma en las DOS: eso es «?», no «offline».
    rarito: { algo: 1 }
};
const canalesApiCompleto = {
    mingod: { slug: 'mingod', livestream: { id: 2, viewer_count: 7 } },
    rarito: { slug: 'rarito' }
};

// La API de campañas, como la pide el script: de ahi sale la categoria del dialogo. Los
// casos de arriba usan una campaña SIN `category` —13 de 24 llegaban asi en agosto—, que
// es la que va canal a canal; los del listado, una con `category.id`.
const iso = (ms) => new Date(ms).toISOString();
const campaña = (slugs, categoria) => ({
    id: 'c1', name: 'DEDsafio 4 Minecraft', status: 'active',
    starts_at: iso(Date.now() - 86400000), ends_at: iso(Date.now() + 86400000),
    ...(categoria ? { category: { id: categoria, name: 'Minecraft', slug: 'minecraft' } } : {}),
    organization: { name: 'DED' }, rewards: [],
    channels: slugs.map((s, i) => ({ id: i, slug: s, user: { username: s } }))
});
const sinCategoria = [campaña(SLUGS, null)];

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok    ' : '  FALLA ') + msg); if (!ok) fallos++; };

(async () => {
    console.log('\n=== marcas y orden ===');
    const r = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo, dialogoMs: 2500, canalesApi, canalesApiCompleto, apiCampaigns: sinCategoria, waitMs: 6000, dejarAbierta: true
    });
    const c = r.canales;
    comprobar(!!c, 'el dialogo esta montado');
    if (!c) { process.exit(1); }
    const por = Object.fromEntries(c.filas.map(f => [f.slug, f]));
    console.log('  visto:', JSON.stringify(c.visto));
    console.log('  marcas:', JSON.stringify(c.filas.map(f => [f.slug, f.marca, f.estado])));

    comprobar(c.filas.every(f => f.marcas === 1), 'una marca, y solo una, en cada fila');
    comprobar(por.simbionte.estado === 'live' && /^● /.test(por.simbionte.marca) && /85/.test(por.simbionte.marca),
        'en vivo: punto y espectadores en cifra corta');
    comprobar(/85\.000|85,000|85 000/.test(por.simbionte.aviso), 'y la cifra exacta en el aviso');
    comprobar(por.solrac.estado === 'offline' && por.solrac.marca === 'Desconectado', 'offline: «Desconectado» (es)');
    // El aviso dice lo que es cierto en los dos casos —desconectado o con otro juego—,
    // no «no esta transmitiendo», que mentia al segundo (cambiado el 2026-10-04).
    comprobar(por.solrac.aviso === 'No está transmitiendo el juego de esta campaña',
        'y su aviso: «No está transmitiendo el juego de esta campaña»');
    comprobar(por.emanuelzpk.estado === 'unknown' && por.emanuelzpk.marca === '?', 'un 404 es «?», no offline');
    comprobar(por.mingod.estado === 'live' && /7/.test(por.mingod.marca),
        'si la ruta ligera cambia de forma, la completa responde por ella');
    comprobar(por.rarito.estado === 'unknown', 'y si ninguna de las dos cuadra, «?», no offline');

    comprobar(JSON.stringify(c.visto) === JSON.stringify(
        ['simbionte', 'westcol', 'chibidoki', 'mingod', 'solrac', 'soypan', 'emanuelzpk', 'rarito']),
        'en vivo por espectadores, offline alfabetico, desconocidos al final');
    comprobar(c.display === 'flex', 'la lista pasa a columna flex para que `order` cuente');
    comprobar(c.ordenFrase === '0', 'la frase de arriba se queda arriba (order 0)');
    comprobar(c.filas.map(f => f.slug).join() === SLUGS.join(), 'el DOM sigue en el orden de Kick: no se movio ningun nodo');

    console.log('\n=== peticiones ===');
    const veces = (s) => c.pedidas.filter(x => x === s).length;
    comprobar(SLUGS.every(s => veces(s) === 1), 'cada canal se pide una vez por la ruta ligera');
    comprobar(veces('mingod#completo') === 1 && veces('rarito#completo') === 1 && c.pedidas.length === SLUGS.length + 2,
        'y la completa solo para los dos que no cuadran (' + c.pedidas.length + ' peticiones en total)');
    comprobar(c.maxEnVuelo >= 1 && c.maxEnVuelo <= 4, 'nunca mas de cuatro a la vez (maximo ' + c.maxEnVuelo + ')');
    // El ritmo, no el hueco suelto: el hueco entre dos llamadas concretas baila con el
    // temporizador (el primero puede salir tarde y acortar el siguiente), pero a una cada
    // 150 ms en un segundo caben 7 justos. El umbral es 8 para que un primer arranque
    // tardio no lo tumbe; sin el hueco salen 10, y con el respaldo pegado a la ruta
    // ligera, 9 (medido el 2026-10-03), asi que 8 sigue separando.
    const ts = c.tiempos();
    const enUnSegundo = Math.max(...ts.map(t0 => ts.filter(t => t >= t0 && t < t0 + 1000).length));
    comprobar(enUnSegundo <= 8, 'y a una cada ~150 ms (maximo ' + enUnSegundo + ' en una ventana de 1 s)');

    console.log('\n=== React repinta una fila ===');
    c.repintarFila('westcol');
    await new Promise(res => setTimeout(res, 800));
    const tras = c.releer();
    comprobar(tras[SLUGS.indexOf('westcol')] === 1, 'la fila repintada vuelve a tener su marca');
    comprobar(tras.every(n => n === 1), 'y ninguna fila acaba con dos');

    console.log('\n=== refresco cada minuto, y se para al cerrar ===');
    // El intervalo de 60 s se dispara a mano. Con la cache de un minuto, en cada tick la
    // entrada tiene 59 s: si el refresco no obligara a pedir de nuevo, no pediria nada.
    const api2 = Object.assign({}, canalesApi);
    const r2 = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo, dialogoMs: 2500, canalesApi: api2, canalesApiCompleto, apiCampaigns: sinCategoria, waitMs: 6000, dejarAbierta: true, intervaloManual: 60000
    });
    const c2 = r2.canales;
    const tick = c2.intervalos.filter(i => i.vivo);
    comprobar(tick.length === 1, 'con el dialogo abierto hay un refresco de 60 s');
    const antes = c2.cuantasPedidas();
    api2.solrac = vivo(200000); // solrac empieza a transmitir
    tick[0] && tick[0].disparar();
    // Diez peticiones a 150 ms de hueco, y el reordenado al llegar la ultima.
    await new Promise(res => setTimeout(res, 3000));
    comprobar(c2.cuantasPedidas() === antes + SLUGS.length + 2, 'el tick vuelve a pedir los ocho canales (y los dos respaldos)');
    comprobar(c2.visto2()[0] === 'solrac', 'y solrac, que empezo a transmitir, sube el primero');
    c2.cerrar();
    await new Promise(res => setTimeout(res, 600));
    const trasCerrar = c2.cuantasPedidas();
    tick[0] && tick[0].disparar();
    await new Promise(res => setTimeout(res, 600));
    comprobar(!tick[0].vivo && c2.cuantasPedidas() === trasCerrar, 'cerrado el dialogo, el refresco se cancela y no pide nada');

    console.log('\n=== un 429 lo para todo y no borra lo sabido ===');
    const api3 = Object.assign({}, canalesApi);
    const r3 = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo, dialogoMs: 2500, canalesApi: api3, canalesApiCompleto, apiCampaigns: sinCategoria, waitMs: 6000, dejarAbierta: true, intervaloManual: 60000
    });
    const c3 = r3.canales;
    const antes3 = c3.cuantasPedidas(), marcasAntes = c3.marcas().join();
    for (const s of SLUGS) api3[s] = 429;
    c3.intervalos.filter(i => i.vivo)[0].disparar();
    await new Promise(res => setTimeout(res, 2500));
    comprobar(c3.cuantasPedidas() - antes3 <= 2,
        'tras el 429 no sale nada mas (' + (c3.cuantasPedidas() - antes3) + ' peticion(es) en el tick)');
    comprobar(c3.marcas().join() === marcasAntes, 'y las marcas se quedan como estaban, ninguna pasa a «?»');
    const antes3b = c3.cuantasPedidas();
    c3.intervalos.filter(i => i.vivo)[0].disparar();
    await new Promise(res => setTimeout(res, 800));
    comprobar(c3.cuantasPedidas() === antes3b, 'el siguiente tick, dentro de la pausa, no pide nada');

    console.log('\n=== lista larga: tope de 60 por refresco ===');
    const MUCHOS = Array.from({ length: 75 }, (_, i) => 'canal' + i);
    const dialogoLargo = dialogo.replace(SLUGS.map(fila).join(''), MUCHOS.map(fila).join(''));
    const api4 = Object.fromEntries(MUCHOS.map((s, i) => [s, i % 5 ? apagado : vivo(i)]));
    const r4 = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo: dialogoLargo, dialogoMs: 2500, canalesApi: api4, apiCampaigns: [campaña(MUCHOS, null)], waitMs: 16000, dejarAbierta: true, intervaloManual: 60000
    });
    const c4 = r4.canales;
    comprobar(c4.cuantasPedidas() === 75, 'al abrir se piden los 75, una vez cada uno (' + c4.cuantasPedidas() + ')');
    comprobar(c4.visto2().slice(0, 3).join() === 'canal70,canal65,canal60', 'y se ordenan (' + c4.visto2().slice(0, 3).join() + ')');
    const antes4 = c4.cuantasPedidas();
    c4.intervalos.filter(i => i.vivo)[0].disparar();
    await new Promise(res => setTimeout(res, 11000));
    comprobar(c4.cuantasPedidas() - antes4 === 60, 'el refresco renueva 60, no 75 (' + (c4.cuantasPedidas() - antes4) + ')');

    console.log('\n=== con categoria: el listado del juego en vez de canal a canal ===');
    // La campaña trae `category.id`, y el listado de Minecraft (dos paginas) resuelve los
    // ocho canales sin una sola peticion suelta: los que salen, en vivo con sus
    // espectadores; los que no, «Desconectado» —aunque la ruta suelta dijera otra cosa,
    // que es justo lo que se decidio: si no esta en el juego, no gana el drop—.
    const minecraft = { 10: [
        [{ s: 'aquino', v: 35000 }, { s: 'simbionte', v: 8000 }, { s: 'otro1', v: 500 }],
        [{ s: 'westcol', v: 90 }, { s: 'simbionte', v: 80 }, { s: 'otro2', v: 3 }]
    ] };
    const r5 = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo, dialogoMs: 2500, canalesApi, canalesApiCompleto, apiCampaigns: [campaña(SLUGS, 10)],
        listados: minecraft, waitMs: 6000, dejarAbierta: true, intervaloManual: 60000
    });
    const c5 = r5.canales;
    const por5 = Object.fromEntries(c5.filas.map(f => [f.slug, f]));
    const sueltas = (c) => c.pedidas.filter(x => !x.startsWith('listado:'));
    console.log('  pedidas:', JSON.stringify(c5.pedidas));
    comprobar(JSON.stringify(c5.pedidas) === JSON.stringify(['listado:10:0', 'listado:10:1']),
        'dos paginas del listado y ninguna peticion suelta');
    comprobar(por5.simbionte.estado === 'live' && /^● 8\s?mil$/.test(por5.simbionte.marca),
        'el que sale, en vivo con los espectadores de su PRIMERA aparicion (8.000, no 80)');
    comprobar(por5.westcol.estado === 'live', 'tambien los de la segunda pagina');
    comprobar(por5.chibidoki.estado === 'offline' && por5.chibidoki.marca === 'Desconectado',
        'el que no sale en el listado completo, «Desconectado» (aunque la ruta suelta lo diera en vivo)');
    comprobar(por5.emanuelzpk.estado === 'offline', 'y el que la ruta suelta daria 404, tambien: el listado no pregunta por el');
    comprobar(c5.visto2().slice(0, 2).join() === 'simbionte,westcol', 'y se ordenan con ese dato');
    const antes5 = c5.cuantasPedidas();
    c5.intervalos.filter(i => i.vivo)[0].disparar();
    await new Promise(res => setTimeout(res, 1500));
    comprobar(c5.cuantasPedidas() - antes5 === 2 && sueltas(c5).length === 0,
        'el refresco vuelve a pedir el listado (2 paginas) y nada suelto');

    console.log('\n=== todos encontrados: no se sigue paginando ===');
    const r6 = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo: dialogo.replace(SLUGS.map(fila).join(''), ['aquino', 'simbionte'].map(fila).join('')),
        dialogoMs: 2500, canalesApi, apiCampaigns: [campaña(['aquino', 'simbionte'], 10)],
        listados: minecraft, waitMs: 5000, dejarAbierta: true
    });
    comprobar(JSON.stringify(r6.canales.pedidas) === JSON.stringify(['listado:10:0']),
        'con los dos en la primera pagina, una sola peticion (' + JSON.stringify(r6.canales.pedidas) + ')');

    console.log('\n=== el listado falla: canal a canal, sin dar a nadie por desconectado ===');
    const r7 = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo, dialogoMs: 2500, canalesApi, canalesApiCompleto, apiCampaigns: [campaña(SLUGS, 10)],
        listados: { 10: 500 }, waitMs: 7000, dejarAbierta: true
    });
    const c7 = r7.canales;
    const por7 = Object.fromEntries(c7.filas.map(f => [f.slug, f]));
    comprobar(sueltas(c7).filter(x => !x.includes('#')).length === SLUGS.length,
        'tras el 500, cada canal por su ruta suelta (' + sueltas(c7).length + ' sueltas)');
    comprobar(por7.chibidoki.estado === 'live' && por7.emanuelzpk.estado === 'unknown',
        'con su estado real: en vivo el que lo esta, «?» el 404 —nadie «Desconectado» por un listado que no llego—');

    console.log('\n=== categoria enorme: tope de 20 paginas, el resto canal a canal ===');
    const enorme = { 10: Array.from({ length: 25 }, (_, n) => n === 2
        ? [{ s: 'simbionte', v: 400 }] : [{ s: 'relleno' + n, v: 100 - n }]) };
    const r8 = await run({
        url: 'https://kick.com/drops/campaigns', panels: [{ hidden: false, html: '' }],
        dialogo, dialogoMs: 2500, canalesApi, canalesApiCompleto, apiCampaigns: [campaña(SLUGS, 10)],
        listados: enorme, waitMs: 9000, dejarAbierta: true
    });
    const c8 = r8.canales;
    const por8 = Object.fromEntries(c8.filas.map(f => [f.slug, f]));
    comprobar(c8.pedidas.filter(x => x.startsWith('listado:')).length === 20, 'para en 20 paginas');
    comprobar(por8.simbionte.estado === 'live' && !sueltas(c8).includes('simbionte'),
        'el que salio en el listado no se vuelve a pedir');
    comprobar(sueltas(c8).filter(x => !x.includes('#')).length === SLUGS.length - 1 && por8.chibidoki.estado === 'live',
        'los demas, por su ruta suelta y con su estado real: un listado cortado no dice «Desconectado»');

    console.log(fallos ? `\n${fallos} fallo(s) — FALLOS` : '\ntodo en verde');
    process.exit(fallos ? 1 : 0);
})();
