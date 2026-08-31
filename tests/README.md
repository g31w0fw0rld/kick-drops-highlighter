# Arnés de regresión

Arranca **el userscript de verdad** dentro de jsdom, sobre un DOM de Kick, y comprueba lo
que deja pintado: los ids `drop-match-*`, el color del borde, las tarjetas del panel, la
rejilla de reclamados. Se miran **efectos observables**, los que ve el usuario, y no
funciones internas: así un refactor no rompe los tests y un cambio de comportamiento sí.

No hay framework. Cada test es un fichero que se ejecuta solo e imprime lo que encontró;
los que terminan en un veredicto dicen `TODO OK` o `FALLOS: …`, y el resto son
descriptivos —se leen— porque comprueban forma, no igualdad.

## Correr

```sh
cd tests
npm install          # solo jsdom
node test-chips-share.js
```

Cada test tarda entre 15 y 30 s: el script espera a que el DOM se asiente y los tiempos
son reales, no simulados. `waitMs` en cada test es lo que hay que subir si algo sale vacío.

El arnés **cierra la ventana de jsdom** en cuanto tiene el informe. Hace falta para que el
proceso termine: el script deja intervalos puestos y jsdom los mantiene vivos, así que un
test que ya imprimió «TODO OK» se quedaba corriendo para siempre. No se veía como un fallo
sino como lentitud —el 2026-08-22 había catorce procesos de esta sesión a la vez, el más
viejo de hora y media, peleándose por la CPU con el que se acababa de lanzar—. La
excepción es `dejarAbierta: true`, para el único informe que trae un gancho **vivo** —la ×
de la racha, que se pulsa después de recibirlo—: ahí no se puede cerrar, y el test que la
pide tiene que salir él mismo.

## Qué cubre cada uno

