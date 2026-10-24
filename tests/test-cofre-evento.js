// LOS COFRES DE EVENTO y el modal en carrusel (2026-10-23).
//
// Con Halloween Kick añadió un segundo cofre, «Trick or Treat»: 180 minutos al día en vez
// de 60, del 24 de octubre al 1 de noviembre. En `/gamification/challenges` llega como un
// reto MÁS, también `daily` y también de minutos vistos —lo único que lo separa del diario
// es `active_period` (y `featured`)—, y el modal del cofre pasó a ser un carrusel: una
// diapositiva por cofre, la del evento primero, y debajo un pie con su «Reclamar» por cada
// una, en el mismo orden, con los de las diapositivas no activas dentro de un `<div hidden>`.
//
// Las formas de abajo son las del volcado del 2026-10-23 (el modal) y de la respuesta de la
// API de ese mismo día, recortadas. Los `aria-label` de los dos «Reclamar» NO son de Kick
// —los dos dicen «Reclamar» y nada más—: se ponen para que el arnés pueda decir cuál se
// pulsó. El script no los lee.
//
// Lo que se comprueba, y por qué cada caso:
//
//   · el reto del EVENTO va primero en el array a propósito. La API de ese día devolvía el
//     diario primero y así el script acertaba de rebote; con el orden al revés, la baldosa
//     del diario decía 4/180 y la racha medía los minutos del evento.
//   · la baldosa del evento: el nombre que da Kick, sus minutos y el video de su cofre, que
//     sale de la API y no del código, así que un evento que el script no conoce —uno de
//     Navidad— sale igual.
//   · el AUTOMÁTICO con el diario listo y el evento no. Es el fallo que trajo el carrusel:
//     el script miraba solo el primer «Reclamar» —el del evento, deshabilitado—, cerraba el
//     modal sin cobrar y volvía a abrirlo en el siguiente ciclo, sin cobrar nunca el diario.
//   · el botón de la baldosa del diario con LOS DOS listos: tiene que pulsar el suyo, que es
//     el oculto. Con los dos habilitados, «el primero habilitado» pulsaría el del evento, así
//     que sólo pasa si el emparejamiento por diapositiva funciona.
const { run, readFixture } = require('./harness');

const panel = readFixture('fixture-claimed-panel.html');

const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ventana = () => ({ starts_at: iso(Date.now() - 6 * hora), ends_at: iso(Date.now() + 6 * hora) });

const diario = (extra = {}) => ({
    id: '019f1234-3dc2-71f4-a53e-7c4055ce5b12',
    name: 'Daily Reward', recurrence: 'daily', featured: false, status: 'in_progress',
    animations: {
        idle_url: 'https://static.kick.com/rewards/daily-rewards/idle',
        unbox_url: 'https://static.kick.com/rewards/daily-rewards/unbox'
    },
    condition: { type: 'watch_time_minutes', progress: 4, threshold: 60 },
    window: ventana(),
    ...extra
});

const evento = (extra = {}) => ({
    id: '019f1234-aaaa-7bbb-cccc-000000002610',
    name: 'Trick or Treat', recurrence: 'daily', featured: true, status: 'in_progress',
    active_period: { starts_at: iso(Date.now() - 24 * hora), ends_at: iso(Date.now() + 7 * 24 * hora) },
    animations: {
        idle_url: 'https://static.kick.com/rewards/halloween-2610/idle',
        unbox_url: 'https://static.kick.com/rewards/halloween-2610/unbox'
    },
    condition: { type: 'watch_time_minutes', progress: 4, threshold: 180 },
    window: ventana(),
    ...extra
});

// El modal del volcado, recortado a lo que decide: las dos diapositivas con su video y los
// dos pies, el del evento visible y el del diario dentro de `hidden`.
const boton = (etiqueta, habilitado) =>
    `<button class="bg-primary-base w-full" aria-label="${etiqueta}"${habilitado ? '' : ' aria-disabled="true" disabled=""'}><div class="contents">Reclamar</div></button>`;
