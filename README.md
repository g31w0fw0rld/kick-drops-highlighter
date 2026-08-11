# Kick Drops Highlighter + Keywords

Tampermonkey userscript that classifies and highlights drops/campaigns on Kick based on your keywords. / Userscript de Tampermonkey que clasifica y resalta drops/campañas en Kick según tus palabras clave.

> [!NOTE]
> **ONE CHECKBOX DOES TWO THINGS / UNA CASILLA HACE DOS COSAS:** ticking *hide expired/completed* also turns on automatic claiming — of your finished **drops** and of the **daily reward chest**, which the label does not say. It claims by clicking Kick's own buttons for rewards you already earned by watching: nothing is sent to Kick's API to claim, and it grants you nothing you could not click yourself. It is still automation, which Kick's terms may not permit, so decide with that in mind. / Marcar *ocultar cerrados/completados* activa además la reclamación automática —de tus **drops** terminados y del **cofre de recompensa diaria**—, algo que la etiqueta no dice. Reclama pulsando los propios botones de Kick, sobre recompensas que ya te ganaste viendo: no se envía nada a la API de Kick para reclamar, y no te da nada que no pudieras pulsar tú. Sigue siendo automatización, que las condiciones de Kick pueden no permitir, así que decide sabiéndolo.

![The campaigns list with the matching campaign outlined in green, showing the time left and the watch time still needed, next to the panel](docs/screenshot-campaigns.png)

*Campaigns: matching campaigns get outlined **green** on the page itself, and each one says what it still costs you right there — here *Counter-Strike 2* is about to close, so it shows **⏳ 24 h · you still need 16m** in red; a campaign with no hurry shows a plain grey **⏱** with the time instead. The panel lists the same campaigns with their rewards, the filter chips and the sort. / Campañas: las campañas que coinciden se enmarcan en **verde** en la propia página, y cada una dice ahí mismo lo que todavía te cuesta — aquí *Counter-Strike 2* está por cerrar, así que lleva **⏳ 24 h · te faltan 16m** en rojo; una campaña sin prisa lleva en su lugar un **⏱** gris con el tiempo. El panel lista esas mismas campañas con sus recompensas, las etiquetas de filtro y el orden.*

![The expired tab after the redesign, with the matching closed campaign outlined in red and the panel listing 13 of them](docs/screenshot-expired.png)

*Expired: same idea in **red**, so a campaign that closed is obvious rather than something you find out by clicking. The tab keeps its own count, and the filters never touch it — there is nothing left to decide there. Clicking a card takes you to its own title, whether it is the game or one of its sub-campaigns. This one is from the redesigned `/drops`; **Active** and **Upcoming** read 0 because right now Kick has none — that is the state, not a failure. / Cerrados: lo mismo en **rojo**, para que una campaña que ya cerró se vea, en vez de descubrirlo al hacer clic. La pestaña lleva su propia cuenta, y los filtros no la tocan: ahí ya no hay nada que decidir. Al pulsar una tarjeta te lleva a su propio título, sea el del juego o el de una de sus sub-campañas. Esta captura ya es del `/drops` rediseñado; **Abiertos** y **Próximos** salen a 0 porque ahora mismo Kick no tiene ninguna — eso es el estado, no un fallo.*

![The inventory tab, with the exact time remaining shown next to an in-progress drop](docs/screenshot-inventory.png)

*Inventory: hovering a drop in progress shows **exactly how much watch time is left** — Kick only tells you the tier it unlocks at (*35hr*), never how far you still are from it (*16m*). Each entry in the picture also carries an ✕ to take it out of the view — that button is gone since the redesign, because the tab it lived on is now a display case. In the panel beside it, **the rewards you already own are ticked and struck through** one by one, the last one left keeps its watch time, and above the tabs sit the four filter chips and the two sort chips. / Inventario: al pasar el ratón por un drop en progreso sale **cuánto tiempo de visualización falta exactamente** — Kick solo te dice el tramo en que se desbloquea (*35hr*), nunca cuánto te queda para llegar (*16m*). Cada entrada de la imagen lleva además una ✕ para sacarla de la vista — ese botón ya no existe desde el rediseño, porque la pestaña en la que vivía es ahora un escaparate. En el panel de al lado, **las recompensas que ya tienes van con ✓ y tachadas** una a una, la única que queda conserva su tiempo, y encima de las pestañas están las cuatro etiquetas de filtro y las dos de orden.*

<img src="docs/screenshot-drop-details.png" width="380" alt="The drop details popover showing progress, time remaining, rewards and the Accept button">

