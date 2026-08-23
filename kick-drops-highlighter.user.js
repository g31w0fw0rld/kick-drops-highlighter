// ==UserScript==
// @name         Kick Drops Highlighter + Keywords (Full + i18n)
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  Highlights the Kick drop campaigns matching your keywords, and lists them in a panel split into active, upcoming and expired. Rewards you own are ticked, one earned but not collected gets a gift, and every open card shows the watch time left. Sort by closing date or cheapest, trim with four filters, exclude with keywords starting with "-". Copy an open or upcoming campaign as text. Optional auto-claim of finished drops and the daily chest. Hides what you claimed. 16 languages, read-only API.
// @match        https://kick.com/drops/*
// @author       g31w0fw0rld
// @license      MIT
// @downloadURL  https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js
// @updateURL    https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      web.kick.com
// @run-at       document-start
// ==/UserScript==

(function () {
    "use strict";
    const SCRIPT_VERSION = "1.3.0";
    console.log("Kick Drops Highlighter cargado (document-start). Version:", SCRIPT_VERSION);

    // =============================================
    // CLAIMED DROPS DATA (shared between interceptor and explicit fetch)
    // =============================================
    let _interceptedClaimedCampaigns = [];
    let _interceptedAllCampaigns = []; // full /drops/progress response (claimed + in progress)
    let _claimedInventoryReady = false;
    let _progressInventoryReady = false;
    let _kickAuthToken = null;
    let _onClaimedDataReady = null; // callback set from inside load listener
    let _onProgressDataReady = null;
    let _onChallengesReady = null;
    const KICK_DROPS_PROGRESS_URL = 'https://web.kick.com/api/v1/drops/progress';

    // El reto diario del cofre (la "racha"). Es la MISMA peticion que hace la propia
    // pagina para pintar el modal, asi que casi siempre llega gratis por el interceptor
    // y solo se pide a mano si no ha pasado. Verificado con una respuesta real
    // (2026-08-11), un solo reto:
    //
    //   { condition: { progress: 0, threshold: 60, type: "watch_time_minutes" },
    //     recurrence: "daily", status: "in_progress",
    //     window: { starts_at: "2026-08-11T00:00:00Z", ends_at: "2026-08-12T00:00:00Z" },
    //     drop_table: [{ rarity, weighting } ...], id }
    //
    // Es la fuente que hacia falta y que el DOM NO da: el cofre de la barra usa el
    // mismo video `idle` cuando ya reclamaste y cuando todavia te falta tiempo, asi que
    // desde la pagina esos dos estados son indistinguibles. Aqui se distinguen solos.
    //
    // `threshold - progress` es EXACTAMENTE lo que el modal de Kick escribe en su cuenta
    // atras: con 58 de 60 el modal decia "Mirá 2 minutos más para reclamar" (comprobado
    // el 2026-08-11 con las dos cosas delante). O sea que no hay que leer ese texto
    // nunca, que es lo que interesa: esa frase esta traducida a los 16 idiomas de Kick y
    // sacarle el numero con una expresion regular seria atarse a como redacte cada uno.
    //
    // Y el `status` NO se mueve mientras acumulas: 0, 14 y 58 de 60 son los tres
    // `in_progress`. Por eso lo que apaga el aviso al llegar al umbral es comparar
    // progress con threshold, no esperar a que el status cambie de nombre.
    //
    // `window` es el dia tal y como lo cuenta Kick (UTC), no el del reloj de tu
    // maquina: se usa como clave del "ya te lo dije hoy" para que no se desfase con el
    // reto de verdad en husos donde el dia local empieza antes.
    //
    // Y no es una diferencia teorica: `ends_at` ES el plazo para reclamar que Kick
    // escribe en el modal. Con `ends_at: 2026-08-12T00:00:00Z` el modal decia "Reclamá
    // antes de 11 ago, 18:00" en UTC−6, o sea el mismo instante. Con la fecha local, el
    // dia del reto y el del calendario se habrian separado seis horas.
    const KICK_CHALLENGES_URL = 'https://web.kick.com/api/v1/gamification/challenges';
    let _kickChallenges = null;

    // Solo tratamos como "de Kick" las URLs que resuelven a kick.com. Las
    // relativas se resuelven contra la pagina, que ya es kick.com. Sin esta
    // comprobacion capturariamos el Bearer de cualquier peticion que la pagina
    // hiciera a un tercero (y lo reenviariamos a la API de Kick), y bastaria un
    // path ajeno que contuviera /api/v1/drops/progress para colarnos datos.
    // Ojo con la cadena vacia: new URL('', location.href) resuelve a la propia
    // pagina (kick.com) y daria un falso positivo.
    function _isKickUrl(url) {
        if (!url) return false;
        try {
            const h = new URL(url, location.href).hostname;
            return h === 'kick.com' || h.endsWith('.kick.com');
        } catch (e) { return false; }
    }

    // fetch acepta string, URL o Request. Con un URL, .url es undefined, asi que
    // hay que caer a String(input) para no perder el href.
    function _urlOf(input) {
        if (typeof input === 'string') return input;
        if (input == null) return '';
        return input.url || String(input);
    }

    // =============================================
    // RUTAS DE /drops (Kick rehizo la seccion en agosto de 2026)
    // =============================================
    // Antes habia dos paginas —`/drops/all-campaigns` (abiertas + proximas +
    // cerradas, en secciones separadas por <h1>) e `/drops/inventory`—. Ahora son
    // TRES pestañas con ruta propia:
    //   /drops/campaigns    -> campañas abiertas
    //   /drops/coming-soon  -> campañas proximas
    //   /drops/claimed      -> lo ya reclamado (el inventario de antes)
    // Y no hay pestaña de cerradas: las campañas que terminan desaparecen de la
    // web, asi que la pestaña "Drops Cerrados" del panel se queda sin fuente.
    //
    // Se siguen aceptando las rutas viejas ademas de las nuevas: no consta que
    // esten muertas, el cambio pudo llegar por despliegue progresivo, y cuesta
    // una entrada en la lista.
    //
    // La comparacion es por ruta COMPLETA y no por includes(): '/drops/campaigns'
    // y '/drops/all-campaigns' se contienen mutuamente por trozos, asi que un
    // includes() clasificaria la vieja como la nueva.
    const DROPS_ROUTES = {
        campaigns: ['/drops/campaigns', '/drops/all-campaigns'],
        comingSoon: ['/drops/coming-soon'],
        claimed: ['/drops/claimed', '/drops/inventory'],
        // Kick la estreno despues del rediseño: al principio las cerradas no tenian
        // pagina y solo salian en el panel, sacadas de la API.
        expired: ['/drops/expired']
    };

    function _normalizePath(path) {
        const p = String(path || '').split('?')[0].split('#')[0];
        return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
    }

    // ---------------------------------------------
    // QUE PESTAÑA ES ESTA
    // ---------------------------------------------
    // La pestaña se decide por la URL y no por el `a[data-state="active"]` del
    // DOM: el subrayado de Kick es el mismo atributo que lleva el item "Drops"
    // de la barra lateral, y confundirlos daria una seccion entera mal
    // clasificada. La URL es la fuente que ya usaba el resto del script.
    //
    // Pero NO se compara solo contra la lista de rutas escritas a mano: eso hacia
    // que el script dependiera de acertar el nombre exacto del segmento, y un
    // fallo ahi no degrada, ROMPE. Con la ruta sin reconocer, `_isClaimedPage()`
    // devuelve false en la propia pestaña de reclamados y a partir de ahi todo lo
    // que cuelga de ella se cae en silencio: el recorrido cree estar en campañas y
    // vuelve alli en vez de a donde estabas, y la rejilla de reclamados no se
    // pinta nunca porque su primera linea es un `if (!_isClaimedPage()) return`.
    //
    // Asi que la ruta conocida es solo el primer criterio; si no casa, se clasifica
    // el ULTIMO SEGMENTO por palabra clave. Eso sobrevive a un renombrado, a un
    // prefijo de idioma (/es/drops/...) y a que Kick añada o quite un guion.
    // El orden importa: se prueba de arriba abajo y la primera que case gana.
    // "expired" va ANTES que "campaigns" porque un segmento como
    // "expired-campaigns" tiene que caer del lado de cerradas.
    const TAB_SEGMENT_HINTS = {
        claimed: /claim|inventor|reclam/,
        comingSoon: /coming|soon|upcoming|proxim/,
        expired: /expir|ended|caduc|cerrad/,
        campaigns: /campaign|campan/
    };

    // Solo cuenta como ruta de pestaña la que tiene UN unico segmento despues de
    // /drops: asi el enlace a una campaña concreta (/drops/campaigns/<id>) o el
    // item "Drops" de la barra lateral no se cuelan como si fueran pestañas.
    function _dropsTabPath(path) {
        const p = _normalizePath(path);
        const parts = p.split('/');
        const i = parts.indexOf('drops');
        if (i < 0 || parts.length !== i + 2) return null;
        return p;
    }

    function _kindOfPath(path) {
        const p = _normalizePath(path || location.pathname);
        for (const kind of Object.keys(DROPS_ROUTES)) {
            if (DROPS_ROUTES[kind].includes(p)) return kind;
        }
        const tabPath = _dropsTabPath(p);
        if (!tabPath) return null;
        const seg = tabPath.split('/').pop().toLowerCase();
        for (const kind of Object.keys(TAB_SEGMENT_HINTS)) {
            if (TAB_SEGMENT_HINTS[kind].test(seg)) return kind;
        }
        return null;
    }

    // QUE PESTAÑA DICE LA PAGINA QUE ESTA DELANTE, leida de su propia barra. No
    // sustituye a la URL —el subrayado de Kick lo lleva tambien el item "Drops" de la
    // barra lateral, por eso la URL manda—: se le pregunta ADEMAS, porque cambiar de
    // pestaña sin recargar mueve las dos cosas y no a la vez. En esa rendija, un
    // repintado tardio se cree todavia en reclamados y va a colgar la rejilla del panel
    // que ya esta delante, que es el de otra pestaña.
    //
    // El ambito es `_dropsQuery`, o sea dentro del <main>, asi que la barra lateral
    // queda fuera; y `_dropsTabPath` descarta cualquier enlace que no sea de pestaña.
    function _kindOfActiveTab() {
        for (const a of _dropsQuery('a[href][data-state="active"]')) {
            let p;
            try { p = new URL(a.getAttribute('href'), location.href).pathname; }
            catch (e) { continue; }
            if (!_dropsTabPath(p)) continue;
            return _kindOfPath(p);
        }
        return null;
    }

    // Reclamados esta delante cuando lo dicen LAS DOS: la URL y la barra. Si la barra
    // todavia no esta montada no se puede preguntar, y entonces vale la URL sola —era
    // lo unico que habia hasta ahora, y sin esa salida la rejilla no se pintaria en el
    // arranque, que es justo cuando mas falta hace—.
    function _claimedTabIsFront() {
        if (!_isClaimedPage()) return false;
        const tab = _kindOfActiveTab();
        return tab === null || tab === 'claimed';
    }

    function _isCampaignsPage(path) { return _kindOfPath(path) === 'campaigns'; }
    function _isComingSoonPage(path) { return _kindOfPath(path) === 'comingSoon'; }
    function _isClaimedPage(path) { return _kindOfPath(path) === 'claimed'; }
    function _isExpiredPage(path) { return _kindOfPath(path) === 'expired'; }

    // La pestaña donde vive cada estado. Es la traduccion entre el vocabulario del
    // panel (active/upcoming/expired) y el de las rutas, y esta escrita una sola vez
    // para que no se pueda desincronizar: la usan el clic de la tarjeta, el 👁️ y el
    // enfoque despues de cambiar de pestaña.
    const TAB_OF_STATUS = {
        active: 'campaigns',
        upcoming: 'comingSoon',
        expired: 'expired'
    };

    // ---------------------------------------------
    // PESTAÑAS OCULTAS
    // ---------------------------------------------
    // El detalle que mas duele del DOM nuevo: Kick deja MONTADAS las pestañas que
    // no estan activas y solo las esconde con style="display: none !important".
    // Estando en /drops/campaigns, el DOM trae ademas el panel de proximas y el
    // de reclamados, con tarjetas de la MISMA forma que las visibles. Un
    // querySelectorAll suelto por '.bg-surface-base' mezcla las tres: campañas ya
    // reclamadas se pintarian de verde como abiertas, entrarian al panel y harian
    // sonar la alarma de "nueva campaña".
    //
    // Se mira el style INLINE y no getComputedStyle: es exactamente lo que Kick
    // escribe, no fuerza layout y no confunde con lo que este fuera del viewport.
    // `.style.display` devuelve "none" aunque venga con !important (la prioridad
    // va aparte, en getPropertyPriority).
    function _isInHiddenPanel(node) {
        for (let el = node; el && el !== document.body; el = el.parentElement) {
            if (el.style && el.style.display === 'none') return true;
        }
        return false;
    }

    // ---------------------------------------------
    // AMBITO DEL ESCANEO
    // ---------------------------------------------
    // Todo lo que se lee de la pagina se lee DENTRO del <main> de drops. Fuera de el
    // esta el resto de Kick —la barra lateral con los canales recomendados, la
    // cabecera, el buscador—, y ahi no hay campañas: lo que se encuentre es un falso
    // positivo con todas las consecuencias, porque el escaneo no solo lee, tambien
    // escribe (borde de color, id drop-match-*, 🔔, ⏳) y en la pestaña de reclamados
    // llega a esconder bloques y a pulsar botones.
    //
    // Reportado el 2026-08-07 con /drops/campaigns VACIA: el panel decia "Abiertos (1)"
    // con una tarjeta "AverageAden" y ese canal de la barra lateral salia con el borde
    // verde de campaña abierta. La cadena era esta y hace falta entenderla entera,
    // porque el fallo NO estaba en el selector que encontro el canal:
    //
    //   1. sin campañas, los dos selectores buenos (el grupo `.rounded-2xl` y el
    //      acordeon viejo) no devuelven nada;
    //   2. eso activa el barrido de respaldo por `[data-state], .bg-surface-base`, que
    //      no estaba acotado y recorria el documento ENTERO;
    //   3. en la barra lateral, el item "Drops" del menu lleva el mismo `data-state`
    //      que la pestaña activa —ya estaba documentado arriba, en _kindOfPath— y las
    //      tarjetas de canal llevan `bg-surface-base` y el nombre en `font-bold`, que
    //      es todo lo que processCampaignNode necesita para darlas por campaña;
    //   4. "AverageAden" casa con la keyword `rage` por dentro, que es el
    //      comportamiento correcto y buscado (ver _matchesKeywords), solo que aplicado
    //      donde no tocaba.
    //
    // Por eso el acotado se pone AQUI y no en el selector: el respaldo seguira
    // haciendo falta el dia que Kick vuelva a cambiar las clases, y la regla que no
    // puede saltarse es la del ambito.
    //
    // El <main> es el ancla porque es el area de contenido de la SPA —la barra lateral
    // y la cabecera son hermanas suyas, no hijas— y porque se llama igual en las cuatro
    // pestañas. Los dialogos y los toast de Kick SI viven fuera (Radix los cuelga del
    // body), asi que lo que los busca sigue preguntando al documento a proposito.
    function _dropsRoot() {
        // Primero, el <main> que contiene la barra de pestañas de /drops: es la señal
        // que dice "este main es el de drops" sin depender de ninguna clase. Se pide
        // por el mismo criterio que clasifica la pagina, asi que el item "Drops" de la
        // barra lateral (que apunta a /drops, sin segundo segmento) no cuenta.
        for (const a of document.querySelectorAll('a[href]')) {
            let p;
            try { p = new URL(a.getAttribute('href'), location.href).pathname; }
            catch (e) { continue; }
            if (!_dropsTabPath(p)) continue;
            const main = a.closest && a.closest('main');
            if (main) return main;
        }
        // Y si la barra todavia no esta montada, el unico <main> de la pagina. Cuando
        // hay varios no se adivina: sin ambito seguro no se escanea, que es preferible
        // a volver a leer media pagina.
        const mains = document.querySelectorAll('main');
        return mains.length === 1 ? mains[0] : null;
    }

    // Los nodos que se pueden leer, ya acotados. Devuelve un array (no una NodeList)
    // para que se pueda filtrar sin convertirlo en cada sitio.
    function _dropsQuery(selector) {
        const root = _dropsRoot();
        return root ? Array.from(root.querySelectorAll(selector)) : [];
    }

    // Guarda de ultima hora para los nodos que llegan por otro camino. Es barato y
    // cierra el paso en el unico sitio por el que pasan todos.
    function _inDropsRoot(node) {
        const root = _dropsRoot();
        return !!root && !!node && root.contains(node);
    }

    // ---------------------------------------------
    // ENLACES DE LAS PESTAÑAS
    // ---------------------------------------------
    // /drops es una SPA, asi que para cambiar de pestaña se CLICKEA su enlace en vez
    // de tocar location: un location.href recarga la pagina entera y perderia el
    // estado ya escaneado. Y cuando hace falta una navegacion dura se usa el href del
    // propio enlace —asi el destino es siempre el que esta vivo en ese DOM, y no una
    // ruta adivinada que podria dar en un 404—.
    //
    // El enlace se busca por el MISMO criterio que clasifica la pagina (_kindOfPath),
    // no por un href literal: si el segmento de Kick cambia, un selector exacto
    // devuelve null y el recorrido se queda sin manera de moverse.
    function _tabLink(kind) {
        for (const a of document.querySelectorAll('a[href]')) {
            let p;
            try { p = new URL(a.getAttribute('href'), location.href).pathname; }
            catch (e) { continue; }
            if (!_dropsTabPath(p)) continue;
            if (_kindOfPath(p) === kind) return a;
        }
        return null;
    }

    function _campaignsTabLink() { return _tabLink('campaigns'); }
    function _claimedTabLink() { return _tabLink('claimed'); }
    function _comingSoonTabLink() { return _tabLink('comingSoon'); }
    function _expiredTabLink() { return _tabLink('expired'); }

    const KICK_ORIGIN = 'https://kick.com';

    // La direccion de una pestaña. Se prefiere SIEMPRE el href del enlace vivo —asi el
    // destino es el que Kick sirve hoy, no una ruta adivinada— y solo cuando la barra
    // de pestañas todavia no esta en el DOM se arma con la primera ruta conocida de esa
    // pestaña. Sale de DROPS_ROUTES para que no haya una segunda lista de rutas que
    // mantener en sincronia.
    function _tabHref(kind) {
        const link = _tabLink(kind);
        if (link) return link.href;
        const path = (DROPS_ROUTES[kind] || [])[0];
        return path ? KICK_ORIGIN + path : KICK_ORIGIN + DROPS_ROUTES.campaigns[0];
    }

    function _campaignsHref() { return _tabHref('campaigns'); }

    // Intercept the PAGE's fetch (unsafeWindow) to capture Kick's own API calls
    // Running at document-start ensures we're in place before Kick's JS loads
    const _pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const _originalFetch = _pageWindow.fetch;
    _pageWindow.fetch = async function (...args) {
        const [input, init] = args;
        const url = _urlOf(input);
        const isKick = _isKickUrl(url);

        // Capture Authorization token from Kick's own API requests only
        if (isKick && init?.headers) {
            const headers = init.headers;
            const authValue = headers instanceof Headers
                ? headers.get('Authorization')
                : headers['Authorization'] || headers['authorization'];
            if (authValue && authValue.startsWith('Bearer ')) {
                _kickAuthToken = authValue;
            }
        }

        const response = await _originalFetch.apply(this, args);

        // Intercept drops progress response
        try {
            if (isKick && new URL(url, location.href).pathname === '/api/v1/drops/progress') {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data?.data && Array.isArray(data.data)) {
                        _interceptedAllCampaigns = data.data;
                        _interceptedClaimedCampaigns = data.data.filter(c =>
                            c.rewards && c.rewards.some(r => r.claimed)
                        );
                        _claimedInventoryReady = true;
                        _progressInventoryReady = true;
                        if (_onClaimedDataReady && _isClaimedPage()) {
                            setTimeout(() => _onClaimedDataReady(), 500);
                        }
                        // El progreso NO se limita al inventario: en /drops/campaigns es
                        // lo que marca en los badges que drops ya estan reclamados.
                        if (_onProgressDataReady) {
                            setTimeout(() => _onProgressDataReady(), 500);
                        }
                    }
                }).catch(() => { });
            }
            // El reto diario, gratis: la pagina lo pide para su propio modal del cofre.
            if (isKick && new URL(url, location.href).pathname === '/api/v1/gamification/challenges') {
                response.clone().json().then(data => {
                    if (data?.data && Array.isArray(data.data)) {
                        _kickChallenges = data.data;
                        if (_onChallengesReady) setTimeout(() => _onChallengesReady(), 0);
                    }
                }).catch(() => { });
            }
        } catch (e) { /* noop */ }
        return response;
    };

    window.addEventListener("load", () => {

        // =============================================
        // INTERNACIONALIZACION (i18n)
        // =============================================

        const userLang = document.documentElement.getAttribute("lang") || navigator.language || "en";
        const lang = userLang.split("-")[0];
        const i18n = {
            es: {

                addKeyword: "Añadir Keyword",
                deleteKeywordTooltip: "Haga click para eliminar keyword",
                deleteKeywordQuestion: "¿Eliminar la keyword ",
                editKeywords: "Editar Keywords",
                resetKeywords: "Restaurar Predeterminadas",
                confirmReset: "¿Restaurar las keywords por defecto?",
                keywordsRestored: "Keywords restauradas. Recargando...",
                keywordsModified: "Las keywords han sido modificadas, estas son las actuales: ",
                reloading: "Recargando...",
                currentKeywords: "Keywords actuales (haga clic en una para eliminar):",
                noResults: "No se encontraron campanas relacionadas con tus keywords.",
                dropsActive: "Drops Abiertos",
                dropsExpired: "Drops Cerrados",
                dropsUpcoming: "Drops Próximos",
                editPrompt: "Palabras clave separadas por coma:",
                searching: "Buscando",
                reload: "Recargar drops",
                hideExpired: "Ocultar cerrados/completados del inventario, reclamacion de drops automatica",
                changes_detected: "Cambios detectados",
                viewed: "Mostrar",
                markAllAsViewed: "Marcar todas como vistas",
                accept: "Aceptar",
                cancel: "Cancelar",
                yes: "Si",
                no: "No",
                addButton: "+",
                viewIcon: "👁️",
                changedIcon: "🔔",

                scriptInfoTitle: "Informacion del script",
                scriptInfoName: "Nombre:",
                scriptInfoVersion: "Version:",
                scriptInfoDescription: "Descripcion:",
                scriptInfoDescriptionText: "Resalta en la propia página las campañas de drops que coinciden con tus keywords: verde en la pestaña de campañas, azul en la de próximas y rojo en la de cerradas. El panel las lista separadas en abiertos, próximos y cerrados —las tres a la vez, porque las saca de la API: las pestañas de Kick recargan la página, así que leyendo solo lo que hay delante nunca se verían juntas—, con la ventana de fechas, la keyword que la encontró y cada recompensa con las horas que pide. Una keyword casa en cualquier parte del texto, así que «rage» encuentra una campaña llamada «averageaden $5 Bonus»; la etiqueta de la tarjeta dice cuál fue, para que ninguna aparezca sin explicar por qué. Las recompensas que ya tienes van con ✓ y tachadas, una a una, y el badge que no tiene nada pendiente se queda sin su tiempo. Lo que ya te ganaste y no has recogido va aparte, con 🎁 y sin atenuar, porque solo le falta un clic, y el aviso de cierre tambien los cuenta. Lo que está por cerrar va primero: cuando a una recompensa que aún no tienes se le acaba el tiempo en menos de 72 h, su tarjeta dice cuánto queda y cuánto te falta por ver —rojo por debajo de 24 h— o que ya no da tiempo, y el mismo ⏳ cae en la tarjeta de la campaña en la página. Las próximas llevan también sus recompensas y lo que cuesta cada tramo, pero nunca un plazo: antes de que abra no corre prisa nada, y una cuenta atrás el día antes solo alarma. Y una cerrada que ya reclamaste entera no se lista, porque Kick la mueve a reclamados: el panel no enseña filas que la página no tiene. Keywords editables: clic en una para borrarla, + para añadir, editarlas en bloque o restaurar las predeterminadas. Una keyword que empieza por «-» descarta: «-console» deja fuera la campaña aunque otra keyword la hubiera encontrado, y se lleva con ella el resaltado, la tarjeta y el aviso. Y cuatro filtros de vista recortan la lista de abiertos sin tocar nada mas —lo que aun te falta, lo que cierra pronto, lo que ya ganaste y no has recogido, y lo que se saca en una hora o menos—: se suman entre si, se recuerdan, y la pestaña dice cuantas tarjetas se ven de cuantas hay. La lista de abiertos se ordena por lo que antes cierra o por lo que menos tiempo te pide, a eleccion. Y cada campaña abierta lleva en su propia tarjeta de la pagina el tiempo que te falta para llevarte todo lo que queda —su recompensa mas cara, porque el tiempo visto es por campaña—, de modo que el coste se ve haciendo scroll. Las campañas abiertas y las proximas se copian como texto con el 🔗: titulo, fechas y recompensas, con el enlace a la pestaña donde viven —abiertas o proximas—, porque en Kick una campaña no tiene direccion propia. Si no llegan tus datos de reclamado y visto —sin ellos no se sabe que tienes ni cuanto llevas—, el panel lo dice en vez de quedarse callado con las marcas apagadas. Donde Kick pinte una barra de progreso, pasar el raton dice cuanto tiempo de visualizacion te falta exactamente, y pulsar abre el detalle del drop. En la pestaña de reclamados se pinta una rejilla propia que ademas dice cuanto hace que conseguiste cada cosa, y sustituye a la lista de Kick para no enseñar lo mismo dos veces. La casilla oculta lo completado y activa la reclamación automática, tanto de los drops terminados como del cofre de recompensa diaria que Kick da por ver streams (que no es un drop): el cofre se abre solo cuando la recompensa está disponible, se detecta sin depender del idioma y se revisa siempre después de los drops, nunca en medio. Y lo completado que oculta incluye la recompensa que ya reclamaste, que Kick deja en la página como una baldosa pelada: lo que decide que está reclamada son tus datos de reclamado, no la forma de la página. Y el cofre sale además como una baldosa más de esa rejilla, con la barra de progreso de Kick: los minutos de visualización que le faltan —el ratón encima los dice, y un clic abre el modal del cofre sin reclamar nada—, que se reclamará solo al llegar al final, y —en cuanto se pueda cobrar— un botón que lo cobra y deja abierto el resultado de Kick. Y solo la de hoy: cerrada la ventana del día, la baldosa desaparece hasta que llega el reto nuevo. Marca con 🔔 —en el panel y en la propia tarjeta— las campañas que cambiaron desde la última vez, con una cuenta de pendientes, notificación de escritorio y un botón 👁️ que las da por vistas y te lleva a la pestaña de campañas. 16 idiomas.",
                scriptInfoAuthor: "Autor:",
                scriptInfoGitHub: "GitHub:",
                scriptInfoPrivacy: "Privacidad:",
                scriptInfoPrivacyText: "Tus keywords y ajustes se guardan solo en tu navegador. Las consultas de drops e inventario van unicamente a la API de Kick (web.kick.com) reusando tu propia sesion; el token se mantiene en memoria, nunca se guarda en disco. No hay terceros involucrados y no se envia nada al autor del script.",

                readingApiDrops: "Leyendo cambios en drops desde la API...",
                earnedUnclaimed: "ganado, falta reclamar",
                urgentUnclaimed: "sin reclamar",
                filterPending: "Algo pendiente",
                filterSoon: "Cierra pronto",
                filterUnclaimed: "Sin reclamar",
                filterQuick: "Tramo ≤ 1 h",
                filterBarHint: "Filtra solo la pestaña de activos. Varios filtros se suman.",
                noResultsFiltered: "Nada pasa los filtros activos.",
                clearFilters: "Quitar filtros",
                negativeKeywordHint: "escribe -palabra para descartar",
                sortLabel: "Orden:",
                sortUrgent: "Lo que antes cierra",
                sortCheapest: "Lo más barato",
                sortCheapestHint: "Ordena por lo que menos te pide para sacar algo. El ⏱ de la tarjeta es otra cuenta: lo que cuesta llevárselo todo.",
                remainingToFinish: "lo que te falta para llevártelo todo de aquí",
                noInventoryData: "Sin inventario: no se sabe qué tienes reclamado ni cuánto llevas visto.",
                dailyStreakReminder: "Recompensa diaria: llevas {done} de {total} min. No pierdas la racha de hoy.",
                urgentClosesIn: "cierra en",
                urgentNeed: "te faltan",
                urgentMinimum: "lo mínimo",
                urgentNoTime: "no da tiempo",
                claimedInventoryTitle: "Reclamados",
                shareCopy: "Copiar para compartir",
                collapsePanel: "Ocultar el panel",
                expandPanel: "Mostrar el panel",
                dismissDailyReminder: "Silenciar hasta mañana",
                dailyRewardTitle: "Recompensa diaria",
                dailyRewardAuto: "Se reclama solo al terminar el tiempo",
                dailyRewardClaim: "Reclamar",
                shareCopied: "Copiado",







                timeRemaining: "Tiempo restante",
                progress: "Progreso",
                rewards: "Recompensas",
                minutesShort: "min",
                dropDetails: "Detalle del drop"
            },
            en: {

                addKeyword: "Add Keyword",
                deleteKeywordTooltip: "Click to delete keyword",
                deleteKeywordQuestion: "Delete keyword ",
                editKeywords: "Edit Keywords",
                resetKeywords: "Reset to Default",
                confirmReset: "Reset keywords to default?",
                keywordsRestored: "Keywords restored. Reloading...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Reloading...",
                currentKeywords: "Current keywords (click on one to delete):",
                noResults: "No drops matched your keywords.",
                dropsActive: "Active Drops",
                dropsExpired: "Expired Drops",
                dropsUpcoming: "Upcoming Drops",
                editPrompt: "Comma-separated keywords:",
                searching: "Searching",
                reload: "Reload drops",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                changes_detected: "Changes detected",
                viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Accept",
                cancel: "Cancel",
                yes: "Yes",
                no: "No",
                addButton: "+",
                viewIcon: "👁️",
                changedIcon: "🔔",

                scriptInfoTitle: "Script Information",
                scriptInfoName: "Name:",
                scriptInfoVersion: "Version:",
                scriptInfoDescription: "Description:",
                scriptInfoDescriptionText: "Highlights the drop campaigns matching your keywords on the page: green on the campaigns tab, blue on coming soon, red on expired. The panel lists them split into active, upcoming and expired —all three at once, because it reads them from the API: Kick's tabs reload the page, so reading only what is in front of you they would never be seen together—, with the date window, the keyword that matched and each reward with the hours it needs. A keyword matches anywhere in the text, so \"rage\" finds a campaign called \"averageaden $5 Bonus\"; the card says which keyword it was, so none of them shows up without explaining why. Rewards you already own are ticked and struck through one by one, and a badge with nothing left to earn drops the watch time it asked for. What you already earned but have not collected is flagged apart with 🎁 —not dimmed— because it only needs a click, and the closing warning counts those too. What is about to close comes first: when a reward you do not own yet runs out of time within 72 hours, its card says how long is left and how much watch time you still need —red under 24 hours— or that it no longer fits, and the same ⏳ lands on the campaign's card on the page. Upcoming campaigns also carry their rewards and what each tier costs, but never a deadline: nothing is urgent before it opens, and a countdown the day before only alarms. And a closed campaign you already claimed in full is not listed, because Kick moves it to claimed: the panel does not show rows the page does not have. Keywords are editable: click one to delete it, + to add, edit them in bulk or reset to the defaults. A keyword starting with \"-\" excludes: \"-console\" drops the campaign even if another keyword had found it, and takes the highlight, the card and the alert with it. And four view filters trim the open list without touching anything else —what you still have left, what closes soon, what you already earned and have not collected, and what takes an hour or less—: they add up, they are remembered, and the tab says how many cards are showing out of how many there are. The open list is sorted by whatever closes first or by whatever asks the least time, your choice. And every open campaign carries, on its own card on the page, the time you still need to take everything that is left —its most expensive reward, because the watch time is per campaign—, so the cost is visible while scrolling. Open and upcoming campaigns can be copied as text with the 🔗: title, dates and rewards, with a link to the tab they live in —campaigns or coming soon— because in Kick a campaign has no address of its own. If your claimed-and-watched data never arrives —without it there is no telling what you own or how much you have watched— the panel says so instead of going quiet with its marks switched off. Wherever Kick draws a progress bar, hovering says exactly how much watch time you still need, and clicking opens the drop details. The claimed tab gets a grid of its own that also says how long ago you got each thing, and it replaces Kick's list so the same thing is not shown twice. The checkbox hides what is completed and turns on automatic claiming, both of finished drops and of the daily reward chest Kick gives for watching streams (which is not a drop): the chest is only opened when the reward is actually available, it is detected without relying on language, and it is always checked after the drops, never during. And what it hides includes the reward you already claimed, which Kick leaves on the page as a bare tile: what decides it is claimed is your claimed-and-watched data, not the shape of the page. And that chest also shows up as one more tile in the grid, with Kick's own progress bar: the watch minutes it still needs —hovering says them, and a click opens the chest's modal without claiming anything—, that it will be claimed by itself once they are done, and —as soon as it can be claimed— a button that claims it and leaves Kick's result open. And only today's: once the day window closes the tile goes away until the new challenge arrives. It flags campaigns that changed since you last looked with a 🔔 —in the panel and on the card itself— plus a pending count, a desktop notification and an 👁️ button that marks them as seen and takes you to the campaigns tab. 16 languages.",
                scriptInfoAuthor: "Author:",
                scriptInfoGitHub: "GitHub:",
                scriptInfoPrivacy: "Privacy:",
                scriptInfoPrivacyText: "Your keywords and settings stay in your browser only. Drop and inventory queries go exclusively to Kick's own API (web.kick.com), reusing your existing session; the token is kept in memory and never written to disk. No third parties are involved and nothing is sent to the script author.",

                readingApiDrops: "Reading drop changes from API...",
                earnedUnclaimed: "earned, not claimed",
                urgentUnclaimed: "unclaimed",
                filterPending: "Something left",
                filterSoon: "Closing soon",
                filterUnclaimed: "Unclaimed",
                filterQuick: "Tier ≤ 1 h",
                filterBarHint: "Filters the active tab only. Several filters add up.",
                noResultsFiltered: "Nothing matches the active filters.",
                clearFilters: "Clear filters",
                negativeKeywordHint: "type -word to exclude",
                sortLabel: "Sort:",
                sortUrgent: "Closing first",
                sortCheapest: "Cheapest first",
                sortCheapestHint: "Sorts by what asks the least to get something. The ⏱ on the card is a different figure: what it costs to take everything.",
                remainingToFinish: "what you still need to take everything from here",
                noInventoryData: "No inventory: what you own and how much you have watched are unknown.",
                dailyStreakReminder: "Daily reward: {done} of {total} min watched. Do not lose today's streak.",
                urgentClosesIn: "closes in",
                urgentNeed: "you still need",
                urgentMinimum: "minimum",
                urgentNoTime: "not enough time",
                claimedInventoryTitle: "Claimed",
                shareCopy: "Copy to share",
                collapsePanel: "Hide the panel",
                expandPanel: "Show the panel",
                dismissDailyReminder: "Mute until tomorrow",
                dailyRewardTitle: "Daily reward",
                dailyRewardAuto: "Claimed automatically when the time is up",
                dailyRewardClaim: "Claim",
                shareCopied: "Copied",







                timeRemaining: "Time remaining",
                progress: "Progress",
                rewards: "Rewards",
                minutesShort: "min",
                dropDetails: "Drop details"
            },
            de: {
                scriptInfoPrivacyText: "Deine Schlüsselwörter und Einstellungen bleiben nur in deinem Browser. Abfragen zu Drops und Inventar gehen ausschließlich an die eigene API von Kick (web.kick.com) und nutzen deine bestehende Sitzung; das Token bleibt im Speicher und wird nie auf die Festplatte geschrieben. Es sind keine Dritten beteiligt und an den Autor des Skripts wird nichts gesendet.",
                minutesShort: "min",
                dropDetails: "Drop-Details",
                rewards: "Belohnungen",
                progress: "Fortschritt",
                timeRemaining: "Restzeit",
                urgentMinimum: "mindestens",
                remainingToFinish: "was dir noch fehlt, um hier alles mitzunehmen",
                scriptInfoPrivacy: "Datenschutz:",
                addKeyword: "Keyword hinzufügen",
                deleteKeywordTooltip: "Klicken um Keyword zu löschen", deleteKeywordQuestion: "Keyword löschen ",
                editKeywords: "Keywords bearbeiten", resetKeywords: "Standard wiederherstellen",
                confirmReset: "Keywords auf Standard zurücksetzen?",
                keywordsRestored: "Keywords wiederhergestellt. Neu laden...",
                keywordsModified: "Schlüsselwörter geändert. Das sind die aktuellen: ",
                reloading: "Neu laden...", currentKeywords: "Aktuelle Keywords (klicken zum Löschen):",
                noResults: "Keine Drops gefunden.", dropsActive: "Offene Drops",
                dropsExpired: "Geschlossene Drops", dropsUpcoming: "Kommende Drops",
                editPrompt: "Kommagetrennte Keywords:",
                searching: "Suche", reload: "Drops neu laden",
                hideExpired: "Abgelaufene/erledigte aus dem Inventar ausblenden, Drops automatisch abholen",
                changes_detected: "Änderungen erkannt", viewed: "Anzeigen",
                markAllAsViewed: "Alle als gesehen markieren",
                accept: "Akzeptieren", cancel: "Abbrechen", yes: "Ja", no: "Nein",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Skript-Informationen", scriptInfoName: "Name:",
                scriptInfoVersion: "Version:", scriptInfoDescription: "Beschreibung:",
                scriptInfoDescriptionText: "Hebt die Drop-Kampagnen, die zu deinen Keywords passen, direkt auf der Seite hervor: grün im Tab Kampagnen, blau bei Demnächst, rot bei Beendet. Das Panel listet sie getrennt nach aktiv, demnächst und beendet auf —alle drei auf einmal, weil es sie aus der API liest: Kicks Tabs laden die Seite neu, und wer nur liest, was gerade vor ihm liegt, bekäme sie nie zusammen zu sehen—, mit dem Zeitraum, dem Keyword, das getroffen hat, und jeder Belohnung samt der Stunden, die sie verlangt. Ein Keyword trifft an jeder Stelle des Textes, deshalb findet „rage“ eine Kampagne namens „averageaden $5 Bonus“; die Karte sagt, welches Keyword es war, damit keine ohne Erklärung auftaucht. Belohnungen, die du schon hast, werden einzeln abgehakt und durchgestrichen, und einem Abzeichen, bei dem nichts mehr zu holen ist, fällt die Zeitangabe weg. Was du schon verdient, aber nicht abgeholt hast, steht mit 🎁 gesondert da —nicht abgeblendet—, weil nur noch ein Klick fehlt, und die Ablaufwarnung zählt es mit. Was bald endet, steht oben: Wenn einer Belohnung, die dir noch fehlt, innerhalb von 72 Stunden die Zeit ausgeht, sagt ihre Karte, wie lange noch bleibt und wie viel Sehzeit dir fehlt —rot unter 24 Stunden— oder dass es nicht mehr reicht, und dasselbe ⏳ landet auf der Karte der Kampagne auf der Seite. Kommende Kampagnen tragen ebenfalls ihre Belohnungen und den Preis jeder Stufe, aber niemals eine Frist: vor dem Start ist nichts dringend, und ein Countdown am Vortag beunruhigt nur. Und eine beendete Kampagne, die du schon vollständig abgeholt hast, wird nicht aufgeführt, weil Kick sie zu den Abgeholten verschiebt: das Panel zeigt keine Zeilen, die die Seite nicht hat. Keywords sind editierbar: klicke eines an, um es zu löschen, + zum Hinzufügen, alle auf einmal bearbeiten oder die Standardwerte wiederherstellen. Ein Keyword, das mit „-“ beginnt, schließt aus: „-console“ wirft die Kampagne hinaus, auch wenn ein anderes Keyword sie gefunden hatte, und nimmt Hervorhebung, Karte und Hinweis mit. Und vier Ansichtsfilter kürzen die Liste der offenen, ohne sonst etwas anzufassen —was dir noch fehlt, was bald endet, was du verdient und nicht abgeholt hast, und was in einer Stunde oder weniger drin ist—: Sie greifen zusammen, sie werden gemerkt, und der Tab sagt, wie viele Karten von wie vielen zu sehen sind. Die Liste der offenen wird danach sortiert, was zuerst endet, oder danach, was am wenigsten Zeit verlangt, ganz wie du willst. Und jede offene Kampagne trägt auf ihrer eigenen Karte auf der Seite die Zeit, die dir fehlt, um alles Übrige mitzunehmen —ihre teuerste Belohnung, denn die Sehzeit zählt pro Kampagne—, damit die Kosten beim Scrollen sichtbar sind. Offene und kommende Kampagnen lassen sich mit dem 🔗 als Text kopieren: Titel, Zeitraum und Belohnungen, mit einem Link auf den Tab, in dem sie leben —Kampagnen oder Demnächst—, denn bei Kick hat eine Kampagne keine eigene Adresse. Wenn deine Daten zu Abgeholtem und Gesehenem nie ankommen —ohne sie lässt sich nicht sagen, was du hast oder wie viel du gesehen hast—, sagt das Panel es, statt mit abgeschalteten Markierungen zu schweigen. Überall, wo Kick einen Fortschrittsbalken zeichnet, sagt ein Zeigen mit der Maus genau, wie viel Sehzeit dir noch fehlt, und ein Klick öffnet die Details des Drops. Der Tab der abgeholten bekommt ein eigenes Raster, das außerdem sagt, wie lange es her ist, dass du jedes Stück bekommen hast, und es ersetzt Kicks Liste, damit dasselbe nicht zweimal dasteht. Das Kontrollkästchen blendet Erledigtes aus und schaltet das automatische Abholen ein, sowohl der fertigen Drops als auch der täglichen Belohnungstruhe, die Kick fürs Streams-Schauen gibt (die kein Drop ist): Die Truhe wird nur geöffnet, wenn die Belohnung wirklich verfügbar ist, sie wird ohne Sprachabhängigkeit erkannt, und sie wird immer nach den Drops geprüft, nie mittendrin. Und zu dem Erledigten, das es ausblendet, gehört auch die schon abgeholte Belohnung, die Kick als kahle Kachel auf der Seite stehen lässt: worüber entschieden wird, sind deine Daten zu Abgeholtem, nicht die Form der Seite. Und die Truhe erscheint zusätzlich als weitere Kachel im Raster, mit Kicks Fortschrittsbalken: die noch fehlenden Zuschauminuten —der Mauszeiger nennt sie, und ein Klick öffnet ihr Fenster, ohne etwas abzuholen—, dass sie am Ende von selbst abgeholt wird, und —sobald es geht— eine Schaltfläche, die sie abholt und Kicks Ergebnis offen lässt. Und nur die von heute: ist das Tagesfenster zu, verschwindet die Kachel, bis die neue Aufgabe kommt. Kampagnen, die sich seit deinem letzten Blick geändert haben, bekommen ein 🔔 —im Panel und auf der Karte selbst—, dazu einen Zähler der offenen, eine Desktop-Benachrichtigung und einen 👁️-Knopf, der sie als gesehen markiert und dich zum Tab Kampagnen bringt. 16 Sprachen.",
                scriptInfoAuthor: "Autor:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "Drop-Änderungen werden von der API gelesen...",
                earnedUnclaimed: "verdient, nicht abgeholt",
                urgentUnclaimed: "nicht abgeholt",
                filterPending: "Noch offen",
                filterSoon: "Endet bald",
                filterUnclaimed: "Nicht abgeholt",
                filterQuick: "Stufe ≤ 1 Std.",
                filterBarHint: "Filtert nur den Tab „Aktiv“. Mehrere Filter greifen zusammen.",
                noResultsFiltered: "Nichts entspricht den aktiven Filtern.",
                clearFilters: "Filter entfernen",
                negativeKeywordHint: "-wort schreiben zum Ausschließen",
                sortLabel: "Sortierung:",
                sortUrgent: "Endet zuerst",
                sortCheapest: "Günstigstes zuerst",
                sortCheapestHint: "Sortiert danach, was am wenigsten verlangt, um überhaupt etwas zu bekommen. Das ⏱ auf der Karte ist eine andere Rechnung: was es kostet, alles mitzunehmen.",
                noInventoryData: "Kein Inventar: unbekannt, was du hast und wie viel du geschaut hast.",
                dailyStreakReminder: "Tägliche Belohnung: {done} von {total} Min. geschaut. Verliere heute nicht deine Serie.",
                urgentClosesIn: "endet in",
                urgentNeed: "dir fehlen",
                urgentNoTime: "Zeit reicht nicht",
                claimedInventoryTitle: "Beansprucht",
                shareCopy: "Zum Teilen kopieren",
                collapsePanel: "Panel ausblenden",
                expandPanel: "Panel anzeigen",
                dismissDailyReminder: "Bis morgen stummschalten",
                dailyRewardTitle: "Tägliche Belohnung",
                dailyRewardAuto: "Wird automatisch abgeholt, wenn die Zeit um ist",
                dailyRewardClaim: "Abholen",
                shareCopied: "Kopiert"



            },
            fr: {
                scriptInfoPrivacyText: "Tes mots-clés et tes réglages restent uniquement dans ton navigateur. Les requêtes de drops et d'inventaire vont exclusivement à l'API de Kick (web.kick.com) en réutilisant ta propre session ; le jeton reste en mémoire et n'est jamais écrit sur le disque. Aucun tiers n'intervient et rien n'est envoyé à l'auteur du script.",
                minutesShort: "min",
                dropDetails: "Détail du drop",
                rewards: "Récompenses",
                progress: "Progression",
                timeRemaining: "Temps restant",
                urgentMinimum: "au minimum",
                remainingToFinish: "ce qu'il te manque pour tout emporter d'ici",
                scriptInfoPrivacy: "Confidentialité :",
                addKeyword: "Ajouter un mot-clé",
                deleteKeywordTooltip: "Cliquez pour supprimer le mot-clé", deleteKeywordQuestion: "Supprimer le mot-clé ",
                editKeywords: "Modifier les mots-clés", resetKeywords: "Réinitialiser par défaut",
                confirmReset: "Réinitialiser les mots-clés par défaut ?",
                keywordsRestored: "Mots-clés restaurés. Rechargement...",
                keywordsModified: "Mots-clés modifiés. Voici les actuels : ",
                reloading: "Rechargement...", currentKeywords: "Mots-clés actuels (cliquez pour supprimer) :",
                noResults: "Aucun drop ne correspond à vos mots-clés.",
                dropsActive: "Drops ouverts", dropsExpired: "Drops fermés",
                dropsUpcoming: "Drops à venir",
                editPrompt: "Mots-clés séparés par des virgules :",
                searching: "Recherche", reload: "Recharger les drops",
                hideExpired: "Masquer les terminés/complétés de l'inventaire, réclamation automatique des drops",
                changes_detected: "Changements détectés", viewed: "Afficher",
                markAllAsViewed: "Tout marquer comme vu",
                accept: "Accepter", cancel: "Annuler", yes: "Oui", no: "Non",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Informations du script", scriptInfoName: "Nom :",
                scriptInfoVersion: "Version :", scriptInfoDescription: "Description :",
                scriptInfoDescriptionText: "Met en évidence, sur la page elle-même, les campagnes de drops qui correspondent à tes mots-clés : vert dans l'onglet campagnes, bleu dans à venir, rouge dans terminées. Le panneau les liste séparées en actives, à venir et terminées —les trois à la fois, parce qu'il les lit depuis l'API : les onglets de Kick rechargent la page, donc en lisant seulement ce que tu as devant toi on ne les verrait jamais ensemble—, avec la fenêtre de dates, le mot-clé qui a correspondu et chaque récompense avec les heures qu'elle demande. Un mot-clé correspond n'importe où dans le texte, donc « rage » trouve une campagne appelée « averageaden $5 Bonus » ; la carte dit quel mot-clé c'était, pour qu'aucune n'apparaisse sans expliquer pourquoi. Les récompenses que tu possèdes déjà sont cochées et barrées une par une, et un badge où il ne reste plus rien à gagner perd le temps de visionnage qu'il demandait. Ce que tu as déjà gagné mais pas récupéré est signalé à part avec 🎁 —sans être atténué— parce qu'il ne manque qu'un clic, et l'alerte de fermeture les compte aussi. Ce qui est sur le point de fermer passe en premier : quand une récompense que tu n'as pas encore n'a plus que 72 heures, sa carte dit combien de temps il reste et combien de visionnage il te manque —rouge en dessous de 24 heures— ou que ça ne rentre plus, et le même ⏳ se pose sur la carte de la campagne dans la page. Les campagnes à venir portent aussi leurs récompenses et le coût de chaque palier, mais jamais d'échéance : avant l'ouverture rien n'est urgent, et un compte à rebours la veille ne fait qu'inquiéter. Et une campagne terminée que tu as déjà entièrement réclamée n'est pas listée, parce que Kick la déplace vers les réclamés : le panneau ne montre pas des lignes que la page n'a pas. Les mots-clés sont modifiables : clique sur l'un pour l'effacer, + pour ajouter, édite-les en bloc ou restaure ceux par défaut. Un mot-clé qui commence par « - » exclut : « -console » écarte la campagne même si un autre mot-clé l'avait trouvée, et emporte avec lui la surbrillance, la carte et l'alerte. Et quatre filtres d'affichage réduisent la liste des ouvertes sans toucher à rien d'autre —ce qu'il te reste, ce qui ferme bientôt, ce que tu as gagné sans le récupérer, et ce qui se prend en une heure ou moins— : ils se cumulent, ils sont mémorisés, et l'onglet dit combien de cartes s'affichent sur combien il y en a. La liste des ouvertes se trie par ce qui ferme en premier ou par ce qui demande le moins de temps, à ton choix. Et chaque campagne ouverte porte, sur sa propre carte dans la page, le temps qu'il te faut pour tout emporter —sa récompense la plus chère, parce que le temps de visionnage se compte par campagne—, pour que le coût se voie en faisant défiler. Les campagnes ouvertes et à venir se copient comme texte avec le 🔗 : titre, dates et récompenses, avec un lien vers l'onglet où elles vivent —campagnes ou à venir— parce que chez Kick une campagne n'a pas d'adresse à elle. Si tes données de réclamé et de visionné n'arrivent jamais —sans elles impossible de savoir ce que tu as ni combien tu as regardé—, le panneau le dit au lieu de se taire avec ses marques éteintes. Partout où Kick dessine une barre de progression, le survol dit exactement combien de visionnage il te manque, et le clic ouvre le détail du drop. L'onglet des réclamés reçoit sa propre grille, qui dit en plus depuis combien de temps tu as obtenu chaque chose, et elle remplace la liste de Kick pour ne pas montrer deux fois la même chose. La case masque ce qui est terminé et active la réclamation automatique, aussi bien des drops finis que du coffre de récompense quotidienne que Kick donne pour regarder des streams (qui n'est pas un drop) : le coffre ne s'ouvre que quand la récompense est vraiment disponible, il est détecté sans dépendre de la langue, et il est toujours vérifié après les drops, jamais au milieu. Et ce qu'elle masque comprend la récompense que tu as déjà réclamée, que Kick laisse sur la page comme une tuile nue : ce qui décide qu'elle est réclamée, ce sont tes données de réclamé, pas la forme de la page. Et le coffre apparaît aussi comme une tuile de plus dans la grille, avec la barre de progression de Kick : les minutes de visionnage qui lui manquent —le survol les dit, et un clic ouvre sa fenêtre sans rien réclamer—, qu'il sera réclamé tout seul à la fin, et —dès que c'est possible— un bouton qui le réclame et laisse le résultat de Kick ouvert. Et seulement celui d'aujourd'hui : une fois la fenêtre du jour fermée, la tuile disparaît jusqu'à l'arrivée du nouveau défi. Les campagnes qui ont changé depuis ta dernière visite sont marquées d'un 🔔 —dans le panneau et sur la carte elle-même—, avec un compteur d'attente, une notification de bureau et un bouton 👁️ qui les donne pour vues et t'emmène à l'onglet campagnes. 16 langues.",
                scriptInfoAuthor: "Auteur :", scriptInfoGitHub: "GitHub :",
                readingApiDrops: "Lecture des changements de drops depuis l'API...",
                earnedUnclaimed: "gagné, non réclamé",
                urgentUnclaimed: "non réclamés",
                filterPending: "Reste à faire",
                filterSoon: "Se termine bientôt",
                filterUnclaimed: "Non réclamés",
                filterQuick: "Palier ≤ 1 h",
                filterBarHint: "Ne filtre que l’onglet actif. Plusieurs filtres se cumulent.",
                noResultsFiltered: "Rien ne passe les filtres actifs.",
                clearFilters: "Retirer les filtres",
                negativeKeywordHint: "écrivez -mot pour exclure",
                sortLabel: "Tri :",
                sortUrgent: "Ce qui ferme en premier",
                sortCheapest: "Le moins cher",
                sortCheapestHint: "Trie par ce qui demande le moins pour obtenir quelque chose. Le ⏱ de la carte est un autre calcul : ce que coûte tout emporter.",
                noInventoryData: "Sans inventaire : impossible de savoir ce que tu as ni combien tu as regardé.",
                dailyStreakReminder: "Récompense quotidienne : {done} min sur {total} regardées. Ne perds pas ta série aujourd'hui.",
                urgentClosesIn: "se termine dans",
                urgentNeed: "il te manque",
                urgentNoTime: "pas assez de temps",
                claimedInventoryTitle: "Réclamés",
                shareCopy: "Copier pour partager",
                collapsePanel: "Masquer le panneau",
                expandPanel: "Afficher le panneau",
                dismissDailyReminder: "Masquer jusqu'à demain",
                dailyRewardTitle: "Récompense quotidienne",
                dailyRewardAuto: "Réclamée automatiquement à la fin du temps",
                dailyRewardClaim: "Réclamer",
                shareCopied: "Copié"



            },
            pt: {
                scriptInfoPrivacyText: "As tuas palavras-chave e definições ficam apenas no teu navegador. As consultas de drops e de inventário vão exclusivamente para a API do Kick (web.kick.com), reutilizando a tua própria sessão; o token fica em memória e nunca é gravado no disco. Não há terceiros envolvidos e nada é enviado ao autor do script.",
                minutesShort: "min",
                dropDetails: "Detalhe do drop",
                rewards: "Recompensas",
                progress: "Progresso",
                timeRemaining: "Tempo restante",
                urgentMinimum: "no mínimo",
                remainingToFinish: "o que te falta para levar tudo daqui",
                scriptInfoPrivacy: "Privacidade:",
                addKeyword: "Adicionar Keyword",
                deleteKeywordTooltip: "Clique para deletar keyword", deleteKeywordQuestion: "Deletar keyword ",
                editKeywords: "Editar Keywords", resetKeywords: "Restaurar Padrão",
                confirmReset: "Restaurar keywords padrão?",
                keywordsRestored: "Keywords restauradas. Recarregando...",
                keywordsModified: "Palavras-chave alteradas. Estas são as atuais: ",
                reloading: "Recarregando...", currentKeywords: "Keywords atuais (clique para deletar):",
                noResults: "Nenhum drop encontrado com suas keywords.",
                dropsActive: "Drops Abertos", dropsExpired: "Drops Fechados",
                dropsUpcoming: "Drops Próximos",
                editPrompt: "Keywords separadas por vírgula:",
                searching: "Buscando", reload: "Recarregar drops",
                hideExpired: "Ocultar fechados/completos do inventário, resgate automático de drops",
                changes_detected: "Alterações detetadas", viewed: "Mostrar",
                markAllAsViewed: "Marcar todas como vistas",
                accept: "Aceitar", cancel: "Cancelar", yes: "Sim", no: "Não",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Informações do script", scriptInfoName: "Nome:",
                scriptInfoVersion: "Versão:", scriptInfoDescription: "Descrição:",
                scriptInfoDescriptionText: "Destaca na própria página as campanhas de drops que combinam com as tuas keywords: verde na aba de campanhas, azul na de em breve, vermelho na de encerradas. O painel lista-as separadas em ativas, próximas e encerradas —as três de uma vez, porque as lê da API: as abas do Kick recarregam a página, por isso lendo só o que está à tua frente nunca se veriam juntas—, com a janela de datas, a keyword que correspondeu e cada recompensa com as horas que pede. Uma keyword corresponde em qualquer parte do texto, por isso «rage» encontra uma campanha chamada «averageaden $5 Bonus»; o cartão diz qual keyword foi, para que nenhuma apareça sem explicar porquê. As recompensas que já tens ficam com ✓ e riscadas uma a uma, e um badge sem nada por ganhar perde o tempo que pedia. O que já ganhaste mas não recolheste fica à parte com 🎁 —sem esmaecer— porque só falta um clique, e o aviso de encerramento também os conta. O que está por fechar vai primeiro: quando a uma recompensa que ainda não tens acaba o tempo dentro de 72 horas, o seu cartão diz quanto falta e quanto tempo de visualização te falta —vermelho abaixo de 24 horas— ou que já não dá tempo, e o mesmo ⏳ cai no cartão da campanha na página. As próximas levam também as suas recompensas e o que custa cada nível, mas nunca um prazo: antes de abrir nada é urgente, e uma contagem decrescente no dia anterior só alarma. E uma campanha encerrada que já resgataste por completo não é listada, porque o Kick a move para os resgatados: o painel não mostra linhas que a página não tem. As keywords são editáveis: clica numa para apagá-la, + para adicionar, edita-as em bloco ou restaura as predefinidas. Uma keyword que comece por «-» exclui: «-console» deixa a campanha de fora mesmo que outra keyword a tivesse encontrado, e leva com ela o destaque, o cartão e o aviso. E quatro filtros de vista reduzem a lista das abertas sem tocar em mais nada —o que ainda te falta, o que fecha em breve, o que já ganhaste e não recolheste, e o que se tira numa hora ou menos—: somam-se entre si, são lembrados, e a aba diz quantos cartões se veem de quantos há. A lista das abertas ordena-se pelo que fecha primeiro ou pelo que pede menos tempo, à tua escolha. E cada campanha aberta leva, no seu próprio cartão na página, o tempo que te falta para levares tudo o que resta —a sua recompensa mais cara, porque o tempo de visualização é por campanha—, para que o custo se veja ao rolar. As campanhas abertas e as próximas copiam-se como texto com o 🔗: título, datas e recompensas, com a ligação para a aba onde vivem —abertas ou em breve— porque no Kick uma campanha não tem endereço próprio. Se os teus dados de resgatado e visto nunca chegarem —sem eles não se sabe o que tens nem quanto viste—, o painel di-lo em vez de ficar calado com as marcas apagadas. Onde quer que o Kick desenhe uma barra de progresso, passar o rato diz exatamente quanto tempo de visualização te falta, e clicar abre o detalhe do drop. A aba dos resgatados ganha uma grelha própria que diz ainda há quanto tempo conseguiste cada coisa, e substitui a lista do Kick para não mostrar o mesmo duas vezes. A caixa esconde o que está completo e ativa o resgate automático, tanto dos drops terminados como do baú de recompensa diária que o Kick dá por ver streams (que não é um drop): o baú só se abre quando a recompensa está mesmo disponível, deteta-se sem depender do idioma, e verifica-se sempre depois dos drops, nunca a meio. E o que esconde inclui a recompensa que já resgataste, que o Kick deixa na página como um mosaico pelado: o que decide que está resgatada são os teus dados de resgatado, não a forma da página. E o baú aparece também como mais um bloco dessa grelha, com a barra de progresso da Kick: os minutos de visualização que ainda faltam —o rato por cima di-los, e um clique abre a sua janela sem resgatar nada—, que será resgatado sozinho ao chegar ao fim, e —assim que der— um botão que o resgata e deixa o resultado da Kick aberto. E só o de hoje: fechada a janela do dia, o bloco desaparece até chegar o desafio novo. Marca com 🔔 —no painel e no próprio cartão— as campanhas que mudaram desde a última vez, com uma contagem de pendentes, notificação no ambiente de trabalho e um botão 👁️ que as dá por vistas e te leva à aba de campanhas. 16 idiomas.",
                scriptInfoAuthor: "Autor:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "A ler alterações de drops da API...",
                earnedUnclaimed: "ganho, falta resgatar",
                urgentUnclaimed: "sem resgatar",
                filterPending: "Falta algo",
                filterSoon: "Fecha em breve",
                filterUnclaimed: "Sem resgatar",
                filterQuick: "Nível ≤ 1 h",
                filterBarHint: "Filtra só a aba de ativos. Vários filtros somam-se.",
                noResultsFiltered: "Nada passa nos filtros ativos.",
                clearFilters: "Remover filtros",
                negativeKeywordHint: "escreva -palavra para excluir",
                sortLabel: "Ordem:",
                sortUrgent: "O que fecha antes",
                sortCheapest: "O mais barato",
                sortCheapestHint: "Ordena pelo que menos pede para levar alguma coisa. O ⏱ do cartão é outra conta: o que custa levar tudo.",
                noInventoryData: "Sem inventário: não se sabe o que tens nem quanto já viste.",
                dailyStreakReminder: "Recompensa diária: {done} de {total} min assistidos. Não perca a sua sequência hoje.",
                urgentClosesIn: "fecha em",
                urgentNeed: "faltam",
                urgentNoTime: "não dá tempo",
                claimedInventoryTitle: "Resgatados",
                shareCopy: "Copiar para compartilhar",
                collapsePanel: "Ocultar o painel",
                expandPanel: "Mostrar o painel",
                dismissDailyReminder: "Silenciar até amanhã",
                dailyRewardTitle: "Recompensa diária",
                dailyRewardAuto: "É resgatada sozinha ao terminar o tempo",
                dailyRewardClaim: "Resgatar",
                shareCopied: "Copiado"



            },
            ru: {
                scriptInfoPrivacyText: "Ваши ключевые слова и настройки хранятся только в браузере. Запросы о дропах и инвентаре идут исключительно в собственный API Kick (web.kick.com) и используют вашу текущую сессию; токен держится в памяти и никогда не записывается на диск. Третьи лица не участвуют, автору скрипта ничего не отправляется.",
                minutesShort: "мин",
                dropDetails: "Подробности дропа",
                rewards: "Награды",
                progress: "Прогресс",
                timeRemaining: "Осталось времени",
                urgentMinimum: "минимум",
                remainingToFinish: "сколько осталось, чтобы забрать здесь всё",
                scriptInfoPrivacy: "Конфиденциальность:",
                addKeyword: "Добавить ключевое слово",
                deleteKeywordTooltip: "Нажмите для удаления", deleteKeywordQuestion: "Удалить ключевое слово ",
                editKeywords: "Редактировать ключевые слова", resetKeywords: "Сбросить по умолчанию",
                confirmReset: "Сбросить ключевые слова по умолчанию?",
                keywordsRestored: "Ключевые слова восстановлены. Перезагрузка...",
                keywordsModified: "Ключевые слова изменены. Текущие: ",
                reloading: "Перезагрузка...", currentKeywords: "Текущие ключевые слова (нажмите для удаления):",
                noResults: "Дропы не найдены.", dropsActive: "Открытые дропы",
                dropsExpired: "Закрытые дропы", dropsUpcoming: "Предстоящие дропы",
                editPrompt: "Ключевые слова через запятую:",
                searching: "Поиск", reload: "Перезагрузить дропы",
                hideExpired: "Скрывать закрытые/выполненные из инвентаря, автоматический сбор дропов",
                changes_detected: "Обнаружены изменения", viewed: "Показать",
                markAllAsViewed: "Отметить все как просмотренные",
                accept: "Принять", cancel: "Отмена", yes: "Да", no: "Нет",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Информация о скрипте", scriptInfoName: "Имя:",
                scriptInfoVersion: "Версия:", scriptInfoDescription: "Описание:",
                scriptInfoDescriptionText: "Подсвечивает прямо на странице кампании дропов, которые совпали с твоими ключевыми словами: зелёным во вкладке кампаний, синим в предстоящих, красным в закрытых. Панель перечисляет их отдельно: открытые, предстоящие и закрытые —все три сразу, потому что читает их из API: вкладки Kick перезагружают страницу, так что, читая только то, что перед тобой, вместе их не увидеть—, с окном дат, ключевым словом, которое сработало, и каждой наградой с часами, которых она требует. Ключевое слово совпадает в любом месте текста, поэтому «rage» находит кампанию «averageaden $5 Bonus»; карточка говорит, какое это было слово, чтобы ни одна не появлялась без объяснения. Награды, которые у тебя уже есть, отмечаются галочкой и зачёркиваются по одной, а бейдж, в котором больше нечего получать, теряет своё время просмотра. То, что уже заработано, но не забрано, выделено отдельно значком 🎁 —без затемнения—, потому что не хватает лишь клика, и предупреждение о закрытии их тоже считает. То, что вот-вот закроется, идёт первым: когда у награды, которой у тебя ещё нет, остаётся меньше 72 часов, её карточка говорит, сколько времени осталось и сколько просмотра тебе не хватает —красным при менее чем 24 часах— или что уже не успеть, и тот же ⏳ появляется на карточке кампании на странице. Предстоящие кампании тоже несут свои награды и стоимость каждого уровня, но никогда срок: до открытия ничто не срочно, а обратный отсчёт за день до этого только пугает. И закрытая кампания, которую ты уже полностью забрал, не перечисляется, потому что Kick переносит её в забранные: панель не показывает строк, которых нет на странице. Ключевые слова редактируются: нажми на одно, чтобы удалить, + чтобы добавить, отредактируй их списком или верни значения по умолчанию. Ключевое слово, которое начинается с «-», исключает: «-console» убирает кампанию, даже если её нашло другое слово, и уносит с собой подсветку, карточку и уведомление. А четыре фильтра вида сокращают список открытых, не трогая ничего другого —что тебе ещё осталось, что скоро закроется, что заработано и не забрано, и что берётся за час или меньше—: они складываются, запоминаются, и вкладка говорит, сколько карточек показано из скольких есть. Список открытых сортируется по тому, что закроется раньше, или по тому, что требует меньше времени — как выберешь. И каждая открытая кампания несёт на своей карточке на странице время, которого тебе не хватает, чтобы забрать всё оставшееся —её самую дорогую награду, потому что время просмотра считается по кампании—, чтобы цена была видна при прокрутке. Открытые и предстоящие кампании копируются как текст по 🔗: название, даты и награды, со ссылкой на вкладку, где они живут —кампании или предстоящие—, потому что в Kick у кампании нет собственного адреса. Если твои данные о забранном и просмотренном так и не придут —без них не узнать, что у тебя есть и сколько ты посмотрел—, панель скажет об этом, вместо того чтобы молчать с погашенными отметками. Везде, где Kick рисует полосу прогресса, наведение мыши говорит, сколько именно просмотра тебе не хватает, а клик открывает подробности дропа. Вкладка забранного получает собственную сетку, которая вдобавок говорит, как давно ты получил каждую вещь, и заменяет список Kick, чтобы одно и то же не показывалось дважды. Галочка скрывает завершённое и включает автоматическое получение — и законченных дропов, и ежедневного сундука, который Kick даёт за просмотр стримов (и который не является дропом): сундук открывается, только когда награда действительно доступна, он определяется без опоры на язык, и проверяется всегда после дропов, никогда посреди них. И среди завершённого, которое она скрывает, есть уже забранная награда, которую Kick оставляет на странице пустой плиткой: то, что она забрана, решают твои данные о забранном, а не форма страницы. И сундук появляется ещё и как плитка в этой сетке, с полосой прогресса Kick: сколько минут просмотра ему не хватает —наведение мыши это говорит, а клик открывает его окно, ничего не забирая—, что он заберётся сам по достижении цели, и —как только можно— кнопка, которая забирает его и оставляет результат Kick открытым. И только сегодняшний: когда окно дня закрывается, плитка исчезает до прихода нового задания. Отмечает значком 🔔 —в панели и на самой карточке— кампании, изменившиеся с прошлого раза, со счётчиком непросмотренных, уведомлением рабочего стола и кнопкой 👁️, которая помечает их как просмотренные и ведёт тебя во вкладку кампаний. 16 языков.",
                scriptInfoAuthor: "Автор:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "Читаем изменения дропов из API...",
                earnedUnclaimed: "получено, не забрано",
                urgentUnclaimed: "не забрано",
                filterPending: "Есть незавершённые",
                filterSoon: "Скоро закроется",
                filterUnclaimed: "Не забрано",
                filterQuick: "Уровень ≤ 1 ч",
                filterBarHint: "Фильтрует только вкладку активных. Несколько фильтров складываются.",
                noResultsFiltered: "Ничего не проходит активные фильтры.",
                clearFilters: "Убрать фильтры",
                negativeKeywordHint: "напишите -слово, чтобы исключить",
                sortLabel: "Сортировка:",
                sortUrgent: "Скоро закрывается",
                sortCheapest: "Самое дешёвое",
                sortCheapestHint: "Сортирует по тому, что требует меньше всего, чтобы получить хоть что-то. ⏱ на карточке — другой расчёт: сколько стоит забрать всё.",
                noInventoryData: "Нет инвентаря: неизвестно, что получено и сколько просмотрено.",
                dailyStreakReminder: "Ежедневная награда: просмотрено {done} из {total} мин. Не теряйте серию сегодня.",
                urgentClosesIn: "закроется через",
                urgentNeed: "осталось",
                urgentNoTime: "не успеешь",
                claimedInventoryTitle: "Востребованные",
                shareCopy: "Скопировать, чтобы поделиться",
                collapsePanel: "Скрыть панель",
                expandPanel: "Показать панель",
                dismissDailyReminder: "Не напоминать до завтра",
                dailyRewardTitle: "Ежедневная награда",
                dailyRewardAuto: "Забирается сама, когда время выйдет",
                dailyRewardClaim: "Забрать",
                shareCopied: "Скопировано"



            },
            tr: {
                scriptInfoPrivacyText: "Anahtar kelimelerin ve ayarların yalnızca tarayıcında kalır. Drop ve envanter sorguları yalnızca Kick’in kendi API’sine (web.kick.com) gider ve var olan oturumunu kullanır; token bellekte tutulur, diske hiç yazılmaz. Üçüncü taraf yoktur ve betiğin yazarına hiçbir şey gönderilmez.",
                minutesShort: "dk",
                dropDetails: "Drop ayrıntısı",
                rewards: "Ödüller",
                progress: "İlerleme",
                timeRemaining: "Kalan süre",
                urgentMinimum: "en az",
                remainingToFinish: "buradaki her şeyi almak için kalan süre",
                scriptInfoPrivacy: "Gizlilik:",
                addKeyword: "Anahtar Kelime Ekle",
                deleteKeywordTooltip: "Silmek için tıklayın", deleteKeywordQuestion: "Anahtar kelimeyi sil ",
                editKeywords: "Anahtar Kelimeleri Düzenle", resetKeywords: "Varsayılana Sıfırla",
                confirmReset: "Anahtar kelimeleri varsayılana sıfırla?",
                keywordsRestored: "Anahtar kelimeler geri yüklendi. Yeniden yükleniyor...",
                keywordsModified: "Anahtar kelimeler değişti. Şu anki liste: ",
                reloading: "Yeniden yükleniyor...", currentKeywords: "Mevcut anahtar kelimeler (silmek için tıklayın):",
                noResults: "Anahtar kelimelerinize uygun drop bulunamadı.",
                dropsActive: "Açık Drops", dropsExpired: "Kapalı Drops",
                dropsUpcoming: "Yaklaşan Drops",
                editPrompt: "Virgülle ayrılmış anahtar kelimeler:",
                searching: "Aranıyor", reload: "Dropları yeniden yükle",
                hideExpired: "Kapananları/tamamlananları envanterden gizle, dropları otomatik al",
                changes_detected: "Değişiklik bulundu", viewed: "Göster",
                markAllAsViewed: "Tümünü görüldü işaretle",
                accept: "Kabul et", cancel: "İptal", yes: "Evet", no: "Hayır",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Script Bilgisi", scriptInfoName: "Ad:",
                scriptInfoVersion: "Sürüm:", scriptInfoDescription: "Açıklama:",
                scriptInfoDescriptionText: "Anahtar kelimelerinle eşleşen drop kampanyalarını sayfanın kendisinde vurgular: kampanyalar sekmesinde yeşil, yaklaşanlarda mavi, kapananlarda kırmızı. Panel bunları açık, yaklaşan ve kapanmış olarak ayrı ayrı listeler —üçünü birden, çünkü onları API'den okur: Kick'in sekmeleri sayfayı yeniden yükler, dolayısıyla yalnızca önündekini okuyarak üçü bir arada asla görülmez—, tarih aralığı, eşleşen anahtar kelime ve her ödül ile istediği saatlerle birlikte. Bir anahtar kelime metnin herhangi bir yerinde eşleşir, bu yüzden «rage» «averageaden $5 Bonus» adlı bir kampanyayı bulur; kart hangi kelime olduğunu söyler, böylece hiçbiri nedenini açıklamadan ortaya çıkmaz. Zaten sahip olduğun ödüller tek tek işaretlenip üstü çizilir ve kazanılacak bir şeyi kalmayan rozet, istediği izleme süresini bırakır. Kazandığın ama henüz almadığın şey 🎁 ile ayrı işaretlenir —soluklaştırılmadan—, çünkü yalnızca bir tık kalmıştır, ve kapanış uyarısı onları da sayar. Kapanmak üzere olan öne geçer: henüz sahip olmadığın bir ödülün süresi 72 saatin içine girdiğinde, kartı ne kadar kaldığını ve daha ne kadar izlemen gerektiğini söyler —24 saatin altında kırmızı— ya da artık yetişmeyeceğini, ve aynı ⏳ sayfadaki kampanya kartına da düşer. Yaklaşan kampanyalar da ödüllerini ve her kademenin maliyetini taşır, ama asla bir süre sınırı taşımaz: açılmadan önce hiçbir şey acele değildir ve bir gün önceki geri sayım yalnızca telaş yaratır. Ve tamamını aldığın kapanmış bir kampanya listelenmez, çünkü Kick onu alınanlara taşır: panel, sayfada olmayan satırları göstermez. Anahtar kelimeler düzenlenebilir: silmek için birine tıkla, eklemek için +, topluca düzenle ya da varsayılanlara döndür. «-» ile başlayan bir anahtar kelime dışlar: «-console», başka bir kelime bulmuş olsa bile kampanyayı eler ve vurguyu, kartı ve uyarıyı da beraberinde götürür. Ve dört görünüm filtresi açıkların listesini başka hiçbir şeye dokunmadan kısaltır —hâlâ eksiğin olan, yakında kapanan, kazanıp almadığın ve bir saat veya daha kısa sürede alınan—: birbirine eklenir, hatırlanır, ve sekme kaç karttan kaçının göründüğünü söyler. Açıkların listesi önce kapanana ya da en az zaman isteyene göre sıralanır, senin seçimin. Ve her açık kampanya, sayfadaki kendi kartında, kalan her şeyi almak için sana gereken süreyi taşır —en pahalı ödülünü, çünkü izleme süresi kampanya başınadır—, böylece maliyet kaydırırken görünür. Açık ve yaklaşan kampanyalar 🔗 ile metin olarak kopyalanabilir: başlık, tarihler ve ödüller, yaşadıkları sekmeye bir bağlantıyla —kampanyalar ya da yaklaşanlar— çünkü Kick'te bir kampanyanın kendine ait adresi yoktur. Alınan ve izlenen verilerin hiç gelmezse —onlarsız neye sahip olduğun ve ne kadar izlediğin bilinemez— panel bunu söyler, işaretleri sönük bırakıp susmak yerine. Kick'in ilerleme çubuğu çizdiği her yerde, üzerine gelmek tam olarak ne kadar izleme süresi kaldığını söyler ve tıklamak drop ayrıntısını açar. Alınanlar sekmesi kendi ızgarasını kazanır; bu ızgara ayrıca her şeyi ne kadar zaman önce aldığını söyler ve aynı şey iki kez görünmesin diye Kick'in listesinin yerine geçer. Onay kutusu tamamlananları gizler ve otomatik almayı açar: hem biten drop'ları hem de Kick'in yayın izlediğin için verdiği günlük ödül sandığını (ki bu bir drop değildir): sandık yalnızca ödül gerçekten kullanılabilir olduğunda açılır, dile bağlı olmadan algılanır ve her zaman drop'lardan sonra denetlenir, asla aralarında. Ve gizlediği tamamlananlar arasında zaten aldığın ödül de var; Kick onu sayfada çıplak bir karo olarak bırakır: alındığına karar veren şey senin alınan verilerindir, sayfanın biçimi değil. Ve sandık bu ızgarada bir kutu olarak da çıkar, Kick'in ilerleme çubuğuyla: kaç izleme dakikası kaldığını —fare üzerine gelince söyler, tıklamak ise hiçbir şey almadan penceresini açar—, süre dolunca kendiliğinden alınacağını ve —alınabildiği anda— onu alıp Kick'in sonucunu açık bırakan bir düğmeyi gösterir. Ve yalnızca bugünküyü: günün penceresi kapandığında kutu, yeni görev gelene kadar kaybolur. Son baktığından beri değişen kampanyaları 🔔 ile işaretler —panelde ve kartın kendisinde—, bekleyen sayısı, masaüstü bildirimi ve onları görüldü sayıp seni kampanyalar sekmesine götüren bir 👁️ düğmesiyle. 16 dil.",
                scriptInfoAuthor: "Yazar:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "Drop değişiklikleri API’den okunuyor...",
                earnedUnclaimed: "kazanıldı, alınmadı",
                urgentUnclaimed: "alınmadı",
                filterPending: "Eksiği var",
                filterSoon: "Yakında kapanıyor",
                filterUnclaimed: "Alınmadı",
                filterQuick: "Kademe ≤ 1 sa.",
                filterBarHint: "Yalnızca etkin sekmesini filtreler. Birden fazla filtre birleşir.",
                noResultsFiltered: "Etkin filtrelere uyan bir şey yok.",
                clearFilters: "Filtreleri kaldır",
                negativeKeywordHint: "hariç tutmak için -kelime yazın",
                sortLabel: "Sıralama:",
                sortUrgent: "Önce kapananlar",
                sortCheapest: "Önce en ucuz",
                sortCheapestHint: "Bir şey almak için en az isteyene göre sıralar. Karttaki ⏱ başka bir hesap: her şeyi almanın maliyeti.",
                noInventoryData: "Envanter yok: neye sahip olduğun ve ne kadar izlediğin bilinmiyor.",
                dailyStreakReminder: "Günlük ödül: {total} dakikanın {done} dakikası izlendi. Bugün serini kaybetme.",
                urgentClosesIn: "kapanışa",
                urgentNeed: "kalan",
                urgentNoTime: "zaman yetmiyor",
                claimedInventoryTitle: "Talep Edilenler",
                shareCopy: "Paylaşmak için kopyala",
                collapsePanel: "Paneli gizle",
                expandPanel: "Paneli göster",
                dismissDailyReminder: "Yarına kadar sessize al",
                dailyRewardTitle: "Günlük ödül",
                dailyRewardAuto: "Süre dolduğunda kendiliğinden alınır",
                dailyRewardClaim: "Al",
                shareCopied: "Kopyalandı"



            },
            ja: {
                scriptInfoPrivacyText: "キーワードと設定はブラウザー内にのみ保存されます。ドロップとインベントリの問い合わせは Kick 自身の API (web.kick.com) にのみ送られ、既存のセッションを再利用します。トークンはメモリー上に保持され、ディスクに書き込まれることはありません。第三者は関与せず、スクリプトの作者には何も送信されません。",
                minutesShort: "分",
                dropDetails: "ドロップの詳細",
                rewards: "報酬",
                progress: "進捗",
                timeRemaining: "残り時間",
                urgentMinimum: "最低",
                remainingToFinish: "ここのすべてを受け取るのに足りない分",
                scriptInfoPrivacy: "プライバシー:",
                addKeyword: "キーワード追加",
                deleteKeywordTooltip: "クリックで削除", deleteKeywordQuestion: "キーワードを削除 ",
                editKeywords: "キーワード編集", resetKeywords: "デフォルトに戻す",
                confirmReset: "キーワードをデフォルトに戻しますか？",
                keywordsRestored: "キーワード復元。再読み込み中...",
                keywordsModified: "キーワードを変更しました。現在のキーワード: ",
                reloading: "再読み込み中...", currentKeywords: "現在のキーワード（クリックで削除）:",
                noResults: "キーワードに一致するドロップはありません。",
                dropsActive: "アクティブなドロップ", dropsExpired: "終了したドロップ",
                dropsUpcoming: "近日公開のドロップ",
                editPrompt: "カンマ区切りのキーワード:",
                searching: "検索中", reload: "ドロップを再読み込み",
                hideExpired: "終了・完了済みをインベントリから隠す、ドロップの自動受け取り",
                changes_detected: "変更を検出", viewed: "表示",
                markAllAsViewed: "すべて既読にする",
                accept: "承認", cancel: "キャンセル", yes: "はい", no: "いいえ",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "スクリプト情報", scriptInfoName: "名前:",
                scriptInfoVersion: "バージョン:", scriptInfoDescription: "説明:",
                scriptInfoDescriptionText: "キーワードに一致するドロップキャンペーンをページ上で直接ハイライトします。キャンペーンのタブでは緑、近日公開では青、終了済みでは赤です。パネルは進行中・近日公開・終了済みに分けて一覧にします —三つを同時に。APIから読むからです。Kickのタブはページを再読み込みするので、目の前にあるものだけを読んでいては三つが揃うことはありません—。期間、一致したキーワード、そして各報酬と必要な時間も表示します。キーワードは文中のどこでも一致するので、「rage」は「averageaden $5 Bonus」というキャンペーンを見つけます。どのキーワードだったかはカードが示すので、理由の分からないまま出てくるものはありません。すでに持っている報酬は一つずつチェックが付いて取り消し線が引かれ、獲得するものが残っていないバッジからは必要時間の表示が消えます。獲得済みでまだ受け取っていないものは 🎁 を付けて別扱いにし、薄くはしません。あと一クリックで済むからです。終了間近の警告にも数えられます。閉じそうなものが先に来ます。まだ持っていない報酬の残り時間が72時間を切ると、そのカードは残り時間とあと何時間の視聴が必要かを示し —24時間未満は赤—、間に合わない場合はそう伝えます。同じ ⏳ がページ上のキャンペーンのカードにも付きます。近日公開のキャンペーンも、その報酬と各段階に必要な時間を表示しますが、期限は表示しません。始まる前に急ぐものは何もなく、前日のカウントダウンは不安をあおるだけです。そして、すでにすべて受け取った終了済みのキャンペーンは一覧に出ません。Kickがそれを受け取り済みに移すからです。ページにない行をパネルが見せることはありません。キーワードは編集できます。クリックで削除、+ で追加、まとめて編集、既定値に戻すこともできます。「-」で始まるキーワードは除外します。「-console」は他のキーワードが見つけていたとしてもそのキャンペーンを外し、ハイライトもカードも通知も一緒に消します。さらに四つの表示フィルターが、ほかに何も触れずに進行中の一覧だけを絞り込みます —まだ残っているもの、まもなく終了するもの、獲得済みで未受け取りのもの、一時間以内で取れるもの—。条件は重ねて効き、記憶され、タブには何件中何件が表示されているかが出ます。進行中の一覧は、先に終わる順か、必要時間が少ない順かを選べます。そして進行中の各キャンペーンは、ページ上の自分のカードに、残りをすべて取るのに必要な時間を表示します —その中で最も高い報酬の時間です。視聴時間はキャンペーン単位で数えられるためです—。スクロールしながら必要な時間が見えるようにするためです。進行中と近日公開のキャンペーンは 🔗 でテキストとしてコピーできます。タイトル、日付、報酬、そしてそれが置かれているタブへのリンク付きです —キャンペーンか近日公開か—。Kickではキャンペーンに固有のアドレスがないからです。受け取り済みと視聴時間のデータが届かない場合 —それがなければ何を持っていてどれだけ見たか分かりません— パネルはマークを消したまま黙るのではなく、そのことを伝えます。Kickが進捗バーを描く場所では、マウスを重ねるとあと何分の視聴が必要かが正確に分かり、クリックするとドロップの詳細が開きます。受け取り済みのタブには独自のグリッドが表示され、それぞれをいつ入手したかも分かります。同じものを二度見せないよう、Kickの一覧を置き換えます。チェックボックスは完了したものを隠し、自動受け取りを有効にします。終了したドロップだけでなく、Kickが配信の視聴に対して与える毎日の報酬の宝箱（これはドロップではありません）も対象です。宝箱は報酬が実際に利用できるときだけ開かれ、言語に依存せずに検出され、常にドロップのあとに確認されます。途中では決して行いません。隠される「完了したもの」には、すでに受け取った報酬も含まれます。Kick はそれをページ上に画像と名前だけのタイルとして残しますが、受け取り済みかどうかを決めるのはあなたの受け取りデータで、ページの形ではありません。さらにこの宝箱も一覧のタイルとして並びます: Kick の進捗バー付きで、残りの視聴分数—マウスを重ねると分かり、クリックすると何も受け取らずにその画面が開きます—、終わったら自動で受け取ること、そして受け取れるようになったら —Kick の結果を開いたまま残す— 受け取りボタンを表示します。出すのは今日の分だけで、その日の期限が過ぎるとタイルは消え、新しい挑戦が届くまで出ません。前回見たときから変わったキャンペーンには 🔔 を付け —パネルにもカード自体にも—、未確認の件数、デスクトップ通知、そして既読にしてキャンペーンのタブへ移動する 👁️ ボタンも用意しています。16言語対応。",
                scriptInfoAuthor: "作者:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "API からドロップの変更を読み込み中...",
                earnedUnclaimed: "獲得済み、未受け取り",
                urgentUnclaimed: "未受け取り",
                filterPending: "未完了あり",
                filterSoon: "まもなく終了",
                filterUnclaimed: "未受け取り",
                filterQuick: "1時間以内の枠",
                filterBarHint: "「進行中」タブのみを絞り込みます。複数の条件は重ねて適用されます。",
                noResultsFiltered: "有効な絞り込みに合うものがありません。",
                clearFilters: "絞り込みを解除",
                negativeKeywordHint: "除外するには -単語 と入力",
                sortLabel: "並び順:",
                sortUrgent: "終了が近い順",
                sortCheapest: "安い順",
                sortCheapestHint: "何か一つ手に入れるのに一番時間がかからない順に並べます。カードの⏱は別の数字で、すべて手に入れるのにかかる時間です。",
                noInventoryData: "インベントリなし: 所持状況と視聴時間が不明です。",
                dailyStreakReminder: "デイリー報酬: {total} 分のうち {done} 分視聴。今日の連続記録を切らさないように。",
                urgentClosesIn: "終了まで",
                urgentNeed: "残り",
                urgentNoTime: "時間が足りません",
                claimedInventoryTitle: "受け取り済み",
                shareCopy: "共有用にコピー",
                collapsePanel: "パネルを隠す",
                expandPanel: "パネルを表示",
                dismissDailyReminder: "明日まで通知しない",
                dailyRewardTitle: "デイリー報酬",
                dailyRewardAuto: "時間が終わると自動で受け取ります",
                dailyRewardClaim: "受け取る",
                shareCopied: "コピーしました"



            },
            ko: {
                scriptInfoPrivacyText: "키워드와 설정은 브라우저에만 저장됩니다. 드롭과 인벤토리 조회는 Kick 자체 API(web.kick.com)로만 가며 기존 세션을 재사용합니다. 토큰은 메모리에만 두고 디스크에 기록하지 않습니다. 제3자는 관여하지 않으며 스크립트 작성자에게 아무것도 전송되지 않습니다.",
                minutesShort: "분",
                dropDetails: "드롭 상세",
                rewards: "보상",
                progress: "진행도",
                timeRemaining: "남은 시간",
                urgentMinimum: "최소",
                remainingToFinish: "여기 있는 전부를 받으려면 남은 시간",
                scriptInfoPrivacy: "개인정보:",
                addKeyword: "키워드 추가",
                deleteKeywordTooltip: "클릭하여 삭제", deleteKeywordQuestion: "키워드 삭제 ",
                editKeywords: "키워드 편집", resetKeywords: "기본값 복원",
                confirmReset: "키워드를 기본값으로 복원하시겠습니까?",
                keywordsRestored: "키워드 복원됨. 새로고침 중...",
                keywordsModified: "키워드를 변경했습니다. 현재 키워드: ",
                reloading: "새로고침 중...", currentKeywords: "현재 키워드 (클릭하여 삭제):",
                noResults: "키워드와 일치하는 드롭이 없습니다.",
                dropsActive: "활성 드롭", dropsExpired: "종료된 드롭",
                dropsUpcoming: "예정된 드롭",
                editPrompt: "쉼표로 구분된 키워드:",
                searching: "검색 중", reload: "드롭 새로고침",
                hideExpired: "종료·완료된 항목을 인벤토리에서 숨기기, 드롭 자동 수령",
                changes_detected: "변경 사항 감지", viewed: "표시",
                markAllAsViewed: "모두 확인함으로 표시",
                accept: "수락", cancel: "취소", yes: "예", no: "아니오",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "스크립트 정보", scriptInfoName: "이름:",
                scriptInfoVersion: "버전:", scriptInfoDescription: "설명:",
                scriptInfoDescriptionText: "키워드와 일치하는 드롭 캠페인을 페이지에서 바로 강조합니다. 캠페인 탭에서는 초록색, 예정 탭에서는 파란색, 종료 탭에서는 빨간색입니다. 패널은 진행 중, 예정, 종료로 나누어 보여줍니다 —세 가지를 한꺼번에. API에서 읽어오기 때문입니다. Kick의 탭은 페이지를 새로 불러오므로 눈앞에 있는 것만 읽어서는 세 가지를 함께 볼 수 없습니다—. 기간, 일치한 키워드, 그리고 각 보상과 필요한 시간도 함께 표시합니다. 키워드는 텍스트의 어느 위치에서든 일치하므로 「rage」는 「averageaden $5 Bonus」라는 캠페인을 찾아냅니다. 어떤 키워드였는지는 카드가 알려주므로 이유 없이 나타나는 항목은 없습니다. 이미 보유한 보상은 하나씩 체크되고 취소선이 그어지며, 더 얻을 것이 없는 배지에서는 요구 시간 표시가 사라집니다. 이미 획득했지만 수령하지 않은 것은 🎁 로 따로 표시하고 흐리게 하지 않습니다. 클릭 한 번만 남았기 때문이며, 종료 경고도 이를 함께 셉니다. 곧 닫히는 것이 먼저 옵니다. 아직 없는 보상의 남은 시간이 72시간 이내로 들어오면, 그 카드는 얼마나 남았는지와 시청 시간이 얼마나 더 필요한지 알려주고 —24시간 미만이면 빨간색— 시간이 부족하면 그렇다고 말합니다. 같은 ⏳ 가 페이지의 캠페인 카드에도 붙습니다. 예정된 캠페인도 보상과 각 단계에 필요한 시간을 함께 보여주지만 기한은 보여주지 않습니다. 시작하기 전에는 급할 것이 없고, 하루 전 카운트다운은 불안만 줍니다. 그리고 이미 전부 수령한 종료된 캠페인은 목록에 나오지 않습니다. Kick이 그것을 수령함으로 옮기기 때문이며, 패널은 페이지에 없는 항목을 보여주지 않습니다. 키워드는 편집할 수 있습니다. 클릭하면 삭제, + 로 추가, 한꺼번에 편집하거나 기본값으로 되돌릴 수 있습니다. 「-」로 시작하는 키워드는 제외합니다. 「-console」은 다른 키워드가 찾았더라도 그 캠페인을 빼고, 강조와 카드와 알림까지 함께 없앱니다. 그리고 네 개의 보기 필터가 다른 것은 건드리지 않고 진행 중 목록만 추립니다 —아직 남은 것, 곧 끝나는 것, 획득했지만 수령하지 않은 것, 한 시간 이하로 얻을 수 있는 것—. 조건은 겹쳐서 적용되고 기억되며, 탭에는 전체 중 몇 개가 보이는지 나옵니다. 진행 중 목록은 먼저 끝나는 순서나 시간이 가장 적게 드는 순서로 정렬할 수 있습니다. 그리고 진행 중인 각 캠페인은 페이지의 자기 카드에 남은 것을 모두 가져가는 데 필요한 시간을 표시합니다 —가장 비싼 보상 기준입니다. 시청 시간은 캠페인 단위로 세기 때문입니다—. 스크롤하면서 비용이 보이도록 하기 위해서입니다. 진행 중과 예정 캠페인은 🔗 로 텍스트로 복사할 수 있습니다. 제목, 날짜, 보상, 그리고 그것이 있는 탭 —캠페인 또는 예정— 으로의 링크가 함께 들어갑니다. Kick에서는 캠페인에 고유 주소가 없기 때문입니다. 수령 및 시청 데이터가 끝내 도착하지 않으면 —그것이 없으면 무엇을 가졌는지, 얼마나 봤는지 알 수 없습니다— 패널은 표시를 끈 채 침묵하는 대신 그 사실을 알려줍니다. Kick이 진행률 막대를 그리는 곳이면 어디든 마우스를 올리면 시청 시간이 정확히 얼마나 남았는지 알려주고, 클릭하면 드롭 상세가 열립니다. 수령 탭에는 자체 그리드가 생기며, 각각을 언제 얻었는지도 알려주고, 같은 것을 두 번 보여주지 않도록 Kick의 목록을 대체합니다. 체크박스는 완료된 것을 숨기고 자동 수령을 켭니다. 끝난 드롭뿐 아니라 Kick이 스트림 시청에 대해 주는 매일 보상 상자(이것은 드롭이 아닙니다)도 대상입니다. 상자는 보상이 실제로 이용 가능할 때만 열리고, 언어에 의존하지 않고 감지되며, 항상 드롭 다음에 확인되고 그 중간에는 하지 않습니다. 숨기는 완료된 항목에는 이미 수령한 보상도 포함됩니다. Kick은 그것을 페이지에 이미지와 이름만 남은 타일로 남겨두지만, 수령 여부를 결정하는 것은 당신의 수령 데이터이며 페이지의 형태가 아닙니다. 그리고 이 상자도 그 격자의 타일로 함께 나옵니다: Kick의 진행 막대와 함께, 남은 시청 분수—마우스를 올리면 알려주고, 클릭하면 아무것도 수령하지 않은 채 그 창이 열립니다—, 다 되면 알아서 수령한다는 안내, 그리고 수령할 수 있게 되면 —Kick의 결과 창을 그대로 열어 두는— 수령 버튼을 보여줍니다. 그리고 오늘 것만: 하루 창이 닫히면 타일은 새 도전이 올 때까지 사라집니다. 지난번 이후 바뀐 캠페인은 🔔 로 표시하고 —패널과 카드 자체 모두— 대기 중인 개수, 데스크톱 알림, 그리고 확인 처리하고 캠페인 탭으로 이동시키는 👁️ 버튼도 제공합니다. 16개 언어 지원.",
                scriptInfoAuthor: "작성자:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "API에서 드롭 변경 사항을 읽는 중...",
                earnedUnclaimed: "획득함, 미수령",
                urgentUnclaimed: "미수령",
                filterPending: "남은 항목",
                filterSoon: "곧 종료",
                filterUnclaimed: "미수령",
                filterQuick: "1시간 이하 단계",
                filterBarHint: "‘진행 중’ 탭만 걸러냅니다. 여러 조건은 함께 적용됩니다.",
                noResultsFiltered: "활성 필터에 맞는 항목이 없습니다.",
                clearFilters: "필터 해제",
                negativeKeywordHint: "제외하려면 -단어 입력",
                sortLabel: "정렬:",
                sortUrgent: "종료 임박순",
                sortCheapest: "저렴한 순",
                sortCheapestHint: "무언가 하나를 얻는 데 가장 적게 드는 순서로 정렬합니다. 카드의 ⏱는 다른 계산으로, 전부 받는 데 드는 시간입니다.",
                noInventoryData: "인벤토리 없음: 보유 여부와 시청 시간을 알 수 없습니다.",
                dailyStreakReminder: "일일 보상: {total}분 중 {done}분 시청. 오늘 연속 기록을 놓치지 마세요.",
                urgentClosesIn: "종료까지",
                urgentNeed: "남은 시간",
                urgentNoTime: "시간이 부족",
                claimedInventoryTitle: "수령 완료",
                shareCopy: "공유용으로 복사",
                collapsePanel: "패널 숨기기",
                expandPanel: "패널 표시",
                dismissDailyReminder: "내일까지 알리지 않기",
                dailyRewardTitle: "일일 보상",
                dailyRewardAuto: "시간이 끝나면 자동으로 수령합니다",
                dailyRewardClaim: "수령",
                shareCopied: "복사됨"



            },
            pl: {
                scriptInfoPrivacyText: "Twoje słowa kluczowe i ustawienia zostają tylko w przeglądarce. Zapytania o dropy i ekwipunek idą wyłącznie do własnego API Kicka (web.kick.com) i korzystają z twojej istniejącej sesji; token trzymany jest w pamięci i nigdy nie jest zapisywany na dysku. Nie ma żadnych osób trzecich i nic nie jest wysyłane do autora skryptu.",
                minutesShort: "min",
                dropDetails: "Szczegóły dropu",
                rewards: "Nagrody",
                progress: "Postęp",
                timeRemaining: "Pozostały czas",
                urgentMinimum: "minimum",
                remainingToFinish: "ile brakuje, żeby zabrać stąd wszystko",
                scriptInfoPrivacy: "Prywatność:",
                addKeyword: "Dodaj słowo kluczowe",
                deleteKeywordTooltip: "Kliknij aby usunąć", deleteKeywordQuestion: "Usunąć słowo kluczowe ",
                editKeywords: "Edytuj słowa kluczowe", resetKeywords: "Przywróć domyślne",
                confirmReset: "Przywrócić domyślne słowa kluczowe?",
                keywordsRestored: "Słowa kluczowe przywrócone. Przeładowywanie...",
                keywordsModified: "Słowa kluczowe zmienione. Aktualne: ",
                reloading: "Przeładowywanie...", currentKeywords: "Aktualne słowa kluczowe (kliknij aby usunąć):",
                noResults: "Nie znaleziono dropów pasujących do słów kluczowych.",
                dropsActive: "Otwarte dropy", dropsExpired: "Zamknięte dropy",
                dropsUpcoming: "Nadchodzące dropy",
                editPrompt: "Słowa kluczowe oddzielone przecinkami:",
                searching: "Szukanie", reload: "Przeładuj dropy",
                hideExpired: "Ukryj zakończone/ukończone w ekwipunku, automatyczne odbieranie dropów",
                changes_detected: "Wykryto zmiany", viewed: "Pokaż",
                markAllAsViewed: "Oznacz wszystkie jako przejrzane",
                accept: "Akceptuj", cancel: "Anuluj", yes: "Tak", no: "Nie",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Informacje o skrypcie", scriptInfoName: "Nazwa:",
                scriptInfoVersion: "Wersja:", scriptInfoDescription: "Opis:",
                scriptInfoDescriptionText: "Podświetla na samej stronie kampanie dropów pasujące do twoich słów kluczowych: zielono w zakładce kampanii, niebiesko w nadchodzących, czerwono w zakończonych. Panel wypisuje je w podziale na otwarte, nadchodzące i zakończone —wszystkie trzy naraz, bo czyta je z API: zakładki Kicka przeładowują stronę, więc czytając tylko to, co masz przed sobą, nigdy nie zobaczyłbyś ich razem—, wraz z zakresem dat, słowem kluczowym, które trafiło, i każdą nagrodą z godzinami, których wymaga. Słowo kluczowe pasuje w dowolnym miejscu tekstu, więc „rage“ znajduje kampanię o nazwie „averageaden $5 Bonus“; karta mówi, które to było słowo, żeby żadna nie pojawiała się bez wyjaśnienia. Nagrody, które już masz, są odhaczane i przekreślane pojedynczo, a odznaka, w której nie ma już nic do zdobycia, traci swój czas oglądania. To, co już zdobyłeś, ale nie odebrałeś, jest oznaczone osobno przez 🎁 —bez przygaszania—, bo brakuje tylko kliknięcia, a ostrzeżenie o zamknięciu też je liczy. Najpierw idzie to, co zaraz się kończy: gdy nagrodzie, której jeszcze nie masz, zostaje mniej niż 72 godziny, jej karta mówi, ile zostało i ile oglądania ci brakuje —czerwono poniżej 24 godzin— albo że już się nie zmieści, a to samo ⏳ ląduje na karcie kampanii na stronie. Nadchodzące kampanie niosą także swoje nagrody i to, ile kosztuje każdy próg, ale nigdy terminu: przed startem nic nie jest pilne, a odliczanie dzień wcześniej tylko niepokoi. A zakończona kampania, którą już w całości odebrałeś, nie jest wypisywana, bo Kick przenosi ją do odebranych: panel nie pokazuje wierszy, których nie ma na stronie. Słowa kluczowe można edytować: kliknij, żeby usunąć, + żeby dodać, edytuj je hurtem albo przywróć domyślne. Słowo zaczynające się od „-“ wyklucza: „-console“ wyrzuca kampanię, nawet jeśli znalazło ją inne słowo, i zabiera ze sobą podświetlenie, kartę i powiadomienie. A cztery filtry widoku skracają listę otwartych, nie ruszając niczego innego —co ci jeszcze zostało, co niedługo się kończy, co zdobyłeś i nie odebrałeś, oraz co da się wziąć w godzinę lub krócej—: sumują się, są zapamiętywane, a zakładka mówi, ile kart widać z ilu jest. Lista otwartych sortuje się według tego, co kończy się pierwsze, albo według tego, co wymaga najmniej czasu — jak wolisz. I każda otwarta kampania niesie na swojej karcie na stronie czas, którego ci brakuje, żeby zabrać wszystko, co zostało —swoją najdroższą nagrodę, bo czas oglądania liczy się per kampania—, żeby koszt było widać podczas przewijania. Kampanie otwarte i nadchodzące kopiuje się jako tekst przez 🔗: tytuł, daty i nagrody, z linkiem do zakładki, w której żyją —kampanie albo nadchodzące— bo w Kicku kampania nie ma własnego adresu. Jeśli twoje dane o odebranym i obejrzanym nigdy nie dotrą —bez nich nie wiadomo, co masz ani ile obejrzałeś— panel to powie, zamiast milczeć z wygaszonymi oznaczeniami. Wszędzie tam, gdzie Kick rysuje pasek postępu, najechanie myszą mówi dokładnie, ile oglądania ci brakuje, a kliknięcie otwiera szczegóły dropa. Zakładka odebranych dostaje własną siatkę, która mówi dodatkowo, jak dawno zdobyłeś każdą rzecz, i zastępuje listę Kicka, żeby to samo nie było pokazywane dwa razy. Pole wyboru ukrywa to, co ukończone, i włącza automatyczne odbieranie — zarówno skończonych dropów, jak i codziennej skrzyni, którą Kick daje za oglądanie streamów (a która dropem nie jest): skrzynia otwiera się tylko wtedy, gdy nagroda naprawdę jest dostępna, wykrywa się ją bez oglądania na język, i sprawdza się ją zawsze po dropach, nigdy w ich trakcie. A to, co ukrywa, obejmuje też nagrodę, którą już odebrałeś i którą Kick zostawia na stronie jako pusty kafelek: o tym, że jest odebrana, decydują twoje dane o odebranym, a nie kształt strony. A skrzynia pojawia się też jako kolejny kafelek tej siatki, z paskiem postępu Kicka: ile minut obejrzenia jej brakuje —najechanie myszą to mówi, a kliknięcie otwiera jej okno, niczego nie odbierając—, że odbierze się sama na końcu i —gdy już można— przycisk, który ją odbiera i zostawia wynik Kicka otwarty. I tylko dzisiejsza: po zamknięciu okna dnia kafelek znika, aż przyjdzie nowe zadanie. Kampanie, które zmieniły się od ostatniego razu, oznacza przez 🔔 —w panelu i na samej karcie— wraz z licznikiem oczekujących, powiadomieniem systemowym i przyciskiem 👁️, który uznaje je za obejrzane i przenosi cię do zakładki kampanii. 16 języków.",
                scriptInfoAuthor: "Autor:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "Czytanie zmian dropów z API...",
                earnedUnclaimed: "zdobyte, nieodebrane",
                urgentUnclaimed: "nieodebrane",
                filterPending: "Coś zostało",
                filterSoon: "Wkrótce koniec",
                filterUnclaimed: "Nieodebrane",
                filterQuick: "Próg ≤ 1 godz.",
                filterBarHint: "Filtruje tylko kartę aktywnych. Kilka filtrów sumuje się.",
                noResultsFiltered: "Nic nie przechodzi aktywnych filtrów.",
                clearFilters: "Usuń filtry",
                negativeKeywordHint: "wpisz -słowo, aby wykluczyć",
                sortLabel: "Sortowanie:",
                sortUrgent: "Najpierw kończące się",
                sortCheapest: "Najpierw najtańsze",
                sortCheapestHint: "Sortuje według tego, co wymaga najmniej, by cokolwiek zdobyć. ⏱ na karcie to inne wyliczenie: ile kosztuje zabranie wszystkiego.",
                noInventoryData: "Brak ekwipunku: nie wiadomo, co masz ani ile obejrzano.",
                dailyStreakReminder: "Nagroda dzienna: obejrzano {done} z {total} min. Nie strać dziś swojej serii.",
                urgentClosesIn: "kończy się za",
                urgentNeed: "brakuje",
                urgentNoTime: "za mało czasu",
                claimedInventoryTitle: "Odebrane",
                shareCopy: "Kopiuj, aby udostępnić",
                collapsePanel: "Ukryj panel",
                expandPanel: "Pokaż panel",
                dismissDailyReminder: "Wycisz do jutra",
                dailyRewardTitle: "Nagroda dzienna",
                dailyRewardAuto: "Odbierana sama, gdy czas się skończy",
                dailyRewardClaim: "Odbierz",
                shareCopied: "Skopiowano"



            },
            fi: {
                scriptInfoPrivacyText: "Avainsanasi ja asetuksesi pysyvät vain selaimessasi. Drop- ja inventaariokyselyt menevät ainoastaan Kickin omaan rajapintaan (web.kick.com) ja käyttävät olemassa olevaa istuntoasi; tunniste pidetään muistissa eikä sitä kirjoiteta koskaan levylle. Kolmansia osapuolia ei ole, eikä skriptin tekijälle lähetetä mitään.",
                minutesShort: "min",
                dropDetails: "Dropin tiedot",
                rewards: "Palkinnot",
                progress: "Edistyminen",
                timeRemaining: "Aikaa jäljellä",
                urgentMinimum: "vähintään",
                remainingToFinish: "paljonko puuttuu, jotta saat täältä kaiken",
                scriptInfoPrivacy: "Tietosuoja:",
                addKeyword: "Lisää avainsana",
                deleteKeywordTooltip: "Klikkaa poistaaksesi", deleteKeywordQuestion: "Poista avainsana ",
                editKeywords: "Muokkaa avainsanoja", resetKeywords: "Palauta oletukset",
                confirmReset: "Palauta avainsanat oletuksiin?",
                keywordsRestored: "Avainsanat palautettu. Ladataan uudelleen...",
                keywordsModified: "Avainsanat muutettu. Nykyiset: ",
                reloading: "Ladataan uudelleen...", currentKeywords: "Nykyiset avainsanat (klikkaa poistaaksesi):",
                noResults: "Avainsanoihin sopivia droppeja ei löytynyt.",
                dropsActive: "Avoimet dropit", dropsExpired: "Suljetut dropit",
                dropsUpcoming: "Tulevat dropit",
                editPrompt: "Avainsanat pilkulla eroteltuina:",
                searching: "Etsitään", reload: "Lataa dropit uudelleen",
                hideExpired: "Piilota päättyneet/valmiit inventaariosta, dropien automaattinen lunastus",
                changes_detected: "Muutoksia havaittu", viewed: "Näytä",
                markAllAsViewed: "Merkitse kaikki nähdyiksi",
                accept: "Hyväksy", cancel: "Peruuta", yes: "Kyllä", no: "Ei",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Skriptin tiedot", scriptInfoName: "Nimi:",
                scriptInfoVersion: "Versio:", scriptInfoDescription: "Kuvaus:",
                scriptInfoDescriptionText: "Korostaa avainsanoihisi osuvat drop-kampanjat itse sivulla: vihreä kampanjat-välilehdellä, sininen tulevissa, punainen päättyneissä. Paneeli listaa ne jaettuna avoimiin, tuleviin ja päättyneisiin —kaikki kolme kerralla, koska se lukee ne API:sta: Kickin välilehdet lataavat sivun uudelleen, joten pelkkää edessä olevaa lukemalla niitä ei näkisi koskaan yhdessä—, päivämääräikkunan, osuneen avainsanan ja jokaisen palkinnon vaatimine tunteineen. Avainsana osuu missä tahansa kohtaa tekstiä, joten ”rage” löytää kampanjan nimeltä ”averageaden $5 Bonus”; kortti kertoo, mikä avainsana se oli, jottei yksikään ilmesty selittämättä miksi. Palkinnot, jotka sinulla jo on, merkitään ja yliviivataan yksi kerrallaan, ja merkiltä, jossa ei ole enää mitään ansaittavaa, katoaa sen vaatima katseluaika. Se, minkä olet jo ansainnut mutta et lunastanut, merkitään erikseen 🎁-kuvakkeella —ei himmennettynä—, koska siitä puuttuu vain klikkaus, ja päättymisvaroitus laskee nekin mukaan. Pian päättyvä nousee ensimmäiseksi: kun palkinnolta, jota sinulla ei vielä ole, loppuu aika 72 tunnin sisällä, sen kortti kertoo, paljonko on jäljellä ja paljonko katseluaikaa sinulta puuttuu —punaisella alle 24 tunnin— tai ettei se enää mahdu, ja sama ⏳ ilmestyy kampanjan omaan korttiin sivulla. Tulevat kampanjat kantavat myös palkintonsa ja sen, mitä kukin taso vaatii, mutta eivät koskaan määräaikaa: ennen alkua mikään ei ole kiireellistä, ja lähtölaskenta päivää aiemmin vain hätäännyttää. Ja päättynyttä kampanjaa, jonka olet jo kokonaan lunastanut, ei listata, koska Kick siirtää sen lunastettuihin: paneeli ei näytä rivejä, joita sivulla ei ole. Avainsanoja voi muokata: klikkaa poistaaksesi, + lisätäksesi, muokkaa ne kerralla tai palauta oletukset. Avainsana, joka alkaa merkillä ”-”, sulkee pois: ”-console” pudottaa kampanjan, vaikka jokin toinen avainsana olisi sen löytänyt, ja vie mukanaan korostuksen, kortin ja ilmoituksen. Ja neljä näkymäsuodatinta karsivat avointen listaa koskematta mihinkään muuhun —mitä sinulta on vielä jäljellä, mikä päättyy pian, minkä olet ansainnut mutta et lunastanut, ja mikä irtoaa tunnissa tai vähemmässä—: ne vaikuttavat yhdessä, ne muistetaan, ja välilehti kertoo, kuinka monta korttia näkyy kuinka monesta. Avointen lista järjestetään sen mukaan, mikä päättyy ensin, tai sen mukaan, mikä vaatii vähiten aikaa — sinun valintasi. Ja jokainen avoin kampanja kantaa omassa kortissaan sivulla ajan, joka sinulta puuttuu kaiken jäljellä olevan viemiseen —kalleimman palkintonsa, koska katseluaika lasketaan kampanjaa kohti—, jotta hinta näkyy selatessa. Avoimet ja tulevat kampanjat voi kopioida tekstinä 🔗-painikkeella: otsikko, päivämäärät ja palkinnot, sekä linkki siihen välilehteen, jossa ne elävät —kampanjat tai tulevat— koska Kickissä kampanjalla ei ole omaa osoitetta. Jos tietosi lunastetusta ja katsotusta eivät koskaan saavu —ilman niitä ei tiedetä, mitä omistat tai kuinka paljon olet katsonut— paneeli sanoo sen sen sijaan, että vaikenisi merkinnät sammutettuina. Kaikkialla, missä Kick piirtää edistymispalkin, hiiren vieminen sen päälle kertoo tarkalleen, kuinka paljon katseluaikaa puuttuu, ja klikkaus avaa dropin tiedot. Lunastettujen välilehti saa oman ruudukkonsa, joka kertoo lisäksi, kuinka kauan sitten sait kunkin, ja se korvaa Kickin listan, jottei samaa näytetä kahdesti. Valintaruutu piilottaa valmiit ja kytkee päälle automaattisen lunastuksen — sekä valmiiden dropien että päivittäisen palkintoarkun, jonka Kick antaa striimien katsomisesta (eikä se ole drop): arkku avataan vain, kun palkinto on todella saatavilla, se tunnistetaan kieleen nojaamatta, ja se tarkistetaan aina dropien jälkeen, ei koskaan kesken. Ja se, mitä se piilottaa, sisältää myös jo lunastetun palkinnon, jonka Kick jättää sivulle paljaaksi ruuduksi: sen, että se on lunastettu, ratkaisevat sinun lunastustietosi, ei sivun muoto. Ja arkku näkyy myös yhtenä ruudukon ruutuna, Kickin edistymispalkin kanssa: kuinka monta katseluminuuttia siitä puuttuu —hiiri sen päällä kertoo sen, ja klikkaus avaa sen ikkunan lunastamatta mitään—, että se lunastetaan itsestään lopussa, ja —heti kun se on mahdollista— painike, joka lunastaa sen ja jättää Kickin tuloksen auki. Ja vain tämän päivän: kun päivän ikkuna sulkeutuu, ruutu katoaa, kunnes uusi haaste saapuu. Merkitsee 🔔-kuvakkeella —paneelissa ja itse kortissa— kampanjat, jotka ovat muuttuneet viime kerrasta, sekä kertoo odottavien määrän, lähettää työpöytäilmoituksen ja tarjoaa 👁️-painikkeen, joka merkitsee ne nähdyiksi ja vie sinut kampanjat-välilehdelle. 16 kieltä.",
                scriptInfoAuthor: "Tekijä:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "Luetaan dropien muutoksia API:sta...",
                earnedUnclaimed: "ansaittu, lunastamatta",
                urgentUnclaimed: "lunastamatta",
                filterPending: "Jotain kesken",
                filterSoon: "Päättyy pian",
                filterUnclaimed: "Lunastamatta",
                filterQuick: "Taso ≤ 1 t",
                filterBarHint: "Suodattaa vain aktiiviset-välilehden. Useat suodattimet vaikuttavat yhdessä.",
                noResultsFiltered: "Mikään ei läpäise aktiivisia suodattimia.",
                clearFilters: "Poista suodattimet",
                negativeKeywordHint: "kirjoita -sana sulkeaksesi pois",
                sortLabel: "Järjestys:",
                sortUrgent: "Pian päättyvät ensin",
                sortCheapest: "Halvin ensin",
                sortCheapestHint: "Järjestää sen mukaan, mikä vaatii vähiten, jotta saat edes jotain. Kortin ⏱ on eri laskelma: mitä kaiken vieminen maksaa.",
                noInventoryData: "Ei inventaariota: ei tiedetä mitä omistat tai kuinka paljon olet katsonut.",
                dailyStreakReminder: "Päivittäinen palkinto: katsottu {done}/{total} min. Älä menetä putkeasi tänään.",
                urgentClosesIn: "päättyy",
                urgentNeed: "jäljellä",
                urgentNoTime: "aika ei riitä",
                claimedInventoryTitle: "Lunastettu",
                shareCopy: "Kopioi jaettavaksi",
                collapsePanel: "Piilota paneeli",
                expandPanel: "Näytä paneeli",
                dismissDailyReminder: "Vaimenna huomiseen",
                dailyRewardTitle: "Päivittäinen palkinto",
                dailyRewardAuto: "Lunastetaan itsestään, kun aika täyttyy",
                dailyRewardClaim: "Lunasta",
                shareCopied: "Kopioitu"



            },
            vi: {
                scriptInfoPrivacyText: "Từ khóa và thiết lập của bạn chỉ nằm trong trình duyệt. Các truy vấn drop và kho chỉ đi tới API của chính Kick (web.kick.com), dùng lại phiên đăng nhập hiện có của bạn; token được giữ trong bộ nhớ và không bao giờ ghi ra đĩa. Không có bên thứ ba nào tham gia và không có gì được gửi cho tác giả script.",
                minutesShort: "phút",
                dropDetails: "Chi tiết drop",
                rewards: "Phần thưởng",
                progress: "Tiến độ",
                timeRemaining: "Thời gian còn lại",
                urgentMinimum: "tối thiểu",
                remainingToFinish: "còn thiếu bao nhiêu để lấy hết ở đây",
                scriptInfoPrivacy: "Quyền riêng tư:",
                addKeyword: "Thêm từ khóa",
                deleteKeywordTooltip: "Nhấp để xóa", deleteKeywordQuestion: "Xóa từ khóa ",
                editKeywords: "Sửa từ khóa", resetKeywords: "Khôi phục mặc định",
                confirmReset: "Khôi phục từ khóa mặc định?",
                keywordsRestored: "Từ khóa đã khôi phục. Đang tải lại...",
                keywordsModified: "Đã thay đổi từ khóa. Danh sách hiện tại: ",
                reloading: "Đang tải lại...", currentKeywords: "Từ khóa hiện tại (nhấp để xóa):",
                noResults: "Không tìm thấy drop nào khớp.",
                dropsActive: "Drop đang mở", dropsExpired: "Drop đã đóng",
                dropsUpcoming: "Drop sắp tới",
                editPrompt: "Từ khóa phân cách bằng dấu phẩy:",
                searching: "Đang tìm", reload: "Tải lại drop",
                hideExpired: "Ẩn mục đã kết thúc/hoàn thành khỏi kho, tự động nhận drop",
                changes_detected: "Đã phát hiện thay đổi", viewed: "Hiện",
                markAllAsViewed: "Đánh dấu tất cả đã xem",
                accept: "Chấp nhận", cancel: "Hủy", yes: "Có", no: "Không",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Thông tin script", scriptInfoName: "Tên:",
                scriptInfoVersion: "Phiên bản:", scriptInfoDescription: "Mô tả:",
                scriptInfoDescriptionText: "Làm nổi bật ngay trên trang những chiến dịch drop khớp với từ khóa của bạn: xanh lá ở thẻ chiến dịch, xanh dương ở sắp tới, đỏ ở đã đóng. Bảng điều khiển liệt kê chúng tách thành đang mở, sắp tới và đã đóng —cả ba cùng lúc, vì nó đọc từ API: các thẻ của Kick tải lại trang, nên nếu chỉ đọc thứ đang ở trước mặt thì không bao giờ thấy được cả ba cùng nhau—, kèm khoảng thời gian, từ khóa đã khớp và từng phần thưởng với số giờ nó đòi hỏi. Một từ khóa khớp ở bất kỳ đâu trong văn bản, nên «rage» tìm ra chiến dịch tên «averageaden $5 Bonus»; thẻ cho biết đó là từ khóa nào, để không có mục nào xuất hiện mà không giải thích lý do. Những phần thưởng bạn đã có được đánh dấu và gạch ngang từng cái một, và huy hiệu không còn gì để giành sẽ bỏ đi thời gian xem mà nó đòi. Thứ bạn đã đạt được nhưng chưa nhận được đánh dấu riêng bằng 🎁 —không làm mờ— vì chỉ còn thiếu một cú nhấp, và cảnh báo sắp đóng cũng đếm chúng. Thứ sắp đóng lên trước: khi một phần thưởng bạn chưa có chỉ còn dưới 72 giờ, thẻ của nó cho biết còn bao lâu và bạn còn thiếu bao nhiêu thời gian xem —đỏ khi dưới 24 giờ— hoặc là không còn kịp nữa, và cùng biểu tượng ⏳ ấy xuất hiện trên thẻ của chiến dịch ngay trên trang. Các chiến dịch sắp tới cũng mang theo phần thưởng và chi phí của từng mốc, nhưng không bao giờ có hạn chót: trước khi mở thì không có gì gấp, và một đồng hồ đếm ngược từ hôm trước chỉ gây lo. Và một chiến dịch đã đóng mà bạn đã nhận hết thì không được liệt kê, vì Kick chuyển nó sang mục đã nhận: bảng không hiển thị những dòng mà trang không có. Từ khóa có thể chỉnh sửa: nhấp vào một từ để xóa, + để thêm, sửa cả loạt hoặc khôi phục mặc định. Từ khóa bắt đầu bằng «-» sẽ loại trừ: «-console» loại chiến dịch ra dù một từ khóa khác đã tìm thấy nó, và mang theo cả phần tô sáng, thẻ lẫn thông báo. Và bốn bộ lọc hiển thị rút gọn danh sách đang mở mà không đụng đến thứ gì khác —cái bạn còn thiếu, cái sắp đóng, cái bạn đã đạt mà chưa nhận, và cái lấy được trong một giờ hoặc ít hơn—: chúng cộng dồn, được ghi nhớ, và thẻ cho biết đang hiện bao nhiêu trên tổng bao nhiêu. Danh sách đang mở được sắp theo cái đóng trước hoặc theo cái đòi ít thời gian nhất, tùy bạn chọn. Và mỗi chiến dịch đang mở mang trên thẻ của chính nó trên trang thời gian bạn còn thiếu để lấy hết phần còn lại —phần thưởng đắt nhất của nó, vì thời gian xem được tính theo chiến dịch—, để chi phí nhìn thấy được khi cuộn trang. Các chiến dịch đang mở và sắp tới có thể sao chép thành văn bản bằng 🔗: tiêu đề, ngày tháng và phần thưởng, kèm liên kết đến thẻ nơi chúng nằm —chiến dịch hoặc sắp tới— vì ở Kick một chiến dịch không có địa chỉ riêng. Nếu dữ liệu về thứ đã nhận và thời gian đã xem không bao giờ đến —không có nó thì không biết bạn có gì hay đã xem bao nhiêu— bảng điều khiển sẽ nói ra, thay vì im lặng với các dấu bị tắt. Ở bất cứ đâu Kick vẽ thanh tiến độ, rê chuột sẽ cho biết chính xác bạn còn thiếu bao nhiêu thời gian xem, và nhấp vào sẽ mở chi tiết của drop. Thẻ đã nhận có lưới riêng, lưới này còn cho biết bạn nhận mỗi thứ từ bao lâu trước, và nó thay thế danh sách của Kick để không hiển thị cùng một thứ hai lần. Ô đánh dấu ẩn những gì đã hoàn tất và bật nhận tự động, cả với drop đã xong lẫn với rương phần thưởng hằng ngày mà Kick trao cho việc xem stream (vốn không phải là drop): rương chỉ được mở khi phần thưởng thực sự có sẵn, việc phát hiện không phụ thuộc vào ngôn ngữ, và luôn được kiểm tra sau các drop, không bao giờ ở giữa. Và những gì nó ẩn bao gồm cả phần thưởng bạn đã nhận, thứ mà Kick để lại trên trang như một ô trơ trọi: điều quyết định nó đã được nhận là dữ liệu đã nhận của bạn, không phải hình dạng của trang. Và cái hòm đó cũng xuất hiện như một ô nữa trong lưới, kèm thanh tiến độ của Kick: còn thiếu bao nhiêu phút xem —rê chuột sẽ nói, và nhấp vào sẽ mở cửa sổ của nó mà không nhận gì—, rằng nó sẽ tự được nhận khi xong, và —ngay khi có thể nhận— một nút nhận nó và để nguyên kết quả của Kick đang mở. Và chỉ của hôm nay: khi cửa sổ trong ngày đóng lại, ô biến mất cho đến khi có thử thách mới. Đánh dấu 🔔 —trong bảng và trên chính thẻ— những chiến dịch đã thay đổi kể từ lần trước, kèm số lượng đang chờ, thông báo trên màn hình nền và nút 👁️ để đánh dấu đã xem và đưa bạn đến thẻ chiến dịch. 16 ngôn ngữ.",
                scriptInfoAuthor: "Tác giả:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "Đang đọc thay đổi drop từ API...",
                earnedUnclaimed: "đã đạt, chưa nhận",
                urgentUnclaimed: "chưa nhận",
                filterPending: "Còn dang dở",
                filterSoon: "Sắp kết thúc",
                filterUnclaimed: "Chưa nhận",
                filterQuick: "Mốc ≤ 1 giờ",
                filterBarHint: "Chỉ lọc thẻ đang hoạt động. Nhiều bộ lọc cộng dồn với nhau.",
                noResultsFiltered: "Không có gì qua được các bộ lọc đang bật.",
                clearFilters: "Bỏ bộ lọc",
                negativeKeywordHint: "gõ -từ để loại trừ",
                sortLabel: "Sắp xếp:",
                sortUrgent: "Sắp kết thúc trước",
                sortCheapest: "Rẻ nhất trước",
                sortCheapestHint: "Sắp xếp theo thứ đòi hỏi ít nhất để lấy được một thứ gì đó. ⏱ trên thẻ là con số khác: chi phí để lấy hết mọi thứ.",
                noInventoryData: "Không có kho đồ: không biết bạn đã có gì hay đã xem bao lâu.",
                dailyStreakReminder: "Phần thưởng hằng ngày: đã xem {done}/{total} phút. Đừng để mất chuỗi ngày hôm nay.",
                urgentClosesIn: "kết thúc sau",
                urgentNeed: "còn thiếu",
                urgentNoTime: "không kịp",
                claimedInventoryTitle: "Đã nhận",
                shareCopy: "Sao chép để chia sẻ",
                collapsePanel: "Ẩn bảng",
                expandPanel: "Hiện bảng",
                dismissDailyReminder: "Tắt đến mai",
                dailyRewardTitle: "Phần thưởng hằng ngày",
                dailyRewardAuto: "Tự động nhận khi hết thời gian",
                dailyRewardClaim: "Nhận",
                shareCopied: "Đã sao chép"



            },
            zh: {
                scriptInfoPrivacyText: "你的关键词和设置只保存在你的浏览器里。掉宝和库存的查询只发往 Kick 自己的 API（web.kick.com），并沿用你已有的会话；令牌只留在内存中，从不写入磁盘。不涉及任何第三方，也不会向脚本作者发送任何内容。",
                minutesShort: "分钟",
                dropDetails: "掉宝详情",
                rewards: "奖励",
                progress: "进度",
                timeRemaining: "剩余时间",
                urgentMinimum: "最少",
                remainingToFinish: "还差多少才能拿走这里的全部",
                scriptInfoPrivacy: "隐私：",
                addKeyword: "添加关键词",
                deleteKeywordTooltip: "点击删除", deleteKeywordQuestion: "删除关键词 ",
                editKeywords: "编辑关键词", resetKeywords: "恢复默认",
                confirmReset: "恢复默认关键词？",
                keywordsRestored: "关键词已恢复。重新加载...",
                keywordsModified: "关键词已修改。当前关键词：",
                reloading: "重新加载...", currentKeywords: "当前关键词（点击删除）：",
                noResults: "没有找到匹配的掉宝。",
                dropsActive: "活跃掉宝", dropsExpired: "已关闭掉宝",
                dropsUpcoming: "即将推出的掉宝",
                editPrompt: "逗号分隔的关键词：",
                searching: "搜索中", reload: "重新加载掉宝",
                hideExpired: "在库存中隐藏已结束/已完成，自动领取掉宝",
                changes_detected: "检测到变更", viewed: "显示",
                markAllAsViewed: "全部标记为已看",
                accept: "接受", cancel: "取消", yes: "是", no: "否",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "脚本信息", scriptInfoName: "名称：",
                scriptInfoVersion: "版本：", scriptInfoDescription: "描述：",
                scriptInfoDescriptionText: "在页面上直接高亮与你的关键词匹配的掉宝活动：活动标签页为绿色，即将推出为蓝色，已结束为红色。面板会把它们分成进行中、即将推出和已结束三类列出 —三类同时显示，因为它是从 API 读取的：Kick 的标签页会重新加载页面，只读眼前的内容永远不可能同时看到三类—，并附上日期区间、命中的关键词，以及每项奖励所需的时长。关键词可以匹配文本中的任意位置，所以“rage”能找到名为“averageaden $5 Bonus”的活动；卡片会说明是哪个关键词命中的，这样就不会有活动无缘无故地出现。你已经拥有的奖励会逐个打勾并加上删除线，而一个已经没有东西可拿的徽章会去掉它原本要求的观看时长。你已经赚到但还没领取的会用 🎁 单独标出 —不做淡化处理—，因为它只差一次点击，而且即将结束的提醒也会把它们计算在内。快要结束的排在最前：当你还没拿到的奖励剩余时间进入 72 小时以内时，它的卡片会说明还剩多久、你还需要看多久 —低于 24 小时显示红色—，或者说明已经来不及了，同样的 ⏳ 也会出现在页面上该活动自己的卡片上。即将推出的活动也会显示它的奖励和每个档位所需的时间，但不会显示截止时间：活动开始之前没有什么要赶的，提前一天倒计时只会让人紧张。而已经全部领取的已结束活动不会被列出，因为 Kick 会把它移到已领取：面板不会显示页面上并不存在的条目。关键词可以编辑：点击即可删除，+ 用来添加，可以批量编辑或恢复默认。以“-”开头的关键词表示排除：“-console”会把该活动剔除，即使另一个关键词已经找到了它，并且连同高亮、卡片和提醒一起带走。另外四个视图筛选只会缩减进行中的列表，不影响其他任何东西 —你还缺的、快要结束的、已赚到但未领取的，以及一小时以内就能拿到的—：它们可以叠加，会被记住，标签页也会显示当前显示了多少张、总共有多少张。进行中的列表可以按最先结束排序，也可以按所需时间最少排序，由你选择。每个进行中的活动还会在页面上自己的卡片里显示你把剩下的全部拿走还需要多少时间 —取其中最贵的那项奖励，因为观看时长是按活动统计的—，这样滚动页面时就能看到代价。进行中和即将推出的活动都可以用 🔗 复制为文本：标题、日期和奖励，并附上它所在标签页的链接 —活动或即将推出—，因为在 Kick 里一个活动没有属于自己的网址。如果你的已领取和已观看数据始终没有到达 —没有它就无法知道你拥有什么、看了多久—，面板会直接说明，而不是把标记关掉后保持沉默。凡是 Kick 画出进度条的地方，把鼠标移上去就会准确地告诉你还差多少观看时长，点击则会打开该掉宝的详情。已领取标签页会有一个自己的网格，还会告诉你每样东西是多久之前拿到的，并取代 Kick 的列表，以免同样的内容显示两次。复选框会隐藏已完成的内容，并开启自动领取，既包括已完成的掉宝，也包括 Kick 因观看直播而发放的每日奖励宝箱（那并不是掉宝）：宝箱只有在奖励确实可领取时才会打开，检测方式不依赖语言，并且始终在处理完掉宝之后再检查，绝不会在中途进行。它隐藏的已完成内容还包括你已经领取的奖励：Kick 会把它留在页面上，只剩图片和名称；判断它是否已领取的是你的领取数据，而不是页面的样子。而且这个宝箱也会作为网格里的一块出现，还带着 Kick 的进度条：还差多少观看分钟——把鼠标移上去就会说，点击则会打开它的窗口而不领取任何东西——、时间到了会自动领取，以及一旦可以领取时的领取按钮——领完会让 Kick 的结果保持打开。而且只显示今天的：当天的时段一过，这一块就会消失，直到新的挑战到来。自上次查看以来发生变化的活动会用 🔔 标出 —面板里和卡片本身都有—，另有待处理数量、桌面通知，以及一个 👁️ 按钮，点击后把它们标为已读并带你前往活动标签页。支持 16 种语言。",
                scriptInfoAuthor: "作者：", scriptInfoGitHub: "GitHub：",
                readingApiDrops: "正在从 API 读取掉宝变更...",
                earnedUnclaimed: "已达成，未领取",
                urgentUnclaimed: "未领取",
                filterPending: "还有未完成",
                filterSoon: "即将结束",
                filterUnclaimed: "未领取",
                filterQuick: "档位 ≤ 1 小时",
                filterBarHint: "仅筛选“进行中”标签页。多个筛选条件同时生效。",
                noResultsFiltered: "没有内容符合当前筛选条件。",
                clearFilters: "清除筛选",
                negativeKeywordHint: "输入 -词 可排除",
                sortLabel: "排序:",
                sortUrgent: "即将结束优先",
                sortCheapest: "最省时优先",
                sortCheapestHint: "按最快能拿到一样奖励的顺序排列。卡片上的⏱是另一笔账：拿走全部所需的时间。",
                noInventoryData: "无库存数据：不清楚你已拥有什么、看了多久。",
                dailyStreakReminder: "每日奖励：已观看 {done}/{total} 分钟。别让今天的连续记录中断。",
                urgentClosesIn: "距结束",
                urgentNeed: "还需",
                urgentNoTime: "时间不够",
                claimedInventoryTitle: "已领取",
                shareCopy: "复制以分享",
                collapsePanel: "隐藏面板",
                expandPanel: "显示面板",
                dismissDailyReminder: "静音至明天",
                dailyRewardTitle: "每日奖励",
                dailyRewardAuto: "时间到了会自动领取",
                dailyRewardClaim: "领取",
                shareCopied: "已复制"



            },
            ar: {
                scriptInfoPrivacyText: "تبقى كلماتك المفتاحية وإعداداتك في متصفحك فقط. تذهب استعلامات الدروبس والمخزون إلى واجهة Kick الخاصة (web.kick.com) دون غيرها، مستخدمةً جلستك الحالية؛ ويُحفظ الرمز في الذاكرة ولا يُكتب على القرص أبدًا. لا تتدخل أي أطراف أخرى ولا يُرسل أي شيء إلى مؤلف السكربت.",
                minutesShort: "د",
                dropDetails: "تفاصيل الدروب",
                rewards: "المكافآت",
                progress: "التقدم",
                timeRemaining: "الوقت المتبقي",
                urgentMinimum: "كحد أدنى",
                remainingToFinish: "ما يتبقى لأخذ كل شيء من هنا",
                scriptInfoPrivacy: "الخصوصية:",
                addKeyword: "إضافة كلمة مفتاحية",
                deleteKeywordTooltip: "انقر للحذف", deleteKeywordQuestion: "حذف الكلمة المفتاحية ",
                editKeywords: "تعديل الكلمات المفتاحية", resetKeywords: "استعادة الافتراضية",
                confirmReset: "استعادة الكلمات المفتاحية الافتراضية؟",
                keywordsRestored: "تم استعادة الكلمات المفتاحية. إعادة التحميل...",
                keywordsModified: "تم تعديل الكلمات المفتاحية. الحالية: ",
                reloading: "إعادة التحميل...", currentKeywords: "الكلمات المفتاحية الحالية (انقر للحذف):",
                noResults: "لم يتم العثور على نتائج.",
                dropsActive: "دروبات نشطة", dropsExpired: "دروبات مغلقة",
                dropsUpcoming: "دروبات قادمة",
                editPrompt: "كلمات مفتاحية مفصولة بفواصل:",
                searching: "جاري البحث", reload: "إعادة تحميل الدروبات",
                hideExpired: "إخفاء المنتهية/المكتملة من المخزون، مطالبة تلقائية بالدروبس",
                changes_detected: "تم رصد تغييرات", viewed: "إظهار",
                markAllAsViewed: "تعليم الكل كمقروء",
                accept: "قبول", cancel: "إلغاء", yes: "نعم", no: "لا",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "معلومات السكربت", scriptInfoName: "الاسم:",
                scriptInfoVersion: "الإصدار:", scriptInfoDescription: "الوصف:",
                scriptInfoDescriptionText: "يبرز في الصفحة نفسها حملات الدروبس التي تطابق كلماتك المفتاحية: أخضر في تبويب الحملات، أزرق في القادمة، أحمر في المنتهية. تسرد اللوحة هذه الحملات مقسّمة إلى نشطة وقادمة ومنتهية —الثلاثة معًا، لأنها تقرأها من الـ API: تبويبات Kick تعيد تحميل الصفحة، فلو اكتُفي بقراءة ما أمامك لما ظهرت الثلاثة مجتمعة أبدًا—، مع نافذة التواريخ، والكلمة المفتاحية التي طابقت، وكل مكافأة مع الساعات التي تطلبها. الكلمة المفتاحية تطابق في أي موضع من النص، لذلك تجد «rage» حملة اسمها «averageaden $5 Bonus»؛ وتذكر البطاقة أي كلمة كانت، حتى لا تظهر أي حملة دون تفسير سبب ظهورها. المكافآت التي تملكها بالفعل تُعلَّم بعلامة صح ويُشطب اسمها واحدة واحدة، والشارة التي لم يعد فيها ما يُكسب تفقد وقت المشاهدة الذي كانت تطلبه. أما ما كسبته ولم تستلمه بعد فيُميَّز على حدة بـ 🎁 —دون تعتيم— لأنه لا ينقصه سوى نقرة، وتحسبه أيضًا تنبيهات قرب الإغلاق. ما يوشك على الإغلاق يتقدم أولًا: عندما يتبقى لمكافأة لا تملكها بعد أقل من 72 ساعة، تقول بطاقتها كم بقي وكم ينقصك من وقت المشاهدة —بالأحمر تحت 24 ساعة— أو أن الوقت لم يعد يكفي، وتظهر الأيقونة ⏳ نفسها على بطاقة الحملة في الصفحة. الحملات القادمة تحمل أيضًا مكافآتها وما يطلبه كل مستوى، لكنها لا تحمل مهلة أبدًا: قبل أن تبدأ لا شيء عاجل، والعد التنازلي في اليوم السابق لا يفعل سوى إثارة القلق. والحملة المنتهية التي استلمتها بالكامل لا تُدرج، لأن Kick ينقلها إلى المستلَم: اللوحة لا تعرض صفوفًا لا توجد في الصفحة. الكلمات المفتاحية قابلة للتعديل: انقر على واحدة لحذفها، و+ للإضافة، وعدّلها دفعة واحدة أو استعد الافتراضية. الكلمة التي تبدأ بـ «-» تستبعد: «-console» تُخرج الحملة حتى لو وجدتها كلمة أخرى، وتأخذ معها التمييز والبطاقة والتنبيه. وأربعة مرشحات عرض تختصر قائمة المفتوحة دون أن تمس أي شيء آخر —ما ينقصك، وما يغلق قريبًا، وما كسبته ولم تستلمه، وما يمكن الحصول عليه في ساعة أو أقل—: تتراكم معًا، وتُحفظ، ويقول التبويب كم بطاقة تُعرض من أصل كم. تُرتَّب قائمة المفتوحة حسب الأقرب إغلاقًا أو حسب الأقل طلبًا للوقت، كما تختار. وكل حملة مفتوحة تحمل، في بطاقتها الخاصة داخل الصفحة، الوقت الذي ينقصك لأخذ كل ما تبقى —أغلى مكافأة فيها، لأن وقت المشاهدة يُحسب لكل حملة—، حتى تظهر التكلفة أثناء التمرير. يمكن نسخ الحملات المفتوحة والقادمة كنص عبر 🔗: العنوان والتواريخ والمكافآت، مع رابط إلى التبويب الذي توجد فيه —الحملات أو القادمة— لأن الحملة في Kick ليس لها عنوان خاص بها. وإذا لم تصل بيانات ما استلمته وما شاهدته —وبدونها لا يمكن معرفة ما تملكه ولا كم شاهدت— فإن اللوحة تقول ذلك بدل أن تصمت وعلاماتها مطفأة. وأينما رسم Kick شريط تقدّم، فإن تمرير المؤشر يخبرك بالضبط كم ينقصك من وقت المشاهدة، والنقر يفتح تفاصيل الدروب. ويحصل تبويب المستلَم على شبكة خاصة به تقول أيضًا منذ متى حصلت على كل شيء، وتحل محل قائمة Kick حتى لا يُعرض الشيء نفسه مرتين. ومربع الاختيار يخفي ما اكتمل ويشغّل الاستلام التلقائي، للدروبس المنتهية ولصندوق المكافأة اليومية الذي يمنحه Kick مقابل مشاهدة البثوث (وهو ليس دروب): لا يُفتح الصندوق إلا عندما تكون المكافأة متاحة فعلًا، ويُكتشف دون الاعتماد على اللغة، ويُراجَع دائمًا بعد الدروبس، لا في أثنائها أبدًا. وما يخفيه يشمل المكافأة التي استلمتها بالفعل، والتي يتركها Kick في الصفحة كمربع أجرد: وما يحدد أنها مستلمة هو بيانات استلامك، لا شكل الصفحة. ويظهر الصندوق أيضًا كبطاقة أخرى في هذه الشبكة، مع شريط تقدّم Kick: كم دقيقة مشاهدة تبقّت له —يقولها مرور المؤشر، والنقر يفتح نافذته دون أن يستلم شيئًا—، وأنه سيُستلم تلقائيًا عند انتهائها، و—بمجرد أن يصبح قابلًا للاستلام— زر يستلمه ويترك نتيجة Kick مفتوحة. وبطاقة اليوم وحدها: بانتهاء نافذة اليوم تختفي حتى يصل التحدي الجديد. ويضع علامة 🔔 —في اللوحة وعلى البطاقة نفسها— على الحملات التي تغيّرت منذ آخر مرة، مع عدّاد للمعلّق، وإشعار على سطح المكتب، وزر 👁️ يعتبرها مقروءة وينقلك إلى تبويب الحملات. 16 لغة.",
                scriptInfoAuthor: "المؤلف:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "جارٍ قراءة تغييرات الدروبس من الـ API...",
                earnedUnclaimed: "تم كسبه ولم تتم المطالبة به",
                urgentUnclaimed: "دون مطالبة",
                filterPending: "متبقٍ شيء",
                filterSoon: "ينتهي قريبًا",
                filterUnclaimed: "دون مطالبة",
                filterQuick: "مستوى ≤ ساعة",
                filterBarHint: "يصفّي تبويب النشط فقط. تُطبَّق عدة مرشحات معًا.",
                noResultsFiltered: "لا شيء يجتاز المرشحات المفعّلة.",
                clearFilters: "إزالة المرشحات",
                negativeKeywordHint: "اكتب -كلمة للاستبعاد",
                sortLabel: "الترتيب:",
                sortUrgent: "الأقرب انتهاءً أولاً",
                sortCheapest: "الأقل وقتًا أولاً",
                sortCheapestHint: "يرتّب حسب الأقل طلبًا للحصول على شيء ما. الرمز ⏱ على البطاقة حساب آخر: ما يكلّفه أخذ كل شيء.",
                noInventoryData: "لا يوجد مخزون: لا يُعرف ما لديك ولا كم شاهدت.",
                dailyStreakReminder: "المكافأة اليومية: تمت مشاهدة {done} من {total} دقيقة. لا تفقد سلسلتك اليوم.",
                urgentClosesIn: "ينتهي خلال",
                urgentNeed: "يتبقى",
                urgentNoTime: "الوقت لا يكفي",
                claimedInventoryTitle: "تم المطالبة",
                shareCopy: "انسخ للمشاركة",
                collapsePanel: "إخفاء اللوحة",
                expandPanel: "إظهار اللوحة",
                dismissDailyReminder: "كتم التنبيه حتى الغد",
                dailyRewardTitle: "المكافأة اليومية",
                dailyRewardAuto: "تُستلم تلقائيًا عند انتهاء الوقت",
                dailyRewardClaim: "استلام",
                shareCopied: "تم النسخ"



            },
            hi: {
                scriptInfoPrivacyText: "आपके कीवर्ड और सेटिंग्स सिर्फ़ आपके ब्राउज़र में रहते हैं। ड्रॉप और इन्वेंटरी की क्वेरी केवल Kick के अपने API (web.kick.com) पर जाती हैं और आपके मौजूदा सेशन का ही उपयोग करती हैं; टोकन मेमोरी में रहता है, डिस्क पर कभी नहीं लिखा जाता। कोई तीसरा पक्ष शामिल नहीं है और स्क्रिप्ट के लेखक को कुछ भी नहीं भेजा जाता।",
                minutesShort: "मि",
                dropDetails: "ड्रॉप विवरण",
                rewards: "इनाम",
                progress: "प्रगति",
                timeRemaining: "शेष समय",
                urgentMinimum: "कम से कम",
                remainingToFinish: "यहाँ से सब कुछ लेने के लिए कितना बाकी है",
                scriptInfoPrivacy: "गोपनीयता:",
                addKeyword: "कीवर्ड जोड़ें",
                deleteKeywordTooltip: "हटाने के लिए क्लिक करें", deleteKeywordQuestion: "कीवर्ड हटाएं ",
                editKeywords: "कीवर्ड संपादित करें", resetKeywords: "डिफ़ॉल्ट पर रीसेट करें",
                confirmReset: "कीवर्ड को डिफ़ॉल्ट पर रीसेट करें?",
                keywordsRestored: "कीवर्ड बहाल। पुनः लोड हो रहा है...",
                keywordsModified: "कीवर्ड बदल दिए गए। वर्तमान कीवर्ड: ",
                reloading: "पुनः लोड हो रहा है...", currentKeywords: "वर्तमान कीवर्ड (हटाने के लिए क्लिक करें):",
                noResults: "कोई ड्रॉप नहीं मिला।",
                dropsActive: "सक्रिय ड्रॉप", dropsExpired: "बंद ड्रॉप",
                dropsUpcoming: "आगामी ड्रॉप",
                editPrompt: "अल्पविराम से अलग कीवर्ड:",
                searching: "खोज रहे हैं", reload: "ड्रॉप पुनः लोड करें",
                hideExpired: "समाप्त/पूर्ण को इन्वेंटरी से छिपाएँ, ड्रॉप्स स्वतः दावा",
                changes_detected: "बदलाव मिले", viewed: "दिखाएँ",
                markAllAsViewed: "सभी को देखा हुआ चिह्नित करें",
                accept: "स्वीकार करें", cancel: "रद्द करें", yes: "हां", no: "नहीं",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "स्क्रिप्ट जानकारी", scriptInfoName: "नाम:",
                scriptInfoVersion: "संस्करण:", scriptInfoDescription: "विवरण:",
                scriptInfoDescriptionText: "आपके कीवर्ड से मेल खाने वाले ड्रॉप अभियानों को पेज पर ही हाइलाइट करता है: अभियान टैब में हरा, आगामी में नीला, समाप्त में लाल। पैनल उन्हें सक्रिय, आगामी और समाप्त में बाँटकर दिखाता है —तीनों एक साथ, क्योंकि वह उन्हें API से पढ़ता है: Kick के टैब पेज को दोबारा लोड करते हैं, इसलिए सिर्फ़ सामने जो है उसे पढ़कर तीनों कभी साथ नहीं दिखेंगे—, साथ में तारीखों की अवधि, जो कीवर्ड मेल खाया वह, और हर इनाम के साथ उसके ज़रूरी घंटे। कीवर्ड टेक्स्ट में कहीं भी मेल खाता है, इसलिए “rage” से “averageaden $5 Bonus” नाम का अभियान मिल जाता है; कार्ड बताता है कि कौन-सा कीवर्ड था, ताकि कोई भी बिना कारण बताए सामने न आए। जो इनाम आपके पास पहले से हैं उन पर एक-एक करके ✓ लगता है और वे काटे जाते हैं, और जिस बैज में कमाने को कुछ नहीं बचा उससे उसका माँगा गया समय हट जाता है। जो आपने कमा लिया है पर उठाया नहीं, उसे 🎁 के साथ अलग दिखाया जाता है —धुँधला किए बिना— क्योंकि उसमें सिर्फ़ एक क्लिक बाकी है, और बंद होने की चेतावनी उन्हें भी गिनती है। जो बंद होने वाला है वह पहले आता है: जिस इनाम को आपने अभी नहीं लिया, उसका समय 72 घंटे के भीतर आ जाए तो उसका कार्ड बताता है कि कितना बचा है और आपको कितना देखना बाकी है —24 घंटे से कम पर लाल— या यह कि अब समय नहीं बचेगा, और वही ⏳ पेज पर अभियान के अपने कार्ड पर भी आता है। आगामी अभियान भी अपने इनाम और हर स्तर की माँग दिखाते हैं, पर कोई समयसीमा नहीं: शुरू होने से पहले कुछ भी जल्दी का नहीं है, और एक दिन पहले की उलटी गिनती सिर्फ़ घबराहट देती है। और जिस समाप्त अभियान का सब कुछ आप उठा चुके हैं, वह सूची में नहीं आता, क्योंकि Kick उसे उठाए हुए में ले जाता है: पैनल उन पंक्तियों को नहीं दिखाता जो पेज पर नहीं हैं। कीवर्ड बदले जा सकते हैं: हटाने के लिए किसी पर क्लिक करें, जोड़ने के लिए +, सबको एक साथ संपादित करें या डिफ़ॉल्ट लौटाएँ। “-” से शुरू होने वाला कीवर्ड बाहर करता है: “-console” अभियान को हटा देता है, चाहे कोई दूसरा कीवर्ड उसे ढूँढ चुका हो, और अपने साथ हाइलाइट, कार्ड और सूचना भी ले जाता है। और चार व्यू फ़िल्टर खुली सूची को छोटा करते हैं, बाकी किसी चीज़ को छुए बिना —जो आपका बाकी है, जो जल्द बंद हो रहा है, जो कमाया पर उठाया नहीं, और जो एक घंटे या उससे कम में मिल जाता है—: ये आपस में जुड़ते हैं, याद रखे जाते हैं, और टैब बताता है कि कुल में से कितने कार्ड दिख रहे हैं। खुली सूची को पहले बंद होने वाले या सबसे कम समय माँगने वाले के हिसाब से क्रम में लगाया जा सकता है, जैसा आप चाहें। और हर खुला अभियान पेज पर अपने कार्ड में वह समय दिखाता है जो बाकी सब कुछ लेने के लिए आपको चाहिए —उसका सबसे महँगा इनाम, क्योंकि देखने का समय पूरे अभियान का गिना जाता है—, ताकि स्क्रॉल करते हुए लागत दिखती रहे। खुले और आगामी अभियानों को 🔗 से टेक्स्ट के रूप में कॉपी किया जा सकता है: शीर्षक, तारीख़ें और इनाम, साथ में उस टैब का लिंक जहाँ वे रहते हैं —अभियान या आगामी— क्योंकि Kick में किसी अभियान का अपना पता नहीं होता। अगर आपके उठाए हुए और देखे हुए का डेटा कभी न आए —उसके बिना यह पता नहीं चलता कि आपके पास क्या है और आपने कितना देखा है— तो पैनल यह कह देता है, बजाय इसके कि निशान बुझाकर चुप रह जाए। जहाँ भी Kick प्रगति पट्टी बनाता है, माउस ले जाने पर ठीक-ठीक पता चलता है कि कितना देखना बाकी है, और क्लिक करने पर ड्रॉप का विवरण खुलता है। उठाए हुए वाले टैब को अपनी एक ग्रिड मिलती है जो यह भी बताती है कि हर चीज़ आपको कितने समय पहले मिली, और वह Kick की सूची की जगह ले लेती है ताकि वही चीज़ दो बार न दिखे। चेकबॉक्स पूरे हो चुके को छिपाता है और अपने-आप उठाना चालू करता है — पूरे हो चुके ड्रॉप्स का भी और उस रोज़ाना इनाम की पेटी का भी जो Kick स्ट्रीम देखने पर देता है (और जो ड्रॉप नहीं है): पेटी तभी खोली जाती है जब इनाम सचमुच उपलब्ध हो, उसकी पहचान भाषा पर निर्भर नहीं करती, और उसे हमेशा ड्रॉप्स के बाद देखा जाता है, बीच में कभी नहीं। और जो पूरा हो चुका वह छिपाता है, उसमें वह इनाम भी है जो आपने उठा लिया और जिसे Kick पेज पर एक खाली टाइल के रूप में छोड़ देता है: वह उठाया हुआ है या नहीं, यह आपके उठाए हुए के डेटा से तय होता है, पेज की शक्ल से नहीं। और वह संदूक भी इस ग्रिड में एक और टाइल की तरह दिखता है, Kick की प्रगति पट्टी के साथ: उसे कितने मिनट देखना बाकी है —माउस ले जाने पर वह बता देता है, और क्लिक करने पर कुछ उठाए बिना उसकी विंडो खुल जाती है—, कि समय पूरा होने पर वह अपने-आप उठा लिया जाएगा, और —जैसे ही उठाया जा सके— एक बटन जो उसे उठाता है और Kick का नतीजा खुला छोड़ देता है। और सिर्फ़ आज वाला: दिन की अवधि बंद होते ही टाइल गायब हो जाती है, जब तक नया चैलेंज नहीं आ जाता। पिछली बार के बाद बदले हुए अभियानों पर 🔔 लगाता है —पैनल में और खुद कार्ड पर— साथ में बाकी बचे की गिनती, डेस्कटॉप सूचना और एक 👁️ बटन जो उन्हें देखा हुआ मानकर आपको अभियान टैब पर ले जाता है। 16 भाषाएँ।",
                scriptInfoAuthor: "लेखक:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "API से ड्रॉप बदलाव पढ़े जा रहे हैं...",
                earnedUnclaimed: "अर्जित, दावा बाकी",
                urgentUnclaimed: "दावा बाकी",
                filterPending: "कुछ बाकी है",
                filterSoon: "जल्द बंद",
                filterUnclaimed: "दावा बाकी",
                filterQuick: "स्तर ≤ 1 घं.",
                filterBarHint: "सिर्फ़ सक्रिय टैब को छानता है। कई फ़िल्टर एक साथ लगते हैं।",
                noResultsFiltered: "सक्रिय फ़िल्टर से कुछ भी मेल नहीं खाता।",
                clearFilters: "फ़िल्टर हटाएँ",
                negativeKeywordHint: "बाहर रखने के लिए -शब्द लिखें",
                sortLabel: "क्रम:",
                sortUrgent: "पहले बंद होने वाले",
                sortCheapest: "पहले सबसे सस्ते",
                sortCheapestHint: "कुछ भी पाने के लिए जो सबसे कम माँगता है, उसके हिसाब से क्रम लगाता है। कार्ड का ⏱ अलग हिसाब है: सब कुछ लेने में कितना लगता है।",
                noInventoryData: "इन्वेंट्री नहीं: पता नहीं आपके पास क्या है और कितना देखा है।",
                dailyStreakReminder: "दैनिक इनाम: {total} मिनट में से {done} मिनट देखे। आज अपनी स्ट्रीक न गँवाएँ।",
                urgentClosesIn: "समाप्त होने में",
                urgentNeed: "बाकी",
                urgentNoTime: "समय कम है",
                claimedInventoryTitle: "दावा किया गया",
                shareCopy: "साझा करने के लिए कॉपी करें",
                collapsePanel: "पैनल छिपाएँ",
                expandPanel: "पैनल दिखाएँ",
                dismissDailyReminder: "कल तक चुप कराएँ",
                dailyRewardTitle: "दैनिक इनाम",
                dailyRewardAuto: "समय पूरा होने पर अपने-आप उठा लिया जाता है",
                dailyRewardClaim: "उठाएँ",
                shareCopied: "कॉपी हो गया"



            },
            id: {
                scriptInfoPrivacyText: "Kata kunci dan pengaturanmu hanya tersimpan di peramban. Kueri drop dan inventaris hanya menuju API milik Kick sendiri (web.kick.com) dengan memakai sesi yang sudah ada; token disimpan di memori dan tidak pernah ditulis ke disk. Tidak ada pihak ketiga yang terlibat dan tidak ada apa pun yang dikirim ke penulis script.",
                minutesShort: "mnt",
                dropDetails: "Detail drop",
                rewards: "Hadiah",
                progress: "Kemajuan",
                timeRemaining: "Waktu tersisa",
                urgentMinimum: "minimal",
                remainingToFinish: "yang masih kurang untuk mengambil semuanya di sini",
                scriptInfoPrivacy: "Privasi:",
                addKeyword: "Tambah Kata Kunci",
                deleteKeywordTooltip: "Klik untuk menghapus", deleteKeywordQuestion: "Hapus kata kunci ",
                editKeywords: "Edit Kata Kunci", resetKeywords: "Kembalikan Default",
                confirmReset: "Kembalikan kata kunci default?",
                keywordsRestored: "Kata kunci dikembalikan. Memuat ulang...",
                keywordsModified: "Kata kunci diubah. Berikut yang sekarang: ",
                reloading: "Memuat ulang...", currentKeywords: "Kata kunci saat ini (klik untuk menghapus):",
                noResults: "Tidak ada drop yang cocok.",
                dropsActive: "Drop Terbuka", dropsExpired: "Drop Tertutup",
                dropsUpcoming: "Drop Mendatang",
                editPrompt: "Kata kunci dipisahkan koma:",
                searching: "Mencari", reload: "Muat ulang drop",
                hideExpired: "Sembunyikan yang berakhir/selesai dari inventaris, klaim drop otomatis",
                changes_detected: "Perubahan terdeteksi", viewed: "Tampilkan",
                markAllAsViewed: "Tandai semua sudah dilihat",
                accept: "Terima", cancel: "Batal", yes: "Ya", no: "Tidak",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔",
                scriptInfoTitle: "Informasi Script", scriptInfoName: "Nama:",
                scriptInfoVersion: "Versi:", scriptInfoDescription: "Deskripsi:",
                scriptInfoDescriptionText: "Menyorot langsung di halaman kampanye drop yang cocok dengan kata kuncimu: hijau di tab kampanye, biru di akan datang, merah di yang sudah berakhir. Panel menampilkannya terpisah menjadi aktif, akan datang dan berakhir —ketiganya sekaligus, karena dibaca dari API: tab Kick memuat ulang halaman, jadi dengan hanya membaca yang ada di depanmu ketiganya tidak akan pernah terlihat bersama—, lengkap dengan rentang tanggal, kata kunci yang cocok dan setiap hadiah beserta jam yang dimintanya. Kata kunci cocok di bagian mana pun dari teks, sehingga «rage» menemukan kampanye bernama «averageaden $5 Bonus»; kartu menyebutkan kata kunci mana itu, agar tidak ada yang muncul tanpa penjelasan. Hadiah yang sudah kamu miliki dicentang dan dicoret satu per satu, dan lencana yang tidak menyisakan apa pun untuk didapat kehilangan waktu tonton yang tadinya diminta. Yang sudah kamu dapatkan tapi belum diambil ditandai terpisah dengan 🎁 —tanpa diredupkan— karena hanya kurang satu klik, dan peringatan penutupan pun ikut menghitungnya. Yang segera tutup naik ke atas: ketika hadiah yang belum kamu miliki tersisa kurang dari 72 jam, kartunya menyebutkan berapa lama lagi dan berapa waktu tonton yang masih kurang —merah di bawah 24 jam— atau bahwa waktunya sudah tidak cukup, dan ⏳ yang sama muncul di kartu kampanye itu sendiri di halaman. Kampanye mendatang juga membawa hadiahnya dan berapa yang diminta setiap tingkat, tetapi tidak pernah tenggat: sebelum dibuka tidak ada yang mendesak, dan hitung mundur sehari sebelumnya hanya membuat gelisah. Dan kampanye yang sudah tertutup dan sudah kamu klaim seluruhnya tidak dicantumkan, karena Kick memindahkannya ke yang diklaim: panel tidak menampilkan baris yang tidak ada di halaman. Kata kunci bisa diubah: klik salah satu untuk menghapus, + untuk menambah, sunting sekaligus atau kembalikan ke bawaan. Kata kunci yang diawali «-» mengecualikan: «-console» membuang kampanye itu meski kata kunci lain sudah menemukannya, sekaligus membawa pergi sorotan, kartu dan pemberitahuannya. Dan empat filter tampilan memangkas daftar yang aktif tanpa menyentuh apa pun yang lain —apa yang masih kurang, apa yang segera tutup, apa yang sudah didapat tapi belum diambil, dan apa yang bisa diraih dalam satu jam atau kurang—: semuanya berlaku bersamaan, diingat, dan tab menyebutkan berapa kartu yang tampil dari berapa yang ada. Daftar aktif diurutkan berdasarkan yang tutup lebih dulu atau yang paling sedikit meminta waktu, sesuai pilihanmu. Dan setiap kampanye aktif membawa, di kartunya sendiri di halaman, waktu yang masih kamu butuhkan untuk mengambil semua sisanya —hadiah termahalnya, karena waktu tonton dihitung per kampanye—, supaya biayanya terlihat sambil menggulir. Kampanye aktif dan akan datang bisa disalin sebagai teks dengan 🔗: judul, tanggal dan hadiah, beserta tautan ke tab tempatnya berada —kampanye atau akan datang— karena di Kick sebuah kampanye tidak punya alamat sendiri. Jika data klaim dan tontonanmu tidak pernah sampai —tanpa itu tidak diketahui apa yang kamu punya maupun berapa lama kamu menonton— panel mengatakannya alih-alih diam dengan tanda-tandanya padam. Di mana pun Kick menggambar bilah kemajuan, mengarahkan tetikus akan menyebutkan dengan tepat berapa waktu tonton yang masih kurang, dan mengekliknya membuka detail drop. Tab klaim mendapat kisinya sendiri yang juga menyebutkan berapa lama sejak kamu memperoleh tiap barang, dan menggantikan daftar Kick agar hal yang sama tidak tampil dua kali. Kotak centang menyembunyikan yang sudah selesai dan menyalakan klaim otomatis, baik untuk drop yang sudah tuntas maupun untuk peti hadiah harian yang Kick berikan karena menonton siaran (yang bukan sebuah drop): peti hanya dibuka ketika hadiahnya benar-benar tersedia, dideteksi tanpa bergantung pada bahasa, dan selalu diperiksa setelah drop, tidak pernah di tengahnya. Dan yang disembunyikannya mencakup hadiah yang sudah kamu klaim, yang Kick tinggalkan di halaman sebagai kotak kosong: yang menentukan sudah diklaim adalah data klaimmu, bukan bentuk halaman. Dan peti itu juga muncul sebagai satu kotak lagi di kisi tersebut, dengan bilah kemajuan Kick: berapa menit menonton yang masih kurang —tetikus di atasnya menyebutkannya, dan mengekliknya membuka jendelanya tanpa mengklaim apa pun—, bahwa ia akan diklaim sendiri begitu selesai, dan —begitu bisa diklaim— sebuah tombol yang mengklaimnya dan membiarkan hasil dari Kick tetap terbuka. Dan hanya milik hari ini: begitu jendela hari itu tutup, kotak itu hilang sampai tantangan baru datang. Menandai dengan 🔔 —di panel dan di kartunya sendiri— kampanye yang berubah sejak terakhir kali kamu melihat, disertai hitungan yang tertunda, notifikasi desktop dan tombol 👁️ yang menganggapnya sudah dilihat dan membawamu ke tab kampanye. 16 bahasa.",
                scriptInfoAuthor: "Penulis:", scriptInfoGitHub: "GitHub:",
                readingApiDrops: "Membaca perubahan drop dari API...",
                earnedUnclaimed: "didapat, belum diklaim",
                urgentUnclaimed: "belum diklaim",
                filterPending: "Masih ada sisa",
                filterSoon: "Segera tutup",
                filterUnclaimed: "Belum diklaim",
                filterQuick: "Tingkat ≤ 1 jam",
                filterBarHint: "Hanya menyaring tab aktif. Beberapa filter berlaku bersamaan.",
                noResultsFiltered: "Tidak ada yang lolos filter aktif.",
                clearFilters: "Hapus filter",
                negativeKeywordHint: "ketik -kata untuk mengecualikan",
                sortLabel: "Urutan:",
                sortUrgent: "Yang tutup dulu",
                sortCheapest: "Yang termurah dulu",
                sortCheapestHint: "Mengurutkan berdasarkan yang paling sedikit dibutuhkan untuk mendapat sesuatu. ⏱ pada kartu adalah hitungan lain: biaya untuk mengambil semuanya.",
                noInventoryData: "Tanpa inventaris: tidak diketahui apa yang kamu punya atau berapa lama menonton.",
                dailyStreakReminder: "Hadiah harian: {done} dari {total} menit ditonton. Jangan sampai runtutanmu hilang hari ini.",
                urgentClosesIn: "berakhir dalam",
                urgentNeed: "kurang",
                urgentNoTime: "waktu tidak cukup",
                claimedInventoryTitle: "Diklaim",
                shareCopy: "Salin untuk dibagikan",
                collapsePanel: "Sembunyikan panel",
                expandPanel: "Tampilkan panel",
                dismissDailyReminder: "Bisukan sampai besok",
                dailyRewardTitle: "Hadiah harian",
                dailyRewardAuto: "Diklaim otomatis begitu waktunya habis",
                dailyRewardClaim: "Klaim",
                shareCopied: "Disalin"



            }
        };
        const t = { ...i18n["en"], ...(i18n[lang] || {}) };

        // =============================================
        // CONSTANTES Y CONFIGURACION
        // =============================================

        const DEFAULT_KEYWORDS = [
            "rust", "pubg", "fortnite", "minecraft", "roblox", "valorant",
            "apex", "call of duty", "gta", "dota"
        ];

        const STORAGE_KEY = "kick_drop_keywords";
        const SHOW_HIDE_INVENTORY_EXPIRED = "kick_show_hide_inventory_expired";
        const COLLAPSE_KEY = "kick_drops_collapse_preview";
        const STORAGE_NOTIFS = "kick_drop_notifications";
        const VIEW_FILTERS_KEY = "kick_drops_view_filters";
        const SORT_MODE_KEY = "kick_drops_sort_mode";
        const FOCUS_TARGET_KEY = "kick_drops_focus_target";

        // Filtros de vista. El orden es el de la barra: de lo mas general a lo mas
        // concreto.
        const VIEW_FILTER_IDS = ['pending', 'soon', 'unclaimed', 'quick'];

        // "Un rato corto": el tramo que se saca en una sesion sin planificarla.
        const QUICK_MAX_MINUTES = 60;

        // Orden de la pestaña de abiertos. 'urgent' es el de siempre y sigue siendo
        // el de por defecto: la fecha de cierre es la unica que se pierde sola.
        const SORT_MODES = ['urgent', 'cheapest'];

        // Antes de avisar de que falta el inventario se esperan unos segundos: al
        // arrancar el dato aun no ha llegado y eso no es un fallo, es una carrera.
        const INVENTORY_WARN_DELAY_MS = 8000;

        const ORIGINAL_TITLE = document.title || (document.querySelector('title') ? document.querySelector('title').textContent : '');

        const NOTIFICATION_BEEP_INTERVAL_MS = 5000;
        const NOTIFICATION_VOLUME = 0.75;

        // Kick section header texts for open/closed campaign detection (i18n)
        const OPEN_HEADER_TEXTS = [
            "Open campaigns",
            "الحملات المتاحة",
            "Offene Kampagnen",
            "Campañas abiertas",
            "Avaa kampanjat",
            "Campagnes aperte",
            "सक्रिय अभियान",
            "Buka kampanye",
            "進行中のキャンペーン",
            "진행 중인 캠페인",
            "Otwarte kampanie",
            "Campanhas abertas",
            "Открытые кампании",
            "Aktif kampanyalar",
            "Mở Chiến dịch",
            "开放活动"
        ];

        const CLOSED_HEADER_TEXTS = [
            "Closed campaigns",
            "الحملات المغلقة",
            "Geschlossene Kampagnen",
            "Campañas cerradas",
            "Suljetut kampanjat",
            "Campagnes chiuse",
            "समाप्त अभियान",
            "Kampanye Tertutup",
            "終了したキャンペーン",
            "종료된 캠페인",
            "Zakończone kampanie",
            "Campanhas encerradas",
            "Закрытые кампании",
            "Kapalı kampanyalar",
            "Các chiến dịch đã đóng",
            "Campagnes fermées",
            "Campagne chiuse",
            "ปิดแคมเปญ",
            "已关闭的广告活动",
            "已结束的活动",
            "已關閉的廣告活動"
        ];

        // Kick "upcoming" section header texts (campaigns scheduled but not started yet).
        // These campaigns must live in their own tab and never trigger notifications
        // until they actually become active. (i18n)
        const UPCOMING_HEADER_TEXTS = [
            "Upcoming campaigns",
            "الحملات القادمة",
            "Kommende Kampagnen",
            "Bevorstehende Kampagnen",
            "Próximas campañas",
            "Tulevat kampanjat",
            "Campagnes à venir",
            "Prochaines campagnes",
            "Campagne imminenti",
            "आगामी अभियान",
            "Kampanye Mendatang",
            "今後のキャンペーン",
            "近日開催のキャンペーン",
            "예정된 캠페인",
            "다가오는 캠페인",
            "Nadchodzące kampanie",
            "Próximas campanhas",
            "Предстоящие кампании",
            "Yaklaşan kampanyalar",
            "Chiến dịch sắp tới",
            "Các chiến dịch sắp tới",
            "แคมเปญที่กำลังจะมีขึ้น",
            "即将开始的活动",
            "即將舉行的活動",
            "即将推出的广告活动"
        ];

        const ACTIVE_STYLE = `border: 4px solid #3ad900 !important; box-shadow: 0 0 30px #53fc18 !important; border-radius: 16px !important; scroll-margin-top: 100px;`;
        const EXPIRED_STYLE = `border: 4px solid #971311 !important; box-shadow: 0 0 30px #ff8280 !important; border-radius: 16px !important; scroll-margin-top: 100px;`;
        const UPCOMING_STYLE = `border: 4px solid #2d7fff !important; box-shadow: 0 0 30px #5aa3ff !important; border-radius: 16px !important; scroll-margin-top: 100px;`;

        const DEBUG_SNAPSHOTS = false;

        // =============================================
        // LECTURA DE TARJETAS: DOM VIEJO Y DOM NUEVO
        // =============================================
        // El rediseño de agosto de 2026 cambio la forma de una campaña, no solo su
        // ruta. Antes cada juego era un acordeon de Radix UI
        // ([data-orientation="vertical"] con botones [data-state]) y sus
        // sub-campañas colgaban dentro. Ahora son divs planos, sin acordeon:
        //
        //   div.bg-surface-base.rounded-2xl                 <- GRUPO del juego
        //     div > div > img[alt=juego]                       banner h-[67px] w-[50px]
        //              h2.text-2xl.font-bold.lg:text-base      nombre del juego ("Rust")
        //              p...lg:hidden                           estudio ("Facepunch Studios")
        //              p...max-lg:hidden                       contador ("12 claimed drops")
        //     div.border-outline-decorative.bg-surface-base  <- TARJETA de sub-campaña (xN)
        //       img.size-6[alt=organizacion]
        //       h2.text-sm.font-bold                            nombre de la sub-campaña
        //       span.bg-secondary-base                          etiqueta ("Watch to redeem")
        //       p.text-surface-onSurfaceSecondary.text-sm       ventana de fechas
        //       ul > li ...                                     rewards
        //
        // Tres trampas de este DOM, todas verificadas contra el volcado real:
        //
        // 1. El GRUPO y la TARJETA llevan los dos `bg-surface-base`, que es como el
        //    escaneo encuentra campañas. Sin distinguirlos, cada sub-campaña se
        //    duplica como tarjeta propia del panel (el mismo problema que resolvia
        //    el guard de `break-words` en el DOM viejo).
        // 2. El nombre del juego ya no es `.text-base.font-bold` sino un <h2> con
        //    `lg:text-base`, que es OTRO token de clase: `.text-base` no casa.
        // 3. `.text-neutral-300` ya NO es la fecha. Ahora es el parrafo descriptivo
        //    de la pestaña, que vive FUERA de las tarjetas; la ventana de fechas
        //    bajo a la tarjeta de sub-campaña.

        // Un grupo de juego del DOM nuevo. Se piden las DOS clases: la tarjeta de
        // sub-campaña tambien es `bg-surface-base`, pero no es `rounded-2xl`.
        // Seccion del panel que alimenta la pestaña actual, o null si la ruta no lo
        // dice (DOM viejo, donde las secciones se separaban por <h1> en una sola pagina).
        function _routeStatus() {
            if (_isComingSoonPage()) return 'upcoming';
            if (_isCampaignsPage()) return 'active';
            if (_isExpiredPage()) return 'expired';
            return null;
        }

        function _isNewGameGroup(node) {
            return !!node && node.classList &&
                node.classList.contains('bg-surface-base') &&
                node.classList.contains('rounded-2xl');
        }

        // Una tarjeta de sub-campaña del DOM nuevo. No basta con la clase del borde
        // —`border-outline-decorative` es un token de diseño generico que el DOM
        // viejo tambien podria llevar, y dar por sub-campaña un acordeon viejo
        // borraria campañas reales del panel—: se exige ademas colgar de un grupo
        // `.rounded-2xl`, que es la forma que SOLO tiene el DOM nuevo.
        function _isNewCampaignCard(node) {
            if (!node || !node.classList || !node.closest) return false;
            if (!node.classList.contains('border-outline-decorative')) return false;
            if (_isNewGameGroup(node)) return false;
            return !!node.closest('.bg-surface-base.rounded-2xl');
        }

        // Los espacios se colapsan, no solo se recortan: Kick parte titulos y fechas
        // en varias lineas dentro del mismo nodo, y lo que llega de la API viene con
        // un espacio. Sin esto, dos cadenas que son el MISMO texto no se reconocen.
        function _collapse(s) {
            return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
        }

        // Nombres de las SUB-CAMPAÑAS de un grupo. Es la otra clave con la que una
        // tarjeta del DOM puede reconocerse en la API, y hace falta porque el cruce
        // por titulo no siempre existe: cuando la campaña no trae `category` —13 de
        // 24 el 2026-08-05— la clave de la API es el nombre de la campaña («ED'S
        // DROP») mientras la fila enseña el del juego («KICK»), asi que la MISMA
        // campaña sale dos veces en el panel, la tarjeta del DOM y la entrada de la
        // API. Visto el 2026-08-20: «Expiradas (3)» con solo dos campañas reales.
        // Este nombre SI esta en las dos fuentes: aqui como <h2> de la tarjeta de
        // sub-campaña, y en la API como `campaign.name`, que se guarda en
        // `drops[].campaignName`.
        //
        // El selector es estructural y no por texto. Dentro de un grupo hay tres
        // formas de <h2> —el juego (`text-2xl … lg:text-base`), la sub-campaña
        // (`text-sm`) y el encabezado de recompensas (`text-lg`)— y reconocer el de
        // recompensas por su texto pediria acertarlo en 16 idiomas («Rewards»,
        // «Recompensas», «Claimed rewards»).
        //
        // Si un rediseño cambia esas clases esto devuelve lista vacia, el cruce no
        // ocurre y el panel se queda como estaba: la degradacion es hacia el
        // duplicado, nunca hacia esconder una campaña que si habria que mostrar.
        function _subCampaignNamesOf(node) {
            if (!node || !node.querySelectorAll) return [];
            const out = [];
            for (const h of node.querySelectorAll('h2.text-sm.font-bold')) {
                const name = _collapse(h.textContent);
                if (name && out.indexOf(name) === -1) out.push(name);
            }
            return out;
        }

        // Elemento que lleva el nombre del JUEGO dentro de un nodo de campaña.
        // El orden importa y no es intercambiable:
        //   1. `.text-base.font-bold` es el DOM viejo, y en el nuevo no casa con
        //      nada (el h2 del juego trae `lg:text-base`), asi que va primero sin
        //      riesgo de robarle el turno al selector nuevo.
        //   2. `h2.font-bold` es el DOM nuevo. Dentro de un grupo hay tres h2 con
        //      `font-bold` (juego, sub-campaña y "Claimed rewards"); querySelector
        //      devuelve el primero en orden de documento, que es el del juego.
        //   3. El respaldo generico, que es lo que salvaba al DOM nuevo hasta hoy
        //      pero devolvia el nombre de la sub-campaña en las tarjetas.
        function _gameNameElOf(node) {
            if (!node || !node.querySelector) return null;
            return node.querySelector('.text-base.font-bold') ||
                node.querySelector('h2.font-bold') ||
                node.querySelector('[class*="font-bold"]');
        }

        // Estudio / organizacion. En el DOM nuevo el escritorio muestra el contador
        // ("12 claimed drops") donde antes iba el estudio, y el estudio queda en el
        // <p> de movil: sigue en el DOM y textContent lo lee igual aunque no se vea.
        // Los dos <p> se distinguen por token EXACTO de clase — `lg:hidden` es el
        // estudio, `max-lg:hidden` el contador—: un [class*="lg:hidden"] casaria
        // con los dos, porque "max-lg:hidden" contiene "lg:hidden".
        //
        // Importa mas de lo que parece: el titulo que se compone aqui ("Rust -
        // Facepunch Studios") es la clave con la que _findEntryForTitle cruza la
        // tarjeta contra el `${categoria} - ${organizacion}` de la API. Sin estudio,
        // el cruce se degrada al nombre del juego solo.
        function _studioTextOf(node, gameNameEl) {
            if (!node || !node.querySelector) return '';
            const gameName = _collapse(gameNameEl && gameNameEl.textContent).toLowerCase();
            // Un candidato solo vale si no esta vacio y NO es el nombre del juego. La
            // segunda mitad la pide el grupo KICK: cortada la via del contador, el
            // ultimo recurso encuentra `img.size-6[alt="KICK"]` —el logo de la
            // organizacion, que ahi se llama igual que el juego— y el titulo pasaria
            // de «KICK - 11 expired drops» a «KICK - KICK», que sigue sin casar con
            // nada. Cada via se intenta y se descarta por separado: un candidato malo
            // no cancela los siguientes.
            const candidate = (s) => {
                const v = _collapse(s);
                return v && v.toLowerCase() !== gameName ? v : '';
            };
            const oldEl = node.querySelector('.text-secondary-onSecondaryVariant') ||
                node.querySelector('.text-start.text-sm');
            if (oldEl && oldEl !== gameNameEl) {
                const s = candidate(oldEl.textContent);
                if (s) return s;
            }
            if (gameNameEl && gameNameEl.parentElement) {
                let studioP = null, counterP = null;
                for (const p of gameNameEl.parentElement.querySelectorAll('p')) {
                    if (!studioP && p.classList.contains('lg:hidden')) studioP = p;
                    else if (!counterP && p.classList.contains('max-lg:hidden')) counterP = p;
                }
                // Distinguir los tokens exactos era necesario pero NO suficiente.
                // Verificado el 2026-08-20 en el grupo KICK del volcado de expiradas:
                // los DOS <p> traen el contador ("11 expired drops"), porque KICK es
                // su propia organizacion y ahi no hay estudio que leer en ningun
                // sitio. En Old School RuneScape son "Jagex" / "1 expired drop" y en
                // PUBG "KRAFTON" / "1 active drop". Asi que cuando los dos dicen lo
                // MISMO, ese texto es el contador y esta fila no tiene estudio.
                //
                // Se comparan los dos textos en vez de buscar un numero o la palabra
                // "drops": la prueba es estructural y no depende del idioma de la UI.
                const sameText = studioP && counterP &&
                    _collapse(studioP.textContent) === _collapse(counterP.textContent);
                if (studioP && !sameText) {
                    const s = candidate(studioP.textContent);
                    if (s) return s;
                }
            }
            // Ultimo recurso: el alt del logo de la organizacion en la primera
            // tarjeta de sub-campaña, que es el mismo nombre.
            const orgImg = node.querySelector('img.size-6[alt]');
            return candidate(orgImg && orgImg.alt);
        }

        // Ventana de fechas. `.text-neutral-300` (DOM viejo) se consulta primero y
        // es seguro: en el DOM nuevo ese parrafo esta fuera del grupo, asi que
        // preguntando DESDE el nodo no aparece. El selector nuevo es exacto a
        // proposito: los dos <p> de la cabecera del grupo traen `lg:text-sm`, no
        // `text-sm`, asi que solo casa la fecha.
        //
        // Un grupo con varias sub-campañas puede tener varias ventanas distintas y
        // aqui se muestra la de la primera; la precision fina la pone la linea de
        // urgencia, que sale de la API y va por reward.
        function _dateRangeOf(node) {
            if (!node || !node.querySelector) return '';
            const el = node.querySelector('.text-neutral-300') ||
                node.querySelector('p.text-surface-onSurfaceSecondary.text-sm');
            // Los espacios se colapsan, no solo se recortan por los bordes: Kick parte la
            // fecha en varias lineas dentro del <p>, y aunque en HTML eso no se ve, el
            // texto que se copia con el 🔗 es texto plano y se lleva el salto de linea a
            // mitad de la fecha ("11 jun 2026,\n 13:45 - 14 jun 2026, 21:00").
            return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
        }

        // Kick is always dark theme
        const colors = {
            primary: "#53fc18",
            primaryLight: "#7aff4d",
            primaryDark: "#3ad900",
            green: "#53fc18",
            red: "#ff4d4d",
            gray: "#adadb8",
            orange: "#ff9900",
            upcoming: "#2d7fff",
            upcomingLight: "#5aa3ff",
            bg: "#0e0e10",
            text: "#efeff1",
            surface: "#1a1a1d",
            border: "#2a2a2d"
        };

        // =============================================
        // FUNCIONES DE ALMACENAMIENTO / PERSISTENCIA
        // =============================================

        function getStoredKeywords() {
            const stored = GM_getValue(STORAGE_KEY, null);
            if (stored) {
                try { return JSON.parse(stored); } catch (e) { return DEFAULT_KEYWORDS.slice(); }
            }
            return DEFAULT_KEYWORDS.slice();
        }

        function setStoredKeywords(keywords) {
            GM_setValue(STORAGE_KEY, JSON.stringify(keywords));
        }

        function resetKeywords() {
            GM_setValue(STORAGE_KEY, JSON.stringify(DEFAULT_KEYWORDS.slice()));
        }

        // ---------------------------------------------
        // Keywords positivas y negativas
        // ---------------------------------------------
        // Las negativas viven en la MISMA lista, con un `-` delante, para que se
        // editen, se borren y se guarden por los caminos que ya existen: chips,
        // edicion en bloque, reinicio. Se separan al usarlas, nunca al guardarlas,
        // asi que el almacenamiento sigue siendo un array de cadenas y una version
        // vieja del script leeria "-fortnite" como una keyword que no casa con
        // nada, que es el fallo inofensivo.
        function _splitKeywords(list) {
            const positive = [];
            const negative = [];
            for (const raw of (list || [])) {
                const k = String(raw || '').trim().toLowerCase();
                if (!k) continue;
                if (k.startsWith('-')) {
                    const body = k.slice(1).trim();
                    if (body) negative.push(body);
                } else {
                    positive.push(k);
                }
            }
            return { positive, negative };
        }

        // Casa si toca al menos una positiva Y ninguna negativa. La negativa manda
        // sobre la positiva a proposito: "rust" pero no "rust console" solo tiene
        // sentido si lo segundo gana.
        function _matchesKeywords(searchText) {
            const { positive, negative } = _splitKeywords(keywords);
            if (negative.some(k => searchText.includes(k))) return false;
            return positive.some(k => searchText.includes(k));
        }

        // La mitad negativa de _matchesKeywords, suelta. Hace falta aparte porque «no
        // casa» tiene DOS motivos que no son intercambiables: no haber encontrado ninguna
        // positiva —que otra fuente todavia puede desmentir, ver _apiEntryForCard— o haber
        // encontrado una negativa, que es una orden y no admite segunda opinion.
        function _hasNegativeKeyword(searchText) {
            return _splitKeywords(keywords).negative.some(k => searchText.includes(k));
        }

        // Las que se enseñan en la tarjeta: solo positivas, porque son las que
        // explican POR QUE aparece la campaña.
        function _matchedPositiveKeywords(searchText) {
            return _splitKeywords(keywords).positive.filter(k => searchText.includes(k));
        }

        // ---------------------------------------------
        // Filtros de vista
        // ---------------------------------------------
        // Se validan contra la lista conocida al leer: un id que ya no exista —o
        // basura en el almacenamiento— se descarta, en vez de esconder tarjetas
        // por una regla que ya nadie implementa.
        function getViewFilters() {
            const stored = GM_getValue(VIEW_FILTERS_KEY, null);
            if (!stored) return [];
            try {
                const list = JSON.parse(stored);
                if (!Array.isArray(list)) return [];
                return list.filter(id => VIEW_FILTER_IDS.includes(id));
            } catch (e) {
                return [];
            }
        }

        function setViewFilters(list) {
            const clean = (list || []).filter(id => VIEW_FILTER_IDS.includes(id));
            GM_setValue(VIEW_FILTERS_KEY, JSON.stringify(clean));
        }

        // Mismo criterio que los filtros: un valor desconocido cae al de por
        // defecto en vez de dejar la lista en un orden que nadie implementa.
        function getSortMode() {
            const v = GM_getValue(SORT_MODE_KEY, null);
            return SORT_MODES.includes(v) ? v : 'urgent';
        }

        function setSortMode(mode) {
            GM_setValue(SORT_MODE_KEY, SORT_MODES.includes(mode) ? mode : 'urgent');
        }

        // ---------------------------------------------
        // Poda del almacenamiento local
        // ---------------------------------------------
        // Ni el historial de notificaciones ni la lista de inventario descartado
        // tenian tope. Una campaña que expiraba dejaba su entrada para siempre
        // (el chequeo de cambios solo hace "continue" cuando ya no quedan drops),
        // y las claves descartadas solo se borraban con los botones de reinicio.
        // Lo unico que vaciaba las notificaciones era el reset por cambio de
        // @version: de golpe y solo si habia release. Ahora se acotan al leer y
        // al escribir, asi que el limite se aplica siempre.

        // Una campaña de drops dura semanas: a los 60 dias sin actualizarse la
        // entrada ya no describe nada vivo, este vista o no.
        const NOTIF_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
        const NOTIF_MAX_ENTRIES = 200;

        function _notifTs(n) {
            return Number(n && (n.updatedAt || n.createdAt)) || 0;
        }

        function pruneNotifications(notifs) {
            if (!Array.isArray(notifs)) return [];
            const now = Date.now();
            let out = notifs.filter(n => {
                const ts = _notifTs(n);
                // Sin marca de tiempo utilizable no se puede juzgar la edad: se
                // conserva, y del volumen ya se encarga el tope por cantidad.
                return ts === 0 || now - ts < NOTIF_MAX_AGE_MS;
            });
            if (out.length > NOTIF_MAX_ENTRIES) {
                // Conservar las mas recientes SIN reordenar la lista: la pestaña de
                // notificaciones la pinta en el orden en que esta guardada.
                const keep = new Set(
                    out.slice().sort((a, b) => _notifTs(b) - _notifTs(a)).slice(0, NOTIF_MAX_ENTRIES)
                );
                out = out.filter(n => keep.has(n));
            }
            return out;
        }

        // Las claves se añaden con push, asi que las mas recientes quedan al final
        // y el recorte va por la cabeza. Se deduplica ademas de acotar.
        function getNotifications() {
            const stored = GM_getValue(STORAGE_NOTIFS, null);
            if (stored) {
                try { return pruneNotifications(JSON.parse(stored)); } catch (e) { return []; }
            }
            return [];
        }

        function saveNotifications(notifs) {
            GM_setValue(STORAGE_NOTIFS, JSON.stringify(pruneNotifications(notifs)));
        }

        function resetNotifications() {
            GM_setValue(STORAGE_NOTIFS, JSON.stringify([]));
        }

        // =============================================
        // DROPS API (web.kick.com)
        // =============================================

        const KICK_DROPS_API_URL = 'https://web.kick.com/api/v1/drops/campaigns';

        // Donde sirve Kick las imagenes que devuelve la API en relativo. Vivia en la
        // seccion de reclamados, mas abajo, pero aqui tambien hace falta y no se puede
        // referenciar hacia adelante: un `const` sin ejecutar todavia lanza por TDZ.
        const KICK_CDN_BASE = 'https://ext.cdn.kick.com/';

        // In-memory map: campaignName -> [{name, minutes}]
        const _apiDropNames = {};
        let _apiDataReady = false;

        // ---------------------------------------------
        // EL CARTEL NARANJA DEL PANEL
        // ---------------------------------------------
        // Dice que lo que ves todavia no es definitivo, y no se veia NUNCA. Estaba atado
        // solo a la API: se creaba con `display: _apiDataReady ? "none" : "flex"`, y la
        // API contesta en unos cientos de milisegundos mientras el panel se construye
        // despues, asi que al nacer _apiDataReady ya era true y salia escondido de
        // fabrica. Lo unico que quedaba a la vista era el cartel del centro y, al final,
        // el texto de cada solapa.
        //
        // Ahora vive mientras dura el escaneo, que es todo el rato que el panel puede
        // cambiar, y cambia de texto cuando la API entra: "leyendo la API" primero,
        // "buscando" despues. Hacen falta los dos textos, no vale con dejar el primero:
        // en cuanto la API contesta —casi siempre antes de que el escaneo acabe— seguir
        // diciendo que se esta leyendo la API seria mentira.
        //
        // No choca con el cartel del centro: ese dice que el script esta trabajando y
        // tapa la pagina; este vive dentro del panel y explica por que las solapas estan
        // vacias o incompletas. Lo que se descarto fue un tercer texto, el contador de
        // puntos, que repetia al del centro (ver _startDropsPolling).
        let _dropsScanDone = false;

        function _updateApiLoadingBanner() {
            const el = document.getElementById("kick-drops-api-loading");
            if (!el) return;
            // En RECLAMADOS no hay escaneo de pagina que esperar: esa pestaña no se
            // escanea (va por _claimedPageWork), su panel se llena entero de la API y la
            // rejilla se pinta por su cuenta. Como `_dropsScanDone` solo lo levanta el
            // escaneo, ahi se quedaba en false para siempre y el cartel naranja no se
            // iba nunca: «Buscando...» eterno con el inventario ya pintado detras.
            // Reportado el 2026-08-22. Aqui lo que decide es la API, que es lo unico
            // que de verdad falta por llegar.
            if (_dropsScanDone || (_isClaimedPage() && _apiDataReady)) {
                el.style.display = "none";
                return;
            }
            el.style.display = "flex";
            const label = el.querySelector(".kick-api-loading-text");
            if (label) {
                label.textContent = _apiDataReady
                    ? (t.searching || 'Searching') + '...'
                    : (t.readingApiDrops || 'Reading drop changes from API...');
            }
        }
        // Que estados ha devuelto la API de verdad, para poder decirlo en consola.
        // No es adorno: de esto depende que la solapa de proximas se llene, y no se
        // puede comprobar desde fuera (la API da 403 sin la sesion del navegador).
        const _apiStatusSeen = {};

        // De aqui salen las secciones del panel que NO estan delante. Hace falta
        // porque las pestañas de Kick recargan la pagina entera —cada salto relanza
        // el script y borra lo escaneado—, asi que leyendo el DOM solo se puede saber
        // de la pestaña en la que estas. La API las devuelve todas en una peticion.
        //
        // El estado se toma de `status` cuando la palabra se reconoce, y si no se
        // deduce de las fechas. Las fechas son el criterio que no depende de que Kick
        // mantenga su vocabulario, asi que son el respaldo y no al contrario.
        const _STATUS_RANK = { expired: 1, upcoming: 2, active: 3 };

        // La imagen de la tarjeta del panel. Antes salia del <img> del DOM y ahora hace
        // falta sacarla de aqui: la seccion que no tienes delante no tiene DOM del que
        // leerla, asi que las tarjetas de cerrados y de proximos se quedaban sin imagen.
        //
        // Se prueban varios nombres de campo porque NO consta cual trae la imagen de la
        // categoria —la API da 403 desde fuera del navegador, asi que su forma solo se
        // puede ver desde dentro— y de ahi tambien el log de mas abajo. El ultimo
        // recurso es la imagen de la primera recompensa: no es el banner del juego, pero
        // identifica la campaña, que es para lo que esta la imagen en la tarjeta.
        function _cdnUrl(u) {
            const s = String(u || '');
            if (!s) return '';
            return /^https?:\/\//.test(s) ? s : KICK_CDN_BASE + s;
        }

        function _apiImage(campaign) {
            const cat = (campaign && campaign.category) || {};
            const direct = cat.image_url || cat.image || cat.banner || cat.thumbnail ||
                (cat.banner_image && (cat.banner_image.url || cat.banner_image.src)) ||
                (campaign && (campaign.image_url || campaign.image)) || '';
            if (direct) return _cdnUrl(direct);
            for (const r of ((campaign && campaign.rewards) || [])) {
                if (r && r.image_url) return _cdnUrl(r.image_url);
            }
            return '';
        }

        // Cuantas campañas traen `category`, que es de donde sale el NOMBRE DEL JUEGO
        // —la mitad del texto contra el que se comparan las keywords, y la imagen de la
        // tarjeta—. No es curiosidad: la API da 403 desde fuera del navegador, asi que
        // esto es lo unico que dice si el campo sigue ahi.
        //
        // Se cuenta sobre TODAS las campañas y no sobre la primera. Importa: mirando solo
        // la primera parecio que Kick habia quitado el campo, y lo que pasaba es que esa
        // campaña concreta no lo traia. Verificado el 2026-08-05: llegaba en 13 de 24.
        //
        // Las que no lo traen se quedan con el nombre de la sub-campaña, que es el
        // respaldo de siempre. NO se intenta sacar el juego de `url`: es una nota de
        // prensa (`about.kick.com/news-and-press/7-kicks-drop-is-here-watch-earn-...`),
        // asi que sus palabras son copy de marketing y meterlas en el texto que se
        // compara solo puede disparar una keyword —o una negativa— por accidente.
        let _apiWithCategory = 0;
        let _apiCampaignCount = 0;

        function _campaignStatus(campaign) {
            const s = String((campaign && campaign.status) || '').toLowerCase();
            if (/^(active|live|running|open)$/.test(s)) return 'active';
            if (/upcoming|scheduled|soon|pending|future|coming/.test(s)) return 'upcoming';
            if (/end|expir|complet|finish|closed|inactive|archiv/.test(s)) return 'expired';
            const now = Date.now();
            const end = Date.parse((campaign && campaign.ends_at) || '');
            if (Number.isFinite(end) && end <= now) return 'expired';
            const start = Date.parse((campaign && campaign.starts_at) || '');
            if (Number.isFinite(start) && start > now) return 'upcoming';
            return 'active';
        }

        async function fetchDropsFromAPI() {
            try {
                const resp = await fetch(KICK_DROPS_API_URL);
                if (!resp.ok) return;
                const json = await resp.json();
                const allCampaigns = json.data;
                if (!Array.isArray(allCampaigns)) return;

                // Rebuild from scratch each fetch so a re-invocation never accumulates
                // duplicate drops into the per-game entries below.
                for (const k of Object.keys(_apiDropNames)) delete _apiDropNames[k];
                for (const k of Object.keys(_apiStatusSeen)) delete _apiStatusSeen[k];

                for (const campaign of allCampaigns) {
                    // Ya NO se descarta lo que no esta abierto: el panel necesita las
                    // proximas, y esta es la unica fuente que las ve sin cambiar de
                    // pestaña. Lo que se hace es clasificarlas.
                    const status = _campaignStatus(campaign);
                    const raw = String(campaign.status || '(sin status)');
                    _apiStatusSeen[raw] = (_apiStatusSeen[raw] || 0) + 1;

                    _apiCampaignCount++;
                    if (campaign.category && Object.keys(campaign.category).length) _apiWithCategory++;

                    const campaignName = campaign.name || '';
                    const categoryName = campaign.category?.name || '';
                    const orgName = campaign.organization?.name || '';
                    const searchText = (campaignName + ' ' + categoryName + ' ' + orgName).toLowerCase();
                    if (!_matchesKeywords(searchText)) continue;

                    const drops = [];
                    for (const reward of (campaign.rewards || [])) {
                        const minutes = reward.required_units || 0;
                        const hours = minutes / 60;
                        drops.push({
                            name: reward.name || '',
                            minutes: minutes,
                            label: (reward.name || '') + (hours >= 1 ? ` (${hours} h)` : minutes > 0 ? ` (${minutes} min)` : ''),
                            // Las fechas caen a las de la campaña porque es donde
                            // viven de verdad: /drops/campaigns las pone en la
                            // campaña y sus `rewards[]` solo traen id, name,
                            // required_units e image_url. Se intenta antes la de la
                            // reward por si algun dia la trae —un tramo con su
                            // propio cierre seria mas preciso que el de la campaña—,
                            // pero hoy el valor que llega es siempre el de abajo.
                            starts_at: reward.starts_at || campaign.starts_at || '',
                            ends_at: reward.ends_at || campaign.ends_at || '',
                            // Identidad del drop. /drops/campaigns y /drops/progress
                            // describen las mismas rewards con el MISMO id, asi que es
                            // lo que permite saber cual esta reclamada. Sin id, dos
                            // rewards que comparten tramo de minutos son
                            // indistinguibles y el subrayado tendria que adivinar.
                            rewardId: reward.id || '',
                            // A que sub-campaña pertenece. Kick cuenta el tiempo
                            // visto por campaña (`progress_units`), no por reward, y
                            // una tarjeta del panel agrupa TODAS las sub-campañas de
                            // un juego: sin este nombre no hay forma de saber cuanto
                            // llevas visto de la que reparte esta reward concreta.
                            campaignName: campaignName
                        });
                    }
                    if (drops.length > 0) {
                        // Key by category name (game name) so every sub-campaign that shares
                        // the same game lands in a single entry. A game like Rust ships many
                        // sub-campaigns (Wallpaper Pack, Team X + Y, ...) that the DOM groups
                        // under one "Rust - Facepunch Studios" accordion, so ACCUMULATE their
                        // drops here instead of overwriting — otherwise only the last
                        // sub-campaign's badge would survive.
                        const key = categoryName || campaignName;
                        // Full display title matching DOM format: "Game - Studio"
                        const displayTitle = orgName ? `${categoryName || campaignName} - ${orgName}` : (categoryName || campaignName);
                        if (!_apiDropNames[key]) {
                            _apiDropNames[key] = {
                                drops: [], displayTitle, status, imgSrc: _apiImage(campaign),
                                // Si la clave es el nombre del JUEGO o el de la campaña.
                                // `category` es opcional —13 de 24 el 2026-08-05— y cuando
                                // falta, la clave pasa a ser el nombre de la campaña.
                                // Importa para el cruce con la pagina: la fila enseña el
                                // juego, asi que solo una clave que SEA el juego puede
                                // casar con ella (ver _apiEntryForCard).
                                keyIsCategory: !!categoryName,
                                // El MISMO texto contra el que se acaba de filtrar. Se
                                // guarda porque si no, la tarjeta no puede decir por que
                                // esta ahi: las etiquetas se calculaban sobre el titulo
                                // que se muestra, y el filtro mira ademas el nombre de la
                                // campaña. Una campaña que casaba solo por ahi salia en el
                                // panel SIN NINGUNA ETIQUETA, o sea sin explicacion, y eso
                                // es indistinguible de un fallo del filtro.
                                //
                                // Visto de verdad: la keyword "rage" casa dentro de
                                // "ave-rage-aden $5 Stake.com Bonus" —el nombre de la
                                // campaña— mientras el titulo era "Slots & Casino -
                                // Stake.com", donde "rage" no aparece.
                                searchText
                            };
                        }
                        // Un juego acumula sus sub-campañas en una sola entrada, asi que el
                        // texto tambien se acumula: la etiqueta puede venir del nombre de
                        // cualquiera de ellas, no solo de la primera que llego.
                        else if (_apiDropNames[key].searchText.indexOf(searchText) === -1) {
                            _apiDropNames[key].searchText += ' ' + searchText;
                        }
                        _apiDropNames[key].drops.push(...drops);
                        // Un juego agrupa varias sub-campañas y la primera puede no traer
                        // imagen: se toma la primera que la tenga.
                        if (!_apiDropNames[key].imgSrc) {
                            _apiDropNames[key].imgSrc = _apiImage(campaign);
                        }
                        // Un juego puede repartir sub-campañas en estados distintos y
                        // en el panel es UNA tarjeta: manda la mas viva, que es la que
                        // decide en que solapa aparece. Al reves, una sub-campaña ya
                        // cerrada mandaria a "cerrados" un juego con drops abiertos.
                        if (_STATUS_RANK[status] > _STATUS_RANK[_apiDropNames[key].status]) {
                            _apiDropNames[key].status = status;
                        }
                    }
                }
            } catch (e) { console.warn('[Kick Drops API] Fetch error:', e); }
            _apiDataReady = true;
            // De aqui salen las solapas de abiertos y proximos, asi que queda dicho
            // que estados llegaron y cuantas campañas quedaron en cada solapa. Si
            // "proximos" sale a 0 con campañas proximas en la web, es que la API no
            // las devuelve y hay que sacarlas de otro sitio.
            const porSolapa = { active: 0, upcoming: 0, expired: 0 };
            for (const e of Object.values(_apiDropNames)) porSolapa[e.status]++;
            console.log('[Kick Drops] API:', JSON.stringify(_apiStatusSeen),
                '-> tus keywords:', JSON.stringify(porSolapa),
                '| con category:', _apiWithCategory + '/' + _apiCampaignCount);
            // La API ya esta, pero el escaneo de la pagina sigue: el cartel no se va, se
            // pasa a decir "buscando".
            _updateApiLoadingBanner();
            // Process snapshots from API data regardless of current page
            _processSnapshotsFromAPI();
            if (_isCampaignsPage()) {
                // Re-escanea la pagina y repinta entero: ahora si hay fechas y tramos
                // con los que ordenar y filtrar.
                highlightAndLinkDrops();
            } else {
                _refreshPanelAfterLateData();
            }
        }

        // ---------------------------------------------
        // LA FILA QUE CASA POR ALGO QUE NO ESTA EN LA FILA
        // ---------------------------------------------
        // El filtro de la API mira `campaña + categoria + organizacion` y el de la pagina
        // solo el titulo de la fila, asi que una campaña que casa por el NOMBRE DE LA
        // CAMPAÑA salia en el panel y la pagina la dejaba sin marcar. Es el caso que este
        // mismo fichero ya documentaba mas arriba: «rage» dentro de «ave-rage-aden $5
        // Stake.com Bonus», con la fila diciendo «Slots & Casino - Stake.com», donde
        // «rage» no aparece por ningun lado. Y no era solo el marcado: esa campaña no
        // generaba aviso nunca, y al tocar la lista de keywords su aviso se borraba solo.
        //
        // El cruce se exige EXACTO y a proposito NO se usa _findEntryForTitle, que casa
        // por subcadena en los dos sentidos: aflojar el filtro de la pagina con una regla
        // laxa marcaria filas de mas, que es peor que la falta que arregla.
        //
        // Y solo valen las claves que SON el nombre del juego (`keyIsCategory`). Cuando
        // `category` falta, la clave es el nombre de la campaña —«ED'S DROP»— y compararla
        // con el juego de la fila —«KICK»— no seria identidad sino coincidencia. La
        // consecuencia hay que decirla: las campañas sin categoria NO se rescatan por
        // aqui, se quedan como estaban. Cerrar ese hueco pide otra clave (el id de
        // subcategoria, que esta en la URL del banner de la fila y en `category.id`), y
        // eso es otro trabajo.
        function _apiEntryForCard(gameName) {
            const g = String(gameName || '').trim().toLowerCase();
            if (!g) return null;
            for (const [key, entry] of Object.entries(_apiDropNames)) {
                if (!entry || !entry.keyIsCategory) continue;
                if (String(key).trim().toLowerCase() === g) return entry;
            }
            return null;
        }

        // Lo mismo para un AVISO guardado, cuyo titulo es el `displayTitle` de la entrada
        // ("Juego - Organizacion"). Tambien exacto, y contra la misma cadena que se guardo:
        // asi el que decide es el dato, no un parecido.
        function _apiEntryForNotifTitle(notifTitle) {
            const t = String(notifTitle || '').trim().toLowerCase();
            if (!t) return null;
            for (const [key, entry] of Object.entries(_apiDropNames)) {
                if (!entry) continue;
                if (String(entry.displayTitle || key).trim().toLowerCase() === t) return entry;
            }
            return null;
        }

        // Find full API entry for a card title — returns {drops}
        function _findEntryForTitle(cardTitle) {
            if (!cardTitle) return null;
            const ct = cardTitle.toLowerCase();
            for (const [key, entry] of Object.entries(_apiDropNames)) {
                const k = key.toLowerCase();
                if (ct.includes(k) || k.includes(ct)) return entry;
                const cardGame = ct.split(' - ')[0].trim();
                const keyGame = k.split(' - ')[0].trim();
                if (cardGame && keyGame && (cardGame.includes(keyGame) || keyGame.includes(cardGame))) return entry;
            }
            return null;
        }

        // Find drop names array for a card title (convenience wrapper)
        function _findDropNamesForTitle(cardTitle) {
            const entry = _findEntryForTitle(cardTitle);
            return entry ? entry.drops : null;
        }

        // Process snapshots from API data regardless of current page (inventory or campaigns)
        function _processSnapshotsFromAPI() {
            if (!_apiDataReady) return;
            const notifs = getNotifications();
            let hasChanges = false;

            // 1. Update snapshots for existing notifications using fresh API data
            for (const notif of notifs) {
                if (!notif.title) continue;
                // Si la campaña/juego ya no tiene drops en la API (expiró), no notificar.
                // Y solo las ABIERTAS avisan: ahora que la API tambien devuelve las
                // proximas, sin este corte una campaña que no ha empezado haria sonar
                // la alarma —y eso es justo lo que la solapa de proximos evita—.
                const entry = _findEntryForTitle(notif.title);
                if (!entry || !entry.drops || entry.drops.length === 0) continue;
                if (entry.status !== 'active') continue;
                const dataSnapshot = buildDataSnapshot(notif.title);
                if (dataSnapshot && notif.dataSnapshot !== dataSnapshot) {
                    notif.changed = true;
                    notif.seen = false;
                    notif.dataSnapshot = dataSnapshot;
                    notif.updatedAt = Date.now();
                    hasChanges = true;
                }
            }

            // 2. Check for new campaigns using full display title (e.g. "PUBG: Battlegrounds - KRAFTON")
            for (const [key, entry] of Object.entries(_apiDropNames)) {
                if (!entry || !entry.drops || entry.drops.length === 0) continue;
                // Solo las abiertas avisan (ver el corte de arriba).
                if (entry.status !== 'active') continue;
                const title = entry.displayTitle || key;
                const titleLower = title.toLowerCase();
                // Mismo criterio que el escaneo de la pagina, negativas incluidas:
                // una campaña descartada no puede colarse por la puerta de atras
                // de la API y hacer sonar la alarma.
                //
                // Se juzga por el texto CON EL QUE ESA ENTRADA PASO el filtro y no por el
                // titulo que se muestra. Con el titulo, una campaña que casa por el nombre
                // de la campaña —«rage» en «ave-rage-aden $5 Stake.com Bonus», titulo
                // «Slots & Casino - Stake.com»— no avisaba NUNCA: entraba al panel por una
                // puerta y se le cerraba la otra. Las negativas siguen aplicandose, que es
                // lo que protege esta puerta.
                if (!_matchesKeywords(entry.searchText || titleLower)) continue;
                const exists = notifs.find(n => n.title === title || (n.title && n.title.toLowerCase() === titleLower));
                if (!exists) {
                    const dataSnapshot = buildDataSnapshot(title);
                    notifs.push({
                        id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        title: title,
                        key: title + '|api',
                        // En que pestaña vive, para que el 👁️ sepa a donde llevarte.
                        status: entry.status || 'active',
                        dataSnapshot: dataSnapshot,
                        seen: false, changed: true,
                        createdAt: Date.now(), updatedAt: Date.now()
                    });
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                saveNotifications(notifs);
                updateNotificationTitleAndSound();
                renderNotificationsTab();
            }
        }

        function _updateAllCardsWithDropNames() {
            // Los badges van tambien en PROXIMAS. Son lo que la campaña reparte y lo que
            // cuesta cada tramo, o sea lo unico que hace falta para decidir si te
            // interesa antes de que abra —y en una proxima no hay nada mas que decidir—.
            // Ahi salen siempre limpios, sin ✓ ni 🎁: una campaña que no ha empezado no
            // tiene nada reclamado ni ganado, asi que _isDropClaimed y _isDropEarned dan
            // false y el badge se queda con el nombre y su coste. No se fuerza a mano
            // precisamente por eso: si algun dia una de esas marcas apareciera aqui,
            // seria porque /drops/progress lo dice, y entonces hay que verlo.
            //
            // La LINEA DE URGENCIA no va. Dice «cierra en …» y sobre algo que aun no ha
            // abierto se lee como una prisa que no existe; el «te faltan» es peor todavia,
            // porque no puedes ver nada. Y no es un caso teorico: la campaña de PUBG del
            // 2026-08-21 abre mañana y cierra 63 h despues, o sea DENTRO de las 72 h que
            // _computeUrgency considera urgentes, asi que sin este corte la tarjeta de
            // proximas diria «⏳ cierra en 63 h · te faltan 1 h» el dia antes de empezar.
            //
            // Cerradas sigue sin badges, que es otra decision: ahi lo que haria falta no
            // es el coste sino si quedo algo ganado y sin recoger —el texto de esa pestaña
            // dice que eso se puede reclamar aunque la ventana haya cerrado— y esos dos
            // datos no son el mismo trabajo.
            const panes = [
                { id: "kick-drops-active-pane", urgency: true },
                { id: "kick-drops-upcoming-pane", urgency: false }
            ];
            for (const { id, urgency } of panes) {
                const pane = document.getElementById(id);
                if (!pane) continue;
                pane.querySelectorAll("[data-notif-title]").forEach(card => {
                    const ct = card.getAttribute("data-notif-title");
                    const drops = _findDropNamesForTitle(ct);
                    if (!drops || drops.length === 0) return;
                    // Se repinta en vez de saltarse los badges ya puestos: el estado de
                    // reclamado llega despues que los nombres (los nombres son publicos,
                    // el reclamado necesita el token), asi que el primer pintado se hace
                    // sin marcas y este segundo pase es el que las añade.
                    const previous = card.querySelector(".drop-api-names");
                    if (previous) previous.remove();
                    // La linea de urgencia entra en el mismo repintado: el "te
                    // faltan" necesita los minutos vistos, que llegan con este pase.
                    const previousUrgency = card.querySelector(".drop-urgency");
                    if (previousUrgency) previousUrgency.remove();
                    if (urgency) _appendUrgencyTo(card, drops);
                    _appendDropNamesTo(card, drops);
                });
            }
        }

        function _appendDropNamesTo(card, drops) {
            const container = document.createElement("div");
            container.className = "drop-api-names";
            Object.assign(container.style, {
                display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px"
            });
            // Group by minutes (same UX as the Twitch script): one chip per watch-time
            // bucket. Dentro del chip va un span POR REWARD, no un texto unico: el
            // estado de reclamado es por reward y un game card agrega los drops de
            // todas las sub-campañas, asi que un mismo tramo puede mezclar rewards de
            // campañas distintas con estados distintos.
            const grouped = {};
            drops.forEach(d => {
                const key = d.minutes || 0;
                const name = d.name || '';
                if (!name) return;
                if (!grouped[key]) grouped[key] = [];
                const claimed = _isDropClaimed(d);
                // Ganado solo cuenta mientras no este reclamado: son estados
                // sucesivos de la misma reward, no dos marcas que se acumulen.
                const earned = claimed === true ? false : _isDropEarned(d);
                // Se deduplica por (nombre + estado) y no solo por nombre: dos
                // sub-campañas que reparten una reward homonima en el mismo tramo se
                // siguen viendo como una sola mientras compartan estado, pero se
                // separan en cuanto una esta reclamada y la otra no — que es justo lo
                // que este badge viene a decir. Deduplicar solo por nombre haria que
                // el subrayado de una tapara la que falta por conseguir.
                if (grouped[key].some(x => x.name === name && x.claimed === claimed && x.earned === earned)) return;
                grouped[key].push({ name, claimed, earned });
            });
            Object.entries(grouped).forEach(([min, items]) => {
                const minutes = parseInt(min);
                const hours = minutes / 60;
                // Con el tramo entero reclamado, el tiempo que pedia ya no le sirve a
                // nadie: desaparece de la etiqueta, y quien lo dice es el tooltip, que
                // es donde vivia ese dato. Se reutiliza la etiqueta de la seccion de
                // reclamados, que ya viene traducida a los 16 idiomas.
                const allClaimed = items.length > 0 && items.every(x => x.claimed === true);
                const chip = document.createElement("span");
                chip.title = allClaimed
                    ? (t.claimedInventoryTitle || 'Claimed')
                    : (minutes ? `${minutes} min` : '');
                Object.assign(chip.style, {
                    padding: "1px 6px",
                    backgroundColor: colors.text + "18",
                    color: colors.text,
                    border: `1px solid ${colors.text}40`,
                    borderRadius: "8px", fontSize: "10px"
                });
                items.forEach((item, i) => {
                    if (i > 0) chip.appendChild(document.createTextNode(", "));
                    if (item.claimed) {
                        // El ✓ va en su propio span y SIN tachar: es la marca positiva
                        // de que lo tienes, y tachado se leeria como lo contrario. El
                        // tachado es solo para el nombre, y la opacidad hunde el
                        // conjunto para que lo que resalte sea lo que aun falta.
                        const tick = document.createElement("span");
                        tick.textContent = "✓ ";
                        tick.style.opacity = "0.6";
                        chip.appendChild(tick);
                    } else if (item.earned) {
                        // El regalo tira en la direccion contraria al ✓: no atenua ni
                        // tacha, porque esto no esta cerrado — es lo unico del badge
                        // que pide una accion tuya ahora mismo.
                        const gift = document.createElement("span");
                        gift.textContent = "🎁 ";
                        chip.appendChild(gift);
                    }
                    const nameEl = document.createElement("span");
                    nameEl.textContent = item.name;
                    if (item.claimed) {
                        nameEl.style.textDecoration = "line-through";
                        nameEl.style.opacity = "0.6";
                    } else if (item.earned) {
                        nameEl.style.color = colors.orange;
                        nameEl.style.fontWeight = "700";
                        nameEl.title = t.earnedUnclaimed || 'Earned, not claimed';
                    }
                    chip.appendChild(nameEl);
                });
                if (!allClaimed) {
                    const suffix = hours >= 1 ? ` (${hours} h)` : minutes > 0 ? ` (${minutes} min)` : '';
                    if (suffix) chip.appendChild(document.createTextNode(suffix));
                }
                container.appendChild(chip);
            });
            card.appendChild(container);
        }

        // =============================================
        // DROPS YA RECLAMADOS (cruce con /drops/progress)
        // =============================================

        // El cruce es por id de reward y solo por id: /drops/campaigns y
        // /drops/progress devuelven el MISMO ULID para la misma reward, asi que no
        // hace falta adivinar por nombre. Y adivinar seria peligroso: una campaña
        // repite el mismo nombre en varios tramos ("x1 entry" a 60, 120, 180... en
        // ED'S DROP; "Darkness Jersey" a 600, 1200 y 1800 en las Football Drop).
        //
        // Auditado el 2026-08-08 contra el fallo que se arreglo en Twitch, donde los
        // cinco tramos de una campaña de Overwatch compartian UN SOLO benefit.id y
        // reclamar el de 2 h marcaba los cinco. Aqui no puede pasar por dos razones,
        // y conviene no romper ninguna de las dos:
        //   1. `claimed` NO se deduce: viene en cada reward de /drops/progress, o sea
        //      por tramo. El Set solo lo transporta al reward homonimo del otro
        //      endpoint.
        //   2. El identificador que se usa es el `id` propio de la reward. Kick trae
        //      ademas `external_id` —el candidato natural a repetirse entre tramos,
        //      como el benefit.id de Twitch— y este script NO lo lee en ningun sitio.
        // Si algun dia se cruzara por `external_id` o por nombre, volveria el fallo de
        // Twitch, y con el se desviarian tambien el 🎁, el filtro de pendientes, el
        // orden por lo mas barato y la cuenta de "te faltan": los cuatro preguntan por
        // esto mismo.
        let _claimedRewardIds = new Set();
        // Ganadas y sin reclamar: el tiempo ya esta hecho y solo falta pulsar. Es un
        // estado propio y no un "casi": lo que le falta no es tiempo, es un clic, y
        // se pierde igual que lo demas cuando la campaña cierra.
        let _earnedRewardIds = new Set();

        // Lo mismo pero indexado por NOMBRE, agrupado por sub-campaña. Hace falta para
        // la pagina: los `<li>` de recompensa no traen el id de la reward por ningun
        // lado —solo imagen y nombre—, asi que el cruce por id, que es el bueno, ahi no
        // se puede hacer. El nombre solo desempata DENTRO de su sub-campaña, que es
        // justo el alcance con el que se usa: una campaña puede repetir el mismo nombre
        // en varios tramos (las tres "Darkness Jersey" de las Football Drop), pero en la
        // pagina esos tramos son baldosas distintas de la MISMA fila, asi que si uno
        // esta reclamado y otro no, aqui no hay forma de distinguirlos y se esconderian
        // los dos. Se asume: perder una baldosa repetida es menos grave que dejar
        // colgada la que ya tienes, que es lo que se pidio esconder. Para lo que decide
        // de verdad —el ✓ del panel, el 🎁, los filtros— se sigue usando el id.
        let _claimedRewardNames = {};

        function _buildClaimedRewardIndex() {
            const claimed = new Set();
            const earned = new Set();
            const byName = {};
            for (const c of _interceptedAllCampaigns) {
                const watched = Number(c && c.progress_units) || 0;
                const campKey = _collapse(c && c.name).toLowerCase();
                for (const r of (c && c.rewards) || []) {
                    if (!r || !r.id) continue;
                    if (r.claimed) {
                        claimed.add(r.id);
                        const n = _collapse(r.name).toLowerCase();
                        if (campKey && n) (byName[campKey] || (byName[campKey] = new Set())).add(n);
                        continue;
                    }
                    // Dos fuentes para lo mismo, en OR: el `progress` (0..1) que da la
                    // propia API por reward, y la comparacion de los minutos vistos de
                    // la campaña contra los que pide el tramo. La segunda cubre que
                    // `progress` falte o venga redondeado por debajo; la primera, que
                    // el tramo se diera por cumplido con otro criterio del servidor.
                    const required = Number(r.required_units) || 0;
                    if (Number(r.progress) >= 1 || (required > 0 && watched >= required)) {
                        earned.add(r.id);
                    }
                }
            }
            _claimedRewardIds = claimed;
            _earnedRewardIds = earned;
            _claimedRewardNames = byName;
        }

        // Devuelve null —no false— mientras no haya llegado /drops/progress. Sin
        // datos no se marca nada, en vez de pintar todo como no obtenido, que seria
        // mentir en la direccion contraria y encima con aspecto de dato.
        function _isDropClaimed(drop) {
            if (!_progressInventoryReady) return null;
            return !!(drop && drop.rewardId && _claimedRewardIds.has(drop.rewardId));
        }

        // Ganado y sin reclamar. Mismo criterio de "sin datos, null" que el reclamado:
        // un drop no marcado no es un drop del que se sepa que no esta listo.
        function _isDropEarned(drop) {
            if (!_progressInventoryReady) return null;
            return !!(drop && drop.rewardId && _earnedRewardIds.has(drop.rewardId));
        }

        // Punto unico de entrada cuando llega (o ya estaba) la data de progreso:
        // reconstruye los dos indices y repinta los badges. Lo llaman el interceptor,
        // el fetch explicito y el arranque.
        function _onProgressData() {
            _buildKickProgressMap();
            _buildClaimedRewardIndex();
            // Repinta el panel entero, no solo las tarjetas: el progreso es lo que hace
            // juzgables "lo mas barato" y los filtros de estado, asi que hasta ahora no
            // habia con que ordenar ni con que filtrar.
            //
            // Y en la pestaña de campañas se rehace ADEMAS el escaneo de la pagina, que
            // es lo unico que vuelve a pintar las marcas (⏳ / ⏱ / 🔔) sobre las tarjetas
            // de Kick: el panel se repinta aqui, pero las marcas solo dentro de
            // highlightAndLinkDrops. Sin esto se quedan con la cuenta de ANTES de que
            // llegara /drops/progress —o sea, con lo visto a cero— y la misma campaña
            // dice dos cosas distintas a la vez. Visto el 2026-08-22 con PUBG a 28 min
            // vistos de 60: la marca de la tarjeta decia "te faltan 1h" y la tarjeta del
            // panel, tres centimetros mas a la derecha, "te faltan 32m".
            //
            // Se exige `_dropsScanDone` porque el interceptor corre en document-start:
            // sin esa guarda, el progreso que llega antes del primer escaneo dispararia
            // un escaneo sobre una pagina todavia sin montar, que vaciaria las tres
            // secciones y dejaria el panel en blanco hasta el escaneo de verdad.
            //
            // Y el orden importa, que costo una regresion el mismo dia: el escaneo
            // termina llamando a `renderResults` A SECAS, y esa funcion crea tarjetas
            // NUEVAS, asi que los badges de recompensas y la linea de urgencia —que se
            // cuelgan despues, en `_updateAllCardsWithDropNames`— se quedan fuera. Con
            // el escaneo como unica salida, la tarjeta del panel perdia sus dos chips y
            // su «te faltan». Por eso el repintado normal va SIEMPRE y despues.
            if (_dropsScanDone && _isCampaignsPage()) highlightAndLinkDrops();
            _refreshPanelAfterLateData();
            // Y con el dato de reclamado ya en la mano, se esconde lo que sobra de la
            // pagina. Aqui ademas del barrido porque el barrido tiene ventana (15
            // intentos, 9 s) y este dato puede llegar despues: sin token, la peticion
            // se reintenta hasta 10 s.
            _updateClaimedTilesHidden();
            // El aviso de "sin inventario" se apaga aqui y no cuando vence el
            // temporizador: este es el momento en que la afirmacion deja de ser
            // cierta.
            _updateInventoryWarning();
        }

        // =============================================
        // URGENCIA: CIERRA PRONTO Y AUN TE FALTA TIEMPO
        // =============================================

        // Dos umbrales y no uno: "cierra hoy" y "cierra este fin de semana" se
        // deciden distinto, y un solo color los iguala. Van fijos a proposito —como
        // ajuste serian 16 traducciones, validacion y persistencia para un numero
        // que casi nadie tocaria.
        const URGENT_SOON_HOURS = 24;
        const URGENT_WARN_HOURS = 72;

        // Cuenta atras gruesa: para un cierre no importan los minutos salvo en la
        // ultima hora. formatHoursMinutes() sigue siendo la de los tiempos de
        // visualizacion, donde el minuto si cuenta.
        function _formatCountdown(totalMinutes) {
            const m = Math.max(0, Math.round(totalMinutes));
            if (m < 60) return `${m} min`;
            return `${Math.floor(m / 60)} h`;
        }

        // Minutos ya vistos de la sub-campaña que reparte esta reward. Devuelve null
        // —no 0— mientras no haya llegado /drops/progress: sin token no se sabe lo
        // visto, y decirle "te faltan 10 h" a quien lleva 9 vistas es peor que no
        // decir nada.
        function _watchedMinutesFor(drop) {
            if (!_progressInventoryReady) return null;
            const c = drop && drop.campaignName ? _kickCampaigns[drop.campaignName] : null;
            return c ? (Number(c.progress_units) || 0) : 0;
        }

        // Devuelve {level, minutesLeft, needed, feasible} o null si no corre prisa.
        function _computeUrgency(drops) {
            const now = Date.now();
            // Solo cuenta lo que aun no es tuyo: una campaña cuyas rewards ya tienes
            // no tiene ninguna prisa, por mucho que cierre mañana. Se descarta solo
            // lo que CONSTA reclamado (true); mientras el indice no ha llegado,
            // _isDropClaimed devuelve null y la reward sigue contando.
            const pending = (drops || []).filter(d => {
                if (_isDropClaimed(d) === true) return false;
                const end = d && d.ends_at ? Date.parse(d.ends_at) : NaN;
                return Number.isFinite(end) && end > now;
            });
            if (pending.length === 0) return null;

            // Manda el cierre mas proximo de lo que te falta, no el de la campaña:
            // en Kick cada reward lleva su propio ends_at y la tarjeta agrupa varias.
            const deadline = Math.min(...pending.map(d => Date.parse(d.ends_at)));
            const minutesLeft = (deadline - now) / 60000;
            if (minutesLeft > URGENT_WARN_HOURS * 60) return null;

            // De las que cierran EN ese plazo se sacan DOS numeros, porque responden a
            // preguntas distintas y confundirlos es lo que hacia enganosa la linea:
            //   needed    = la mas cara -> lo que cuesta llevarse TODO lo que queda.
            //               Es el numero que se enseña: el minuto no cuenta si te
            //               dejas recompensas por el camino.
            //   minNeeded = la mas barata -> lo unico que decide si todavia se puede
            //               sacar algo. Si la mas barata no entra, ninguna entra, y
            //               por eso es la que manda en "no da tiempo".
            // Como el contador es por campaña y no por tramo, reclamar uno no reinicia
            // nada: el resto de cada tramo se mide siempre contra los mismos minutos
            // vistos. Se ignoran las de resto 0 (ganadas y sin reclamar): ahi no falta
            // tiempo, falta pulsar, y eso se cuenta aparte.
            let needed = null;
            let minNeeded = null;
            let unclaimed = 0;
            for (const d of pending) {
                if (_isDropEarned(d) === true) unclaimed++;
                if (Date.parse(d.ends_at) !== deadline) continue;
                const watched = _watchedMinutesFor(d);
                if (watched === null) continue;
                const rest = Math.max(0, (Number(d.minutes) || 0) - watched);
                if (rest <= 0) continue;
                if (needed === null || rest > needed) needed = rest;
                if (minNeeded === null || rest < minNeeded) minNeeded = rest;
            }
            return {
                level: minutesLeft <= URGENT_SOON_HOURS * 60 ? 'soon' : 'warn',
                minutesLeft,
                needed,                                 // null = sin dato de progreso
                minNeeded,
                feasible: minNeeded === null ? null : minNeeded <= minutesLeft,
                // Lo que ya te ganaste y se pierde igual si no lo pulsas antes del
                // cierre. Es la unica parte del aviso que no depende de que te de
                // tiempo a nada: ese trabajo ya esta hecho.
                unclaimed
            };
        }

        function _urgencyColor(u) {
            return u.level === 'soon' ? colors.red : colors.orange;
        }

        function _urgencyText(u) {
            let txt = `⏳ ${t.urgentClosesIn || 'closes in'} ${_formatCountdown(u.minutesLeft)}`;
            if (u.needed !== null) {
                txt += ` · ${t.urgentNeed || 'you still need'} ${formatHoursMinutes(u.needed)}`;
                // El minimo solo cuando aporta, que es un caso concreto: llevarselo todo
                // ya no entra en el plazo, pero el tramo mas barato si. Ahi —y solo ahi—
                // "te faltan 5h" con un cierre en 4h se leeria como que no hay nada que
                // hacer, y todavia se puede salvar algo. Si el total entra, el minimo no
                // aporta; si no entra ni el minimo, ya lo dice "no da tiempo".
                if (u.minNeeded !== null && u.minNeeded < u.needed &&
                    u.needed > u.minutesLeft && u.minNeeded <= u.minutesLeft) {
                    txt += ` (${formatHoursMinutes(u.minNeeded)} ${t.urgentMinimum || 'minimum'})`;
                }
            }
            if (u.feasible === false) txt += ` · ${t.urgentNoTime || 'not enough time'}`;
            if (u.unclaimed > 0) txt += ` · 🎁 ${u.unclaimed} ${t.urgentUnclaimed || 'unclaimed'}`;
            return txt;
        }

        // Clave de orden: cuanto antes cierre, mas arriba. Lo que no corre prisa se
        // va al final con Infinity y conserva el orden de la pagina, porque sort()
        // es estable.
        function _urgencySortKey(item) {
            const u = _computeUrgency(_findDropNamesForTitle(item && item.title));
            return u ? u.minutesLeft : Infinity;
        }

        // La linea va justo debajo de la cabecera —encima de las keywords y de los
        // badges— porque es lo que decide si la tarjeta te importa hoy.
        function _appendUrgencyTo(card, drops) {
            const u = _computeUrgency(drops);
            if (!u) return;
            const line = document.createElement("div");
            line.className = "drop-urgency";
            line.textContent = _urgencyText(u);
            Object.assign(line.style, {
                fontSize: "11px", fontWeight: "700", marginBottom: "4px",
                color: _urgencyColor(u),
                opacity: u.feasible === false ? "0.75" : "1"
            });
            card.insertBefore(line, card.children[1] || null);
        }

        // =============================================
        // FILTROS DE VISTA: QUE TARJETAS SE ENSEÑAN
        // =============================================

        // Una lente sobre el panel, no una segunda lista de keywords: no tocan el
        // resaltado de la pagina, ni las marcas de la tarjeta, ni las
        // notificaciones. Por eso se pueden encender y apagar sin consecuencias y
        // sin recargar.
        //
        // Se combinan en Y —todos los encendidos tienen que cumplirse—, que es lo
        // que se espera al ir sumando condiciones.
        //
        // Solo actuan sobre Activos a proposito: en Proximos no hay nada que cierre
        // ni que reclamar, y en Cerrados ya no queda ninguna decision que tomar.

        // REGLA DE ORO: lo que no se puede juzgar NO se esconde. _isDropClaimed y
        // _isDropEarned devuelven null hasta que llega /drops/progress; si eso
        // contara como "no cumple", el panel apareceria vacio durante el arranque y
        // pareceria roto justo cuando el usuario acaba de entrar.
        function _passesViewFilter(id, drops) {
            if (!drops || drops.length === 0) return true;
            switch (id) {
                case 'soon':
                    // Este se decide sin inventario: las fechas son publicas. Pero
                    // _computeUrgency devuelve null tanto por "no corre prisa" como
                    // por "no hay fecha que mirar", asi que lo segundo se aparta
                    // antes: sin ninguna fecha utilizable no se esconde nada.
                    if (!drops.some(d => Number.isFinite(Date.parse(d && d.ends_at)))) return true;
                    return _computeUrgency(drops) !== null;
                case 'unclaimed':
                    if (!_progressInventoryReady) return true;
                    return drops.some(d => _isDropEarned(d) === true);
                case 'pending':
                    if (!_progressInventoryReady) return true;
                    return drops.some(d => _isDropClaimed(d) !== true);
                case 'quick': {
                    // Lo barato que TE QUEDA: un tramo de 30 min ya reclamado no
                    // convierte la campaña en un rato corto.
                    const rest = drops.filter(d => _isDropClaimed(d) !== true);
                    return rest.some(d => {
                        const m = Number(d.minutes) || 0;
                        return m > 0 && m <= QUICK_MAX_MINUTES;
                    });
                }
                default:
                    return true;
            }
        }

        function _applyViewFilters(items) {
            const on = getViewFilters();
            if (on.length === 0) return items || [];
            return (items || []).filter(item => {
                const drops = _findDropNamesForTitle(item && item.title);
                return on.every(id => _passesViewFilter(id, drops));
            });
        }

        // =============================================
        // LO QUE TE QUEDA Y EN QUE ORDEN
        // =============================================

        // Minutos de visualizacion que te faltan de una campaña. Dos lecturas del
        // mismo dato, porque son dos preguntas distintas y cada una tiene su sitio:
        //   'max' = lo que cuesta llevarte TODO lo que queda, o sea el tramo
        //           pendiente mas caro. Es lo que enseña la ⏱ de la tarjeta.
        //   'min' = lo que cuesta sacar algo, o sea el tramo pendiente mas barato.
        //           Es lo que ordena "lo mas barato".
        //
        // El mas caro y no la suma de los pendientes, porque el contador de Kick es
        // por campaña: los minutos que llevas cuentan para todos sus tramos a la vez.
        //
        // Ninguna de las dos mira fechas: es lo que cuesta, corra prisa o no. El
        // "te faltan" del aviso de cierre es otra cuenta y va por su lado.
        //
        // Tres valores con tres significados distintos, y hay que respetarlos:
        //   null = no se sabe (sin inventario) o no queda nada pendiente
        //   0    = ya te lo ganaste y solo falta pulsar
        //   >0   = minutos de visualizacion que te faltan
        function _remainingMinutes(drops, mode) {
            if (!drops || drops.length === 0) return null;
            let best = null;
            for (const d of drops) {
                if (_isDropClaimed(d) === true) continue;
                const watched = _watchedMinutesFor(d);
                // Sin minutos vistos no hay resta posible, y aqui no se inventa un
                // 0: decirle "te faltan 10 h" a quien lleva 9 vistas es peor que
                // no decir nada.
                if (watched === null) return null;
                const rest = Math.max(0, (Number(d.minutes) || 0) - watched);
                if (best === null) best = rest;
                else best = mode === 'max' ? Math.max(best, rest) : Math.min(best, rest);
            }
            return best;
        }

        // Lo mas barato primero, y barato es el tramo pendiente MINIMO: responde a
        // "¿que saco con el rato que tengo?", no a "¿que me cuesta terminarla?" —eso
        // lo dice la ⏱ de la tarjeta—. Por eso una campaña puede subir del todo
        // enseñando un ⏱ de 5 h: son dos cuentas distintas a proposito.
        //
        // Un tramo ya ganado vale 0 y sube del todo: no le falta tiempo, le falta un
        // clic. Lo que no se puede juzgar se va al final con Infinity y conserva el
        // orden de la pagina, porque sort() es estable —la misma regla que usa el
        // orden por urgencia—.
        function _cheapestSortKey(item) {
            const rest = _remainingMinutes(_findDropNamesForTitle(item && item.title), 'min');
            return rest === null ? Infinity : rest;
        }

        // Devuelve una COPIA ordenada: el array original lo mantiene el escaneo de
        // la pagina y reordenarlo romperia la correspondencia con los nodos.
        function _sortActive(items) {
            const key = getSortMode() === 'cheapest' ? _cheapestSortKey : _urgencySortKey;
            return [...(items || [])].sort((a, b) => key(a) - key(b));
        }

        // Aqui vivia checkAndHandleScriptVersion(), que al detectar un @version distinto
        // del guardado hacia lo mismo que el boton "Recargar drops": vaciar la lista de
        // notificaciones. Se quito el 2026-08-08 porque no compraba nada y costaba algo
        // real — cada actualizacion del script, que no las pides tu, borraba el historial
        // de campañas vistas y hacia que todas volvieran a sonar como nuevas—. Si algun
        // dia hace falta migrar el formato de lo guardado, esto vuelve pero migrando, no
        // borrando.

        function setInventoryExpiredFlag(value) {
            GM_setValue(SHOW_HIDE_INVENTORY_EXPIRED, value);
        }


        function getCollapseFlag() {
            const stored = GM_getValue(COLLAPSE_KEY, false);
            if (stored === undefined) return false;
            return stored;
        }

        function setCollapseFlag(value) {
            GM_setValue(COLLAPSE_KEY, value);
        }

        // Initialize flags if not existing
        if (GM_getValue(SHOW_HIDE_INVENTORY_EXPIRED) === undefined) setInventoryExpiredFlag(false);
        if (GM_getValue(COLLAPSE_KEY) === undefined) setCollapseFlag(false);

        // =============================================
        // ESTADO LOCAL DE LA APLICACION
        // =============================================

        let keywords = getStoredKeywords();
        let cleanExpiredInventoryFlag = GM_getValue(SHOW_HIDE_INVENTORY_EXPIRED, false);
        let _notificationSoundInterval = null;

        // Fetch drops from Kick API on load
        fetchDropsFromAPI();

        // AQUI NO HAY NOTIFICACIONES DEL NAVEGADOR, y es a proposito (2026-08-08).
        // Habia dos, la nativa (Notification API) y GM_notification de respaldo, y con
        // ellas el permiso que el script pedia nada mas cargar. Se quitaron las tres
        // cosas: el aviso ya se da DENTRO de la pagina —la campana de la solapa, el
        // contador en el titulo de la pestaña y el pitido— y eso no necesita permiso,
        // no se acumula en el centro de notificaciones del sistema ni sigue sonando
        // cuando el navegador esta cerrado. Con ellas se fue `_lastNotifiedPending`,
        // que solo servia para no repetir el aviso nativo.
        //
        // Si vuelve a hacer falta un aviso fuera de la pestaña, que sea una decision
        // nueva y no el respaldo de otra cosa: pedir permiso al cargar es de las pocas
        // cosas que un userscript hace que el usuario no puede deshacer sin ir a los
        // ajustes del sitio.

        // =============================================
        // FUNCIONES DE AUDIO / NOTIFICACION SONORA
        // =============================================

        function playBeep() {
            try {
                const audio = new Audio('data:audio/wav;base64,SUQzAwAAAAA0V1RZRVIAAAAGAAAAMjAyMwBUREFUAAAABgAAADAyMDYAVElNRQAAAAYAAAAxMjUwAFBSSVYAABIdAABYTVAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuYjBmOGJlOSwgMjAyMS8xMi8wOC0xOToxMToyMiAgICAgICAgIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgIHhtbG5zOmNyZWF0b3JBdG9tPSJodHRwOi8vbnMuYWRvYmUuY29tL2NyZWF0b3JBdG9tLzEuMC8iCiAgICB4bWxuczp4bXBETT0iaHR0cDovL25zLmFkb2JlLmNvbS94bXAvMS4wL0R5bmFtaWNNZWRpYS8iCiAgICB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iCiAgIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIzLjIgKDIwMjIwMTE4Lm9yaWcuNTIxIDkzMGFhNDgpICAoV2luZG93cykiCiAgIHhtcDpDcmVhdGVEYXRlPSIyMDIzLTA2LTAyVDEyOjUwOjMyLjk0NDk1NyIKICAgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMy0wNi0wMlQxNDo1MDozNCswMjowMCIKICAgeG1wOk1vZGlmeURhdGU9IjIwMjMtMDYtMDJUMTQ6NTA6MzQrMDI6MDAiCiAgIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NGM2MWNiOGQtMjY0MC0zMzRjLWE5Y2EtMDBmYWE1MzA1MzU0IgogICB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOmYyZWQ3MmYwLWIyMTMtYjY0YS1hY2I2LTQ0ZWE1NjBlMDI0ZiIKICAgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOmYyZWQ3MmYwLWIyMTMtYjY0YS1hY2I2LTQ0ZWE1NjBlMDI0ZiIKICAgeG1wRE06YXVkaW9TYW1wbGVSYXRlPSI0NDEwMCIKICAgeG1wRE06YXVkaW9TYW1wbGVUeXBlPSIxNkludCIKICAgeG1wRE06YXVkaW9DaGFubmVsVHlwZT0iU3RlcmVvIgogICB4bXBETTpzdGFydFRpbWVTY2FsZT0iMjQiCiAgIHhtcERNOnN0YXJ0VGltZVNhbXBsZVNpemU9IjEiCiAgIGRjOmZvcm1hdD0iTVAzIj4KICAgPHhtcE1NOkhpc3Rvcnk+CiAgICA8cmRmOlNlcT4KICAgICA8cmRmOmxpCiAgICAgIHN0RXZ0OmFjdGlvbj0iY3JlYXRlZCIKICAgICAgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpmMmVkNzJmMC1iMjEzLWI2NGEtYWNiNi00NGVhNTYwZTAyNGYiCiAgICAgIHN0RXZ0OndoZW49IjIwMjMtMDYtMDJUMTQ6NTA6MzIrMDI6MDAiCiAgICAgIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMy4yICgyMDIyMDExOC5vcmlnLjUyMSA5MzBhYTQ4KSAgKFdpbmRvd3MpIi8+CiAgICAgPHJkZjpsaQogICAgICBzdEV2dDphY3Rpb249InNhdmVkIgogICAgICBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjRjNjFjYjhkLTI2NDAtMzM0Yy1hOWNhLTAwZmFhNTMwNTM1NCIKICAgICAgc3RFdnQ6d2hlbj0iMjAyMy0wNi0wMlQxNDo1MDozNCswMjowMCIKICAgICAgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIzLjIgKDIwMjIwMTE4Lm9yaWcuNTIxIDkzMGFhNDgpICAoV2luZG93cykiCiAgICAgIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogICA8Y3JlYXRvckF0b206d2luZG93c0F0b20KICAgIGNyZWF0b3JBdG9tOmV4dGVuc2lvbj0iLmFlcCIKICAgIGNyZWF0b3JBdG9tOmludm9jYXRpb25GbGFncz0iLWVwIi8+CiAgIDxjcmVhdG9yQXRvbTptYWNBdG9tCiAgICBjcmVhdG9yQXRvbTphcHBsaWNhdGlvbkNvZGU9IjExODAxOTM4NTkiCiAgICBjcmVhdG9yQXRvbTppbnZvY2F0aW9uQXBwbGVFdmVudD0iMTEzMTU1OTAyNiIvPgogICA8Y3JlYXRvckF0b206YWVQcm9qZWN0TGluawogICAgY3JlYXRvckF0b206Y29tcG9zaXRpb25JRD0iMiIKICAgIGNyZWF0b3JBdG9tOnJlbmRlclF1ZXVlSXRlbUlEPSI3IgogICAgY3JlYXRvckF0b206cmVuZGVyT3V0cHV0TW9kdWxlSW5kZXg9IjAiCiAgICBjcmVhdG9yQXRvbTpmdWxsUGF0aD0iQzpcVXNlcnNcSnVsaWVuXERvY3VtZW50c1wuQVVUTy1FTlRSRVBSSVNFXENsaWVudHNcS0dcMDAwMDlfS0dfU3RyZWFtcGFja1wwMDAwOV9LR19BbGVydGVzXDAwMDA5X0FsZXJ0ZV9TdWJfS2ljay5hZXAiLz4KICAgPHhtcERNOnN0YXJ0VGltZWNvZGUKICAgIHhtcERNOnRpbWVGb3JtYXQ9IkF1ZGlvU2FtcGxlc1RpbWVjb2RlIgogICAgeG1wRE06dGltZVZhbHVlPSIwMDowMDowMDowMDAwMCIvPgogICA8eG1wRE06YWx0VGltZWNvZGUKICAgIHhtcERNOnRpbWVWYWx1ZT0iMDA6MDA6MDA6MDAwMDAiCiAgICB4bXBETTp0aW1lRm9ybWF0PSJBdWRpb1NhbXBsZXNUaW1lY29kZSIvPgogIDwvcmRmOkRlc2NyaXB0aW9uPgogPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgIAo8P3hwYWNrZXQgZW5kPSJ3Ij8+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwEF0Drc1IaCgen+qy+A5zHFcAdA5ESDbAhhznA1krE3JexEEIQuRNDgJ+JuP9iG4JoZEZ4nDk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qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5BkQQ/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5BkQQ/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kGRBD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kGRBD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5BkQQ/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpUQUcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAyMDIzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==');
                audio.volume = NOTIFICATION_VOLUME;
                audio.play().catch(() => { });
            } catch (ee) { /* noop */ }
        }

        function startNotificationSound() {
            if (_notificationSoundInterval) return;
            playBeep();
            _notificationSoundInterval = setInterval(() => playBeep(), NOTIFICATION_BEEP_INTERVAL_MS);
        }

        function stopNotificationSound() {
            if (_notificationSoundInterval) {
                clearInterval(_notificationSoundInterval);
                _notificationSoundInterval = null;
            }
        }

        // La marca de la racha en el titulo. Un emoji y no un texto a proposito: en el
        // titulo de la pestaña se ve un icono y como mucho dos palabras, y asi no hay que
        // traducir nada a los 16 idiomas para algo que casi nunca se lee entero.
        const TITLE_MARK_STREAK = '🔥';

        // EL TITULO SE COMPONE EN UN SOLO SITIO, y tiene que seguir asi. Hay dos cosas que
        // quieren aparecer ahi —los drops pendientes y la racha del dia— y cada una se
        // entera de lo suyo por su cuenta. Escribiendo cada una directamente en
        // document.title se pisan: la de drops restaura el titulo original en cuanto sus
        // pendientes bajan a cero, asi que borraria la marca de la racha sin saber que
        // existia. Por eso las dos pasan por aqui y el titulo se REARMA entero desde
        // ORIGINAL_TITLE.
        // CUANTAS ALERTAS HAY. Se calcula aqui y solo aqui porque lo leen dos sitios que
        // tienen que decir lo MISMO —la etiqueta de la solapa 🔔 y el repintado de su
        // pestaña—, y con la cuenta escrita dos veces basta que una se quede sin la racha
        // para que la solapa marque (0) con una alerta dentro.
        //
        // La racha del dia cuenta como UNA alerta mas: desde el 2026-08-22 vive dentro de
        // la pestaña 🔔 y no como una tira encima del panel, asi que si no contara, seria
        // la unica alerta que no aparece en el contador que las cuenta.
        function _alertCount() {
            const pending = getNotifications().filter(n => !n.seen && n.changed).length;
            return pending + (_dailyReminderState() ? 1 : 0);
        }

        function _titleState() {
            const notifs = getNotifications();
            const pending = notifs.filter(n => !n.seen && n.changed).length;
            const estadoRacha = _dailyReminderState();
            const racha = !!estadoRacha;
            let prefix = '';
            if (pending > 0) prefix += `(${pending})`;
            if (racha) prefix += (prefix ? ' ' : '') + TITLE_MARK_STREAK;
            return { pending, racha, prefix, ventana: estadoRacha ? estadoRacha.windowKey : null };
        }

        // El beep de la racha suena UNA VEZ, no en bucle como el de los drops. El de drops
        // repite cada 5 s porque se apaga en cuanto marcas el aviso como visto —depende de
        // un clic tuyo—, mientras que este se apaga cuando hayas visto 60 minutos de
        // stream: en bucle seria un castigo de una hora, y sonando encima del stream que
        // acabas de abrir para callarlo.
        //
        // Se guarda LA VENTANA que ya pito, no un booleano: asi el dia siguiente vuelve a
        // sonar sin recargar la pagina. Con un booleano, una pestaña abierta al cruzar la
        // hora de cierre estrenaba el reto nuevo en silencio.
        let _rachaBeepedWindow = null;

        function updateNotificationTitleAndSound() {
            try {
                const { pending, racha, prefix, ventana } = _titleState();

                // Update tab badge
                const alertas = _alertCount();
                const tabNotifs = document.getElementById("kick-drops-tab-notifs");
                if (tabNotifs) {
                    tabNotifs.textContent = `${t.changedIcon || "🔔"} (${alertas})`;
                    tabNotifs.style.color = alertas > 0 ? colors.orange : colors.gray;
                }

                // El bucle sigue atado SOLO a los drops (ver _rachaBeeped).
                if (pending > 0) startNotificationSound();
                else stopNotificationSound();

                // Un solo aviso sonoro por la racha, y solo si de verdad se va a ver la
                // tira: _dailyReminderState() ya devuelve null si la silenciaste con la ×,
                // asi que callarla calla tambien el pitido.
                if (racha && _rachaBeepedWindow !== ventana) {
                    _rachaBeepedWindow = ventana;
                    playBeep();
                }

                // Los dos plazos son los de siempre: rapido para poner la marca —hay que
                // ganarle al titulo que escribe Kick al montar la pagina— y lento para
                // quitarla, para no borrar un titulo que la SPA acabe de cambiar. Y solo se
                // limpia lo que hemos escrito nosotros: si el titulo ya no empieza por
                // nuestra marca es que manda otro y no se toca.
                if (prefix) {
                    setTimeout(() => { document.title = `${prefix} ${ORIGINAL_TITLE}`; }, 100);
                } else {
                    setTimeout(() => {
                        if (document.title.startsWith('(') ||
                            document.title.startsWith(TITLE_MARK_STREAK)) {
                            document.title = ORIGINAL_TITLE;
                        }
                    }, 1000);
                }
            } catch (e) {
                console.warn('Error actualizando titulo/sonido:', e);
            }
        }

        // =============================================
        // GESTION DE DATOS DE NOTIFICACIONES
        // =============================================

        function markNotificationSeen(identifier) {
            const notifs = getNotifications();
            let changed = false;
            // Extraer titulo del key (formato: "titulo|id") para fallback por titulo
            const titleFromKey = (identifier && identifier.includes('|')) ? identifier.split('|').slice(0, -1).join('|') : identifier;
            for (const n of notifs) {
                if (n.seen) continue;
                // Match por key exacto, por titulo del key, o por titulo directo
                if (n.key === identifier || n.title === titleFromKey || n.title === identifier) {
                    n.seen = true;
                    n.updatedAt = Date.now();
                    changed = true;
                }
            }
            if (changed) saveNotifications(notifs);
            updateNotificationTitleAndSound();
        }

        function markAllNotificationsSeen() {
            const notifs = getNotifications();
            let changed = false;
            for (const n of notifs) {
                if (!n.seen && n.changed) {
                    n.seen = true;
                    n.updatedAt = Date.now();
                    changed = true;
                }
            }
            if (changed) saveNotifications(notifs);
            updateNotificationTitleAndSound();
        }

        function deleteNotificationsByKeyword(keyword) {
            const notifs = getNotifications();
            const filtered = [];
            for (const n of notifs) {
                if (!n.title.toLowerCase().includes(keyword)) {
                    filtered.push(n);
                }
            }
            saveNotifications(filtered);
            updateNotificationTitleAndSound();
        }

        // Deja solo las notificaciones que siguen casando con la lista dada. Se
        // llama tambien al AÑADIR una keyword, no solo al editarlas en bloque:
        // añadir una negativa tiene que llevarse por delante las notificaciones de
        // lo que acaba de quedar descartado. Para una positiva es inofensivo, no
        // hay nada guardado que deje de casar.
        function removeNotificationsNotInKeywords(list) {
            const { positive, negative } = _splitKeywords(list);
            const notifs = getNotifications();
            const filtered = [];
            for (const n of notifs) {
                const title = (n.title || '').toLowerCase();
                // El aviso puede existir por algo que su TITULO no dice: el filtro de la
                // API mira tambien el nombre de la campaña. Juzgandolo solo por el titulo,
                // tocar la lista de keywords —incluso añadir una que no tiene nada que ver—
                // se llevaba por delante esos avisos, y volvian a nacer al siguiente
                // escaneo: un parpadeo sin explicacion.
                const entry = _apiEntryForNotifTitle(n.title);
                const apiText = (entry && entry.searchText) || '';
                const casa = kw => title.includes(kw) || (apiText && apiText.includes(kw));
                if (negative.some(casa)) continue;
                if (positive.some(casa)) filtered.push(n);
            }
            saveNotifications(filtered);
            updateNotificationTitleAndSound();
        }

        // =============================================
        // HELPERS GENERICOS DE UI (MODALES, BOTONES)
        // =============================================

        function createButton(label, color, onClick, inline = false) {
            const btn = document.createElement("button");
            btn.textContent = label;
            Object.assign(btn.style, {
                padding: "6px 10px",
                backgroundColor: colors.surface,
                color: color,
                border: `1px solid ${color}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                marginTop: inline ? "10px" : "0"
            });
            btn.onmouseenter = () => { btn.style.opacity = "0.8"; };
            btn.onmouseleave = () => { btn.style.opacity = "1"; };
            btn.onclick = onClick;
            return btn;
        }

        function setInertOnBodyChildrenExcept(overlay, inert) {
            if (inert) {
                const saved = [];
                Array.from(document.body.children).forEach((el) => {
                    if (el === overlay) return;
                    saved.push({ el, ariaHidden: el.getAttribute('aria-hidden'), tabIndex: el.hasAttribute('tabindex') ? el.tabIndex : null });
                    try {
                        el.setAttribute('aria-hidden', 'true');
                        el.inert = true;
                    } catch (e) { /* noop */ }
                });
                overlay._savedInert = saved;
            } else {
                const saved = overlay._savedInert || [];
                saved.forEach((s) => {
                    try {
                        if (s.ariaHidden === null) s.el.removeAttribute('aria-hidden');
                        else s.el.setAttribute('aria-hidden', s.ariaHidden);
                    } catch (e) { /* noop */ }
                    try {
                        if (s.tabIndex === null) s.el.removeAttribute('tabindex');
                        else s.el.tabIndex = s.tabIndex;
                        s.el.inert = false;
                    } catch (e) { /* noop */ }
                });
                overlay._savedInert = null;
            }
        }

        function closeOverlayAnimated(overlay) {
            return new Promise((resolve) => {
                try {
                    overlay.style.opacity = '0';
                    const box = overlay.firstChild;
                    if (box) {
                        box.style.transform = 'translateY(-8px) scale(0.98)';
                        box.style.opacity = '0';
                    }
                } catch (e) { /* noop */ }
                setTimeout(() => {
                    try {
                        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
                    } catch (e) { /* noop */ }
                    try { setInertOnBodyChildrenExcept(overlay, false); } catch (e) { /* noop */ }
                    resolve();
                }, 220);
            });
        }

        /**
         * attachDismissHandlers(overlay, close)
         *
         * Cierre por Escape y por clic fuera. Solo para los modales INFORMATIVOS —el
         * detalle del drop y el ℹ️—: los de decision (input, confirmar, aviso) no lo
         * llevan a proposito, porque ahi un clic fuera perderia lo escrito o dejaria la
         * pregunta contestada a medias. Esos cierran con Escape sobre sus propios
         * elementos, que es suficiente porque enfocan algo al abrir.
         *
         * Devuelve detach(), y hay que llamarlo TAMBIEN desde el boton de cerrar. El
         * listener de Escape vive en document —no queda mas remedio: el modal de
         * informacion no enfoca nada y el resto de la pagina esta inert, asi que no hay
         * ningun elemento suyo que pueda recibir la tecla—, y un listener en document que
         * no se quita sobrevive al modal y se acumula uno por cada apertura.
         */
        function attachDismissHandlers(overlay, close) {
            const detach = () => {
                document.removeEventListener('keydown', onKey);
                overlay.removeEventListener('click', onClick);
            };
            const onKey = (ev) => {
                if (ev.key !== 'Escape') return;
                detach();
                close();
            };
            const onClick = (ev) => {
                // Solo el fondo: un clic dentro de la caja no debe cerrar.
                if (ev.target !== overlay) return;
                detach();
                close();
            };
            document.addEventListener('keydown', onKey);
            overlay.addEventListener('click', onClick);
            return detach;
        }

        // El overlay centra la caja con flex. Sin techo de altura, una caja mas alta que
        // la ventana se recorta por ARRIBA y por abajo a la vez (el centrado reparte el
        // desbordamiento en los dos lados) y el boton de cerrar queda fuera de alcance:
        // es lo que pasaba con el modal de informacion, cuya descripcion es un parrafo
        // largo que ademas cambia de longitud con el idioma. De ahi el padding del
        // overlay + maxHeight/overflow de la caja, en vez de una altura fija que en un
        // idioma sobra y en otro falta.
        function createModalContainer() {
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '24px', boxSizing: 'border-box',
                backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '99999',
                transition: 'opacity 180ms ease', opacity: '0'
            });
            const box = document.createElement('div');
            Object.assign(box.style, {
                backgroundColor: colors.surface, color: colors.text, borderRadius: '14px',
                padding: '28px 32px', minWidth: 'min(340px, 100%)', maxWidth: '520px',
                // El padding del overlay ya reserva el margen; 100% es su area de contenido.
                maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: `1px solid ${colors.primary}`,
                fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px',
                transition: 'transform 180ms ease, opacity 180ms ease',
                transform: 'translateY(8px) scale(0.98)', opacity: '0'
            });
            overlay.appendChild(box);
            return { overlay, box };
        }

        function showInputModal(message, defaultValue = '') {
            return new Promise((resolve) => {
                const { overlay, box } = createModalContainer();
                const msg = document.createElement('div');
                msg.textContent = message;
                msg.style.marginBottom = '8px';
                box.appendChild(msg);

                const input = document.createElement('input');
                input.type = 'text';
                input.value = defaultValue || '';
                Object.assign(input.style, {
                    width: '100%', padding: '8px', marginBottom: '10px',
                    boxSizing: 'border-box', borderRadius: '4px',
                    border: `1px solid ${colors.primary}`,
                    background: colors.bg, color: colors.text
                });
                box.appendChild(input);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'center';
                actions.style.gap = '8px';

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = t.cancel || 'Cancel';
                Object.assign(cancelBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.red, border: `1px solid ${colors.red}`, borderRadius: '6px', cursor: 'pointer'
                });
                cancelBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve(null)); };

                const okBtn = document.createElement('button');
                okBtn.textContent = t.accept || 'Accept';
                Object.assign(okBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '6px', cursor: 'pointer'
                });
                okBtn.onclick = () => {
                    const v = input.value;
                    closeOverlayAnimated(overlay).then(() => resolve(v));
                };

                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                box.appendChild(actions);

                // focus trap
                const focusable = [input, cancelBtn, okBtn];
                let fi = 0;
                focusable.forEach((el, idx) => el.tabIndex = idx + 1);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        if (e.shiftKey) fi = (fi - 1 + focusable.length) % focusable.length;
                        else fi = (fi + 1) % focusable.length;
                        focusable[fi].focus();
                    }
                });
                [cancelBtn, okBtn].forEach((el) => el.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        if (e.shiftKey) fi = (fi - 1 + focusable.length) % focusable.length;
                        else fi = (fi + 1) % focusable.length;
                        focusable[fi].focus();
                    }
                    if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
                }));

                document.body.appendChild(overlay);
                try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
                setTimeout(() => {
                    overlay.style.opacity = '1';
                    try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
                }, 10);
                setTimeout(() => input.focus(), 120);
            });
        }

        function showConfirmModal(message) {
            return new Promise((resolve) => {
                const { overlay, box } = createModalContainer();
                const msg = document.createElement('div');
                msg.textContent = message;
                msg.style.marginBottom = '12px';
                box.appendChild(msg);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'center';
                actions.style.gap = '8px';

                const noBtn = document.createElement('button');
                Object.assign(noBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.red, border: `1px solid ${colors.red}`, borderRadius: '6px', cursor: 'pointer'
                });
                noBtn.textContent = t.no || 'No';
                noBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve(false)); };

                const yesBtn = document.createElement('button');
                Object.assign(yesBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '6px', cursor: 'pointer'
                });
                yesBtn.textContent = t.yes || 'Yes';
                yesBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve(true)); };

                actions.appendChild(noBtn);
                actions.appendChild(yesBtn);
                box.appendChild(actions);

                // focus trap
                const focusable = [noBtn, yesBtn];
                let fi = 0;
                focusable.forEach((el, idx) => el.tabIndex = idx + 1);
                focusable.forEach((el) => el.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        if (e.shiftKey) fi = (fi - 1 + focusable.length) % focusable.length;
                        else fi = (fi + 1) % focusable.length;
                        focusable[fi].focus();
                    }
                    if (e.key === 'Escape') { e.preventDefault(); noBtn.click(); }
                }));

                document.body.appendChild(overlay);
                try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
                setTimeout(() => {
                    overlay.style.opacity = '1';
                    try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
                }, 10);
                setTimeout(() => yesBtn.focus(), 120);
            });
        }

        // Siempre textContent: el flag html que tenia esta funcion no lo usaba
        // nadie y solo dejaba un sink de inyeccion esperando al primer llamador
        // que le pasara texto venido de la pagina.
        function showAlertModal(message) {
            return new Promise((resolve) => {
                const { overlay, box } = createModalContainer();
                const msg = document.createElement('div');
                msg.textContent = message;
                msg.style.marginBottom = '12px';
                box.appendChild(msg);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'center';

                const okBtn = document.createElement('button');
                Object.assign(okBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '6px', cursor: 'pointer'
                });
                okBtn.textContent = t.accept || 'Accept';
                okBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve()); };
                okBtn.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') { e.preventDefault(); okBtn.click(); }
                });

                actions.appendChild(okBtn);
                box.appendChild(actions);
                okBtn.tabIndex = 1;

                document.body.appendChild(overlay);
                try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
                setTimeout(() => {
                    overlay.style.opacity = '1';
                    try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
                }, 10);
                setTimeout(() => okBtn.focus(), 120);
            });
        }

        // =============================================
        // COMPONENTES DE UI ESPECIFICOS
        // =============================================

        function createEditKeywordsButton(inline = false) {
            return createButton(t.editKeywords, colors.primary, () => {
                (async () => {
                    const current = getStoredKeywords().join(", ");
                    const input = await showInputModal(t.editPrompt + " — " + (t.negativeKeywordHint || ''), current);
                    if (input !== null) {
                        const newKeywords = input.split(",").map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
                        setStoredKeywords(newKeywords);
                        removeNotificationsNotInKeywords(newKeywords);
                        showAlertModal(t.keywordsModified + newKeywords.join(", ") + "\n" + t.reloading);
                        setCollapseFlag(false);
                        setTimeout(() => location.reload(), 1500);
                    }
                })();
            }, inline);
        }

        function createResetKeywordsButton(inline = false) {
            return createButton(t.resetKeywords, colors.orange, () => {
                (async () => {
                    const ok = await showConfirmModal(t.confirmReset);
                    if (ok) {
                        resetKeywords();
                        resetNotifications();
                        showAlertModal(t.keywordsRestored);
                        setCollapseFlag(false);
                        setTimeout(() => location.reload(), 1500);
                    }
                })();
            }, inline);
        }

        function createReloadButton(inline = false) {
            return createButton(t.reload, colors.gray, () => {
                setCollapseFlag(false);
                resetNotifications();
                if (!_isCampaignsPage()) {
                    location.href = _campaignsHref();
                } else {
                    location.reload();
                }
            }, inline);
        }

        function getAddKeyword() {
            const addBtn = document.createElement("button");
            addBtn.textContent = t.addButton || "+";
            Object.assign(addBtn.style, {
                color: colors.primary,
                cursor: "pointer",
                border: "1px solid " + colors.primary,
                backgroundColor: colors.surface,
                borderRadius: "4px",
                padding: "2px 6px",
                fontWeight: "bold",
                fontSize: "11px"
            });
            addBtn.title = t.addKeyword + " · " + (t.negativeKeywordHint || '');
            addBtn.onclick = () => {
                (async () => {
                    const newKeyword = await showInputModal(t.addKeyword + " — " + (t.negativeKeywordHint || ''));
                    if (newKeyword) {
                        const k = newKeyword.trim().toLowerCase();
                        if (k && k !== '-' && !keywords.includes(k)) {
                            keywords.push(k);
                            setStoredKeywords(keywords);
                            removeNotificationsNotInKeywords(keywords);
                            setCollapseFlag(false);
                            location.reload();
                        }
                    }
                })();
            };
            return addBtn;
        }

        // ---------------------------------------------
        // Barra de filtros de vista
        // ---------------------------------------------
        // Va pegada a las pestañas y no a las keywords: filtra lo que las keywords
        // ya encontraron, no cambia que se busca. Encender un chip no recarga la
        // pagina —solo repinta el panel—, que es justo lo que separa un filtro de
        // vista de una keyword.

        function _paintFilterChip(chip, on) {
            chip.style.backgroundColor = on ? colors.primary : colors.bg;
            chip.style.color = on ? colors.bg : colors.gray;
            chip.style.borderColor = on ? colors.primary : colors.border;
            chip.style.fontWeight = on ? "700" : "400";
        }

        // Repinta el panel con los arrays del ultimo escaneo. Los nombres de drop y
        // la linea de urgencia se re-inyectan aparte porque renderResults crea
        // tarjetas nuevas y esas dos cosas se cuelgan de ellas despues.
        function _rerenderPanes() {
            const results = document.getElementById("kick-drops-results");
            if (!results) return;
            renderResults(results, active, upcoming, expired);
            _updateAllCardsWithDropNames();
        }

        // Los datos llegan tarde y por DOS vias independientes —las campañas por la API
        // y el progreso del inventario por la suya—, asi que el primer pintado del panel
        // se hace casi siempre a ciegas. Repintar solo las tarjetas NO basta: el orden,
        // los filtros y la cuenta de la pestaña se DECIDEN en renderResults, y sin volver
        // a pasar por ahi se quedan congelados —badges y ✓ recien puestos conviviendo con
        // el orden de la pagina y una cuenta de filtro que ya no corresponde—. En Kick la
        // data suele llegar antes de que haya panel, asi que se ve menos que en Twitch,
        // pero la carrera es la misma y basta con que la API tarde una vez.
        function _refreshPanelAfterLateData() {
            // Se repinta SIEMPRE, tambien cuando no hay nada escaneado. Antes se salia
            // por ahi para no pintar un "no hay resultados" de un instante, y el efecto
            // era que en cualquier pestaña que no fuera campañas el panel se quedaba en
            // blanco: sin tarjetas, sin el mensaje y sin las cuentas de las solapas.
            // Un panel vacio no se distingue de uno roto, y ademas ya no es cierto que
            // no haya nada que pintar: la API llena las tres secciones por su cuenta.
            _rerenderPanes();
        }

        function clearViewFilters() {
            setViewFilters([]);
            document.querySelectorAll(".kick-view-filter").forEach(c => _paintFilterChip(c, false));
            _rerenderPanes();
        }

        function createViewFilterBar() {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "10px"
            });
            const defs = [
                { id: 'pending', label: "☑ " + (t.filterPending || "Something left") },
                { id: 'soon', label: "⏳ " + (t.filterSoon || "Closing soon") },
                { id: 'unclaimed', label: "🎁 " + (t.filterUnclaimed || "Unclaimed") },
                { id: 'quick', label: "⚡ " + (t.filterQuick || "1 h or less") }
            ];
            const on = getViewFilters();
            defs.forEach(def => {
                const chip = document.createElement("span");
                chip.className = "kick-view-filter";
                chip.setAttribute("data-filter-id", def.id);
                chip.textContent = def.label;
                chip.title = t.filterBarHint || '';
                Object.assign(chip.style, {
                    padding: "2px 8px", borderRadius: "12px", fontSize: "11px",
                    cursor: "pointer", transition: "all 0.15s", userSelect: "none",
                    border: `1px solid ${colors.border}`
                });
                _paintFilterChip(chip, on.includes(def.id));
                chip.onclick = () => {
                    const current = getViewFilters();
                    const next = current.includes(def.id)
                        ? current.filter(x => x !== def.id)
                        : current.concat(def.id);
                    setViewFilters(next);
                    _paintFilterChip(chip, next.includes(def.id));
                    _rerenderPanes();
                };
                row.appendChild(chip);
            });
            return row;
        }

        // ---------------------------------------------
        // Barra de orden
        // ---------------------------------------------
        // Dos chips excluyentes, no un desplegable: son dos y se ve de un vistazo
        // cual manda. Comparten pintado con los filtros para que se lean como la
        // misma familia, pero se comportan como una radio.
        function createSortBar() {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex", flexWrap: "wrap", gap: "4px",
                alignItems: "center", marginBottom: "10px"
            });
            const label = document.createElement("span");
            label.textContent = t.sortLabel || "Sort:";
            Object.assign(label.style, { fontSize: "11px", color: colors.gray, marginRight: "2px" });
            row.appendChild(label);

            // El tooltip va solo en "lo mas barato" porque es la unica de las dos
            // que sorprende: ordena por el tramo pendiente MINIMO mientras la ⏱ de
            // la tarjeta enseña el MAXIMO, asi que la primera de la lista puede
            // llevar un ⏱ de 5 h y parecer un error. La de urgencia ordena por
            // fecha y nadie espera que coincida con un tiempo, no necesita nota.
            const defs = [
                { id: 'urgent', label: "⏳ " + (t.sortUrgent || "Closing first") },
                { id: 'cheapest', label: "⏱ " + (t.sortCheapest || "Cheapest first"),
                  hint: t.sortCheapestHint || i18n.en.sortCheapestHint }
            ];
            const current = getSortMode();
            defs.forEach(def => {
                const chip = document.createElement("span");
                chip.className = "kick-sort-mode";
                chip.setAttribute("data-sort-id", def.id);
                chip.textContent = def.label;
                if (def.hint) chip.title = def.hint;
                Object.assign(chip.style, {
                    padding: "2px 8px", borderRadius: "12px", fontSize: "11px",
                    cursor: "pointer", transition: "all 0.15s", userSelect: "none",
                    border: `1px solid ${colors.border}`
                });
                _paintFilterChip(chip, current === def.id);
                chip.onclick = () => {
                    if (getSortMode() === def.id) return;
                    setSortMode(def.id);
                    document.querySelectorAll(".kick-sort-mode").forEach(c => {
                        _paintFilterChip(c, c.getAttribute("data-sort-id") === def.id);
                    });
                    _rerenderPanes();
                };
                row.appendChild(chip);
            });
            return row;
        }

        // ---------------------------------------------
        // Aviso de que falta el inventario
        // ---------------------------------------------
        // Sin /drops/progress desaparecen en silencio los ✓, los 🎁, el "te faltan"
        // y los filtros de estado dejan pasar todo. Callarselo hace que el panel
        // parezca simplemente un dia sin novedades, que es lo contrario de lo que
        // pasa: es un panel que no sabe nada de ti.
        function _updateInventoryWarning() {
            const el = document.getElementById("kick-drops-inventory-warning");
            if (!el) return;
            el.style.display = _progressInventoryReady ? "none" : "flex";
        }

        function _scheduleInventoryWarning() {
            setTimeout(_updateInventoryWarning, INVENTORY_WARN_DELAY_MS);
        }

        function createInventoryWarning() {
            const el = document.createElement("div");
            el.id = "kick-drops-inventory-warning";
            Object.assign(el.style, {
                // Arranca escondido siempre: lo enciende el temporizador, no el
                // estado del momento, para no parpadear durante el arranque.
                display: "none",
                alignItems: "center", gap: "6px",
                padding: "6px 8px", marginBottom: "6px",
                backgroundColor: colors.orange + "15",
                border: `1px solid ${colors.orange}40`,
                borderRadius: "6px", fontSize: "11px",
                color: colors.orange
            });
            const icon = document.createElement("span");
            icon.textContent = "⚠";
            el.appendChild(icon);
            el.appendChild(document.createTextNode(
                t.noInventoryData || "No inventory: what you own and what you have watched are unknown."
            ));
            return el;
        }

        // ---------------------------------------------
        // RECORDATORIO DE LA RACHA DIARIA
        // ---------------------------------------------
        // Kick regala un cofre al día por ver 60 minutos de stream, y encadenarlos da
        // racha. Kick ya avisa de lo que hay que RECLAMAR —toast, cofre encendido, y
        // ademas este script lo reclama solo—, asi que ese aviso no se repite aqui: lo
        // que no avisa nadie es lo de ANTES, que el dia va corriendo y no has puesto
        // ningun stream. Eso es lo que rompe la racha, y es lo unico que dice esto.
        //
        // El aviso es una tira dentro del panel, no una notificacion del sistema (ver
        // por que se quitaron, mas arriba). Se va sola en cuanto el reto se completa, y
        // la × la calla hasta el dia siguiente.
        const DAILY_REMINDER_KEY = 'kick_daily_streak_reminded_window';

        // El reto que nos importa de todos los que devuelva la API. Se pide por los tres
        // campos y no por el primero del array: `recurrence` para no coger uno semanal,
        // y `condition.type` porque un reto de otra clase (seguir a alguien, chatear)
        // tendria umbral en otra unidad y el "te faltan N min" seria mentira.
        function _dailyWatchChallenge() {
            for (const c of (_kickChallenges || [])) {
                if (!c || c.recurrence !== 'daily') continue;
                if (!c.condition || c.condition.type !== 'watch_time_minutes') continue;
                return c;
            }
            return null;
        }

        // Que hacer con el reto de hoy. Los tres estados de Kick estan verificados
        // (2026-08-11, siguiendo un reto de principio a fin):
        //
        //   in_progress  acumulando. Es el UNICO que avisa, y no cambia de nombre en todo
        //                el trayecto: 0, 14 y 58 de 60 son los tres `in_progress`.
        //   claimable    los 60 cumplidos, esperando el clic. NO se avisa: de esto ya te
        //                avisa Kick (toast propio y el cofre de la barra encendido con
        //                `reward-available-CTA.webm`, que es lo que mira _checkDailyReward)
        //                y encima el script lo reclama solo si tienes la casilla puesta.
        //   claimed      cobrado. Trae dos campos que los otros no: `claimed_at` y
        //                `winner{card_url, id, rarity}`, o sea QUE te toco. El cofre de la
        //                barra vuelve a ser el SVG sin video.
        //
        // Podria aparecer un cuarto (un "perdido" para el dia que se cierra sin reclamar) y
        // entraria ya callado, porque solo `in_progress` habla. Al reves —avisar salvo que
        // diga "reclamado"— un nombre nuevo daria la lata a diario.
        //
        // Las otras dos comprobaciones NO son redundantes con el status:
        //
        //   · progress vs threshold cubre el instante en que los 60 estan cumplidos y el
        //     status todavia no ha pasado a `claimable`. Sin ella, ahi diria "60 de 60".
        //   · la ventana ya cerrada cubre la pestaña que se queda abierta. `_kickChallenges`
        //     vive en memoria y esto es un sitio de ver streams: cruzada la hora de cierre
        //     —las 18:00 de este ejemplo, ver `ends_at` mas arriba— el reto en memoria pasa
        //     a ser de un dia que ya no se puede ganar, y sin este corte el aviso seguiria
        //     pidiendote que corras por algo que ya no esta.
        function _dailyReminderState() {
            const c = _dailyWatchChallenge();
            if (!c || c.status !== 'in_progress') return null;
            const done = Number(c.condition.progress) || 0;
            const total = Number(c.condition.threshold) || 0;
            if (total <= 0 || done >= total) return null;
            const ends = Date.parse((c.window && c.window.ends_at) || '');
            if (Number.isFinite(ends) && ends <= Date.now()) return null;
            const windowKey = (c.window && c.window.starts_at) || '';
            if (windowKey && GM_getValue(DAILY_REMINDER_KEY, null) === windowKey) return null;
            return { done, total, windowKey };
        }

        function _updateDailyReminder() {
            // Ya no hay una tira propia que encender y apagar: la racha es una fila de la
            // pestaña 🔔, asi que actualizarla es repintar esa pestaña. Y el repintado se
            // encarga tambien del titulo del navegador y del pitido, que se piden SIEMPRE
            // —tanto si hay aviso como si no— porque es el mismo sitio el que los pone y
            // los quita: saliendo antes, la marca 🔥 se quedaria puesta despues de la ×.
            //
            // El relevo se (re)arma con el reto que haya EN MEMORIA y no con el estado:
            // ese viene a null tambien cuando lo silenciaste con la ×, y entonces el dia
            // siguiente se quedaria sin despertador.
            _scheduleWindowRollover(_dailyWatchChallenge());
            renderNotificationsTab();
            // La tarjeta del cofre vive en la rejilla de reclamados, asi que el mismo dato
            // que mueve la fila de 🔔 tiene que repintarla tambien: sin esto solo aparecia
            // cuando los retos ya estaban en memoria al pintar la rejilla, o sea casi
            // nunca al entrar directamente en la pestaña.
            if (_claimedTabIsFront()) _renderClaimedInventory();
        }

        // EL RELEVO DE VENTANA. A la hora de cierre (las 18:00 en UTC−6, ver `ends_at`) el
        // reto de hoy muere y Kick abre el de mañana. Lo que hay en `_kickChallenges` se
        // queda viejo, y sin esto la tira se callaba —por el corte de ventana cerrada— y ya
        // no volvia hasta recargar: o sea que el dia siguiente empezaba sin recordatorio en
        // cualquier pestaña que llevara abierta desde antes.
        //
        // Va con UN temporizador puesto al instante exacto del cierre, no sondeando cada
        // pocos minutos: la hora la dice la propia API, asi que preguntar en bucle solo
        // seria ruido para acertar lo que ya sabemos.
        //
        // El margen de 5 s es porque el que rota es el servidor: pidiendolo en el mismo
        // segundo puede contestar todavia con el reto viejo. Si aun asi llega cerrado se
        // reintenta, espaciado y contado —hasta 5 veces—: sin tope, un servidor que no
        // rotara nos dejaria pidiendolo cada minuto para siempre.
        const ROLLOVER_MARGEN_MS = 5000;
        const ROLLOVER_REINTENTO_MS = 60000;
        const ROLLOVER_MAX_REINTENTOS = 5;
        let _rolloverTimer = null;
        let _rolloverIntentos = 0;

        function _scheduleWindowRollover(challenge) {
            if (_rolloverTimer) { clearTimeout(_rolloverTimer); _rolloverTimer = null; }
            const ends = Date.parse((challenge && challenge.window && challenge.window.ends_at) || '');
            if (!Number.isFinite(ends)) return;
            const falta = ends - Date.now();
            let espera;
            if (falta > 0) {
                // Ventana viva: se despierta justo cuando cierre.
                _rolloverIntentos = 0;
                espera = falta + ROLLOVER_MARGEN_MS;
            } else {
                // Ya cerrada y seguimos con ella: el servidor no habia rotado.
                if (_rolloverIntentos >= ROLLOVER_MAX_REINTENTOS) return;
                _rolloverIntentos++;
                espera = ROLLOVER_REINTENTO_MS;
            }
            _rolloverTimer = setTimeout(() => {
                _rolloverTimer = null;
                // Hay que vaciarlo: _ensureChallenges sale por la puerta de atras si ya
                // tiene algo guardado, y lo que tiene es justo lo caducado.
                _kickChallenges = null;
                _ensureChallenges();
            }, espera);
        }

        // Se pide a mano solo si el interceptor no lo cazo: la pagina pide este endpoint
        // por su cuenta, pero no en todas las rutas ni siempre antes que nosotros.
        function _ensureChallenges(attempt = 0) {
            if (_kickChallenges) { _updateDailyReminder(); return; }
            if (!_kickAuthToken) {
                if (attempt < 10) setTimeout(() => _ensureChallenges(attempt + 1), 1500);
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: KICK_CHALLENGES_URL,
                headers: { 'Accept': 'application/json', 'Authorization': _kickAuthToken },
                onload: function (response) {
                    try {
                        if (response.status !== 200) return;
                        const data = JSON.parse(response.responseText);
                        if (data?.data && Array.isArray(data.data)) {
                            _kickChallenges = data.data;
                            _updateDailyReminder();
                        }
                    } catch (e) { /* noop */ }
                },
                onerror: function () { /* sin reto, sin aviso: no es un fallo visible */ }
            });
        }

        // LA RACHA, COMO UNA ALERTA MAS. Vivia en una tira encima de las solapas, y desde
        // ahi decia dos cosas a la vez sin querer: que era urgente —estaba encima de todo,
        // siempre a la vista— y que no era una alerta, porque el contador 🔔 no la contaba.
        // Reportado el 2026-08-22: el aviso del cofre salia pegado a la solapa de abiertos,
        // que es justo donde no pasa nada de eso. Ahora es una fila de la pestaña 🔔, con
        // su cuenta, y va PRIMERA porque es lo unico de ahi que caduca hoy.
        //
        // Se construye con el estado ya resuelto en vez de crear el nodo vacio y llenarlo
        // luego: la pestaña se repinta entera en cada cambio, asi que un nodo persistente
        // que hubiera que encender y apagar seria un estado mas que mantener en sincronia.
        function _dailyReminderRow(state) {
            const el = document.createElement('div');
            el.id = 'kick-drops-daily-reminder';
            Object.assign(el.style, {
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 8px', marginBottom: '4px',
                backgroundColor: colors.primary + '15',
                border: `1px solid ${colors.primary}40`,
                borderRadius: '6px', fontSize: '11px',
                color: colors.primary
            });
            const icon = document.createElement('span');
            icon.textContent = '🔥';
            el.appendChild(icon);
            const text = document.createElement('span');
            text.className = 'kick-daily-reminder-text';
            text.style.flex = '1';
            text.textContent = (t.dailyStreakReminder ||
                'Daily reward: {done} of {total} min watched. Do not lose your streak today.')
                .replace('{done}', String(state.done))
                .replace('{total}', String(state.total));
            el.appendChild(text);
            // La × calla el aviso guardando LA VENTANA del reto, no la fecha de hoy: asi
            // el silencio dura exactamente lo que dura el reto que estabas viendo.
            el.dataset.window = state.windowKey;
            const close = document.createElement('span');
            close.textContent = '✕';
            close.title = t.dismissDailyReminder || '';
            Object.assign(close.style, { cursor: 'pointer', opacity: '0.7', padding: '0 2px' });
            close.onclick = () => {
                if (state.windowKey) GM_setValue(DAILY_REMINDER_KEY, state.windowKey);
                // Repintar la pestaña se lleva esta fila y rehace la cuenta y el titulo:
                // callar el aviso tiene que callarlo entero, tambien el 🔥 del navegador.
                _updateDailyReminder();
            };
            el.appendChild(close);
            return el;
        }

        function createInventoryCheckboxes(inline = false) {
            const container = document.createElement('div');
            Object.assign(container.style, {
                display: 'flex', flexDirection: 'column', gap: '6px',
                marginTop: inline ? '10px' : '0'
            });

            const makeCheckbox = (id, labelText, initial, onChange) => {
                const wrapper = document.createElement('label');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '6px';
                wrapper.style.cursor = 'pointer';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = id;
                cb.checked = !!initial;
                cb.style.width = '14px';
                cb.style.height = '14px';
                cb.style.accentColor = colors.primary;

                const txt = document.createElement('span');
                txt.textContent = labelText;
                txt.style.fontSize = '11px';
                txt.style.color = colors.text;

                cb.onchange = () => onChange(cb.checked);
                wrapper.appendChild(cb);
                wrapper.appendChild(txt);
                return wrapper;
            };

            const expiredCb = makeCheckbox('cb-hide-expired', t.hideExpired, cleanExpiredInventoryFlag, (checked) => {
                setInventoryExpiredFlag(checked);
                cleanExpiredInventoryFlag = checked;
                if (_isClaimedPage()) {
                    if (checked) {
                        // Al activar: primero revisa/reclama drops, luego el cofre.
                        _dropsReviewInProgress = true;
                        cleanInventory("expired", _finishDropsReview);
                        // Y se repinta la rejilla YA. El barrido de arriba no enseña
                        // nada por si mismo —en esta pestaña `doHide` va a false, que es
                        // lo que la deja ser un escaparate— y lo unico que esconde los
                        // bloques de Kick es haber terminado de pintar la nuestra, que
                        // sin esto no vuelve a pasar hasta que el barrido agota sus 15
                        // intentos (9 s) o hasta recargar. Reportado el 2026-08-22:
                        // marcar la casilla aqui no cambiaba nada hasta refrescar.
                        _renderClaimedInventorySoon();
                    } else { setCollapseFlag(false); location.reload(); }
                } else if (_isCampaignsPage() && !checked) {
                    // Quitarla devuelve lo escondido. No hay recarga —aqui no se toco
                    // nada mas que la visibilidad de unas baldosas— y el proximo barrido
                    // ya no reclamara.
                    _updateClaimedTilesHidden();
                } else if (_isCampaignsPage() && checked) {
                    // Y en campañas, que es donde estan las barras y el boton desde el
                    // rediseño. Sin esto, marcar la casilla aqui solo guardaba el ajuste:
                    // el barrido que reclama ya habia terminado con la casilla apagada y
                    // no volvia a correr hasta la siguiente carga, asi que el drop
                    // completo se quedaba sin reclamar hasta que recargabas. Reportado el
                    // 2026-08-22 con PGS 9 Comic Boom: la casilla marcada, el boton
                    // «Claim» delante, y nada.
                    //
                    // Va en modo "claim" —reclama y no oculta nada— por lo mismo que
                    // _finishReviewOutsideClaimed: esconder campañas abiertas en la
                    // pagina de campañas abiertas no es lo que pide la casilla.
                    //
                    // Apagarla no lleva recarga: aqui no se escondio nada que haya que
                    // devolver, y lo unico que cambia es que el proximo barrido no
                    // reclamara.
                    _dropsReviewInProgress = true;
                    cleanInventory("claim", _finishDropsReview);
                    _updateClaimedTilesHidden();
                }
            });

            container.appendChild(expiredCb);
            return container;
        }

        /**
         * Parte un texto largo en frases. Sin lookbehind en la regex —Safari viejo la
         * rechaza al parsear y eso no se lleva la funcion, se lleva el script entero— y
         * contando los cierres de CJK e indico, que no llevan espacio detras.
         */
        function _splitSentences(text) {
            const out = [];
            let buf = '';
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                buf += c;
                const cjkEnd = c === '。' || c === '！' || c === '？';
                const plainEnd = (c === '.' || c === '!' || c === '?' || c === '।') &&
                    (i + 1 >= text.length || /\s/.test(text[i + 1]));
                if (cjkEnd || plainEnd) { out.push(buf.trim()); buf = ''; }
            }
            if (buf.trim()) out.push(buf.trim());
            return out;
        }

        /** Agrupa las frases en parrafos de `perPara`, para que la prosa respire. */
        function _infoParagraphs(text, perPara) {
            const src = String(text || '');
            const sentences = _splitSentences(src);
            // Japones y chino no separan frases con espacio: unirlas con uno metaria
            // un hueco que el original no tiene.
            const joiner = (lang === 'ja' || lang === 'zh') ? '' : ' ';
            const out = [];
            for (let i = 0; i < sentences.length; i += perPara) {
                out.push(sentences.slice(i, i + perPara).join(joiner));
            }
            return out.length ? out : [src];
        }

        function showInfoModal() {
            const { overlay, box } = createModalContainer();
            // Este modal es el unico con contenido de largo imprevisible (la descripcion
            // pasa de 3000 caracteres), asi que en vez de dejar que scrollee la caja
            // entera —lo que se llevaria el titulo y obligaria a bajar hasta el final
            // para encontrar el boton de cerrar— scrollea solo el cuerpo.
            Object.assign(box.style, {
                display: 'flex', flexDirection: 'column', overflowY: 'hidden',
                maxWidth: '560px', lineHeight: '1.55'
            });
            // El arabe se lee al reves: sin esto las etiquetas de la ficha quedan con
            // los dos puntos del lado que no toca.
            if (lang === 'ar') box.dir = 'rtl';

            const hairline = () => {
                const hr = document.createElement('div');
                Object.assign(hr.style, {
                    height: '1px', backgroundColor: colors.border,
                    margin: '14px 0', flexShrink: '0'
                });
                return hr;
            };

            // --- Cabecera fija: titulo y ficha ---
            const head = document.createElement('div');
            head.style.flexShrink = '0';

            const titleEl = document.createElement('div');
            titleEl.textContent = t.scriptInfoTitle;
            Object.assign(titleEl.style, {
                fontWeight: 'bold', fontSize: '17px', marginBottom: '12px',
                color: colors.primaryLight
            });
            head.appendChild(titleEl);

            // Ficha en dos columnas. Antes cada dato era "etiqueta en negrita + valor"
            // en la misma linea, asi que el ancho de la etiqueta empujaba al valor y
            // los cinco valores salian escalonados; en una rejilla quedan alineados.
            const meta = document.createElement('div');
            Object.assign(meta.style, {
                display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)',
                columnGap: '10px', rowGap: '5px', fontSize: '13px'
            });
            [
                { label: t.scriptInfoName, value: "Kick Drops Highlighter + Keywords (Full + i18n)" },
                { label: t.scriptInfoVersion, value: SCRIPT_VERSION },
                { label: t.scriptInfoAuthor, value: "g31w0fw0rld" },
                { label: t.scriptInfoGitHub, value: "github.com/g31w0fw0rld/kick-drops-highlighter", isLink: true },
                { label: "☕ Ko-fi:", value: "ko-fi.com/g31w0fw0rld", isLink: true }
            ].forEach(r => {
                const label = document.createElement('div');
                label.textContent = r.label;
                Object.assign(label.style, {
                    fontWeight: '600', color: colors.gray, whiteSpace: 'nowrap'
                });
                meta.appendChild(label);
                const val = document.createElement('div');
                // Sin esto la URL no parte y estira la caja mas alla de su maxWidth.
                Object.assign(val.style, { minWidth: '0', overflowWrap: 'anywhere' });
                if (r.isLink) {
                    const a = document.createElement('a');
                    a.href = "https://" + r.value;
                    a.textContent = r.value;
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    a.style.color = colors.primaryLight;
                    a.style.textDecoration = "underline";
                    val.appendChild(a);
                } else {
                    val.textContent = r.value;
                }
                meta.appendChild(val);
            });
            head.appendChild(meta);
            head.appendChild(hairline());
            box.appendChild(head);

            // --- Cuerpo scrollable: los dos bloques de prosa ---
            const body = document.createElement('div');
            Object.assign(body.style, {
                overflowY: 'auto', minHeight: '0', paddingRight: '4px', fontSize: '13px'
            });
            [
                { title: t.scriptInfoDescription, text: t.scriptInfoDescriptionText },
                { title: t.scriptInfoPrivacy, text: t.scriptInfoPrivacyText }
            ].forEach((s, i) => {
                const h = document.createElement('div');
                // La misma etiqueta de antes, sin los dos puntos: ya no encabeza una
                // linea, encabeza un bloque. Se quitan tambien los de ancho completo
                // del chino y el espacio previo del frances.
                h.textContent = String(s.title || '').replace(/\s*[:：]\s*$/, '');
                Object.assign(h.style, {
                    fontWeight: 'bold', color: colors.primaryLight,
                    marginTop: i ? '16px' : '0', marginBottom: '6px'
                });
                body.appendChild(h);
                _infoParagraphs(s.text, 2).forEach(p => {
                    const para = document.createElement('div');
                    para.textContent = p;
                    para.style.marginBottom = '8px';
                    body.appendChild(para);
                });
            });
            box.appendChild(body);
            box.appendChild(hairline());
            const detach = attachDismissHandlers(overlay, () => { closeOverlayAnimated(overlay); });
            const closeBtn = createButton(t.accept, colors.primary, () => {
                detach();
                return closeOverlayAnimated(overlay);
            });
            closeBtn.style.flexShrink = '0';
            // Centrado y a su ancho, como los botones de los demas modales —que lo
            // consiguen con su fila de acciones—. Hace falta decirlo porque `box` es
            // aqui un flex en columna: con el align-items:stretch por defecto, el
            // boton se estiraba a todo el ancho de la caja.
            closeBtn.style.alignSelf = 'center';
            box.appendChild(closeBtn);

            document.body.appendChild(overlay);
            try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
            setTimeout(() => {
                overlay.style.opacity = '1';
                try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
            }, 10);
            // Sin esto el foco se queda en el ℹ️ del panel, que setInertOnBodyChildrenExcept
            // acaba de marcar inert, y se cae a <body>. Mismo gesto que los otros modales.
            setTimeout(() => closeBtn.focus(), 120);
        }

        // =============================================
        // FLOATING PANEL (Kick green theme)
        // =============================================

        function buildPanel() {
            const existing = document.getElementById("kick-drops-panel");
            if (existing) existing.remove();

            const panel = document.createElement("div");
            panel.id = "kick-drops-panel";
            Object.assign(panel.style, {
                position: "fixed", top: "70px", right: "16px", zIndex: "9999",
                backgroundColor: colors.surface, color: colors.text,
                border: `1px solid ${colors.border}`, borderRadius: "12px",
                padding: "0", fontFamily: "Inter, system-ui, sans-serif",
                fontSize: "13px", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                maxWidth: "390px", minWidth: "300px", maxHeight: "80vh",
                display: "flex", flexDirection: "column", overflow: "hidden"
            });

            // Header with gradient (Kick green)
            const header = document.createElement("div");
            Object.assign(header.style, {
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderBottom: `1px solid ${colors.border}`,
                cursor: "move", userSelect: "none",
                background: `linear-gradient(135deg, ${colors.primaryDark}22, ${colors.surface})`
            });

            const titleEl = document.createElement("span");
            titleEl.textContent = "🎁 Kick Drops";
            titleEl.style.fontWeight = "bold";
            titleEl.style.fontSize = "14px";
            titleEl.style.color = colors.primaryLight;
            header.appendChild(titleEl);

            const headerBtns = document.createElement("div");
            headerBtns.style.display = "flex";
            headerBtns.style.gap = "6px";

            const infoBtn = document.createElement("span");
            infoBtn.id = "kick-drops-info-btn";
            infoBtn.textContent = "ℹ️";
            infoBtn.title = t.scriptInfoTitle || '';
            infoBtn.style.cursor = "pointer";
            infoBtn.style.fontSize = "14px";
            infoBtn.onclick = showInfoModal;
            headerBtns.appendChild(infoBtn);

            const collapseBtn = document.createElement("span");
            collapseBtn.id = "kick-drops-collapse-btn";
            const isCollapsed = getCollapseFlag();
            collapseBtn.textContent = isCollapsed ? "🔽" : "🔼";
            collapseBtn.title = isCollapsed ? (t.expandPanel || '') : (t.collapsePanel || '');
            collapseBtn.style.cursor = "pointer";
            collapseBtn.style.fontSize = "14px";
            headerBtns.appendChild(collapseBtn);

            header.appendChild(headerBtns);
            panel.appendChild(header);

            // Body
            const body = document.createElement("div");
            body.id = "kick-drops-panel-body";
            Object.assign(body.style, {
                padding: "10px 14px", overflow: "hidden", flex: "1",
                display: isCollapsed ? "none" : "flex", flexDirection: "column", minHeight: "0"
            });

            collapseBtn.onclick = () => {
                const collapsed = body.style.display === "none";
                body.style.display = collapsed ? "flex" : "none";
                collapseBtn.textContent = collapsed ? "🔼" : "🔽";
                collapseBtn.title = collapsed ? (t.collapsePanel || '') : (t.expandPanel || '');
                setCollapseFlag(!collapsed);
            };

            // Keyword chips
            const kwSection = document.createElement("div");
            kwSection.style.marginBottom = "10px";
            const kwLabel = document.createElement("div");
            kwLabel.textContent = t.currentKeywords;
            kwLabel.style.marginBottom = "6px";
            kwLabel.style.fontSize = "11px";
            kwLabel.style.color = colors.gray;
            kwSection.appendChild(kwLabel);

            const kwChips = document.createElement("div");
            kwChips.style.display = "flex";
            kwChips.style.flexWrap = "wrap";
            kwChips.style.gap = "4px";

            const currentKws = getStoredKeywords();
            currentKws.forEach(kw => {
                // Las negativas se ven distintas —borde discontinuo y en rojo— sin
                // esconder el `-`: el prefijo es la sintaxis real, y verlo es lo
                // que enseña a escribir la siguiente.
                const negative = kw.startsWith('-');
                const idleBorder = negative ? colors.red + "80" : colors.border;
                const idleColor = negative ? colors.red : colors.text;
                const chip = document.createElement("span");
                chip.textContent = kw;
                chip.title = negative
                    ? (t.negativeKeywordHint || '') + " · " + t.deleteKeywordTooltip
                    : t.deleteKeywordTooltip;
                Object.assign(chip.style, {
                    padding: "2px 8px", backgroundColor: colors.bg,
                    border: `1px ${negative ? "dashed" : "solid"} ${idleBorder}`,
                    borderRadius: "12px",
                    fontSize: "11px", cursor: "pointer", transition: "all 0.15s",
                    color: idleColor
                });
                // Las negativas ya son rojas en reposo, asi que el hover se marca
                // con opacidad: si no, no habria respuesta visual al pasar por
                // encima justo en las que mas facil es borrar por error.
                chip.onmouseenter = () => {
                    chip.style.borderColor = colors.red;
                    chip.style.color = colors.red;
                    if (negative) chip.style.opacity = "0.6";
                };
                chip.onmouseleave = () => {
                    chip.style.borderColor = idleBorder;
                    chip.style.color = idleColor;
                    chip.style.opacity = "1";
                };
                chip.onclick = () => {
                    (async () => {
                        const ok = await showConfirmModal(t.deleteKeywordQuestion + `"${kw}"?`);
                        if (ok) {
                            const updated = getStoredKeywords().filter(k => k !== kw);
                            setStoredKeywords(updated);
                            // Quitar una negativa solo puede AÑADIR coincidencias,
                            // asi que no hay nada que purgar.
                            if (!negative) deleteNotificationsByKeyword(kw);
                            setCollapseFlag(false);
                            location.reload();
                        }
                    })();
                };
                kwChips.appendChild(chip);
            });

            // Add keyword button inline
            const addChip = document.createElement("span");
            addChip.textContent = "+";
            addChip.title = t.addKeyword + " · " + (t.negativeKeywordHint || '');
            Object.assign(addChip.style, {
                padding: "2px 8px", backgroundColor: colors.bg,
                border: `1px solid ${colors.primary}`, borderRadius: "12px",
                fontSize: "11px", cursor: "pointer", transition: "all 0.15s",
                color: colors.primary, fontWeight: "bold"
            });
            addChip.onmouseenter = () => { addChip.style.backgroundColor = colors.primary; addChip.style.color = colors.bg; };
            addChip.onmouseleave = () => { addChip.style.backgroundColor = colors.bg; addChip.style.color = colors.primary; };
            addChip.onclick = () => {
                (async () => {
                    const newKeyword = await showInputModal(t.addKeyword + " — " + (t.negativeKeywordHint || ''));
                    if (newKeyword) {
                        const k = newKeyword.trim().toLowerCase();
                        // Un "-" a secas no descarta nada y dejaria la lista con una
                        // entrada muerta que ademas parece un error.
                        if (k && k !== '-' && !keywords.includes(k)) {
                            keywords.push(k);
                            setStoredKeywords(keywords);
                            removeNotificationsNotInKeywords(keywords);
                            setCollapseFlag(false);
                            location.reload();
                        }
                    }
                })();
            };
            kwChips.appendChild(addChip);

            kwSection.appendChild(kwChips);
            body.appendChild(kwSection);

            // Buttons row
            const btnRow = document.createElement("div");
            Object.assign(btnRow.style, {
                display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px"
            });
            btnRow.appendChild(createEditKeywordsButton());
            btnRow.appendChild(createResetKeywordsButton());
            btnRow.appendChild(createReloadButton());
            body.appendChild(btnRow);

            // Inventory checkboxes
            const invCbs = createInventoryCheckboxes();
            invCbs.style.marginBottom = "10px";
            body.appendChild(invCbs);

            // View filters
            body.appendChild(createViewFilterBar());

            // Sort mode
            body.appendChild(createSortBar());

            // Tabs: Active | Upcoming | Expired | Notifications
            const tabBar = document.createElement("div");
            Object.assign(tabBar.style, {
                display: "flex", gap: "0", marginBottom: "10px",
                borderBottom: `1px solid ${colors.border}`
            });

            const tabStyle = {
                flex: "1", padding: "6px 1px", cursor: "pointer", fontSize: "10px",
                lineHeight: "1.2",
                fontWeight: "bold", border: "none", borderBottom: `2px solid transparent`,
                backgroundColor: "transparent", color: colors.gray, textAlign: "center"
            };

            const tabActive = document.createElement("button");
            tabActive.id = "kick-drops-tab-active";
            tabActive.textContent = t.dropsActive;
            Object.assign(tabActive.style, { ...tabStyle });

            const tabUpcoming = document.createElement("button");
            tabUpcoming.id = "kick-drops-tab-upcoming";
            tabUpcoming.textContent = t.dropsUpcoming;
            Object.assign(tabUpcoming.style, { ...tabStyle });

            const tabExpired = document.createElement("button");
            tabExpired.id = "kick-drops-tab-expired";
            tabExpired.textContent = t.dropsExpired;
            Object.assign(tabExpired.style, { ...tabStyle });

            const tabNotifs = document.createElement("button");
            tabNotifs.id = "kick-drops-tab-notifs";
            tabNotifs.textContent = `${t.changedIcon || "🔔"} (0)`;
            Object.assign(tabNotifs.style, { ...tabStyle });

            tabBar.appendChild(tabActive);
            tabBar.appendChild(tabUpcoming);
            tabBar.appendChild(tabExpired);
            tabBar.appendChild(tabNotifs);
            body.appendChild(tabBar);

            // Scrollable tab content area (takes remaining space)
            const tabContent = document.createElement("div");
            Object.assign(tabContent.style, {
                flex: "1", overflowY: "auto", minHeight: "0"
            });

            // Active drops pane
            const activePane = document.createElement("div");
            activePane.id = "kick-drops-active-pane";
            tabContent.appendChild(activePane);

            // Upcoming drops pane (hidden by default)
            const upcomingPane = document.createElement("div");
            upcomingPane.id = "kick-drops-upcoming-pane";
            upcomingPane.style.display = "none";
            tabContent.appendChild(upcomingPane);

            // Expired drops pane (hidden by default)
            const expiredPane = document.createElement("div");
            expiredPane.id = "kick-drops-expired-pane";
            expiredPane.style.display = "none";
            tabContent.appendChild(expiredPane);

            // Hidden combined results container (used by renderResults internally)
            const results = document.createElement("div");
            results.id = "kick-drops-results";
            results.style.display = "none";
            tabContent.appendChild(results);

            // Notifications pane (hidden by default)
            const notifsPane = document.createElement("div");
            notifsPane.id = "kick-drops-notifs-pane";
            notifsPane.style.display = "none";
            tabContent.appendChild(notifsPane);

            // API loading indicator
            const apiLoadingEl = document.createElement("div");
            apiLoadingEl.id = "kick-drops-api-loading";
            Object.assign(apiLoadingEl.style, {
                // Visible mientras el panel pueda cambiar, no solo mientras falte la
                // API: ver _updateApiLoadingBanner. Atado a _apiDataReady no se veia
                // nunca, porque la API contesta antes de que este panel exista.
                display: _dropsScanDone ? "none" : "flex",
                alignItems: "center", gap: "6px",
                padding: "6px 8px", marginBottom: "6px",
                backgroundColor: colors.orange + "15",
                border: `1px solid ${colors.orange}40`,
                borderRadius: "6px", fontSize: "11px",
                color: colors.orange
            });
            const pulseDot = document.createElement("span");
            Object.assign(pulseDot.style, {
                display: "inline-block", width: "8px", height: "8px",
                borderRadius: "50%", backgroundColor: colors.orange,
                animation: "kick-pulse-dot 1.2s infinite"
            });
            apiLoadingEl.appendChild(pulseDot);
            // El texto va en su propio span porque cambia a mitad de vida: primero dice
            // que se esta leyendo la API y despues que se esta buscando en la pagina.
            const apiLoadingText = document.createElement("span");
            apiLoadingText.className = "kick-api-loading-text";
            apiLoadingEl.appendChild(apiLoadingText);
            if (!document.getElementById("kick-pulse-dot-style")) {
                const style = document.createElement("style");
                style.id = "kick-pulse-dot-style";
                style.textContent = "@keyframes kick-pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }";
                document.head.appendChild(style);
            }
            body.appendChild(apiLoadingEl);
            _updateApiLoadingBanner();
            body.appendChild(createInventoryWarning());
            _scheduleInventoryWarning();
            // El recordatorio de la racha NO se cuelga aqui: es una fila de la pestaña 🔔
            // (ver _dailyReminderRow), asi que lo pinta renderNotificationsTab.
            // Si el interceptor ya lo tenia, se pinta ahora; si llega despues, entra por
            // el callback. Las dos vias acaban en la misma funcion.
            _onChallengesReady = _updateDailyReminder;
            _ensureChallenges();

            body.appendChild(tabContent);

            // Tab helper: activate one tab, deactivate others
            function activateTab(activeBtn, accentBorder, accentText) {
                [tabActive, tabUpcoming, tabExpired, tabNotifs].forEach(btn => {
                    btn.style.borderBottom = `2px solid transparent`;
                    btn.style.color = colors.gray;
                });
                activeBtn.style.borderBottom = `2px solid ${accentBorder || colors.primary}`;
                activeBtn.style.color = accentText || colors.primaryLight;
                [activePane, upcomingPane, expiredPane, notifsPane].forEach(p => p.style.display = "none");
            }

            tabActive.onclick = () => { activateTab(tabActive); activePane.style.display = "block"; };
            tabUpcoming.onclick = () => { activateTab(tabUpcoming, colors.upcoming, colors.upcomingLight); upcomingPane.style.display = "block"; };
            tabExpired.onclick = () => { activateTab(tabExpired, colors.red, colors.red); expiredPane.style.display = "block"; };
            tabNotifs.onclick = () => { activateTab(tabNotifs); notifsPane.style.display = "block"; };

            // Check if there are pending notifications to show that tab by default
            const pendingNotifs = getNotifications().filter(n => !n.seen && n.changed);
            if (pendingNotifs.length > 0) {
                activateTab(tabNotifs);
                notifsPane.style.display = "block";
            } else {
                activateTab(tabActive);
                activePane.style.display = "block";
            }

            panel.appendChild(body);

            // Drag support
            let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
            header.addEventListener("mousedown", (e) => {
                isDragging = true;
                const rect = panel.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                e.preventDefault();
            });
            document.addEventListener("mousemove", (e) => {
                if (!isDragging) return;
                panel.style.left = (e.clientX - dragOffsetX) + "px";
                panel.style.top = (e.clientY - dragOffsetY) + "px";
                panel.style.right = "auto";
            });
            document.addEventListener("mouseup", () => { isDragging = false; });

            document.body.appendChild(panel);
            // Los avisos del script, una sola vez y para todo (panel, marcas de
            // pagina y filas de progreso). Va aqui y no en el arranque porque hasta
            // que el panel existe no hay ningun control con `title` que servir.
            _initOwnTooltips();
            return results;
        }

        // =============================================
        // CAMPAIGN CARD RENDERING (Kick-style)
        // =============================================

        // Deja el TITULO de la campaña pegado al borde de arriba.
        //
        // Lo que NO se hace es centrar el nodo de la campaña. En el DOM nuevo un grupo de
        // juego mide varias pantallas —el de KICK trae 11 sub-campañas con sus
        // recompensas—, asi que centrarlo deja el titulo muy por encima del borde
        // superior: acabas en mitad de la lista, sin ver a que campaña llegaste. Ese era
        // el sintoma de "no enfoca el texto, enfoca el medio del div".
        //
        // El margen es el mismo `scroll-margin-top` que ya llevan las campañas
        // resaltadas, y hace falta ponerlo aparte porque el ancla es el titulo y no el
        // nodo resaltado: la cabecera de Kick es fija, asi que sin el, "arriba del todo"
        // queda justo debajo de ella.
        const SCROLL_MARGIN_TOP = "100px";

        function scrollToCampaignElement(node) {
            if (!node) return;
            const anchor = _scrollAnchorOf(node);
            anchor.style.scrollMarginTop = SCROLL_MARGIN_TOP;
            anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        function _scrollAnchorOf(node) {
            // DOM viejo: la cabecera del acordeon de Radix, que ya lleva el titulo dentro.
            //
            // `button[aria-expanded]` hay que acotarlo: en el DOM nuevo no hay acordeon y
            // ese atributo lo llevan los 18 botones "More details" de la pagina, que abren
            // un dialogo. Sin el descarte, enfocar una campaña te dejaba mirando un boton
            // de dentro de su tarjeta. Se distinguen por aria-haspopup, que es lo que dice
            // que abren otra cosa en vez de desplegar la suya.
            const header = node.querySelector('button[data-radix-collection-item]') ||
                           node.querySelector('button[aria-expanded]:not([aria-haspopup])');
            if (header) return header;
            // DOM nuevo: el titulo es el primer encabezado del nodo —el del juego en un
            // grupo, el de la sub-campaña en su tarjeta—. Y si el nodo YA es el titulo
            // (lo que devuelve _findPageNodeByCampaignName), se queda como esta.
            return _gameNameElOf(node) || node;
        }

        // =============================================
        // IR A UNA CAMPAÑA QUE ESTA EN OTRA PESTAÑA
        // =============================================
        // Cada seccion es una pestaña con pagina propia —abiertas, proximas, cerradas— y
        // el panel las lista las tres juntas. Asi que pulsar una tarjeta muchas veces
        // significa "llevame a otra pagina", y llegar no basta: hay que dejarte delante
        // de la campaña, igual que cuando ya esta en la pestaña que miras.
        //
        // Las pestañas de Kick RECARGAN la pagina. Ese es el detalle que manda: el clic
        // que apunta el destino es el mismo que mata la ejecucion que lo apunto. Ya hubo
        // aqui un intento con una variable en memoria, y no fallaba a veces —no podia
        // funcionar nunca—. Por eso el destino va a GM_setValue, que es lo unico que
        // cruza al otro lado.
        //
        // Se guarda con marca de tiempo y caduca: si la navegacion no llega a ocurrir
        // (cierras la pestaña, Kick devuelve un error), un destino olvidado haria saltar
        // el scroll en una visita cualquiera de mañana, sin que nadie lo hubiera pedido.
        const FOCUS_TARGET_TTL_MS = 30000;

        function _setFocusTarget(campaign) {
            if (!campaign || !campaign.title) return;
            try {
                GM_setValue(FOCUS_TARGET_KEY, JSON.stringify({
                    title: campaign.title,
                    status: campaign.status || 'active',
                    ts: Date.now()
                }));
            } catch (e) { /* sin destino, la navegacion sigue valiendo */ }
        }

        // Se lee UNA vez y se borra en el mismo gesto, pase lo que pase despues: un
        // destino que sobreviva a su uso vuelve a disparar el scroll en el siguiente
        // escaneo de la misma pagina.
        function _takeFocusTarget() {
            let raw = null;
            try { raw = GM_getValue(FOCUS_TARGET_KEY, null); } catch (e) { return null; }
            if (!raw) return null;
            try { GM_deleteValue(FOCUS_TARGET_KEY); } catch (e) { /* ignore */ }
            let target = null;
            try { target = JSON.parse(raw); } catch (e) { return null; }
            if (!target || !target.title) return null;
            if (!target.ts || Date.now() - target.ts > FOCUS_TARGET_TTL_MS) return null;
            return target;
        }

        // Enfoca la campaña SI ESTA EN ESTA PAGINA. Devuelve si lo consiguio, para que
        // quien llame sepa si todavia hace falta cambiar de pestaña.
        //
        // Los tres intentos van de lo mas preciso a lo mas general, y el tercero es el
        // que faltaba: una SUB-CAMPAÑA de la pestaña que ya tienes delante no tiene nodo
        // escaneado propio —la pagina las agrupa por juego y solo el grupo se marca—,
        // asi que los dos primeros fallaban y se acababa mandando a "cambiar de pestaña"
        // a alguien que ya estaba en ella. El resultado era pulsar «Football Drop:
        // Jungle Jersey - KICK» estando en cerradas y no ir a ningun sitio.
        function _focusCampaignOnPage(campaign) {
            if (!campaign) return false;
            if (campaign.element && document.contains(campaign.element)) {
                scrollToCampaignElement(campaign.element);
                return true;
            }
            if (campaign.id) {
                const byId = document.getElementById(campaign.id);
                if (byId) { scrollToCampaignElement(byId); return true; }
            }
            // El titulo de la tarjeta es "<lo suyo> - <organizacion>", asi que su nombre
            // propio es lo de delante: para el grupo es el juego ("KICK") y para la
            // sub-campaña su nombre ("Football Drop: Jungle Jersey"). Los dos son un
            // encabezado de la pagina, y cada uno lleva al suyo.
            const propio = String(campaign.title || '').split(' - ')[0];
            const node = _findPageNodeByCampaignName(propio);
            if (node) { scrollToCampaignElement(node); return true; }
            return false;
        }

        function _goToCampaignTab(campaign) {
            const kind = TAB_OF_STATUS[campaign && campaign.status] || 'campaigns';
            // Ya estando en la pestaña que toca no hay nada que hacer: si la campaña
            // estuviera aqui, _focusCampaignOnPage ya la habria encontrado. Pulsar el
            // enlace seria recargar la pagina para acabar en el mismo sitio.
            if (_kindOfPath() === kind) return;
            const link = _tabLink(kind);
            // Se apunta el destino ANTES de navegar: despues del clic ya no corre nada
            // de aqui. Y solo si hay a donde ir, para no dejar un destino colgado
            // esperando una navegacion que no va a pasar.
            if (!link) return;
            _setFocusTarget(campaign);
            link.click();
        }

        // Se llama al terminar cada escaneo, con los nodos de la pagina ya identificados.
        // El cruce es por titulo y no por id: los ids (drop-match-N-status) se reparten
        // en cada escaneo por orden de aparicion, asi que el de antes de la recarga no
        // significa nada aqui.
        function _focusPendingCampaign(items) {
            const target = _takeFocusTarget();
            if (!target) return;
            // Se busca entre lo escaneado para recuperar el NODO —el destino guardado
            // solo lleva el titulo, porque los ids se reparten de nuevo en cada
            // escaneo— y a partir de ahi se enfoca con la misma regla que un clic
            // estando ya en la pagina. Si no esta ni escaneado ni como encabezado
            // suelto, no se hace nada: mejor quedarse arriba que saltar a la campaña
            // equivocada.
            const wanted = String(target.title).toLowerCase();
            const found = (items || []).find(c =>
                c && c.element && String(c.title || '').toLowerCase() === wanted);
            _focusCampaignOnPage(found || { title: target.title });
        }

        // Busca en la pagina el encabezado que se llama EXACTAMENTE asi. Sirve para las
        // sub-campañas, que no tienen entrada propia en lo escaneado.
        //
        // Devuelve el encabezado y no la tarjeta que lo contiene: es lo que hay que dejar
        // a la vista, y una tarjeta puede medir varias pantallas.
        function _findPageNodeByCampaignName(name) {
            const wanted = String(name || '').trim().toLowerCase();
            if (!wanted) return null;
            for (const h of _dropsQuery('h2, h3')) {
                // Ni lo que dibujamos nosotros ni las pestañas que Kick deja montadas y
                // escondidas: llevan los mismos encabezados y el scroll no iria a ningun
                // sitio visible.
                if (h.closest('#kick-drops-panel')) continue;
                if (_isInHiddenPanel(h)) continue;
                if ((h.textContent || '').trim().toLowerCase() !== wanted) continue;
                return h;
            }
            return null;
        }

        // =============================================
        // COMPARTIR UNA CAMPAÑA
        // =============================================
        // El enlace es LA PESTAÑA DONDE VIVE la campaña —abiertas o proximas, segun su
        // estado— y no la campaña. No es pereza: en Kick una campaña NO TIENE DIRECCION,
        // y esto se comprobo por cuatro vias que no dependen unas de otras, asi que no
        // hace falta volver a intentarlo:
        //
        //   1. En el volcado del DOM de /drops/campaigns no hay ni un `href` de campaña.
        //      Los unicos enlaces de una campaña son los dos botones "Participate", y
        //      apuntan a /category/<slug>/drops — la pagina del JUEGO, no de la campaña.
        //   2. "More details" no es un enlace: es un disparador de dialogo de Radix
        //      (`aria-haspopup="dialog"`, `aria-controls="radix-..."`). El detalle de una
        //      campaña es un modal, y los modales de Radix no tocan la URL.
        //   3. En todo el JS que carga la pagina hay UNA sola lectura de parametro de
        //      URL —`searchParams.get("region")`— y esta en un script de terceros, no en
        //      la app de Kick. Ningun parametro que abra una campaña.
        //   4. La documentacion oficial (KickEngineering/KickDevDocs): `drops-faqs.md`
        //      enumera todos los sitios donde un espectador ve un drop —categoria,
        //      directo, inventario y "All Campaigns page"— y una pagina por campaña NO
        //      esta en la lista; `drops/public-api.md` documenta `campaign_id` solo como
        //      FILTRO de la API de reclamos de la organizacion, sin ninguna URL de web.
        //
        // O sea que aqui no hay equivalente al /drops/campaigns?dropID=<id> de Twitch,
        // que funciona porque su pagina si lee ese parametro. Y hay un campo que ENGAÑA:
        // `campaign.url` NO es la campaña, es una nota de prensa
        // (about.kick.com/news-and-press/...), ver el comentario de fetchDropsFromAPI.
        //
        // Lo mas especifico que Kick reconoce es la pagina de categoria, la misma a la
        // que va su "Participate": se podria armar con `category.slug` de la API. Se
        // decidio NO usarla —el enlace va a la lista— y queda dicho aqui para que la
        // proxima vez sea una decision y no un descubrimiento. Ojo si se retoma:
        // `category` solo llega en parte de las campañas (13 de 24 el 2026-08-05), asi
        // que habria que decidir tambien que hacer con las que no lo traen.

        function _shareTextFor(campaign) {
            const entry = _findEntryForTitle(campaign && campaign.title);
            // Los tramos salen de _apiDropNames, que va indexado por CATEGORIA (juego) y
            // ACUMULA las sub-campañas de ese juego. Asi que esta lista puede mezclar
            // recompensas de varias sub-campañas bajo un solo titulo: es lo mismo que
            // enseña el badge de la tarjeta, no una lista de una sub-campaña concreta.
            const drops = (entry && entry.drops) || [];
            const lines = [campaign.title || ''];
            // _apiDateRange de aqui recibe LOS DROPS (saca min/max de sus starts_at y
            // ends_at), no la entrada entera como en el de Twitch.
            const range = campaign.dateRange || _apiDateRange(drops);
            if (range) lines.push(range);
            // Los tramos van SIN las marcas de reclamado ni de ganado: eso es tuyo, no
            // de la campaña, y a quien se lo mandas no le dice nada —o peor, le dice que
            // ya lo tiene—. Se comparte lo que reparte, no como vas tu.
            //
            // Se reutiliza `label`, que ya trae el coste formateado desde
            // fetchDropsFromAPI, en vez de volver a dividir los minutos por 60 aqui: es
            // una sola forma de escribir el coste, y ademas hace que el texto copiado
            // diga exactamente lo mismo que el badge que tienes delante. Deduplicar por
            // `label` cubre nombre y coste de una vez.
            const seen = new Set();
            for (const d of drops) {
                const label = d.label || d.name || '';
                if (!label || seen.has(label)) continue;
                seen.add(label);
                lines.push('· ' + label);
            }
            // La pestaña donde vive: una campaña proxima esta en /drops/coming-soon, y
            // mandar a la lista de abiertas a quien recibe el texto seria mandarlo a una
            // pagina donde eso no aparece. Es la MISMA traduccion estado -> pestaña que
            // usan el clic de la tarjeta y el 👁️.
            lines.push(_tabHref(TAB_OF_STATUS[campaign.status] || 'campaigns'));
            return lines.join('\n');
        }

        // navigator.clipboard puede no estar: hace falta contexto seguro y que la
        // Permissions-Policy del sitio no lo bloquee. El respaldo con textarea +
        // execCommand esta obsoleto pero sigue funcionando en ese hueco, y aqui el clic
        // del usuario ya nos da el gesto que los dos exigen.
        function _copyToClipboard(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
            return new Promise((resolve, reject) => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.setAttribute('readonly', '');
                    Object.assign(ta.style, { position: 'fixed', top: '-1000px', opacity: '0' });
                    document.body.appendChild(ta);
                    ta.select();
                    const ok = document.execCommand('copy');
                    document.body.removeChild(ta);
                    ok ? resolve() : reject(new Error('execCommand copy failed'));
                } catch (e) { reject(e); }
            });
        }

        // Se copia TEXTO y no una imagen de la tarjeta. Se intento con html2canvas y no
        // puede ser: las imagenes de las recompensas vienen de otro origen
        // (ext.cdn.kick.com), asi que el lienzo queda contaminado y toDataURL lanza
        // SecurityError. Y el texto es mejor de todas formas: se busca, se cita y el
        // enlace se pulsa.
        function _createShareButton(campaign) {
            const btn = document.createElement("span");
            btn.className = "drop-share-btn";
            btn.textContent = "🔗";
            btn.title = t.shareCopy || i18n.en.shareCopy;
            Object.assign(btn.style, {
                cursor: "pointer", fontSize: "13px", userSelect: "none",
                lineHeight: "1", transition: "opacity 0.15s"
            });
            btn.onmouseenter = () => { btn.style.opacity = "0.6"; };
            btn.onmouseleave = () => { btn.style.opacity = "1"; };
            btn.onclick = (e) => {
                // La tarjeta entera lleva su propio onclick (hacer scroll hasta la
                // campaña, o ir a la pestaña donde vive). Compartir no es eso.
                e.stopPropagation();
                e.preventDefault();
                _copyToClipboard(_shareTextFor(campaign)).then(() => {
                    // La confirmacion va en el propio boton y no en un aviso aparte:
                    // copiar no deja rastro visible en ningun sitio, asi que sin esto no
                    // hay forma de saber si funciono.
                    btn.textContent = "✓";
                    btn.title = t.shareCopied || i18n.en.shareCopied;
                    setTimeout(() => {
                        btn.textContent = "🔗";
                        btn.title = t.shareCopy || i18n.en.shareCopy;
                    }, 1500);
                }).catch((err) => {
                    console.warn('[Kick Drops] no se pudo copiar:', err);
                    btn.textContent = "✕";
                    setTimeout(() => { btn.textContent = "🔗"; }, 1500);
                });
            };
            return btn;
        }

        function renderCampaignCard(campaign, accent) {
            // `accent` may be a color string; for backward-compat a boolean means active(true)/expired(false)
            const accentColor = typeof accent === "string"
                ? accent
                : (accent ? colors.primary : colors.red);
            const card = document.createElement("div");
            Object.assign(card.style, {
                backgroundColor: colors.bg, border: `1px solid ${accentColor}`,
                borderRadius: "8px", padding: "10px", marginBottom: "8px", cursor: "pointer",
                transition: "all 0.15s"
            });
            card.onmouseenter = () => { card.style.boxShadow = `0 0 12px ${accentColor}40`; };
            card.onmouseleave = () => { card.style.boxShadow = "none"; };

            // Data attributes for notification bell removal
            if (campaign.title) card.setAttribute("data-notif-title", campaign.title);
            if (campaign.id) card.setAttribute("data-notif-id", campaign.id);

            // Header with image and name
            const cardHeader = document.createElement("div");
            cardHeader.style.display = "flex";
            cardHeader.style.alignItems = "center";
            cardHeader.style.gap = "8px";
            cardHeader.style.marginBottom = "6px";

            if (campaign.imgSrc) {
                const img = document.createElement("img");
                img.src = campaign.imgSrc;
                img.style.width = "36px";
                img.style.height = "48px";
                img.style.borderRadius = "4px";
                img.style.objectFit = "cover";
                cardHeader.appendChild(img);
            }

            const titleInfo = document.createElement("div");
            const nameEl = document.createElement("div");
            nameEl.textContent = campaign.title || campaign.gameName || '';
            nameEl.style.fontWeight = "bold";
            nameEl.style.fontSize = "13px";
            titleInfo.appendChild(nameEl);

            if (campaign.studio) {
                const studioEl = document.createElement("div");
                studioEl.textContent = campaign.studio;
                studioEl.style.fontSize = "11px";
                studioEl.style.color = colors.gray;
                titleInfo.appendChild(studioEl);
            }

            if (campaign.dateRange) {
                const dateEl = document.createElement("div");
                dateEl.textContent = campaign.dateRange;
                dateEl.style.fontSize = "10px";
                dateEl.style.color = colors.gray;
                titleInfo.appendChild(dateEl);
            }

            cardHeader.appendChild(titleInfo);

            // Los iconos de la derecha, en su propio hueco. El marginLeft:auto pasa a
            // ser del contenedor y no de la campana: siendo dos sueltos, el segundo se
            // pega al primero y el bloque baila segun haya 🔔 o no.
            const cardActions = document.createElement("div");
            Object.assign(cardActions.style, {
                marginLeft: "auto", display: "flex", alignItems: "center",
                gap: "6px", flexShrink: "0"
            });

            // Changed indicator (bell icon)
            if (campaign.changed) {
                const bell = document.createElement("span");
                bell.className = "drop-bell-icon";
                bell.textContent = t.changedIcon || "🔔";
                bell.style.color = colors.orange;
                bell.style.fontSize = "14px";
                bell.style.fontWeight = "bold";
                cardActions.appendChild(bell);
            }

            // Compartir lo que todavia se puede conseguir: abiertas y proximas. Una
            // proxima es justo lo que interesa avisar con tiempo —el texto lleva la
            // fecha de apertura y lo que va a repartir—, y su enlace va a SU pestaña,
            // no a la de abiertas (ver _shareTextFor).
            //
            // Las cerradas no. Mandan a alguien a por algo que ya no puede conseguir, y
            // el texto ni lo diria: lleva fechas, no un "esto ya acabo". De paso se cae
            // un fallo real: _shareTextFor saca los tramos con _findEntryForTitle, que
            // casa por aproximacion contra el nombre del juego, asi que una campaña
            // cerrada de un juego que ademas tiene una abierta se llevaria los tramos DE
            // LA ABIERTA bajo el titulo de la cerrada.
            if (campaign.status === 'active' || campaign.status === 'upcoming') {
                cardActions.appendChild(_createShareButton(campaign));
            }

            // Puede quedar vacio: en Proximos y Cerrados no hay 🔗, y la 🔔 casi nunca
            // esta ahi. Un div vacio con marginLeft:auto no pinta nada, pero tampoco
            // tiene por que estar.
            if (cardActions.children.length > 0) cardHeader.appendChild(cardActions);

            card.appendChild(cardHeader);

            // Keywords matched chips
            if (campaign.matchedKeywords && campaign.matchedKeywords.length > 0) {
                const kwRow = document.createElement("div");
                kwRow.style.display = "flex";
                kwRow.style.flexWrap = "wrap";
                kwRow.style.gap = "3px";
                kwRow.style.marginBottom = "4px";
                campaign.matchedKeywords.forEach(kw => {
                    const chip = document.createElement("span");
                    chip.textContent = kw;
                    Object.assign(chip.style, {
                        padding: "1px 6px", backgroundColor: accentColor + "20",
                        color: accentColor,
                        border: `1px solid ${accentColor}40`,
                        borderRadius: "8px", fontSize: "10px"
                    });
                    kwRow.appendChild(chip);
                });
                card.appendChild(kwRow);
            }

            // Reward items (only for active drops) - from DOM or API fallback
            // if (isActive) {
            //     if (campaign.rewards && campaign.rewards.length > 0) {
            //         const rwRow = document.createElement("div");
            //         rwRow.style.display = "flex";
            //         rwRow.style.flexWrap = "wrap";
            //         rwRow.style.gap = "4px";
            //         rwRow.style.marginBottom = "4px";
            //         campaign.rewards.forEach(rw => {
            //             const rwChip = document.createElement("span");
            //             const time = rw.time.split(" ").slice(1).join(" ");
            //             rwChip.textContent = rw.name + (rw.time ? ` (${time})` : '');
            //             Object.assign(rwChip.style, {
            //                 padding: "1px 6px", backgroundColor: colors.surface,
            //                 color: colors.gray, border: `1px solid ${colors.border}`,
            //                 borderRadius: "6px", fontSize: "10px",
            //             });
            //             rwRow.appendChild(rwChip);
            //         });
            //         card.appendChild(rwRow);
            //     } else {
            //         // API fallback when DOM rewards are not available
            //         const apiDrops = _findDropNamesForTitle(campaign.title);
            //         if (apiDrops && apiDrops.length > 0) {
            //             _appendDropNamesTo(card, apiDrops);
            //         }
            //     }
            // }

            // Click to scroll to element on page
            card.onclick = () => {
                // Lo que se enfoca es LO QUE DICE LA TARJETA. Pulsar «KICK - 11 expired
                // drops» lleva al titulo del juego, y pulsar «Football Drop: Jungle
                // Jersey - KICK» lleva al de ESA sub-campaña, aunque las dos vivan en la
                // misma pagina y una este dentro de la otra.
                if (_focusCampaignOnPage(campaign)) return;
                // Y si no esta en esta pagina, vive en otra pestaña: se va alli y se
                // enfoca al llegar. El destino se guarda en GM_setValue y no en una
                // variable porque las pestañas de Kick RECARGAN la pagina: nada de esta
                // ejecucion sobrevive al clic (ver _focusPendingCampaign).
                _goToCampaignTab(campaign);
            };

            return card;
        }

        // =============================================
        // RENDER RESULTS IN PANEL
        // =============================================

        // ---------------------------------------------
        // LAS CAMPAÑAS QUE NO ESTAN DELANTE
        // ---------------------------------------------
        // El escaneo del DOM solo ve la pestaña abierta, y las de Kick recargan la
        // pagina, asi que no hay forma de tener las tres secciones leyendo la web. Lo
        // que falta se saca de la API, que las devuelve todas de una vez.
        //
        // Se dedupla contra lo ya escaneado por TITULO: la campaña que si esta
        // delante se queda con su tarjeta del DOM, que es mejor —lleva imagen, el
        // rango de fechas tal y como lo escribe Kick, y sabe hacer scroll hasta ella—.
        // De la API vienen solo las que no tienen tarjeta propia.
        function _apiDateRange(drops) {
            let min = Infinity, max = -Infinity;
            for (const d of (drops || [])) {
                const s = Date.parse(d.starts_at || '');
                const e = Date.parse(d.ends_at || '');
                if (Number.isFinite(s)) min = Math.min(min, s);
                if (Number.isFinite(e)) max = Math.max(max, e);
            }
            const fmt = (ms) => new Date(ms).toLocaleDateString(lang, {
                day: 'numeric', month: 'short', year: 'numeric'
            });
            if (min === Infinity && max === -Infinity) return '';
            if (min === Infinity) return fmt(max);
            if (max === -Infinity) return fmt(min);
            return `${fmt(min)} - ${fmt(max)}`;
        }

        function _apiItemsFor(status, seen, seenSubNames) {
            if (!_apiDataReady) return [];
            const notifs = getNotifications();
            const out = [];
            for (const [key, entry] of Object.entries(_apiDropNames)) {
                if (!entry || entry.status !== status) continue;
                if (!entry.drops || entry.drops.length === 0) continue;
                const title = entry.displayTitle || key;
                if (seen.has(title.toLowerCase())) continue;
                // Segunda clave, para las campañas que el titulo no puede cruzar: si
                // esta entrada ES la unica sub-campaña de un grupo que YA esta delante
                // como tarjeta del DOM, no vuelve a entrar. Es identidad y no parecido
                // —el nombre completo de la campaña, tal cual, en las dos fuentes— asi
                // que no afloja la comparacion exacta de titulos: le añade otra
                // igualdad. Que el conjunto traiga solo los grupos de una sola
                // sub-campaña se decide al componerlo, en renderResults, que es donde
                // esta explicado el porque.
                if (seenSubNames && seenSubNames.size &&
                    (entry.drops || []).some(d => seenSubNames.has(_collapse(d.campaignName).toLowerCase()))) continue;
                // Y una CERRADA que ya reclamaste tampoco entra, porque la pagina no
                // la tiene en cerradas: la tiene en Reclamados. Verificado el 2026-08-20
                // con los dos volcados del mismo rato —Rust con sus doce sub-campañas en
                // /drops/claimed, y /drops/expired con solo KICK y Old School RuneScape—.
                // Meterla aqui era inventar una seccion: una tarjeta que la pagina no
                // lista, que no se puede marcar porque no tiene fila, y a la que el clic
                // no lleva a ningun sitio.
                //
                // Kick lo dice en el propio texto de esa pestaña: «Rewards you fully
                // unlocked before they closed are still claimable». O sea que lo que
                // sigue en cerradas es lo que aun te debe algo, y lo que ya cobraste se
                // muda. Por eso la condicion es que conste reclamado TODO: con una sola
                // recompensa sin reclamar la campaña se queda en cerradas —es el caso de
                // ED'S DROP— y su tarjeta vale.
                //
                // Solo con el inventario cargado. Sin /drops/progress no se puede juzgar,
                // y lo que no se puede juzgar NO se esconde: es la misma regla que los
                // filtros de vista, y aqui evita que el panel se vacie durante el
                // arranque, cuando todavia no consta nada como reclamado.
                //
                // Y solo en cerradas. Una abierta con todo reclamado sigue abierta y la
                // pagina la sigue listando, asi que esconderla seria perder una fila que
                // si esta delante.
                if (status === 'expired' && _progressInventoryReady &&
                    entry.drops.every(d => _isDropClaimed(d) === true)) continue;
                const n = notifs.find(x => x.title === title);
                out.push({
                    title, studio: '', id: '', key: title + '|api', status,
                    // La campana sale igual que en una tarjeta escaneada: el cambio
                    // no depende de en que pestaña estes.
                    changed: !!(n && !n.seen && n.changed),
                    idx: -1, imgSrc: entry.imgSrc || '', dateRange: _apiDateRange(entry.drops),
                    // Sobre el texto con el que SE FILTRO, no sobre el titulo (ver el
                    // comentario de `searchText` en fetchDropsFromAPI). Se cae al titulo
                    // solo por si alguna entrada vieja no lo trae.
                    matchedKeywords: _matchedPositiveKeywords(entry.searchText || title.toLowerCase()),
                    rewards: [], element: null,
                    // Marca que esta tarjeta no tiene nodo en esta pagina: al pulsarla
                    // se va a la pestaña donde vive, en vez de intentar un scroll a
                    // algo que no existe.
                    fromApi: true
                });
            }
            return out;
        }

        function renderResults(resultsContainer, activeItems, upcomingItems, expiredItems) {
            // Lo escaneado manda y la API completa. Se hace aqui —y no al escanear—
            // porque las dos fuentes llegan por su cuenta: repintar por cualquiera de
            // las dos vuelve a pasar por este punto y el panel queda coherente.
            //
            // La deduplicacion es CONTRA LAS TRES SECCIONES, no contra la propia: si una
            // campaña esta delante, la API no vuelve a meterla por otra solapa. Mirando
            // solo su seccion, un juego que la pagina lista como abierto y la API tiene
            // por cerrado salia en las dos a la vez.
            const scanned = new Set(
                [].concat(activeItems || [], upcomingItems || [], expiredItems || [])
                    .map(i => String(i.title || '').toLowerCase())
            );
            // Y contra las sub-campañas de esas mismas tarjetas, que es lo unico que
            // cruza cuando la campaña de la API no trae `category`: su clave es el
            // nombre de la campaña y la fila enseña el del juego, asi que por titulo
            // no se reconocen (ver _subCampaignNamesOf). Tambien contra las tres
            // secciones, y por el mismo motivo que el conjunto de arriba.
            //
            // Y SOLO de los grupos con UNA sub-campaña. Ahi la entrada de la API es
            // la misma campaña que la tarjeta del DOM, nada mas: es el duplicado que
            // se vio el 2026-08-20 —«KICK / 1 expired drop» al lado de «ED'S DROP -
            // KICK», la misma cosa dos veces— y la del DOM es mejor, que lleva imagen,
            // la fecha tal y como la escribe Kick y sabe hacer scroll hasta ella.
            //
            // Cuando el grupo tiene VARIAS, la entrada de la API no es un duplicado
            // sino una vista mas fina: el grupo agrupa por juego y esa tarjeta es una
            // sub-campaña concreta, con su ventana y sus recompensas, y al pulsarla
            // enfoca SU titulo y no el del juego. Esas se quedan.
            const scannedSubNames = new Set(
                [].concat(activeItems || [], upcomingItems || [], expiredItems || [])
                    .filter(i => (i.subNames || []).length === 1)
                    .reduce((acc, i) => acc.concat(i.subNames), [])
                    .map(n => String(n).toLowerCase())
            );
            activeItems = (activeItems || []).concat(_apiItemsFor('active', scanned, scannedSubNames));
            upcomingItems = (upcomingItems || []).concat(_apiItemsFor('upcoming', scanned, scannedSubNames));
            expiredItems = (expiredItems || []).concat(_apiItemsFor('expired', scanned, scannedSubNames));
            // Render into separate panes (Active tab / Upcoming tab / Expired tab)
            const activePane = document.getElementById("kick-drops-active-pane");
            const upcomingPane = document.getElementById("kick-drops-upcoming-pane");
            const expiredPane = document.getElementById("kick-drops-expired-pane");
            const tabActive = document.getElementById("kick-drops-tab-active");
            const tabUpcoming = document.getElementById("kick-drops-tab-upcoming");
            const tabExpired = document.getElementById("kick-drops-tab-expired");

            const totalActive = activeItems.length;
            const totalUpcoming = upcomingItems.length;
            const totalExpired = expiredItems.length;

            // Los filtros de vista solo recortan Activos.
            const shownActive = _applyViewFilters(activeItems);

            // Update tab labels with counts. Cuando un filtro esconde algo se dice
            // "(3/12)": un contador a secas convertiria un filtro que se quedo
            // encendido de la sesion anterior en "hoy no hay nada".
            if (tabActive) {
                tabActive.textContent = shownActive.length === totalActive
                    ? `${t.dropsActive} (${totalActive})`
                    : `${t.dropsActive} (${shownActive.length}/${totalActive})`;
            }
            if (tabUpcoming) tabUpcoming.textContent = `${t.dropsUpcoming} (${totalUpcoming})`;
            if (tabExpired) tabExpired.textContent = `${t.dropsExpired} (${totalExpired})`;

            const fillPane = (pane, items, accent, hiddenByFilter) => {
                if (!pane) return;
                pane.innerHTML = "";
                if (items.length === 0) {
                    // "No hay" y "lo escondiste tu" son cosas distintas y el mensaje
                    // lo dice, con la salida a mano.
                    const msg = document.createElement("div");
                    msg.textContent = hiddenByFilter
                        ? "\u2699 " + (t.noResultsFiltered || "Nothing matches the active filters.")
                        : "\u2713 " + t.noResults;
                    msg.style.color = colors.gray;
                    msg.style.fontSize = "12px";
                    msg.style.padding = "12px 0 4px";
                    msg.style.textAlign = "center";
                    pane.appendChild(msg);
                    if (hiddenByFilter) {
                        const clear = document.createElement("div");
                        clear.textContent = t.clearFilters || "Clear filters";
                        Object.assign(clear.style, {
                            color: colors.primary, cursor: "pointer", fontSize: "11px",
                            textAlign: "center", textDecoration: "underline",
                            paddingBottom: "12px"
                        });
                        clear.onclick = clearViewFilters;
                        pane.appendChild(clear);
                    }
                } else {
                    items.forEach(c => {
                        pane.appendChild(renderCampaignCard(c, accent));
                    });
                }
            };

            // El orden elegido, y solo en Activos: en Proximos no hay nada que se
            // acabe ni que te falte, y en Cerrados ya se acabo.
            const sortedActive = _sortActive(shownActive);

            fillPane(activePane, sortedActive, colors.primary, totalActive > 0 && shownActive.length === 0);
            fillPane(upcomingPane, upcomingItems, colors.upcoming, false);
            fillPane(expiredPane, expiredItems, colors.red, false);
        }

        // =============================================
        // NOTIFICATIONS TAB (inside panel)
        // =============================================

        function removeBellFromCard(notifTitle, notifId) {
            ["kick-drops-active-pane", "kick-drops-upcoming-pane", "kick-drops-expired-pane"].forEach(paneId => {
                const pane = document.getElementById(paneId);
                if (pane) {
                    pane.querySelectorAll("[data-notif-title]").forEach(card => {
                        const cardTitle = card.getAttribute("data-notif-title") || "";
                        const cardId = card.getAttribute("data-notif-id") || "";
                        if ((notifTitle && cardTitle === notifTitle) || (notifId && cardId === notifId)) {
                            const bell = card.querySelector(".drop-bell-icon");
                            if (bell) bell.remove();
                        }
                    });
                }
            });
            // El mismo 🔔 puesto sobre la tarjeta de la pagina: marcarla como vista
            // lo quita de los dos sitios, no solo del panel.
            document.querySelectorAll(".drop-page-bell").forEach(bell => {
                const bellTitle = bell.getAttribute("data-notif-title") || "";
                const bellId = bell.getAttribute("data-notif-id") || "";
                if ((notifTitle && bellTitle === notifTitle) || (notifId && bellId === notifId)) {
                    bell.remove();
                }
            });
        }

        function removeAllBellsFromCards() {
            ["kick-drops-active-pane", "kick-drops-upcoming-pane", "kick-drops-expired-pane"].forEach(paneId => {
                const pane = document.getElementById(paneId);
                if (pane) {
                    pane.querySelectorAll(".drop-bell-icon").forEach(bell => bell.remove());
                }
            });
            document.querySelectorAll(".drop-page-bell").forEach(bell => bell.remove());
        }

        function renderNotificationsTab() {
            const notifsPane = document.getElementById("kick-drops-notifs-pane");
            if (!notifsPane) return;
            notifsPane.innerHTML = "";

            const notifs = getNotifications();
            const pending = notifs.filter(n => !n.seen && n.changed);
            // La racha del dia es una alerta mas de esta pestaña (ver _dailyReminderRow),
            // asi que entra en la cuenta y en el «no hay nada». La cuenta sale de
            // _alertCount para que la solapa diga lo mismo desde los dos sitios que la
            // escriben.
            const racha = _dailyReminderState();
            const alertas = _alertCount();

            // Update tab label with count
            const tabNotifs = document.getElementById("kick-drops-tab-notifs");
            if (tabNotifs) {
                tabNotifs.textContent = `${t.changedIcon || "🔔"} (${alertas})`;
                if (alertas > 0) {
                    tabNotifs.style.color = colors.orange;
                }
            }

            if (alertas === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.textContent = "\u2713 " + (t.noResults || "No notifications");
                emptyMsg.style.color = colors.gray;
                emptyMsg.style.fontSize = "12px";
                emptyMsg.style.textAlign = "center";
                emptyMsg.style.padding = "12px 0";
                notifsPane.appendChild(emptyMsg);
                updateNotificationTitleAndSound();
                return;
            }

            // La racha va primera: es lo unico de esta pestaña que caduca hoy.
            if (racha) notifsPane.appendChild(_dailyReminderRow(racha));

            // Y si la racha era la unica alerta, aqui se acaba: el boton de «marcar todas
            // como vistas» y las filas de campaña son de las notificaciones, y la racha no
            // se marca como vista —se calla con su ×— asi que ese boton no tendria nada
            // que hacer.
            if (!pending.length) {
                updateNotificationTitleAndSound();
                return;
            }

            // Mark all as viewed button
            const markAllRow = document.createElement("div");
            Object.assign(markAllRow.style, {
                display: "flex", justifyContent: "flex-end", marginBottom: "8px"
            });
            const markAllBtn = document.createElement("button");
            markAllBtn.textContent = t.markAllAsViewed;
            Object.assign(markAllBtn.style, {
                backgroundColor: colors.surface, border: `1px solid ${colors.primary}`,
                color: colors.text, padding: "4px 8px", borderRadius: "4px",
                cursor: "pointer", fontSize: "11px"
            });
            markAllBtn.onclick = () => {
                markAllNotificationsSeen();
                removeAllBellsFromCards();
                renderNotificationsTab();
            };
            markAllRow.appendChild(markAllBtn);
            notifsPane.appendChild(markAllRow);

            // Notification rows
            pending.sort((a, b) => a.title.localeCompare(b.title)).forEach(n => {
                const row = document.createElement("div");
                Object.assign(row.style, {
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "6px 8px", marginBottom: "4px",
                    backgroundColor: colors.bg, borderRadius: "6px",
                    border: `1px solid ${colors.border}`
                });

                const titleDiv = document.createElement("div");
                titleDiv.textContent = n.title;
                titleDiv.style.flex = "1";
                titleDiv.style.fontSize = "12px";
                titleDiv.style.overflow = "hidden";
                titleDiv.style.textOverflow = "ellipsis";
                titleDiv.style.whiteSpace = "nowrap";
                row.appendChild(titleDiv);

                const viewBtn = document.createElement("button");
                viewBtn.textContent = t.viewIcon || "👁️";
                viewBtn.title = t.viewed;
                Object.assign(viewBtn.style, {
                    backgroundColor: colors.surface, border: `1px solid ${colors.primary}`,
                    color: colors.text, padding: "4px 8px", borderRadius: "4px",
                    cursor: "pointer", fontSize: "11px", flexShrink: "0"
                });
                viewBtn.onclick = () => {
                    const notifTitle = n.title;
                    const notifId = (n.key && n.key.includes("|")) ? n.key.split("|")[1] : (n.id || "");
                    markNotificationSeen(n.key || n.title);
                    removeBellFromCard(notifTitle, notifId);

                    // Si el drop no esta en la pestaña que miras, se va a la SUYA —no
                    // siempre a campañas: una campaña cerrada vive en /drops/expired— y se
                    // enfoca al llegar, cruzando la recarga por GM_setValue igual que el
                    // clic en la tarjeta (ver _goToCampaignTab).
                    const notifStatus = n.status || 'active';
                    const notifKind = TAB_OF_STATUS[notifStatus] || 'campaigns';
                    if (_kindOfPath() !== notifKind) {
                        const link = _tabLink(notifKind);
                        if (link) {
                            _setFocusTarget({ title: notifTitle, status: notifStatus });
                            link.click();
                        } else {
                            // Fallback: navigate directly
                            location.href = _campaignsHref();
                        }
                    } else {
                        // Scroll the page to the actual campaign header on /drops/campaigns
                        let pageScrolled = false;
                        if (notifId) {
                            const target = document.getElementById(notifId);
                            if (target) {
                                scrollToCampaignElement(target);
                                pageScrolled = true;
                            }
                        }
                        // Also scroll the floating panel to the matching card
                        // (skip if page scroll succeeded and there's no separate panel card,
                        // to avoid fighting the page scroll)
                        if (!pageScrolled) {
                            const panes = ["kick-drops-active-pane", "kick-drops-expired-pane"];
                            for (const paneId of panes) {
                                const pane = document.getElementById(paneId);
                                if (!pane) continue;
                                const cards = pane.querySelectorAll("[data-notif-id], [data-notif-title]");
                                let matched = false;
                                for (const card of cards) {
                                    if ((notifId && card.getAttribute("data-notif-id") === notifId) ||
                                        (notifTitle && card.getAttribute("data-notif-title") === notifTitle)) {
                                        card.scrollIntoView({ behavior: "smooth", block: "center" });
                                        matched = true;
                                        break;
                                    }
                                }
                                if (matched) break;
                            }
                        }
                    }

                    // Re-render this tab
                    renderNotificationsTab();
                };
                row.appendChild(viewBtn);
                notifsPane.appendChild(row);
            });

            updateNotificationTitleAndSound();

            // Auto-switch to notifications tab when there are pending notifications
            if (pending.length > 0) {
                const tabActiveBtn = document.getElementById("kick-drops-tab-active");
                const tabUpcomingBtn = document.getElementById("kick-drops-tab-upcoming");
                const tabExpiredBtn = document.getElementById("kick-drops-tab-expired");
                const activeP = document.getElementById("kick-drops-active-pane");
                const upcomingP = document.getElementById("kick-drops-upcoming-pane");
                const expiredP = document.getElementById("kick-drops-expired-pane");
                if (tabActiveBtn && tabExpiredBtn && tabNotifs && activeP && expiredP && notifsPane) {
                    [tabActiveBtn, tabUpcomingBtn, tabExpiredBtn, tabNotifs].forEach(btn => {
                        if (!btn) return;
                        btn.style.borderBottom = `2px solid transparent`;
                        btn.style.color = colors.gray;
                    });
                    tabNotifs.style.borderBottom = `2px solid ${colors.primary}`;
                    tabNotifs.style.color = colors.primaryLight;
                    activeP.style.display = "none";
                    if (upcomingP) upcomingP.style.display = "none";
                    expiredP.style.display = "none";
                    notifsPane.style.display = "block";
                }
            }
        }

        // =============================================
        // LOGICA CENTRAL (CORE)
        // =============================================

        let active = [];
        let upcoming = [];
        let expired = [];
        let seenTitles = new Set();
        let idx = 0;
        let reseted = false;

        // Los campos que entran en el snapshot son los que definen "la campaña
        // cambio". Se proyectan de forma explicita en vez de serializar el drop
        // entero: los objetos de _apiDropNames llevan ademas identidad (rewardId) y,
        // sobre todo, NO puede entrar aqui nada que dependa del usuario. Si el
        // estado de reclamado formara parte del snapshot, reclamar un drop marcaria
        // su campaña como cambiada y levantaria un 🔔 falso cada vez.
        function _snapshotFieldsOf(drop) {
            return {
                name: drop.name || '',
                minutes: drop.minutes || 0,
                starts_at: drop.starts_at || '',
                ends_at: drop.ends_at || ''
            };
        }

        function buildDataSnapshot(displayTitle) {
            const entry = _findEntryForTitle(displayTitle);
            if (!entry || !entry.drops || entry.drops.length === 0) {
                return JSON.stringify({ title: displayTitle.toLowerCase() });
            }
            // Sort drops by name for consistent comparison
            const sortedDrops = [...entry.drops]
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(_snapshotFieldsOf);
            return JSON.stringify({ drops: sortedDrops });
        }

        /**
         * highlightAndLinkDrops()
         *
         * Main scanning function adapted for Kick.com DOM structure.
         *
         * Kick's campaign page uses:
         * - h1 elements containing "Campanas abiertas" / "Closed campaigns" etc. as section headers
         * - [data-orientation="vertical"] containers as accordion groups
         * - Accordion buttons with game name (.text-base.font-bold), studio, dates, and image
         * - Nested sub-campaigns inside each accordion
         * - Reward items as li elements with img, name span, and time span
         */
        function highlightAndLinkDrops() {
            // QUE secciones rehace este escaneo. En el DOM viejo las tres convivian en
            // /drops/all-campaigns y se rehacia todo de una vez. En el nuevo cada una
            // tiene su pestaña y el recorrido las visita de una en una: si el escaneo de
            // /coming-soon vaciara tambien las abiertas —sus tarjetas, sus ids y sus
            // marcas—, el panel se quedaria a medias en cuanto cambiaramos de pestaña.
            const rs = _routeStatus();
            const sections = rs === 'upcoming' ? ['upcoming']
                : rs === 'active' ? ['active', 'expired']
                : ['active', 'upcoming', 'expired'];
            const mine = (suffix) => sections.some(sec => suffix.endsWith('-' + sec));

            if (sections.includes('active')) active = [];
            if (sections.includes('upcoming')) upcoming = [];
            if (sections.includes('expired')) expired = [];
            seenTitles = new Set();
            reseted = false;
            idx = 0;
            // Clear previous drop-match IDs to allow re-scanning (needed when API data
            // arrives after first DOM scan). El id lleva la seccion en el sufijo
            // (drop-match-3-active), asi que sirve para no tocar las de otra pestaña
            // —que en el DOM nuevo siguen montadas, solo escondidas—.
            document.querySelectorAll('[id^="drop-match-"]').forEach(el => {
                if (mine(el.id)) el.removeAttribute('id');
            });
            // Las marcas de la pagina (⏳ y 🔔) se borran enteras y se vuelven a
            // poner: asi se van solas las de campañas que dejaron de correr prisa
            // —la reclamaste, o cruzo el umbral— sin llevar la cuenta de cual habia
            // en cada nodo. Se filtran por el mismo sufijo, que la marca guarda en
            // data-notif-id.
            document.querySelectorAll('.kick-drop-page-mark').forEach(el => {
                if (mine(el.getAttribute('data-notif-id') || '')) el.remove();
            });

            // STEP 1: Find all h1 section headers to determine open/upcoming/closed boundaries
            const allH1s = _dropsQuery('h1');

            let closedHeaderEl = null;
            let openHeaderEl = null;
            let upcomingHeaderEl = null;

            allH1s.forEach(h1 => {
                const text = h1.textContent.trim();
                if (CLOSED_HEADER_TEXTS.some(ct => text.toLowerCase() === ct.toLowerCase())) {
                    closedHeaderEl = h1;
                }
                if (OPEN_HEADER_TEXTS.some(ot => text.toLowerCase() === ot.toLowerCase())) {
                    openHeaderEl = h1;
                }
                if (UPCOMING_HEADER_TEXTS.some(ut => text.toLowerCase() === ut.toLowerCase())) {
                    upcomingHeaderEl = h1;
                }
            });

            // STEP 2a: DOM nuevo — grupos planos, un div por juego. Van primero y por
            // su propio selector en vez de caer al barrido generico del final: ese
            // barrido pasa por CADA `.bg-surface-base`, o sea tambien por las
            // tarjetas de sub-campaña, y aunque processCampaignNode las descarta, es
            // mejor no depender de ese descarte para no duplicar tarjetas del panel.
            const newGameGroups = _dropsQuery('.bg-surface-base.rounded-2xl')
                .filter(n => !_isInHiddenPanel(n));
            newGameGroups.forEach(group => {
                processCampaignNode(group, Infinity, Infinity);
            });

            // STEP 2b: Find all accordion containers (campaign groups)
            // Kick uses [data-orientation="vertical"] for accordion groups
            const accordionGroups = _dropsQuery('[data-orientation="vertical"]');

            // Determine section boundaries by Y position (DOM-walk is primary; these are fallbacks)
            const closedHeaderY = closedHeaderEl ? closedHeaderEl.getBoundingClientRect().top : Infinity;
            const upcomingHeaderY = upcomingHeaderEl ? upcomingHeaderEl.getBoundingClientRect().top : Infinity;

            accordionGroups.forEach((group, groupIndex) => {
                // Find accordion items (buttons with [data-state])
                const accordionButtons = group.querySelectorAll('button[data-state], [data-state="open"], [data-state="closed"]');

                // If no accordion buttons, try finding direct campaign containers
                if (accordionButtons.length === 0) {
                    // Try alternative: look for campaign containers inside group
                    const campaignDivs = group.querySelectorAll('.bg-surface-base, [class*="bg-surface"]');
                    campaignDivs.forEach(div => {
                        processCampaignNode(div, closedHeaderY, upcomingHeaderY);
                    });
                    return;
                }

                accordionButtons.forEach(btn => {
                    // The parent accordion item contains all campaign data
                    const accordionItem = btn.closest('[data-state]') || btn.parentElement;
                    if (!accordionItem) return;

                    processCampaignNode(accordionItem, closedHeaderY, upcomingHeaderY);
                });
            });

            // If no accordion groups found, try a flat scan approach.
            // No corre cuando el DOM nuevo ya dio grupos (STEP 2a): seria repetir el
            // mismo trabajo por un selector mas ancho. Y ahora pasa tambien por el
            // filtro de pestaña oculta, porque `[data-state]` casa con los <a> de las
            // propias pestañas y `.bg-surface-base` con las tarjetas de las que estan
            // escondidas.
            //
            // Este es el barrido que se llevaba la barra lateral por delante cuando la
            // pestaña estaba vacia: es el mas ancho de los tres y era el unico sin
            // acotar (ver _dropsRoot). Corre con los otros dos a cero, o sea justo
            // cuando no hay nada legitimo que encontrar.
            if (accordionGroups.length === 0 && newGameGroups.length === 0) {
                // Fallback: scan all elements that look like campaign containers
                const fallbackNodes = _dropsQuery('[data-state], .bg-surface-base');
                fallbackNodes.forEach(node => {
                    if (_isInHiddenPanel(node)) return;
                    processCampaignNode(node, closedHeaderY, upcomingHeaderY);
                });
            }

            // Render results in the floating panel
            const resultsContainer = document.getElementById("kick-drops-results");
            if (resultsContainer) {
                renderResults(resultsContainer, active, upcoming, expired);
            }

            // Show notification popup
            renderNotificationsTab();

            // Si vienes de pulsar una tarjeta que vivia en otra pestaña, aqui es donde se
            // cobra: los nodos de esta pagina ya estan identificados y se puede buscar el
            // destino. Va despues de renderResults a proposito, para que el panel ya este
            // pintado cuando la pagina se mueva.
            _focusPendingCampaign(active.concat(upcoming, expired));
        }

        /**
         * processCampaignNode()
         *
         * Extract campaign data from a single accordion item / campaign node.
         * Adapted for Kick.com's HTML structure.
         */
        function processCampaignNode(node, closedHeaderY, upcomingHeaderY) {
            if (!(node instanceof HTMLElement)) return;
            if (node.id && node.id.startsWith('drop-match-')) return;
            // Nada que viva fuera del area de drops, venga por donde venga. Los que
            // llaman ya preguntan acotado, asi que esto es un cierre y no el filtro:
            // aqui pasan TODOS los nodos que se marcan, y es la unica linea que no hay
            // que acordarse de repetir al añadir un selector nuevo (ver _dropsRoot).
            if (!_inDropsRoot(node)) return;
            // Nada de las pestañas que Kick deja montadas y escondidas: son campañas
            // de OTRA seccion (ver _isInHiddenPanel).
            if (_isInHiddenPanel(node)) return;
            // Y nada de la pestaña de reclamados. Ahi no hay campañas que clasificar
            // —todo lo que se ve es lo ya conseguido— pero SI hay tarjetas con la
            // misma forma que las de campañas. Si el escaneo llega hasta aqui es
            // porque el salto a la pestaña de campañas no se completo: la navegacion
            // de la SPA puede tardar mas que los 2 s que espera _startDropsPolling.
            // Sin este corte, esas campañas ya cerradas se pintan de verde como
            // ABIERTAS y encima levantan la alarma de "campaña nueva".
            if (_isClaimedPage()) return;

            // Kick anida las sub-campañas dentro del bloque del juego. Se pinta UNA
            // tarjeta por juego y las sub-campañas salen como badges de la API, asi
            // que hay que saltarse el nodo de la sub-campaña; si no, se duplica como
            // tarjeta propia (p. ej. "Kick + Rust Wallpaper Pack" al lado de "Rust -
            // Facepunch Studios", que casan las dos con la keyword "rust").
            //
            // Son dos formas distintas del mismo nodo:
            //   DOM nuevo: la tarjeta .border-outline-decorative.
            //   DOM viejo: el titulo era un <div class="break-words text-base font-bold">.
            if (_isNewCampaignCard(node)) return;

            let titleText = '';
            let studioText = '';
            let dateRange = '';
            let imgSrc = '';

            const gameNameEl = _gameNameElOf(node);
            if (gameNameEl) {
                titleText = gameNameEl.textContent.trim();
            }
            if (gameNameEl && gameNameEl.tagName === 'DIV' && gameNameEl.classList.contains('break-words')) {
                return;
            }

            studioText = _studioTextOf(node, gameNameEl);
            dateRange = _dateRangeOf(node);

            // Category image: img with h-[67px] w-[50px] rounded, or first img in button
            const imgEl = node.querySelector('img.rounded, img[class*="h-[67px]"], img[class*="w-[50px]"]') ||
                node.querySelector('button img') ||
                node.querySelector('img');
            if (imgEl) {
                imgSrc = imgEl.src;
            }

            // If no title found, try generic approach
            if (!titleText) {
                const boldEls = node.querySelectorAll('span[class*="font-bold"], div[class*="font-bold"], p[class*="font-bold"]');
                if (boldEls.length > 0) {
                    titleText = boldEls[0].textContent.trim();
                }
            }

            if (!titleText) return;

            // Combine title + studio for keyword matching
            const searchText = (titleText + " " + studioText).toLowerCase();
            // Si el texto de la fila no encuentra ninguna positiva, todavia puede casar
            // por algo que la fila no enseña —el nombre de la campaña—, y eso lo sabe la
            // API (ver _apiEntryForCard). Lo que NO admite segunda opinion es una
            // negativa sobre el texto de la fila: ahi se descarta aunque la entrada de la
            // API hubiera pasado el filtro, porque «no quiero esto» es una orden.
            let apiEntry = null;
            if (!_matchesKeywords(searchText)) {
                if (_hasNegativeKeyword(searchText)) return;
                apiEntry = _apiEntryForCard(titleText);
                if (!apiEntry) return;
            }

            // Display title includes studio when present
            const displayTitle = studioText ? titleText + " - " + studioText : titleText;

            // A que seccion pertenece la campaña ('active' | 'upcoming' | 'expired').
            //
            // En el DOM nuevo lo dice la RUTA, porque cada seccion es una pestaña con
            // pagina propia y ya no hay <h1> que separe nada dentro de la pagina:
            // /drops/campaigns son abiertas y /drops/coming-soon son proximas. Es una
            // señal mas firme que la que habia —no depende de acertar el texto del
            // encabezado en 16 idiomas— pero solo llega hasta donde llega la pestaña
            // que se este mirando.
            //
            // Se conserva debajo el recorrido de <h1> del DOM viejo, donde las tres
            // secciones convivian en /drops/all-campaigns, y se le deja ganar: si
            // algun dia vuelve a haber secciones dentro de una pagina, el encabezado
            // es mas preciso que la ruta.
            const routeStatus = _routeStatus();
            let status = routeStatus || 'active';
            const classifyByHeader = (text) => {
                const h = text.trim().toLowerCase();
                if (CLOSED_HEADER_TEXTS.some(ct => h === ct.toLowerCase())) return 'expired';
                if (UPCOMING_HEADER_TEXTS.some(ut => h === ut.toLowerCase())) return 'upcoming';
                if (OPEN_HEADER_TEXTS.some(ot => h === ot.toLowerCase())) return 'active';
                return null;
            };
            let walker = node.parentElement;
            while (walker) {
                // Check previous siblings for h1 headers
                let sibling = walker.previousElementSibling;
                while (sibling) {
                    const h1 = sibling.tagName === 'H1' ? sibling : sibling.querySelector('h1');
                    if (h1) {
                        const matched = classifyByHeader(h1.textContent);
                        if (matched) status = matched;
                        // Found the nearest h1, stop walking
                        walker = null;
                        break;
                    }
                    // Also check if the sibling itself contains the section header div
                    const sectionH1s = sibling.querySelectorAll ? sibling.querySelectorAll('h1') : [];
                    for (const sh of sectionH1s) {
                        const matched = classifyByHeader(sh.textContent);
                        if (matched) {
                            status = matched;
                            walker = null;
                            break;
                        }
                    }
                    if (walker === null) break;
                    sibling = sibling.previousElementSibling;
                }
                if (walker) walker = walker.parentElement;
            }
            // Fallback: Y-position approach if DOM walk didn't find a classifying h1.
            // Section order on the page is: open (top) -> upcoming -> closed (bottom).
            // Solo aplica al DOM viejo: se apoya en que las secciones esten apiladas en
            // una misma pagina, y en el nuevo la ruta ya dio la respuesta. Ademas
            // getBoundingClientRect() devuelve ceros dentro de una pestaña oculta, asi
            // que ahi el orden vertical no significa nada.
            if (!routeStatus && status === 'active') {
                const nodeY = node.getBoundingClientRect().top;
                if (closedHeaderY !== Infinity && nodeY >= closedHeaderY) {
                    status = 'expired';
                } else if (upcomingHeaderY !== Infinity && nodeY >= upcomingHeaderY) {
                    status = 'upcoming';
                }
            }

            const isExpired = status === 'expired';
            const isUpcoming = status === 'upcoming';

            if (isExpired && !reseted) {
                seenTitles = new Set();
                reseted = true;
            }

            // Use displayTitle as a dedup key (since we don't have indices like Twitch)
            const dedupKey = displayTitle + '_' + status;
            if (seenTitles.has(dedupKey)) return;
            seenTitles.add(dedupKey);

            const id = `drop-match-${idx++}-${status}`;

            node.id = id;
            // Apply highlight styles to the individual campaign node (not the parent container)
            // On Kick, each campaign is a div[data-state] inside a shared div[data-orientation="vertical"]
            // If node has .bg-surface-base inside, style that; otherwise style the node itself
            //
            // El grupo del DOM nuevo se resalta ENTERO y por eso se excluye de ese
            // rebusque: el grupo ya es `.bg-surface-base`, asi que buscar la clase
            // hacia dentro devolveria la primera tarjeta de sub-campaña y el borde
            // verde acabaria alrededor de una sola sub-campaña en vez del juego.
            const innerCard = _isNewGameGroup(node)
                ? node
                : (node.querySelector('.bg-surface-base') || node);
            const nodeStyle = isExpired ? EXPIRED_STYLE : (isUpcoming ? UPCOMING_STYLE : ACTIVE_STYLE);
            innerCard.setAttribute('style', (innerCard.getAttribute('style') || '') + ';' + nodeStyle);

            // Extract reward items from sub-campaigns (only for active drops)
            const rewards = [];
            if (!isExpired) {
                const rewardItems = node.querySelectorAll('li');
                rewardItems.forEach(li => {
                    const nameSpan = li.querySelector('span.text-sm.font-semibold, span[class*="font-semibold"]');
                    const timeSpan = li.querySelector('span.text-surface-onSurfaceSecondary, span[class*="onSurfaceSecondary"]');
                    const rwImg = li.querySelector('img');
                    if (nameSpan) {
                        rewards.push({
                            name: nameSpan.textContent.trim(),
                            time: timeSpan ? timeSpan.textContent.trim() : '',
                            imgSrc: rwImg ? rwImg.src : ''
                        });
                    }
                });
            }

            // Matched keywords. Cuando la fila entro por la API, las etiquetas salen del
            // texto con el que ESA entrada paso el filtro: sobre el texto de la fila no
            // saldria ninguna —«rage» no esta en «Slots & Casino - Stake.com»— y una
            // tarjeta sin etiqueta es una tarjeta que no explica por que esta ahi. Es el
            // mismo criterio que ya usan las tarjetas que vienen solo de la API.
            const matchedKeywords = _matchedPositiveKeywords(
                apiEntry ? (apiEntry.searchText || searchText) : searchText);

            // Update/create notification (using API data instead of HTML snapshots).
            // Only ACTIVE campaigns may notify. Upcoming campaigns must never raise an alert
            // until they actually go live; if one carries a stale notification (e.g. it was
            // previously misclassified as open, or it transitioned active -> upcoming), drop it.
            let changedFlag = false;
            const computedKey = displayTitle + '|' + id;
            if (isUpcoming) {
                const notifs = getNotifications();
                const filtered = notifs.filter(n => n.title !== displayTitle && !(n.key && n.key.split('|')[0] === displayTitle));
                if (filtered.length !== notifs.length) saveNotifications(filtered);
            }
            if (status === 'active') {
                const notifs = getNotifications();
                let existingNotif = notifs.find((n) => n.key === computedKey) || notifs.find((n) => n.title === displayTitle);
                if (_apiDataReady) {
                    // Si la campaña ya no tiene drops activos en la API (expiró), no notificar cambio
                    const entry = _findEntryForTitle(displayTitle);
                    if (!entry || !entry.drops || entry.drops.length === 0) {
                        if (existingNotif) changedFlag = !existingNotif.seen && existingNotif.changed;
                    } else {
                    const dataSnapshot = buildDataSnapshot(displayTitle);
                    if (existingNotif) {
                        // Siempre actualizar key/id por si cambio el orden del DOM
                        const keyChanged = existingNotif.key !== computedKey;
                        existingNotif.id = id;
                        existingNotif.key = computedKey;
                        if (existingNotif.dataSnapshot !== dataSnapshot) {
                            existingNotif.changed = true;
                            existingNotif.seen = false;
                            existingNotif.dataSnapshot = dataSnapshot;
                            existingNotif.updatedAt = Date.now();
                            changedFlag = true;
                            saveNotifications(notifs);
                        } else {
                            if (keyChanged) saveNotifications(notifs);
                            changedFlag = !existingNotif.seen && existingNotif.changed;
                        }
                    } else {
                        const newN = {
                            id: id, title: displayTitle, key: computedKey,
                            status: status,
                            dataSnapshot: dataSnapshot,
                            seen: false, changed: true,
                            createdAt: Date.now(), updatedAt: Date.now()
                        };
                        notifs.push(newN);
                        saveNotifications(notifs);
                        changedFlag = true;
                    }
                    }
                } else if (existingNotif) {
                    changedFlag = !existingNotif.seen && existingNotif.changed;
                } else {
                    // No API data y no existia snapshot previo → drop nuevo detectado
                    const newN = {
                        id: id, title: displayTitle, key: computedKey,
                        status: status,
                        dataSnapshot: '',
                        seen: false, changed: true,
                        createdAt: Date.now(), updatedAt: Date.now()
                    };
                    notifs.push(newN);
                    saveNotifications(notifs);
                    changedFlag = true;
                }
            }

            // Marcas sobre la propia tarjeta de Kick, para que la prisa y el cambio
            // se vean haciendo scroll y no solo dentro del panel. Van como HERMANAS
            // del titulo y nunca dentro: el titulo se relee con textContent en cada
            // pasada, asi que un hijo acabaria colandose en el texto que se compara
            // con las keywords y en el nombre de la campaña. Se insertan en orden
            // inverso al que se leen, porque cada una entra pegada al titulo y
            // empuja a la anterior.
            if (gameNameEl && gameNameEl.parentElement) {
                const pageMark = (text, color, tooltip, extraClass) => {
                    const el = document.createElement('span');
                    el.className = 'kick-drop-page-mark' + (extraClass ? ' ' + extraClass : '');
                    el.textContent = text;
                    if (tooltip) el.title = tooltip;
                    // Los mismos atributos que la tarjeta del panel: es lo que
                    // permite que "marcar como vista" quite el 🔔 de los dos sitios.
                    el.setAttribute('data-notif-title', displayTitle);
                    el.setAttribute('data-notif-id', id);
                    Object.assign(el.style, {
                        marginLeft: '8px', fontSize: '12px', fontWeight: '700',
                        color: color, whiteSpace: 'nowrap'
                    });
                    gameNameEl.insertAdjacentElement('afterend', el);
                };
                if (changedFlag) {
                    pageMark(t.changedIcon || '🔔', colors.orange, t.changes_detected || '', 'drop-page-bell');
                }
                if (status === 'active') {
                    const drops = _findDropNamesForTitle(displayTitle);
                    const urgency = _computeUrgency(drops);
                    if (urgency) {
                        // Cuando corre prisa, las dos cosas van juntas en la misma
                        // marca: el cierre sin el coste no dice si merece la pena
                        // empezar.
                        let txt = `⏳ ${_formatCountdown(urgency.minutesLeft)}`;
                        if (urgency.needed !== null) {
                            txt += ` · ${t.urgentNeed || 'you still need'} ${formatHoursMinutes(urgency.needed)}`;
                        }
                        pageMark(txt, _urgencyColor(urgency), _urgencyText(urgency));
                    } else {
                        // Y cuando no corre prisa, el coste solo, en gris: el reloj
                        // de arena es del aviso de cierre y aqui no hay cierre que
                        // avisar. El 0 se calla porque ya lo dice el 🎁 del panel:
                        // ahi no falta tiempo, falta un clic.
                        const rest = _remainingMinutes(drops, 'max');
                        if (rest !== null && rest > 0) {
                            pageMark(`⏱ ${formatHoursMinutes(rest)}`, colors.gray,
                                t.remainingToFinish || 'what you still need to get everything here');
                        }
                    }
                }
            }

            const item = {
                title: displayTitle, studio: studioText, id, changed: changedFlag,
                key: computedKey, status,
                idx, imgSrc, dateRange, matchedKeywords, rewards,
                // Con que reconocerse en la API cuando el titulo no basta
                // (ver _subCampaignNamesOf y la deduplicacion de renderResults).
                subNames: _subCampaignNamesOf(node),
                element: node
            };
            (isExpired ? expired : (isUpcoming ? upcoming : active)).push(item);
        }

        // =============================================
        // CLAIMED INVENTORY SECTION (from intercepted API)
        // =============================================

        // Fetch claimed inventory — uses intercepted data if available, else GM_xmlhttpRequest with captured auth token
        function _fetchClaimedInventory(force = false) {
            // If interceptor already captured the data, just render.
            // `force` se salta este atajo: despues de reclamar, lo que tenemos guardado
            // dice justo lo contrario de lo que acaba de pasar (ver _scheduleProgressRefetch).
            // Basta con que el dato haya llegado: cero reclamados es una respuesta
            // valida, no un dato que falte (ver el corte de _renderClaimedInventory).
            // Exigiendo ademas que hubiera alguno, una cuenta sin nada cobrado repetia
            // la peticion en cada vuelta del reintento.
            if (!force && _claimedInventoryReady) {
                _renderClaimedInventory();
                return;
            }

            // Need auth token to fetch explicitly
            if (!_kickAuthToken) {
                console.warn('[Kick Drops] No auth token captured yet — cannot fetch claimed inventory');
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: KICK_DROPS_PROGRESS_URL,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': _kickAuthToken
                },
                onload: function (response) {
                    try {
                        if (response.status !== 200) {
                            console.warn('[Kick Drops] Non-200 status:', response.status, response.responseText?.substring(0, 200));
                            return;
                        }
                        const data = JSON.parse(response.responseText);
                        if (data?.data && Array.isArray(data.data)) {
                            _interceptedAllCampaigns = data.data;
                            _interceptedClaimedCampaigns = data.data.filter(c =>
                                c.rewards && c.rewards.some(r => r.claimed)
                            );
                            _claimedInventoryReady = true;
                            _progressInventoryReady = true;
                            // Los indices y el subrayado de los badges se rehacen en
                            // cualquier vista; la seccion de reclamados solo tiene
                            // donde insertarse en el inventario.
                            _onProgressData();
                            if (_isClaimedPage()) {
                                _renderClaimedInventory();
                            }
                        }
                    } catch (e) { console.warn('[Kick Drops] Error parsing claimed inventory:', e); }
                },
                onerror: function (e) { console.warn('[Kick Drops] Error fetching claimed inventory:', e); }
            });
        }

        // Asegura que la data de /drops/progress este cargada estando en la vista de
        // campañas, donde la propia pagina no la pide (solo la pide el inventario) y
        // sin ella no se puede saber que drops estan ya reclamados. El token lo captura
        // el interceptor de la primera peticion autenticada de Kick, que puede no haber
        // ocurrido todavia: por eso reintenta unas cuantas veces antes de rendirse. Si
        // nunca llega, no pasa nada visible — los badges se quedan sin marcas.
        function _ensureProgressData(attempt = 0) {
            if (_progressInventoryReady) { _onProgressData(); return; }
            if (_kickAuthToken) { _fetchClaimedInventory(); return; }
            if (attempt >= 5) return;
            setTimeout(() => _ensureProgressData(attempt + 1), 2000);
        }

        // Relative time helper (e.g., "hace 3 días", "el mes pasado")
        function _timeAgo(dateStr) {
            if (!dateStr) return '';
            try {
                const diff = Date.now() - new Date(dateStr).getTime();
                const seconds = Math.floor(diff / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                const months = Math.floor(days / 30);
                const years = Math.floor(days / 365);

                const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
                if (years > 0) return rtf.format(-years, 'year');
                if (months > 0) return rtf.format(-months, 'month');
                if (days > 0) return rtf.format(-days, 'day');
                if (hours > 0) return rtf.format(-hours, 'hour');
                if (minutes > 0) return rtf.format(-minutes, 'minute');
                return rtf.format(-seconds, 'second');
            } catch (e) { return dateStr; }
        }

        // La ✓ del pie de cada baldosa. Sale de la rejilla y se comparte con la
        // tarjeta del cofre diario, que la reusa en su estado "reclamado".
        function _checkmarkSvg() {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '20');
            svg.setAttribute('height', '20');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('class', 'text-surface-onSurfaceSecondary');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M19.707 8.207 10 17.914l-6.207-6.207 1.414-1.414L10 15.086l8.293-8.293 1.414 1.414Z');
            path.setAttribute('fill', 'currentColor');
            path.setAttribute('clip-rule', 'evenodd');
            path.setAttribute('fill-rule', 'evenodd');
            svg.appendChild(path);
            return svg;
        }

        // EL COFRE DIARIO COMO UNA BALDOSA MAS (2026-08-22)
        //
        // La recompensa diaria de Kick no es un drop y no sale en /drops: vive en el cofre
        // de la barra de arriba y en `/api/v1/gamification/challenges`. Asi que lo unico
        // que hablaba de ella era la fila de la pestaña 🔔, y ahi solo cabe una frase.
        // Aqui se le hace una tarjeta con la misma forma que las de la rejilla, para ver
        // de un vistazo lo que falta y —cuando ya se puede— cobrarla sin ir a buscar el
        // cofre de la barra.
        //
        // Va SOLO con la casilla de reclamados marcada, que es la misma que enciende la
        // reclamacion automatica: sin ella el script no reclama nada, asi que una tarjeta
        // que promete "se reclama solo" o que ofrece un boton de reclamar seria mentira.
        //
        // La imagen es el cofre de Kick incrustado como data: URI, y no un enlace a su
        // CDN a proposito: alli el cofre se sirve como <video> dentro de un boton y no
        // como imagen suelta, o sea que no hay URL estable que pedir, y una imagen que no
        // carga deja la tarjeta con un hueco negro. Va reducida a 288 px —la baldosa mide
        // 160— para no cargar el script con 40 KB por una miniatura.
        const DAILY_CHEST_IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QCARXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAASCgAwAEAAAAAQAAAOcAAAAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/CABEIAOcBIAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAADAgQBBQAGBwgJCgv/xADDEAABAwMCBAMEBgQHBgQIBnMBAgADEQQSIQUxEyIQBkFRMhRhcSMHgSCRQhWhUjOxJGIwFsFy0UOSNIII4VNAJWMXNfCTc6JQRLKD8SZUNmSUdMJg0oSjGHDiJ0U3ZbNVdaSVw4Xy00Z2gONHVma0CQoZGigpKjg5OkhJSldYWVpnaGlqd3h5eoaHiImKkJaXmJmaoKWmp6ipqrC1tre4ubrAxMXGx8jJytDU1dbX2Nna4OTl5ufo6erz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAECAAMEBQYHCAkKC//EAMMRAAICAQMDAwIDBQIFAgQEhwEAAhEDEBIhBCAxQRMFMCIyURRABjMjYUIVcVI0gVAkkaFDsRYHYjVT8NElYMFE4XLxF4JjNnAmRVSSJ6LSCAkKGBkaKCkqNzg5OkZHSElKVVZXWFlaZGVmZ2hpanN0dXZ3eHl6gIOEhYaHiImKkJOUlZaXmJmaoKOkpaanqKmqsLKztLW2t7i5usDCw8TFxsfIycrQ09TV1tfY2drg4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwADAwMDAwMGAwMGCAYGBggLCAgICAsNCwsLCwsNEA0NDQ0NDRAQEBAQEBAQExMTExMTFxcXFxcaGhoaGhoaGhoa/9sAQwEEBAQGBgYLBgYLGxIPEhsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsb/9oADAMBAAIRAxEAAAH5U21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21bbVttW21Z/wBJ6tXgQb5tVPF52qL5dvqBlz4/Nu9a43bTl572nZuZ3bIrk1dAFiwfCtSeLj2Txuttq22rbattq22rbattq22r0SBJrmLWouqmJVU6FVKpiplKqy51JhcU2dsHNerfOf0N881ttW21bbVttW21bbVttW21egBkVc9c013Uza1FLUmaVIi1OSijGbqp2DoKbHOsdtHu2nqXzf8ASPzdW21bbVttW21bbVttW21bbV2wkjqpvaO9r0TzzpeZAmYglDgB6hKtSDDXXZUFWvmyav2Vh06+n/Nv0n82VttW21bbVttW21bbVttW21dDNE7pxd872VVk1b+nqHAaEdnbUzg7CnRn5qpcPogOcsnHohO+bPVPK622rbattq22rbattq22rbatMalRGrbattq22rbattq22pwFOrbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq22rbattq//9oACAEBAAEFAv8Ap3FFtcSAwTJakLSrFToXQuhdC8S8S8VPEuhYhmUPd537lPU7PuQj/wBRbHZx3l5uF7HCmeZUiwFvrA8Pospp/dfDnMXb7F7mqOAWFYvdyIveOWOUUR89CIFJXFRXKUzDV2Us9nN4msozB/qHw8aSbiuqk+12o6B0DoHQOgdA6Oie4cQ6/EIp4b/1DsKI1SbgEZpAq6DtqWkKJMZS0iR5SMZlmpYFXi8XiHGhOXiCNH9Hf9Q7D+83D20cf5pCsWVEvUsOL2/EP/GNf6h2P2772kcQ/wBH3ZeoPavV2NWDUMWMdShcMzh9vxF/xjf+odlPXenrRxT7SZoEBX7zsePdHsVozNY3Cl3HNuw4P3niP/jG/wDUO0mi7s9SOKdGjclU4q7efdHs9oac524+k8S/8Y5/qHb1YqnNTFxHBoY7fm7x+wRo48eY7f2/FHT4f/1ClRSSoqaMsra2QV823cKVSvkXTul2EVyhUUy/c7tzcq2T7xYP3G4BMBgR73t7jt4pY4ts3BZstk5D8TbzDuMn+o6n+e5srJJ/6cr/AP/aAAgBAxEBPwH/AHuCUqFvv/0Yzt3O7/QoyA+P2IYhHn/e8//aAAgBAhEBPwH/AHuCctot/VD8mGXc7nf/AKFjnjLiP1R2x6eMOf2I/wC9w//aAAgBAQAGPwL/AKdxyQgkPUMpUNQ+H3+HeqUk/Y/YV+Dx6a+mSf7r5oiKk+qer+D/AFH9N7CBkXhGKd6tX6RphieLocKV9fLHz+1rUnl8+isRXT4MZIj5vnw4MDEZZca6/g5hjFTA06jTh+X1LTJ0+1Tjr+Ho5k/R0ANOrT/J9XBniAVUVrrSvn6MiM6AkfrfF1YkhUQ4d3iGJl6ZAPX1/wBRS/Jn/UMf+7R/Af8AUUhWkGg83okD73k+IdQ6OtQ+tX2Dtw+5FJ+YSAV+w/6ik+X8/TvH/uxP8B/1FJ8vucOLKT5d6d9HXsI5JKLPk8F/l7Bx/wC7E/wH/US/l3DTmV6UBPxPwavn3H3A6sXEyiFejM3l2Dj/AN2J/gP+ol/LvVpUr2k6A6f3GVDuPuDv1cOwcf8AuwfwH/USvl909x9wd+rvCn/Yg/gP+o9eyxer5SEpJy46j4Piv9TJg1H8ogPTH/CDXGhS1AHiKMIt8sv5VAH+T/DT/daRdVyNfYKTo9TL+p0iUhSfI5J1H4syXOOAH5VJr/C/77/vLTcWEgVl7aZClJSfR4iIvn3ykxpGvUWi1s/3MPn+0fX/AHxUyL1/6cr/AP/EADMQAQADAAICAgICAwEBAAACCwERACExQVFhcYGRobHB8NEQ4fEgMEBQYHCAkKCwwNDg/9oACAEBAAE/If8A+HH2mSMvOZVSCQnssnCvovrb6m+tvpb6W+xfS31tjFvIr/8AUUeaHkJ/dMADVSH5v/6H23APPgsZkMy5t7sKoo9FHsG3Keo93mHT1vws84vG0jZTnipLnHnurUrznGtAeeL7jrNjw8I93izQCK9l+h7potqPxc9PanN1etnn28TSSU1HoOHQOGnIpZGRDDfYouVg9D008aOgYyfJ2f8A9CB3r/NPddVFJOLHwU7y+ux8RRuf4/5ngvsXaP6sHRYm/wBmzDJvC/8A9CaBgsQmzH0QFZfP/II4qPlaR6Qn/l5rz4/+Vh4KyOP8+q0kEef/AJQahxnkvCCb4kLOOKPqd2J6+LOxIJawyfx/+hOPh1Sv+/c//kyJp3R92V1/xxfP/wChyHHxa5Z/yh/qkaH4f5FO01H/ABZ44soLv/jPBYCVYvzL8UuD3DzxzzVeyhzsaf3dAef/AND0QfGul9/8ToeT+aNQenQHXJPdGgzwn6KU4v7V4qd1v6FEgdbSNDmHjj5KbmYCfG3B90T8n/6Ha+oLI/8Amp/I/mhRYcCQ9NqccX+v+dWD7v6vF5a8Ufirx/z8en90M+633f8A6Gel1TDYuvNkKid0bHz/AFRpH/I/J/X/ABKmUT8FllYsTdBGfmn9t4Y82KHf6v8A9Cp0XUncsHLQX8DF0BLV4v8A8/8A2pXJNkJ/Nzg/4fddDM4D5jeKv3j/AJybPv4UFjnIieHO+Zo2fg2+YEy8DHCax/ITvEg9qHYk4UAJnJ2RmatQjs0+R4ay5LkD+buPNHGXGHjx/wDons//ADgCEJ7brtfn/wDgr//aAAwDAQACEQMRAAAQ8888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888goi3cukHwU88888888wkcUs0ooM888888888cQMIIQAZ4c88888888QAx8kQweMc88888888Y048sIg3IU88888888sM888888c88888888888888888888888888888888888888888888888888888888888888888888888888888//xAAzEQEBAQADAAECBQUBAQABAQkBABEhMRBBUWEgcfCRgaGx0cHh8TBAUGBwgJCgsMDQ4P/aAAgBAxEBPxD/APaGmJ8Mj7L8kOm//ojaLn/6m/P4drS8ft/+E9f/ALQ//9oACAECEQE/EP8A9oN1m+QAoQfksfT9ZsOm/wD6I2pzm9PP5fX/AOoedfw7AVwQ+x9D/wDC6P8A+0P/2gAIAQEAAT8Q/wD4cfH2S5fDw39psf7q4RRuEhPpoyEPw32PxROPxN/+I3o/U3WP1N/+M3/5DYefxN/+c0Em8IGewv8Ahf8AVxB+RJ8ICPkaGfYBA5WSHzURhx//AEI8EWXwxBPS6+iKmJAAAAPR1FRMxwfukgysyr7ssgoqPXDV8kkhCLI9y4I2xZORuEkXFliDODxVRGXeGyCoQigdHYDxJFmnQP8ANOEDYhLOmdE8Q/DZm54JRTlEqycYMi8mD3JCQzdmDnfFgsLSeCJZfBw7NUUSyiMtJIQHEzxQtSZYED2JEPdn4D7b25QH5CKmNJhArFcAhlUMBB5IPK//AKEoEPP8qRQ5e6Q03bNZsOYudmU/qv8ACsQAPMFYBh+P/KmEKfUVyCA/h+CwSQR8X0x8U3gHx/5YR080j0R+aaRZI/4bUKSSR+bOJAQz7/8A0JUt4dCVmBoueOP4wpFCNoan5j3dIiafi+KZET0Pf6bGAPRcPL0zzSmQowSWmzQcB4+IiyhBcRCP5bZE+EAg+gpZskaJXHQAfPxTmiBkT/uzmZ5G1ldTWyYll/NYYOjUn8XXOjoLCVcUfj/9CMD3/K0Y3SzdF908n/CGILpFwoNikz6/4M5Vdk9YxclFywFpxlOeCiB+X+WwfhVyv/6FYvf8VsTbrRn5o8JcBxKsFEWQMZ0SSO0mnraIpZxO8mmNaTlOcfzd0EkdHBPUeK1pkjKGIk8xSgIgfzZk7vH3Y9xXEEZhDtjxQVgBHEUT5Cxh+X80PaBQB/8A6Faf5/Wv6ibxp5qIWE34UwMcWAQrkzHJxNLEYDyjb7oFLwL+qBNzn+mwjihnkb9N4qUYet5E2D5GSl8cjUToRDpmJ1Nn8miOoNDzTIe380geleEz3f8A6EjPY/3NaTu0yGO6cwkET0Bq40nQuEMk47Wy3QYXlga/PNBkmwgKJOdn8KsL5qweikxNhb0/imYfH81gI8UqMBgnwk4a4l8v5rDGMVjD3/8AoWy8xI/mvxOq2BFzSD5mBPhsixU4A/hVUXDtgleX3WHvU/lUBgqzPFGUZFJngfxcBheM9WL8BvkTinnf/pWx6Ib91YAxz/8AQlM+JIaBIjpNGgmkATCGvNQwCkCJMCkgeWySv0WuWiBBoeHZFzSTxJs+7M+JFsOm6lIPZtbOSpaIFZZjOPdgzg0gaBLjQTHDweq8EC6nD8TXp6ojhzqaEKOnFf6ftSmGlZHXFmFlmdCvEyKi4GGIJH2JZMMeJRZAyCaIw0gU8RhuqqdOlDAAFoQiWuvf/wChynFAIF+aqsvP/wCaLOCAIgOgmoSXyl/n/wDgr//Z';

        // Los tres estados de la tarjeta son los tres de la API (el detalle de cada uno,
        // en _dailyReminderState):
        //
        //   in_progress  lo que falta POR VER, que NO es una cuenta atras de reloj: el
        //                dato solo se mueve cuando se vuelve a pedir /challenges, asi que
        //                un reloj aqui iria inventando minutos. Debajo, que se reclama
        //                solo al llegar al final.
        //   claimable    boton. Abre el cofre y pulsa su primario, y —al contrario que el
        //                automatico— deja el modal abierto: el resultado de Kick es lo
        //                que se quiere ver cuando se ha pedido a mano.
        //   claimed      como las demas baldosas: la ✓ y el cuando. Y aqui el "cuando" si
        //                existe, que `claimed_at` lo trae —al contrario que los drops,
        //                donde esa linea sale vacia—; y la imagen pasa a ser lo que toco
        //                (`winner.card_url`) cuando viene.
        //
        // Un status desconocido no pinta nada, igual que no avisa: uno nuevo —un "perdido"
        // para el dia que se cierra sin cobrar— caeria por descarte en in_progress y la
        // tarjeta prometeria un reclamo automatico que no va a pasar.
        function _dailyChestCard() {
            if (!cleanExpiredInventoryFlag) return null;
            const c = _dailyWatchChallenge();
            if (!c || !c.condition) return null;
            const done = Number(c.condition.progress) || 0;
            const total = Number(c.condition.threshold) || 0;
            if (total <= 0) return null;

            const claimed = c.status === 'claimed';
            // Cumplido y sin cobrar es "se puede", diga lo que diga el status: entre el
            // ultimo minuto y el `claimable` hay un hueco en el que la API todavia dice
            // in_progress. Es el mismo hueco que cubre el aviso.
            const claimable = !claimed && (c.status === 'claimable' || done >= total);
            if (!claimed && !claimable && c.status !== 'in_progress') return null;

            // VENTANA YA CERRADA: no se pinta nada, este cobrado o no.
            //
            // La baldosa es la recompensa DE HOY, no un historial. Pasada la hora de
            // cierre, lo que queda en memoria es el reto de AYER, y en el estado
            // `claimed` eso significa enseñar su ✓ y la carta que tocó ayer dentro de la
            // pestaña de hoy: un dato viejo con aspecto de dato de hoy. Antes este corte
            // solo miraba los estados sin cobrar, y ahi el reto viejo se colaba.
            //
            // Lo normal es que el hueco dure lo que tarda el relevo en traer el reto
            // nuevo —unos segundos—. Y si el servidor no ha rotado todavia, un hueco es
            // mejor que la carta de ayer: la de hoy la trae el propio relevo cuando
            // llegue, o la recarga de los 15 minutos.
            const ends = Date.parse((c.window && c.window.ends_at) || '');
            if (Number.isFinite(ends) && ends <= Date.now()) return null;

            const card = document.createElement('div');
            card.id = 'kick-daily-chest-card';
            card.className = 'bg-surface-base flex flex-col rounded-lg overflow-hidden';

            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'relative aspect-square bg-surface-highest';
            const img = document.createElement('img');
            img.alt = t.dailyRewardTitle || 'Daily reward';
            img.loading = 'lazy';
            const won = (claimed && c.winner && c.winner.card_url) || '';
            // El cofre lleva su propio margen negro, asi que va entero (`contain`) y no
            // recortado como las imagenes de recompensa, que son cuadradas de origen.
            img.className = 'w-full h-full ' + (won ? 'object-cover' : 'object-contain');
            img.src = won ? (/^https?:/i.test(won) ? won : KICK_CDN_BASE + won) : DAILY_CHEST_IMG;
            // Si la carta que toco no carga, el cofre: mejor eso que un hueco negro.
            img.onerror = () => { img.onerror = null; img.className = 'w-full h-full object-contain'; img.src = DAILY_CHEST_IMG; };
            imgWrapper.appendChild(img);

            // LA BARRA DE PROGRESO, con el marcado exacto de Kick (verificado en
            // docs/dom-campaigns-progress-2026-08.html): al fondo del recuadro de la
            // imagen y a caballo de su borde con `translate-y-1/2`, que es donde la pone
            // el en sus baldosas de drop. Se copia su forma en vez de inventar una para
            // que la baldosa del cofre se lea como una mas de la pagina y no como un
            // parche encima.
            //
            // Solo mientras se acumula. Cumplido el tiempo, lo que hay que mirar es el
            // boton de cobrar, y una barra al 100% al lado solo le quita sitio.
            if (!claimed && !claimable) {
                const frac = Math.max(0, Math.min(1, done / total));
                const bar = document.createElement('div');
                bar.className = 'absolute right-0 bottom-0 left-0 h-1 w-full translate-y-1/2 overflow-hidden rounded-lg bg-outline-region';
                // Los mismos atributos que Kick, para que un lector de pantalla lea lo
                // mismo en las dos. Ojo con `role="progressbar"`: el barrido de
                // reclamados CUENTA las barras de la pestaña para saber si es el
                // escaparate, asi que las nuestras hay que descontarlas (ver isTrophyCase).
                bar.setAttribute('role', 'progressbar');
                bar.setAttribute('aria-valuemin', '0');
                bar.setAttribute('aria-valuemax', '1');
                bar.setAttribute('aria-valuenow', String(frac));
                bar.setAttribute('aria-valuetext', Math.round(frac * 100) + '%');
                bar.setAttribute('data-state', 'loading');
                bar.setAttribute('data-value', String(frac));
                bar.setAttribute('data-max', '1');
                const fill = document.createElement('div');
                fill.className = 'h-full w-full origin-left rounded-lg bg-primary-base';
                fill.style.transform = `scaleX(${frac})`;
                bar.appendChild(fill);
                imgWrapper.appendChild(bar);
            }
            card.appendChild(imgWrapper);

            const info = document.createElement('div');
            info.className = 'flex flex-col gap-1 p-3';

            const topRow = document.createElement('div');
            topRow.className = 'flex items-center justify-between';
            const left = document.createElement('span');
            left.className = 'text-surface-onSurfaceSecondary text-xs';
            left.textContent = claimed ? _timeAgo(c.claimed_at || '')
                : (claimable ? '' : formatHoursMinutes(total - done));
            topRow.appendChild(left);
            const badge = document.createElement('div');
            badge.className = 'flex items-center justify-center rounded bg-surface-highest px-1.5 py-0.5 text-xs text-white font-medium min-w-[20px]';
            badge.textContent = claimed ? '1' : `${Math.min(done, total)}/${total}`;
            topRow.appendChild(badge);
            info.appendChild(topRow);

            const nameP = document.createElement('p');
            nameP.className = 'text-sm font-bold text-white line-clamp-2 break-words';
            nameP.textContent = t.dailyRewardTitle || 'Daily reward';
            info.appendChild(nameP);
            card.appendChild(info);

            const sep = document.createElement('div');
            sep.className = 'bg-outline-decorative h-px w-full';
            card.appendChild(sep);

            const footer = document.createElement('div');
            if (claimed) {
                footer.className = 'flex items-center justify-center py-2';
                footer.appendChild(_checkmarkSvg());
            } else if (claimable) {
                footer.className = 'flex items-center justify-center p-2';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'bg-primary-base w-full rounded px-2 py-1.5 text-xs font-semibold text-black';
                btn.textContent = t.dailyRewardClaim || 'Claim';
                btn.addEventListener('click', () => {
                    // Se apaga en cuanto se pulsa: la secuencia tarda un par de segundos
                    // en abrir el modal y sin esto se puede pulsar dos veces.
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    if (!_claimDailyRewardNow()) { btn.disabled = false; btn.style.opacity = ''; }
                });
                footer.appendChild(btn);
            } else {
                footer.className = 'flex items-center justify-center gap-1 px-2 py-2';
                const nota = document.createElement('span');
                nota.className = 'text-surface-onSurfaceSecondary text-center text-xs';
                nota.textContent = t.dailyRewardAuto || '';
                footer.appendChild(nota);
            }
            card.appendChild(footer);

            // Y mientras se acumula, la baldosa se comporta como una fila de progreso de
            // Kick: el aviso con lo que falta —que lo pinta el motor de tooltips propio
            // leyendo este `title`, y sale ENCIMA porque la tarjeta vive en la pagina y
            // no en el panel— y el clic, que abre el modal del cofre.
            //
            // El clic NO reclama: aqui todavia no se puede, y lo que el modal enseña es
            // la cuenta atras y la racha, que es justo lo que se va a mirar. Cobrar es el
            // boton del pie, y ese solo existe cuando de verdad se puede.
            if (!claimed && !claimable) {
                card.title = `${t.timeRemaining}: ${formatHoursMinutes(total - done)}`;
                card.style.cursor = 'pointer';
                card.addEventListener('click', (e) => {
                    if (e.target.closest('button, a')) return;
                    _hideTip();
                    _openDailyRewardModal();
                });
            }
            return card;
        }

        function _renderClaimedInventory() {
            if (!_claimedInventoryReady || !_claimedTabIsFront()) return;
            // NO se sale por «cero drops reclamados»: desde que el cofre diario es una
            // baldosa mas, la rejilla puede tener algo que enseñar sin un solo drop
            // cobrado —una cuenta nueva, o cualquiera antes de su primer reclamo—.
            // Quien decide si hay contenido es el corte de mas abajo, que cuenta las dos
            // cosas. Reportado el 2026-08-22: con la pestaña vacia el cofre no aparecia.

            // Remove previous render
            const existing = document.getElementById('kick-claimed-inventory');
            if (existing) existing.remove();

            // Collect all claimed rewards from all campaigns into a flat list
            const allClaimed = [];
            for (const campaign of _interceptedClaimedCampaigns) {
                for (const reward of (campaign.rewards || [])) {
                    if (reward.claimed) {
                        allClaimed.push({
                            reward,
                            claimedAt: reward.claimed_at || reward.updated_at || campaign.updated_at || ''
                        });
                    }
                }
            }
            // La tarjeta del cofre diario, si toca. Se pide ANTES del corte de "no hay
            // nada reclamado" porque cuenta como contenido: con la casilla marcada lo de
            // Kick se esconde, y salir aqui dejaria la pestaña en blanco teniendo algo
            // que enseñar.
            const chestCard = _dailyChestCard();
            if (allClaimed.length === 0 && !chestCard) return;

            // El API no expone fecha de reclamo, pero devuelve las rewards en un
            // orden estable. Solo invertimos ese orden para mostrarlas del más
            // reciente al más antiguo (no se ordena por fecha porque no hay).
            allClaimed.reverse();

            // Donde insertar nuestra rejilla. El DOM viejo tenia una seccion con un
            // <h1> "Reclamado"/"Claimed" y se colgaba de ahi.
            //
            // En el DOM nuevo esa seccion no existe: la pestaña ENTERA es lo
            // reclamado y su unico <h1> dice "Drops". Asi que el ancla pasa a ser el
            // ultimo grupo de juego, y la rejilla entra detras de el —o sea, al final
            // de la lista, que es donde estaba antes—.
            //
            // La comprobacion de pestaña oculta empieza en el PADRE del grupo, no en
            // el grupo: hay que dejar fuera los grupos del panel escondido de otra
            // pestaña, pero NO los que acabamos de esconder nosotros con la casilla de
            // "ocultar reclamados". Mirando el grupo tambien a si mismo, en cuanto se
            // ocultaba el ultimo se quedaba sin ancla y la rejilla no se re-pintaba.
            let reclamadoSection = null;
            for (const h1 of _dropsQuery('h1')) {
                const txt = h1.textContent.trim().toLowerCase();
                if (txt === 'reclamado' || txt === 'claimed') {
                    reclamadoSection = h1.closest('.flex.w-full.shrink-0.grow-0') || h1.parentElement;
                    break;
                }
            }
            if (!reclamadoSection) {
                const groups = _dropsQuery('.bg-surface-base.rounded-2xl')
                    .filter(n => !n.parentElement || !_isInHiddenPanel(n.parentElement));
                reclamadoSection = groups.length > 0 ? groups[groups.length - 1] : null;
            }
            // Y con CERO reclamados no hay ningun grupo del que colgarse: la pestaña
            // trae solo el estado vacio de Kick («No claimed campaigns yet»). Ese pasa a
            // ser el ancla, y se reconoce por `data-testid`, que es la unica marca
            // estable de ese bloque —no depende de ninguna clase de Tailwind ni del
            // idioma del cartel—.
            if (!reclamadoSection) {
                for (const vacio of _dropsQuery('[data-testid="empty-state-root"]')) {
                    const bloque = vacio.closest('.flex.w-full.shrink-0.grow-0') || vacio;
                    // Se pregunta por el PADRE del bloque y no por el bloque: al pintar la
                    // rejilla lo escondemos nosotros, asi que preguntando por el se
                    // perderia el ancla en el siguiente repintado y la rejilla no volveria.
                    if (bloque.parentElement && _isInHiddenPanel(bloque.parentElement)) continue;
                    reclamadoSection = bloque;
                    break;
                }
            }
            if (!reclamadoSection) {
                reclamadoSection = _dropsQuery('[data-orientation="vertical"]')[0]?.parentElement;
            }
            if (!reclamadoSection) return;

            const insertParent = reclamadoSection.parentElement;
            if (!insertParent) return;

            // Build section
            const section = document.createElement('div');
            section.id = 'kick-claimed-inventory';
            section.className = 'flex w-full shrink-0 grow-0 flex-col gap-3';

            // Encabezado de la seccion. En el DOM viejo iba comentado a proposito
            // porque el <h1> "Reclamado" de Kick quedaba justo encima y lo repetia.
            // Ahora ese encabezado no existe —y con la casilla marcada, los bloques de
            // Kick se esconden—, asi que sin esto la rejilla aparece sin decir que es:
            // una parrilla de imagenes colgando de la nada.
            const header = document.createElement('h1');
            header.className = 'font-semibold text-white lg:text-xl text-base';
            header.textContent = t.claimedInventoryTitle || 'Claimed';
            section.appendChild(header);

            // Rewards grid (Twitch-style cards)
            const grid = document.createElement('div');
            grid.className = 'grid gap-4';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';

            // Primera, como la mas reciente: es la de hoy, y la unica que puede pedir
            // algo (el boton de reclamar).
            if (chestCard) grid.appendChild(chestCard);

            for (const { reward, claimedAt } of allClaimed) {
                const card = document.createElement('div');
                card.className = 'bg-surface-base flex flex-col rounded-lg overflow-hidden';

                // Image
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'relative aspect-square bg-surface-highest';
                const img = document.createElement('img');
                img.alt = reward.name || '';
                img.loading = 'lazy';
                img.className = 'w-full h-full object-cover';
                img.src = reward.image_url ? KICK_CDN_BASE + reward.image_url : '';
                imgWrapper.appendChild(img);
                card.appendChild(imgWrapper);

                // Info section: time + count + name
                const info = document.createElement('div');
                info.className = 'flex flex-col gap-1 p-3';

                // Row: time ago + count badge
                const topRow = document.createElement('div');
                topRow.className = 'flex items-center justify-between';

                const timeSpan = document.createElement('span');
                timeSpan.className = 'text-surface-onSurfaceSecondary text-xs';
                timeSpan.textContent = _timeAgo(claimedAt);
                topRow.appendChild(timeSpan);

                const badge = document.createElement('div');
                badge.className = 'flex items-center justify-center rounded bg-surface-highest px-1.5 py-0.5 text-xs text-white font-medium min-w-[20px]';
                badge.textContent = '1';
                topRow.appendChild(badge);

                info.appendChild(topRow);

                // Reward name
                const nameP = document.createElement('p');
                nameP.className = 'text-sm font-bold text-white line-clamp-2 break-words';
                nameP.textContent = reward.name || '';
                info.appendChild(nameP);

                card.appendChild(info);

                // Separator
                const sep = document.createElement('div');
                sep.className = 'bg-outline-decorative h-px w-full';
                card.appendChild(sep);

                // Checkmark footer
                const footer = document.createElement('div');
                footer.className = 'flex items-center justify-center py-2';
                footer.appendChild(_checkmarkSvg());
                card.appendChild(footer);

                grid.appendChild(card);
            }

            section.appendChild(grid);

            // Insert after "Reclamado" section
            if (reclamadoSection.nextSibling) {
                insertParent.insertBefore(section, reclamadoSection.nextSibling);
            } else {
                insertParent.appendChild(section);
            }

            // Y AHORA se esconde lo de Kick, no antes. El ocultado vivia en el barrido de
            // cleanInventory, que corre en su propio intervalo y decidia por su cuenta: si
            // la rejilla no llegaba a pintarse —sin token no hay /drops/progress, y sin
            // progress no se sabe que tienes— escondia la lista de Kick igual y la pestaña
            // se quedaba EN BLANCO, sin lo suyo y sin lo nuestro. Se ve al entrar desde
            // campañas o proximas.
            //
            // Atarlo a este punto lo hace imposible por construccion: lo unico que puede
            // esconder la lista de Kick es haber terminado de pintar la nuestra, y esta
            // linea solo se alcanza con la seccion ya insertada.
            _hideKickClaimedBlocks();
        }

        // Esconde los grupos de Kick de la pestaña de reclamados, dejando fuera lo nuestro.
        // Marca lo que esconde para poder devolverlo: si la rejilla desaparece en un
        // repintado posterior, hay que enseñar otra vez lo de Kick en vez de dejar la
        // pestaña vacia.
        // El barrido va por TODO el <main> a proposito, y lo que impide que apague la
        // pestaña equivocada es la guarda de arriba, no un acotado.
        //
        // Se probo acotarlo al contenedor donde entra la rejilla y esta mal: en el DOM
        // nuevo cada grupo de juego vive en su propio envoltorio, asi que ahi dentro solo
        // hay UNO —la pestaña de reclamados trae dos— y los demas se quedarian a la vista
        // al lado de nuestra rejilla, que es la lista duplicada que esto viene a evitar.
        // El riesgo que se queria cubrir —apagar los bloques de la pestaña que este
        // delante, y dejarla en blanco— lo cierra `_claimedTabIsFront`: cuando la URL y
        // la barra dicen las dos «reclamados», lo que esta delante es esto.
        function _hideKickClaimedBlocks() {
            if (!_claimedTabIsFront()) return;
            _dropsQuery('.bg-surface-base.rounded-2xl').forEach(group => {
                if (group.closest('#kick-claimed-inventory')) return;
                group.dataset.kickHidden = '1';
                group.style.display = 'none';
            });
            _hideKickClaimedFilters();
            // Y el estado vacio de Kick, que solo esta ahi cuando no tienes ni un drop
            // reclamado. Si hemos llegado hasta aqui es que la rejilla SI tiene algo que
            // enseñar —el cofre—, asi que dejarlo pondria un «No claimed campaigns yet»
            // a pantalla completa encima de algo que hay, y empujaria la baldosa fuera
            // de la vista. Vuelve solo, como todo lo demas, por `data-kick-hidden`.
            _dropsQuery('[data-testid="empty-state-root"]').forEach(vacio => {
                const bloque = vacio.closest('.flex.w-full.shrink-0.grow-0') || vacio;
                if (bloque.dataset.kickHidden) return;
                bloque.dataset.kickHidden = '1';
                bloque.style.display = 'none';
            });
        }

        // Y con ellos los filtros por juego de Kick (All / Rust / PUBG…). Aqui ya no
        // filtran nada: lo que recortaban eran los bloques que acabamos de esconder, asi
        // que pulsarlos no cambia nada de lo que se ve —y encima el que este marcado
        // sugiere que la rejilla esta filtrada, cuando la rejilla los ignora—.
        //
        // Solo en reclamados: en cerradas los bloques de Kick se quedan, asi que alli sus
        // filtros siguen sirviendo y no se tocan. La guarda de arriba es la que lo asegura.
        //
        // Se reconocen por su FORMA —un grupo de radios de Radix— y no por su texto, que
        // son nombres de juego: cambian con tu cuenta, y «All» esta traducido.
        function _hideKickClaimedFilters() {
            _dropsQuery('[role="group"]').forEach(group => {
                if (group.closest('#kick-drops-panel')) return;
                if (group.closest('#kick-claimed-inventory')) return;
                if (!group.querySelector('[role="radio"]')) return;
                if (_isInHiddenPanel(group)) return;
                // Se esconde el ENVOLTORIO y no el grupo: lleva su propio `py-2`, asi que
                // escondiendo solo el grupo queda el hueco de la fila donde estaba. Y solo
                // si de verdad no contiene nada mas, para no llevarse por delante algo
                // que Kick meta ahi mañana.
                const parent = group.parentElement;
                const row = (parent && parent.children.length === 1) ? parent : group;
                if (row.dataset.kickHidden) return;
                row.dataset.kickHidden = '1';
                row.style.display = 'none';
            });
        }

        // Este SI pregunta al documento entero, y no es un descuido: deshace lo nuestro.
        // Lo que se escondio hay que poder devolverlo aunque hoy caiga fuera del area
        // de drops —una version anterior pudo esconderlo desde otro sitio—; acotarlo
        // seria dejar escondido para siempre lo que quedara fuera. Vale igual para el
        // borrado de ids drop-match-* y de las marcas de pagina al empezar el escaneo.
        function _restoreKickClaimedBlocks() {
            document.querySelectorAll('[data-kick-hidden]').forEach(el => {
                delete el.dataset.kickHidden;
                el.style.display = '';
            });
        }

        // RECOGER LO QUE DEJO PUESTO LA REJILLA. Se llama al cambiar de pestaña, antes
        // de ponerse con la nueva.
        //
        // Hace falta porque nuestra seccion no la gestiona React: es un hijo mas del
        // contenedor que Kick reutiliza entre pestañas, y al cambiar de pestaña React
        // reemplaza SUS hijos y deja donde estaban los ajenos. Asi que la rejilla de
        // reclamados se quedaba colgando debajo del contenido de cerradas —reportado el
        // 2026-08-22 haciendo reclamados → cerradas → reclamados—, y con ella el
        // `display:none` de los bloques que habiamos escondido, que es lo que dejaba la
        // pestaña siguiente en blanco.
        //
        // No vale con esconderla: la pestaña de reclamados la vuelve a pintar entera en
        // cuanto se llega, asi que lo que se quede aqui solo puede duplicarse.
        function _tearDownClaimedGrid() {
            const grid = document.getElementById('kick-claimed-inventory');
            if (grid) grid.remove();
            _restoreKickClaimedBlocks();
        }

        // =============================================
        // TOOLTIP + MODAL: TIEMPO RESTANTE EN DROPS EN PROGRESO
        // =============================================

        // campaignName -> { progress_units, rewards: [...] }
        // Indexar por reward.name colisiona: una sola campaña tiene varias rewards
        // con el mismo `name` y distinto `required_units` (e.g. "x1 entry" / "x10
        // entries" repetidos en ED'S DROP). Por eso indexamos por campaña; la
        // reward concreta se busca por (name + required_units) al resolver.
        let _kickCampaigns = {};

        function _buildKickProgressMap() {
            _kickCampaigns = {};
            for (const c of _interceptedAllCampaigns) {
                if (!c || !c.name) continue;
                _kickCampaigns[c.name] = {
                    progress_units: Number(c.progress_units) || 0,
                    rewards: (c.rewards || []).filter(r => r && !r.claimed)
                };
            }
        }

        function formatHoursMinutes(totalMinutes) {
            const m = Math.max(0, Math.round(totalMinutes));
            const h = Math.floor(m / 60);
            const mm = m % 60;
            if (h <= 0) return `${mm}m`;
            if (mm <= 0) return `${h}h`;
            return `${h}h ${mm}m`;
        }

        // Lee el tiempo que muestra el LI y dice QUE tiempo es. Kick usa dos formatos
        // para el mismo dato y significan cosas opuestas:
        //   - "7% de 1 h"       -> el tiempo es el TOTAL requerido del tier.
        //   - "49 min to unlock"-> el tiempo es lo que FALTA (total - visto).
        // El discriminante es el "%": solo el formato viejo lo trae. Tomar el segundo
        // como total daba "550 / 49 min · 1122%" y "restante 0m" en una campaña con
        // 550 min vistos de 600. Combina horas+minutos cuando vienen los dos.
        function _parseKickLiTime(li) {
            const statusSpan = li.querySelector('.text-surface-onSurfaceSecondary');
            const txt = statusSpan ? (statusSpan.textContent || '').toLowerCase() : '';
            let h = 0, m = 0;
            const mHours = txt.match(/(\d+(?:[.]\d+)?)\s*(?:hours?|horas?|stunden?|heures?|ore|godzin|h\b)/);
            if (mHours) h = parseFloat(mHours[1].replace(',', '.'));
            const mMin = txt.match(/(\d+)\s*(?:minutes?|minutos?|min\b)/);
            if (mMin) m = parseInt(mMin[1], 10);
            const minutes = (h <= 0 && m <= 0) ? 0 : Math.round(h * 60) + m;
            return { minutes, isTotal: txt.includes('%') };
        }

        // Parse the visible percentage from "7% de 1 h" — used as a fallback when
        // the API hasn't been intercepted yet. Kick's progressbar element does not
        // expose `aria-valuenow` (it's always 0), so this text is the only DOM
        // source for the current percentage.
        // La FRACCION de la barra de Kick (0..1). Es dato nuevo: hasta que el progreso
        // se mudo a la pestaña de campañas la barra venia siempre a 0, y por eso el
        // script no la miraba. Desde el volcado del 2026-08-22 trae `data-value`
        // (0.26666668) y `aria-valuenow` con lo mismo, mas `aria-valuetext` ("27%").
        //
        // Se lee `data-value` primero: `aria-valuetext` esta redondeado a enteros y con
        // tramos largos ese redondeo se paga caro (1% de 15 h son 9 minutos).
        function _parseKickLiFraction(li) {
            const bar = li.querySelector('[role="progressbar"]');
            if (!bar) return NaN;
            const raw = bar.getAttribute('data-value') != null
                ? bar.getAttribute('data-value') : bar.getAttribute('aria-valuenow');
            const v = Number(raw);
            if (!Number.isFinite(v)) return NaN;
            const max = Number(bar.getAttribute('data-max') || bar.getAttribute('aria-valuemax') || 1) || 1;
            return max > 0 ? v / max : NaN;
        }

        function _parsePercentFromKickLi(li) {
            const statusSpan = li.querySelector('.text-surface-onSurfaceSecondary');
            const txt = statusSpan ? (statusSpan.textContent || '') : '';
            const m = txt.match(/(\d+(?:[.]\d+)?)\s*%/);
            return m ? parseFloat(m[1].replace(',', '.')) : NaN;
        }

        // El nombre que hay que devolver es el de la SUB-CAMPAÑA, no el del juego:
        // `_kickCampaigns` se indexa por el `name` que da la API, y el tiempo visto
        // (`progress_units`) se cuenta por sub-campaña.
        //
        // En el DOM nuevo la sub-campaña es `.border-outline-decorative` y va DENTRO
        // del grupo del juego, que tambien es `.bg-surface-base`: se pregunta por el
        // borde primero para no subir de mas y acabar leyendo "Rust". El respaldo
        // generico [class*="font-bold"] dentro de la tarjeta da su <h2>, que es el
        // nombre de la sub-campaña; `.text-base.font-bold` es el del DOM viejo.
        function _findCampaignNameForKickLi(li) {
            const container = li.closest('.border-outline-decorative') || li.closest('.bg-surface-base');
            if (!container) return '';
            const nameEl = container.querySelector('.text-base.font-bold') ||
                container.querySelector('h2.font-bold') ||
                container.querySelector('[class*="font-bold"]');
            return nameEl ? nameEl.textContent.trim() : '';
        }

        // El nombre de la recompensa de un `<li>`. Se lee con `_collapse` y no con
        // `.trim()` porque Kick lo parte en varias lineas dentro del span («PGS\n 9
        // Comic Boom (Spray)») y la API lo devuelve con un espacio: recortado nada mas,
        // las dos cadenas son el mismo texto y no se reconocen.
        //
        // Los tres selectores son las tres formas que ha tenido: `span.line-clamp-3` es
        // la de agosto de 2026 —y la unica que aparece en los cinco volcados nuevos—, y
        // las dos de `font-bold` son del DOM viejo. Ojo con leerlo como una prioridad:
        // una lista de selectores NO la tiene, gana el primero en orden de documento.
        function _rewardNameOfLi(li) {
            const el = li && li.querySelector &&
                li.querySelector('p.text-sm.font-bold, [class*="font-bold"], span.line-clamp-3');
            return el ? _collapse(el.textContent) : '';
        }

        // ---------------------------------------------
        // LA BALDOSA PELADA: UNA RECOMPENSA YA RECLAMADA
        // ---------------------------------------------
        // Reclamada una recompensa, Kick NO la quita de la pestaña de campañas: la deja
        // como una baldosa pelada —imagen, nombre y nada mas: ni barra, ni boton, ni
        // texto de estado— (verificado el 2026-08-22 en
        // docs/dom-campaigns-after-claim-2026-08.html, con PGS 9 Comic Boom ya cobrada
        // al lado de la de 67% que sigue viva).
        //
        // Asi que la ausencia de barra NO significa reclamado, y creerlo esconderia
        // media pagina: en `dom-campaigns-2026-08.html` las DOS recompensas de PUBG
        // salen sin barra por tener el contador a cero, y en el volcado de progreso 15
        // de 17 estan igual. Sin barra solo quiere decir «sin progreso todavia».
        //
        // La unica prueba de que algo esta reclamado es /drops/progress, que ademas es
        // la misma fuente que tacha el badge del panel: si el panel lo tacha, esto lo
        // esconde, y las dos cosas no pueden discrepar. Sin ese dato no se esconde nada
        // —la misma regla que los filtros de vista: lo que no se puede juzgar se deja—.
        function _isClaimedRewardLi(li) {
            if (!_progressInventoryReady) return false;
            const name = _rewardNameOfLi(li).toLowerCase();
            if (!name) return false;
            const camp = _collapse(_findCampaignNameForKickLi(li)).toLowerCase();
            const claimed = camp ? _claimedRewardNames[camp] : null;
            return !!claimed && claimed.has(name);
        }

        // Esconde en la pestaña de CAMPAÑAS lo que ya esta reclamado, que es lo que la
        // casilla promete («ocultar completados») y hasta el 2026-08-22 no hacia aqui:
        // el barrido solo escondia en la pestaña de reclamados, asi que la baldosa de
        // arriba se quedaba a la vista aunque el badge del panel ya la enseñara tachada.
        //
        // Lo que se esconde es la RECOMPENSA, y como mucho la tarjeta de sub-campaña que
        // se quede sin ninguna a la vista —un titulo «Available rewards» sobre una fila
        // vacia—. El GRUPO del juego no se toca nunca, y esa es una decision: lleva el
        // resaltado de color, la marca de ⏳/⏱ y la 🔔, y sobre todo es el ancla a la que
        // salta el clic de la tarjeta del panel. Escondiendolo, esa campaña seguiria
        // listada en el panel y pulsarla no llevaria a ningun sitio.
        //
        // Se marcan con `data-kick-hidden` porque es lo que sabe deshacer
        // `_restoreKickClaimedBlocks`, que es por donde vuelven al quitar la casilla.
        function _updateClaimedTilesHidden() {
            if (!_isCampaignsPage()) return;
            if (!cleanExpiredInventoryFlag) { _restoreKickClaimedBlocks(); return; }
            if (!_progressInventoryReady) return;
            for (const group of _dropsQuery('.bg-surface-base.rounded-2xl')) {
                if (_isInHiddenPanel(group)) continue;
                for (const li of group.querySelectorAll('li')) {
                    if (li.dataset.kickHidden) continue;
                    if (!_isClaimedRewardLi(li)) continue;
                    li.dataset.kickHidden = '1';
                    li.style.display = 'none';
                }
                for (const card of group.querySelectorAll('.border-outline-decorative')) {
                    if (!_isNewCampaignCard(card)) continue;
                    const tiles = Array.from(card.querySelectorAll('li'));
                    if (tiles.length === 0 || !tiles.every(li => li.dataset.kickHidden)) continue;
                    // Sin ninguna baldosa a la vista queda un titulo «Available rewards»
                    // encima de una fila vacia, y el marco de color alrededor de un hueco
                    // del alto de las baldosas que ya no estan. Visto el 2026-08-22 con las
                    // dos recompensas de PUBG reclamadas.
                    //
                    // Se esconde SOLO ese bloque —el encabezado y su <ul>— y no la tarjeta
                    // de sub-campaña: ahi siguen su nombre, su ventana de fechas y los
                    // botones de Participate/Connect, que valen igual con todo cobrado. Y
                    // el grupo del juego no se toca nunca, que lleva el resaltado, la marca
                    // de ⏳/⏱ y la 🔔 y es a donde salta el clic de la tarjeta del panel.
                    const list = tiles[0].closest('ul');
                    if (!list) continue;
                    // El bloque es el padre del <ul> SOLO si de verdad lleva el encabezado
                    // dentro: asi, si Kick cambia el anidamiento, se esconde la fila a secas
                    // en vez de subir un nivel a ciegas y llevarse media tarjeta.
                    const parent = list.parentElement;
                    const block = (parent && parent !== card && parent.querySelector('h2')) ? parent : list;
                    if (block.dataset.kickHidden) continue;
                    block.dataset.kickHidden = '1';
                    block.style.display = 'none';
                }
            }
        }

        // =============================================
        // LOS AVISOS SON DEL SCRIPT, NO DEL SITIO
        // =============================================
        // Una caja propia para TODO lo que este script pinta: el panel, las marcas
        // que mete en la tarjeta de Kick y las filas de progreso. Antes solo la
        // llevaban las filas de progreso —siguiendo al raton— y el resto se quedaba
        // con el `title` del navegador, que sale con un segundo de retraso y con la
        // caja del sistema operativo en medio de un panel que no se parece en nada.
        //
        // La regla que decide de quien es el aviso es DE QUIEN ES EL CONTROL, no si
        // el sitio tiene sistema propio. Todo lo de aqui lo dibuja el script, asi que
        // una caja con su misma paleta no imita a nadie: se lee como parte suya.
        //
        // Y en Kick no habria nada que imitar aunque quisieramos: en los cuatro
        // volcados de docs/ no hay ni un rastro de sistema de tooltip (`radix-popper`,
        // `role="tooltip"`, `data-side`, `aria-describedby` a cero) y Kick pone
        // `title="Watch to redeem"` en sus propios botones, o sea que usa el del
        // navegador. Twitch SI tiene componente propio —su boton de "Mas opciones"
        // lleva `aria-label` y ningun `title`— y a proposito no se reutiliza: sus
        // clases (`ScCoreButton-sc-ocjdkq-0 eBQIRH`) son hashes de compilacion de
        // styled-components y cambian en cada build, asi que replicarlo seria firmar
        // una rotura futura para acabar con una caja que ademas no es la del widget.
        //
        // El motor es el mismo que ya funciona en indiegala-bulk-join: caja colgada
        // del <body>, delegacion en `document` leyendo el `title` YA PUESTO, y el
        // `title` guardado en un atributo mientras la caja esta arriba y devuelto al
        // cerrarla —sigue siendo el respaldo y el nombre accesible—.
        const TIP_ID = 'kick-drops-tip';
        const TIP_STASH_ATTR = 'data-kick-tip';
        // Al raton se le da un cuarto de segundo: sin retardo, cruzar el panel
        // enciende y apaga ocho cajas seguidas. Por teclado sale al instante, porque
        // llegar tabulando ya es intencion.
        const TIP_DELAY_MS = 250;
        const TIP_GAP = 10;      // hueco entre la caja y aquello a lo que se ancla
        const TIP_MARGIN = 8;    // margen que se respeta al borde de la ventana
        // Donde vive un aviso nuestro. El panel es un contenedor; las marcas de
        // pagina y las filas de progreso viven dentro del DOM de Kick, asi que van
        // por su propia marca. Fuera de esto no se toca nada: un `title` de Kick
        // sigue saliendo con la caja del navegador, como hasta ahora.
        // `#kick-claimed-inventory` es la rejilla de reclamados: la pintamos nosotros
        // entera, asi que sus avisos son nuestros igual que los del panel.
        const TIP_SCOPE = '#kick-drops-panel, #kick-claimed-inventory, .kick-drop-page-mark, [data-drop-tooltip-attached]';
        // Un control con aviso es el que tiene `title`... o el que lo tiene guardado,
        // porque mientras la caja esta arriba el atributo no esta.
        const TIP_SELECTOR = `[title], [${TIP_STASH_ATTR}]`;

        let _tipEl = null;
        let _tipAnchor = null;
        let _tipPending = null;
        let _tipTimer = null;
        let _tipBound = false;

        function _ensureTipNode() {
            if (_tipEl && document.body.contains(_tipEl)) return _tipEl;
            const el = document.createElement('div');
            el.id = TIP_ID;
            // Es un aviso, y decirlo cuesta un atributo: asi un lector de pantalla
            // no lo lee como un parrafo suelto que aparece de la nada.
            el.setAttribute('role', 'tooltip');
            Object.assign(el.style, {
                position: 'fixed', top: '0', left: '0', zIndex: '999999',
                background: colors.surface, color: colors.text,
                border: `1px solid ${colors.primary}`, borderRadius: '6px',
                padding: '8px 10px', fontSize: '12px', lineHeight: '1.35',
                fontFamily: 'Inter, system-ui, sans-serif',
                boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
                // Varios avisos son frases de dos oraciones (el de los filtros, el de
                // "lo mas barato"): con el `nowrap` de antes saldrian en una linea
                // infinita fuera de la pantalla.
                maxWidth: '300px', whiteSpace: 'normal',
                // La caja no puede robarle el hover al control ni taparle el clic.
                pointerEvents: 'none', opacity: '0',
                transition: 'opacity 120ms ease'
            });
            document.body.appendChild(el);
            _tipEl = el;
            return el;
        }

        // El peso 600 se reserva para los avisos que son UN VALOR —"Tiempo restante:
        // 16m", el "30 min" de un badge—, no para la prosa. Es la unica diferencia
        // entre los dos tipos de aviso, y vive en el texto y no en la caja: dos cajas
        // distintas en el mismo panel se leerian como dos cosas distintas.
        function _tipIsValue(text) {
            return /\d/.test(text) && text.length <= 40;
        }

        // Coloca la caja. Dos reglas segun donde viva el control, porque el sitio
        // libre no esta en el mismo lado:
        //   - En el PANEL, al lado del panel entero y centrada en el control. El
        //     panel es estrecho y sus controles van apilados, asi que una caja encima
        //     del control taparia al de arriba; anclando al panel todos los avisos
        //     salen alineados en la misma columna en vez de bailar. Si a la izquierda
        //     no cabe (el panel se puede arrastrar), al otro lado.
        //   - En la pagina, encima del control y centrada en el, como cualquier
        //     tooltip. Si arriba no cabe, debajo.
        function _positionTip(anchor) {
            const el = _ensureTipNode();
            const panel = anchor.closest('#kick-drops-panel');
            const box = el.getBoundingClientRect();
            const a = anchor.getBoundingClientRect();
            const vw = document.documentElement.clientWidth;
            const vh = document.documentElement.clientHeight;
            let left, top;
            if (panel) {
                const p = panel.getBoundingClientRect();
                left = p.left - box.width - TIP_GAP;
                if (left < TIP_MARGIN) left = p.right + TIP_GAP;
                top = a.top + a.height / 2 - box.height / 2;
            } else {
                left = a.left + a.width / 2 - box.width / 2;
                top = a.top - box.height - TIP_GAP;
                if (top < TIP_MARGIN) top = Math.min(a.bottom + TIP_GAP, vh - box.height - TIP_MARGIN);
            }
            left = Math.max(TIP_MARGIN, Math.min(left, vw - box.width - TIP_MARGIN));
            top = Math.max(TIP_MARGIN, Math.min(top, vh - box.height - TIP_MARGIN));
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
        }

        // El texto de una fila de progreso se calcula al apuntarla, porque los
        // minutos que faltan cambian mientras ves el stream. Se devuelve tambien para
        // que el `title` guardado se actualice: asi el respaldo no se queda con una
        // cifra de hace media hora.
        function _tipDynamicText(anchor) {
            if (!anchor || anchor.dataset.dropTooltipAttached !== 'true') return '';
            const progress = _resolveKickProgress(anchor, anchor.dataset.dropRewardName || '');
            if (!progress) return '';
            const remaining = Math.max(0, progress.required - progress.current);
            return `${t.timeRemaining}: ${formatHoursMinutes(remaining)}`;
        }

        function _showTip(anchor) {
            // El panel se repinta entero con innerHTML en cada filtro, cada orden y
            // cada dato que llega, asi que el control apuntado puede haber dejado de
            // existir durante el cuarto de segundo de espera.
            if (!anchor || !anchor.isConnected) return;
            const text = _tipDynamicText(anchor) ||
                anchor.getAttribute('title') || anchor.getAttribute(TIP_STASH_ATTR) || '';
            if (!text) return;
            const el = _ensureTipNode();
            el.textContent = text;
            el.style.fontWeight = _tipIsValue(text) ? '600' : '400';
            // El `title` se GUARDA, no se borra: es el respaldo si esto falla y el
            // nombre accesible del control. Y se esconde mientras la caja esta
            // arriba para no tener los dos avisos a la vez.
            anchor.setAttribute(TIP_STASH_ATTR, text);
            anchor.removeAttribute('title');
            _tipAnchor = anchor;
            el.style.opacity = '1';
            _positionTip(anchor);
        }

        function _hideTip() {
            if (_tipTimer) { clearTimeout(_tipTimer); _tipTimer = null; }
            _tipPending = null;
            if (_tipAnchor) {
                const stashed = _tipAnchor.getAttribute(TIP_STASH_ATTR);
                if (stashed) {
                    _tipAnchor.title = stashed;
                    _tipAnchor.removeAttribute(TIP_STASH_ATTR);
                }
                _tipAnchor = null;
            }
            if (_tipEl) _tipEl.style.opacity = '0';
        }

        function _tipTargetFrom(node) {
            if (!node || !node.closest) return null;
            const el = node.closest(TIP_SELECTOR);
            return el && el.closest(TIP_SCOPE) ? el : null;
        }

        function _tipEnter(target) {
            if (!target) { if (_tipAnchor || _tipPending) _hideTip(); return; }
            if (target === _tipAnchor || target === _tipPending) return;
            _hideTip();
            _tipPending = target;
            _tipTimer = setTimeout(() => { _tipPending = null; _showTip(target); }, TIP_DELAY_MS);
        }

        // Una sola vez y por delegacion: no hay nada que reenganchar cuando el panel
        // se repinta, y un control nuevo hereda el aviso gratis por tener `title`.
        function _initOwnTooltips() {
            if (_tipBound) return;
            _tipBound = true;
            // `mouseover` salta en CADA elemento al que se entra, tambien en los que
            // no llevan aviso: por eso cierra la caja el simple hecho de salir del
            // control, sin necesidad de un mouseout aparte.
            document.addEventListener('mouseover', (e) => _tipEnter(_tipTargetFrom(e.target)));
            // Con el puntero fuera del documento ya no hay mouseover que la cierre.
            document.addEventListener('mouseleave', _hideTip);
            // focusin/focusout y NUNCA focus/blur: los de arriba burbujean.
            document.addEventListener('focusin', (e) => {
                const target = _tipTargetFrom(e.target);
                _hideTip();
                if (target) _showTip(target);
            });
            document.addEventListener('focusout', _hideTip);
            // Con la pagina en movimiento la caja se queda flotando fuera de sitio, y
            // tras un clic estorba (el control ya hizo lo suyo).
            window.addEventListener('scroll', _hideTip, { passive: true, capture: true });
            window.addEventListener('resize', _hideTip, { passive: true });
            document.addEventListener('click', _hideTip, true);
        }

        function _resolveKickProgress(li, rewardName) {
            const parsed = _parseKickLiTime(li);
            const campaignName = _findCampaignNameForKickLi(li);
            const campaign = campaignName ? _kickCampaigns[campaignName] : null;

            // Sin campaña del API y con el formato nuevo (que solo dice lo que falta),
            // lo visto sale de la BARRA. Con la fraccion `f` y los minutos que faltan:
            //
            //     faltan = total * (1 - f)   ->   total = faltan / (1 - f)
            //
            // Comprobado con el volcado del 2026-08-22: 22 min al 0.26666668 dan 30, y
            // 52 al 0.13333334 dan 60, que son los dos tramos reales de PUBG.
            //
            // El total se redondea a multiplos de 5 minutos porque el texto de Kick viene
            // truncado —escribe "5 h" con 5 h 50 min por delante—, y sin eso un tramo de
            // 15 h saldria en 14 h y pico. Lo que NO se toca es lo que falta: ese numero
            // es el que Kick enseña y el que el usuario va a comparar con el aviso.
            //
            // Solo con fraccion ESTRICTAMENTE mayor que 0. Un 0 no se distingue de la
            // barra vieja —que venia siempre a 0 aunque llevaras media hora vista— y
            // resolver ahi daria el "0 / 49 min · 0%" de siempre, que es mentir con
            // aspecto de dato. Y con la barra al 1 tampoco hay nada que resolver: ese
            // drop ya esta listo para reclamar y ni siquiera lleva texto de tiempo.
            if (!campaign && !parsed.isTotal) {
                const f = _parseKickLiFraction(li);
                if (!Number.isFinite(f) || f <= 0 || f >= 1 || parsed.minutes <= 0) return null;
                const total = Math.round((parsed.minutes / (1 - f)) / 5) * 5;
                if (total <= parsed.minutes) return null;
                return {
                    current: total - parsed.minutes,
                    required: total,
                    rewardName: rewardName || '',
                    // Sin API no hay `image_url`: el modal se cae a la <img> del propio
                    // <li>, que es la misma imagen.
                    imageUrl: '',
                    campaignName
                };
            }

            // `current` = `progress_units` de la campaña (minutos vistos
            // acumulados). El response confirma que se popula incluso para
            // campañas en progreso (ED'S DROP -> 4).
            //
            // El `aria-valuenow` de la barra ya NO es siempre 0: eso valia cuando el
            // progreso solo se veia en el inventario. Desde que la pestaña de campañas
            // lo enseña (volcado del 2026-08-22) la barra trae la fraccion en
            // `aria-valuenow`/`data-value` (0.26666668) y el porcentaje en
            // `aria-valuetext` ("27%"). Se sigue sin usar, pero por otro motivo: con la
            // API delante el dato de ella es exacto y este viene redondeado. Lo que si
            // habilita —y todavia no se hace— es resolver el progreso SIN API: con la
            // fraccion `f` y los minutos que faltan del texto, el total sale de
            // `faltan / (1 - f)` y lo visto de la resta.
            let current = campaign ? campaign.progress_units : 0;

            // Fallback sin API: reconstruir lo visto desde el % visible. Solo aplica
            // al formato viejo, que es el unico que trae total y porcentaje juntos.
            if (!campaign && parsed.isTotal) {
                const pct = _parsePercentFromKickLi(li);
                if (Number.isFinite(pct)) current = Math.round(parsed.minutes * (pct / 100));
            }

            // Total estimado a partir del DOM: directo si el texto es el total, o
            // visto + faltante si el texto es lo que falta.
            const domTarget = parsed.minutes > 0
                ? (parsed.isTotal ? parsed.minutes : current + parsed.minutes)
                : 0;

            // El total bueno es el `required_units` del API; el estimado del DOM solo
            // sirve para elegir CUAL de los tiers es este LI. Hace falta el redondeo
            // porque Kick trunca lo que falta ("5 h" por 5 h 50 min), asi que se toma
            // el tier mas cercano al estimado en vez de exigir igualdad: con 550 vistos,
            // "5 h" -> 850 -> cae en el tier de 900 (15 h) y no en el de 600 (10 h).
            // Filtrar por nombre primero acota cuando la campaña repite nombres con
            // distinto `required_units` (e.g. "x1 entry" en ED'S DROP).
            let candidates = campaign
                ? (campaign.rewards || []).filter(r => Number(r.required_units) > 0)
                : [];
            if (rewardName && candidates.length) {
                const byName = candidates.filter(r => r.name === rewardName);
                if (byName.length) candidates = byName;
            }

            let matched = null;
            if (candidates.length === 1) {
                matched = candidates[0];
            } else if (candidates.length > 1 && domTarget > 0) {
                matched = candidates.reduce((best, r) => (
                    !best || Math.abs(Number(r.required_units) - domTarget) <
                            Math.abs(Number(best.required_units) - domTarget) ? r : best
                ), null);
            }

            const required = matched ? Number(matched.required_units) : domTarget;
            if (required <= 0) return null;

            return {
                current,
                required,
                // El nombre del tier tambien sale del API cuando el DOM no lo da: sus
                // clases cambian cada tanto y el selector se queda sin match, y con el
                // tier ya identificado no hace falta el DOM.
                rewardName: rewardName || (matched ? (matched.name || '') : ''),
                imageUrl: matched && matched.image_url ? KICK_CDN_BASE + matched.image_url : '',
                campaignName
            };
        }

        // Mismo techo de altura que createModalContainer, y por lo mismo: aqui la lista de
        // recompensas de una campana grande tambien puede pasar de la ventana.
        function createKickModal() {
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '24px', boxSizing: 'border-box',
                backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '999999',
                transition: 'opacity 180ms ease', opacity: '0'
            });
            const box = document.createElement('div');
            Object.assign(box.style, {
                backgroundColor: colors.surface, color: colors.text, borderRadius: '14px',
                padding: '24px 28px', minWidth: 'min(320px, 100%)', maxWidth: '480px',
                maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: `1px solid ${colors.primary}`,
                fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px',
                transition: 'transform 180ms ease, opacity 180ms ease',
                transform: 'translateY(8px) scale(0.98)', opacity: '0'
            });
            overlay.appendChild(box);
            return { overlay, box };
        }

        function openKickDropModal(li, rewardName) {
            const progress = _resolveKickProgress(li, rewardName);
            if (!progress) return;
            const remaining = Math.max(0, progress.required - progress.current);
            const pct = progress.required > 0
                ? Math.round((progress.current / progress.required) * 100)
                : 0;

            const { overlay, box } = createKickModal();

            // Header con imagen + título + subtítulo "Detalle del drop"
            // (mismo layout que el modal de Twitch).
            const header = document.createElement('div');
            Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' });
            const liImg = li.querySelector('img');
            const imgSrc = progress.imageUrl || (liImg ? liImg.src : '');
            if (imgSrc) {
                const img = document.createElement('img');
                img.src = imgSrc;
                Object.assign(img.style, {
                    width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover',
                    border: `1px solid ${colors.border}`
                });
                header.appendChild(img);
            }
            const titleWrap = document.createElement('div');
            const title = document.createElement('div');
            title.textContent = progress.rewardName || progress.campaignName || t.dropDetails;
            Object.assign(title.style, { fontSize: '16px', fontWeight: '700', color: colors.text });
            titleWrap.appendChild(title);
            const subtitle = document.createElement('div');
            subtitle.textContent = t.dropDetails;
            Object.assign(subtitle.style, { fontSize: '11px', color: colors.gray, marginTop: '2px' });
            titleWrap.appendChild(subtitle);
            header.appendChild(titleWrap);
            box.appendChild(header);

            const lineProgress = document.createElement('div');
            lineProgress.style.marginBottom = '6px';
            lineProgress.innerHTML = `<span style="color:${colors.gray}">${t.progress}:</span> <span style="font-weight:600">${progress.current} / ${progress.required} ${t.minutesShort} · ${pct}%</span>`;
            box.appendChild(lineProgress);

            const lineRemaining = document.createElement('div');
            lineRemaining.style.marginBottom = '12px';
            lineRemaining.innerHTML = `<span style="color:${colors.gray}">${t.timeRemaining}:</span> <span style="font-weight:700;color:${colors.primary}">${formatHoursMinutes(remaining)}</span>`;
            box.appendChild(lineRemaining);

            // Sección "Recompensas:" — espeja a Twitch. En Kick cada tier es una
            // recompensa individual (no hay benefitEdges separados), así que la
            // lista contiene solo el reward del tier hovereado.
            if (progress.rewardName) {
                const rewardsTitle = document.createElement('div');
                rewardsTitle.textContent = `${t.rewards}:`;
                Object.assign(rewardsTitle.style, { color: colors.gray, fontSize: '12px', marginBottom: '4px' });
                box.appendChild(rewardsTitle);
                const ul = document.createElement('ul');
                Object.assign(ul.style, { margin: '0 0 12px 0', paddingLeft: '18px' });
                const liEl = document.createElement('li');
                liEl.textContent = progress.rewardName;
                liEl.style.fontSize = '13px';
                ul.appendChild(liEl);
                box.appendChild(ul);
            }

            const actions = document.createElement('div');
            Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px' });
            const closeBtn = document.createElement('button');
            closeBtn.textContent = t.accept || 'OK';
            Object.assign(closeBtn.style, {
                padding: '6px 12px', backgroundColor: colors.surface,
                color: colors.primary, border: `1px solid ${colors.primary}`,
                borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
            });
            const detach = attachDismissHandlers(overlay, () => { closeOverlayAnimated(overlay); });
            closeBtn.onclick = () => { detach(); closeOverlayAnimated(overlay); };
            actions.appendChild(closeBtn);
            box.appendChild(actions);

            document.body.appendChild(overlay);
            // Este modal solo enfoca el boton de cerrar y no tiene bucle de Tab propio
            // (a diferencia de los de input y confirmacion): la contencion del foco la da
            // el inert, que deja sin foco todo lo que hay detras. Lo deshace
            // closeOverlayAnimated, y por eso este modal cierra por ahi y no por una
            // funcion propia. Mismo tratamiento que los otros cuatro modales.
            try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                box.style.transform = 'translateY(0) scale(1)';
                box.style.opacity = '1';
            });
            setTimeout(() => closeBtn.focus(), 100);
        }

        function attachKickDropTooltipAndModal(li, rewardName) {
            if (!li || li.dataset.dropTooltipAttached === 'true') return;
            li.dataset.dropTooltipAttached = 'true';
            li.style.cursor = 'pointer';
            // El aviso ya no se engancha aqui: lo pinta el motor por delegacion
            // leyendo el `title`, igual que los del panel (ver _initOwnTooltips).
            // Aqui solo se deja PUESTO ese `title`, y eso añade algo que antes no
            // habia: si la caja fallara, sale el aviso del navegador en su lugar. El
            // nombre de la recompensa viaja en el dataset porque el texto se
            // recalcula al apuntar —los minutos que faltan cambian mientras ves— y
            // ahi ya no hay closure donde leerlo (ver _tipDynamicText).
            if (rewardName) li.dataset.dropRewardName = rewardName;
            const progress = _resolveKickProgress(li, rewardName);
            if (progress) {
                const remaining = Math.max(0, progress.required - progress.current);
                li.title = `${t.timeRemaining}: ${formatHoursMinutes(remaining)}`;
            }
            li.addEventListener('click', (e) => {
                if (e.target.closest('a, button, input')) return;
                // Si no hay progreso resoluble, dejar pasar el click a Kick en vez de
                // tragarselo con un preventDefault que no abre nada.
                if (!_resolveKickProgress(li, rewardName)) return;
                e.preventDefault();
                e.stopPropagation();
                _hideTip();
                openKickDropModal(li, rewardName);
            });
        }

        // Register progress-data callback for the document-start interceptor
        _onProgressDataReady = _onProgressData;

        // If progress data was already intercepted before load fired, build the map now
        if (_progressInventoryReady && _interceptedAllCampaigns.length > 0) {
            _onProgressData();
        }

        // Register callback so the fetch interceptor (outside load listener) can trigger render
        _onClaimedDataReady = _renderClaimedInventory;

        // If data was already intercepted before load fired, render now
        if (_claimedInventoryReady && _interceptedClaimedCampaigns.length > 0 && _isClaimedPage()) {
            setTimeout(() => _renderClaimedInventory(), 1000);
        }

        // =============================================
        // INVENTORY CLEANUP (cleanInventory)
        // =============================================

        // Localized texts for claimed/unavailable drop detection
        const CLAIMED_TEXTS = [
            "pedido", "claimed", "beansprucht", "réclamé", "resgatado",
            "востребовано", "talep edildi", "受け取り済み", "수령 완료", "odebrano",
            "lunastettu", "đã nhận", "已领取", "تم المطالبة", "दावा किया गया", "diklaim"
        ];

        // Localized texts for the "Expired" section heading on the Kick inventory page.
        // Matched case-insensitively against the exact trimmed text of the <h1>.
        const EXPIRED_HEADER_TEXTS = [
            "expiró", "expired", "abgelaufen", "expiré", "expirou", "expirado",
            "scaduto", "истекшие", "süresi dolan", "期限切れ", "만료됨",
            "wygasłe", "vanhentunut", "hết hạn", "已过期", "已過期",
            "انتهت صلاحيته", "समाप्त हो गया", "kedaluwarsa", "หมดอายุ"
        ];

        // =============================================
        // DETECCION DEL BOTON DE RECLAMAR (agnostica al idioma)
        // =============================================
        // El script traduce su UI a 16 idiomas, asi que el auto-claim no puede depender
        // de que la UI de Kick este en ingles o espanol.
        //
        // El dato que ordena los criterios: el desarrollo original del auto-claim se hizo
        // sobre el DOM de Kick en ESPANOL, y aun asi el aria-label venia en ingles
        // ("Claim"). O sea, Kick NO traduce ese atributo: es la senal verificada y por eso
        // va primero. El resto son refuerzos por si algun dia lo localizan (suele pasar en
        // una segunda pasada de accesibilidad), no sustitutos.
        //
        // Todo esto se evalua dentro del <li> de un drop cuya barra ya esta en
        // [role="progressbar"][data-state="complete"], que es la senal de "listo para
        // reclamar" y tampoco se traduce.

        // RESPALDO por texto, ultimo recurso: solo se consulta cuando el <li> tiene mas de
        // un boton accionable y ninguno trae senal estructural. Mismo patron que
        // CLOSED_HEADER_TEXTS en twitch-drops-highlighter.user.js: minusculas, comparado
        // con includes() contra el textContent del boton.
        //
        // TODO: rellenar verificando el texto real del boton en cada idioma de la UI de
        // Kick (Settings -> Language). Un texto por idioma, en minusculas, en el mismo
        // orden que i18n y que CLAIMED_TEXTS:
        //   es, en, de, fr, pt, ru, tr, ja, ko, pl, fi, vi, zh, ar, hi, id
        // Vacio a proposito: no se inventan traducciones.
        const CLAIM_BUTTON_TEXTS = [];

        // Se avisa una sola vez por sesion: si el DOM de Kick cambia y la deteccion se
        // vuelve ambigua, queda rastro en consola para ajustarla con el DOM real.
        let _claimAmbiguityWarned = false;

        /**
         * findClaimButtonInDropItem(item)
         *
         * Devuelve el boton de reclamar de un drop, o null si no se puede identificar con
         * confianza. NO adivina: ante varios candidatos sin senal prefiere no reclamar,
         * porque un click errado dentro del bucle de auto-claim es peor que no reclamar.
         */
        function findClaimButtonInDropItem(item) {
            if (!item) return null;

            const candidates = Array.from(item.querySelectorAll('button')).filter(btn => {
                if (btn.disabled) return false;
                if (btn.getAttribute('aria-disabled') === 'true') return false;
                if (btn.dataset.kickInjected === 'true') return false; // botones nuestros (❌)
                return true;
            });
            if (candidates.length === 0) return null;

            // 1. aria-label en ingles: la senal verificada (ver nota de arriba). El flag "i"
            //    del selector sustituye al par Claim/claim que se duplicaba antes.
            const labelled = candidates.find(btn => btn.matches('[aria-label*="claim" i]'));
            if (labelled) return labelled;

            // 2. Por descarte: si la barra del drop esta completa y hay un unico boton
            //    accionable, ese es el de reclamar. Cubre el dia que traduzcan el aria-label.
            if (candidates.length === 1) return candidates[0];

            // 3. Respaldo por texto (vacio hasta verificar los textos en el sitio).
            if (CLAIM_BUTTON_TEXTS.length > 0) {
                const byText = candidates.find(btn => {
                    const txt = (btn.textContent || '').trim().toLowerCase();
                    return txt && CLAIM_BUTTON_TEXTS.some(ct => txt.includes(ct));
                });
                if (byText) return byText;
            }

            if (!_claimAmbiguityWarned) {
                _claimAmbiguityWarned = true;
                console.warn(
                    '[Kick Drops Highlighter] Drop listo para reclamar con',
                    candidates.length,
                    'botones y ninguna senal reconocible; no se reclama automaticamente.'
                );
            }
            return null;
        }

        /**
         * claimDropButton(btn, delaySlot)
         *
         * Marca y programa el click, escalonado para no disparar N peticiones a la vez.
         * Devuelve true si programo el click; false si ese boton ya se habia atendido.
         */
        // Reclamado un drop, el dato que tenemos en memoria dice lo contrario de lo que
        // acaba de pasar: /drops/progress se pidio ANTES y ahi esa recompensa sigue por
        // cobrar. Y de ese dato cuelga todo lo que habla de reclamado —el ✓ del panel, el
        // 🎁 de lo ganado sin recoger, el «te faltan» y el ocultar completados—, asi que
        // sin volver a pedirlo el drop recien reclamado se queda con su chip naranja y su
        // baldosa en la pagina hasta la recarga automatica, que son 15 minutos.
        //
        // Se pide UNA vez y con margen: los clics de una tanda van escalonados de 200 ms
        // y cada uno reprograma esto, asi que la peticion sale una sola vez, despues del
        // ultimo. Los 3 s son para darle tiempo al servidor de Kick a apuntarlo; si aun
        // asi llegara pronto, la unica consecuencia es que el ✓ tarda un ciclo mas.
        const PROGRESS_REFETCH_MS = 3000;
        let _progressRefetchTimer = null;

        function _scheduleProgressRefetch() {
            if (_progressRefetchTimer) clearTimeout(_progressRefetchTimer);
            _progressRefetchTimer = setTimeout(() => {
                _progressRefetchTimer = null;
                _fetchClaimedInventory(true);
            }, PROGRESS_REFETCH_MS);
        }

        function claimDropButton(btn, delaySlot) {
            if (!btn || btn.dataset.kickAutoClicked) return false;
            btn.dataset.kickAutoClicked = "true";
            setTimeout(() => {
                btn.click();
                _scheduleProgressRefetch();
            }, delaySlot * 200);
            return true;
        }

        /**
         * cleanInventory()
         *
         * Handles auto-claim of completed drops, hiding fully-claimed campaigns,
         * selective per-campaign hiding via ❌ buttons, and hiding previously deleted campaigns.
         *
         * Drop states in Kick inventory:
         * - In progress: has progressbar[data-state="loading"], shows "63% de 2 h"
         * - Ready to claim: has progressbar[data-state="complete"] + el boton que devuelve
         *   findClaimButtonInDropItem() (identificado sin depender del idioma)
         * - Already claimed: NO progressbar, span text is "Pedido"/"Claimed"
         *
         * `type` tiene tres valores y el tercero es nuevo:
         *   "expired"  -> reclama Y oculta (lo de siempre, en la pestaña de reclamados)
         *   "claim"    -> reclama y NO oculta nada
         *   ""         -> ni una cosa ni la otra (checkbox apagado); solo el tooltip
         *                 de progreso y los ❌ que el usuario ya habia puesto
         *
         * El modo "claim" existe por el rediseño: las barras de progreso y el boton de
         * reclamar se fueron de la pestaña de reclamados —que ahora es solo el
         * escaparate de lo ya conseguido— a la de campañas. Para que el auto-claim
         * siga existiendo hay que barrer tambien ahi, pero SIN la parte de ocultar:
         * esconder campañas abiertas en la pagina de campañas abiertas no es lo que
         * pide el checkbox, y encima pelearia con el resaltado verde.
         */
        function cleanInventory(type = "expired", onDone = null) {
            let attempts = 0;
            const maxAttempts = 15;
            const interval = 600;
            const doClaim = (type === "expired" || type === "claim");
            let doneCalled = false;
            const finish = () => {
                if (doneCalled) return;
                doneCalled = true;
                if (typeof onDone === 'function') { try { onDone(); } catch (e) { /* ignore */ } }
            };

            const checker = setInterval(() => {
                attempts++;

                // La pestaña /drops/claimed es, ENTERA, lo ya reclamado: no trae ni
                // barras de progreso ni boton de reclamar, asi que el estado no se
                // puede leer <li> a <li> como en el inventario viejo —donde lo en
                // curso y lo ya cobrado convivian—. Aqui no hay nada que distinguir:
                // se esconde el bloque entero de Kick y en su sitio queda nuestra
                // rejilla, que es la que ademas dice cuando conseguiste cada cosa. Se
                // detecta por la AUSENCIA de barras, no por texto, para no depender del
                // idioma.
                // Las barras que cuentan son las de KICK. La baldosa del cofre trae la
                // suya desde el 2026-08-22, y sin descontarla la pestaña de reclamados
                // dejaria de parecer el escaparate en cuanto el cofre estuviera a medias:
                // el barrido se pondria a leer estados <li> a <li> donde no hay ninguno
                // que leer, y a esconder por su cuenta lo que ya gestiona la rejilla.
                const isTrophyCase = _isClaimedPage() &&
                    _dropsQuery('[role="progressbar"]')
                        .filter(b => !b.closest('#kick-claimed-inventory')).length === 0;

                // En el escaparate, esconder lo de Kick NO se decide aqui. Se decide al
                // pintar la rejilla (ver _hideKickClaimedBlocks), que es lo unico que sabe
                // si de verdad hay algo con lo que sustituirlo. Aqui se hacia por libre y
                // por eso la pestaña se quedaba en blanco cuando la rejilla no llegaba.
                //
                // Lo que si se hace aqui es lo contrario: si la rejilla ya no esta —un
                // repintado que se rindio a mitad—, se devuelve lo de Kick. Este barrido
                // corre en un intervalo, asi que es el sitio natural para vigilarlo.
                const gridPainted = !!document.getElementById('kick-claimed-inventory');
                if (isTrophyCase && !gridPainted) _restoreKickClaimedBlocks();
                const doHide = isTrophyCase ? false : (type === "expired");

                // En CAMPAÑAS lo que sobra no es la campaña, es la recompensa que ya
                // cobraste; va por su cuenta y no por `doHide`, que aqui es false a
                // proposito (ver _updateClaimedTilesHidden). Se repite en cada intento
                // porque /drops/progress puede llegar despues del primero.
                _updateClaimedTilesHidden();

                // Hide the whole "Expiró" section (heading + all campaigns under it).
                // Kick groups already-expired campaigns under a localized <h1> sibling of the campaigns list.
                // Solo existe en el DOM viejo: en el nuevo no hay seccion de expirados
                // (el unico <h1> de la pestaña dice "Drops"), asi que esto no encuentra
                // nada y se queda como compatibilidad.
                if (doHide) {
                    _dropsQuery('h1').forEach((h1) => {
                        const text = (h1.textContent || '').trim().toLowerCase();
                        if (!text) return;
                        if (!EXPIRED_HEADER_TEXTS.some(t => text === t)) return;
                        const section = h1.parentElement;
                        if (section) section.style.display = 'none';
                    });
                }

                // Find all campaign accordion containers in the inventory.
                // Fuera lo que cuelgue de una pestaña oculta: son campañas de otra
                // seccion y reclamar o esconder ahi es actuar sobre lo que el usuario
                // no esta viendo.
                const campaignContainers = _dropsQuery('.bg-surface-base')
                    .filter(n => !_isInHiddenPanel(n));

                if (campaignContainers.length === 0 && attempts >= maxAttempts) {
                    clearInterval(checker);
                    finish();
                    return;
                }

                if (campaignContainers.length === 0) return;

                let claimIndex = 0;

                campaignContainers.forEach(function (container) {
                    // Skip containers inside our custom claimed inventory section
                    if (container.closest('#kick-claimed-inventory')) return;

                    // La unidad de este barrido es el JUEGO, igual que la tarjeta del
                    // panel. En el DOM nuevo la sub-campaña tambien es
                    // `.bg-surface-base`, asi que sin este descarte cada juego se
                    // procesaria una vez por si mismo y otra por cada sub-campaña: doce
                    // botones ❌ en la pagina de Rust, y un "ocultar" con la granularidad
                    // equivocada. Sus <li> ya entran por el grupo, que los contiene todos.
                    if (_isNewCampaignCard(container)) return;

                    // Bloque que se esconde al ocultar una campaña: en el DOM viejo el
                    // acordeon de Radix que envuelve al juego, y en el nuevo —donde no hay
                    // acordeon— el propio grupo, que es este mismo nodo.
                    const hideTarget = () => container.closest('[data-orientation="vertical"]') || container;

                    // El ❌ ("eliminar del inventario") y el ocultado de lo ya descartado
                    // vivian aqui, colgados de la cabecera de cada grupo de Kick. Ahora
                    // esos grupos se esconden SIEMPRE en la pestaña de reclamados, asi que
                    // el boton quedaba dentro de algo invisible: inalcanzable. Se movio a
                    // las tarjetas de nuestra rejilla (ver _renderClaimedInventory), que es
                    // lo unico que se ve ahi.
                    //
                    // De paso cambia la unidad: antes se descartaba el JUEGO entero y
                    // ahora la RECOMPENSA, que es lo que la rejilla enseña de una en una.
                    // La clave guardada pasa de ser el nombre del grupo a ser el id (ULID)
                    // de la reward, asi que lo que hubiera descartado de antes deja de
                    // casar y reaparece una vez; "Recargar drops" lo vacia igual.

                    // Find all drop items (li elements) inside this campaign
                    const dropItems = container.querySelectorAll('li');
                    if (dropItems.length === 0) return;

                    let allClaimedOrComplete = true;
                    let hasClaimableButton = false;

                    dropItems.forEach(function (li) {
                        const progressBar = li.querySelector('[role="progressbar"]');
                        const statusSpan = li.querySelector('.text-surface-onSurfaceSecondary');
                        const statusText = statusSpan ? statusSpan.textContent.trim().toLowerCase() : '';

                        if (progressBar) {
                            const state = progressBar.getAttribute('data-state');
                            if (state === 'complete') {
                                // Ready to claim - auto-click the claim button (deteccion
                                // agnostica al idioma, ver findClaimButtonInDropItem)
                                if (doClaim) {
                                    const claimBtn = findClaimButtonInDropItem(li);
                                    if (claimDropButton(claimBtn, claimIndex)) {
                                        claimIndex++;
                                        hasClaimableButton = true;
                                    }
                                }
                                // Still counts as complete for hiding purposes
                            } else {
                                // loading/indeterminate = in progress
                                allClaimedOrComplete = false;
                                // Attach hover-tooltip + click-modal showing remaining time
                                //
                                // El nombre del tier desempata cuando la campaña
                                // repite minutos entre tramos; sin el,
                                // `_resolveKickProgress` elige solo por cercania. El
                                // como se lee esta en _rewardNameOfLi.
                                const rewardName = _rewardNameOfLi(li);
                                attachKickDropTooltipAndModal(li, rewardName);
                            }
                        } else {
                            // No progressbar - check if already claimed via text
                            const isClaimed = CLAIMED_TEXTS.some(ct => statusText.includes(ct));
                            if (isClaimed && doHide) {
                                // Hide individual claimed drop items
                                li.style.display = 'none';
                            }
                            if (!isClaimed) {
                                // Unknown state, don't consider fully complete
                                allClaimedOrComplete = false;
                            }
                        }
                    });

                    // En el escaparate no hay estado que leer: el grupo entero cuenta
                    // como reclamado (ver isTrophyCase).
                    if (isTrophyCase) allClaimedOrComplete = true;

                    // Hide fully-claimed campaigns when checkbox is active
                    if (doHide && allClaimedOrComplete && !hasClaimableButton && dropItems.length > 0) {
                        const accordion = hideTarget();
                        if (accordion && accordion.parentElement) {
                            accordion.style.display = 'none';
                        }
                    }
                });

                // Fallback: drops listos para reclamar que quedaron fuera del barrido por
                // contenedor (los que no cuelgan de .bg-surface-base). Se ancla en la barra
                // completa, que no se traduce, en vez de en el texto del boton: ese texto
                // era justo lo que dejaba fuera a todos los idiomas salvo es/en.
                if (doClaim) {
                    let fallbackSlot = claimIndex;
                    _dropsQuery('[role="progressbar"][data-state="complete"]').forEach(function (bar) {
                        // El <li> acota la busqueda a un solo drop. Si no hay <li> se sube al
                        // bloque de la campana; ahi puede haber varios botones, y en ese caso
                        // findClaimButtonInDropItem se abstiene en vez de arriesgar el click.
                        const item = bar.closest('li') || bar.closest('[class*="bg-surface"]');
                        if (!item || item.closest('#kick-claimed-inventory')) return;
                        // Ni un click dentro de una pestaña escondida: es una campaña que
                        // el usuario no esta viendo y el boton podria ni responder.
                        if (_isInHiddenPanel(item)) return;
                        if (claimDropButton(findClaimButtonInDropItem(item), fallbackSlot)) {
                            fallbackSlot++;
                        }
                    });
                }

                if (attempts >= maxAttempts) {
                    clearInterval(checker);
                    // Fetch and render claimed inventory section after cleanup finishes
                    _fetchClaimedInventory();
                    finish();
                }
            }, interval);
        }

        // =============================================
        // RECOMPENSA DIARIA (cofre / daily reward)
        // =============================================
        // Kick agrega un "cofre" de recompensa diaria en la barra superior. El boton
        // del navbar tiene aria-haspopup="dialog" y, cuando la recompensa esta
        // DISPONIBLE, muestra un <video src=".../rewards/reward-available-CTA.webm">
        // en vez del icono estatico del cofre. Al pulsarlo abre un modal Radix con un
        // boton primario (.bg-primary-base) "Reclamar" que puede estar:
        //   - habilitado                     -> reclamar (click)
        //   - deshabilitado + cuenta regresiva ("Mira X minutos mas") -> aun no
        //   - deshabilitado + "Reclamado"    -> ya reclamado hoy
        // Solo abrimos el modal cuando el CTA "reward-available" esta presente, asi
        // evitamos abrir/cerrar el dialogo mientras el usuario navega. Todo el matching
        // es independiente del idioma (paths de SVG + clases utilitarias).
        // Gated por cleanExpiredInventoryFlag (la "reclamacion automatica").
        //
        // ORDEN respecto a la revision de drops: el cofre se revisa SIEMPRE despues de
        // que termina la revision de drops, nunca en medio. Es decir:
        //   - En /inventory: primero se revisan campañas (para escanear) y se vuelve al
        //     inventario a auto-reclamar los drops; recien cuando eso termina, el cofre.
        //   - En /all-campaigns: se espera a que termine el escaneo de la campaña.
        // Esto evita que el modal del cofre robe foco o se solape con la navegacion
        // entre pestañas y el auto-claim del inventario. El flag _dropsReviewInProgress
        // marca ese periodo y _checkDailyReward() se abstiene mientras dure.
        let _dailyRewardBusy = false;
        let _dropsReviewInProgress = false;

        // Se llama en cada punto de finalizacion real de la revision de drops.
        function _finishDropsReview() {
            _dropsReviewInProgress = false;
            setTimeout(_checkDailyReward, 1500);
        }

        function _findDailyRewardButton() {
            const buttons = document.querySelectorAll('button[aria-haspopup="dialog"]');
            for (const b of buttons) {
                if (b.querySelector('video[src*="static.kick.com/rewards"]') ||
                    b.querySelector('svg path[d^="M6 7.33301"]')) {
                    return b;
                }
            }
            return null;
        }

        function _getOpenRewardDialog() {
            // El dialogo Radix del cofre reusa el mismo icono (path M6 7.33301) en su
            // header y contiene el boton primario de reclamo.
            const dialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]');
            for (const d of dialogs) {
                if (d.querySelector('svg path[d^="M6 7.33301"]') ||
                    d.querySelector('button.bg-primary-base')) {
                    return d;
                }
            }
            return null;
        }

        function _closeRewardDialog(dialog) {
            if (!dialog) return;
            let closeBtn = null;
            const xPath = dialog.querySelector('svg path[d^="M28 6.99204"]');
            if (xPath) closeBtn = xPath.closest('button');
            if (!closeBtn) {
                dialog.querySelectorAll('button').forEach((b) => {
                    if (!closeBtn && /close|cerrar/i.test(b.querySelector('span.sr-only')?.textContent || '')) {
                        closeBtn = b;
                    }
                });
            }
            if (closeBtn) { try { closeBtn.click(); return; } catch (e) { /* ignore */ } }
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }

        // Aparte del modal, Kick lanza un toast de sonner ("Daily Reward Unlocked! /
        // Claim your Daily Reward") arriba a la derecha, con un boton "Reclamar" y una X.
        // Es un <li data-sonner-toast> fuera del dialogo, asi que _closeRewardDialog()
        // no lo toca y se queda tapando la UI hasta que el usuario lo cierra a mano.
        // Lo cerramos SIEMPRE por la X, nunca por "Reclamar": ese boton abre el modal
        // del cofre por su cuenta y se pisaria con nuestro propio flujo.
        // El matching es por el icono del cofre (mismo path que el navbar y el dialogo),
        // no por texto, para no cerrar toasts ajenos ni depender del idioma.
        function _dismissDailyRewardToast() {
            document.querySelectorAll('li[data-sonner-toast]').forEach((toast) => {
                if (!toast.querySelector('svg path[d^="M6 7.33301"]')) return;
                let closeBtn = null;
                const xPath = toast.querySelector('svg path[d^="M28 6.99204"]');
                if (xPath) closeBtn = xPath.closest('button');
                if (!closeBtn) {
                    // Fallback: el ultimo boton que no sea el primario de reclamo.
                    const others = toast.querySelectorAll('button:not(.bg-primary-base)');
                    closeBtn = others[others.length - 1] || null;
                }
                if (closeBtn) { try { closeBtn.click(); } catch (e) { /* ignore */ } }
            });
        }

        function _checkDailyReward() {
            if (!cleanExpiredInventoryFlag) return; // atado a "reclamacion automatica"
            if (_dailyRewardBusy) return;

            // El toast se limpia en cada ciclo, aunque la recompensa ya este reclamada o
            // en cuenta regresiva: puede haber quedado de un reclamo anterior. Va antes
            // del guard de la revision de drops porque cerrarlo no navega ni roba foco.
            _dismissDailyRewardToast();

            // Esperar a que termine la revision de drops (escaneo/navegacion/auto-claim).
            if (_dropsReviewInProgress) return;

            // Y si YA hay un dialogo del cofre abierto, esta vuelta no hace nada: lo
            // normal es que lo hayas abierto tu desde la baldosa, y el automatico
            // pulsaria el mismo boton —que en Radix lo cerraria— para acabar cerrandolo
            // el mismo al no encontrar dialogo. Se espera al siguiente ciclo.
            if (_getOpenRewardDialog()) return;

            const chestBtn = _findDailyRewardButton();
            if (!chestBtn) return;

            // Solo actuar si la recompensa esta DISPONIBLE (CTA video presente),
            // asi no abrimos el modal en cada ciclo mientras esta en cuenta regresiva.
            if (!chestBtn.querySelector('video[src*="reward-available"]')) return;

            _dailyRewardBusy = true;
            try { chestBtn.click(); } catch (e) { _dailyRewardBusy = false; return; }

            let attempts = 0;
            const maxAttempts = 12; // ~3s
            const poll = setInterval(() => {
                attempts++;
                const dialog = _getOpenRewardDialog();
                if (dialog) {
                    clearInterval(poll);
                    const claimBtn = dialog.querySelector('button.bg-primary-base');
                    const isEnabled = claimBtn &&
                        !claimBtn.disabled &&
                        claimBtn.getAttribute('aria-disabled') !== 'true';
                    if (isEnabled) {
                        try { claimBtn.click(); } catch (e) { /* ignore */ }
                        console.log('Kick Drops Highlighter: recompensa diaria reclamada.');
                        // Cerrar tras dar tiempo a que se registre el reclamo.
                        setTimeout(() => {
                            _closeRewardDialog(_getOpenRewardDialog() || dialog);
                            _dismissDailyRewardToast();
                            _dailyRewardBusy = false;
                        }, 1800);
                    } else {
                        // Deshabilitado (cuenta regresiva o ya reclamado): cerrar y reintentar luego.
                        _closeRewardDialog(dialog);
                        _dailyRewardBusy = false;
                    }
                    return;
                }
                if (attempts >= maxAttempts) {
                    clearInterval(poll);
                    _closeRewardDialog(_getOpenRewardDialog());
                    _dailyRewardBusy = false;
                }
            }, 250);
        }

        // Reclamar el cofre A MANO, desde el boton de su tarjeta en la rejilla.
        //
        // Comparte los dos pasos con _checkDailyReward —abrir el cofre, pulsar su
        // primario— y se separa en las dos cosas que cambian cuando lo pide una persona:
        //
        //   · no exige el video de "disponible". Ese video vive en el cofre de la barra,
        //     y el guard esta ahi para no abrir el modal en cada vuelta del intervalo. Un
        //     clic no se repite en bucle, y quien lo da ya ha visto en la tarjeta que se
        //     puede cobrar.
        //   · NO cierra el modal. El automatico lo cierra porque nadie lo esta mirando;
        //     este lo deja abierto porque el resultado de Kick —lo que te ha tocado— es
        //     justamente lo que se ha pedido al pulsar.
        //
        // Devuelve si arranco la secuencia, para que el boton pueda volver a encenderse
        // cuando no habia cofre que abrir en la pagina.
        function _claimDailyRewardNow() {
            if (_dailyRewardBusy) return false;
            const chestBtn = _findDailyRewardButton();
            if (!chestBtn) return false;

            _dailyRewardBusy = true; // que el ciclo automatico no se meta en medio
            try { chestBtn.click(); } catch (e) { _dailyRewardBusy = false; return false; }

            let attempts = 0;
            const maxAttempts = 12; // ~3s
            const poll = setInterval(() => {
                attempts++;
                const dialog = _getOpenRewardDialog();
                if (dialog) {
                    clearInterval(poll);
                    const claimBtn = dialog.querySelector('button.bg-primary-base');
                    const isEnabled = claimBtn &&
                        !claimBtn.disabled &&
                        claimBtn.getAttribute('aria-disabled') !== 'true';
                    if (isEnabled) {
                        try { claimBtn.click(); } catch (e) { /* ignore */ }
                        console.log('Kick Drops Highlighter: recompensa diaria reclamada a mano.');
                    }
                    _dailyRewardBusy = false;
                    _refetchChallengesSoon();
                    return;
                }
                if (attempts >= maxAttempts) {
                    clearInterval(poll);
                    _dailyRewardBusy = false;
                }
            }, 250);
            return true;
        }

        // ABRIR EL MODAL DEL COFRE Y NADA MAS. Es lo que hace el boton del cofre de la
        // barra de arriba —el que Kick etiqueta «Claim Your Daily Reward»— y es lo unico
        // que hace: el modal ya decide por su cuenta si enseña la cuenta atras o el
        // boton de cobrar habilitado. Asi que no hay que reimplementar nada, solo
        // pulsarlo; _findDailyRewardButton lo reconoce por su icono, que es lo que no
        // depende del idioma de esa etiqueta.
        //
        // Se separa de _claimDailyRewardNow porque son dos intenciones distintas: aquel
        // pulsa ademas el primario del dialogo, y aqui todavia no se puede cobrar.
        function _openDailyRewardModal() {
            if (_getOpenRewardDialog()) return true;
            const chestBtn = _findDailyRewardButton();
            if (!chestBtn) return false;
            try { chestBtn.click(); } catch (e) { return false; }
            return true;
        }

        // Volver a pedir /challenges despues de un reclamo, para que la tarjeta pase a
        // "reclamado" —con la ✓ y lo que toco— sin recargar la pagina. Es el mismo apaño
        // que la relectura de /drops/progress tras reclamar un drop, y por lo mismo: el
        // dato que tenemos en memoria es de ANTES, asi que sin esto la tarjeta seguiria
        // ofreciendo un boton de reclamar lo que ya esta cobrado.
        const CHALLENGES_REFETCH_MS = 3000;
        let _challengesRefetchTimer = null;

        function _refetchChallengesSoon() {
            if (_challengesRefetchTimer) clearTimeout(_challengesRefetchTimer);
            _challengesRefetchTimer = setTimeout(() => {
                _challengesRefetchTimer = null;
                // Hay que vaciarlo: _ensureChallenges sale por la puerta de atras si ya
                // hay algo dentro.
                _kickChallenges = null;
                _ensureChallenges();
            }, CHALLENGES_REFETCH_MS);
        }

        // =============================================
        // CICLO DE VIDA / INICIALIZACION
        // =============================================

        // AQUI NO HAY CARTEL QUE TAPE LA PAGINA (quitado el 2026-08-11).
        //
        // Mientras escaneaba se levantaba un velo negro a pantalla completa con un
        // "Buscando drops..." en el centro. Sobraba: el panel ya lo dice —el cartel
        // naranja "Buscando..." y las cuentas de las solapas— y lo dice sin bloquear
        // nada, asi que el velo solo impedia usar la pagina durante unos segundos, y en
        // el peor caso los 10 intentos enteros.
        //
        // Corria en campañas, proximas y cerradas. En reclamados no: esa pestaña va por
        // _claimedPageWork y nunca lo levantaba, asi que ahi no habia nada que quitar.
        //
        // Con el se fue `_loadingOverlay`, que ademas de ser el nodo hacia de bandera en
        // la espera del cofre (`_dropsReviewInProgress || _loadingOverlay`). Ahi era
        // redundante y por eso la espera sigue igual de firme: `waitForDropsFunction`
        // pone `_dropsReviewInProgress` a true ANTES de arrancar el escaneo y solo lo
        // baja `_finishDropsReview`, o sea que la ventana del escaneo ya estaba dentro
        // de la de la revision, que dura mas.

        // El trabajo propio de la pestaña de reclamados: auto-claim de lo que quede y
        // nuestra rejilla. Se llama al final del recorrido y tambien cuando el recorrido
        // no se puede hacer, para no dejar la pagina sin nada.
        function _claimedPageWork() {
            cleanInventory(cleanExpiredInventoryFlag ? 'expired' : '', _finishDropsReview);
            _renderClaimedInventorySoon();
        }

        // La rejilla necesita DOS cosas que llegan cuando quieren: la respuesta de
        // /drops/progress y un grupo de Kick del que colgarse. Antes se intentaba UNA
        // vez a los 3 s: si al volver de campañas la SPA todavia no habia montado el
        // panel de reclamados —lo normal— _renderClaimedInventory no encontraba ancla,
        // se rendia en silencio y la rejilla no aparecia nunca. Ahora se reintenta
        // hasta que esta, que es la unica señal fiable de que se pudo pintar.
        const CLAIMED_GRID_TRIES = 12;
        const CLAIMED_GRID_POLL_MS = 1000;

        function _renderClaimedInventorySoon(tries = 0) {
            // Salirse de la pestaña cancela: la rejilla solo tiene sentido aqui, y si
            // el usuario se fue ya no hay nada que esperar. Se pregunta tambien por la
            // barra y no solo por la URL: este reintento vive un segundo por vuelta, que
            // es tiempo de sobra para caer justo en el cambio de pestaña.
            if (!_claimedTabIsFront()) return;
            if (_claimedInventoryReady) _renderClaimedInventory();
            else _fetchClaimedInventory();
            if (document.getElementById('kick-claimed-inventory')) return;
            if (tries >= CLAIMED_GRID_TRIES) return;
            setTimeout(() => _renderClaimedInventorySoon(tries + 1), CLAIMED_GRID_POLL_MS);
        }


        function waitForDropsFunction() {
            // La ruta se guarda NORMALIZADA y tal cual esta, sin traducirla a una
            // canonica: antes se reescribia a "/drops/all-campaigns" o
            // "/drops/inventory", y con tres rutas nuevas esa traduccion haria que
            // onUrlChange viera un cambio de pagina que no hubo (o al contrario).
            actualPath = _normalizePath(location.pathname);

            // Build the floating panel
            const resultsContainer = buildPanel();

            // Marca el inicio de la revision de drops; el cofre esperara a que termine.
            _dropsReviewInProgress = true;

            // ---------------------------------------------
            // AQUI YA NO SE CAMBIA DE PESTAÑA
            // ---------------------------------------------
            // Hubo un recorrido que saltaba a campañas y a proximas para llenar las
            // tres solapas del panel, y era imposible: las pestañas de Kick NO son
            // navegacion de SPA, recargan la pagina entera. Se vio en consola —un
            // "cargado (document-start)" nuevo despues de cada salto—, y lo que
            // provocaba era esto:
            //
            //   · cada salto relanza el script, asi que el recorrido en memoria muere
            //     y la instancia nueva se cree que salio de donde acaba de llegar;
            //   · de ahi el ping-pong de recargas entre campañas y proximas, y que
            //     entrando por reclamados acabaras en campañas;
            //   · y aunque la vuelta funcionara no serviria de nada, porque la recarga
            //     borra lo escaneado: el panel llegaria igual de vacio.
            //
            // Asi que el panel se llena de la API (ver _apiItemsFor), que devuelve las
            // tres secciones en una peticion y sin salir de la pagina. Lo que se lee
            // del DOM es solo lo de la pestaña que tienes delante, que es lo unico que
            // hace falta para el resaltado sobre las tarjetas.
            //
            // El log de la pestaña se queda: es lo que dijo que la deteccion de ruta
            // si funcionaba y que el fallo estaba en la navegacion.
            const tab = _isClaimedPage() ? 'claimed'
                : _isComingSoonPage() ? 'comingSoon'
                : _isCampaignsPage() ? 'campaigns'
                : _isExpiredPage() ? 'expired'
                : null;
            console.log('[Kick Drops] pestaña:', tab || 'DESCONOCIDA', location.pathname);

            if (tab === 'claimed') _claimedPageWork();
            else _startDropsPolling();
        }

        // Colapsa todos los acordeones de campaña que esten abiertos para que la
        // lista de /all-campaigns arranque compacta. Los acordeones son de Radix UI:
        // un click en el <button data-radix-collection-item> togglea data-state entre
        // "open"/"closed", asi que solo clickeamos los que esten en "open" (clickear
        // uno cerrado lo abriria). Se ejecuta UNA sola vez tras el primer escaneo;
        // a proposito no re-colapsamos despues para no pelear con el usuario cuando
        // expande una categoria manualmente. Los acordeones que cargan de forma
        // diferida (lazy) ya nacen "closed" por default, asi que no hace falta vigilarlos.
        function collapseAllCampaignAccordions() {
            // querySelectorAll deduplica aunque un boton matchee ambos selectores.
            // Acotado al area de drops: esto CLICKEA, y fuera de ahi hay acordeones de
            // Kick que no son nuestros (ver _dropsRoot).
            const openButtons = _dropsQuery(
                'button[data-radix-collection-item][data-state="open"], ' +
                '[data-orientation="vertical"] button[data-state="open"][aria-expanded="true"]'
            );
            openButtons.forEach(btn => {
                try { btn.click(); } catch (e) { /* ignore */ }
            });
        }

        // Cierre de la revision cuando NO hay que volver a la pestaña de reclamados.
        // En la vista de campañas quedan los drops listos para reclamar —desde el
        // rediseño es ahi donde estan las barras y el boton, no en reclamados—, asi que
        // se pasa el barrido en modo "claim" (reclama, no oculta) y el cofre espera a
        // que termine. En la de proximas no hay nada que reclamar: se cierra directo.
        function _finishReviewOutsideClaimed() {
            if (_isCampaignsPage()) {
                cleanInventory(cleanExpiredInventoryFlag ? 'claim' : '', _finishDropsReview);
            } else {
                _finishDropsReview();
            }
        }

        // Escanea la pestaña que hay delante y cierra la revision. Ya no hay parada
        // de recorrido que distinguir: se quito el recorrido (ver waitForDropsFunction).
        function _startDropsPolling() {
            // Empieza un escaneo: el panel vuelve a ser provisional. Se pone aqui y no al
            // arrancar el script porque esto se puede repetir sin recargar.
            _dropsScanDone = false;
            _updateApiLoadingBanner();
            let attempts = 0;
            const maxAttempts = 10;
            let waitForDrops = setInterval(() => {
                let found = 0;
                const seenTitlesLocal = new Set();

                // Kick campaign detection: look for accordion items with game names
                // Try multiple selector strategies for Kick's DOM
                const campaignNodes = _dropsQuery(
                    '[data-orientation="vertical"] [data-state], ' +
                    '[data-orientation="vertical"] button, ' +
                    '.bg-surface-base'
                );

                campaignNodes.forEach((node) => {
                    // Sin el filtro de pestaña oculta esta cuenta se falsea sola: en
                    // /drops/campaigns sin campañas abiertas, las tarjetas de la pestaña
                    // de reclamados —que estan en el DOM, escondidas— darian found >= 1 y
                    // el escaneo se declararia terminado sin haber encontrado nada,
                    // tapando el aviso de "no hay resultados, edita las keywords".
                    if (_isInHiddenPanel(node)) return;
                    const gameNameEl = _gameNameElOf(node);
                    if (!gameNameEl) return;
                    const text = gameNameEl.textContent.trim().toLowerCase();
                    // El mismo criterio que el escaneo, negativas incluidas. Una
                    // campaña descartada no debe dar la pagina por lista: si es la
                    // unica que hay, es mejor agotar los intentos y decir "no se
                    // encontro nada, edita las keywords" que enseñar una pestaña
                    // vacia sin explicar por que.
                    //
                    // Y "el mismo criterio" incluye el rescate por la API: si no, una fila
                    // que el escaneo SI va a marcar no contaba aqui, y con ella sola
                    // delante la sonda agotaba los diez intentos —diez segundos de espera
                    // para acabar marcandola igual—.
                    if (!_matchesKeywords(text)) {
                        if (_hasNegativeKeyword(text)) return;
                        if (!_apiEntryForCard(text)) return;
                    }
                    if (seenTitlesLocal.has(text)) return;
                    seenTitlesLocal.add(text);
                    found++;
                });

                if (found >= 1) {
                    clearInterval(waitForDrops);
                    // Lo que el panel vaya a decir ya esta decidido: fuera el cartel.
                    _dropsScanDone = true;
                    _updateApiLoadingBanner();
                    // El escaneo va acotado: el intervalo ya esta cortado, asi que una
                    // excepcion aqui —leyendo una forma de DOM que no esperabamos— se
                    // llevaria por delante todo lo que viene despues, incluido el
                    // auto-claim. Se anota el fallo y se sigue.
                    try {
                        highlightAndLinkDrops();
                        _updateAllCardsWithDropNames();
                        // Los badges ya estan puestos, ahora se pide lo que falta para
                        // marcar los que ya estan reclamados; al llegar se repintan solos.
                        _ensureProgressData();
                    } catch (e) {
                        console.warn('[Kick Drops] Fallo al escanear', location.pathname, e);
                    }
                    // El colapso solo en la pestaña de campañas, que es la unica con
                    // acordeones que abrir. Antes habia aqui una segunda condicion, "no
                    // colapses si venimos de ver un drop concreto", que ya no existe
                    // porque esa navegacion no sobrevivia a la recarga de la pestaña.
                    if (_isCampaignsPage()) {
                        // Pequeno delay para que se asienten las mutaciones de DOM del
                        // escaneo (ids/badges) antes de togglear los acordeones.
                        setTimeout(collapseAllCampaignAccordions, 150);
                    }
                    // Escaneo terminado -> auto-claim y despues el cofre.
                    _finishReviewOutsideClaimed();
                } else {
                    attempts++;
                    // Este contador de puntos se escribe en el contenedor de resultados,
                    // que es display:none, asi que NO SE VE. Es como se ha comportado
                    // siempre, aqui y en el de Twitch, y sigue siendo lo correcto aunque
                    // el motivo haya cambiado: antes habria quedado un "Buscando........."
                    // encima del velo del centro —lo probe y repetia lo mismo dos veces—,
                    // y ahora que el velo no existe repetiria al cartel naranja del panel,
                    // que es el que dice que se esta buscando. Sacarlo de aqui pide antes
                    // decidir cual de los dos se va.
                    const resultsContainer = document.getElementById("kick-drops-results");
                    if (resultsContainer && !resultsContainer.querySelector('#searching-status')) {
                        const el = document.createElement("div");
                        el.id = "searching-status";
                        resultsContainer.appendChild(el);
                    }
                    const searchEl = document.getElementById("searching-status");
                    if (searchEl) {
                        searchEl.textContent = `${t.searching}${".".repeat(attempts)}`;
                    }
                    if (attempts >= maxAttempts) {
                        clearInterval(waitForDrops);
                        if (searchEl) searchEl.remove();
                        // Se acabo de buscar: el cartel naranja se va y deja hablar a las
                        // solapas, que es lo que de verdad explica que no haya nada.
                        _dropsScanDone = true;
                        _updateApiLoadingBanner();
                        // Al RENDIRSE si hay que pintar el panel, y eso es otra cosa que
                        // el contador de arriba: aqui cada solapa dice lo suyo —"no se
                        // encontro nada" donde no hay, y las tarjetas de la API donde si—
                        // y las cuentas de las pestañas quedan puestas. Antes se colgaba
                        // un mensaje a mano en el contenedor escondido, o sea que no se
                        // veia, y el panel se quedaba en blanco.
                        _rerenderPanes();
                        // Sin campañas que casen con las keywords, pero el auto-claim
                        // corre igual: reclama lo que tengas hecho, no lo que casa con
                        // una keyword. Ahi termina la revision.
                        _finishReviewOutsideClaimed();
                    }
                }
            }, 500);
        }


        // =============================================
        // URL CHANGE OBSERVER (SPA navigation)
        // =============================================

        let actualPath = "";
        function onUrlChange(callback) {
            const pushState = history.pushState;
            const replaceState = history.replaceState;

            history.pushState = function () {
                pushState.apply(history, arguments);
                callback();
            };
            history.replaceState = function () {
                replaceState.apply(history, arguments);
                callback();
            };

            window.addEventListener("popstate", callback);
        }

        onUrlChange(() => {
            const newPath = _normalizePath(location.pathname);
            if (newPath !== actualPath) {
                actualPath = newPath;
                // Lo primero, recoger lo de la pestaña que se deja: la rejilla y los
                // bloques que escondio. Va ANTES del reparto porque lo que se haga a
                // continuacion tiene que encontrar la pagina como la dejo Kick.
                _tearDownClaimedGrid();
                // Este camino SI corre: cambiar de pestaña en Kick no siempre recarga la
                // pagina, y cuando no lo hace es esto lo unico que vuelve a escanear.
                //
                // El reparto va por lo que ES la ruta y no por descarte. Antes el `else`
                // significaba "reclamados", asi que al estrenarse /drops/expired las
                // cerradas entraban por ahi: llegabas a la pestaña y se ejecutaba el
                // trabajo del escaparate en vez del escaneo, o sea que no se marcaba
                // NADA. Y solo pasaba cambiando de pestaña; entrando por la URL directa
                // el arranque hace lo correcto y el fallo no se ve.
                if (_isClaimedPage(newPath)) {
                    // Revision de drops del inventario; el cofre espera a que termine.
                    // Va por _claimedPageWork y no por cleanInventory a secas para que
                    // volviendo a mano a reclamados la rejilla se pinte igual: es el
                    // unico sitio que la reintenta hasta que la SPA monta el panel.
                    _dropsReviewInProgress = true;
                    _claimedPageWork();
                } else if (_kindOfPath(newPath)) {
                    // Campañas, proximas y cerradas: las tres se escanean igual, y la
                    // ruta es la que decide de que color se marca (ver _routeStatus).
                    waitForDropsFunction();
                }
            }
        });

        // Start
        waitForDropsFunction();

        // Recompensa diaria (cofre): el chequeo al cargar NO se agenda con un timeout
        // ciego, sino que lo dispara _finishDropsReview() cuando termina la revision de
        // drops (ver waitForDropsFunction / _startDropsPolling).
        // El interval periodico cubre la recompensa que se habilita mientras la pagina
        // sigue abierta; _checkDailyReward() igual se abstiene si hay una revision en curso.
        setInterval(_checkDailyReward, 3 * 60 * 1000);

        // Auto-refresh every 15 minutes
        setInterval(() => {
            location.reload();
        }, 15 * 60 * 1000);
    });
})();
