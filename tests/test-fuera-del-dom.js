// Reportado el 2026-08-07 con la pestaña de campañas VACIA: el panel decia "Drops
// Abiertos (1)" con una tarjeta "AverageAden" y en la barra lateral habia un canal
// recomendado con el borde verde de campaña abierta, mientras la pagina decia "No hay
// campañas abiertas".
//
// El script solo debe leer DENTRO del area de drops. Cuando la pestaña no tiene
// campañas, el escaneo se quedaba sin nodos por sus dos selectores buenos y caia a un
// barrido de TODO el documento por `[data-state], .bg-surface-base`, que fuera del
// <main> encuentra el menu y las tarjetas de canal de la barra lateral. De ahi salio
// "AverageAden": la keyword `rage` casa por dentro del nombre.
//
// La regla vale igual para las tres pestañas, asi que se prueban las tres vacias —que
// es cuando el fallback entraba— y ademas cerradas con campañas de verdad, para que la
// barra lateral no se cuele tampoco cuando SI hay algo que leer.
const { run, readFixture } = require('./harness');
const expiredPanel = readFixture('fixture-expired-panel.html');

// El vacio tal cual lo sirve Kick (volcado del 2026-08-07): el parrafo de la pestaña
// y el cartel de "No hay campañas abiertas". Ni un `.bg-surface-base` a la vista.
const VACIO = `
<div class="flex w-full shrink-0 grow-0 flex-col gap-2">
  <p class="whitespace-pre-line text-sm leading-normal text-neutral-300">Los Drops están disponibles automáticamente en los streams elegibles.</p>
  <div class="flex flex-wrap items-center gap-2 py-2"></div>
</div>
<div class="flex w-full shrink-0 grow-0 flex-col gap-3">
  <div class="flex grow basis-0 flex-col items-center justify-center gap-y-2" data-testid="empty-state-root">
    <div class="flex flex-col items-center justify-center empty:hidden">
      <div class="text-surface-onSurfaceSecondary whitespace-pre-wrap text-center text-sm font-normal">No hay campañas abiertas</div>
    </div>
  </div>
</div>`;

const CASOS = [
    { nombre: 'campaigns vacia', url: '/drops/campaigns', html: VACIO },
    { nombre: 'coming-soon vacia', url: '/drops/coming-soon', html: VACIO },
    { nombre: 'expired vacia', url: '/drops/expired', html: VACIO },
    { nombre: 'expired con campañas', url: '/drops/expired', html: expiredPanel }
];

// Los dos canales de la barra lateral del arnes. Ninguno puede aparecer en ningun sitio.
const LATERAL = ['AverageAden', 'Guishorro'];

// Las keywords del usuario que lo reporto, no las de fabrica: `rage` (que casa por dentro
// de "AverageAden") y `counter-strike` (que casa con la categoria del otro canal) no vienen
// por defecto, y sin ellas el fallo no se ve aunque este ahi.
const KEYWORDS = JSON.stringify(['rust', 'rage', 'counter-strike', 'overwatch', 'kick']);

(async () => {
    const fallos = [];

    for (const c of CASOS) {
        const r = await run({
            url: 'https://kick.com' + c.url,
            panels: [{ route: c.url, hidden: false, html: c.html }],
            waitMs: 16000,
            seed: { kick_drop_keywords: KEYWORDS }
        });

        const tarjetas = [].concat(r.active, r.upcoming, r.expired).map(x => x.title || '');
        const coladas = tarjetas.filter(t => LATERAL.some(n => t.includes(n)));

        console.log(JSON.stringify({
            caso: c.nombre,
            tarjetas,
            marcadosEnLaPagina: r.matches.length,
            fueraDelMain: r.fueraDelMain
        }));

        if (coladas.length) {
            fallos.push(`${c.nombre}: la barra lateral entro al panel -> ${coladas.join(', ')}`);
        }
        if (r.fueraDelMain.length) {
            fallos.push(`${c.nombre}: se toco ${r.fueraDelMain.length} elemento(s) fuera del <main> -> ` +
                JSON.stringify(r.fueraDelMain));
        }
    }

    console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
