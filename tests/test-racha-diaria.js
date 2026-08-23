// El recordatorio de la racha diaria. Kick regala un cofre al día por ver 60 minutos y
// encadenarlos da racha; lo que el script avisa es SOLO lo de antes de poder reclamar
// —que el día corre y no has puesto ningún stream—, porque de lo que ya se puede
// reclamar avisa Kick por su cuenta y encima el script lo reclama solo.
//
// El estado sale de `/api/v1/gamification/challenges`, que es la única fuente que lo
// dice: el cofre de la barra usa el mismo vídeo `idle` cuando ya reclamaste y cuando
// todavía te falta tiempo, así que desde el DOM esos dos casos no se distinguen.
//
// La forma de la respuesta está copiada de una real (2026-08-11).
const { run } = require('./harness');

// La ventana se CALCULA en vez de copiarse literal del volcado, aunque la forma sea la
// del volcado (medianoche UTC a medianoche UTC). Con la fecha fija —2026-08-11— el test
// pasaba hoy y a partir de mañana daría todo por «ventana cerrada», así que los casos
// visibles se apagarían solos y parecería un fallo del script.
const DIA = 24 * 60 * 60 * 1000;
const medianocheUTC = ms => new Date(ms).toISOString().slice(0, 10) + 'T00:00:00Z';
const AHORA = Date.now();
const VENTANA = { starts_at: medianocheUTC(AHORA), ends_at: medianocheUTC(AHORA + DIA) };
const VENTANA_CERRADA = { starts_at: medianocheUTC(AHORA - 2 * DIA), ends_at: medianocheUTC(AHORA - DIA) };

// Los ids van INVENTADOS aunque el resto venga de volcados reales. No son credenciales
// —sin el Bearer no sirven de nada— pero no consta si el id del reto es del reto o de tu
// instancia del reto, y el test no necesita el valor: para la lógica son cadenas opacas.
// Lo que sí es real, y es lo que importa, son los números y los `status`.
const reto = (progress, threshold, status, extra = {}) => ({
    id: '00000000-0000-7000-8000-000000000001',
    recurrence: 'daily',
    status,
    condition: { progress, threshold, type: 'watch_time_minutes' },
    window: VENTANA,
    drop_table: [{ rarity: 'common', weighting: 550000 }],
    ...extra
});

