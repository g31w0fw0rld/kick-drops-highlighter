// EL MEDIDOR DE RACHA EN LA PESTAÑA 🔔.
//
// Pedido el 2026-09-21: «quiero que aparezca el medidor de racha en el panel de
// notificaciones que viene en el modal de recompensa, junto al texto de cuando se
// reinicia y si la racha esta a salvo». O sea las tres cosas que el modal del cofre
// enseña arriba, traidas a donde ya vive el aviso de la racha.
//
// Las tres salen de TRES FUENTES DISTINTAS y por eso cada una falla por su lado:
//   · los DIAS, de `/api/v1/gamification/users/<id>/streak`, que contesta
//     `{"data":{"length_days":1},"message":"success"}` (verificado el 2026-09-22, dos
//     veces). NO esta en `/challenges`: volcada la respuesta entera ese mismo dia, de
//     primer nivel solo trae `data` y `message`, y el reto solo `condition`,
//     `recurrence`, `status`, `window`, `drop_table` e `id`.
//   · el REINICIO, de `window.ends_at` del reto.
//   · A SALVO, de su `status`.
//
// LO QUE ESTE TEST NO CUBRE, dicho aqui para que no se lea como cubierto: el viaje de
// ida y vuelta al modal. La racha solo llega cuando la pagina abre el cofre, y aqui el
// arnes no sirve esa ruta, asi que lo que se comprueba es el RENDER dado el dato —con
// el numero guardado y sin el— y la puerta del almacen. Que el modal se abra y se cierre
// hay que verlo en el navegador.
//
// Control negativo (tiene que salir en ROJO con el codigo publicado):
//   git show HEAD:kick-drops-highlighter.user.js > /tmp/kick-pub.js
//   KICK_SCRIPT=/tmp/kick-pub.js node tests/test-medidor-racha.js
const { run } = require('./harness');

const DIA = 24 * 60 * 60 * 1000;
const medianocheUTC = ms => new Date(ms).toISOString().slice(0, 10) + 'T00:00:00Z';
const AHORA = Date.now();
const VENTANA = { starts_at: medianocheUTC(AHORA), ends_at: medianocheUTC(AHORA + DIA) };

const reto = (progress, threshold, status) => ({
    id: '00000000-0000-7000-8000-000000000001',
    recurrence: 'daily', status,
    condition: { progress, threshold, type: 'watch_time_minutes' },
    window: VENTANA,
    drop_table: [{ rarity: 'common', weighting: 550000 }]
});

// La racha guardada, con el DIA LOCAL. La fecha es la mitad del asunto: un numero de
// ayer enseñaria justo lo contrario de lo que pasa, porque la racha sube al reclamar y
// se cae al no hacerlo.
const diaLocal = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const guardada = (dias, cuando = AHORA) =>
    JSON.stringify({ dias, dia: diaLocal(cuando) });