*Clicking that same drop opens the full detail: progress in minutes and percent, time remaining and what you get. / Al hacer clic en ese mismo drop se abre el detalle completo: progreso en minutos y porcentaje, tiempo restante y lo que te llevas.*

> [!NOTE]
> **Current state — August 2026.** Kick redesigned `/drops` and split it into tabs with their own URL (`/drops/campaigns`, `/drops/coming-soon`, `/drops/claimed`, and later `/drops/expired`). The script is adapted to those routes and to the new DOM, and the **Expired** shot above is from it. The other three predate the redesign and cannot be retaken yet: what they show needs a campaign open on the page and a drop of yours in progress, and Kick has neither right now. Three things are waiting on the same campaigns to be confirmed against the live site — whether the API ever returns **upcoming** campaigns (that tab reads 0 today, with none scheduled), the **automatic claiming** on the campaigns tab, which needs a campaign you are taking part in, and a possible mismatch between the watch time Kick writes on a tier and the one the badge shows. The empty tabs did surface one real bug, already fixed in 1.2.15: with no campaigns to read, the scan fell back to the whole page and took a recommended channel from the sidebar for an open campaign — «rage» matches inside «AverageAden». It now reads **only inside the drops area**, in the four tabs. Everything else is covered by the regression suite in `tests/`, which boots this same script against real DOM dumps of the four tabs. / **Estado actual — agosto de 2026.** Kick rediseñó `/drops` y partió la sección en pestañas con URL propia (`/drops/campaigns`, `/drops/coming-soon`, `/drops/claimed`, y más tarde `/drops/expired`). El script está adaptado a esas rutas y al DOM nuevo, y la captura de **Cerrados** de arriba ya es de él. Las otras tres son anteriores al rediseño y todavía no se pueden repetir: lo que enseñan necesita una campaña abierta en la página y un drop tuyo en progreso, y Kick no tiene ninguna de las dos ahora mismo. Tres cosas esperan a esas mismas campañas para poder confirmarse contra el sitio en vivo — si la API llega a devolver campañas **próximas** (esa pestaña sale a 0 hoy, sin ninguna programada), la **reclamación automática** en la pestaña de campañas, que necesita una campaña en la que estés participando, y un posible desfase entre el tiempo de visualización que Kick escribe en un tramo y el que muestra el badge. Las pestañas vacías sí sacaron un fallo de verdad, ya corregido en 1.2.15: sin campañas que leer, el escaneo se iba a la página entera y daba por campaña abierta un canal recomendado de la barra lateral —«rage» casa por dentro de «AverageAden»—. Ahora lee **solo dentro del área de drops**, en las cuatro pestañas. Todo lo demás lo cubre la batería de regresión de `tests/`, que arranca este mismo script contra volcados reales del DOM de las cuatro pestañas.

## English

### What it does

**Highlighting**
- Marks the campaigns on Kick's drops page that match your keywords, **on the page itself** — green on the campaigns tab, blue on coming soon, red on expired — so you spot them while scrolling instead of opening each one.
- Campaigns that match nothing are left exactly as they were.
- Closed campaigns get outlined **red** on `/drops/expired`. Kick's redesign left them with no page at all for a while — they only existed in the panel, read from the API — and the tab came back later, so the red outline is back with it.

