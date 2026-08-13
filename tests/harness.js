// Arranca el userscript dentro de jsdom sobre un DOM de Kick y devuelve lo que
// dejo pintado. Se comprueban EFECTOS observables (ids drop-match-*, bordes,
// tarjetas del panel), no funciones internas: son las que ve el usuario.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SCRIPT = fs.readFileSync(
    '/Users/usuario/code/scripts/kick-drops-highlighter/kick-drops-highlighter.user.js', 'utf8');
const HERE = __dirname;

function page({ url, panels }) {
    // `panels`: [{ hidden: bool, html }] en orden. Kick deja montadas las
    // pestañas inactivas con display:none !important.
    const body = panels.map(p =>
        `<div class="flex w-full flex-col"${p.hidden ? ' style="display: none !important;"' : ' style=""'}>
            <div class="h-full flex-1"><div class="flex flex-col gap-5">${p.html}</div></div>
        </div>`).join('\n');

    // La barra lateral de Kick, FUERA del <main>. Va en todos los tests a proposito:
    // es lo que hay de verdad en la pagina, y lo que se coló en el panel el 2026-08-07
    // —una tarjeta "AverageAden" y un borde verde sobre un canal recomendado— cuando
    // la pestaña de campañas estaba vacia. Reproduce las dos formas que enganchaban:
    //   - el item "Drops" del menu, que lleva el MISMO data-state que la pestaña activa
    //     (ya estaba documentado en el script, ver _kindOfPath).
    //   - una tarjeta de canal con `bg-surface-base` y un nombre en `font-bold`, que es
    //     todo lo que processCampaignNode necesita para darla por campaña. Y el nombre
    //     casa con la keyword `rage` por dentro ("Ave-rage-Aden"), asi que si se lee,
    //     se ve.
    const sidebar = `
    <div class="fixed left-0 flex w-60 flex-col gap-2" id="kick-sidebar-falsa">
      <a href="/" class="font-semibold">Inicio</a>
      <a href="/drops" data-state="active" class="font-semibold">Drops</a>
      <p class="text-xs">Recomendado</p>
      <a href="/averageaden" data-state="closed" class="bg-surface-base flex items-center gap-2">
        <img alt="AverageAden" src="https://files.kick.com/images/user/1/avatar.webp">
        <span class="text-sm font-bold">AverageAden</span>
        <span class="text-xs">Slots &amp; Casino</span>
      </a>
      <a href="/guishorro" data-state="closed" class="bg-surface-base flex items-center gap-2">
        <img alt="Guishorro" src="https://files.kick.com/images/user/2/avatar.webp">
        <span class="text-sm font-bold">Guishorro</span>
        <span class="text-xs">Counter-Strike 2</span>
      </a>
    </div>`;

    return `<!doctype html><html lang="es"><head><title>Drops</title></head><body>
    ${sidebar}
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
async function run({ url, panels, waitMs = 6000, apiCampaigns = null, progress = null, challenges = null, challengesRefetch = null, seed = {}, lateHtml = null, lateMs = 4000, snapAt = {}, clickPaneCard = null, clickPaneCards = null, navigateTo = null, addKeyword = null }) {
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
    // GM_xmlhttpRequest responde SOLO al endpoint de retos, y es a proposito: es el unico
    // que el script pide por esta via cuando necesita refrescarlo —el relevo de ventana de
    // las 18:00—. Implementarlo tambien para /drops/progress cambiaria el camino de los
    // tests de reclamados, que hoy entran por el interceptor de fetch.
    //
    // Devuelve `challengesRefetch` si el test lo da: por aqui solo se pasa cuando el reto
    // guardado ya no vale, asi que servir el mismo de antes no probaria nada.
    w.GM_xmlhttpRequest = (opts) => {
        const u = String((opts && opts.url) || '');
        if (!u.includes('/api/v1/gamification/challenges')) return;
        const payload = challengesRefetch || challenges;
        setTimeout(() => {
            if (!payload) { if (opts.onerror) opts.onerror(new Error('sin datos')); return; }
            if (opts.onload) opts.onload({ status: 200, responseText: JSON.stringify({ data: payload }) });
        }, 10);
    };
    // Se cuentan los pitidos. Hace falta para poder distinguir "suena" de "suena en
    // bucle": el aviso de drops repite cada 5 s y el de la racha tiene que sonar UNA vez,
    // y sin contarlos las dos cosas se ven igual.
    const beeps = [];
    w.Audio = function () { return { play() { beeps.push(Date.now()); }, pause() { }, volume: 0 }; };
    w.AudioContext = function () { return { createOscillator: () => ({ connect() { }, start() { }, stop() { } }), createGain: () => ({ connect() { }, gain: { value: 0 } }), destination: {}, currentTime: 0 }; };
    // Un solo stub para las dos rutas: cada una devuelve su payload. El
    // interceptor del script distingue por pathname, igual que en el navegador.
    w.fetch = async (u) => {
        const href = String(u && u.url ? u.url : u);
        const isProgress = href.includes('/api/v1/drops/progress');
        const isChallenges = href.includes('/api/v1/gamification/challenges');
        const payload = isChallenges ? (challenges || [])
            : isProgress ? (progress || []) : (apiCampaigns || []);
        const ok = isChallenges ? !!challenges
            : isProgress ? !!progress : !!apiCampaigns;
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

    // ARRANCAR EL SCRIPT UNA SOLA VEZ, y de forma determinista.
    //
    // TODO el script vive dentro de un `addEventListener("load", ...)`. jsdom lanza su
    // propio `load`, asi que el arnes tenia dos fuentes para el mismo evento y el script
    // arrancaba DOS VECES, con dos juegos completos de variables. No se notaba —el panel
    // no se duplica, porque se busca por id— hasta que un contador propio de cada arranque
    // (los pitidos de la racha) empezo a contar el doble.
    //
    // Quitar el sintetico y esperar al de jsdom tampoco vale: cuando el bucle de eventos
    // lleva encima los temporizadores de los casos anteriores, ese `load` puede llegar
    // despues de que el test ya haya mirado, y entonces el caso sale vacio sin que nada
    // este roto. Se vio corriendo los 13 seguidos: el primero pasaba y el resto no.
    //
    // Asi que se espera a que jsdom TERMINE de cargar —con nadie escuchando todavia—, y
    // solo entonces se evalua el script y se dispara un unico `load`. El orden lo decide
    // el arnes y no el bucle de eventos.
    await new Promise(res => {
        if (w.document.readyState === 'complete') return res();
        w.addEventListener('load', () => res(), { once: true });
    });

    try { w.eval(SCRIPT); } catch (e) { logs.push('THROW en eval: ' + e.stack); }
    // La propia pagina de Kick pide /drops/progress con su Bearer; asi es como el
    // script se enterra de lo reclamado. Se reproduce ese fetch para ejercitar el
    // interceptor de verdad y no un atajo.
    if (progress) {
        w.fetch('https://web.kick.com/api/v1/drops/progress',
            { headers: { Authorization: 'Bearer test' } });
    }
    // Igual con el reto diario: la pagina de Kick pide este endpoint para su modal del
    // cofre, y el script lo aprovecha por el interceptor en vez de pedirlo aparte. Se
    // reproduce esa peticion —no se inyecta el dato— para que el test pase por el mismo
    // camino que el navegador.
    if (challenges) {
        w.fetch('https://web.kick.com/api/v1/gamification/challenges',
            { headers: { Authorization: 'Bearer test' } });
    }
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    // El unico `load` que ve el script (ver el comentario largo de arriba): el de jsdom
    // ya paso mientras nadie escuchaba.
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

    // Añade una keyword como lo haria el usuario: el «+» del panel, escribir en el modal
    // y aceptar. Es la unica puerta a removeNotificationsNotInKeywords, que se llama en
    // cada alta —tambien de una keyword que no tiene nada que ver— y decide que avisos
    // sobreviven. Sin poder pulsarla, ese camino solo se puede revisar leyendolo.
    //
    // El `location.reload()` que viene despues deja un "Not implemented: navigation" en
    // los logs de jsdom; es ruido esperado y no afecta a lo que se comprueba, que ya
    // esta guardado para entonces.
    if (addKeyword) {
        setTimeout(() => {
            // El «+» es un <span>, no un <button>: la fila de keywords se pinta con chips.
            // (Hay ademas un getAddKeyword() que construye un <button> «+», pero no lo
            // llama nadie; buscar por etiqueta era buscar el que no se usa.)
            const mas = Array.from(w.document.querySelectorAll('#kick-drops-panel span, #kick-drops-panel button'))
                .find(b => (b.textContent || '').trim() === '+');
            if (!mas) return;
            mas.onclick ? mas.onclick(new w.Event('click')) : mas.click();
            setTimeout(() => {
                const input = w.document.querySelector('input[type="text"]');
                if (!input) return;
                input.value = addKeyword.value || '';
                const ok = Array.from(w.document.querySelectorAll('button'))
                    .find(b => /aceptar|accept/i.test((b.textContent || '').trim()));
                if (ok && ok.onclick) ok.onclick(new w.Event('click'));
            }, 200);
        }, addKeyword.at || 8000);
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
            // Todo lo que el script tocó FUERA del <main> de drops: ids drop-match-*,
            // marcas de pagina, bordes de colores y bloques escondidos. Lo nuestro
            // (el panel flotante) no cuenta: vive colgado del body a proposito.
            const fueraDelMain = (() => {
                const main = d.querySelector('main');
                const tocados = Array.from(d.querySelectorAll(
                    '[id^="drop-match-"], .kick-drop-page-mark, [style*="border: 4px solid"], [data-kick-hidden]'));
                return tocados
                    .filter(n => !main || !main.contains(n))
                    .filter(n => !n.closest('#kick-drops-panel'))
                    .map(n => ({
                        id: n.id || null,
                        texto: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
                    }));
            })();

            // La tira del recordatorio de racha: si se ve y con que texto. El texto
            // importa tanto como la visibilidad —los numeros salen de la API y una
            // sustitucion mal hecha deja el «{done}» a la vista—.
            const racha = (() => {
                const el = d.getElementById('kick-drops-daily-reminder');
                if (!el) return { existe: false };
                const label = el.querySelector('.kick-daily-reminder-text');
                return {
                    existe: true,
                    visible: el.style.display !== 'none',
                    texto: label ? label.textContent : null,
                    // Pulsa la × y devuelve lo que quedo guardado, para poder comprobar
                    // que el silencio se ata a la ventana del reto y no a la fecha.
                    //
                    // Espera antes de mirar: la limpieza del titulo va con 1 s de retraso a
                    // proposito (para no borrar un titulo que la SPA acabe de cambiar), asi
                    // que leyendolo al instante siempre saldria con la marca todavia puesta.
                    cerrar: () => new Promise(res => {
                        const x = Array.from(el.querySelectorAll('span'))
                            .find(s => s.textContent === '✕');
                        if (x && x.onclick) x.onclick();
                        setTimeout(() => res({
                            visible: el.style.display !== 'none',
                            guardado: store.get('kick_daily_streak_reminded_window') || null,
                            titulo: w.document.title
                        }), 1300);
                    })
                };
            })();

            resolve({
                logs,
                snaps,
                // Para diagnosticar los ganchos que pulsan cosas: que botones hay de
                // verdad en el panel y que campos de texto quedaron abiertos.
                botonesPanel: Array.from(d.querySelectorAll('#kick-drops-panel button'))
                    .map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 20),
                inputsEnPagina: d.querySelectorAll('input[type="text"]').length,
                racha,
                beeps: beeps.length,
                titulo: d.title,
                fueraDelMain,
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