const CASOS = [
    // El caso que lo motiva: el día empezado y cero minutos vistos.
    { nombre: 'sin empezar', challenges: [reto(0, 60, 'in_progress')], espera: 'visible', texto: '0 de 60' },
    // A medias también avisa: pararse en el minuto 25 pierde la racha igual que no empezar.
    { nombre: 'a medias', challenges: [reto(25, 60, 'in_progress')], espera: 'visible', texto: '25 de 60' },
    // Volcado real acumulando (2026-08-11, 14 de 60). Va aparte del de arriba porque
    // prueba algo distinto: que a mitad de camino el `status` NO cambia, sigue siendo
    // `in_progress`. O sea que el status no dice si ya se puede reclamar, y lo único que
    // apaga el aviso al llegar al umbral es la comparación de progress con threshold.
    { nombre: 'acumulando (volcado real)', challenges: [reto(14, 60, 'in_progress')], espera: 'visible', texto: '14 de 60' },
    // Cumplido pero con el status todavía en `in_progress`: es el instante entre llegar a
    // los 60 y que Kick lo pase a `claimable`. Sin la comparación de progress con
    // threshold, aquí el aviso diría «llevas 60 de 60».
    { nombre: 'cumplido, status sin actualizar', challenges: [reto(60, 60, 'in_progress')], espera: 'oculto' },
    // Volcado real del cofre listo (2026-08-11): 60 de 60 y `claimable`. No se avisa —de
    // esto avisa Kick por su cuenta y el script lo reclama solo—.
    { nombre: 'claimable (volcado real)', challenges: [reto(60, 60, 'claimable')], espera: 'oculto' },
    // Volcado real del cofre ya cobrado (2026-08-11): `claimed`, con `claimed_at` y
    // `winner`. Nada que recordar.
    {
        nombre: 'claimed (volcado real)',
        challenges: [reto(60, 60, 'claimed', {
            claimed_at: '2026-08-11T12:00:00.000000Z',
            winner: { id: '00000000-0000-7000-8000-000000000002', rarity: 'common', card_url: 'https://ext.cdn.kick.com/chat/emotes/cards/x.png' }
        })],
        espera: 'oculto'
    },
    // Un `status` que no conocemos tampoco avisa: podría aparecer un cuarto para el día
    // que se cierra sin reclamar, y con esta dirección entra ya callado.
    { nombre: 'status desconocido', challenges: [reto(0, 60, 'perdido')], espera: 'oculto' },
    // La pestaña que se queda abierta al cruzar la hora de cierre: el reto sigue en
    // memoria y en `in_progress`, pero su ventana ya pasó y no hay nada que correr a
    // ganar. Sin este corte el aviso seguiría pidiéndolo.
    {
        nombre: 'ventana ya cerrada',
        challenges: [reto(0, 60, 'in_progress', { window: VENTANA_CERRADA })],
        espera: 'oculto'
    },
    // Un reto que no es de ver minutos no puede prestar su umbral: el "te faltan N min"
    // sería mentira.
    {
        nombre: 'reto de otra clase',
        challenges: [{ ...reto(0, 5, 'in_progress'), condition: { progress: 0, threshold: 5, type: 'follow_channels' } }],
        espera: 'oculto'
    },
    // Semanal: tampoco. Se pide `recurrence: daily` a propósito.
    { nombre: 'reto semanal', challenges: [{ ...reto(0, 300, 'in_progress'), recurrence: 'weekly' }], espera: 'oculto' },
    // Sin API no se inventa nada.
    { nombre: 'sin datos', challenges: null, espera: 'oculto' },
    // Ya silenciado para ESTA ventana: no vuelve a salir.
    {
        nombre: 'ya silenciado',
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_daily_streak_reminded_window: VENTANA.starts_at },
        espera: 'oculto'
    },
    // Silenciado para la ventana de AYER: hoy vuelve a salir. Sin esto, una × valdría
    // para siempre y el recordatorio no sería diario.
    {
        nombre: 'silenciado ayer',
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_daily_streak_reminded_window: medianocheUTC(AHORA - DIA) },
        espera: 'visible', texto: '0 de 60'
    }
];

