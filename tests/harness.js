// Arranca el userscript dentro de jsdom sobre un DOM de Kick y devuelve lo que
// dejo pintado. Se comprueban EFECTOS observables (ids drop-match-*, bordes,
// tarjetas del panel), no funciones internas: son las que ve el usuario.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SCRIPT = fs.readFileSync(
    '/Users/agavemg/code/scripts/kick-drops-highlighter/kick-drops-highlighter.user.js', 'utf8');
const HERE = __dirname;

function page({ url, panels }) {
    // `panels`: [{ hidden: bool, html }] en orden. Kick deja montadas las
    // pestañas inactivas con display:none !important.
    const body = panels.map(p =>
        `<div class="flex w-full flex-col"${p.hidden ? ' style="display: none !important;"' : ' style=""'}>
            <div class="h-full flex-1"><div class="flex flex-col gap-5">${p.html}</div></div>
        </div>`).join('\n');

    return `<!doctype html><html lang="es"><head><title>Drops</title></head><body>
    <main>
      <div><h2 class="text-white font-bold lg:text-2xl text-2xl">Drops y recompensas</h2>
        <div class="flex flex-col gap-4 rounded-lg py-3">
          <div class="relative flex flex-nowrap bg-surface-lowest">
            <a class="font-semibold h-12 text-base" href="/drops/campaigns"${url.includes('/campaigns') ? ' data-state="active"' : ''}>Campaigns</a>
            <a class="font-semibold h-12 text-base" href="/drops/coming-soon"${url.includes('coming-soon') ? ' data-state="active"' : ''}>Coming soon</a>
            <a class="font-semibold h-12 text-base" href="/drops/claimed"${url.includes('claimed') ? ' data-state="active"' : ''}>Claimed</a>
            <a class="font-semibold h-12 text-base" href="/drops/expired"${url.includes('expired') ? ' data-state="active"' : ''}>Expired</a>
          </div>
          ${body}
        </div>
      </div>
    </main></body></html>`;
}