const carrusel = ({ eventoListo, diarioListo, activa = 0 }) => `
<div class="relative -mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto"><div class="flex w-full flex-1 flex-col gap-4">
  <div class="relative"><section aria-roledescription="carousel" aria-label="Reclamá tu recompensa" class="flex w-full snap-x snap-mandatory overflow-x-auto">
    <div data-carousel-slide=""${activa === 0 ? ' data-active="true"' : ''} class="flex shrink-0 snap-start"><section class="flex w-full flex-col">
      <h3>Trick or Treat</h3>
      <div class="relative aspect-1200/952 w-full"><div class="absolute inset-0 z-10 bg-black"><video src="https://static.kick.com/rewards/halloween-2610/idle.webm" autoplay="" loop="" playsinline=""></video></div></div>
    </section></div>
    <div data-carousel-slide=""${activa === 1 ? ' data-active="true"' : ''} class="flex shrink-0 snap-start"><section class="flex w-full flex-col">
      <h3>Daily Reward</h3>
      <div class="flex flex-col gap-3"><div class="h-9 w-[42px] shrink-0"><video src="https://static.kick.com/rewards/streaks-battery.webm" autoplay="" loop="" playsinline=""></video></div></div>
      <div class="relative aspect-1200/952 w-full"><div class="absolute inset-0 z-10 bg-black"><video src="https://static.kick.com/rewards/daily-rewards/idle.webm" autoplay="" loop="" playsinline=""></video></div></div>
    </section></div>
  </section><button type="button" aria-label="Recompensa anterior" aria-keyshortcuts="ArrowLeft"></button><button type="button" aria-label="Siguiente recompensa" aria-keyshortcuts="ArrowRight"></button></div>
  <div class="flex w-full flex-col gap-4 px-4">
    <div${activa === 0 ? '' : ' hidden=""'} class="flex w-full flex-col gap-4"><div class="flex w-full flex-col items-center gap-2">${boton('Reclamar evento', eventoListo)}<p>${eventoListo ? '' : 'Mira 176 minutos más para reclamar'}</p></div></div>
    <div${activa === 1 ? '' : ' hidden=""'} class="flex w-full flex-col gap-4"><div class="flex w-full flex-col items-center gap-2">${boton('Reclamar diario', diarioListo)}<p>${diarioListo ? '' : 'Mira 56 minutos más para reclamar'}</p></div></div>
  </div>
</div></div>`;

const listo = { status: 'claimable', condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 } };
const listoEvento = { status: 'claimable', condition: { type: 'watch_time_minutes', progress: 180, threshold: 180 } };

const base = {
    url: 'https://kick.com/drops/claimed',
    panels: [{ hidden: false, html: panel }],
    progress, waitMs: 26000,
    seed: { kick_show_hide_inventory_expired: true }
};