| Test | Qué vigila |
|---|---|
| `test-campaigns.js` | La página con una campaña **abierta** de verdad: verde, título con estudio, la fecha de la tarjeta y no la del párrafo de la pestaña, y la copia oculta sin filtrarse |
| `test-progreso-campanas.js` | El progreso en la pestaña de campañas: el aviso al apuntar y el modal al pulsar, en los dos tramos; el `title` guardado y devuelto; los chips y la marca ⏳ que sobreviven a que llegue `/drops/progress`; el tramo elegido por NOMBRE y no por cercanía de minutos; y el respaldo que reconstruye el progreso **sin API**, desde la barra |
| `test-reclamacion-automatica.js` | Que se pulse el botón «Claim» de la tarjeta, y sólo con la casilla marcada: encendida, apagada y **marcada a mitad de sesión** (el fallo del 2026-08-22, que sólo reclamaba al recargar) |
| `test-ocultar-reclamado.js` | Que la recompensa ya reclamada desaparezca de la página con la casilla marcada, y **sólo esa**: la del mismo fixture sin reclamar se queda (la baldosa pelada es idéntica, así que decidirlo por la forma del DOM fallaría), la casilla apagada no esconde nada, y marcarla a mitad de sesión también esconde |
| `test-comingsoon.js` | Resaltado azul en `/drops/coming-soon`, y que su 🔗 enlace a **esa** pestaña y no a la de abiertas |
| `test-api-panel.js` | Las tres secciones llenas desde la API, sin duplicar lo escaneado, y el 🔗 de una próxima compartida **desde abiertas** |
| `test-panel-vacio.js` | Cuatro rutas sin campañas: el panel no se queda mudo |
| `test-chips-share.js` | El caso real: `rage` dentro de «averageaden» tiene que sacar su etiqueta; 🔗 solo en abiertas |
| `test-claimed.js` | `/drops/claimed` con el DOM real, sin datos de progreso: la rejilla no se pinta y lo de Kick se queda |
| `test-claimed-hide.js` | Con la casilla marcada: bloque de Kick escondido, rejilla con título |
| `test-claimed-nodup.js` | Con la casilla **apagada**: nada de lista duplicada, y ni un botón nuestro encima de las tarjetas |
| `test-claimed-late.js` | El panel de Kick montándose tarde: la rejilla tiene que aparecer igual |
| `test-claimed-sin-datos.js` | Reclamados **sin** datos de progreso: la pestaña no se puede quedar en blanco |
| `test-cartel-buscando.js` | El cartel naranja del panel, mirado **a mitad de vuelo**: visible mientras busca, fuera al acabar |
| `test-expired.js` | La ruta `/drops/expired` con su DOM real: las cerradas que casan van en **rojo** |
| `test-cambio-pestana.js` | Navegando de verdad (pushState): que se marque al **llegar** a cerradas y a abiertas, y que enfoque una **sub-campaña** |
| `test-foco-en-la-pagina.js` | Estando YA en la pestaña: cada tarjeta deja **su propio título** arriba —no el bloque que lo contiene— y no cambia de pestaña |
| `test-foco-entre-pestanas.js` | Pulsar una tarjeta de otra pestaña: ida (destino guardado + pestaña correcta) y vuelta (scroll + destino consumido), en cerradas y en próximas |
| `test-fuera-del-dom.js` | Que **solo** se lea dentro del `<main>` de drops: con las tres pestañas vacías, ni la barra lateral en el panel ni una marca fuera |
| `test-casa-por-la-campana.js` | La campaña que casa por algo que la fila no enseña: se marca, dice por qué, avisa, y no se borra al añadir otra keyword — con el cruce exacto y la negativa mandando |
| `test-racha-diaria.js` | El recordatorio del cofre diario: sale sin empezar y a medias, calla cumplido / con `status` desconocido / con otro tipo de reto, y la × lo silencia solo hasta mañana |
| `test-cofre-diario.js` | La tarjeta del cofre diario en la rejilla de reclamados: sus tres caras —lo que falta por ver, el botón de cobrar y la ✓ con el cuándo—, que un `status` desconocido no pinta nada y una ventana cerrada tampoco —**ni cobrada**, que es la de ayer—, que sin la casilla de reclamados no sale (mismo caso, sola diferencia), que mientras se acumula lleva la barra de Kick al pie de la imagen y el aviso con lo que falta —y que al cumplirse no lleva ninguna de las dos—, que el botón **reclama de verdad** —pulsa el cofre, espera su diálogo, pulsa el primario— y deja el modal de Kick abierto, que pulsar la **baldosa** a medias abre ese modal sin reclamar nada, y que al **relevo del día** la baldosa se cambia sola —de la ✓ con la carta de ayer a la barra a cero del reto de hoy— sin recargar |
| `test-cofre-sin-reclamados.js` | La misma tarjeta en una pestaña de reclamados **vacía** (cero drops cobrados, ni un grupo del que colgarse): que la rejilla se pinta igual con el cofre como única baldosa y esconde el «No claimed campaigns yet» de Kick, y que **sin** cofre no pinta nada ni toca ese cartel |
| `test-cofre-movil.js` | El cofre cuando Kick lo baja al menú de la cuenta, que en móvil es el único sitio donde está: que la baldosa lo encuentra con el menú abierto, que con el menú **cerrado** —donde la fila no existe— da los dos pasos (avatar, esperar a que React la monte, pulsarla) y acaba con el modal abierto sin cobrar, que el **automático** hace ese mismo camino y cobra cuando el reto está `claimable`, que a medias no toca nada, y que el camino de escritorio sigue igual |
| `test-rejilla-entre-pestanas.js` | El viaje reclamados → cerradas → reclamados **sin recargar**: que la rejilla no se quede colgando en la pestaña de cerradas, que allí no queden bloques apagados por nosotros, que al volver se vuelva a pintar —una sola—, y que los filtros por juego de Kick se escondan en reclamados y **no** en cerradas |
| `test-grupo-sin-estudio.js` | El grupo cuyos dos `<p>` traen el contador: su título sale sin estudio, y el gemelo de la API se va **solo si es 1:1** |
| `test-badges-proximas.js` | Los badges de recompensa en **próximas** —lo que reparte y lo que cuesta— y que ahí NO salga la línea de urgencia; abiertos conserva las dos |
| `test-expiradas-reclamadas.js` | La cerrada con todo reclamado se va del panel (la página la tiene en Reclamados); la que aún debe algo se queda, y sin inventario no se esconde nada |
| `test-tooltip-propio.js` | La caja de aviso del script: sale con su texto, peso 600 solo para los valores, y el `title` se guarda mientras está arriba y vuelve al salir |
| `test-tooltips-cabecera.js` | Los tres controles que solo son un icono —ℹ️, el chevrón y la ✕ de la racha—: cada uno dice lo suyo, y el del chevrón cambia según si el clic va a contraer o a desplegar |
| `test-icono-incrustado.js` | Que el `@icon` vaya **incrustado** como `data:image/png;base64,…` y que el base64 decodifique a un PNG cuadrado de verdad. No comprueba una URL: existe porque un `@icon` remoto hizo que **OpenUserJS rechazara con un 500** la release 1.1.1 de `alienware-arena-arp-tracker` («unsupported file type: undefined») mientras GitHub y GreasyFork la aceptaban sin queja — o sea que el fallo solo se ve en el tercer destino y después de haber pusheado. Que la URL responda 200 con tipo de imagen **no basta**: el favicon de AWA pasaba esas comprobaciones. |

El cofre lo monta **solo** quien lo pide, porque no vive en el `<main>` de drops y en los volcados de
escritorio de `docs/` no aparece. Cuatro variantes, y las diferencias son las que deciden quién puede
reclamar: `cofre: 'disponible'` (el botón del navbar con el vídeo del CTA, la única señal que mira el
automático en escritorio), `'cuenta'` (el mismo en cuenta atrás), `'movil'` (no hay botón en la barra: Kick
baja el cofre a una fila del menú de la cuenta, y aquí el menú ya está **abierto**) y `'movil-cerrado'` (el
caso de verdad: sólo el avatar, y la fila **no existe en el DOM** hasta pulsarlo). Las dos de móvil montan el
marcado **real** del volcado —`fixture-menu-movil.html` y `fixture-navbar-account.html`, saneadas de la
cuenta— y no uno inventado: el menú trae diez filas más y la del cofre no es la primera, así que con un menú
de dos filas un buscador que se agarrara a la posición pasaría por bueno.

