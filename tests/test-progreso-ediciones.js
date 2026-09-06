// EL TIEMPO QUE FALTA, CUANDO LA CAMPAÑA VOLVIO ESTA TEMPORADA.
//
// `_kickCampaigns` se indexa por el NOMBRE de la campaña —es la unica clave que el DOM
// puede dar— y se llenaba en un bucle, asi que con dos ediciones homonimas ganaba la
// ULTIMA del array, sin ningun criterio. Si ganaba la vieja, con sus minutos ya hechos,
// el aviso de «Tiempo restante» salia contando lo visto EL AÑO PASADO: el error va en la
// direccion mala, porque dice que no falta tiempo sobre una campaña en la que no has
// visto nada.
//
// El fixture es el volcado de `/drops/campaigns` con PUBG abierta y dos tramos en curso
// (27% y 13%, o sea 8 minutos vistos de 30 y de 60). La edicion vieja va AL FINAL del
// array a proposito: es el orden que hace ganar a la equivocada.
//
// Dos casos, y el segundo es el que dice que descartar no apaga nada:
//   1. la vieja llega `expired` —la forma real, ver el volcado del 2026-09-06— y el
//      aviso sigue saliendo con los minutos de ESTA edicion;
//   2. las dos vigentes: el nombre no distingue, no se indexa ninguna, y el aviso cae al
//      respaldo que saca el total de la BARRA del propio DOM. Da el mismo numero, que es
//      justo lo que hace barato descartar.
const { run, readFixture } = require('./harness');

const pane = readFixture('fixture-campaigns-progress.html');

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const TIERS = [
    { id: 'pgs-1', name: 'PGS 9 Comic Boom (Spray)', required_units: 30, image_url: 'a.png' },
    { id: 'pgs-2', name: 'PGS 9 Stay Focused (Emblem)', required_units: 60, image_url: 'b.png' }
];

// La de esta temporada: 8 vistos, que es lo que dicen las dos barras del volcado.
const actual = {
    name: 'PGS 9 Drops', status: 'active', progress_units: 8,
    starts_at: iso(ahora - 2 * hora), ends_at: iso(ahora + 45 * hora),
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards: TIERS
};

// La del año pasado: mismo nombre, mismos tramos, 600 minutos vistos. Sin reclamar a
// proposito —se puede ver mucho y no cobrar—, que es lo que la deja competir de verdad:
// con las rewards ya cobradas el mapa se quedaria sin candidatas y el fallo no se veria.
const vieja = (status, ends) => ({
    name: 'PGS 9 Drops', status, progress_units: 600,
    starts_at: iso(ahora - 400 * 24 * hora), ends_at: ends,
    category: { name: 'PUBG: Battlegrounds' }, organization: { name: 'KRAFTON' },
    rewards: TIERS.map(r => ({ ...r, id: r.id + '-vieja' }))
});

const SEL = 'main li';
const base = {
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: pane }],
    seed: { kick_drop_keywords: JSON.stringify(['pubg']) },
    apiCampaigns: [actual],
    waitMs: 17000,
    hover: { sels: [SEL], at: 11000 }
};

const CASOS = [
    {
        nombre: 'la edicion cerrada no decide el tiempo que falta',
        progress: [actual, vieja('expired', iso(ahora - 300 * 24 * hora))]
    },
    {
        nombre: 'dos vigentes homonimas: cae al respaldo de la barra, y da lo mismo',
        progress: [actual, vieja('active', iso(ahora + 45 * hora))]
    }
];

const ESPERADO = 'Tiempo restante: 22m';

let fallos = 0;
const comprobar = (ok, msg) => { console.log((ok ? '  ok   ' : '  FALLA') + ' ' + msg); if (!ok) fallos++; };

(async () => {
    for (const c of CASOS) {
        console.log('\n=== ' + c.nombre + ' ===');
        const r = await run({ ...base, progress: c.progress });
        const caso = (r.tip && r.tip.casos || []).find(x => x.sel === SEL);
        comprobar(!!caso && caso.visible, 'sale el aviso sobre el primer tramo');
        if (!caso || !caso.visible) continue;
        comprobar(caso.texto === ESPERADO,
            `dice «${ESPERADO}»` + (caso.texto === ESPERADO ? '' : ` (dice «${caso.texto}»)`));
    }
    console.log(fallos === 0 ? '\nTODO EN VERDE' : '\n' + fallos + ' COMPROBACIONES EN ROJO');
    process.exit(fallos === 0 ? 0 : 1);
})();