// `lateHtml` monta el panel de Kick DESPUES de arrancar, a los `lateMs`. Reproduce lo
// que se ve al volver a reclamados: el script ya corrio y el panel todavia no estaba, asi
// que la rejilla no tenia de donde colgarse. Sin esto no hay forma de distinguir "no se
// pinta nunca" de "se pinta cuando puede".
function run({ url, panels, waitMs = 6000, apiCampaigns = null, progress = null, seed = {}, lateHtml = null, lateMs = 4000, snapAt = {}, clickPaneCard = null, clickPaneCards = null, navigateTo = null }) {
    const vc = new VirtualConsole();
    const logs = [];
    vc.on('jsdomError', e => logs.push('jsdomError: ' + e.message));
    vc.on('error', (...a) => logs.push('error: ' + a.join(' ')));
    vc.on('warn', (...a) => logs.push('warn: ' + a.join(' ')));

    const dom = new JSDOM(page({ url, panels }), {
        url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
    });
    const w = dom.window;

    const store = new Map(Object.entries(seed));
    w.GM_getValue = (k, d) => (store.has(k) ? store.get(k) : d);
    w.GM_setValue = (k, v) => store.set(k, v);
    w.GM_deleteValue = k => store.delete(k);
    w.GM_notification = () => { };
    w.GM_xmlhttpRequest = () => { };
    w.Audio = function () { return { play() { }, pause() { }, volume: 0 }; };
    w.AudioContext = function () { return { createOscillator: () => ({ connect() { }, start() { }, stop() { } }), createGain: () => ({ connect() { }, gain: { value: 0 } }), destination: {}, currentTime: 0 }; };
    // Un solo stub para las dos rutas: cada una devuelve su payload. El
    // interceptor del script distingue por pathname, igual que en el navegador.
    w.fetch = async (u) => {
        const href = String(u && u.url ? u.url : u);
        const isProgress = href.includes('/api/v1/drops/progress');
        const payload = isProgress ? (progress || []) : (apiCampaigns || []);
        const ok = isProgress ? !!progress : !!apiCampaigns;
        return {
            ok, status: ok ? 200 : 404,
            clone() { return this; },
            json: async () => ({ data: payload })
        };
    };

    // jsdom no implementa scrollIntoView. Se define para anotar A QUE se hizo scroll.
    //
    // Se registra el texto del ELEMENTO, sin subir a su contenedor. Subiendo al grupo
    // marcado —que fue el primer intento— una sub-campaña y su juego dan exactamente el
    // mismo texto, asi que un test que quiera distinguirlos no puede: pasaria igual
    // enfocando la tarjeta correcta que el bloque entero.
    const scrolls = [];
    // Y aparte, COMO se hizo el scroll. Solo con el texto no se distingue un titulo
    // puesto arriba de un titulo centrado, y centrarlo es lo que lo mandaba a la mitad
    // de la pantalla —o fuera de ella, si el bloque es alto—. El margen tambien cuenta:
    // la cabecera de Kick es fija y sin el, "arriba del todo" queda debajo de ella.
    const scrollDetalles = [];
    w.Element.prototype.scrollIntoView = function (opts) {
        scrolls.push((this.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60));
        scrollDetalles.push({
            etiqueta: this.tagName,
            block: (opts && opts.block) || '(por defecto)',
            margenArriba: this.style.scrollMarginTop || ''
        });
    };

    // Los enlaces de pestaña se pulsan de verdad (link.click()); jsdom no navega, asi
    // que se anota el destino para poder comprobar A QUE pestaña te manda.
    const tabClicks = [];
    w.document.addEventListener('click', e => {
        const a = e.target && e.target.closest && e.target.closest('a[href]');
        if (a) tabClicks.push(a.getAttribute('href'));
    }, true);

    // jsdom no trae portapapeles. Se captura lo copiado para poder comprobar el
    // TEXTO que se comparte, no solo que el boton exista.
    const copied = [];
    Object.defineProperty(w.navigator, 'clipboard', {
        value: { writeText: async (txt) => { copied.push(txt); } },
        configurable: true
    });

    try { w.eval(SCRIPT); } catch (e) { logs.push('THROW en eval: ' + e.stack); }
    // La propia pagina de Kick pide /drops/progress con su Bearer; asi es como el
    // script se enterra de lo reclamado. Se reproduce ese fetch para ejercitar el
    // interceptor de verdad y no un atajo.
    if (progress) {
        w.fetch('https://web.kick.com/api/v1/drops/progress',
            { headers: { Authorization: 'Bearer test' } });
    }
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    w.dispatchEvent(new w.Event('load'));

    if (lateHtml) {
        setTimeout(() => {
            const host = w.document.querySelector('.flex.flex-col.gap-5');
            if (host) host.innerHTML = lateHtml;
        }, lateMs);
    }

    // Fotos del panel a mitad de vuelo. Sin esto solo se puede comprobar el estado
    // final, y hay cosas —un cartel de "estoy trabajando"— cuyo fallo es justamente
    // no haber existido nunca: al final no se ven ni cuando funcionan.
    const snaps = {};
    const banner = () => {
        const el = w.document.getElementById('kick-drops-api-loading');
        if (!el) return { existe: false };
        const label = el.querySelector('.kick-api-loading-text');
        return {
            existe: true,
            visible: el.style.display !== 'none',
            texto: label ? label.textContent : null
        };
    };
    for (const [nombre, ms] of Object.entries(snapAt)) {
        setTimeout(() => { snaps[nombre] = banner(); }, ms);
    }

    // Cambia de pestaña SIN recargar, que es lo que hace Kick: pushState + el DOM nuevo
    // en su sitio. Es la unica forma de probar lo que solo se rompe navegando; entrando
    // por la URL directa el arranque hace lo correcto y tapa el fallo.
    if (navigateTo) {
        setTimeout(() => {
            const host = w.document.querySelector('.flex.flex-col.gap-5');
            if (host) host.innerHTML = navigateTo.html || '';
            w.history.pushState({}, '', navigateTo.url);
        }, navigateTo.at || 6000);
    }

    // Pulsa VARIAS tarjetas por su titulo, una detras de otra. Hace falta para poder
    // comparar a donde lleva cada una: con una sola no se distingue "enfoco lo suyo"
    // de "enfoca siempre lo mismo".
    if (clickPaneCards) {
        setTimeout(() => {
            for (const titulo of (clickPaneCards.titles || [])) {
                const card = w.document.querySelector(
                    `#kick-drops-${clickPaneCards.pane}-pane [data-notif-title="${titulo}"]`);
                if (card && card.onclick) card.onclick(new w.Event('click'));
            }
        }, clickPaneCards.at || 4000);
    }

    // Pulsa una tarjeta del panel como lo haria el usuario, ya con todo pintado.
    if (clickPaneCard) {
        setTimeout(() => {
            const card = w.document.querySelector(
                `#kick-drops-${clickPaneCard.pane}-pane [data-notif-title]`);
            if (card && card.onclick) card.onclick(new w.Event('click'));
        }, clickPaneCard.at || 4000);
    }

    return new Promise(resolve => {
        setTimeout(() => {
            const d = w.document;
            const matches = Array.from(d.querySelectorAll('[id^="drop-match-"]')).map(n => ({
                id: n.id,
                hidden: (() => { for (let e = n; e && e !== d.body; e = e.parentElement) if (e.style && e.style.display === 'none') return true; return false; })(),
                isGroup: n.classList.contains('rounded-2xl'),
                isCard: n.classList.contains('border-outline-decorative'),
                styled: /border: 4px solid/.test(n.getAttribute('style') || '') ||
                    /border: 4px solid/.test((n.querySelector('[style*="border: 4px solid"]') ? 'x' : '')),
                borderColor: ((n.getAttribute('style') || '').match(/border: 4px solid (#\w+)/) || [])[1] || null,
                title: (n.querySelector('h2.font-bold') || {}).textContent
            }));
            const paneCards = pane => Array.from(d.querySelectorAll(`#kick-drops-${pane}-pane [data-notif-title]`))
                .map(c => {
                    const shareBtn = c.querySelector('.drop-share-btn');
                    return {
                        title: c.getAttribute('data-notif-title'),
                        text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 160),
                        // Las etiquetas de keyword no llevan marca propia en el DOM, asi
                        // que se localizan por su forma. El badge de recompensas se pinta
                        // con el MISMO redondeo y tamaño, y se distingue porque siempre
                        // lleva `title` (el tiempo que pide, o "Reclamados"); la etiqueta
                        // de keyword nunca lo lleva.
                        chips: Array.from(c.querySelectorAll('span[style*="border-radius: 8px"]:not([title])'))
                            .map(s => s.textContent),
                        share: !!shareBtn,
                        shareText: shareBtn ? shareBtn.title : null,
                        // Pulsa el 🔗 de ESTA tarjeta y devuelve lo que quedo en el
                        // portapapeles. Se llama desde el test, ya con el panel pintado.
                        clickShare: () => {
                            if (!shareBtn) return null;
                            shareBtn.onclick(new w.Event('click'));
                            return copied[copied.length - 1] || null;
                        }
                    };
                });
            const tabLabel = id => {
                const el = d.getElementById('kick-drops-tab-' + id);
                return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
            };
            resolve({
                logs,
                snaps,
                banner: banner(),
                scrolls,
                scrollDetalles,
                tabClicks,
                paneles: d.querySelectorAll("#kick-drops-panel").length,
                stored: Object.fromEntries(store),
                matches,
                copied,
                tabLabels: {
                    active: tabLabel('active'),
                    upcoming: tabLabel('upcoming'),
                    expired: tabLabel('expired')
                },
                active: paneCards('active'),
                upcoming: paneCards('upcoming'),
                expired: paneCards('expired'),
                pageMarks: Array.from(d.querySelectorAll('.kick-drop-page-mark')).map(e => e.textContent),
                hideButtons: d.querySelectorAll('button[data-kick-injected], button[data-kickinjected]').length,
                xButtons: Array.from(d.querySelectorAll('button')).filter(b => b.textContent === '❌').length,
                claimedGrid: !!d.getElementById('kick-claimed-inventory'),
                claimedGridCards: d.querySelectorAll('#kick-claimed-inventory img').length,
                hiddenGroups: Array.from(d.querySelectorAll('.bg-surface-base.rounded-2xl'))
                    .map(n => ({ display: n.style.display, id: n.id || null })),
                gridTitle: (d.querySelector('#kick-claimed-inventory h1') || {}).textContent || null,
                gridHidden: (() => {
                    const g = d.getElementById('kick-claimed-inventory');
                    if (!g) return null;
                    for (let e = g; e && e !== d.body; e = e.parentElement) if (e.style && e.style.display === 'none') return true;
                    return false;
                })(),
                visibleClaimedCards: Array.from(d.querySelectorAll('.border-outline-decorative'))
                    .filter(n => { for (let e = n; e && e !== d.body; e = e.parentElement) if (e.style && e.style.display === 'none') return false; return true; }).length
            });
        }, waitMs);
    });
}

module.exports = { run, readFixture: f => fs.readFileSync(path.join(HERE, f), 'utf8') };