(async () => {
    const fallos = [];

    // --- Las dos baldosas, con el evento PRIMERO en la API -------------------------
    const dos = await run({ ...base, challenges: [evento(), diario()] });
    console.log(JSON.stringify({ caso: 'las dos baldosas', diario: dos.cofre, eventos: dos.cofresEvento }));
    if (!dos.cofre) fallos.push('no se pintó la baldosa del cofre diario');
    else {
        if (dos.cofre.contador !== '4/60') fallos.push(`la baldosa del diario dice "${dos.cofre.contador}": cogió el reto del evento`);
        // El diario también lleva SU video, el que da la API, y no el del evento.
        if ((dos.cofre.video || [])[0] !== 'https://static.kick.com/rewards/daily-rewards/idle.webm') {
            fallos.push(`la baldosa del diario no lleva el video de su cofre: ${JSON.stringify(dos.cofre.video)}`);
        }
    }
    const ev = (dos.cofresEvento || [])[0];
    if ((dos.cofresEvento || []).length !== 1) fallos.push(`hay ${(dos.cofresEvento || []).length} baldosas de evento y tenía que haber 1`);
    if (ev) {
        if (ev.nombre !== 'Trick or Treat') fallos.push(`la baldosa del evento se llama "${ev.nombre}"`);
        if (ev.contador !== '4/180') fallos.push(`la baldosa del evento dice "${ev.contador}"`);
        if (ev.izquierda !== '2h 56m' && !/2\s*h/.test(ev.izquierda)) fallos.push(`al evento le faltan "${ev.izquierda}" y son 2 h 56 min`);
        if (ev.pie !== 'nota') fallos.push(`el pie del evento es "${ev.pie}" y va acumulando`);
        const fuentes = ev.video || [];
        if (fuentes[0] !== 'https://static.kick.com/rewards/halloween-2610/idle.webm' ||
            fuentes[1] !== 'https://static.kick.com/rewards/halloween-2610/idle.mp4') {
            fallos.push(`el video del evento no es el de su cofre: ${JSON.stringify(ev.video)}`);
        }
        if (!ev.detrasDelDiario) fallos.push('la baldosa del evento no va detrás de la del diario');
    }

    // --- Un evento que el script no conoce: el video de SU cofre ------------------
    // Es lo que hace que un cofre de Navidad salga solo, sin tocar el código.
    const otro = await run({
        ...base,
        challenges: [evento({
            id: '019f1234-aaaa-7bbb-cccc-00000000xmas', name: 'Holiday Gift',
            animations: { idle_url: 'https://static.kick.com/rewards/xmas-2612/idle' }
        }), diario()]
    });
    const evo = (otro.cofresEvento || [])[0];
    console.log(JSON.stringify({ caso: 'evento sin imagen', evento: evo }));
    if (!evo) fallos.push('un evento sin imagen incrustada no pintó baldosa');
    else {
        if (evo.nombre !== 'Holiday Gift') fallos.push(`el evento desconocido se llama "${evo.nombre}"`);
        const fuentes = evo.video || [];
        if (fuentes[0] !== 'https://static.kick.com/rewards/xmas-2612/idle.webm' ||
            fuentes[1] !== 'https://static.kick.com/rewards/xmas-2612/idle.mp4') {
            fallos.push(`el video del evento no es el de su cofre: ${JSON.stringify(evo.video)}`);
        }
        if (!evo.videoMudo) fallos.push('el video del evento no va mudo, en bucle y solo');
        if (evo.imagen) fallos.push('el evento desconocido lleva una imagen que no es la suya');
    }

    // La banda del evento en la pestaña 🔔, pegada al medidor de racha y solo
    // informativa: el nombre, lo visto de lo que pide y lo que falta.
    const banda = (dos.bandasEvento || [])[0];
    console.log(JSON.stringify({ caso: 'banda del evento', medidor: dos.medidor && dos.medidor.texto, bandas: dos.bandasEvento }));
    if (!banda) fallos.push('no se pintó la banda del evento en la pestaña 🔔');
    else {
        if (!/Trick or Treat/.test(banda.texto)) fallos.push(`la banda no dice el nombre del evento: "${banda.texto}"`);
        if (!/4\/180 min/.test(banda.texto)) fallos.push(`la banda no dice lo visto de lo que pide: "${banda.texto}"`);
        if (!/2h 56m/.test(banda.texto)) fallos.push(`la banda no dice lo que falta: "${banda.texto}"`);
        if (!banda.trasElMedidor) fallos.push('la banda no va pegada debajo del medidor de racha');
    }
    if (dos.medidor && /180/.test(dos.medidor.texto || '')) fallos.push(`el medidor de racha habla del evento: "${dos.medidor.texto}"`);

    // --- El evento cobrado: la carta que tocó, no el video -------------------------
    const cobrado = await run({
        ...base,
        challenges: [evento({
            status: 'claimed', condition: { type: 'watch_time_minutes', progress: 180, threshold: 180 },
            claimed_at: iso(Date.now() - hora),
            // La forma real del 2026-10-23: el evento trae la carta VACIA y la imagen en la
            // miniatura.
            winner: { id: 'w1', rarity: 'common', card_url: '', thumbnail_url: 'https://content.kick.com/public/rewards/thumbnails/premio.png' }
        }), diario()]
    });
    const evc = (cobrado.cofresEvento || [])[0];
    console.log(JSON.stringify({ caso: 'evento cobrado', evento: evc }));
    if (!evc) fallos.push('el evento cobrado no pintó baldosa');
    else {
        if (evc.pie !== 'check') fallos.push(`el evento cobrado tiene pie "${evc.pie}"`);
        if (evc.imagen !== 'https://content.kick.com/public/rewards/thumbnails/premio.png') fallos.push(`el evento cobrado no enseña lo que tocó (thumbnail_url): ${evc.imagen}`);
        if (evc.video) fallos.push('el evento cobrado sigue con el video del cofre en vez de la carta');
    }

    // --- El automático, con el diario listo y el evento no -------------------------
    const auto = await run({
        ...base,
        challenges: [evento(), diario(listo)],
        cofre: 'disponible',
        cofreModal: carrusel({ eventoListo: false, diarioListo: true }),
        waitMs: 30000
    });
    console.log(JSON.stringify({ caso: 'automático, diario listo', botones: auto.botonesPulsados, diapositivas: auto.diapositivasTraidas }));
    const pulsAuto = auto.botonesPulsados || [];
    if (!pulsAuto.includes('Reclamar diario')) {
        fallos.push(`el automático no cobró el diario estando listo; se pulsaron: ${JSON.stringify(pulsAuto)}`);
    }
    if (pulsAuto.includes('Reclamar evento')) fallos.push('el automático pulsó el «Reclamar» deshabilitado del evento');
    if (!(auto.diapositivasTraidas || []).includes(1)) {
        fallos.push(`no trajo a la vista la diapositiva del diario: ${JSON.stringify(auto.diapositivasTraidas)}`);
    }

    // --- El botón de la baldosa del diario, con los dos listos --------------------
    const mano = await run({
        ...base,
        challenges: [evento(listoEvento), diario(listo)],
        cofre: 'cuenta',            // en cuenta atrás: el automático se abstiene
        cofreModal: carrusel({ eventoListo: true, diarioListo: true }),
        clickCofre: { at: 20000 },
        waitMs: 30000
    });
    console.log(JSON.stringify({ caso: 'a mano, los dos listos', botones: mano.botonesPulsados, diapositivas: mano.diapositivasTraidas }));
    const pulsMano = (mano.botonesPulsados || []).filter(b => /^Reclamar (evento|diario)$/.test(b));
    if (pulsMano.length !== 1 || pulsMano[0] !== 'Reclamar diario') {
        fallos.push(`la baldosa del diario tenía que pulsar SOLO el suyo; se pulsaron: ${JSON.stringify(pulsMano)}`);
    }
    if (!mano.dialogoAbierto) fallos.push('el reclamo a mano cerró el modal, y tiene que dejar el resultado a la vista');

    // --- Clic en la baldosa del diario: el carrusel va a SU cofre -----------------
    // Kick abre por la primera diapositiva, que es la del evento.
    const tile = await run({
        ...base,
        challenges: [evento(), diario()],
        cofre: 'cuenta',
        cofreModal: carrusel({ eventoListo: false, diarioListo: false }),
        clickTarjetaCofre: { at: 20000 },
        waitMs: 26000
    });
    console.log(JSON.stringify({ caso: 'clic en la baldosa del diario', botones: tile.botonesPulsados, diapositivas: tile.diapositivasTraidas }));
    const dTile = tile.diapositivasTraidas || [];
    if (dTile[dTile.length - 1] !== 1) fallos.push(`la baldosa del diario no dejó delante su cofre: ${JSON.stringify(dTile)}`);
    if ((tile.botonesPulsados || []).some(b => /^Reclamar /.test(b))) fallos.push('abrir desde la baldosa reclamó algo');

    // --- Clic en la banda del evento, con el carrusel parado en el diario ----------
    const enBanda = await run({
        ...base,
        url: 'https://kick.com/drops/campaigns',
        challenges: [evento(), diario()],
        cofre: 'cuenta',
        cofreModal: carrusel({ eventoListo: false, diarioListo: false, activa: 1 }),
        clickBanda: { at: 20000 },
        waitMs: 26000
    });
    console.log(JSON.stringify({ caso: 'clic en la banda del evento', botones: enBanda.botonesPulsados, diapositivas: enBanda.diapositivasTraidas }));
    const dBanda = enBanda.diapositivasTraidas || [];
    if (dBanda[dBanda.length - 1] !== 0) fallos.push(`la banda del evento no dejó delante su cofre: ${JSON.stringify(dBanda)}`);

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