Al pulsar el cofre, el arnés abre un diálogo como el de Kick —con su primario de reclamar y su X—, que en
móvil es un **drawer de vaul** y no el Radix de escritorio. Y ese diálogo **se cierra de verdad**, por la X y
por Escape. Eso último no es decorado: «el modal se queda abierto» es la única cosa que separa el reclamo a
mano del automático, y con un diálogo que no se pudiera cerrar los dos se verían igual.

Los dos gestos van por **delegación** en `document` y con retardo a propósito —120 ms el menú, 150 ms el
diálogo—, no enganchados al nodo: en móvil la fila no existe cuando se monta la página, y sin ese retardo un
script que no sondeara pasaría el test igual.

**El script arranca una sola vez, y hay que mantenerlo así.** Todo él vive dentro de un
`addEventListener("load", …)`, y jsdom lanza su propio `load` además del que disparaba el
arnés: hasta el 2026-08-12 arrancaba **dos veces**, con dos juegos completos de variables.
No se veía —el panel no se duplica porque se busca por id— hasta que un contador propio de
cada arranque empezó a contar el doble. Ahora el arnés espera a que jsdom termine de cargar
con nadie escuchando, y solo entonces evalúa el script y dispara un único `load`. Quitar el
sintético y fiarse del de jsdom **no** vale: con los temporizadores de los casos anteriores
encima, ese evento llega tarde y el caso sale vacío sin que nada esté roto.

Todas las páginas del arnés llevan **la barra lateral de Kick fuera del `<main>`**, con su
menú y dos canales recomendados. No es decorado: es el sitio del que salió el falso positivo
del 2026-08-07 —un canal recomendado pintado de verde y metido en el panel como campaña
abierta—, y sin ella el fallo no se puede ver, porque los volcados de `docs/` son solo el
`<main>`.

`navigateTo` acepta **una lista de pasos**, para poder hacer el viaje de ida y vuelta: hay
fallos que solo aparecen al volver. Y acepta `reactSwap: true`, que es el modo fiel: en vez de
vaciar el contenedor con `innerHTML` —lo que se lleva por delante también lo que inyecta el
script— reproduce lo que hace React, que **reutiliza** los nodos coincidentes y deja donde
estaban los ajenos. La diferencia no es teórica: con el modo viejo,
`test-rejilla-entre-pestanas.js` pasaba en verde teniendo el fallo dentro, porque el arnés
hacía la limpieza que venía a comprobar. Lo que ese modelo **no** reproduce es el
`display:none` que se queda en un nodo de Kick reutilizado; ahí los nodos son nuevos.

`KICK_SCRIPT=<ruta>` hace que el arnés cargue OTRO fichero. Es para las comprobaciones de
sensibilidad: correr el mismo test contra una copia sin el arreglo y ver que falla.

## Los fixtures

`fixture-campaigns-active.html` sale de `docs/dom-campaigns-2026-08.html`, que es el primer
volcado con una campaña **abierta** en la página rediseñada (PUBG, 2026-08-21). Lleva a
propósito el párrafo descriptivo de la pestaña —el del `text-neutral-300`— **fuera** del
grupo y delante de él, tal y como está en la página: es la trampa que documenta
`_dateRangeOf`, porque ese selector se consulta primero y en el DOM viejo era la fecha.

`fixture-campaigns-progress.html` y `fixture-campaigns-claim.html` salen de los dos volcados
del 2026-08-22, los primeros con un canal emitiendo: el de PUBG con los dos tramos en curso
(27% y 13%, «22 min to unlock» / «52 min to unlock») y el mismo con el primero ya completo
—barra en `data-state="complete"` y su botón `aria-label="Claim … reward"`—. Son el único DOM
que tiene el par barra-con-progreso + botón de reclamar: hasta ese día no había ninguno.

`fixture-campaigns-after-claim.html` es el tercero de esa tanda, tomado justo después de
reclamar: la recompensa cobrada se queda como una **baldosa pelada** —imagen, nombre y nada
más: ni barra, ni botón, ni texto de estado— al lado de la que sigue viva al 67%. Es el DOM
que prueba que Kick NO retira lo reclamado de la pestaña de campañas, y también el que
impide el atajo tentador: sin barra no significa reclamado —en `fixture-campaigns-active.html`
las dos recompensas están igual de peladas por tener el contador a cero—, así que lo único
que puede decidirlo es `/drops/progress`.

`fixture-claimed-panel.html` y `fixture-group.html` salen de `docs/dom-claimed-2026-08.html`,
y `fixture-expired-panel.html` de `docs/dom-expired-2026-08.html`: volcados reales de esas
pestañas, recortados por balanceo de `<div>` y sin retocar por dentro. Se revisaron buscando rastros de cuenta
—usuario, correo, token, avatar— y no hay ninguno: lo único con pinta de identificador son
los ULID de los nombres de fichero de las imágenes de recompensa en el CDN, que son de la
recompensa y no de nadie.
