// UNA CAMPAÑA CERRADA NO SE DA POR PERDIDA.
//
// Lo que caduca es el PROGRESO, no lo que ya te ganaste: la propia pestaña lo dice
// —«These campaigns have ended, so you can no longer earn progress on them. Rewards you
// fully unlocked before they closed are still claimable»— y se comprobo dejando una
// recompensa sin cobrar a proposito hasta que la campaña cerro (2026-09-13, Teamfight
// Tactics). El boton seguia ahi y seguia funcionando, y el script pasaba de largo: el
// barrido de reclamacion solo corria en campañas y en reclamados.
//
// El fixture es ese volcado. Y trae las dos cosas que hacen falta para que esto no salga
// verde por casualidad:
//
//   · NO hay barras de progreso. El reclamo entraba SIEMPRE por
//     [role="progressbar"][data-state="complete"], asi que en cerradas no habia puerta:
//     por eso la señal pasa a ser el `aria-label` del boton.
//   · hay un segundo boton CON aria-label que no es de reclamar —«Watch to redeem»—, y
//     ademas un tercero sin etiqueta. Si el criterio fuera «pulsa el unico boton», o
//     «pulsa el que tenga etiqueta», este fixture lo delataria.
//
// Y LA TERCERA VUELTA ES EN ESPAÑOL, que es donde se vio el fallo. El volcado esta en
// ingles, y con el solo se probaba media cosa: la primera version de esto entraba por el
// `aria-label` y en la pagina del usuario —Kick en español— no reclamaba nada, porque ese
// atributo SI se traduce. El boton español no esta inventado, es el que mando el usuario
// el 2026-09-13 de su propia pagina:
//
//     aria-label="Reclamar recompensa de Slouched Emote"  ·  <div>Pedir</div>
//
// Lo unico que comparten las dos versiones es la clase `bg-primary-base`, asi que esta
// vuelta es la que comprueba que el criterio es esa y no la etiqueta.
//
// Los dos primeros casos se dan sensibilidad el uno al otro: la casilla es la unica
// diferencia.
const { run, readFixture } = require('./harness');

const panel = readFixture('fixture-expired-claimable.html');

// El MISMO fixture con el boton en español. Se sustituye el atributo y el texto y nada
// mas: la clase se queda, que es justo lo que se viene a comprobar.
const panelEs = panel
    .replace('aria-label="Claim Slouched Emote reward"',
             'aria-label="Reclamar recompensa de Slouched Emote"')
    .replace('<div class="contents">Claim</div>', '<div class="contents">Pedir</div>');
if (panelEs === panel) {
    console.log('FALLOS:\n - el fixture ya no trae el boton en ingles que esta vuelta traduce');
    process.exit(1);
}

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// La campaña, cerrada hace diez dias, con la recompensa ganada (progress_units por
// encima de lo que pedia) y SIN reclamar: es lo que sostiene que el boton siga vivo.
const apiCampaigns = [{
    name: 'TFT drop', status: 'expired',
    starts_at: iso(ahora - 40 * dia), ends_at: iso(ahora - 10 * dia),
    category: { name: 'Teamfight Tactics' }, organization: { name: 'Riot Games' },
    rewards: [{ id: 'tft-r1', name: 'Slouched Emote', required_units: 60, image_url: 'x.png' }]
}];
const progress = [{
    name: 'TFT drop', progress_units: 120,
    rewards: [{ id: 'tft-r1', name: 'Slouched Emote', claimed: false, required_units: 60 }]
}];

const CLAVE_CASILLA = 'kick_show_hide_inventory_expired';
const esDeReclamar = etiqueta => /claim/i.test(String(etiqueta || ''));

const base = {
    url: 'https://kick.com/drops/expired',
    panels: [{ hidden: false, html: panel }],
    apiCampaigns, progress,
    waitMs: 17000
};

(async () => {
    const fallos = [];

    // --- Casilla marcada: se reclama ---------------------------------------------
    const on = await run({
        ...base,
        seed: {
            kick_drop_keywords: JSON.stringify(['teamfight']),
            [CLAVE_CASILLA]: true
        }
    });
    console.log(JSON.stringify({ conCasilla: on.botonesPulsados }, null, 2));

    const pulsados = (on.botonesPulsados || []).filter(esDeReclamar);
    if (pulsados.length === 0) {
        fallos.push('con la casilla marcada no se reclamo la recompensa de la campaña cerrada; ' +
            `se pulsaron: ${JSON.stringify(on.botonesPulsados)}`);
    } else if (!pulsados.some(e => e.includes('Slouched Emote'))) {
        fallos.push(`se pulso un boton que no es el de esa recompensa: ${JSON.stringify(pulsados)}`);
    }
    if (pulsados.length > 1) {
        fallos.push(`se reclamo ${pulsados.length} veces y solo hay una recompensa`);
    }
    // El decoy: «Watch to redeem» es un boton con etiqueta que no reclama nada.
    if ((on.botonesPulsados || []).some(e => /watch to redeem/i.test(String(e || '')))) {
        fallos.push('se pulso «Watch to redeem», que no es un boton de reclamar');
    }

    // --- Casilla sin marcar: no se toca nada --------------------------------------
    const off = await run({
        ...base,
        seed: { kick_drop_keywords: JSON.stringify(['teamfight']) }
    });
    console.log(JSON.stringify({ sinCasilla: off.botonesPulsados }, null, 2));

    if ((off.botonesPulsados || []).filter(esDeReclamar).length > 0) {
        fallos.push('con la casilla sin marcar se reclamo igual: ' +
            JSON.stringify(off.botonesPulsados));
    }

    // --- Y no esconde nada: en cerradas solo actua la mitad de reclamar ------------
    // La otra mitad de la casilla —ocultar— se llevaria por delante lo unico que hay
    // que mirar en esa pestaña.
    const visibles = (on.expired || []).length;
    if (visibles === 0) {
        fallos.push('la pestaña de cerradas se quedo sin tarjetas: el barrido escondio algo');
    }

    // --- Y en español, que es donde se vio el fallo ---------------------------------
    const es = await run({
        ...base,
        panels: [{ hidden: false, html: panelEs }],
        seed: {
            kick_drop_keywords: JSON.stringify(['teamfight']),
            [CLAVE_CASILLA]: true
        }
    });
    console.log(JSON.stringify({ enEspanol: es.botonesPulsados }, null, 2));

    const pulsadosEs = (es.botonesPulsados || []).filter(e => /Slouched Emote/.test(String(e || '')));
    if (pulsadosEs.length === 0) {
        fallos.push('con Kick en español no se reclamo nada; ' +
            `se pulsaron: ${JSON.stringify(es.botonesPulsados)}`);
    }
    if ((es.botonesPulsados || []).some(e => /watch to redeem/i.test(String(e || '')))) {
        fallos.push('en español se pulso «Watch to redeem»');
    }

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})();
