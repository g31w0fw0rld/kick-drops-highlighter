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

## Qué cubre cada uno

| Test | Qué vigila |
|---|---|
| `test-campaigns.js` | Resaltado verde en `/drops/campaigns`, con su chip y su 🔗 |
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

## Los fixtures

`fixture-claimed-panel.html` y `fixture-group.html` salen de `docs/dom-claimed-2026-08.html`,
y `fixture-expired-panel.html` de `docs/dom-expired-2026-08.html`: volcados reales de esas
pestañas, recortados por balanceo de `<div>` y sin retocar por dentro. Se revisaron buscando rastros de cuenta
—usuario, correo, token, avatar— y no hay ninguno: lo único con pinta de identificador son
los ULID de los nombres de fichero de las imágenes de recompensa en el CDN, que son de la
recompensa y no de nadie.
