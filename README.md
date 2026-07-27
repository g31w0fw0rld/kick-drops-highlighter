# Kick Drops Highlighter + Keywords

Userscript de Tampermonkey que clasifica y resalta drops/campañas en Kick según tus palabras clave. / Tampermonkey userscript that classifies and highlights drops/campaigns on Kick based on your keywords.

## Español

**Qué hace:** en la página de drops de **Kick** clasifica y **resalta** las campañas según una lista de palabras clave persistente y editable, para que localices de un vistazo las que te interesan.

**Características:**
- Palabras clave personalizables y persistentes.
- Interfaz multiidioma.

**Instalación:**
1. Instala [Tampermonkey](https://www.tampermonkey.net/).
2. Abre el instalador: [kick-drops-highlighter.user.js](https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js) (también en [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) y [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Sitio:** `kick.com/drops/*`

## English

**What it does:** on the **Kick** drops page it classifies and **highlights** campaigns based on a persistent, editable keyword list, so you can spot the ones you care about at a glance.

**Features:**
- Customizable, persistent keywords.
- Multi-language interface.

**Install:**
1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the installer: [kick-drops-highlighter.user.js](https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js) (also on [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) and [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Site:** `kick.com/drops/*`

## Privacidad / Privacy

**ES:** tus keywords y ajustes se guardan solo en tu navegador, en el almacenamiento del gestor de userscripts (keywords, drops descartados del inventario, notificaciones ya mostradas y preferencias del panel). Las consultas de drops e inventario van **únicamente a la API de Kick** (`web.kick.com`, el único host declarado en `@connect`) reusando tu propia sesión: el script toma la cabecera `Authorization` de las peticiones que la propia página hace a Kick, la mantiene **solo en memoria** —nunca la escribe en disco— y solo la captura cuando la URL resuelve a `kick.com`, nunca de peticiones a terceros. Los avisos son notificaciones locales del navegador. No hay terceros involucrados y no se envía nada al autor del script.

**EN:** your keywords and settings stay in your browser only, in the userscript manager's storage (keywords, drops dismissed from the inventory, notifications already shown and panel preferences). Drop and inventory queries go **exclusively to Kick's own API** (`web.kick.com`, the only host declared in `@connect`), reusing your existing session: the script takes the `Authorization` header from the requests the page itself makes to Kick, keeps it **in memory only** —never written to disk— and only captures it when the URL resolves to `kick.com`, never from third-party requests. Alerts are local browser notifications. No third parties are involved and nothing is sent to the script author.

## Apoyar / Support

Esto es parte de algo que estoy construyendo para crecer. Si te sirve y quieres apoyar, puedes invitarme un café en **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —solo si quieres—; y si hay una causa que lo necesite más que yo, ayúdala a ella.

This is part of something I'm building to grow. If it helps you and you'd like to support it, you can tip me on **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —only if you want—; and if a cause needs it more than I do, help that one instead.

---
Autor / Author: **g31w0fw0rld** · Licencia / License: **MIT**