**The panel**
- A floating panel, collapsible and remembered, listing what matched split into **Active**, **Upcoming** and **Expired**, each with a count so you know at a glance whether it is worth looking.
- **All three sections are filled without moving you anywhere.** Kick's tabs are not client-side navigation — clicking one reloads the whole page — so a panel built only from what is on screen could never show more than the tab you are standing on. The campaign list is read from Kick's own API in a single request, which returns the three sections at once, and the tab in front of you is what gets highlighted on the page. Nothing is clicked on your behalf and you are never taken somewhere you did not ask to go.
- A card for a campaign that is not on the current tab has no element to scroll to, so **clicking it takes you to the tab where it lives and leaves you in front of it**, scrolled into the middle of the screen — the same thing a click does when the campaign is already on the tab you are looking at. Each status goes to its own tab: open to campaigns, upcoming to coming soon, closed to expired. Kick's tabs reload the page, so where you were heading is written to storage and read back on the other side; it expires after 30 seconds, so a navigation that never happened cannot make a later visit jump on its own.
- Every entry shows the campaign, the studio, the exact window it runs, the keyword that matched it and **each reward with the hours needed to unlock it**.
- **Rewards you already own are marked** — ticked, struck through and dimmed, one by one, so what is left to earn is what stands out. Two rewards that ask for the same watch time are not the same drop, so each one is checked separately, and when every reward on a badge is already yours the badge drops the watch time it asked for and says **Claimed** on hover instead.
- **What you already earned but have not collected gets its own mark** — 🎁 and highlighted, never dimmed, because it is the one thing on the badge still waiting on you. It is not "almost there": the watch time is done, only the click is missing, and it expires with the campaign like everything else. The closing warning counts them, so a campaign about to end tells you how much you are about to throw away.
- **What is about to close rises to the top.** When a reward you do not own yet is running out of time, the card says how long is left and how much watch time you still need — red under 24 hours, amber under 72 — and the active list is ordered by whatever closes first. If the time no longer fits, it says so, instead of letting you start something you cannot finish. The same ⏳ lands on the campaign's own card on the page, so the hurry is visible while you scroll.
- **🔗 copies a campaign as text you can paste anywhere.** The title, the date window, one line per tier with the watch time it asks for, and a link. It is deliberately text and not a picture of the card: a screenshot cannot be searched, quoted or clicked, and the reward images come from another host, so drawing the card to a canvas is blocked by the browser anyway.
- **What it copies is the campaign, not you.** No ✓ and no 🎁: whether *you* already own a reward says nothing to the person you are sending it to — or worse, tells them they already have it.
- **The button confirms itself** — 🔗 turns into ✓ for a moment — because copying leaves no trace anywhere, so without that there is no way to know it worked.
- **Open and upcoming ones get it; closed ones do not.** An upcoming campaign is exactly what is worth passing on early — the text carries the day it opens and what it will hand out. Sending a closed one points someone at something they can no longer get, and the text would not even say so: it carries dates, not "this is over".
- **The link goes to the tab the campaign lives in** — campaigns or coming soon — **because in Kick a campaign has no address of its own.** Linking an upcoming one to the open list would land whoever reads it on a page where that campaign is not there. And there is nothing more precise to link: no campaign is a link, its detail opens in a dialog that never touches the URL, the page reads no parameter from the URL at all, and Kick's own developer docs list every place a viewer can see a drop without a per-campaign page among them. So there is no equivalent of Twitch's per-campaign link, and the title plus the dates are what identify it.
- **Reload drops** reloads the page from scratch — going to the campaigns tab first if you are elsewhere — and while it is at it clears the pending 🔔 alerts.

**Keywords**
- The list ships with about 30 popular franchises and it is yours to change.
- **Click a chip to delete it**, **+** to add, **Edit Keywords** to rewrite the whole list as one comma-separated line, and **Reset to Default** to start over. Each change reloads so the highlighting is rebuilt.
- **Every card says which keyword put it there**, as a chip. That matters more than it sounds: a keyword matches anywhere in the text, so `rage` finds a campaign called "ave**rage**aden $5 Bonus", and without the chip a card like that looks like the filter is broken rather than working exactly as told. The chip is read from the same text the filter used — the campaign name, the game and the studio — not just from the title on the card.
- **A keyword starting with `-` excludes instead of matching.** `rust` plus `-console` finds Rust and drops the console spin-off, even though `rust` is right there in its name. An exclusion beats every match, and it removes the campaign everywhere at once: no highlight on the page, no card in the panel, no 🔔. Existing alerts for what you just excluded are cleared as you add it.

**View filters**
- Four chips above the tabs — **☑ something left**, **⏳ closing soon**, **🎁 unclaimed**, **⚡ Tier ≤ 1 h** — narrow what the panel shows. They are a lens, not a second keyword list: the page highlighting, the card marks and the notifications are untouched, so switching one on costs nothing and needs no reload.
- They **add up**: turn on ⏳ and ⚡ together and you get what closes soon *and* can still be finished in an hour. They only trim the **active** tab — nothing is closing in upcoming and nothing is left to decide in expired.
- **⚡ measures what you have left**, not what the campaign advertises: a 30-minute tier you already claimed does not make it a quick one.
- Filters are **remembered between reloads**, so the tab counts what is showing out of what there is — `Active Drops (3/12)` — and an empty list says the filters hid it, with a link to clear them. A filter you forgot about never looks like an empty day.
- **Nothing is hidden on a guess.** Until your claimed-and-watched data has loaded, the script cannot tell what is claimed or earned, so the state filters let everything through rather than emptying the panel while it starts up.
- **When that data never arrives, the panel says so.** Without it the script cannot know what you own or how much you have watched, so the ✓, the 🎁, the "you still need" and the state filters all go quiet at once. A warning after a few seconds is the difference between a slow day and a panel that knows nothing about you.
- **Sort the open list your way:** by whatever closes first (the default — a deadline is the only thing that runs out on its own) or by whatever asks the least time. The two chips sit under the filters. Sorting by cheapest puts a reward you already earned at the very top: nothing is left to watch there, only a click.

