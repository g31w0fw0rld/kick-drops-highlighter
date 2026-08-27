// EL AVISO DEL RETO DEL DIA, que desde el 2026-08-27 es UNA ALERTA MAS.
//
// Kick regala un cofre al dia por ver 60 minutos y encadenarlos da racha. Lo que el
// script avisa es SOLO lo de antes de poder reclamar —que el dia corre y no has puesto
// ningun stream—, porque de lo que ya se puede reclamar avisa Kick por su cuenta y
// encima el script lo reclama solo. Eso no ha cambiado.
//
// Lo que cambio es DONDE sale y COMO se comporta. Era una tira propia encima del panel,
// con recuadro verde, una ✕ para callarla y un pitido de UNA vez; o sea tres
// comportamientos distintos para algo que el panel presenta como una alerta. Ahora es
// una fila de la pestaña 🔔 —del mismo almacen que las de campaña nueva— y de ahi salen
// gratis su cuenta en la solapa, su pitido EN BUCLE y su 👁️. Este test comprueba las
// cuatro cosas, porque cada una fallaba por su lado:
//
//   · sale en la pestaña de alertas y la solapa la cuenta;
//   · suena en BUCLE mientras siga pendiente, no una vez;
//   · el 👁️ la da por vista y la deja MARCADA, no borrada (borrarla la haria nacer
//     otra vez en la vuelta siguiente, o sea un aviso que no se puede callar);
//   · y al rotar la ventana vuelve a sonar, porque es el reto de otro dia.
//
// El estado sale de `/api/v1/gamification/challenges`, que es la unica fuente que lo
// dice: el cofre de la barra usa el mismo video `idle` cuando ya reclamaste y cuando
// todavia te falta tiempo, asi que desde el DOM esos dos casos no se distinguen.
//
// La forma de la respuesta esta copiada de una real (2026-08-11).
const { run } = require('./harness');

// La ventana se CALCULA en vez de copiarse literal del volcado, aunque la forma sea la
// del volcado (medianoche UTC a medianoche UTC). Con la fecha fija —2026-08-11— el test
// pasaba hoy y a partir de mañana daria todo por «ventana cerrada», asi que los casos
// visibles se apagarian solos y pareceria un fallo del script.
const DIA = 24 * 60 * 60 * 1000;
const medianocheUTC = ms => new Date(ms).toISOString().slice(0, 10) + 'T00:00:00Z';
const AHORA = Date.now();
const VENTANA = { starts_at: medianocheUTC(AHORA), ends_at: medianocheUTC(AHORA + DIA) };
const VENTANA_CERRADA = { starts_at: medianocheUTC(AHORA - 2 * DIA), ends_at: medianocheUTC(AHORA - DIA) };

// La clave con la que el aviso se guarda. Lleva la VENTANA dentro, y de ahi sale gratis
// el «se resetea cada dia»: cerrada la ventana, el reto nuevo trae otra `starts_at`, o
// sea otra clave, o sea una alerta nueva que vuelve a sonar aunque ayer la vieras.
const CLAVE = 'kick-daily|' + VENTANA.starts_at;

// Una alerta del dia YA MARCADA VISTA, tal y como la deja el 👁️. Es lo que sustituye al
// `kick_daily_streak_reminded_window` de la ✕: ahora el silencio no vive en una clave
// aparte, vive en el mismo almacen que las demas alertas.
const vista = (clave) => JSON.stringify([{
    id: clave, title: 'Recompensa diaria: llevas 0 de 60 min. No pierdas la racha de hoy.',
    key: clave, kind: 'daily', seen: true, changed: true,
    createdAt: AHORA, updatedAt: AHORA
}]);