(async () => {
    const fallos = [];

    for (const c of CASOS) {
        const r = await run({
            url: 'https://kick.com/drops/campaigns',
            panels: [{ hidden: false, html: '' }],
            challenges: c.challenges,
            seed: c.seed || {},
            waitMs: 16000
        });

        const visible = !!(r.racha.existe && r.racha.visible);
        console.log(JSON.stringify({
            caso: c.nombre, visible, texto: r.racha.texto,
            titulo: r.titulo, pitidos: r.beeps
        }));

        if (c.espera === 'visible' && !visible) fallos.push(`${c.nombre}: el aviso no salio`);
        if (c.espera === 'oculto' && visible) fallos.push(`${c.nombre}: el aviso salio y no debia`);

        // DÓNDE sale, que es la mitad del asunto desde el 2026-08-22: es una alerta más,
        // así que vive dentro de la pestaña 🔔 y su solapa la cuenta. Estando la tira
        // encima del panel decía sin querer que era urgente y que no era una alerta, y el
        // contador de alertas marcaba (0) con el aviso delante.
        if (c.espera === 'visible') {
            if (!r.racha.enAlertas) {
                fallos.push(`${c.nombre}: el aviso no está en la pestaña de alertas`);
            }
            if (r.tabLabels.notifs !== '🔔 (1)') {
                fallos.push(`${c.nombre}: la solapa de alertas no cuenta la racha -> ` +
                    `"${r.tabLabels.notifs}" (se esperaba "🔔 (1)")`);
            }
        } else if (r.tabLabels.notifs !== '🔔 (0)') {
            fallos.push(`${c.nombre}: la solapa de alertas cuenta algo sin aviso -> "${r.tabLabels.notifs}"`);
        }

        // El aviso tiene que llegar tambien a quien NO esta mirando la pestaña: marca en
        // el titulo del navegador y un pitido. En estos casos no hay campañas, asi que
        // todo lo que suene o se escriba viene de la racha y de nada mas.
        const marcado = (r.titulo || '').startsWith('🔥');
        if (c.espera === 'visible') {
            if (!marcado) fallos.push(`${c.nombre}: el titulo no lleva la marca -> "${r.titulo}"`);
            // UNA vez, no en bucle: este aviso no se apaga con un clic tuyo sino cuando
            // hayas visto 60 minutos, asi que repetirlo seria una hora de pitidos.
            if (r.beeps !== 1) fallos.push(`${c.nombre}: pito ${r.beeps} veces, se esperaba 1`);
        } else {
            if (marcado) fallos.push(`${c.nombre}: el titulo lleva marca sin aviso -> "${r.titulo}"`);
            if (r.beeps !== 0) fallos.push(`${c.nombre}: pito ${r.beeps} veces sin aviso`);
        }
        if (c.texto && visible) {
            if (!(r.racha.texto || '').includes(c.texto))
                fallos.push(`${c.nombre}: el texto no dice "${c.texto}" -> "${r.racha.texto}"`);
            if (/\{done\}|\{total\}/.test(r.racha.texto || ''))
                fallos.push(`${c.nombre}: quedo un marcador sin sustituir -> "${r.racha.texto}"`);
        }
    }

    // EL RELEVO DE LAS 18:00. Cuando la ventana cierra, el reto en memoria deja de valer.
    // Antes el aviso solo se callaba, y en una pestaña abierta desde la víspera el día
    // nuevo empezaba sin recordatorio hasta que recargaras. Ahora se vuelve a pedir.
    //
    // Se monta con una ventana que cierra a los 3 s: el script despierta al cerrar (más 5 s
    // de margen, porque quien rota es el servidor), pide el reto otra vez y adopta el nuevo.
    {
        const cierraEn = ms => new Date(Date.now() + ms).toISOString();
        const r2 = await run({
            url: 'https://kick.com/drops/campaigns',
            panels: [{ hidden: false, html: '' }],
            challenges: [reto(0, 60, 'in_progress', {
                window: { starts_at: medianocheUTC(AHORA - DIA), ends_at: cierraEn(3000) }
            })],
            challengesRefetch: [reto(0, 60, 'in_progress', {
                condition: { progress: 5, threshold: 60, type: 'watch_time_minutes' },
                window: { starts_at: cierraEn(3000), ends_at: medianocheUTC(AHORA + DIA) }
            })],
            waitMs: 16000
        });
        const texto = r2.racha.texto || '';
        console.log(JSON.stringify({
            caso: 'relevo de ventana', visible: r2.racha.visible, texto,
            titulo: r2.titulo, pitidos: r2.beeps
        }));
        if (!r2.racha.visible) fallos.push('tras el relevo el aviso no volvio');
        if (!texto.includes('5 de 60')) fallos.push(`tras el relevo no adopto el reto nuevo -> "${texto}"`);
        // Y vuelve a sonar, porque es otro día. Con un booleano en vez de la ventana, el
        // reto nuevo se estrenaba en silencio.
        if (r2.beeps !== 2) fallos.push(`tras el relevo pito ${r2.beeps} veces, se esperaban 2`);
    }

    // Y la ×: calla el aviso guardando la VENTANA del reto, no la fecha de hoy.
    //
    // `dejarAbierta` porque este caso pulsa la × DESPUES de recibir el informe, y el arnes
    // cierra jsdom al entregarlo: sin esto el gancho se queda sin DOM al que pulsar. Es el
    // unico caso de toda la bateria que lo necesita, y por eso este test sale a mano.
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: '' }],
        challenges: [reto(0, 60, 'in_progress')],
        waitMs: 16000,
        dejarAbierta: true
    });
    const tras = r.racha.existe ? await r.racha.cerrar() : null;
    console.log(JSON.stringify({ caso: 'pulsar la ×', tras }));
    if (!tras || tras.visible) fallos.push('la × no escondio el aviso');
    if (!tras || tras.guardado !== VENTANA.starts_at)
        fallos.push(`la × guardo "${tras && tras.guardado}" en vez de la ventana del reto`);
    // Callar el aviso lo calla ENTERO: la marca del título se va con la tira. Sin esto se
    // quedaba puesta hasta el siguiente repintado, o sea la pestaña marcada sin nada que
    // explicara por qué.
    if (!tras || (tras.titulo || '').startsWith('🔥'))
        fallos.push(`la × dejo la marca en el titulo -> "${tras && tras.titulo}"`);

    console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
