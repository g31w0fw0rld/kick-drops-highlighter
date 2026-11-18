// EL MODAL DEL COFRE CON LOS BOTONES DEL SISTEMA DE DISEÑO (2026-11-17).
//
// Reportado ese día: no se cobraba ni el cofre diario ni el de evento (Sunset Reward
// Case). El modal NO cambió de forma —carrusel, una diapositiva por cofre con su video,
// un pie por diapositiva con su «Reclamar», el del diario dentro de un `<div hidden>`—;
// cambió el BOTÓN. Kick lo pasó a un componente que se describe con atributos:
//
//   antes  <button class="… bg-primary-base …">
//   ahora  <button data-scope="button" data-part="root" data-slot="button"
//                  data-variant="primary" data-size="md" class="min-w-0 flex-1">
//
// y el script buscaba `button.bg-primary-base`: abría el modal, no encontraba ningún
// «Reclamar», lo cerraba y vuelta a empezar a los 3 minutos. La X también cambió: es
// `data-variant="transparent"` con el icono `Cross` y sin `sr-only`, así que se cerraba
// por Escape.
//
// El marcado de abajo es el ESQUELETO del modal real de ese día, abierto en la portada de
// kick.com (fuera del @match, para que el script instalado no reclamara nada) con los dos
// cofres listos y sin pulsar «Reclamar». Se sacó con una lista blanca de atributos —role,
// data-state, data-carousel-slide, data-active, hidden, aria-*, data-variant/slot/scope/
// part/size, data-ds-icon y el `src` de los videos— porque la extensión del navegador no
// deja salir el outerHTML entero. Las clases no están: el script no lee ninguna aquí.
//
// Lo que NO es de Kick, y por qué:
//   · los `aria-label` de los dos «Reclamar»: en Kick los dos dicen «Reclamar» y nada
//     más. Se ponen para que el arnés pueda decir cuál se pulsó; el script no los lee.
//   · el «Reclamar» DESHABILITADO: ese día los dos estaban listos y no se vio uno en
//     cuenta atrás. Se pone `disabled` —lo que hace un <button> deshabilitado—, que es
//     lo que mira `_botonHabilitado`. Si Kick lo marcara de otra forma, este caso no lo
//     sabría.
//   · el diálogo AJENO del último caso, que no es un volcado: es la forma mínima de «otro
//     diálogo de Kick con un botón primario», para comprobar que el cofre se reconoce por
//     lo que solo tiene el cofre.
//
// Contra la 1.3.34 fallan los tres primeros casos: ningún «Reclamar» pulsado.
const { run, readFixture } = require('./harness');
const fs = require('fs');
const path = require('path');

const panel = readFixture('fixture-claimed-panel.html');
const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 }
    ]
}];

// Los dos retos de la API, tal cual los dio Kick el 2026-11-15 (el evento sin
// `active_period`), con la ventana corrida a hoy y el estado que pida cada caso.
const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ventana = () => ({ starts_at: iso(Date.now() - 6 * hora), ends_at: iso(Date.now() + 6 * hora) });
const real = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'api-challenges-event-no-active-period-2026-11-15.json'), 'utf8')).data;
const reto = (nombre, listo) => {
    const c = real.find(x => x.name === nombre);
    const umbral = c.condition.threshold;
    return {
        ...c, window: ventana(),
        status: listo ? 'claimable' : 'in_progress',
        condition: { ...c.condition, progress: listo ? umbral : 4 }
    };
};
const retos = ({ eventoListo, diarioListo }) =>
    [reto('Daily Reward', diarioListo), reto('Sunset Reward Case', eventoListo)];

// El modal del 2026-11-17. La cabecera con el icono del cofre la pone el arnés; esto es
// lo que va debajo: la X, el carrusel y los dos pies.
const reclamar = (etiqueta, habilitado) =>
    `<button data-scope="button" data-part="root" type="button" data-slot="button" data-variant="primary" data-size="md" class="min-w-0 flex-1" aria-label="${etiqueta}"${habilitado ? '' : ' disabled=""'}><span data-scope="button" data-part="label" data-slot="button-label">Reclamar</span></button>`;