// Los ids van INVENTADOS aunque el resto venga de volcados reales. No son credenciales
// —sin el Bearer no sirven de nada— pero no consta si el id del reto es del reto o de tu
// instancia del reto, y el test no necesita el valor: para la logica son cadenas opacas.
// Lo que si es real, y es lo que importa, son los numeros y los `status`.
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
    // El caso que lo motiva: el dia empezado y cero minutos vistos.
    { nombre: 'sin empezar', challenges: [reto(0, 60, 'in_progress')], espera: 'visible', texto: '0 de 60' },
    // A medias tambien avisa: pararse en el minuto 25 pierde la racha igual que no empezar.
    { nombre: 'a medias', challenges: [reto(25, 60, 'in_progress')], espera: 'visible', texto: '25 de 60' },
    // Volcado real acumulando (2026-08-11, 14 de 60). Va aparte del de arriba porque
    // prueba algo distinto: que a mitad de camino el `status` NO cambia, sigue siendo
    // `in_progress`. O sea que el status no dice si ya se puede reclamar, y lo unico que
    // apaga el aviso al llegar al umbral es la comparacion de progress con threshold.
    { nombre: 'acumulando (volcado real)', challenges: [reto(14, 60, 'in_progress')], espera: 'visible', texto: '14 de 60' },
    // Cumplido pero con el status todavia en `in_progress`: es el instante entre llegar a
    // los 60 y que Kick lo pase a `claimable`. Sin la comparacion de progress con
    // threshold, aqui el aviso diria «llevas 60 de 60».
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
    // Un `status` que no conocemos tampoco avisa: podria aparecer un cuarto para el dia
    // que se cierra sin reclamar, y con esta direccion entra ya callado.
    { nombre: 'status desconocido', challenges: [reto(0, 60, 'perdido')], espera: 'oculto' },
    // La pestaña que se queda abierta al cruzar la hora de cierre: el reto sigue en
    // memoria y en `in_progress`, pero su ventana ya paso y no hay nada que correr a
    // ganar. Sin este corte el aviso seguiria pidiendolo.
    {
        nombre: 'ventana ya cerrada',
        challenges: [reto(0, 60, 'in_progress', { window: VENTANA_CERRADA })],
        espera: 'oculto'
    },
    // Un reto que no es de ver minutos no puede prestar su umbral: el "te faltan N min"
    // seria mentira.
    {
        nombre: 'reto de otra clase',
        challenges: [{ ...reto(0, 5, 'in_progress'), condition: { progress: 0, threshold: 5, type: 'follow_channels' } }],
        espera: 'oculto'
    },
    // Semanal: tampoco. Se pide `recurrence: daily` a proposito.
    { nombre: 'reto semanal', challenges: [{ ...reto(0, 300, 'in_progress'), recurrence: 'weekly' }], espera: 'oculto' },
    // Sin API no se inventa nada. Y ojo con este: sin datos NO se puede decidir, que es
    // distinto de decidir que no. Con el aviso guardado de ayer y la API todavia sin
    // contestar, darlo por resuelto lo marcaria vista antes de saber si existe.
    { nombre: 'sin datos', challenges: null, espera: 'oculto' },
    // Ya marcada vista para ESTA ventana: no vuelve a salir ni vuelve a sonar.
    {
        nombre: 'ya vista',
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_drop_notifications: vista(CLAVE) },
        espera: 'oculto'
    },
    // Vista AYER: hoy vuelve a salir. Sin esto, un 👁️ valdria para siempre y el aviso no
    // seria diario. Es la clave con la ventana dentro lo que lo consigue, sin guardar
    // ninguna fecha aparte.
    {
        nombre: 'vista ayer',
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_drop_notifications: vista('kick-daily|' + medianocheUTC(AHORA - DIA)) },
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
            titulo: r.titulo, pitidos: r.beeps, solapa: r.tabLabels.notifs
        }));

        if (c.espera === 'visible' && !visible) fallos.push(`${c.nombre}: el aviso no salio`);
        if (c.espera === 'oculto' && visible) fallos.push(`${c.nombre}: el aviso salio y no debia`);

        // DONDE sale, que es la mitad del asunto: es una alerta mas, asi que vive dentro
        // de la pestaña 🔔 y su solapa la cuenta. Estando la tira encima del panel decia
        // sin querer que era urgente y que no era una alerta, y el contador marcaba (0)
        // con el aviso delante.
        if (c.espera === 'visible') {
            if (!r.racha.enAlertas) {
                fallos.push(`${c.nombre}: el aviso no esta en la pestaña de alertas`);
            }
            if (r.tabLabels.notifs !== '🔔 (1)') {
                fallos.push(`${c.nombre}: la solapa de alertas no cuenta la racha -> ` +
                    `"${r.tabLabels.notifs}" (se esperaba "🔔 (1)")`);
            }
        } else if (r.tabLabels.notifs !== '🔔 (0)') {
            fallos.push(`${c.nombre}: la solapa de alertas cuenta algo sin aviso -> "${r.tabLabels.notifs}"`);
        }

        // Y tiene que llegar a quien NO esta mirando la pestaña: la cuenta en el titulo
        // del navegador y el pitido. En estos casos no hay campañas, asi que todo lo que
        // suene o se escriba viene del reto del dia y de nada mas.
        //
        // El titulo lleva `(1)` y ya no un 🔥: la marca propia decia que esto era otra
        // cosa, y la cuenta de pendientes es la misma que la de cualquier alerta.
        const marcado = (r.titulo || '').startsWith('(1)');
        if (c.espera === 'visible') {
            if (!marcado) fallos.push(`${c.nombre}: el titulo no lleva la cuenta -> "${r.titulo}"`);
            // EN BUCLE, no una vez. El pitido de una sola vez se justificaba en que el
            // aviso se apagaba solo al ver 60 minutos y un bucle seria una hora de
            // castigo; ahora se calla con el 👁️, o sea con un clic, igual que los demas.
            // Se piden >= 2 y no un numero exacto porque el bucle va cada 5 s y la espera
            // del arnes no cae siempre en el mismo punto.
            if (r.beeps < 2) fallos.push(`${c.nombre}: pito ${r.beeps} veces, tenia que sonar en bucle`);
        } else {
            if (marcado) fallos.push(`${c.nombre}: el titulo lleva cuenta sin aviso -> "${r.titulo}"`);
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
    // Antes el aviso solo se callaba, y en una pestaña abierta desde la vispera el dia
    // nuevo empezaba sin recordatorio hasta que recargaras. Ahora se vuelve a pedir.
    //
    // Se monta con una ventana que cierra a los 3 s: el script despierta al cerrar (mas 5 s
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
        if (r2.beeps < 2) fallos.push(`tras el relevo pito ${r2.beeps} veces, tenia que seguir en bucle`);
    }

    // Y EL 👁️, que es lo que sustituye a la ✕. Marca el aviso vista y con el se van la
    // fila, la cuenta de la solapa, la marca del titulo y el pitido.
    //
    // `dejarAbierta` porque este caso pulsa DESPUES de recibir el informe, y el arnes
    // cierra jsdom al entregarlo: sin esto el gancho se queda sin DOM al que pulsar. Es el
    // unico caso de toda la bateria que lo necesita, y por eso este test sale a mano.
    const r = await run({
        url: 'https://kick.com/drops/campaigns',
        panels: [{ hidden: false, html: '' }],
        challenges: [reto(0, 60, 'in_progress')],
        waitMs: 16000,
        dejarAbierta: true
    });
    const tras = r.racha.existe ? await r.racha.marcarVista() : null;
    console.log(JSON.stringify({ caso: 'pulsar el 👁️', tras }));
    if (!tras || tras.visible) fallos.push('el 👁️ no quito el aviso de la lista');
    if (!tras || tras.solapa !== '🔔 (0)')
        fallos.push(`el 👁️ dejo la solapa en "${tras && tras.solapa}"`);
    // Darla por vista lo apaga ENTERO: la cuenta del titulo se va con la fila. Sin esto se
    // quedaba puesta hasta el siguiente repintado, o sea la pestaña marcada sin nada que
    // explicara por que.
    if (!tras || /^\(\d+\)/.test(tras.titulo || ''))
        fallos.push(`el 👁️ dejo la cuenta en el titulo -> "${tras && tras.titulo}"`);
    // Y la deja MARCADA, no borrada. Es la diferencia entre callar el aviso y no poder
    // callarlo: borrandola, la vuelta siguiente no la encuentra y la crea otra vez.
    const guardada = (tras && tras.guardado || []).find(n => n && n.kind === 'daily');
    if (!guardada) fallos.push('el 👁️ borro el aviso en vez de marcarlo visto: mañana volveria a nacer hoy');
    else if (!guardada.seen) fallos.push('el aviso quedo guardado sin marcar como visto');
    else if (guardada.key !== CLAVE)
        fallos.push(`el aviso quedo guardado con la clave "${guardada.key}" y no con la ventana del reto`);

    console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'TODO OK');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
