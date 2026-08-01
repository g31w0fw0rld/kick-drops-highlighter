# Kick Drops Highlighter + Keywords

Tampermonkey userscript that classifies and highlights drops/campaigns on Kick based on your keywords. / Userscript de Tampermonkey que clasifica y resalta drops/campañas en Kick según tus palabras clave.

> [!NOTE]
> **ONE CHECKBOX DOES TWO THINGS / UNA CASILLA HACE DOS COSAS:** ticking *hide expired/completed* also turns on automatic claiming — of your finished **drops** and of the **daily reward chest**, which the label does not say. It claims by clicking Kick's own buttons for rewards you already earned by watching: nothing is sent to Kick's API to claim, and it grants you nothing you could not click yourself. It is still automation, which Kick's terms may not permit, so decide with that in mind. / Marcar *ocultar cerrados/completados* activa además la reclamación automática —de tus **drops** terminados y del **cofre de recompensa diaria**—, algo que la etiqueta no dice. Reclama pulsando los propios botones de Kick, sobre recompensas que ya te ganaste viendo: no se envía nada a la API de Kick para reclamar, y no te da nada que no pudieras pulsar tú. Sigue siendo automatización, que las condiciones de Kick pueden no permitir, así que decide sabiéndolo.

![The campaigns list with the matching campaign outlined in green, showing the time left and the watch time still needed, next to the panel](docs/screenshot-campaigns.png)

*Campaigns: matching campaigns get outlined **green** on the page itself, and each one says what it still costs you right there — here *Counter-Strike 2* is about to close, so it shows **⌛ 24 h · you still need 16m** in red; a campaign with no hurry shows a plain grey **⏱** with the time instead. The panel lists the same campaigns with their rewards, the filter chips and the sort. / Campañas: las campañas que coinciden se enmarcan en **verde** en la propia página, y cada una dice ahí mismo lo que todavía te cuesta — aquí *Counter-Strike 2* está por cerrar, así que lleva **⌛ 24 h · te faltan 16m** en rojo; una campaña sin prisa lleva en su lugar un **⏱** gris con el tiempo. El panel lista esas mismas campañas con sus recompensas, las etiquetas de filtro y el orden.*

![The expired tab, with the matching closed campaign outlined in red](docs/screenshot-expired.png)

*Expired: same idea in **red**, so a campaign that closed is obvious rather than something you find out by clicking. The tab keeps its own count, and the filters never touch it — there is nothing left to decide there. / Cerrados: lo mismo en **rojo**, para que una campaña que ya cerró se vea, en vez de descubrirlo al hacer clic. La pestaña lleva su propia cuenta, y los filtros no la tocan: ahí ya no hay nada que decidir.*

![The inventory tab, with the exact time remaining shown next to an in-progress drop](docs/screenshot-inventory.png)

*Inventory: hovering a drop in progress shows **exactly how much watch time is left** — Kick only tells you the tier it unlocks at (*35hr*), never how far you still are from it (*16m*). Each entry also gets an ✕ to take it out of the view. In the panel beside it, **the rewards you already own are ticked and struck through** one by one, the last one left keeps its watch time, and above the tabs sit the four filter chips and the two sort chips. / Inventario: al pasar el ratón por un drop en progreso sale **cuánto tiempo de visualización falta exactamente** — Kick solo te dice el tramo en que se desbloquea (*35hr*), nunca cuánto te queda para llegar (*16m*). Cada entrada tiene además una ✕ para sacarla de la vista. En el panel de al lado, **las recompensas que ya tienes van con ✓ y tachadas** una a una, la única que queda conserva su tiempo, y encima de las pestañas están las cuatro etiquetas de filtro y las dos de orden.*

<img src="docs/screenshot-drop-details.png" width="380" alt="The drop details popover showing progress, time remaining, rewards and the Accept button">

*Clicking that same drop opens the full detail: progress in minutes and percent, time remaining and what you get. / Al hacer clic en ese mismo drop se abre el detalle completo: progreso en minutos y porcentaje, tiempo restante y lo que te llevas.*

## English

### What it does

**Highlighting**
- Marks the campaigns on Kick's drops page that match your keywords, **on the page itself** — green for open, red for closed — so you spot them while scrolling instead of opening each one.
- Campaigns that match nothing are left exactly as they were.