let fallos = 0;
const comprobar = (ok, msg, extra) => {
    console.log((ok ? '  ok    ' : '  FALLA ') + msg + (ok || extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`));
    if (!ok) fallos++;
};

const mirar = (opts) => run(Object.assign({
    url: 'https://kick.com/drops/campaigns',
    panels: [{ hidden: false, html: '' }],
    waitMs: 12000
}, opts));

(async () => {
    // 1. Con la racha guardada de hoy: el numero sale, los galones lo reflejan y la fila
    //    ya no se ofrece a leer nada.
    const conNumero = await mirar({
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_drops_streak: guardada(3) }
    });
    comprobar(conNumero.medidor.existe, 'el medidor sale en la pestaña de alertas');
    comprobar(/x3/.test(conNumero.medidor.texto || ''),
        'y dice los dias encadenados', conNumero.medidor.texto);
    comprobar(conNumero.medidor.galones === 3,
        'y llena tres de los cinco galones', conNumero.medidor.galones);
    comprobar(!conNumero.medidor.pide,
        'y no se ofrece a leer lo que ya tiene');
    // LOS MINUTOS VISTOS. Los decia la fila del aviso, que desde el 2026-09-22 ya no
    // existe: si el medidor no los recoge, el panel pierde el unico dato accionable —
    // cuanto stream te queda para salvar el dia— y nadie lo notaria, porque el medidor
    // seguiria pareciendo completo.
    comprobar(/0\/60 min/.test(conNumero.medidor.texto || ''),
        'y dice cuanto llevas visto de lo que pide', conNumero.medidor.texto);

    // 2. LOS CINCO GALONES SON UNA ESCALA, NO UNA CUENTA. Con nueve dias se llenan los
    //    cinco, asi que el numero escrito al lado es lo unico que distingue 5 de 9. Sin
    //    este caso, pintar los galones y creer que cuentan daria el mismo verde.
    const nueve = await mirar({
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_drops_streak: guardada(9) }
    });
    comprobar(nueve.medidor.galones === 5, 'con nueve dias los galones se quedan en cinco',
        nueve.medidor.galones);
    comprobar(/x9/.test(nueve.medidor.texto || ''),
        'y el numero de al lado si dice nueve', nueve.medidor.texto);

    // 3. Sin numero guardado: el medidor sale igual —el reinicio y el riesgo se saben sin
    //    la racha— pero se ofrece a leerla, que es lo unico que abre el modal del cofre.
    const sinNumero = await mirar({ challenges: [reto(0, 60, 'in_progress')] });
    comprobar(sinNumero.medidor.existe, 'sin racha guardada el medidor sale igual');
    comprobar(sinNumero.medidor.galones === 0,
        'con ningun galon lleno, que no es lo mismo que una racha de cero',
        sinNumero.medidor.galones);
    comprobar(sinNumero.medidor.pide, 'y se ofrece a leerla');

    // 4. UN NUMERO DE AYER NO VALE. Es el control de la fecha guardada: sin ella, la
    //    racha de ayer se enseñaria hoy como si siguiera viva, que es justo el dato que
    //    cambia al perderla.
    const deAyer = await mirar({
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_drops_streak: guardada(3, AHORA - DIA) }
    });
    comprobar(deAyer.medidor.pide, 'una racha guardada ayer no se enseña hoy');
    comprobar(deAyer.medidor.galones === 0, 'y no deja galones llenos de ayer',
        deAyer.medidor.galones);

    // 5. A SALVO ES «YA RECLAMADO». Con el reto en `claimed` el aviso DESAPARECE —es lo
    //    que hace el 🔔— y el medidor tiene que seguir ahi: es el unico estado en el que
    //    dice algo bueno, y puesto detras del corte de «no hay alertas» no se veria nunca.
    const aSalvo = await mirar({
        challenges: [reto(60, 60, 'claimed')],
        seed: { kick_drops_streak: guardada(4) }
    });
    comprobar(aSalvo.medidor.existe, 'con la racha ya a salvo el medidor sigue saliendo');
    comprobar(aSalvo.tabLabels.notifs === '🔔 (0)',
        'y lo hace con la pestaña sin ninguna alerta pendiente', aSalvo.tabLabels.notifs);

    // 6. CONTROL: el tiempo hecho pero SIN cobrar no es estar a salvo. `ends_at` es el
    //    plazo de reclamo, no el de ver, asi que la racha todavia se puede perder. Los
    //    dos estados se ven distintos en el texto.
    const porCobrar = await mirar({
        challenges: [reto(60, 60, 'claimable')],
        seed: { kick_drops_streak: guardada(4) }
    });
    comprobar(porCobrar.medidor.existe && aSalvo.medidor.existe
        && porCobrar.medidor.texto !== aSalvo.medidor.texto,
        'CONTROL: cumplido pero sin cobrar no dice lo mismo que ya cobrado',
        { porCobrar: porCobrar.medidor.texto, aSalvo: aSalvo.medidor.texto });

    // 7. EL PANEL SE PLANTA EN LA PESTAÑA 🔔, y solo con la casilla de cerrados/
    //    completados puesta. Esa casilla es la que enciende la reclamacion automatica del
    //    cofre, asi que con ella lo unico que queda en tus manos es ver los 60 minutos, y
    //    es lo unico por lo que tiene sentido insistir (decidido el 2026-09-22).
    const conCasilla = await mirar({
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_drops_streak: guardada(3), kick_show_hide_inventory_expired: true }
    });
    comprobar(conCasilla.solapaDelante === 'notifs',
        'con la casilla puesta y la racha en riesgo, el panel se abre en la pestaña 🔔',
        conCasilla.solapaDelante);

    // Y el control que lo hace significar algo: sin la casilla NO se planta. Sin este
    // caso, «enfocar siempre» y «enfocar con la casilla» darian el mismo verde —la racha
    // cuenta como aviso pendiente, asi que el panel ya se abria ahi por su cuenta—.
    const sinCasilla = await mirar({
        challenges: [reto(0, 60, 'in_progress')],
        seed: { kick_drops_streak: guardada(3) }
    });
    comprobar(sinCasilla.solapaDelante !== 'notifs',
        'CONTROL: sin la casilla no se planta en 🔔 por la racha',
        sinCasilla.solapaDelante);

    // 8. SILENCIADA SIGUE SIENDO UN AVISO. Es la mitad del encargo del 2026-09-22 —«lo
    //    que se descarta es el sonido, el aviso sigue hasta que se salve la racha»— y el
    //    unico caso que lo distingue de «el 👁️ lo apaga todo»: con la alerta ya marcada
    //    vista, el panel tiene que seguir plantandose en la pestaña 🔔.
    const CLAVE = 'kick-daily|' + VENTANA.starts_at;
    const silenciada = await mirar({
        challenges: [reto(0, 60, 'in_progress')],
        seed: {
            kick_drops_streak: guardada(3),
            kick_show_hide_inventory_expired: true,
            // `updatedAt` de hoy para que la segunda alarma no la reabra: lo que se
            // comprueba aqui es el foco con el aviso callado, no el despertador.
            kick_drop_notifications: JSON.stringify([{
                id: CLAVE, title: 'x', key: CLAVE, kind: 'daily',
                seen: true, changed: true, createdAt: AHORA, updatedAt: AHORA
            }])
        }
    });
    comprobar(silenciada.solapaDelante === 'notifs',
        'con el aviso ya silenciado, el panel se sigue plantando en 🔔',
        silenciada.solapaDelante);
    comprobar(silenciada.medidor.existe && !silenciada.medidor.pide
        && /en riesgo|at risk/i.test(silenciada.medidor.texto || '')
        || /0\/60 min/.test(silenciada.medidor.texto || ''),
        'y el medidor sigue diciendo que la racha esta en riesgo', silenciada.medidor.texto);

    // 9. CONTROL: sin reto del dia no hay medidor. Sin el no hay reinicio que contar ni
    //    racha que estar a salvo, y una fila con un numero suelto no dice nada.
    const sinReto = await mirar({ challenges: null,
        seed: { kick_drops_streak: guardada(3) } });
    comprobar(!sinReto.medidor.existe, 'CONTROL: sin reto del dia no hay medidor');

    // 10. Y nada de marcadores sin sustituir, que es como se cuela una clave i18n que
    //    falte en un idioma.
    const sospechoso = [conNumero, nueve, sinNumero, aSalvo, porCobrar]
        .map(r => r.medidor.texto || '').filter(x => /\{t\}|undefined/.test(x));
    comprobar(sospechoso.length === 0, 'ningun texto deja un marcador sin sustituir', sospechoso);

    console.log(fallos ? `\n  ${fallos} FALLAN` : '\n  todo en verde');
    process.exit(fallos ? 1 : 0);
})();
