// El caso REAL que reporto el usuario: una campaña aparecia en el panel sin ninguna
// etiqueta de keyword, o sea sin poder explicar por que estaba. La keyword "rage"
// casaba dentro de "ave-rage-aden $5 Stake.com Bonus" —el nombre de la campaña— pero
// las etiquetas se calculaban sobre el titulo mostrado ("Slots & Casino - Stake.com"),
// donde "rage" no aparece.
//
// Se comprueba a la vez el boton de compartir: SOLO en abiertos.
const { run } = require('./harness');

const dia = 24 * 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const ahora = Date.now();

const campaña = (nombre, juego, org, status, desde, hasta) => ({
    name: nombre, status, starts_at: iso(desde), ends_at: iso(hasta),
    category: juego ? { name: juego } : undefined,
    organization: { name: org },
    rewards: [{ id: nombre + '-r1', name: nombre, required_units: 4, image_url: 'x.png' }]
});

const apiCampaigns = [
    // La del usuario: solo casa por "rage" DENTRO del nombre, nunca por el titulo.
    campaña('averageaden $5 Stake.com Bonus', 'Slots & Casino', 'Stake.com',
            'active', ahora - dia, ahora + dia),
    // Una que casa por el juego, y encima cerrada: no debe llevar 🔗.
    campaña('Rust drop', 'Rust', 'Facepunch Studios', 'expired', ahora - 9 * dia, ahora - dia)
];

(async () => {
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ route: '/drops/campaigns', hidden: false, html: '' }],
        apiCampaigns, waitMs: 16000,
        seed: { kick_drop_keywords: JSON.stringify(['rage', 'rust', 'quake']) }
    });
    const ver = c => ({ title: c.title, chips: c.chips, share: c.share, tip: c.shareText });
    console.log(JSON.stringify({
        abiertos: r.active.map(ver),
        cerrados: r.expired.map(ver),
        solapas: r.tabLabels
    }, null, 2));

    const slots = r.active.find(c => /Slots/.test(c.title));
    const rust = r.expired.find(c => /Rust/.test(c.title));
    const fallos = [];
    if (!slots) fallos.push('la campaña de Slots no salio en abiertos');
    else {
        if (!slots.chips.includes('rage')) fallos.push('SIN la etiqueta "rage": la tarjeta no se explica');
        if (!slots.share) fallos.push('abierta SIN boton de compartir');
    }
    if (!rust) fallos.push('la de Rust no salio en cerrados');
    else if (rust.share) fallos.push('una CERRADA lleva boton de compartir');
    console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
    process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