**The panel**
- A floating panel, collapsible and remembered, listing what matched split into **Active**, **Upcoming** and **Expired**, each with a count so you know at a glance whether it is worth looking.
- Every entry shows the campaign, the studio, the exact window it runs, the keyword that matched it and **each reward with the hours needed to unlock it**.
- **Rewards you already own are marked** — ticked, struck through and dimmed, one by one, so what is left to earn is what stands out. Two rewards that ask for the same watch time are not the same drop, so each one is checked separately, and when every reward on a badge is already yours the badge drops the watch time it asked for and says **Claimed** on hover instead.
- **What you already earned but have not collected gets its own mark** — 🎁 and highlighted, never dimmed, because it is the one thing on the badge still waiting on you. It is not "almost there": the watch time is done, only the click is missing, and it expires with the campaign like everything else. The closing warning counts them, so a campaign about to end tells you how much you are about to throw away.
- **What is about to close rises to the top.** When a reward you do not own yet is running out of time, the card says how long is left and how much watch time you still need — red under 24 hours, amber under 72 — and the active list is ordered by whatever closes first. If the time no longer fits, it says so, instead of letting you start something you cannot finish. The same ⏳ lands on the campaign's own card on the page, so the hurry is visible while you scroll.
- **Reload drops** re-queries without a page refresh, and also brings back anything you dismissed from the inventory.

**Keywords**
- The list ships with about 30 popular franchises and it is yours to change.
- **Click a chip to delete it**, **+** to add, **Edit Keywords** to rewrite the whole list as one comma-separated line, and **Reset to Default** to start over. Each change reloads so the highlighting is rebuilt.
- **A keyword starting with `-` excludes instead of matching.** `rust` plus `-console` finds Rust and drops the console spin-off, even though `rust` is right there in its name. An exclusion beats every match, and it removes the campaign everywhere at once: no highlight on the page, no card in the panel, no 🔔. Existing alerts for what you just excluded are cleared as you add it.

**View filters**
- Four chips above the tabs — **☑ something left**, **⏳ closing soon**, **🎁 unclaimed**, **⚡ 1 h or less** — narrow what the panel shows. They are a lens, not a second keyword list: the page highlighting, the card marks and the notifications are untouched, so switching one on costs nothing and needs no reload.
- They **add up**: turn on ⏳ and ⚡ together and you get what closes soon *and* can still be finished in an hour. They only trim the **active** tab — nothing is closing in upcoming and nothing is left to decide in expired.
- **⚡ measures what you have left**, not what the campaign advertises: a 30-minute tier you already claimed does not make it a quick one.
- Filters are **remembered between reloads**, so the tab counts what is showing out of what there is — `Active Drops (3/12)` — and an empty list says the filters hid it, with a link to clear them. A filter you forgot about never looks like an empty day.
- **Nothing is hidden on a guess.** Until the inventory has loaded, the script cannot tell what is claimed or earned, so the state filters let everything through rather than emptying the panel while it starts up.
- **When the inventory has not arrived, the panel says so.** Without it the script cannot know what you own or how much you have watched, so the ✓, the 🎁, the "you still need" and the state filters all go quiet at once. A warning after a few seconds is the difference between a slow day and a panel that knows nothing about you.
- **Sort the open list your way:** by whatever closes first (the default — a deadline is the only thing that runs out on its own) or by whatever asks the least time. The two chips sit under the filters. Sorting by cheapest puts a reward you already earned at the very top: nothing is left to watch there, only a click.

**On the page itself**
- **Every open campaign shows what it still costs you**, on its own card, without opening the panel: ⏱ and the watch time you need for its cheapest remaining reward. A campaign closing within 72 hours shows the deadline and the time needed together — the deadline alone does not tell you whether it is worth starting.

**Inventory**
- **Hide expired/completed from the inventory** — one checkbox that also turns on **automatic claiming**, both of finished drops and of the daily reward chest below. Read the warning above before ticking it.
- **Hover a drop in progress and it tells you the exact watch time left.** Kick shows the tier a reward unlocks at, not how far you still are from it; the script does that subtraction for you.
- **Click the same drop for the full detail:** progress in minutes and percent, time remaining and the rewards it grants. If the progress cannot be worked out, the click is passed through to Kick untouched rather than swallowed.
- **Dismiss any entry with ✕** to clear the clutter of things you do not care about; *Reload drops* brings them all back.

