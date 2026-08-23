// Arranca el userscript dentro de jsdom sobre un DOM de Kick y devuelve lo que
// dejo pintado. Se comprueban EFECTOS observables (ids drop-match-*, bordes,
// tarjetas del panel), no funciones internas: son las que ve el usuario.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// `KICK_SCRIPT` apunta a OTRO fichero. Es para las comprobaciones de sensibilidad:
// correr el mismo test contra una copia sin el arreglo y ver que falla. Sin eso, un
// test nuevo puede estar en verde por no comprobar nada.
const SCRIPT = fs.readFileSync(process.env.KICK_SCRIPT ||
    '/Users/usuario/code/scripts/kick-drops-highlighter/kick-drops-highlighter.user.js', 'utf8');
const HERE = __dirname;

const readFixture = f => fs.readFileSync(path.join(HERE, f), 'utf8');

function page({ url, panels, cofre }) {
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

    // EL COFRE, QUE NO ESTA EN EL MISMO SITIO SEGUN EL ANCHO. Fuera del <main>, asi que
    // solo lo montan los tests que lo piden: en los volcados de `docs/` de escritorio no
    // sale. Cuatro variantes, y las diferencias son las que deciden quien puede reclamar:
    //   'disponible'    el video `reward-available-CTA` en el boton del navbar. Es la
    //                   unica señal que mira el automatico en escritorio.
    //   'cuenta'        el mismo boton en cuenta atras. El automatico se abstiene y el
    //                   boton de la tarjeta NO, que es justo lo que hay que distinguir.
    //   'movil'         no hay boton en la barra: Kick baja el cofre a una fila del menu
    //                   de la cuenta, un <button> pelado —sin aria-haspopup y sin video—
    //                   con el mismo icono en SVG. Aqui el menu ya esta ABIERTO.
    //   'movil-cerrado' el caso de verdad, el que se encuentra cualquiera: solo esta el
    //                   avatar de la barra, y la fila NO EXISTE en el DOM hasta que se
    //                   pulsa. Verificado en `docs/mobile-mode.mhtml`: con el menu cerrado
    //                   no hay ni una ocurrencia del icono del cofre.
    // El marcado de las dos de movil es el del volcado, recortado a `fixture-menu-movil`
    // y `fixture-navbar-account` y saneado de la cuenta (avatar por defecto). Se usa el
    // real y no uno a mano porque el menu trae DIEZ filas mas —ajustes, idioma, cerrar
    // sesion— y la fila del cofre no es la primera: si el buscador se agarrara a la
    // posicion, con un menu inventado de dos filas no se notaria.
    const menuMovil = () => readFixture('fixture-menu-movil.html');
    const avatar = () => `<div class="fixed top-0 flex w-full" id="kick-barra-falsa">${readFixture('fixture-navbar-account.html')}</div>`;
    const barra = !cofre ? '' :
        cofre === 'movil' ? avatar() + menuMovil() :
        cofre === 'movil-cerrado' ? avatar() : `
    <div class="fixed top-0 flex w-full" id="kick-barra-falsa">
      <button aria-haspopup="dialog" aria-label="Daily reward">
        <video src="https://static.kick.com/rewards/${cofre === 'disponible' ? 'reward-available-CTA' : 'reward-countdown'}.webm"></video>
      </button>
    </div>`;

    return `<!doctype html><html lang="es"><head><title>Drops</title></head><body>
    ${barra}
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
async function run({ url, panels, waitMs = 6000, apiCampaigns = null, progress = null, challenges = null, challengesRefetch = null, seed = {}, lateHtml = null, lateMs = 4000, snapAt = {}, clickPaneCard = null, clickPaneCards = null, navigateTo = null, addKeyword = null, hover = null, clickDrop = null, casilla = null, cofre = null, clickCofre = null, clickTarjetaCofre = null, dejarAbierta = false }) {
    const vc = new VirtualConsole();
    const logs = [];
    vc.on('jsdomError', e => logs.push('jsdomError: ' + e.message));
    vc.on('error', (...a) => logs.push('error: ' + a.join(' ')));
    vc.on('warn', (...a) => logs.push('warn: ' + a.join(' ')));

    const dom = new JSDOM(page({ url, panels, cofre }), {
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
    // Y los BOTONES pulsados, por su aria-label. Es lo unico con lo que se puede
    // comprobar la reclamacion automatica: el script pulsa el boton de Kick y en jsdom
    // eso no tiene ningun efecto visible, asi que sin anotarlo el caso pasa igual
    // reclamando que sin reclamar.
    const botonesPulsados = [];
    w.document.addEventListener('click', e => {
        const a = e.target && e.target.closest && e.target.closest('a[href]');
        if (a) tabClicks.push(a.getAttribute('href'));
        const b = e.target && e.target.closest && e.target.closest('button');
        if (b) botonesPulsados.push(b.getAttribute('aria-label') || (b.textContent || '').trim());
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
    // La foto lleva el cartel Y el estado de la rejilla de reclamados. Lo segundo es
    // lo unico con lo que se puede ver un fallo que solo existe A MITAD de camino: la
    // rejilla colandose en OTRA pestaña vive hasta que se vuelve a reclamados, y para
    // entonces el informe final ya la ve donde tiene que estar.
    const foto = () => Object.assign(banner(), {
        rejillas: w.document.querySelectorAll('#kick-claimed-inventory').length,
        // Los filtros por juego de Kick (All / Rust / PUBG…). Se cuentan los que se ven,
        // porque el arreglo es esconderlos SOLO en reclamados: en cerradas siguen
        // sirviendo y tienen que quedarse.
        filtros: Array.from(w.document.querySelectorAll('main [role="group"]'))
            .filter(g => g.querySelector('[role="radio"]'))
            .filter(g => {
                for (let e = g; e && e !== w.document.body; e = e.parentElement) {
                    if (e.style && e.style.display === 'none') return false;
                }
                return true;
            }).length,
        // El `display` inline de cada grupo de Kick, en orden. Es la huella de lo que
        // escondimos nosotros, y lo que dice si una pestaña se quedo en blanco.
        grupos: Array.from(w.document.querySelectorAll('.bg-surface-base.rounded-2xl'))
            .map(n => n.style.display || ''),
        ruta: w.location.pathname
    });
    for (const [nombre, ms] of Object.entries(snapAt)) {
        setTimeout(() => { snaps[nombre] = foto(); }, ms);
    }

    // Cambia de pestaña SIN recargar, que es lo que hace Kick: pushState + el DOM nuevo
    // en su sitio. Es la unica forma de probar lo que solo se rompe navegando; entrando
    // por la URL directa el arranque hace lo correcto y tapa el fallo.
    //
    // Acepta un paso o una lista de pasos, para poder hacer el viaje de ida y vuelta:
    // hay fallos que solo aparecen al VOLVER, y con un solo salto no se ven.
    //
    // `reactSwap` es la diferencia importante. Con `innerHTML` se borra el contenedor
    // entero, y eso se lleva por delante tambien lo que inyecta el script, asi que el
    // arnes limpiaba solito el desorden que venia a buscar. React no hace eso: solo
    // reemplaza LOS HIJOS QUE MONTO EL, y los ajenos se quedan donde estaban. De ahi el
    // fallo del 2026-08-22 —la rejilla de reclamados colgando bajo el contenido de
    // cerradas—, que con el modo viejo pasaba en verde.
    if (navigateTo) {
        const pasos = Array.isArray(navigateTo) ? navigateTo : [navigateTo];
        pasos.forEach((paso, i) => {
            setTimeout(() => {
                const host = w.document.querySelector('.flex.flex-col.gap-5');
                if (host) {
                    if (paso.reactSwap) {
                        // El modelo: React REUTILIZA los nodos que coinciden en tipo y
                        // posicion, asi que los envoltorios de Kick sobreviven al cambio
                        // de pestaña y lo que hayamos inyectado dentro de uno se queda
                        // con el. Se reproduce sacando lo nuestro, cambiando el contenido
                        // de Kick y volviendo a colgarlo.
                        //
                        // Es un MODELO y no una grabacion: borrar el envoltorio —el
                        // primer intento— hacia el trabajo de limpieza que se venia a
                        // comprobar, y el test pasaba igual con el fallo dentro. Lo que
                        // NO reproduce es el `display:none` que se queda en un nodo de
                        // Kick reutilizado; aqui esos nodos son nuevos.
                        const mios = Array.from(host.querySelectorAll('[id^="kick-"]'));
                        host.innerHTML = paso.html || '';
                        mios.forEach(n => host.appendChild(n));
                    } else {
                        host.innerHTML = paso.html || '';
                    }
                }
                // La barra de pestañas se mueve con el contenido, que es lo que hace
                // Kick: el subrayado no espera a la URL. Sin esto no se puede ejercitar
                // la comprobacion que mira la barra ademas de la ruta.
                for (const a of w.document.querySelectorAll('main a[href^="/drops/"]')) {
                    if (a.getAttribute('href') === paso.url.replace(/^https?:\/\/[^/]+/, '')) {
                        a.setAttribute('data-state', 'active');
                    } else {
                        a.removeAttribute('data-state');
                    }
                }
                w.history.pushState({}, '', paso.url);
            }, paso.at || (6000 + i * 6000));
        });
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
    // ---------------------------------------------
    // APUNTAR A UN CONTROL Y MIRAR SU AVISO
    // ---------------------------------------------
    // La caja del script tiene un cuarto de segundo de retardo a proposito, asi que
    // no se lee en el mismo tick que el mouseover. Y se cierra ENTRANDO EN OTRO
    // elemento sin aviso, que es como lo hace el motor (no usa mouseout), asi el test
    // recorre el mismo camino que un raton de verdad.
    //
    // Lo que se mira de cada caso es lo observable: si la caja se ve, con que texto y
    // con que peso, y que el `title` del control se guarde mientras esta arriba y
    // vuelva al salir — porque ese atributo es el respaldo y el nombre accesible.
    const tip = { casos: [] };
    if (hover) {
        const sels = hover.sels || [hover.sel];
        sels.forEach((sel, i) => {
            setTimeout(() => {
                const el = w.document.querySelector(sel);
                if (!el) { tip.casos.push({ sel, error: 'no existe' }); return; }
                el.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
                setTimeout(() => {
                    const box = w.document.getElementById('kick-drops-tip');
                    const caso = {
                        sel,
                        visible: !!box && box.style.opacity === '1',
                        texto: box ? box.textContent.replace(/\s+/g, ' ').trim() : null,
                        peso: box ? box.style.fontWeight : null,
                        anclada: box ? { left: box.style.left, top: box.style.top } : null,
                        tituloMientras: el.getAttribute('title'),
                        guardado: el.getAttribute('data-kick-tip')
                    };
                    // Salir del control: el <body> no lleva aviso, asi que cierra.
                    w.document.body.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
                    setTimeout(() => {
                        caso.visibleDespues = !!box && box.style.opacity === '1';
                        caso.tituloDespues = el.getAttribute('title');
                        caso.guardadoDespues = el.getAttribute('data-kick-tip');
                        tip.casos.push(caso);
                    }, 60);
                }, 400);
            }, (hover.at || 12000) + i * 800);
        });
    }

    // LO QUE HACE KICK CUANDO SE PULSA. Dos gestos, y los dos por DELEGACION en
    // `document` y no enganchados al nodo: en movil el menu no existe al montar la
    // pagina, asi que su fila no se puede enganchar todavia.
    //
    //   · el AVATAR de la barra monta el menu de la cuenta. Con retardo a proposito
    //     (120 ms): React no lo pinta en el mismo turno del clic, y preguntar por la
    //     fila justo despues de pulsar devuelve null siempre. Sin ese retardo el test
    //     pasaria con un script que no sondeara.
    //   · el COFRE —el boton del navbar o la fila del menu— abre el modal, con el boton
    //     primario de reclamar dentro. Se reproduce porque la secuencia de reclamo son
    //     DOS clics y sin el segundo no hay forma de ver si se llego a reclamar. Tarda
    //     150 ms por lo mismo.
    //
    // En movil el modal NO es el dialogo Radix de escritorio, es un drawer de vaul, y se
    // monta como tal (`data-vaul-drawer-direction`). Lleva dentro el icono del cofre, que
    // es como lo reconoce el script sin depender del idioma. Y el menu se queda ABIERTO
    // debajo, como lo deja Kick.
    if (cofre) {
        const esMovil = cofre === 'movil' || cofre === 'movil-cerrado';
        const ICONO_COFRE = 'M6 7.33301H8.63965V9.33301L11 10.666L13.333 9.33301V7.33301H16V14.666H6V7.33301Z' +
            'M15.1201 2.41602L16 3.33301V5.33301H6V3.33301L5.12012 2.41602L4.08008 1.33301H14L15.1201 2.41602Z';
        w.document.addEventListener('click', (e) => {
            const b = e.target && e.target.closest && e.target.closest('button');
            if (!b) return;

            if (b.getAttribute('data-testid') === 'navbar-account') {
                if (w.document.querySelector('.z-modal')) return;
                setTimeout(() => {
                    const cont = w.document.createElement('div');
                    cont.innerHTML = readFixture('fixture-menu-movil.html');
                    while (cont.firstChild) w.document.body.appendChild(cont.firstChild);
                }, 120);
                return;
            }

            // El cofre, este donde este. Lo nuestro no cuenta: la baldosa lleva el mismo
            // cofre como imagen y su boton propio ya tiene su camino.
            if (b.closest('#kick-drops-panel, #kick-claimed-inventory')) return;
            const svg = b.querySelector('svg path[d^="M6 7.33301"]');
            const video = b.querySelector('video[src*="static.kick.com/rewards"]');
            if (!svg && !video) return;
            if (w.document.querySelector('div[role="dialog"]')) return;
            setTimeout(() => {
                const dlg = w.document.createElement('div');
                dlg.setAttribute('role', 'dialog');
                dlg.setAttribute('data-state', 'open');
                if (esMovil) dlg.setAttribute('data-vaul-drawer-direction', 'bottom');
                dlg.innerHTML =
                    '<svg viewBox="0 0 16 16"><path d="' + ICONO_COFRE + '"></path></svg>' +
                    '<button class="bg-primary-base" aria-label="Claim daily reward">Claim</button>' +
                    '<button aria-label="Close reward dialog"><span class="sr-only">Close</span></button>';
                // El dialogo se CIERRA de verdad, por sus dos vias (la X y Escape). Hace
                // falta para que «el modal se queda abierto» sea una afirmacion: con un
                // dialogo que no se puede cerrar, el reclamo a mano y el automatico se
                // verian igual.
                dlg.querySelector('button[aria-label^="Close"]').addEventListener('click', () => dlg.remove());
                w.document.addEventListener('keydown', ev => { if (ev.key === 'Escape') dlg.remove(); });
                w.document.body.appendChild(dlg);
            }, 150);
        }, true);
    }

    // Pulsa el boton «Reclamar» de la tarjeta del cofre, como haria el usuario.
    if (clickCofre) {
        setTimeout(() => {
            const b = w.document.querySelector('#kick-daily-chest-card button');
            if (b) b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        }, clickCofre.at || 10000);
    }

    // Pulsa la BALDOSA del cofre —no su boton— como haria el usuario al hacer clic en
    // ella mientras todavia se acumula. Es otro gesto que el de arriba: aquel cobra y
    // este solo abre el modal.
    if (clickTarjetaCofre) {
        setTimeout(() => {
            const c = w.document.getElementById('kick-daily-chest-card');
            if (c) c.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        }, clickTarjetaCofre.at || 10000);
    }

    // Marca (o desmarca) una casilla del panel a mitad de sesion, como haria el usuario.
    // `el.click()` y no un `change` sintetico: en jsdom el click de un checkbox cambia
    // `checked` y dispara `change` el solo, que es exactamente el camino del navegador.
    if (casilla) {
        setTimeout(() => {
            const el = w.document.getElementById(casilla.id || 'cb-hide-expired');
            if (el) el.click();
        }, casilla.at || 10000);
    }

    // Un clic sobre un <li> de recompensa de Kick abre el modal de progreso del script.
    // Se dispara un MouseEvent de verdad y no `el.onclick`, porque el manejador se engancha
    // con addEventListener y ademas mira `e.target.closest('a, button, input')`: un evento
    // sintetico sin target real se saldria por ahi.
    //
    // El modal no tiene id —lo monta createKickModal a pelo—, asi que se reconoce por lo
    // que si es estable: hijo directo de <body>, sin id (la caja del tooltip si lo tiene) y
    // con el z-index que le pone el script.
    const modal = { abierto: false };
    if (clickDrop) {
        setTimeout(() => {
            const el = w.document.querySelector(clickDrop.sel);
            if (!el) { modal.error = 'no existe: ' + clickDrop.sel; return; }
            el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
            setTimeout(() => {
                const ov = Array.from(w.document.body.children).find(nodo =>
                    nodo.tagName === 'DIV' && !nodo.id && nodo.style && nodo.style.zIndex === '999999');
                modal.abierto = !!ov;
                if (ov) {
                    modal.texto = (ov.textContent || '').replace(/\s+/g, ' ').trim();
                    modal.imagenes = ov.querySelectorAll('img').length;
                }
            }, 250);
        }, clickDrop.at || 13000);
    }

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
                        // La ventana de fechas. Se lee aparte del texto porque hay DOS
                        // formatos y no significan lo mismo: el del DOM lleva la hora
                        // («21 ago 2026, 4:00 - …») y el que compone la API no («21 ago
                        // 2026 - …»), asi que esto tambien dice de que fuente salio la
                        // tarjeta. Es el tercer hijo de la cabecera, detras del titulo y
                        // del estudio; sin fecha no existe, y entonces vale ''.
                        fecha: (() => {
                            // Se busca la HOJA que parece una fecha, no una posicion: la
                            // cabecera de la tarjeta mete la imagen y los iconos como
                            // hermanos del bloque de texto, asi que contar hijos rompe en
                            // cuanto falta la imagen o sobra un 🔔.
                            const f = Array.from(c.querySelectorAll('div'))
                                .filter(d => d.children.length === 0)
                                .find(d => /\d{1,2}\s+\S+\s+\d{4}|\d{4}-\d{2}-\d{2}/.test(d.textContent || ''));
                            return f ? f.textContent.replace(/\s+/g, ' ').trim() : '';
                        })(),
                        // Las etiquetas de keyword no llevan marca propia en el DOM, asi
                        // que se localizan por su forma. El badge de recompensas se pinta
                        // con el MISMO redondeo y tamaño, y se distingue porque siempre
                        // lleva `title` (el tiempo que pide, o "Reclamados"); la etiqueta
                        // de keyword nunca lo lleva.
                        chips: Array.from(c.querySelectorAll('span[style*="border-radius: 8px"]:not([title])'))
                            .map(s => s.textContent),
                        // Y los badges de recompensa son los del MISMO redondeo que SI
                        // llevan `title`. Se leen aparte de las etiquetas porque dicen
                        // otra cosa: la etiqueta explica por que la tarjeta esta ahi, el
                        // badge dice que reparte la campaña y cuanto pide cada tramo.
                        badges: Array.from(c.querySelectorAll('span[style*="border-radius: 8px"][title]'))
                            .map(s => s.textContent.replace(/\s+/g, ' ').trim()),
                        // La linea de urgencia, para poder comprobar que NO sale donde no
                        // debe: en una campaña que todavia no ha abierto, «cierra en …»
                        // seria una prisa inventada.
                        urgencia: (() => {
                            const u = c.querySelector('.drop-urgency');
                            return u ? u.textContent.replace(/\s+/g, ' ').trim() : null;
                        })(),
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
                    // Desde el 2026-08-22 la racha es una fila de la pestaña 🔔 y no una
                    // tira encima del panel: sin esto, «sale el aviso» y «sale donde el
                    // usuario va a buscar las alertas» se verian igual.
                    enAlertas: !!(el.closest && el.closest('#kick-drops-notifs-pane')),
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
                        setTimeout(() => {
                            // Se vuelve a preguntar por el id en vez de mirar el nodo que
                            // teniamos: desde que la racha es una fila de la pestaña 🔔, la
                            // × repinta la pestaña y esa fila se va del documento. El nodo
                            // guardado queda desprendido y su `display` sigue diciendo
                            // 'flex', asi que preguntarle a el daba «no se escondio» con el
                            // aviso ya fuera.
                            const ahora = d.getElementById('kick-drops-daily-reminder');
                            res({
                                visible: !!(ahora && ahora.style.display !== 'none'),
                                guardado: store.get('kick_daily_streak_reminded_window') || null,
                                titulo: w.document.title
                            });
                        }, 1300);
                    })
                };
            })();

            const informe = {
                logs,
                snaps,
                // Para diagnosticar los ganchos que pulsan cosas: que botones hay de
                // verdad en el panel y que campos de texto quedaron abiertos.
                botonesPanel: Array.from(d.querySelectorAll('#kick-drops-panel button'))
                    .map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 20),
                inputsEnPagina: d.querySelectorAll('input[type="text"]').length,
                racha,
                tip,
                modal,
                beeps: beeps.length,
                titulo: d.title,
                fueraDelMain,
                banner: banner(),
                scrolls,
                scrollDetalles,
                tabClicks,
                botonesPulsados,
                paneles: d.querySelectorAll("#kick-drops-panel").length,
                stored: Object.fromEntries(store),
                matches,
                copied,
                tabLabels: {
                    active: tabLabel('active'),
                    upcoming: tabLabel('upcoming'),
                    expired: tabLabel('expired'),
                    // La solapa de alertas cuenta ahora tambien la racha del dia.
                    notifs: tabLabel('notifs')
                },
                active: paneCards('active'),
                upcoming: paneCards('upcoming'),
                expired: paneCards('expired'),
                pageMarks: Array.from(d.querySelectorAll('.kick-drop-page-mark')).map(e => e.textContent),
                // Las baldosas de recompensa de la pagina y si se ven. Es lo unico que
                // dice si el «ocultar completados» hizo algo: esconder una baldosa no
                // deja ninguna otra huella. Se mira la cadena de padres porque tambien
                // se puede esconder la tarjeta de sub-campaña entera cuando se queda sin
                // ninguna baldosa a la vista.
                // Los encabezados de la pagina y si se ven. Distingue lo que se esconde de
                // lo que se queda: con todas las baldosas fuera desaparece «Available
                // rewards» —su titulo y su fila— pero el nombre del juego y el de la
                // sub-campaña siguen ahi, que es lo que se decidio el 2026-08-22.
                encabezados: Array.from(d.querySelectorAll('main h2')).map(h => {
                    let visible = true;
                    for (let e = h; e && e !== d.body; e = e.parentElement) {
                        if (e.style && e.style.display === 'none') { visible = false; break; }
                    }
                    return { texto: (h.textContent || '').replace(/\s+/g, ' ').trim(), visible };
                }),
                recompensas: Array.from(d.querySelectorAll('main li')).map(li => {
                    const n = li.querySelector('span.line-clamp-3, [class*="font-bold"]');
                    let visible = true;
                    for (let e = li; e && e !== d.body; e = e.parentElement) {
                        if (e.style && e.style.display === 'none') { visible = false; break; }
                    }
                    return {
                        nombre: n ? (n.textContent || '').replace(/\s+/g, ' ').trim() : '',
                        visible
                    };
                }),
                hideButtons: d.querySelectorAll('button[data-kick-injected], button[data-kickinjected]').length,
                xButtons: Array.from(d.querySelectorAll('button')).filter(b => b.textContent === '❌').length,
                // La tarjeta del cofre diario. Se leen sus cuatro huecos por posicion y no
                // por clase, que las clases son de Tailwind y se repiten: hijos de la
                // tarjeta = [imagen, info, separador, pie], e info = [fila de arriba,
                // nombre]. `pie` dice CUAL de los tres estados se pinto, que es lo unico
                // que distingue «falta un rato» de «ya se puede» de «ya esta».
                cofre: (() => {
                    const card = d.getElementById('kick-daily-chest-card');
                    if (!card) return null;
                    const info = card.children[1];
                    const fila = info.children[0];
                    const pie = card.children[3];
                    const img = card.querySelector('img');
                    return {
                        izquierda: (fila.children[0].textContent || '').trim(),
                        contador: (fila.children[1].textContent || '').trim(),
                        nombre: (info.children[1].textContent || '').trim(),
                        pie: pie.querySelector('button') ? 'boton'
                            : (pie.querySelector('svg') ? 'check' : 'nota'),
                        pieTexto: (pie.textContent || '').replace(/\s+/g, ' ').trim(),
                        // El cofre incrustado se distingue de la carta que toco: la
                        // primera es un data: URI y la segunda una URL del CDN.
                        imagen: /^data:image/.test(img.getAttribute('src') || '') ? 'cofre' : (img.getAttribute('src') || ''),
                        // La barra de progreso. null cuando la baldosa no la lleva, que
                        // es lo que tiene que pasar en cuanto se puede cobrar.
                        barra: (() => {
                            const b = card.querySelector('[role="progressbar"]');
                            if (!b) return null;
                            const fill = b.firstElementChild;
                            return {
                                valor: b.getAttribute('data-value'),
                                texto: b.getAttribute('aria-valuetext'),
                                // Tiene que colgar del recuadro de la imagen, que es de
                                // donde cuelga en las baldosas de Kick.
                                enLaImagen: b.parentElement === card.children[0],
                                relleno: fill ? fill.style.transform : null
                            };
                        })(),
                        // El aviso vive en `title`, salvo mientras la caja esta arriba:
                        // entonces el motor lo guarda en `data-kick-tip`.
                        aviso: card.getAttribute('title') || card.getAttribute('data-kick-tip') || null,
                        clicable: card.style.cursor === 'pointer'
                    };
                })(),
                // Si queda un dialogo de Kick abierto. Es lo que separa el reclamo a mano
                // del automatico: el automatico cierra el modal y el de la tarjeta lo deja,
                // que es el resultado que se ha pedido al pulsar.
                dialogoAbierto: !!d.querySelector('div[role="dialog"][data-state="open"]'),
                filtrosKickVisibles: Array.from(d.querySelectorAll('main [role="group"]'))
                    .filter(g => g.querySelector('[role="radio"]'))
                    .filter(g => { for (let e = g; e && e !== d.body; e = e.parentElement) { if (e.style && e.style.display === 'none') return false; } return true; }).length,
                // El estado vacio de Kick («No claimed campaigns yet»), que solo esta en
                // la pestaña cuando no tienes ni un drop cobrado. null = no lo hay.
                estadoVacioVisible: (() => {
                    const v = d.querySelector('main [data-testid="empty-state-root"]');
                    if (!v) return null;
                    for (let e = v; e && e !== d.body; e = e.parentElement) {
                        if (e.style && e.style.display === 'none') return false;
                    }
                    return true;
                })(),
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
            };
            resolve(informe);

            // Y SE CIERRA LA VENTANA. El informe ya esta hecho —son datos planos, nada
            // que siga colgando del DOM—, y sin esto el proceso no termina nunca: el
            // script deja intervalos puestos (el barrido de la rejilla, el relevo de la
            // ventana del reto) y jsdom los mantiene vivos, asi que un test que imprime
            // «TODO OK» se queda ahi corriendo. Se veia como lentitud y no como fallo:
            // el 2026-08-22 habia catorce procesos de tests de esta sesion a la vez,
            // el mas viejo de hora y media, peleandose por la CPU con el que se acababa
            // de lanzar. Los tests que llaman a run() varias veces tambien lo agradecen,
            // que cada caso soltaba su DOM entero al terminar.
            // `dejarAbierta` es para los informes que traen ganchos VIVOS: cerrar ahi les
            // quita el DOM y el test revienta con un TypeError, no con un FALLOS. Los
            // ganchos son exactamente DOS, y conviene tenerlos apuntados porque no se
            // distinguen del resto del informe mirandolo:
            //
            //   racha.cerrar()            pulsa la × del recordatorio.
            //   <tarjeta>.clickShare()    pulsa el 🔗 de una tarjeta del panel.
            //
            // Quien pida `dejarAbierta` se queda con el proceso colgado, asi que tiene que
            // salir el mismo (`process.exit`).
            if (!dejarAbierta) { try { dom.window.close(); } catch (e) { /* ya cerrada */ } }
        }, waitMs);
    });
}

module.exports = { run, readFixture };