const rarezas = ['Mythical', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common']
    .map(r => `<div><svg data-ds-icon="Rarity${r}" aria-hidden="true"><path d="M1 2.5C1 1.6"></path></svg></div>`).join('');
const pie = (etiqueta, habilitado, oculto) => `
    <div${oculto ? ' hidden=""' : ''}>
      <div><div data-state="closed">${rarezas}</div></div>
      <div><div>${reclamar(etiqueta, habilitado)}</div><p><span><span>Reclama antes de las 18 nov, 18:00</span></span></p></div>
    </div>`;
const modal = ({ eventoListo, diarioListo }) => `
  <div>
    <h2>Reclamar tus recompensas</h2>
    <button data-scope="button" data-part="root" aria-label="Close" type="button" data-slot="button" data-variant="transparent" data-size="sm" data-icon-only="true"><span data-scope="button" data-part="adornment" data-slot="button-adornment" aria-hidden="true"><svg data-ds-icon="Cross" width="20" height="20" viewBox="0 0 20 20"><path d="M15.83 16.67a1 1 0 0 1-.59-.25"></path></svg></span></button>
  </div>
  <div><div>
    <div>
      <section aria-label="Reclama tu recompensa" aria-roledescription="carousel">
        <div data-carousel-slide="" data-active="true"><section>
          <div><h3>Sunset Reward Case</h3><p>Watch any stream for 3 hours to unlock a case packed with free copies of GTA VI.</p></div>
          <div><div><video aria-hidden="true" src="https://static.kick.com/rewards/gta-vi-2611/idle.webm"></video></div></div>
        </section></div>
        <div data-carousel-slide=""><section>
          <div><h3>Daily Reward</h3><p>Claim your Daily Reward for a chance to win big!</p></div>
          <div>
            <div><div><video src="https://static.kick.com/rewards/streaks-battery.webm"></video></div><div><span>x57 days</span><span>Racha</span></div></div>
            <div><div><svg><path d="M22.6884 21."></path></svg></div></div>
          </div>
          <div><div><video aria-hidden="true" src="https://static.kick.com/rewards/daily-rewards/idle.webm"></video></div></div>
        </section></div>
      </section>
      <button aria-label="Siguiente recompensa" aria-keyshortcuts="ArrowRight"><svg data-ds-icon="ChevronRight"><path d="M6.25 18.33a.8"></path></svg></button>
    </div>
    <div>
      ${pie('Reclamar evento', eventoListo, false)}
      ${pie('Reclamar diario', diarioListo, true)}
    </div>
  </div></div>`;

const base = {
    url: 'https://kick.com/drops/claimed',
    panels: [{ hidden: false, html: panel }],
    progress, waitMs: 30000,
    seed: { kick_show_hide_inventory_expired: true }
};
const deReclamar = pulsados => (pulsados || []).filter(b => /^Reclamar (evento|diario)$/.test(b));

(async () => {
    const fallos = [];

    // --- Automático: el diario listo y el evento no ---------------------------------
    // El caso de la 1.3.31, ahora con el marcado nuevo: tiene que encontrar el pie oculto
    // del diario, traer su diapositiva y cerrar por la X nueva.
    const uno = await run({
        ...base, challenges: retos({ eventoListo: false, diarioListo: true }),
        cofre: 'disponible', cofreModal: modal({ eventoListo: false, diarioListo: true })
    });
    console.log(JSON.stringify({ caso: 'automático, diario listo', botones: uno.botonesPulsados, diapositivas: uno.diapositivasTraidas, abierto: uno.dialogoAbierto }));
    if (JSON.stringify(deReclamar(uno.botonesPulsados)) !== '["Reclamar diario"]') {
        fallos.push(`automático, diario listo: se pulsó ${JSON.stringify(deReclamar(uno.botonesPulsados))} y tenía que ser solo el diario`);
    }
    if (!(uno.diapositivasTraidas || []).includes(1)) fallos.push(`automático, diario listo: no trajo la diapositiva del diario: ${JSON.stringify(uno.diapositivasTraidas)}`);
    if (!(uno.botonesPulsados || []).includes('Close')) fallos.push(`automático, diario listo: no cerró por la X nueva; se pulsaron ${JSON.stringify(uno.botonesPulsados)}`);
    if (uno.dialogoAbierto) fallos.push('automático, diario listo: el modal se quedó abierto');

    // --- Automático: los dos listos, como el día del reporte ------------------------
    // LOS DOS en la misma apertura (pedido ese día: con la 1.3.34 arreglada solo en el
    // marcado se cobraba el del evento y el diario esperaba a la vuelta siguiente). Primero
    // el que se ve —el del evento—, y el diario cuando Kick quita el pie cobrado y deja el
    // suyo delante, que es lo que simula el arnés. Una vez cada uno.
    //
    // Y tras cobrar se RELEE el reto, que es lo que pasa las baldosas a «cobrado» sin
    // recargar: el automático no lo hacía (pendiente desde el 2026-08-24, solo el botón de
    // la baldosa releía), y en móvil, donde la puerta es el reto en memoria, eso volvía a
    // abrir el menú y el drawer cada 3 minutos. La segunda petición sirve los dos cobrados.
    const cobrados = () => {
        const [d, e] = retos({ eventoListo: true, diarioListo: true });
        return [
            { ...d, status: 'claimed', claimed_at: iso(Date.now()), winner: { id: 'w1', rarity: 'common', card_url: 'https://content.kick.com/public/rewards/cards/diario.png' } },
            { ...e, status: 'claimed', claimed_at: iso(Date.now()), winner: { id: 'w2', rarity: 'common', card_url: '', thumbnail_url: 'https://content.kick.com/public/rewards/thumbnails/evento.png' } }
        ];
    };
    const dos = await run({
        ...base, challenges: retos({ eventoListo: true, diarioListo: true }),
        challengesRefetch: cobrados(),
        cofre: 'disponible', cofreModal: modal({ eventoListo: true, diarioListo: true })
    });
    console.log(JSON.stringify({ caso: 'automático, los dos listos', botones: dos.botonesPulsados, abierto: dos.dialogoAbierto, diario: dos.cofre && dos.cofre.pie, evento: (dos.cofresEvento || []).map(c => c.pie) }));
    if (JSON.stringify(deReclamar(dos.botonesPulsados)) !== '["Reclamar evento","Reclamar diario"]') {
        fallos.push(`automático, los dos listos: se pulsó ${JSON.stringify(deReclamar(dos.botonesPulsados))} y tenían que ser los dos, el evento y luego el diario`);
    }
    if (dos.dialogoAbierto) fallos.push('automático, los dos listos: el modal se quedó abierto');
    // La relectura se mira por su HORA y no por las baldosas: el arnés sirve los retos
    // cobrados a cualquier petición posterior a la primera, y el arranque ya hace una,
    // así que las baldosas acaban en «cobrado» aunque el automático no relea nada (lo
    // delató una copia sin la relectura, que pasaba).
    const ultimoCobro = Math.max(...(dos.botonesPulsadosEn || []).filter(b => /^Reclamar /.test(b.etiqueta)).map(b => b.ms));
    const releidos = (dos.retosPedidosEn || []).filter(ms => ms > ultimoCobro);
    console.log(JSON.stringify({ caso: 'relectura tras cobrar', ultimoCobro, retosPedidosEn: dos.retosPedidosEn }));
    if (!releidos.length) fallos.push(`automático, los dos listos: tras cobrar no se releyó el reto (último cobro a ${ultimoCobro} ms, retos pedidos a ${JSON.stringify(dos.retosPedidosEn)})`);
    if (!dos.cofre || dos.cofre.pie !== 'check') fallos.push(`automático, los dos listos: tras cobrar la baldosa del diario no pasó a cobrada (pie ${dos.cofre && dos.cofre.pie})`);
    if (JSON.stringify((dos.cofresEvento || []).map(c => c.pie)) !== '["check"]') fallos.push(`automático, los dos listos: tras cobrar la baldosa del evento no pasó a cobrada: ${JSON.stringify((dos.cofresEvento || []).map(c => c.pie))}`);

    // --- A mano, desde la baldosa del diario, con los dos listos ---------------------
    // Pulsa SU «Reclamar» —el oculto— y deja el modal abierto con el resultado.
    const mano = await run({
        ...base, challenges: retos({ eventoListo: true, diarioListo: true }),
        cofre: 'cuenta', cofreModal: modal({ eventoListo: true, diarioListo: true }),
        clickCofre: { at: 20000 }
    });
    console.log(JSON.stringify({ caso: 'a mano, los dos listos', botones: mano.botonesPulsados, abierto: mano.dialogoAbierto }));
    if (JSON.stringify(deReclamar(mano.botonesPulsados)) !== '["Reclamar diario"]') {
        fallos.push(`a mano: se pulsó ${JSON.stringify(deReclamar(mano.botonesPulsados))} y tenía que ser solo el diario`);
    }
    if (!mano.dialogoAbierto) fallos.push('a mano: cerró el modal, y tiene que dejar el resultado a la vista');

    // --- Otro diálogo de Kick con un botón primario ---------------------------------
    // Con la marca nueva, «tiene un botón primario» ya no es cosa del cofre. Si el cofre
    // se reconociera así, el botón de la baldosa daría el diálogo ajeno por «el cofre ya
    // está abierto» y pulsaría su primario. Va por el camino a mano porque el automático
    // se abstiene con cualquier diálogo del cofre abierto y no llegaría a pulsar nada: ahí
    // el reconocimiento equivocado no se ve. En el navegador Radix no deja pulsar fuera del
    // modal, así que esto vigila la función, no un clic que se pueda dar hoy.
    const ajeno = await run({
        ...base, challenges: retos({ eventoListo: true, diarioListo: true }),
        cofre: 'cuenta', cofreModal: modal({ eventoListo: true, diarioListo: true }),
        dialogo: `<div role="dialog" data-state="open"><h2>Más detalles</h2>
            <button data-scope="button" data-part="root" type="button" data-slot="button" data-variant="primary" data-size="md" aria-label="Primario ajeno"><span data-slot="button-label">Participar</span></button></div>`,
        dialogoMs: 1000,
        clickCofre: { at: 20000 }
    });
    console.log(JSON.stringify({ caso: 'diálogo ajeno abierto', botones: ajeno.botonesPulsados }));
    if ((ajeno.botonesPulsados || []).includes('Primario ajeno')) {
        fallos.push('con otro diálogo abierto, el botón de la baldosa pulsó su primario tomándolo por el cofre');
    }

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