**Daily reward chest — this is not a drop**
- Kick also hands out a **daily reward** just for watching streams, from the chest in the top bar. It has nothing to do with drop campaigns, and the script claims it for you too.
- **It only opens the chest when the reward is actually available.** Kick swaps the static chest icon for an animated one when there is something to collect, and the script waits for that instead of opening and closing the dialog while you browse.
- It reads the three states the claim button can be in — ready, still counting down ("watch X more minutes") or already claimed today — and only clicks when there is something to claim. It also dismisses the toast Kick pops in the corner.
- **The detection is language-independent**: it matches on icon shapes and layout, not on the button's text, which is what lets it work across all 16 languages without a translation per case.
- **The chest is always checked after the drops review, never during it.** On the inventory that means campaigns are scanned first, then drops are auto-claimed, and only when that finishes does the chest get opened — otherwise its dialog would steal focus mid-navigation.
- **It is governed by the same automatic-claiming checkbox** as the drops. One switch, two things claimed.

**Claimed drops**
- Builds its own **claimed** section from Kick's API, reusing the data already intercepted from the page when it is there and asking for it explicitly only when it is not.
- Fully-claimed campaigns and individual claimed items can be hidden with the same inventory checkbox.

**Change notifications**
- Watches the campaign list and flags what changed since you last looked. The 🔔 tab carries a **pending count** and lists the affected campaigns by name.
- **A 🔔 also lands on the campaign's own card** on the page, so a change is visible where you are already looking and not only inside the panel.
- **The 👁️ button marks one as seen and takes you to it** — on the campaigns view it scrolls the campaign into the centre of the screen, and from the inventory it switches to the campaigns view first and then goes to it, so you never have to hunt for it. **Mark all as seen** clears the lot in one click.
- **Notifications are pruned with your keywords.** Delete a keyword and its pending alerts go with it; rewrite the list and anything that no longer matches is dropped, so the 🔔 count never counts things you stopped caring about.
- It also raises a **desktop notification** with the pending count, asking for permission the first time, and falls back to the userscript manager's own notification if the browser API is unavailable.

**Language:** 16 languages — Spanish, English, German, French, Portuguese, Russian, Turkish, Japanese, Korean, Polish, Finnish, Vietnamese, Chinese, Arabic, Hindi and Indonesian — following the language Kick serves the page in, falling back to English.