**On the page itself**
- **Every open campaign shows what it still costs you**, on its own card, without opening the panel: ⏱ and the watch time you need to take **everything** that is left, which is its most expensive remaining reward — the watch time is per campaign, so one long session covers all its rewards at once and the total is not their sum. A campaign closing within 72 hours shows the deadline and the time needed together — the deadline alone does not tell you whether it is worth starting. If finishing no longer fits in the time left but the cheapest reward still does, hovering the mark says so in brackets, because there is still something to salvage.

**The claimed tab, and claiming**
- Kick's old inventory is now the **Claimed** tab, and after the redesign it is only a display case: what you already got, with no progress bars and no claim button. Those moved to the campaigns tab, which is where the script now looks for something to claim.
- **Hide expired/completed** — one checkbox that also turns on **automatic claiming**, both of finished drops and of the daily reward chest below. Read the warning above before ticking it.
- **The script's grid replaces Kick's list on the claimed tab, whether or not that checkbox is ticked.** It says the same things plus **when** you got each reward, so showing both was showing the same list twice. Not duplicating and hiding what is finished are two different wishes, and only the second one is what you tick. If the grid cannot be drawn — your claimed data never arrived, or there is nothing in it — Kick's own list is left exactly where it was rather than hiding it and leaving you with a blank tab.
- **Claiming does not depend on the language Kick is in.** The button is found by the drop's own progress bar and by attributes Kick does not translate, not by the word printed on it, so switching Kick's language does not switch the claiming off. When it cannot tell which button to press, it leaves it alone rather than guessing.
- **Hover a drop in progress and it tells you the exact watch time left**, wherever Kick puts one. Kick shows the tier a reward unlocks at, not how far you still are from it; the script does that subtraction for you.
- **Click the same drop for the full detail:** progress in minutes and percent, time remaining and the rewards it grants. If the progress cannot be worked out, the click is passed through to Kick untouched rather than swallowed.

**Daily reward chest — this is not a drop**
- Kick also hands out a **daily reward** just for watching streams, from the chest in the top bar. It has nothing to do with drop campaigns, and the script claims it for you too.
- **It only opens the chest when the reward is actually available.** Kick swaps the static chest icon for an animated one when there is something to collect, and the script waits for that instead of opening and closing the dialog while you browse.
- It reads the three states the claim button can be in — ready, still counting down ("watch X more minutes") or already claimed today — and only clicks when there is something to claim. It also dismisses the toast Kick pops in the corner.
- **The detection is language-independent**: it matches on icon shapes and layout, not on the button's text, which is what lets it work across all 16 languages without a translation per case.
- **The chest is always checked after the drops review, never during it**: the tab in front of you is scanned first, then anything finished is auto-claimed, and only when that ends does the chest get opened — otherwise its dialog would steal the focus in the middle of it.
- **It is governed by the same automatic-claiming checkbox** as the drops. One switch, two things claimed.

**The claimed grid**
- Builds its own **claimed** section from Kick's API, reusing the data already intercepted from the page when it is there and asking for it explicitly only when it is not.
- It gives you what Kick's own tab does not: **each reward with how long ago you got it**, newest first.
- Fully-claimed campaigns and individual claimed items can be hidden with the same checkbox.

**Change notifications**
- Watches the campaign list and flags what changed since you last looked. The 🔔 tab carries a **pending count** and lists the affected campaigns by name.
- **A 🔔 also lands on the campaign's own card** on the page, so a change is visible where you are already looking and not only inside the panel.
- **The 👁️ button marks one as seen and, on the campaigns tab, scrolls the campaign into the centre of the screen** so you do not have to hunt for it. From another tab it takes you to campaigns, where you can find it by its green outline. **Mark all as seen** clears the lot in one click.
- **Notifications are pruned with your keywords.** Delete a keyword and its pending alerts go with it; rewrite the list and anything that no longer matches is dropped, so the 🔔 count never counts things you stopped caring about.
- **Every alert stays inside the page**: the 🔔 tab, the count in the browser tab's title and a beep. There is deliberately no desktop notification and no permission prompt — the panel is already where you are looking, and a system notification outlives the tab, piles up in the notification centre and cannot be taken back once granted.

**Daily reward streak**
- Kick gives one chest a day for watching 60 minutes, and chaining days builds a streak. When the day is running and you have not watched enough yet, the panel says so: **how many minutes you have of the ones you need**, with the ✕ silencing it until tomorrow.
- It only warns about what nobody else warns you about: **the part before you can claim**. Once the chest is ready Kick raises its own toast, and this script claims it for you if automatic claiming is on.
- The state comes from Kick's own daily-challenge endpoint, not from the page: the chest icon looks identical whether you already claimed today or still owe minutes, so the DOM cannot tell those two apart. The "until tomorrow" of the ✕ follows **Kick's own day window**, not your clock.

