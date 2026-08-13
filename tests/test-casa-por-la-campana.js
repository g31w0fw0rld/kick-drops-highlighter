// La campaña que casa por algo que la fila NO enseña.
//
// El filtro de la API mira `campaña + categoría + organización`; el de la página, solo el
// título de la fila. Así que «rage» dentro de «ave-rage-aden $5 Stake.com Bonus» metía la
// campaña en el panel, mientras la fila —que dice «Slots & Casino - Stake.com», donde
// «rage» no aparece— se quedaba sin marcar, sin aviso, y con su aviso borrándose solo al
// tocar la lista de keywords.
//
// Los nombres salen del caso real que el propio script ya documentaba.
const { run } = require('./harness');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

// La fila tal y como la pinta Kick: el juego en el <h2> grande y la organización en el <p>
// de móvil. Ni rastro del nombre de la campaña, que es donde vive la keyword.
const fila = (juego, org) => `
<div class="bg-surface-base rounded-2xl flex flex-col">
  <div class="flex gap-2">
    <img class="rounded h-[67px] w-[50px]" alt="${juego}" src="https://files.kick.com/images/subcategories/28/banner/x">
    <h2 class="text-white font-bold lg:text-base text-2xl">${juego}</h2>
    <p class="text-surface-onSurfaceSecondary text-xs font-normal lg:hidden lg:text-sm">${org}</p>
  </div>
  <div class="border-outline-decorative bg-surface-base flex flex-col">
    <h2 class="text-sm font-bold">averageaden $5 Stake.com Bonus</h2>
    <p class="text-surface-onSurfaceSecondary text-sm">11 ago 2026, 13:45 - 14 ago 2026, 21:00</p>
  </div>
</div>`;

const campana = (nombre, juego, org) => ({
    name: nombre, status: 'active',
    starts_at: iso(ahora - dia), ends_at: iso(ahora + dia),
    category: { name: juego }, organization: { name: org },
    rewards: [{ id: 'r1', name: 'x1 entry', required_units: 60, image_url: 'drops/reward/x.png' }]
});

const API = [campana('averageaden $5 Stake.com Bonus', 'Slots & Casino', 'Stake.com')];

(async () => {
    const fallos = [];

    // 1. El caso reportado: la keyword solo está en el nombre de la campaña.
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: fila('Slots & Casino', 'Stake.com') }],
        apiCampaigns: API,
        seed: { kick_drop_keywords: JSON.stringify(['rage']) },
        waitMs: 18000
    });
    const tarjeta = r.active[0] || {};
    console.log(JSON.stringify({
        caso: 'casa por el nombre de la campaña',
        marcados: r.matches.map(m => ({ titulo: m.title, color: m.borderColor })),
        tarjetas: r.active.map(c => c.title),
        etiquetas: tarjeta.chips,
        avisos: Object.keys(r.stored).includes('kick_drop_notifications')
            ? JSON.parse(r.stored.kick_drop_notifications).map(n => n.title) : []
    }));

    if (r.matches.length === 0)
        fallos.push('la fila no se marcó en la página');
    if (!(tarjeta.chips || []).some(c => /rage/i.test(c)))
        fallos.push(`la tarjeta no dice por qué está ahí -> ${JSON.stringify(tarjeta.chips)}`);
    const avisos = r.stored.kick_drop_notifications ? JSON.parse(r.stored.kick_drop_notifications) : [];
    if (!avisos.length)
        fallos.push('no se generó ningún aviso');

    // 2. Una negativa sobre el texto de la FILA manda, aunque la entrada de la API haya
    // pasado el filtro. Es lo que separa «no encontré ninguna positiva» —que otra fuente
    // puede desmentir— de «no quiero esto», que es una orden.
    const r2 = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: fila('Slots & Casino', 'Stake.com') }],
        apiCampaigns: API,
        seed: { kick_drop_keywords: JSON.stringify(['rage', '-casino']) },
        waitMs: 18000
    });
    console.log(JSON.stringify({ caso: 'negativa sobre la fila', marcados: r2.matches.length }));
    if (r2.matches.length > 0)
        fallos.push('la negativa no mandó: se marcó una fila descartada');

    // 3. El cruce es EXACTO, nunca por subcadena. «Slots» no es «Slots & Casino», así que
    // una fila con ese nombre no puede llevarse la entrada de la otra. Con un cruce laxo
    // —el que ya existe para otras cosas— esta fila se marcaría de más.
    const r3 = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: fila('Slots', 'Otra Org') }],
        apiCampaigns: API,
        seed: { kick_drop_keywords: JSON.stringify(['rage']) },
        waitMs: 18000
    });
    console.log(JSON.stringify({ caso: 'cruce exacto', marcados: r3.matches.length }));
    if (r3.matches.length > 0)
        fallos.push('el cruce casó por subcadena y marcó una fila que no es');

    // 4. Y el aviso no se borra solo al tocar la lista de keywords. Añadir «minecraft»
    // —que no tiene nada que ver— llamaba a la limpieza, que juzgaba el aviso por su
    // TÍTULO: «Slots & Casino - Stake.com» no contiene ni «rage» ni «minecraft», así que
    // lo borraba. Volvía a nacer al siguiente escaneo: un parpadeo sin explicación.
    const r4 = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: fila('Slots & Casino', 'Stake.com') }],
        apiCampaigns: API,
        seed: { kick_drop_keywords: JSON.stringify(['rage']) },
        addKeyword: { at: 9000, value: 'minecraft' },
        waitMs: 18000
    });
    const tras = r4.stored.kick_drop_notifications ? JSON.parse(r4.stored.kick_drop_notifications) : [];
    console.log(JSON.stringify({
        caso: 'añadir una keyword ajena',
        keywords: r4.stored.kick_drop_keywords,
        avisosTras: tras.map(n => n.title)
    }));
    if (!/minecraft/.test(r4.stored.kick_drop_keywords || ''))
        fallos.push('la keyword no llegó a añadirse: el caso no probó nada');
    else if (!tras.length)
        fallos.push('añadir una keyword ajena borró el aviso');

    console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