**Install:**
1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the installer: [kick-drops-highlighter.user.js](https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js) (also on [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) and [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Site:** `kick.com/drops/*`

## Español

### Qué hace

**Resaltado**
- Marca las campañas de la página de drops de Kick que coinciden con tus palabras clave, **en la propia página** —verde las abiertas, rojo las cerradas—, así las ves mientras haces scroll en vez de abrir una por una.
- Las campañas que no coinciden con nada se quedan exactamente como estaban.

**El panel**
- Un panel flotante, plegable y recordado, que lista lo que coincidió separado en **Abiertos**, **Próximos** y **Cerrados**, cada uno con su cuenta para saber de un vistazo si vale la pena mirar.
- Cada entrada muestra la campaña, el estudio, la ventana exacta en que corre, la palabra clave que la encontró y **cada recompensa con las horas que hacen falta para desbloquearla**.
- **Las recompensas que ya tienes vienen marcadas** —con ✓, tachadas y atenuadas, una por una—, así lo que resalta es lo que te falta por conseguir. Dos recompensas que piden el mismo tiempo no son el mismo drop, así que cada una se comprueba por separado, y cuando todas las de un badge ya son tuyas el badge deja de mostrar el tiempo que pedía y dice **Reclamados** al pasar el ratón.
- **Lo que ya te ganaste y no has recogido lleva su propia marca** —🎁 y resaltado, nunca atenuado—, porque es lo único del badge que sigue esperándote a ti. No es un "casi": el tiempo de visualización ya está hecho, lo que falta es el clic, y caduca con la campaña igual que todo lo demás. El aviso de cierre los cuenta, así que una campaña a punto de acabar te dice cuánto estás a punto de tirar.
- **Lo que está por cerrar sube arriba.** Cuando a una recompensa que aún no tienes se le acaba el tiempo, la tarjeta dice cuánto queda y cuánto tiempo de visualización te falta —rojo por debajo de 24 h, ámbar por debajo de 72— y la lista de abiertos se ordena por lo que antes cierra. Si ya no da tiempo, lo dice, en vez de dejarte empezar algo que no vas a terminar. El mismo ⏳ cae en la propia tarjeta de la campaña en la página, para que la prisa se vea haciendo scroll.
- **Recargar drops** vuelve a consultar sin refrescar la página, y además devuelve lo que hayas descartado del inventario.

**Palabras clave**
- La lista viene con unas 30 franquicias populares y es tuya para cambiarla.
- **Haz clic en una etiqueta para borrarla**, **+** para añadir, **Editar Keywords** para reescribir la lista entera como una línea separada por comas, y **Restaurar Predeterminadas** para empezar de cero. Cada cambio recarga, así que el resaltado se rehace.
- **Una palabra clave que empieza por `-` descarta en vez de buscar.** `rust` más `-console` encuentra Rust y deja fuera el spin-off de consola, aunque lleve `rust` en el nombre. Un descarte gana a cualquier coincidencia, y quita la campaña de todos los sitios a la vez: ni resaltado en la página, ni tarjeta en el panel, ni 🔔. Los avisos que ya hubiera de lo que acabas de descartar se limpian al añadirla.

**Filtros de vista**
- Cuatro etiquetas encima de las pestañas —**☑ algo pendiente**, **⏳ cierra pronto**, **🎁 sin reclamar**, **⚡ tramo ≤ 1 h**— recortan lo que enseña el panel. Son una lente, no una segunda lista de keywords: el resaltado de la página, las marcas de la tarjeta y las notificaciones se quedan igual, así que encender una no cuesta nada y no recarga.
- **Se suman**: enciende ⏳ y ⚡ a la vez y te queda lo que cierra pronto *y* además se puede terminar en una hora. Solo recortan la pestaña de **abiertos** — en próximos no cierra nada y en cerrados ya no hay nada que decidir.
- **⚡ mide lo que te queda a ti**, no lo que anuncia la campaña: un tramo de 30 minutos que ya reclamaste no la convierte en un rato corto.
- Los filtros **se recuerdan entre recargas**, así que la pestaña cuenta lo que se ve de lo que hay —`Drops Abiertos (3/12)`— y una lista vacía dice que los escondieron los filtros, con un enlace para quitarlos. Un filtro que se te olvidó no parece nunca un día sin drops.
- **No se esconde nada a ciegas.** Hasta que carga el inventario, el script no sabe qué está reclamado ni qué está ganado, así que los filtros de estado dejan pasar todo en vez de vaciar el panel mientras arranca.
- **Si el inventario no llega, el panel lo dice.** Sin él, el script no puede saber qué tienes ni cuánto llevas visto, así que los ✓, los 🎁, el «te faltan» y los filtros de estado se apagan todos a la vez. Un aviso a los pocos segundos es la diferencia entre un día sin novedades y un panel que no sabe nada de ti.
- **Ordena los abiertos como quieras:** por lo que antes cierra (el de por defecto — una fecha es lo único que se pierde solo) o por lo que menos tiempo te pide. Las dos etiquetas van debajo de los filtros. Al ordenar por lo más barato, una recompensa que ya te ganaste sube del todo: ahí no queda nada que ver, solo un clic.

**En la propia página**
- **Cada campaña abierta enseña lo que todavía te cuesta**, en su propia tarjeta y sin abrir el panel: ⏱ y el tiempo que te falta para su recompensa más barata. Una campaña que cierra en menos de 72 h enseña el cierre y el tiempo que falta juntos — la fecha sola no te dice si merece la pena empezar.

**Inventario**
- **Ocultar cerrados/completados del inventario** — una sola casilla que además activa la **reclamación automática**, tanto de los drops terminados como del cofre diario de más abajo. Lee el aviso de arriba antes de marcarla.
- **Pasa el ratón por un drop en progreso y te dice el tiempo de visualización que falta exactamente.** Kick muestra el tramo en que se desbloquea una recompensa, no cuánto te queda para llegar; el script hace esa resta por ti.
- **Haz clic en ese mismo drop para el detalle completo:** progreso en minutos y porcentaje, tiempo restante y las recompensas que otorga. Si el progreso no se puede calcular, el clic se deja pasar a Kick tal cual en vez de tragárselo.
- **Descarta cualquier entrada con la ✕** para quitarte de encima lo que no te interesa; *Recargar drops* las trae todas de vuelta.

**Cofre de recompensa diaria — esto no es un drop**
- Kick reparte además una **recompensa diaria** solo por ver streams, desde el cofre de la barra superior. No tiene nada que ver con las campañas de drops, y el script también la reclama por ti.
- **Solo abre el cofre cuando la recompensa está disponible de verdad.** Kick cambia el icono estático del cofre por uno animado cuando hay algo que recoger, y el script espera esa señal en vez de abrir y cerrar el diálogo mientras navegas.
- Lee los tres estados que puede tener el botón de reclamar —listo, aún contando ("mira X minutos más") o ya reclamado hoy— y solo pulsa cuando hay algo que reclamar. También cierra el aviso que Kick saca en la esquina.
- **La detección es independiente del idioma**: reconoce formas de icono y maquetación, no el texto del botón, que es lo que le permite funcionar en los 16 idiomas sin un caso traducido por idioma.
- **El cofre se revisa siempre después de la revisión de drops, nunca en medio.** En el inventario eso significa que primero se escanean las campañas, luego se auto-reclaman los drops, y solo cuando eso termina se abre el cofre — si no, su diálogo robaría el foco a mitad de navegación.
- **Lo gobierna la misma casilla de reclamación automática** que los drops. Un solo interruptor, dos cosas reclamadas.

**Drops reclamados**
- Construye su propia sección de **reclamados** a partir de la API de Kick, reutilizando los datos que ya interceptó de la página cuando están ahí y pidiéndolos explícitamente solo cuando no.
- Las campañas totalmente reclamadas y los ítems reclamados sueltos se pueden ocultar con la misma casilla del inventario.

**Avisos de cambios**
- Vigila la lista de campañas y marca lo que cambió desde la última vez que mirastes. La pestaña 🔔 lleva una **cuenta de pendientes** y lista las campañas afectadas por su nombre.
- **Además cae un 🔔 en la propia tarjeta de la campaña** en la página, así un cambio se ve donde ya estás mirando y no solo dentro del panel.
- **El botón 👁️ la marca como vista y te lleva hasta ella** — en la vista de campañas desplaza la campaña al centro de la pantalla, y desde el inventario cambia primero a campañas y luego va a ella, así nunca tienes que buscarla. **Marcar todas como vistas** limpia el lote de un clic.
- **Los avisos se limpian junto con tus palabras clave.** Borra una palabra y sus avisos pendientes se van con ella; reescribe la lista y lo que ya no coincide se descarta, así la cuenta del 🔔 nunca cuenta cosas que dejaron de interesarte.
- También levanta una **notificación de escritorio** con la cuenta de pendientes, pidiendo permiso la primera vez, y cae al sistema de avisos del propio gestor de userscripts si la API del navegador no está disponible.

**Idioma:** 16 idiomas —español, inglés, alemán, francés, portugués, ruso, turco, japonés, coreano, polaco, finés, vietnamita, chino, árabe, hindi e indonesio—, siguiendo el idioma con el que Kick sirve la página, con inglés como respaldo.

**Instalación:**
1. Instala [Tampermonkey](https://www.tampermonkey.net/).
2. Abre el instalador: [kick-drops-highlighter.user.js](https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js) (también en [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) y [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Sitio:** `kick.com/drops/*`

## Privacy / Privacidad

**EN:** your keywords and settings stay in your browser only, in the userscript manager's storage (keywords, drops dismissed from the inventory, notifications already shown and panel preferences). Drop and inventory queries go **exclusively to Kick's own API** (`web.kick.com`, the only host declared in `@connect`) and are **read-only** — a single `GET` to the drops-progress endpoint, never a write — reusing your existing session: the script takes the `Authorization` header from the requests the page itself makes to Kick, keeps it **in memory only** —never written to disk— and only captures it when the URL resolves to `kick.com`, never from third-party requests. Alerts are local browser notifications. No third parties are involved and nothing is sent to the script author.

**ES:** tus keywords y ajustes se guardan solo en tu navegador, en el almacenamiento del gestor de userscripts (keywords, drops descartados del inventario, notificaciones ya mostradas y preferencias del panel). Las consultas de drops e inventario van **únicamente a la API de Kick** (`web.kick.com`, el único host declarado en `@connect`) y son de **solo lectura** —un único `GET` al endpoint de progreso, nunca una escritura— reusando tu propia sesión: el script toma la cabecera `Authorization` de las peticiones que la propia página hace a Kick, la mantiene **solo en memoria** —nunca la escribe en disco— y solo la captura cuando la URL resuelve a `kick.com`, nunca de peticiones a terceros. Los avisos son notificaciones locales del navegador. No hay terceros involucrados y no se envía nada al autor del script.

## Support / Apoyar

This is part of something I'm building to grow. If it helps you and you'd like to support it, you can tip me on **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —only if you want—; and if a cause needs it more than I do, help that one instead.

Esto es parte de algo que estoy construyendo para crecer. Si te sirve y quieres apoyar, puedes invitarme un café en **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —solo si quieres—; y si hay una causa que lo necesite más que yo, ayúdala a ella.

---
Author / Autor: **g31w0fw0rld** · License / Licencia: **MIT**