**Language:** 16 languages — Spanish, English, German, French, Portuguese, Russian, Turkish, Japanese, Korean, Polish, Finnish, Vietnamese, Chinese, Arabic, Hindi and Indonesian — following the language Kick serves the page in, falling back to English.

**Install:**
1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the installer: [kick-drops-highlighter.user.js](https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js) (also on [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) and [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Site:** `kick.com/drops/*`

## Español

### Qué hace

**Resaltado**
- Marca las campañas de la página de drops de Kick que coinciden con tus palabras clave, **en la propia página** —verde en la pestaña de campañas, azul en próximas, rojo en cerradas—, así las ves mientras haces scroll en vez de abrir una por una.
- Las campañas que no coinciden con nada se quedan exactamente como estaban.
- Las campañas cerradas se enmarcan en **rojo** en `/drops/expired`. El rediseño de Kick las dejó una temporada sin página —solo existían en el panel, sacadas de la API— y la pestaña volvió después, así que el rojo vuelve con ella.

**El panel**
- Un panel flotante, plegable y recordado, que lista lo que coincidió separado en **Abiertos**, **Próximos** y **Cerrados**, cada uno con su cuenta para saber de un vistazo si vale la pena mirar.
- **Las tres secciones se llenan sin moverte de sitio.** Las pestañas de Kick no son navegación de SPA —pulsar una recarga la página entera—, así que un panel hecho solo con lo que hay en pantalla no podría enseñar nunca más que la pestaña en la que estás. La lista de campañas se lee de la propia API de Kick en una sola petición, que devuelve las tres secciones de golpe, y lo que se resalta en la página es la pestaña que tienes delante. No se pulsa nada por ti ni se te lleva a ningún sitio que no hayas pedido.
- La tarjeta de una campaña que no está en la pestaña actual no tiene elemento al que ir, así que **al pulsarla te lleva a la pestaña donde vive y te deja delante de ella**, centrada en la pantalla — lo mismo que hace el clic cuando la campaña ya está en la pestaña que miras. Cada estado va a la suya: abiertas a campañas, próximas a coming soon, cerradas a expired. Las pestañas de Kick recargan la página, así que el destino se escribe en el almacenamiento y se lee al otro lado; caduca a los 30 segundos, para que una navegación que no llegó a ocurrir no haga saltar sola una visita de mañana.
- Cada entrada muestra la campaña, el estudio, la ventana exacta en que corre, la palabra clave que la encontró y **cada recompensa con las horas que hacen falta para desbloquearla**.
- **Las recompensas que ya tienes vienen marcadas** —con ✓, tachadas y atenuadas, una por una—, así lo que resalta es lo que te falta por conseguir. Dos recompensas que piden el mismo tiempo no son el mismo drop, así que cada una se comprueba por separado, y cuando todas las de un badge ya son tuyas el badge deja de mostrar el tiempo que pedía y dice **Reclamados** al pasar el ratón.
- **Lo que ya te ganaste y no has recogido lleva su propia marca** —🎁 y resaltado, nunca atenuado—, porque es lo único del badge que sigue esperándote a ti. No es un "casi": el tiempo de visualización ya está hecho, lo que falta es el clic, y caduca con la campaña igual que todo lo demás. El aviso de cierre los cuenta, así que una campaña a punto de acabar te dice cuánto estás a punto de tirar.
- **Lo que está por cerrar sube arriba.** Cuando a una recompensa que aún no tienes se le acaba el tiempo, la tarjeta dice cuánto queda y cuánto tiempo de visualización te falta —rojo por debajo de 24 h, ámbar por debajo de 72— y la lista de abiertos se ordena por lo que antes cierra. Si ya no da tiempo, lo dice, en vez de dejarte empezar algo que no vas a terminar. El mismo ⏳ cae en la propia tarjeta de la campaña en la página, para que la prisa se vea haciendo scroll.
- **🔗 copia una campaña como texto para pegarlo donde quieras.** El título, la ventana de fechas, un renglón por tramo con el tiempo que pide, y un enlace. Es texto a propósito y no una foto de la tarjeta: una captura no se busca, no se cita y no se pulsa, y además las imágenes de las recompensas vienen de otro servidor, así que dibujar la tarjeta en un lienzo lo bloquea el navegador.
- **Copia la campaña, no a ti.** Sin ✓ y sin 🎁: que *tú* ya tengas una recompensa no le dice nada a quien se lo mandas —o peor, le dice que ya la tiene—.
- **El botón se confirma solo** —🔗 se vuelve ✓ un momento— porque copiar no deja rastro en ningún sitio, y sin eso no hay forma de saber si funcionó.
- **Lo llevan las abiertas y las próximas; las cerradas no.** Una próxima es justo lo que merece la pena pasar con tiempo —el texto lleva el día que abre y lo que va a repartir—. Mandar una cerrada apunta a alguien hacia algo que ya no puede conseguir, y el texto ni lo diría: lleva fechas, no un «esto ya acabó».
- **El enlace va a la pestaña donde vive la campaña** —abiertas o próximas— **porque en Kick una campaña no tiene dirección propia.** Enlazar una próxima a la lista de abiertas dejaría a quien lo recibe en una página donde esa campaña no está. Y no hay nada más preciso que enlazar: ninguna campaña es un enlace, su detalle se abre en un diálogo que no toca la URL, la página no lee ningún parámetro de la URL, y la propia documentación de Kick enumera todos los sitios donde un espectador ve un drop sin que una página por campaña esté entre ellos. Así que no hay equivalente al enlace por campaña de Twitch, y lo que la identifica es el título con sus fechas.
- **Recargar drops** recarga la página de cero —yendo primero a la pestaña de campañas si estás en otra— y, de paso, limpia los avisos 🔔 pendientes.

**Palabras clave**
- La lista viene con unas 30 franquicias populares y es tuya para cambiarla.
- **Haz clic en una etiqueta para borrarla**, **+** para añadir, **Editar Keywords** para reescribir la lista entera como una línea separada por comas, y **Restaurar Predeterminadas** para empezar de cero. Cada cambio recarga, así que el resaltado se rehace.
- **Cada tarjeta dice por qué palabra clave está ahí**, como etiqueta. Importa más de lo que parece: una palabra clave casa en cualquier parte del texto, así que `rage` encuentra una campaña llamada «ave**rage**aden $5 Bonus», y sin la etiqueta una tarjeta así parece un filtro roto en vez de un filtro haciendo exactamente lo que le pediste. La etiqueta se lee del mismo texto con el que se filtró —el nombre de la campaña, el juego y el estudio—, no solo del título de la tarjeta.
- **Una palabra clave que empieza por `-` descarta en vez de buscar.** `rust` más `-console` encuentra Rust y deja fuera el spin-off de consola, aunque lleve `rust` en el nombre. Un descarte gana a cualquier coincidencia, y quita la campaña de todos los sitios a la vez: ni resaltado en la página, ni tarjeta en el panel, ni 🔔. Los avisos que ya hubiera de lo que acabas de descartar se limpian al añadirla.

**Filtros de vista**
- Cuatro etiquetas encima de las pestañas —**☑ algo pendiente**, **⏳ cierra pronto**, **🎁 sin reclamar**, **⚡ tramo ≤ 1 h**— recortan lo que enseña el panel. Son una lente, no una segunda lista de keywords: el resaltado de la página, las marcas de la tarjeta y las notificaciones se quedan igual, así que encender una no cuesta nada y no recarga.
- **Se suman**: enciende ⏳ y ⚡ a la vez y te queda lo que cierra pronto *y* además se puede terminar en una hora. Solo recortan la pestaña de **abiertos** — en próximos no cierra nada y en cerrados ya no hay nada que decidir.
- **⚡ mide lo que te queda a ti**, no lo que anuncia la campaña: un tramo de 30 minutos que ya reclamaste no la convierte en un rato corto.
- Los filtros **se recuerdan entre recargas**, así que la pestaña cuenta lo que se ve de lo que hay —`Drops Abiertos (3/12)`— y una lista vacía dice que los escondieron los filtros, con un enlace para quitarlos. Un filtro que se te olvidó no parece nunca un día sin drops.
- **No se esconde nada a ciegas.** Hasta que cargan tus datos de lo reclamado y lo visto, el script no sabe qué está reclamado ni qué está ganado, así que los filtros de estado dejan pasar todo en vez de vaciar el panel mientras arranca.
- **Si esos datos no llegan, el panel lo dice.** Sin él, el script no puede saber qué tienes ni cuánto llevas visto, así que los ✓, los 🎁, el «te faltan» y los filtros de estado se apagan todos a la vez. Un aviso a los pocos segundos es la diferencia entre un día sin novedades y un panel que no sabe nada de ti.
- **Ordena los abiertos como quieras:** por lo que antes cierra (el de por defecto — una fecha es lo único que se pierde solo) o por lo que menos tiempo te pide. Las dos etiquetas van debajo de los filtros. Al ordenar por lo más barato, una recompensa que ya te ganaste sube del todo: ahí no queda nada que ver, solo un clic.

**En la propia página**
- **Cada campaña abierta enseña lo que todavía te cuesta**, en su propia tarjeta y sin abrir el panel: ⏱ y el tiempo que te falta para llevarte **todo** lo que queda, que es su recompensa más cara — el tiempo de visualización es por campaña, así que una misma sesión larga cuenta para todas sus recompensas a la vez y el total no es la suma. Una campaña que cierra en menos de 72 h enseña el cierre y el tiempo que falta juntos — la fecha sola no te dice si merece la pena empezar. Y si ya no da tiempo a terminarla pero sí a su recompensa más barata, lo dice al pasar el ratón por la marca, entre paréntesis, porque todavía hay algo que salvar.

**La pestaña de reclamados, y la reclamación**
- El viejo inventario de Kick es ahora la pestaña **Reclamados**, y tras el rediseño es solo un escaparate: lo que ya conseguiste, sin barras de progreso y sin botón de reclamar. Eso se fue a la pestaña de campañas, que es donde el script busca ahora algo que reclamar.
- **Ocultar cerrados/completados** — una sola casilla que además activa la **reclamación automática**, tanto de los drops terminados como del cofre diario de más abajo. Lee el aviso de arriba antes de marcarla.
- **La rejilla del script sustituye a la lista de Kick en la pestaña de reclamados, esté la casilla marcada o no.** Dice lo mismo y además **cuándo** conseguiste cada recompensa, así que tener las dos era enseñar la misma lista dos veces. No duplicar y ocultar lo que ya está terminado son dos deseos distintos, y solo el segundo es el que tú marcas. Si la rejilla no se puede pintar —no llegaron tus datos de reclamado, o no hay nada en ellos—, la lista de Kick se queda donde estaba en vez de esconderla y dejarte la pestaña en blanco.
- **Reclamar no depende del idioma en que esté Kick.** El botón se encuentra por la barra de progreso del propio drop y por atributos que Kick no traduce, no por la palabra impresa en él, así que cambiar el idioma de Kick no apaga la reclamación. Cuando no puede saber qué botón pulsar, lo deja en paz en vez de adivinar.
- **Pasa el ratón por un drop en progreso y te dice el tiempo de visualización que falta exactamente**, esté donde esté. Kick muestra el tramo en que se desbloquea una recompensa, no cuánto te queda para llegar; el script hace esa resta por ti.
- **Haz clic en ese mismo drop para el detalle completo:** progreso en minutos y porcentaje, tiempo restante y las recompensas que otorga. Si el progreso no se puede calcular, el clic se deja pasar a Kick tal cual en vez de tragárselo.

**Cofre de recompensa diaria — esto no es un drop**
- Kick reparte además una **recompensa diaria** solo por ver streams, desde el cofre de la barra superior. No tiene nada que ver con las campañas de drops, y el script también la reclama por ti.
- **Solo abre el cofre cuando la recompensa está disponible de verdad.** Kick cambia el icono estático del cofre por uno animado cuando hay algo que recoger, y el script espera esa señal en vez de abrir y cerrar el diálogo mientras navegas.
- Lee los tres estados que puede tener el botón de reclamar —listo, aún contando ("mira X minutos más") o ya reclamado hoy— y solo pulsa cuando hay algo que reclamar. También cierra el aviso que Kick saca en la esquina.
- **La detección es independiente del idioma**: reconoce formas de icono y maquetación, no el texto del botón, que es lo que le permite funcionar en los 16 idiomas sin un caso traducido por idioma.
- **El cofre se revisa siempre después de la revisión de drops, nunca en medio**: primero se escanea la pestaña que tienes delante, luego se auto-reclama lo que esté terminado, y solo cuando eso acaba se abre el cofre — si no, su diálogo robaría el foco en mitad.
- **Lo gobierna la misma casilla de reclamación automática** que los drops. Un solo interruptor, dos cosas reclamadas.

**La rejilla de reclamados**
- Construye su propia sección de **reclamados** a partir de la API de Kick, reutilizando los datos que ya interceptó de la página cuando están ahí y pidiéndolos explícitamente solo cuando no.
- Da lo que la pestaña de Kick no da: **cada recompensa con cuánto hace que la conseguiste**, de la más reciente a la más antigua.
- Las campañas totalmente reclamadas y los ítems reclamados sueltos se pueden ocultar con la misma casilla.

**Avisos de cambios**
- Vigila la lista de campañas y marca lo que cambió desde la última vez que mirastes. La pestaña 🔔 lleva una **cuenta de pendientes** y lista las campañas afectadas por su nombre.
- **Además cae un 🔔 en la propia tarjeta de la campaña** en la página, así un cambio se ve donde ya estás mirando y no solo dentro del panel.
- **El botón 👁️ la marca como vista y, en la pestaña de campañas, desplaza la campaña al centro de la pantalla** para que no tengas que buscarla. Desde otra pestaña te lleva a campañas, donde la reconoces por su marco verde. **Marcar todas como vistas** limpia el lote de un clic.
- **Los avisos se limpian junto con tus palabras clave.** Borra una palabra y sus avisos pendientes se van con ella; reescribe la lista y lo que ya no coincide se descarta, así la cuenta del 🔔 nunca cuenta cosas que dejaron de interesarte.
- **Todo el aviso se queda dentro de la página**: la pestaña 🔔, la cuenta en el título de la pestaña del navegador y un pitido. No hay notificación de escritorio ni petición de permiso, y es a propósito: el panel ya está donde estás mirando, y una notificación del sistema sobrevive a la pestaña, se acumula en el centro de notificaciones y una vez concedido el permiso no se puede retirar desde aquí.

**Racha de la recompensa diaria**
- Kick regala un cofre al día por ver 60 minutos, y encadenar días da racha. Cuando el día va corriendo y todavía no has visto lo suficiente, el panel lo dice: **cuántos minutos llevas de los que hacen falta**, con una ✕ que lo calla hasta mañana.
- Solo avisa de lo que no avisa nadie más: **lo de antes de poder reclamar**. En cuanto el cofre está listo, Kick saca su propio aviso, y este script lo reclama por ti si tienes la reclamación automática activada.
- El estado sale del endpoint de retos diarios de Kick y no de la página: el icono del cofre se ve igual si ya reclamaste hoy que si todavía te faltan minutos, así que desde el DOM esos dos casos no se distinguen. Y el «hasta mañana» de la ✕ sigue **el día tal como lo cuenta Kick**, no el de tu reloj.

**Idioma:** 16 idiomas —español, inglés, alemán, francés, portugués, ruso, turco, japonés, coreano, polaco, finés, vietnamita, chino, árabe, hindi e indonesio—, siguiendo el idioma con el que Kick sirve la página, con inglés como respaldo.

**Instalación:**
1. Instala [Tampermonkey](https://www.tampermonkey.net/).
2. Abre el instalador: [kick-drops-highlighter.user.js](https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js) (también en [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) y [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Sitio:** `kick.com/drops/*`

## Privacy / Privacidad

**EN:** your keywords and settings stay in your browser only, in the userscript manager's storage (keywords, notifications already shown and panel preferences). Drop and progress queries go **exclusively to Kick's own API** (`web.kick.com`, the only host declared in `@connect`) and are **read-only** — a `GET` to the drops-progress endpoint and another to the daily-challenge one, never a write — reusing your existing session: the script takes the `Authorization` header from the requests the page itself makes to Kick, keeps it **in memory only** —never written to disk— and only captures it when the URL resolves to `kick.com`, never from third-party requests. **Alerts never leave the page** — there are no desktop notifications, so no permission is ever requested. No third parties are involved and nothing is sent to the script author.

**ES:** tus keywords y ajustes se guardan solo en tu navegador, en el almacenamiento del gestor de userscripts (keywords, notificaciones ya mostradas y preferencias del panel). Las consultas de drops y de progreso van **únicamente a la API de Kick** (`web.kick.com`, el único host declarado en `@connect`) y son de **solo lectura** —un `GET` al endpoint de progreso y otro al de retos diarios, nunca una escritura— reusando tu propia sesión: el script toma la cabecera `Authorization` de las peticiones que la propia página hace a Kick, la mantiene **solo en memoria** —nunca la escribe en disco— y solo la captura cuando la URL resuelve a `kick.com`, nunca de peticiones a terceros. **Los avisos no salen de la página** —no hay notificaciones de escritorio, así que nunca se pide permiso—. No hay terceros involucrados y no se envía nada al autor del script.

## Support / Apoyar

This is part of something I'm building to grow. If it helps you and you'd like to support it, you can tip me on **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —only if you want—; and if a cause needs it more than I do, help that one instead.

Esto es parte de algo que estoy construyendo para crecer. Si te sirve y quieres apoyar, puedes invitarme un café en **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —solo si quieres—; y si hay una causa que lo necesite más que yo, ayúdala a ella.

---
Author / Autor: **g31w0fw0rld** · License / Licencia: **MIT**
