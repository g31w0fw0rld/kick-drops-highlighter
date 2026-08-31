// El @icon tiene que ir INCRUSTADO como data: URI, no apuntando a un favicon ajeno.
//
// El 2026-08-31 OpenUserJS respondió 500 al sincronizar `alienware-arena-arp-tracker`
// 1.1.1: «`@icon` unsupported file type: undefined (file: undefined)», con
// `@icon https://www.alienwarearena.com/favicon.ico`. GitHub y GreasyFork la habían
// aceptado sin queja, así que el fallo SOLO salía en el tercer destino, después de
// haber pusheado y bumpeado: costó un ciclo entero arreglarlo.
//
// La causa exacta nunca se determinó, y conviene no volver a suponerla: hay scripts
// publicados allí con un `.ico` remoto que sí funcionan (Amazon_URL_Cleaner usa
// https://www.amazon.com/favicon.ico) y los dos ficheros son casi idénticos —mismo
// magic, mismo bpp, tamaño parecido, los dos con `Content-Type` de imagen y los dos
// 200—. Se eligió el data: URI porque NO depende de conocer la causa: no se descarga,
// no se olfatea, no tiene host y declara su propio tipo, que es justo lo que el error
// dice que no pudo determinar. Precedente vivo en el mismo sitio:
// openuserjs.org/scripts/Juampi_Mix/EmuParadise_1up
//
// Esta prueba existe para que nadie lo revierta a una URL remota sin saber que eso ya
// rompió una publicación. Comprobar que la URL responde 200 con tipo de imagen NO
// sirve: el favicon de AWA pasaba esas tres comprobaciones y aun así falló el envío.
//
// CONTROL NEGATIVO — siempre sobre una COPIA, nunca recortando el fichero rastreado
// (hacerlo a lo bruto ya dejó una vez un «todo en verde» que era de antes del recorte):
//   sed 's|^// @icon .*|// @icon         https://ejemplo.com/favicon.ico|' \
//     kick-drops-highlighter.user.js > /tmp/icono-remoto.user.js
//   KICK_SCRIPT=/tmp/icono-remoto.user.js node tests/test-icono-incrustado.js   # → FALLOS
const fs = require('fs');
const path = require('path');
const RUTA = process.env.KICK_SCRIPT
    || path.join(__dirname, '..', 'kick-drops-highlighter.user.js');
const fuente = fs.readFileSync(RUTA, 'utf8');

// Solo la cabecera: si el data: URI apareciera en el cuerpo del script no valdría,
// porque lo que lee Tampermonkey —y lo que valida OpenUserJS— es el bloque de metadatos.
const cab = fuente.slice(0, fuente.indexOf('==/UserScript=='));
const icon = (cab.match(/@icon\s+(\S+)/) || [])[1] || '';

const fallos = [];
const check = (nombre, cond, detalle) => {
    console.log((cond ? '  ok   ' : '  FALLA ') + nombre + (detalle ? ' — ' + detalle : ''));
    if (!cond) fallos.push(nombre);
};

check('hay @icon en la cabecera', !!icon);
check('es un data: URI de PNG, no una URL remota',
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon),
    icon.slice(0, 48) + (icon.length > 48 ? '…' : ''));

const crudo = Buffer.from(icon.replace(/^data:image\/png;base64,/, ''), 'base64');
const esPng = crudo.length > 300
    && crudo[0] === 0x89 && crudo[1] === 0x50 && crudo[2] === 0x4e && crudo[3] === 0x47;
check('y el base64 decodifica a un PNG de verdad', esPng,
    crudo.length + ' bytes, magic ' + [...crudo.slice(0, 4)].map((b) => b.toString(16)).join(' '));

// Las medidas salen del IHDR, que en un PNG siempre empieza en el byte 16. Un icono
// que no sea cuadrado se ve deformado en el panel de Tampermonkey.
if (esPng) {
    const ancho = crudo.readUInt32BE(16), alto = crudo.readUInt32BE(20);
    check('el PNG es cuadrado y de al menos 32 px',
        ancho === alto && ancho >= 32, ancho + 'x' + alto);
}

console.log(fallos.length ? 'FALLOS: ' + fallos.join(' | ') : 'TODO OK');
process.exit(fallos.length ? 1 : 0);
