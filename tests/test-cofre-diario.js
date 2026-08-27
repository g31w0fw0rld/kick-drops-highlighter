// LA TARJETA DEL COFRE DIARIO en la rejilla de reclamados (2026-08-22).
//
// La recompensa diaria de Kick no es un drop: no sale en /drops, vive en el cofre de la
// barra de arriba y en `/api/v1/gamification/challenges`. La tarjeta la trae a la pestaña
// de reclamados con la misma forma que las demas baldosas, y tiene tres caras —lo que
// falta por ver, el boton de cobrar, y ya cobrada— que son los tres estados de la API.
//
// Lo que se comprueba, y por que cada caso:
//
//   · los tres estados pintan LO SUYO. El pie es el discriminante (nota / boton / ✓): el
//     resto de la tarjeta es igual en los tres, asi que sin mirarlo un estado pasaria por
//     otro.
//   · la casilla de reclamados manda. Es el mismo caso que el primero cambiando SOLO la
//     casilla, asi que le da la sensibilidad: la tarjeta promete un reclamo automatico
//     que sin esa casilla no existe, y una promesa asi no se puede pintar.
//   · un status desconocido no pinta nada, igual que no avisa. Un "perdido" para el dia
//     que se cierra sin cobrar caeria por descarte en «acumulando» y la tarjeta diria que
//     se reclama solo cuando ya no va a pasar.
//   · la ventana cerrada tampoco. El reto en memoria es de un dia que ya se fue.
//   · y el boton reclama DE VERDAD: pulsa el cofre de la barra, espera su dialogo, pulsa
//     el primario y —esto es lo que lo separa del automatico— deja el modal abierto, que
//     es el resultado que se ha pedido al pulsar. El cofre de este caso esta en CUENTA
//     ATRAS a proposito: el automatico exige el video de "disponible" y ahi se abstiene,
//     asi que cualquier reclamo que se vea es el del boton y no el suyo.
const { run, readFixture } = require('./harness');

const panel = readFixture('fixture-claimed-panel.html');

// El progreso de siempre de esta pestaña: dos recompensas ya cobradas, para que la
// rejilla se pinte y la tarjeta del cofre tenga donde ir.
const progress = [{
    name: 'Kick + Rust Wallpaper Pack', progress_units: 180,
    rewards: [
        { id: 'r1', name: 'Kick + Rust Wallpaper Logo', image_url: 'drops/reward-image/a.png', claimed: true, required_units: 60 },
        { id: 'r2', name: 'Kick + Rust Wallpaper Pattern', image_url: 'drops/reward-image/b.png', claimed: true, required_units: 120 }
    ]
}];

const hora = 60 * 60 * 1000;
const iso = ms => new Date(ms).toISOString();

// El reto tal como lo devuelve Kick (verificado el 2026-08-11 siguiendo uno de punta a
// punta). La ventana se compone alrededor de AHORA para que no caduque con el calendario.
const reto = (extra = {}) => [{
    recurrence: 'daily',
    status: 'in_progress',
    condition: { type: 'watch_time_minutes', progress: 14, threshold: 60 },
    window: { starts_at: iso(Date.now() - 6 * hora), ends_at: iso(Date.now() + 6 * hora) },
    ...extra
}];

const base = {
    url: 'https://kick.com/drops/claimed',
    panels: [{ hidden: false, html: panel }],
    progress, waitMs: 26000,
    seed: { kick_show_hide_inventory_expired: true }
};

(async () => {
    const fallos = [];
    const anota = (caso, r) => console.log(JSON.stringify({ caso, cofre: r.cofre }));

    // --- Acumulando: lo que falta por ver, y que se reclama solo -------------------
    const enCurso = await run({ ...base, challenges: reto() });
    anota('acumulando', enCurso);
    if (!enCurso.cofre) {
        fallos.push('acumulando: no se pinto la tarjeta del cofre');
    } else {
        const c = enCurso.cofre;
        if (c.pie !== 'nota') fallos.push(`acumulando: el pie es "${c.pie}" y tenia que ser la nota`);
        // 60 − 14. Y en minutos de VER, no una cuenta atras de reloj.
        if (c.izquierda !== '46m') fallos.push(`acumulando: falta por ver "${c.izquierda}" en vez de 46m`);
        if (c.contador !== '14/60') fallos.push(`acumulando: el contador dice "${c.contador}"`);
        if (c.imagen !== 'cofre') fallos.push(`acumulando: la imagen no es el cofre incrustado: ${c.imagen}`);
        if (!/reclama/i.test(c.pieTexto)) fallos.push(`acumulando: la nota no dice que se reclama solo: "${c.pieTexto}"`);
        // La barra, con la forma de las de Kick: al pie del recuadro de la imagen y con
        // el relleno escalado, no un ancho en porcentaje.
        if (!c.barra) {
            fallos.push('acumulando: la baldosa no trae barra de progreso');
        } else {
            if (!c.barra.enLaImagen) fallos.push('la barra no cuelga del recuadro de la imagen');
            if (Math.abs(Number(c.barra.valor) - 14 / 60) > 0.001) {
                fallos.push(`la barra va a ${c.barra.valor} y el reto está en 14/60`);
            }
            if (c.barra.texto !== '23%') fallos.push(`la barra se lee "${c.barra.texto}" en vez de 23%`);
            if (!/scaleX/.test(c.barra.relleno || '')) fallos.push(`el relleno no se escala: "${c.barra.relleno}"`);
        }
        // Y el aviso de lo que falta, que es el mismo texto que llevan las filas de
        // progreso de Kick.
        if (c.aviso !== 'Tiempo restante: 46m') fallos.push(`el aviso dice "${c.aviso}"`);
        if (!c.clicable) fallos.push('la baldosa no se ofrece como pulsable mientras se acumula');
    }

    // --- La misma cosa SIN la casilla: la baldosa se queda, la promesa no ----------
    //
    // Hasta el 2026-08-27 la baldosa ENTERA dependia de la casilla, y el argumento era
    // bueno a medias: la frase «se reclama solo» solo es cierta con la casilla puesta.
    // Pero atar la baldosa a esa frase se llevaba por delante los minutos que faltan, el
    // estado del reto y el boton de cobrar a mano, que no tienen nada que ver con
    // reclamar automaticamente y valen igual con la casilla quitada. Asi que ahora se
    // condiciona SOLO la frase, que es lo unico que la casilla puede desmentir.
    const sinCasilla = await run({ ...base, seed: {}, challenges: reto() });
    anota('sin la casilla', sinCasilla);
    if (!sinCasilla.cofre) {
        fallos.push('sin la casilla no se pinto la baldosa, y los minutos que faltan son ciertos igual');
    } else {
        const c = sinCasilla.cofre;
        // La barra, el numero y el aviso siguen: son el estado del reto, no una promesa.
        if (c.contador !== '14/60') fallos.push(`sin la casilla el contador dice "${c.contador}"`);
        if (c.aviso !== 'Tiempo restante: 46m') fallos.push(`sin la casilla el aviso dice "${c.aviso}"`);
        // Lo unico que se calla es la frase, y el pie sigue siendo el pie de «en curso»:
        // sin casilla no hay boton de reclamar automatico que ofrecer ni ✓ que pintar.
        if (c.pie !== 'nota') fallos.push(`sin la casilla el pie es "${c.pie}" y tenia que seguir siendo la nota`);
        if ((c.pieTexto || '').trim() !== '')
            fallos.push(`sin la casilla la nota sigue prometiendo un reclamo que no va a pasar: "${c.pieTexto}"`);
    }

    // --- Cumplido: el boton -------------------------------------------------------
    const listo = await run({
        ...base,
        challenges: reto({ status: 'claimable', condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 } })
    });
    anota('se puede cobrar', listo);
    if (!listo.cofre) fallos.push('claimable: no se pinto la tarjeta');
    else {
        if (listo.cofre.pie !== 'boton') fallos.push(`claimable: el pie es "${listo.cofre.pie}" y tenia que ser el boton`);
        // Cumplido el tiempo la barra sobra: lo que hay que mirar es el botón, y una
        // barra al 100% al lado solo le quita sitio.
        if (listo.cofre.barra) fallos.push('claimable: se pintó la barra con el tiempo ya cumplido');
        if (listo.cofre.aviso) fallos.push(`claimable: quedó el aviso de lo que falta ("${listo.cofre.aviso}")`);
    }

    // --- Ya cobrado: la ✓, el cuando y lo que toco ---------------------------------
    const hecho = await run({
        ...base,
        challenges: reto({
            status: 'claimed',
            condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 },
            claimed_at: iso(Date.now() - 2 * hora),
            winner: { id: 'w1', rarity: 'rare', card_url: 'drops/reward-image/carta.png' }
        })
    });
    anota('ya cobrado', hecho);
    if (!hecho.cofre) {
        fallos.push('claimed: no se pinto la tarjeta');
    } else {
        if (hecho.cofre.pie !== 'check') fallos.push(`claimed: el pie es "${hecho.cofre.pie}" y tenia que ser la ✓`);
        // Aqui el "cuando" SI existe: `claimed_at` lo trae, al contrario que los drops.
        if (!hecho.cofre.izquierda) fallos.push('claimed: la tarjeta no dice cuando se cobro, y el dato viene en claimed_at');
        if (hecho.cofre.imagen === 'cofre') fallos.push('claimed: se quedo el cofre en vez de la carta que toco (winner.card_url)');
    }

    // --- Status desconocido y ventana cerrada: nada -------------------------------
    const raro = await run({ ...base, challenges: reto({ status: 'missed' }) });
    anota('status desconocido', raro);
    if (raro.cofre) fallos.push('un status que no conocemos pinto tarjeta, y su nota prometeria un reclamo que no va a pasar');

    const cerrada = await run({
        ...base,
        challenges: reto({ window: { starts_at: iso(Date.now() - 30 * hora), ends_at: iso(Date.now() - 6 * hora) } })
    });
    anota('ventana cerrada', cerrada);
    if (cerrada.cofre) fallos.push('con la ventana ya cerrada se pinto tarjeta de un dia que ya no se puede ganar');

    // Y cerrada Y COBRADA tampoco, que es el caso que de verdad se ve: pasada la hora,
    // lo que queda en memoria es el reto de ayer, y en `claimed` eso es su ✓ y la carta
    // que tocó AYER dentro de la pestaña de hoy. La baldosa es la recompensa del día, no
    // un historial: hasta que el relevo traiga la de hoy, mejor un hueco.
    const ayer = await run({
        ...base,
        challenges: reto({
            status: 'claimed',
            condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 },
            claimed_at: iso(Date.now() - 20 * hora),
            winner: { id: 'w1', rarity: 'rare', card_url: 'drops/reward-image/carta.png' },
            window: { starts_at: iso(Date.now() - 30 * hora), ends_at: iso(Date.now() - 6 * hora) }
        })
    });
    anota('cobrada pero de ayer', ayer);
    if (ayer.cofre) fallos.push('se quedó la recompensa de ayer —su ✓ y su carta— en la pestaña de hoy');

    // --- Y el boton reclama de verdad ---------------------------------------------
    const pulsado = await run({
        ...base,
        challenges: reto({ status: 'claimable', condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 } }),
        cofre: 'cuenta',            // en cuenta atras: el automatico se abstiene
        clickCofre: { at: 20000 },
        waitMs: 30000
    });
    console.log(JSON.stringify({
        caso: 'pulsar Reclamar',
        botones: pulsado.botonesPulsados,
        modalAbierto: pulsado.dialogoAbierto
    }));
    const reclamos = (pulsado.botonesPulsados || []).filter(b => /claim daily reward/i.test(String(b || '')));
    if (reclamos.length === 0) {
        fallos.push('pulsar Reclamar no llego a pulsar el primario del dialogo de Kick; ' +
            `se pulsaron: ${JSON.stringify(pulsado.botonesPulsados)}`);
    }
    if (!pulsado.dialogoAbierto) {
        fallos.push('el modal de resultado de Kick se cerro; pedido a mano tiene que quedarse abierto');
    }

    // --- Y la baldosa a medias abre el modal, sin cobrar nada ----------------------
    // El otro gesto: aqui todavia no se puede reclamar, asi que el clic solo tiene que
    // abrir el modal del cofre —donde estan la cuenta atras y la racha— y no tocar su
    // primario. Es lo que separa este clic del boton del pie, y por eso se comprueba lo
    // que NO se pulsa: sin eso, un clic que reclamara pasaria por bueno.
    const abierto = await run({
        ...base,
        challenges: reto(),
        cofre: 'cuenta',
        clickTarjetaCofre: { at: 20000 },
        waitMs: 30000
    });
    console.log(JSON.stringify({
        caso: 'pulsar la baldosa a medias',
        botones: abierto.botonesPulsados,
        modalAbierto: abierto.dialogoAbierto
    }));
    if (!abierto.dialogoAbierto) fallos.push('pulsar la baldosa no abrió el modal del cofre');
    if ((abierto.botonesPulsados || []).some(b => /claim daily reward/i.test(String(b || '')))) {
        fallos.push('pulsar la baldosa reclamó, y con el tiempo sin cumplir no hay nada que reclamar');
    }

    // --- EL RELEVO DEL DIA, en la propia baldosa -----------------------------------
    // A la hora de cierre el reto de ayer muere y Kick abre el de hoy. La fila 🔔 ya
    // tenia probado que vuelve sola (test-racha-diaria), pero la baldosa cuelga del mismo
    // dato y de nadie mas: si el relevo no la repintara, se quedaria enseñando la ✓ y la
    // carta de AYER en la pestaña de hoy, que es peor que no enseñar nada.
    //
    // La ventana cierra a los 3 s y el reto que sirve la segunda peticion es el de hoy,
    // sin empezar. Lo que se mira es que cambie LA CARA: de la ✓ con la carta ganada a la
    // barra a cero con su nota.
    const relevo = await run({
        ...base,
        challenges: reto({
            status: 'claimed',
            condition: { type: 'watch_time_minutes', progress: 60, threshold: 60 },
            claimed_at: iso(Date.now() - 8 * hora),
            winner: { id: 'w1', rarity: 'rare', card_url: 'drops/reward-image/carta.png' },
            window: { starts_at: iso(Date.now() - 20 * hora), ends_at: iso(Date.now() + 3000) }
        }),
        challengesRefetch: reto({
            condition: { type: 'watch_time_minutes', progress: 0, threshold: 60 },
            window: { starts_at: iso(Date.now() + 3000), ends_at: iso(Date.now() + 24 * hora) }
        }),
        waitMs: 30000
    });
    anota('relevo del dia', relevo);
    if (!relevo.cofre) {
        fallos.push('tras el relevo la baldosa desapareció, y el reto de hoy está sin empezar');
    } else {
        const c = relevo.cofre;
        if (c.pie !== 'nota') fallos.push(`tras el relevo el pie es "${c.pie}": se quedó con la cara de ayer`);
        if (c.contador !== '0/60') fallos.push(`tras el relevo el contador dice "${c.contador}" y el reto de hoy va por 0`);
        if (c.imagen !== 'cofre') fallos.push('tras el relevo se quedó la carta que tocó ayer en vez del cofre');
        if (!c.barra) fallos.push('tras el relevo la baldosa no trae la barra del reto nuevo');
    }

    if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\nTODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
