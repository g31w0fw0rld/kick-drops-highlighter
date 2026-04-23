// ==UserScript==
// @name         Kick Drops Highlighter + Keywords (Full + i18n)
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Clasifica y resalta drops/campanas en Kick segun keywords persistentes y editables. Interfaz multiidioma.
// @match        https://kick.com/drops/*
// @author       g31w0fw0rld
// @license      MIT
// @downloadURL  https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js
// @updateURL    https://github.com/g31w0fw0rld/kick-drops-highlighter/raw/main/kick-drops-highlighter.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      web.kick.com
// @run-at       document-start
// ==/UserScript==

(function () {
    "use strict";
    const SCRIPT_VERSION = "1.1.0";
    console.log("Kick Drops Highlighter cargado (document-start). Version:", SCRIPT_VERSION);

    // =============================================
    // CLAIMED DROPS DATA (shared between interceptor and explicit fetch)
    // =============================================
    let _interceptedClaimedCampaigns = [];
    let _claimedInventoryReady = false;
    let _kickAuthToken = null;
    let _onClaimedDataReady = null; // callback set from inside load listener
    const KICK_DROPS_PROGRESS_URL = 'https://web.kick.com/api/v1/drops/progress';

    // Intercept the PAGE's fetch (unsafeWindow) to capture Kick's own API calls
    // Running at document-start ensures we're in place before Kick's JS loads
    const _pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const _originalFetch = _pageWindow.fetch;
    _pageWindow.fetch = async function (...args) {
        const [input, init] = args;
        const url = typeof input === 'string' ? input : input?.url || '';

        // Capture Authorization token from any Kick API request
        if (init?.headers) {
            const headers = init.headers;
            const authValue = headers instanceof Headers
                ? headers.get('Authorization')
                : headers['Authorization'] || headers['authorization'];
            if (authValue && authValue.startsWith('Bearer ')) {
                _kickAuthToken = authValue;
            }
        }

        const response = await _originalFetch.apply(this, args);

        // Intercept drops progress response
        try {
            if (url.includes('/api/v1/drops/progress')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data?.data && Array.isArray(data.data)) {
                        _interceptedClaimedCampaigns = data.data.filter(c =>
                            c.rewards && c.rewards.some(r => r.claimed)
                        );
                        _claimedInventoryReady = true;
                        if (_onClaimedDataReady && location.pathname.includes('/inventory')) {
                            setTimeout(() => _onClaimedDataReady(), 500);
                        }
                    }
                }).catch(() => { });
            }
        } catch (e) { /* noop */ }
        return response;
    };

    window.addEventListener("load", () => {

        // =============================================
        // INTERNACIONALIZACION (i18n)
        // =============================================

        const userLang = document.documentElement.getAttribute("lang") || navigator.language || "en";
        const lang = userLang.split("-")[0];
        const i18n = {
            es: {
                collapse: "Colapsar",
                expand: "Expandir",
                addKeyword: "Añadir Keyword",
                deleteKeywordTooltip: "Haga click para eliminar keyword",
                deleteKeywordQuestion: "¿Eliminar la keyword ",
                editKeywords: "Editar Keywords",
                resetKeywords: "Restaurar Predeterminadas",
                confirmReset: "¿Restaurar las keywords por defecto?",
                keywordsRestored: "Keywords restauradas. Recargando...",
                keywordsUpdated: "Keywords actualizadas. Recargando...",
                keywordsModified: "Las keywords han sido modificadas, estas son las actuales: ",
                reloading: "Recargando...",
                currentKeywords: "Keywords actuales (haga clic en una para eliminar):",
                noResults: "No se encontraron campanas relacionadas con tus keywords.",
                dropsActive: "Drops Abiertos",
                dropsExpired: "Drops Cerrados",
                dropsNone: "0 Drops encontrados",
                editPrompt: "Palabras clave separadas por coma:",
                waitMessage: "Si no ves resultados, edita las keywords o espera a que cargue Twitch Drops. Si estas en el inventario, dirigete a campañas.",
                changeMessage: "Cambia a campañas para ver los drops abiertos.",
                searching: "Buscando",
                reload: "Recargar drops",
                hideExpired: "Ocultar cerrados/completados del inventario, reclamacion de drops automatica",
                hideActive: "Ocultar abiertos del inventario",
                removeInventory: "Haz clic para eliminar del inventario, para volver a mostrar pulsa el boton de recargar drops",
                changes_detected: "Cambios detectados",
                viewed: "Mostrar",
                markAllAsViewed: "Marcar todas como vistas",
                accept: "Aceptar",
                cancel: "Cancelar",
                yes: "Si",
                no: "No",
                addButton: "+",
                viewIcon: "👁️",
                changedIcon: "🔔",
                removeIcon: "❌",
                iconLink: "🔗",
                iconCross: "❌",
                scriptInfoTitle: "Informacion del script",
                scriptInfoName: "Nombre:",
                scriptInfoVersion: "Version:",
                scriptInfoDescription: "Descripcion:",
                scriptInfoDescriptionText: "Resalta automaticamente drops activos y expirados segun keywords personalizables. Notificaciones en tiempo real de cambios, gestion de inventario avanzada y soporte multiidioma.",
                scriptInfoAuthor: "Autor:",
                scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Leyendo drops desde campañas, por favor espere...",
                loadingDrops: "Buscando drops...",
                newCampaign: "Nueva campaña",
                removedCampaign: "Campaña eliminada",
                notifTitle: "Twitch Drops - Cambios",
                readingApiDrops: "Leyendo cambios en drops desde la API...",
                claimedInventoryTitle: "Reclamados",
                claimedStatus: "Reclamado",
                claimedOn: "Reclamado el",
                aboutDrop: "Sobre este Drop",
                connectAccount: "Conectar",
                endDate: "Fecha de finalización:",
                resumeProgress: "Para reanudar el progreso, visita",
                liveChannels: "cualquiera de los canales participantes en vivo",
                noClaimedDrops: "No hay drops reclamados aún.",
            },
            en: {
                collapse: "Collapse",
                expand: "Expand",
                addKeyword: "Add Keyword",
                deleteKeywordTooltip: "Click to delete keyword",
                deleteKeywordQuestion: "Delete keyword ",
                editKeywords: "Edit Keywords",
                resetKeywords: "Reset to Default",
                confirmReset: "Reset keywords to default?",
                keywordsRestored: "Keywords restored. Reloading...",
                keywordsUpdated: "Keywords updated. Reloading...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Reloading...",
                currentKeywords: "Current keywords (click on one to delete):",
                noResults: "No drops matched your keywords.",
                dropsActive: "Active Drops",
                dropsExpired: "Expired Drops",
                dropsNone: "0 Drops found",
                editPrompt: "Comma-separated keywords:",
                waitMessage: "If no results show up, edit the keywords or wait for Twitch Drops to load. If you are in the inventory, go to campaigns.",
                changeMessage: "Switch to campaigns to see active drops.",
                searching: "Searching",
                reload: "Reload drops",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected",
                viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Accept",
                cancel: "Cancel",
                yes: "Yes",
                no: "No",
                addButton: "+",
                viewIcon: "👁️",
                changedIcon: "🔔",
                removeIcon: "❌",
                iconLink: "🔗",
                iconCross: "❌",
                scriptInfoTitle: "Script Information",
                scriptInfoName: "Name:",
                scriptInfoVersion: "Version:",
                scriptInfoDescription: "Description:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Author:",
                scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign",
                removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Claimed",
                claimedStatus: "Claimed",
                claimedOn: "Claimed on",
                aboutDrop: "About this Drop",
                connectAccount: "Connect",
                endDate: "End date:",
                resumeProgress: "To resume progress, visit",
                liveChannels: "any of the participating live channels",
                noClaimedDrops: "No claimed drops yet.",
            },
            de: {
                collapse: "Einklappen", expand: "Ausklappen", addKeyword: "Keyword hinzufügen",
                deleteKeywordTooltip: "Klicken um Keyword zu löschen", deleteKeywordQuestion: "Keyword löschen ",
                editKeywords: "Keywords bearbeiten", resetKeywords: "Standard wiederherstellen",
                confirmReset: "Keywords auf Standard zurücksetzen?",
                keywordsRestored: "Keywords wiederhergestellt. Neu laden...",
                keywordsUpdated: "Keywords aktualisiert. Neu laden...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Neu laden...", currentKeywords: "Aktuelle Keywords (klicken zum Löschen):",
                noResults: "Keine Drops gefunden.", dropsActive: "Offene Drops",
                dropsExpired: "Geschlossene Drops", dropsNone: "0 Drops gefunden",
                editPrompt: "Kommagetrennte Keywords:",
                waitMessage: "Wenn keine Ergebnisse angezeigt werden, bearbeite die Keywords oder warte auf das Laden der Seite.",
                changeMessage: "Wechsle zu Kampagnen, um aktive Drops zu sehen.",
                searching: "Suche", reload: "Drops neu laden",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Akzeptieren", cancel: "Abbrechen", yes: "Ja", no: "Nein",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Skript-Informationen", scriptInfoName: "Name:",
                scriptInfoVersion: "Version:", scriptInfoDescription: "Beschreibung:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Autor:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Beansprucht", claimedStatus: "Beansprucht",
                claimedOn: "Beansprucht am", aboutDrop: "Über diesen Drop", connectAccount: "Verbinden",
                endDate: "Enddatum:", resumeProgress: "Um fortzufahren, besuche",
                liveChannels: "einen der teilnehmenden Live-Kanäle", noClaimedDrops: "Noch keine beanspruchten Drops.",
            },
            fr: {
                collapse: "Réduire", expand: "Développer", addKeyword: "Ajouter un mot-clé",
                deleteKeywordTooltip: "Cliquez pour supprimer le mot-clé", deleteKeywordQuestion: "Supprimer le mot-clé ",
                editKeywords: "Modifier les mots-clés", resetKeywords: "Réinitialiser par défaut",
                confirmReset: "Réinitialiser les mots-clés par défaut ?",
                keywordsRestored: "Mots-clés restaurés. Rechargement...",
                keywordsUpdated: "Mots-clés mis à jour. Rechargement...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Rechargement...", currentKeywords: "Mots-clés actuels (cliquez pour supprimer) :",
                noResults: "Aucun drop ne correspond à vos mots-clés.",
                dropsActive: "Drops ouverts", dropsExpired: "Drops fermés",
                dropsNone: "0 drops trouvés", editPrompt: "Mots-clés séparés par des virgules :",
                waitMessage: "Si aucun résultat n'apparaît, modifiez les mots-clés ou attendez le chargement.",
                changeMessage: "Passez aux campagnes pour voir les drops actifs.",
                searching: "Recherche", reload: "Recharger les drops",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Accepter", cancel: "Annuler", yes: "Oui", no: "Non",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Informations du script", scriptInfoName: "Nom :",
                scriptInfoVersion: "Version :", scriptInfoDescription: "Description :",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Auteur :", scriptInfoGitHub: "GitHub :",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Réclamés", claimedStatus: "Réclamé",
                claimedOn: "Réclamé le", aboutDrop: "À propos de ce Drop", connectAccount: "Connecter",
                endDate: "Date de fin :", resumeProgress: "Pour reprendre la progression, visitez",
                liveChannels: "l'un des canaux participants en direct", noClaimedDrops: "Aucun drop réclamé pour le moment.",
            },
            pt: {
                collapse: "Recolher", expand: "Expandir", addKeyword: "Adicionar Keyword",
                deleteKeywordTooltip: "Clique para deletar keyword", deleteKeywordQuestion: "Deletar keyword ",
                editKeywords: "Editar Keywords", resetKeywords: "Restaurar Padrão",
                confirmReset: "Restaurar keywords padrão?",
                keywordsRestored: "Keywords restauradas. Recarregando...",
                keywordsUpdated: "Keywords atualizadas. Recarregando...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Recarregando...", currentKeywords: "Keywords atuais (clique para deletar):",
                noResults: "Nenhum drop encontrado com suas keywords.",
                dropsActive: "Drops Abertos", dropsExpired: "Drops Fechados",
                dropsNone: "0 drops encontrados", editPrompt: "Keywords separadas por vírgula:",
                waitMessage: "Se não aparecerem resultados, edite as keywords ou aguarde o carregamento.",
                changeMessage: "Mude para campanhas para ver drops ativos.",
                searching: "Buscando", reload: "Recarregar drops",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Aceitar", cancel: "Cancelar", yes: "Sim", no: "Não",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Informações do script", scriptInfoName: "Nome:",
                scriptInfoVersion: "Versão:", scriptInfoDescription: "Descrição:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Autor:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Resgatados", claimedStatus: "Resgatado",
                claimedOn: "Resgatado em", aboutDrop: "Sobre este Drop", connectAccount: "Conectar",
                endDate: "Data de término:", resumeProgress: "Para retomar o progresso, visite",
                liveChannels: "qualquer um dos canais participantes ao vivo", noClaimedDrops: "Nenhum drop resgatado ainda.",
            },
            ru: {
                collapse: "Свернуть", expand: "Развернуть", addKeyword: "Добавить ключевое слово",
                deleteKeywordTooltip: "Нажмите для удаления", deleteKeywordQuestion: "Удалить ключевое слово ",
                editKeywords: "Редактировать ключевые слова", resetKeywords: "Сбросить по умолчанию",
                confirmReset: "Сбросить ключевые слова по умолчанию?",
                keywordsRestored: "Ключевые слова восстановлены. Перезагрузка...",
                keywordsUpdated: "Ключевые слова обновлены. Перезагрузка...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Перезагрузка...", currentKeywords: "Текущие ключевые слова (нажмите для удаления):",
                noResults: "Дропы не найдены.", dropsActive: "Открытые дропы",
                dropsExpired: "Закрытые дропы", dropsNone: "0 дропов найдено",
                editPrompt: "Ключевые слова через запятую:",
                waitMessage: "Если результатов нет, измените ключевые слова или дождитесь загрузки.",
                changeMessage: "Перейдите к кампаниям для просмотра активных дропов.",
                searching: "Поиск", reload: "Перезагрузить дропы",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Принять", cancel: "Отмена", yes: "Да", no: "Нет",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Информация о скрипте", scriptInfoName: "Имя:",
                scriptInfoVersion: "Версия:", scriptInfoDescription: "Описание:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Автор:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Востребованные", claimedStatus: "Востребовано",
                claimedOn: "Востребовано", aboutDrop: "Об этом дропе", connectAccount: "Подключить",
                endDate: "Дата окончания:", resumeProgress: "Чтобы возобновить прогресс, посетите",
                liveChannels: "любой из участвующих каналов в прямом эфире", noClaimedDrops: "Востребованных дропов пока нет.",
            },
            tr: {
                collapse: "Daralt", expand: "Genişlet", addKeyword: "Anahtar Kelime Ekle",
                deleteKeywordTooltip: "Silmek için tıklayın", deleteKeywordQuestion: "Anahtar kelimeyi sil ",
                editKeywords: "Anahtar Kelimeleri Düzenle", resetKeywords: "Varsayılana Sıfırla",
                confirmReset: "Anahtar kelimeleri varsayılana sıfırla?",
                keywordsRestored: "Anahtar kelimeler geri yüklendi. Yeniden yükleniyor...",
                keywordsUpdated: "Anahtar kelimeler güncellendi. Yeniden yükleniyor...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Yeniden yükleniyor...", currentKeywords: "Mevcut anahtar kelimeler (silmek için tıklayın):",
                noResults: "Anahtar kelimelerinize uygun drop bulunamadı.",
                dropsActive: "Açık Drops", dropsExpired: "Kapalı Drops",
                dropsNone: "0 drop bulundu", editPrompt: "Virgülle ayrılmış anahtar kelimeler:",
                waitMessage: "Sonuç görünmüyorsa anahtar kelimeleri düzenleyin veya sayfanın yüklenmesini bekleyin.",
                changeMessage: "Aktif dropları görmek için kampanyalara geçin.",
                searching: "Aranıyor", reload: "Dropları yeniden yükle",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Kabul et", cancel: "İptal", yes: "Evet", no: "Hayır",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Script Bilgisi", scriptInfoName: "Ad:",
                scriptInfoVersion: "Sürüm:", scriptInfoDescription: "Açıklama:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Yazar:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Talep Edilenler", claimedStatus: "Talep Edildi",
                claimedOn: "Talep edildi", aboutDrop: "Bu Drop hakkında", connectAccount: "Bağlan",
                endDate: "Bitiş tarihi:", resumeProgress: "İlerlemeye devam etmek için ziyaret edin",
                liveChannels: "katılımcı canlı kanallardan herhangi biri", noClaimedDrops: "Henüz talep edilen drop yok.",
            },
            ja: {
                collapse: "折りたたむ", expand: "展開", addKeyword: "キーワード追加",
                deleteKeywordTooltip: "クリックで削除", deleteKeywordQuestion: "キーワードを削除 ",
                editKeywords: "キーワード編集", resetKeywords: "デフォルトに戻す",
                confirmReset: "キーワードをデフォルトに戻しますか？",
                keywordsRestored: "キーワード復元。再読み込み中...",
                keywordsUpdated: "キーワード更新。再読み込み中...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "再読み込み中...", currentKeywords: "現在のキーワード（クリックで削除）:",
                noResults: "キーワードに一致するドロップはありません。",
                dropsActive: "アクティブなドロップ", dropsExpired: "終了したドロップ",
                dropsNone: "0ドロップ", editPrompt: "カンマ区切りのキーワード:",
                waitMessage: "結果が表示されない場合は、キーワードを編集するか、ページの読み込みを待ってください。",
                changeMessage: "アクティブなドロップを見るにはキャンペーンに切り替えてください。",
                searching: "検索中", reload: "ドロップを再読み込み",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "承認", cancel: "キャンセル", yes: "はい", no: "いいえ",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "スクリプト情報", scriptInfoName: "名前:",
                scriptInfoVersion: "バージョン:", scriptInfoDescription: "説明:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "作者:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "受け取り済み", claimedStatus: "受け取り済み",
                claimedOn: "受け取り日", aboutDrop: "このドロップについて", connectAccount: "接続",
                endDate: "終了日:", resumeProgress: "進行を再開するには、",
                liveChannels: "参加中のライブチャンネルのいずれか", noClaimedDrops: "受け取ったドロップはまだありません。",
            },
            ko: {
                collapse: "접기", expand: "펼치기", addKeyword: "키워드 추가",
                deleteKeywordTooltip: "클릭하여 삭제", deleteKeywordQuestion: "키워드 삭제 ",
                editKeywords: "키워드 편집", resetKeywords: "기본값 복원",
                confirmReset: "키워드를 기본값으로 복원하시겠습니까?",
                keywordsRestored: "키워드 복원됨. 새로고침 중...",
                keywordsUpdated: "키워드 업데이트됨. 새로고침 중...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "새로고침 중...", currentKeywords: "현재 키워드 (클릭하여 삭제):",
                noResults: "키워드와 일치하는 드롭이 없습니다.",
                dropsActive: "활성 드롭", dropsExpired: "종료된 드롭",
                dropsNone: "0개의 드롭", editPrompt: "쉼표로 구분된 키워드:",
                waitMessage: "결과가 표시되지 않으면 키워드를 편집하거나 페이지 로딩을 기다려주세요.",
                changeMessage: "활성 드롭을 보려면 캠페인으로 전환하세요.",
                searching: "검색 중", reload: "드롭 새로고침",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "수락", cancel: "취소", yes: "예", no: "아니오",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "스크립트 정보", scriptInfoName: "이름:",
                scriptInfoVersion: "버전:", scriptInfoDescription: "설명:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "작성자:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "수령 완료", claimedStatus: "수령 완료",
                claimedOn: "수령일", aboutDrop: "이 드롭 정보", connectAccount: "연결",
                endDate: "종료일:", resumeProgress: "진행을 재개하려면 방문하세요",
                liveChannels: "참여 중인 라이브 채널 중 하나", noClaimedDrops: "아직 수령한 드롭이 없습니다.",
            },
            pl: {
                collapse: "Zwiń", expand: "Rozwiń", addKeyword: "Dodaj słowo kluczowe",
                deleteKeywordTooltip: "Kliknij aby usunąć", deleteKeywordQuestion: "Usunąć słowo kluczowe ",
                editKeywords: "Edytuj słowa kluczowe", resetKeywords: "Przywróć domyślne",
                confirmReset: "Przywrócić domyślne słowa kluczowe?",
                keywordsRestored: "Słowa kluczowe przywrócone. Przeładowywanie...",
                keywordsUpdated: "Słowa kluczowe zaktualizowane. Przeładowywanie...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Przeładowywanie...", currentKeywords: "Aktualne słowa kluczowe (kliknij aby usunąć):",
                noResults: "Nie znaleziono dropów pasujących do słów kluczowych.",
                dropsActive: "Otwarte dropy", dropsExpired: "Zamknięte dropy",
                dropsNone: "0 dropów", editPrompt: "Słowa kluczowe oddzielone przecinkami:",
                waitMessage: "Jeśli nie widzisz wyników, edytuj słowa kluczowe lub poczekaj na załadowanie strony.",
                changeMessage: "Przejdź do kampanii, aby zobaczyć aktywne dropy.",
                searching: "Szukanie", reload: "Przeładuj dropy",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Akceptuj", cancel: "Anuluj", yes: "Tak", no: "Nie",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Informacje o skrypcie", scriptInfoName: "Nazwa:",
                scriptInfoVersion: "Wersja:", scriptInfoDescription: "Opis:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Autor:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Odebrane", claimedStatus: "Odebrano",
                claimedOn: "Odebrano", aboutDrop: "O tym dropie", connectAccount: "Połącz",
                endDate: "Data zakończenia:", resumeProgress: "Aby wznowić postęp, odwiedź",
                liveChannels: "dowolny z uczestniczących kanałów na żywo", noClaimedDrops: "Brak odebranych dropów.",
            },
            fi: {
                collapse: "Pienennä", expand: "Laajenna", addKeyword: "Lisää avainsana",
                deleteKeywordTooltip: "Klikkaa poistaaksesi", deleteKeywordQuestion: "Poista avainsana ",
                editKeywords: "Muokkaa avainsanoja", resetKeywords: "Palauta oletukset",
                confirmReset: "Palauta avainsanat oletuksiin?",
                keywordsRestored: "Avainsanat palautettu. Ladataan uudelleen...",
                keywordsUpdated: "Avainsanat päivitetty. Ladataan uudelleen...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Ladataan uudelleen...", currentKeywords: "Nykyiset avainsanat (klikkaa poistaaksesi):",
                noResults: "Avainsanoihin sopivia droppeja ei löytynyt.",
                dropsActive: "Avoimet dropit", dropsExpired: "Suljetut dropit",
                dropsNone: "0 droppia", editPrompt: "Avainsanat pilkulla eroteltuina:",
                waitMessage: "Jos tuloksia ei näy, muokkaa avainsanoja tai odota sivun latautumista.",
                changeMessage: "Vaihda kampanjoihin nähdäksesi aktiiviset dropit.",
                searching: "Etsitään", reload: "Lataa dropit uudelleen",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Hyväksy", cancel: "Peruuta", yes: "Kyllä", no: "Ei",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Skriptin tiedot", scriptInfoName: "Nimi:",
                scriptInfoVersion: "Versio:", scriptInfoDescription: "Kuvaus:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Tekijä:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Lunastettu", claimedStatus: "Lunastettu",
                claimedOn: "Lunastettu", aboutDrop: "Tietoa tästä dropista", connectAccount: "Yhdistä",
                endDate: "Päättymispäivä:", resumeProgress: "Jatkaaksesi edistymistä, vieraile",
                liveChannels: "millä tahansa osallistuvalla live-kanavalla", noClaimedDrops: "Ei vielä lunastettuja droppeja.",
            },
            vi: {
                collapse: "Thu gọn", expand: "Mở rộng", addKeyword: "Thêm từ khóa",
                deleteKeywordTooltip: "Nhấp để xóa", deleteKeywordQuestion: "Xóa từ khóa ",
                editKeywords: "Sửa từ khóa", resetKeywords: "Khôi phục mặc định",
                confirmReset: "Khôi phục từ khóa mặc định?",
                keywordsRestored: "Từ khóa đã khôi phục. Đang tải lại...",
                keywordsUpdated: "Từ khóa đã cập nhật. Đang tải lại...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Đang tải lại...", currentKeywords: "Từ khóa hiện tại (nhấp để xóa):",
                noResults: "Không tìm thấy drop nào khớp.",
                dropsActive: "Drop đang mở", dropsExpired: "Drop đã đóng",
                dropsNone: "0 drop", editPrompt: "Từ khóa phân cách bằng dấu phẩy:",
                waitMessage: "Nếu không có kết quả, hãy sửa từ khóa hoặc đợi trang tải xong.",
                changeMessage: "Chuyển sang chiến dịch để xem drop đang hoạt động.",
                searching: "Đang tìm", reload: "Tải lại drop",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Chấp nhận", cancel: "Hủy", yes: "Có", no: "Không",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Thông tin script", scriptInfoName: "Tên:",
                scriptInfoVersion: "Phiên bản:", scriptInfoDescription: "Mô tả:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Tác giả:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Đã nhận", claimedStatus: "Đã nhận",
                claimedOn: "Đã nhận vào", aboutDrop: "Về Drop này", connectAccount: "Kết nối",
                endDate: "Ngày kết thúc:", resumeProgress: "Để tiếp tục tiến trình, hãy truy cập",
                liveChannels: "bất kỳ kênh tham gia đang phát trực tiếp nào", noClaimedDrops: "Chưa có drop nào được nhận.",
            },
            zh: {
                collapse: "折叠", expand: "展开", addKeyword: "添加关键词",
                deleteKeywordTooltip: "点击删除", deleteKeywordQuestion: "删除关键词 ",
                editKeywords: "编辑关键词", resetKeywords: "恢复默认",
                confirmReset: "恢复默认关键词？",
                keywordsRestored: "关键词已恢复。重新加载...",
                keywordsUpdated: "关键词已更新。重新加载...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "重新加载...", currentKeywords: "当前关键词（点击删除）：",
                noResults: "没有找到匹配的掉宝。",
                dropsActive: "活跃掉宝", dropsExpired: "已关闭掉宝",
                dropsNone: "0个掉宝", editPrompt: "逗号分隔的关键词：",
                waitMessage: "如果没有结果，请编辑关键词或等待页面加载。",
                changeMessage: "切换到活动查看活跃掉宝。",
                searching: "搜索中", reload: "重新加载掉宝",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "接受", cancel: "取消", yes: "是", no: "否",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "脚本信息", scriptInfoName: "名称：",
                scriptInfoVersion: "版本：", scriptInfoDescription: "描述：",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "作者：", scriptInfoGitHub: "GitHub：",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "已领取", claimedStatus: "已领取",
                claimedOn: "领取于", aboutDrop: "关于此掉宝", connectAccount: "连接",
                endDate: "结束日期:", resumeProgress: "要继续进度，请访问",
                liveChannels: "任何参与的直播频道", noClaimedDrops: "还没有已领取的掉宝。",
            },
            ar: {
                collapse: "طي", expand: "توسيع", addKeyword: "إضافة كلمة مفتاحية",
                deleteKeywordTooltip: "انقر للحذف", deleteKeywordQuestion: "حذف الكلمة المفتاحية ",
                editKeywords: "تعديل الكلمات المفتاحية", resetKeywords: "استعادة الافتراضية",
                confirmReset: "استعادة الكلمات المفتاحية الافتراضية؟",
                keywordsRestored: "تم استعادة الكلمات المفتاحية. إعادة التحميل...",
                keywordsUpdated: "تم تحديث الكلمات المفتاحية. إعادة التحميل...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "إعادة التحميل...", currentKeywords: "الكلمات المفتاحية الحالية (انقر للحذف):",
                noResults: "لم يتم العثور على نتائج.",
                dropsActive: "دروبات نشطة", dropsExpired: "دروبات مغلقة",
                dropsNone: "0 دروبات", editPrompt: "كلمات مفتاحية مفصولة بفواصل:",
                waitMessage: "إذا لم تظهر نتائج، عدّل الكلمات المفتاحية أو انتظر تحميل الصفحة.",
                changeMessage: "انتقل إلى الحملات لرؤية الدروبات النشطة.",
                searching: "جاري البحث", reload: "إعادة تحميل الدروبات",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "قبول", cancel: "إلغاء", yes: "نعم", no: "لا",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "معلومات السكربت", scriptInfoName: "الاسم:",
                scriptInfoVersion: "الإصدار:", scriptInfoDescription: "الوصف:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "المؤلف:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "تم المطالبة", claimedStatus: "تم المطالبة",
                claimedOn: "تم المطالبة في", aboutDrop: "حول هذا الدروب", connectAccount: "ربط",
                endDate: "تاريخ الانتهاء:", resumeProgress: "لاستئناف التقدم، قم بزيارة",
                liveChannels: "أي من القنوات المشاركة المباشرة", noClaimedDrops: "لا توجد دروبات مطالب بها بعد.",
            },
            hi: {
                collapse: "संक्षिप्त करें", expand: "विस्तार करें", addKeyword: "कीवर्ड जोड़ें",
                deleteKeywordTooltip: "हटाने के लिए क्लिक करें", deleteKeywordQuestion: "कीवर्ड हटाएं ",
                editKeywords: "कीवर्ड संपादित करें", resetKeywords: "डिफ़ॉल्ट पर रीसेट करें",
                confirmReset: "कीवर्ड को डिफ़ॉल्ट पर रीसेट करें?",
                keywordsRestored: "कीवर्ड बहाल। पुनः लोड हो रहा है...",
                keywordsUpdated: "कीवर्ड अपडेट। पुनः लोड हो रहा है...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "पुनः लोड हो रहा है...", currentKeywords: "वर्तमान कीवर्ड (हटाने के लिए क्लिक करें):",
                noResults: "कोई ड्रॉप नहीं मिला।",
                dropsActive: "सक्रिय ड्रॉप", dropsExpired: "बंद ड्रॉप",
                dropsNone: "0 ड्रॉप", editPrompt: "अल्पविराम से अलग कीवर्ड:",
                waitMessage: "यदि परिणाम नहीं दिखते, तो कीवर्ड संपादित करें या पेज लोड होने की प्रतीक्षा करें।",
                changeMessage: "सक्रिय ड्रॉप देखने के लिए अभियानों पर जाएं।",
                searching: "खोज रहे हैं", reload: "ड्रॉप पुनः लोड करें",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "स्वीकार करें", cancel: "रद्द करें", yes: "हां", no: "नहीं",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "स्क्रिप्ट जानकारी", scriptInfoName: "नाम:",
                scriptInfoVersion: "संस्करण:", scriptInfoDescription: "विवरण:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "लेखक:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "दावा किया गया", claimedStatus: "दावा किया गया",
                claimedOn: "दावा किया गया", aboutDrop: "इस ड्रॉप के बारे में", connectAccount: "कनेक्ट",
                endDate: "समाप्ति तिथि:", resumeProgress: "प्रगति जारी रखने के लिए, जाएँ",
                liveChannels: "किसी भी भाग लेने वाले लाइव चैनल पर", noClaimedDrops: "अभी तक कोई दावा किया गया ड्रॉप नहीं।",
            },
            id: {
                collapse: "Ciutkan", expand: "Perluas", addKeyword: "Tambah Kata Kunci",
                deleteKeywordTooltip: "Klik untuk menghapus", deleteKeywordQuestion: "Hapus kata kunci ",
                editKeywords: "Edit Kata Kunci", resetKeywords: "Kembalikan Default",
                confirmReset: "Kembalikan kata kunci default?",
                keywordsRestored: "Kata kunci dikembalikan. Memuat ulang...",
                keywordsUpdated: "Kata kunci diperbarui. Memuat ulang...",
                keywordsModified: "Keywords modified. These are the current keywords: ",
                reloading: "Memuat ulang...", currentKeywords: "Kata kunci saat ini (klik untuk menghapus):",
                noResults: "Tidak ada drop yang cocok.",
                dropsActive: "Drop Terbuka", dropsExpired: "Drop Tertutup",
                dropsNone: "0 drop", editPrompt: "Kata kunci dipisahkan koma:",
                waitMessage: "Jika tidak ada hasil, edit kata kunci atau tunggu halaman dimuat.",
                changeMessage: "Beralih ke kampanye untuk melihat drop aktif.",
                searching: "Mencari", reload: "Muat ulang drop",
                hideExpired: "Hide expired/completed from inventory, automatic drops claiming",
                hideActive: "Hide active from inventory",
                removeInventory: "Click to remove from inventory, to show again press the reload drops button",
                changes_detected: "Changes detected", viewed: "Shown",
                markAllAsViewed: "Mark all as viewed",
                accept: "Terima", cancel: "Batal", yes: "Ya", no: "Tidak",
                addButton: "+", viewIcon: "👁️", changedIcon: "🔔", removeIcon: "❌",
                iconLink: "🔗", iconCross: "❌",
                scriptInfoTitle: "Informasi Script", scriptInfoName: "Nama:",
                scriptInfoVersion: "Versi:", scriptInfoDescription: "Deskripsi:",
                scriptInfoDescriptionText: "Automatically highlights active and expired drops based on customizable keywords. Real-time change notifications, advanced inventory management, and multi-language support.",
                scriptInfoAuthor: "Penulis:", scriptInfoGitHub: "GitHub:",
                loadingDropsFromInventory: "Reading drops from campaigns, please wait...",
                loadingDrops: "Searching drops...",
                newCampaign: "New campaign", removedCampaign: "Removed campaign",
                notifTitle: "Twitch Drops - Changes",
                readingApiDrops: "Reading drop changes from API...",
                claimedInventoryTitle: "Diklaim", claimedStatus: "Diklaim",
                claimedOn: "Diklaim pada", aboutDrop: "Tentang Drop ini", connectAccount: "Hubungkan",
                endDate: "Tanggal berakhir:", resumeProgress: "Untuk melanjutkan progres, kunjungi",
                liveChannels: "salah satu kanal langsung yang berpartisipasi", noClaimedDrops: "Belum ada drop yang diklaim.",
            },
        };
        const t = { ...i18n["en"], ...(i18n[lang] || {}) };

        // =============================================
        // CONSTANTES Y CONFIGURACION
        // =============================================

        const DEFAULT_KEYWORDS = [
            "rust", "pubg", "fortnite", "minecraft", "roblox", "valorant",
            "apex", "call of duty", "gta", "dota",
        ];

        const STORAGE_KEY = "kick_drop_keywords";
        const SHOW_HIDE_INVENTORY_EXPIRED = "kick_show_hide_inventory_expired";
        const COLLAPSE_KEY = "kick_drops_collapse_preview";
        const INVENTORY_DELETED_KEYS = "kick_inventory_deleted_drops";
        const STORAGE_NOTIFS = "kick_drop_notifications";

        const ORIGINAL_TITLE = document.title || (document.querySelector('title') ? document.querySelector('title').textContent : '');

        const NOTIFICATION_BEEP_INTERVAL_MS = 5000;
        const NOTIFICATION_VOLUME = 0.75;

        // Kick section header texts for open/closed campaign detection (i18n)
        const OPEN_HEADER_TEXTS = [
            "Open campaigns",
            "الحملات المتاحة",
            "Offene Kampagnen",
            "Campañas abiertas",
            "Avaa kampanjat",
            "Campagnes aperte",
            "सक्रिय अभियान",
            "Buka kampanye",
            "進行中のキャンペーン",
            "진행 중인 캠페인",
            "Otwarte kampanie",
            "Campanhas abertas",
            "Открытые кампании",
            "Aktif kampanyalar",
            "Mở Chiến dịch",
            "开放活动"
        ];

        const CLOSED_HEADER_TEXTS = [
            "Closed campaigns",
            "الحملات المغلقة",
            "Geschlossene Kampagnen",
            "Campañas cerradas",
            "Suljetut kampanjat",
            "Campagnes chiuse",
            "समाप्त अभियान",
            "Kampanye Tertutup",
            "終了したキャンペーン",
            "종료된 캠페인",
            "Zakończone kampanie",
            "Campanhas encerradas",
            "Закрытые кампании",
            "Kapalı kampanyalar",
            "Các chiến dịch đã đóng",
            "已关闭的广告活动"
        ];

        const ACTIVE_STYLE = `border: 4px solid #3ad900 !important; box-shadow: 0 0 30px #53fc18 !important; border-radius: 16px !important; scroll-margin-top: 100px;`;
        const EXPIRED_STYLE = `border: 4px solid #971311 !important; box-shadow: 0 0 30px #ff8280 !important; border-radius: 16px !important; scroll-margin-top: 100px;`;

        const DEBUG_SNAPSHOTS = false;

        // Kick is always dark theme
        const colors = {
            primary: "#53fc18",
            primaryLight: "#7aff4d",
            primaryDark: "#3ad900",
            green: "#53fc18",
            red: "#ff4d4d",
            gray: "#adadb8",
            orange: "#ff9900",
            bg: "#0e0e10",
            text: "#efeff1",
            surface: "#1a1a1d",
            border: "#2a2a2d",
        };

        // =============================================
        // FUNCIONES DE ALMACENAMIENTO / PERSISTENCIA
        // =============================================

        function getStoredKeywords() {
            const stored = GM_getValue(STORAGE_KEY, null);
            if (stored) {
                try { return JSON.parse(stored); } catch (e) { return DEFAULT_KEYWORDS.slice(); }
            }
            return DEFAULT_KEYWORDS.slice();
        }

        function setStoredKeywords(keywords) {
            GM_setValue(STORAGE_KEY, JSON.stringify(keywords));
        }

        function resetKeywords() {
            GM_setValue(STORAGE_KEY, JSON.stringify(DEFAULT_KEYWORDS.slice()));
        }

        function getInventoryDeletedKeys() {
            const stored = GM_getValue(INVENTORY_DELETED_KEYS, null);
            if (stored) {
                try { return JSON.parse(stored); } catch (e) { return []; }
            }
            return [];
        }

        function setInventoryDeletedKeys(keys) {
            GM_setValue(INVENTORY_DELETED_KEYS, JSON.stringify(keys));
        }

        function resetInventoryDeletedKeys() {
            GM_setValue(INVENTORY_DELETED_KEYS, JSON.stringify([]));
        }

        function getNotifications() {
            const stored = GM_getValue(STORAGE_NOTIFS, null);
            if (stored) {
                try { return JSON.parse(stored); } catch (e) { return []; }
            }
            return [];
        }

        function saveNotifications(notifs) {
            GM_setValue(STORAGE_NOTIFS, JSON.stringify(notifs));
        }

        function resetNotifications() {
            GM_setValue(STORAGE_NOTIFS, JSON.stringify([]));
        }

        // =============================================
        // DROPS API (web.kick.com)
        // =============================================

        const KICK_DROPS_API_URL = 'https://web.kick.com/api/v1/drops/campaigns';

        // In-memory map: campaignName -> [{name, minutes}]
        const _apiDropNames = {};
        let _apiDataReady = false;

        async function fetchDropsFromAPI() {
            try {
                const resp = await fetch(KICK_DROPS_API_URL);
                if (!resp.ok) return;
                const json = await resp.json();
                const allCampaigns = json.data;
                if (!Array.isArray(allCampaigns)) return;

                const kws = getStoredKeywords();

                for (const campaign of allCampaigns) {
                    // Only active campaigns
                    if (campaign.status !== 'active') continue;

                    const campaignName = campaign.name || '';
                    const categoryName = campaign.category?.name || '';
                    const orgName = campaign.organization?.name || '';
                    const searchText = (campaignName + ' ' + categoryName + ' ' + orgName).toLowerCase();
                    if (!kws.some(k => searchText.includes(k))) continue;

                    const drops = [];
                    for (const reward of (campaign.rewards || [])) {
                        const minutes = reward.required_units || 0;
                        const hours = minutes / 60;
                        drops.push({
                            name: reward.name || '',
                            minutes: minutes,
                            label: (reward.name || '') + (hours >= 1 ? ` (${hours} h)` : minutes > 0 ? ` (${minutes} min)` : ''),
                            starts_at: reward.starts_at || '',
                            ends_at: reward.ends_at || '',
                        });
                    }
                    if (drops.length > 0) {
                        // Key by category name (game name) for matching
                        const key = categoryName || campaignName;
                        // Full display title matching DOM format: "Game - Studio"
                        const displayTitle = orgName ? `${categoryName || campaignName} - ${orgName}` : (categoryName || campaignName);
                        _apiDropNames[key] = { drops, displayTitle };
                    }
                }
            } catch (e) { console.warn('[Kick Drops API] Fetch error:', e); }
            _apiDataReady = true;
            const _apiLoadingEl = document.getElementById("kick-drops-api-loading");
            if (_apiLoadingEl) _apiLoadingEl.style.display = "none";
            // Process snapshots from API data regardless of current page
            _processSnapshotsFromAPI();
            _updateAllCardsWithDropNames();
            if (location.pathname.includes('/all-campaigns')) {
                highlightAndLinkDrops();
            }
        }

        // Find full API entry for a card title — returns {drops}
        function _findEntryForTitle(cardTitle) {
            if (!cardTitle) return null;
            const ct = cardTitle.toLowerCase();
            for (const [key, entry] of Object.entries(_apiDropNames)) {
                const k = key.toLowerCase();
                if (ct.includes(k) || k.includes(ct)) return entry;
                const cardGame = ct.split(' - ')[0].trim();
                const keyGame = k.split(' - ')[0].trim();
                if (cardGame && keyGame && (cardGame.includes(keyGame) || keyGame.includes(cardGame))) return entry;
            }
            return null;
        }

        // Find drop names array for a card title (convenience wrapper)
        function _findDropNamesForTitle(cardTitle) {
            const entry = _findEntryForTitle(cardTitle);
            return entry ? entry.drops : null;
        }

        // Process snapshots from API data regardless of current page (inventory or campaigns)
        function _processSnapshotsFromAPI() {
            if (!_apiDataReady) return;
            const notifs = getNotifications();
            let hasChanges = false;

            // 1. Update snapshots for existing notifications using fresh API data
            for (const notif of notifs) {
                if (!notif.title) continue;
                // Si la campaña/juego ya no tiene drops en la API (expiró), no notificar
                const entry = _findEntryForTitle(notif.title);
                if (!entry || !entry.drops || entry.drops.length === 0) continue;
                const dataSnapshot = buildDataSnapshot(notif.title);
                if (dataSnapshot && notif.dataSnapshot !== dataSnapshot) {
                    notif.changed = true;
                    notif.seen = false;
                    notif.dataSnapshot = dataSnapshot;
                    notif.updatedAt = Date.now();
                    hasChanges = true;
                }
            }

            // 2. Check for new campaigns using full display title (e.g. "PUBG: Battlegrounds - KRAFTON")
            const kws = getStoredKeywords().map(k => k.toLowerCase());
            for (const [key, entry] of Object.entries(_apiDropNames)) {
                if (!entry || !entry.drops || entry.drops.length === 0) continue;
                const title = entry.displayTitle || key;
                const titleLower = title.toLowerCase();
                if (!kws.some(k => titleLower.includes(k))) continue;
                const exists = notifs.find(n => n.title === title || (n.title && n.title.toLowerCase() === titleLower));
                if (!exists) {
                    const dataSnapshot = buildDataSnapshot(title);
                    notifs.push({
                        id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        title: title,
                        key: title + '|api',
                        dataSnapshot: dataSnapshot,
                        seen: false, changed: true,
                        createdAt: Date.now(), updatedAt: Date.now(),
                    });
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                saveNotifications(notifs);
                updateNotificationTitleAndSound();
                renderNotificationsTab();
            }
        }

        function _updateAllCardsWithDropNames() {
            const panes = ["kick-drops-active-pane"];
            for (const paneId of panes) {
                const pane = document.getElementById(paneId);
                if (!pane) continue;
                pane.querySelectorAll("[data-notif-title]").forEach(card => {
                    if (card.querySelector(".drop-api-names")) return;
                    const ct = card.getAttribute("data-notif-title");
                    const drops = _findDropNamesForTitle(ct);
                    if (drops && drops.length > 0) _appendDropNamesTo(card, drops);
                });
            }
        }

        function _appendDropNamesTo(card, drops) {
            const container = document.createElement("div");
            container.className = "drop-api-names";
            Object.assign(container.style, {
                display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px",
            });
            // Group by minutes
            const grouped = {};
            drops.forEach(d => {
                const key = d.minutes || 0;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(d.name);
            });
            Object.entries(grouped).forEach(([min, names]) => {
                const minutes = parseInt(min);
                const hours = minutes / 60;
                let label = names.join(", ");
                label += hours >= 1 ? ` (${hours} h)` : minutes > 0 ? ` (${minutes} min)` : '';
                const chip = document.createElement("span");
                chip.textContent = label;
                chip.title = minutes ? `${minutes} min` : '';
                Object.assign(chip.style, {
                    padding: "1px 6px",
                    backgroundColor: colors.text + "18",
                    color: colors.text,
                    border: `1px solid ${colors.text}40`,
                    borderRadius: "8px", fontSize: "10px",
                });
                container.appendChild(chip);
            });
            card.appendChild(container);
        }

        function checkAndHandleScriptVersion() {
            const storedVersion = GM_getValue('kick_drop_script_version', null);
            if (storedVersion !== SCRIPT_VERSION) {
                resetNotifications();
                GM_setValue('kick_drop_script_version', SCRIPT_VERSION);
            }
        }

        function setInventoryExpiredFlag(value) {
            GM_setValue(SHOW_HIDE_INVENTORY_EXPIRED, value);
        }


        function getCollapseFlag() {
            const stored = GM_getValue(COLLAPSE_KEY, false);
            if (stored === undefined) return false;
            return stored;
        }

        function setCollapseFlag(value) {
            GM_setValue(COLLAPSE_KEY, value);
        }

        // Initialize flags if not existing
        if (GM_getValue(SHOW_HIDE_INVENTORY_EXPIRED) === undefined) setInventoryExpiredFlag(false);
        if (GM_getValue(COLLAPSE_KEY) === undefined) setCollapseFlag(false);

        // =============================================
        // ESTADO LOCAL DE LA APLICACION
        // =============================================

        let keywords = getStoredKeywords();
        let deletedInventoryDrops = getInventoryDeletedKeys();
        let cleanExpiredInventoryFlag = GM_getValue(SHOW_HIDE_INVENTORY_EXPIRED, false);
        let _notificationSoundInterval = null;

        try {
            if (typeof checkAndHandleScriptVersion === 'function') checkAndHandleScriptVersion();
        } catch (e) {
            console.warn('Error ejecutando checkAndHandleScriptVersion:', e);
        }

        // Fetch drops from Kick API on load
        fetchDropsFromAPI();

        // Pedir permiso de notificaciones del navegador al inicio
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
        let _lastNotifiedPending = 0;

        function _sendBrowserNotification(pending) {
            // Notificacion nativa del navegador (solo una vez al detectar cambios nuevos)
            if ('Notification' in window && Notification.permission === 'granted') {
                const n = new Notification(t.notifTitle || 'Kick Drops Alert', {
                    body: '🔔 ' + (t.changes_detected || 'Changes detected') + ` (${pending})`,
                    icon: 'https://kick.com/favicon.ico',
                    tag: 'kick-drops-change',
                    renotify: true
                });
                n.onclick = () => { window.focus(); n.close(); };
                setTimeout(() => n.close(), 8000);
            }
            // Fallback: GM_notification para navegadores que no soporten Notification API
            try {
                GM_notification({
                    text: '🔔 ' + (t.notifTitle || 'Kick Drops') + ': ' + (t.changes_detected || 'Changes detected'),
                    title: t.notifTitle || 'Kick Drops Alert',
                    timeout: 4000,
                    onclick: () => { window.focus(); }
                });
            } catch (e) { /* noop */ }
        }

        // =============================================
        // FUNCIONES DE AUDIO / NOTIFICACION SONORA
        // =============================================

        function playBeep() {
            try {
                const audio = new Audio('data:audio/wav;base64,SUQzAwAAAAA0V1RZRVIAAAAGAAAAMjAyMwBUREFUAAAABgAAADAyMDYAVElNRQAAAAYAAAAxMjUwAFBSSVYAABIdAABYTVAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuYjBmOGJlOSwgMjAyMS8xMi8wOC0xOToxMToyMiAgICAgICAgIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgIHhtbG5zOmNyZWF0b3JBdG9tPSJodHRwOi8vbnMuYWRvYmUuY29tL2NyZWF0b3JBdG9tLzEuMC8iCiAgICB4bWxuczp4bXBETT0iaHR0cDovL25zLmFkb2JlLmNvbS94bXAvMS4wL0R5bmFtaWNNZWRpYS8iCiAgICB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iCiAgIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIzLjIgKDIwMjIwMTE4Lm9yaWcuNTIxIDkzMGFhNDgpICAoV2luZG93cykiCiAgIHhtcDpDcmVhdGVEYXRlPSIyMDIzLTA2LTAyVDEyOjUwOjMyLjk0NDk1NyIKICAgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMy0wNi0wMlQxNDo1MDozNCswMjowMCIKICAgeG1wOk1vZGlmeURhdGU9IjIwMjMtMDYtMDJUMTQ6NTA6MzQrMDI6MDAiCiAgIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NGM2MWNiOGQtMjY0MC0zMzRjLWE5Y2EtMDBmYWE1MzA1MzU0IgogICB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOmYyZWQ3MmYwLWIyMTMtYjY0YS1hY2I2LTQ0ZWE1NjBlMDI0ZiIKICAgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOmYyZWQ3MmYwLWIyMTMtYjY0YS1hY2I2LTQ0ZWE1NjBlMDI0ZiIKICAgeG1wRE06YXVkaW9TYW1wbGVSYXRlPSI0NDEwMCIKICAgeG1wRE06YXVkaW9TYW1wbGVUeXBlPSIxNkludCIKICAgeG1wRE06YXVkaW9DaGFubmVsVHlwZT0iU3RlcmVvIgogICB4bXBETTpzdGFydFRpbWVTY2FsZT0iMjQiCiAgIHhtcERNOnN0YXJ0VGltZVNhbXBsZVNpemU9IjEiCiAgIGRjOmZvcm1hdD0iTVAzIj4KICAgPHhtcE1NOkhpc3Rvcnk+CiAgICA8cmRmOlNlcT4KICAgICA8cmRmOmxpCiAgICAgIHN0RXZ0OmFjdGlvbj0iY3JlYXRlZCIKICAgICAgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpmMmVkNzJmMC1iMjEzLWI2NGEtYWNiNi00NGVhNTYwZTAyNGYiCiAgICAgIHN0RXZ0OndoZW49IjIwMjMtMDYtMDJUMTQ6NTA6MzIrMDI6MDAiCiAgICAgIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMy4yICgyMDIyMDExOC5vcmlnLjUyMSA5MzBhYTQ4KSAgKFdpbmRvd3MpIi8+CiAgICAgPHJkZjpsaQogICAgICBzdEV2dDphY3Rpb249InNhdmVkIgogICAgICBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjRjNjFjYjhkLTI2NDAtMzM0Yy1hOWNhLTAwZmFhNTMwNTM1NCIKICAgICAgc3RFdnQ6d2hlbj0iMjAyMy0wNi0wMlQxNDo1MDozNCswMjowMCIKICAgICAgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIzLjIgKDIwMjIwMTE4Lm9yaWcuNTIxIDkzMGFhNDgpICAoV2luZG93cykiCiAgICAgIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogICA8Y3JlYXRvckF0b206d2luZG93c0F0b20KICAgIGNyZWF0b3JBdG9tOmV4dGVuc2lvbj0iLmFlcCIKICAgIGNyZWF0b3JBdG9tOmludm9jYXRpb25GbGFncz0iLWVwIi8+CiAgIDxjcmVhdG9yQXRvbTptYWNBdG9tCiAgICBjcmVhdG9yQXRvbTphcHBsaWNhdGlvbkNvZGU9IjExODAxOTM4NTkiCiAgICBjcmVhdG9yQXRvbTppbnZvY2F0aW9uQXBwbGVFdmVudD0iMTEzMTU1OTAyNiIvPgogICA8Y3JlYXRvckF0b206YWVQcm9qZWN0TGluawogICAgY3JlYXRvckF0b206Y29tcG9zaXRpb25JRD0iMiIKICAgIGNyZWF0b3JBdG9tOnJlbmRlclF1ZXVlSXRlbUlEPSI3IgogICAgY3JlYXRvckF0b206cmVuZGVyT3V0cHV0TW9kdWxlSW5kZXg9IjAiCiAgICBjcmVhdG9yQXRvbTpmdWxsUGF0aD0iQzpcVXNlcnNcSnVsaWVuXERvY3VtZW50c1wuQVVUTy1FTlRSRVBSSVNFXENsaWVudHNcS0dcMDAwMDlfS0dfU3RyZWFtcGFja1wwMDAwOV9LR19BbGVydGVzXDAwMDA5X0FsZXJ0ZV9TdWJfS2ljay5hZXAiLz4KICAgPHhtcERNOnN0YXJ0VGltZWNvZGUKICAgIHhtcERNOnRpbWVGb3JtYXQ9IkF1ZGlvU2FtcGxlc1RpbWVjb2RlIgogICAgeG1wRE06dGltZVZhbHVlPSIwMDowMDowMDowMDAwMCIvPgogICA8eG1wRE06YWx0VGltZWNvZGUKICAgIHhtcERNOnRpbWVWYWx1ZT0iMDA6MDA6MDA6MDAwMDAiCiAgICB4bXBETTp0aW1lRm9ybWF0PSJBdWRpb1NhbXBsZXNUaW1lY29kZSIvPgogIDwvcmRmOkRlc2NyaXB0aW9uPgogPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgIAo8P3hwYWNrZXQgZW5kPSJ3Ij8+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwEF0Drc1IaCgen+qy+A5zHFcAdA5ESDbAhhznA1krE3JexEEIQuRNDgJ+JuP9iG4JoZEZ4nDkUEVPqs/CFpc3BbCWMJKx60fDf3vffyxoY4MaHnW+OQ6IqGODGh6rhJxDGSf0ePKZ2wIe5qQ5FBBT51o9TucBkiQ0+v/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABI2fX973vDT5cHTGh7PInFBBQxwU5pqNqOQ0FA54YEMZIKfVZuD1pcngmhLFyN8TchaEQS/j1mWxFsJYymgqFOaajhHIaCgj4YFYyVY2eAh7mpDQUEE5zrc4cfFNZvDfqyZjQ9nsrFZVWOENXs+GBWRAAFFqACDgYHAAAIAEOBvAgAABeggACJAYDC8uydsYhkY934jxlk7aCBAL0gAAiQcBrPto/e7jLJpsYhhCHPtoQje0R30wBrMAARIOAyePZNPmIOQQPAYXQIAEPDRH/gnphBCTyen7EQ55NOPZ97EOQUeTTYgQQ3xEe9YnphBBzybb/zDxAeeARGR+AhX8/j8fj8fj8fj8fj8fi3gPGCzWeuNsaAYDwn7clK86Kk/3jVCu93jpq/Cxcw4yxXl8GCMxoHTDYG//hzKzLwwYCw8MKgEwsFv//eecje7YiDgJIZj0CqdAIKf/P/CcypJzpZdN9MhI8IBqV3///9jWNuR4y9ZjOUxjCQGL5AwAGGD/+5Jk+4zAAABpAAAACAAADSAAAAEdUbDUVPeACisvF0qGYAEV//z/+3/e/3mVgySI0umCOM/MDr2MCAZmP/////85lLJyvmzd/M1+SNRVFxeJZEkGhlIXGekMYCP5p0mgUYkgg////1lP4e/DqdpL+NuR3pfb/O9kIgKYWBYKCwODgkDDAoBAACEYCHAKmcTBdSDTzC4LUcGFwuFwuGw2GwGFwGAowwuDfNkBeg3X1m4ADADkJnOFc0A95UVSTp3IcBu0YEQXQawXIDGAFQYBRPqayRiHtht4ncLgxG2+T5PoUFgY4UAVrAwgYQwDIkwRC/r/iUAAh4mZEAMGBBqGAzAb+fZPZsKBg1MVYesAEEF+Hwidg9T///FoDEAWwDlxxi5A+5UODFHB////kHJUnjw8EXMCgUSJmB43PlwlWUYgAAAAAIdTcRScJl0WUvh1/ZTFXRqQW01HUvIdEABUtoxsYqHuTLaS5Krk9Ajj0zsOw0iBblJftZcrTOc3G6fUxWXMAn52pKohSRuemkFsonKJmVUsueupXo4zKrcM0j/S//uSZP+AB6xe4O5rhISli9sdylCQm9mvVd28gAloGen7noAA+IxqXWrVA2JVlm1j/Oby/f44y2Wvq8sco5bGZPDlWNv/G5flP/zOP0XOf/87/O//47+tlll3uNLYjUfh1W1HkskAhkjzOLKogBBMIIAmohGaGteYg1E9Ot6nygeXyi7bw/ev/L+63vn8+k7n///8///u5Tbxyq5WMbZcjhmEgAAAABfunpCVUw30RryL+9vkiH0AcLTd3JL1HxJ/N8GuMEWKhWJGDTD5F3PFiRQ3f4Dyxcd/pMG/+e6u3MjZsYNv5GNB16jKHRdZoi5j3Wr3dtX/v/chV5dmQAADAQBDOG1yMsdVX6yF+Fuy8pkwJiGhlAQVLmlSt+7hwxawjfMGgK7J5RQ34bnqKnws59figlKe6NxkCgYIgF/3mpL0Py7VPKF3Q3FMWZLybOtKZgAiyCyD7HJ9BSLDG1TJg9QbYx193SkNiJwlFfLHgUzHp/jWbe9pN0nidveKx6zyz01f5tqmr71fdNe+6fdK3znxb6khoa2l9L6Qk4V4nRITMP/7kmRUgCX3W1lzRn6QTmWqvAWIIhZRd2dsvXjI8xGrrBWNgNhUkrQtXq9Xz6mjreXPijnoWt+XelIrmIAAAACZzvKik8n06IAKqFj25t/4/PqqRjHIh0obKUYKB/Mhw6FnHF8fDZFX1UFQN/+LkvcNSHHxZDLHh/oHCF4AQkaH2/93Fv+r+zqV2aAAEAN1fVmrqQqOU0I7DchvrKBuz8Q8IB1AEAMGODBETlErlEr7JpFJnuWqXKNowRhpGv1JZZMCxE9hfYrK7amUTOQmKumFdP3BmZVcwq1ycGPR9HXZkhPJm9+//gac/uZdPR7O6TajWkacXc0usA7IZZykQ3mPu6uWAlLRJ1JtoHEGN20xvTOf6SX7fpR3++f2tcokbj6HkEUmARC8UxEBwswdhweV0JwVRg8AjlaMISlkIAAbmSBqyF7Demoo7Jt88iJi/KMcjMbd10AUcToR/ARmFQKGXRcTlKyN9gQOfWbE7rGaKt+X7vRo+NWWp3MAAQAEAFqO+6kBJhLOe+Rvg99Z4JYimgZSvuzWchuNRi7T559t7z7/+5JkFQQEJF9bcylVsDbjaw4FhyQQRV9xzKx3QSATLfmWDPDhyYKtUFWNmXAYAJukDUGPNsbhAtDIrrisEyeH+2FoRrPKXuLKE4iOR3cDrUZHclp7gOf6fefRXVNdFOLKep55/6UVPV/+rqe5KzFD1mlBFBdC0FyIoWCd/p6SVbQwACAQBJA1ZLg861+rqAg6pOvbTQqP/fN1oyk7gD9Br9AfNfg+n9Gf+121RwaQNwYU/bPxi1sMRAqookEFhxaqhQMeu4CLXuzhg+DgRCQQJQUz1xyXAoaclVTl2VxiphjvOoIyESIYKkyW9I0IQ5VMh8nOE3uiGmoEEffMoRdMZ93sfNsZIvGmpiu6iuKas8CPfcve+/hlwW5smleI8LUdMUJsdWVlZWJZe84uaxlUMpMPp2BoRNGJ4xcwAADFvOnde6nOXLPV8oXp+aWgAB8SCAB287f2Dg8MBHjp1dzbQvRCqbv9d0rjxNz+IT3zQAEOhEH6PxA7/o/+7/913rVGettEBDGRRJbbh6iXHMTpCj3IKEhSYtKghEikfyojeyC7//uSZBEAA8FYX3nrFkhII5w/YehPzy0jc+yxVsEmmm588IsQziExMYqNWt/Uv5HQD2w2j3VrK+Q5uvb52qDtvf24B/ujujx+re1zXT2tMsqqFZyjzuqnh1T9BpLWxxPNfOswNjOaWkt9LdDbNZqMx0Iz7m9UzivnP/Qzs8wiIqOJIAAV25K+lUqhpdK1QhI1IhZzWCPj9ULaP6PiFdWrKkGEBNADyDXWNRHBnmeUhDQQqz6Nw17MoggGOubr/8KFRXaeeu4FgYAiSFIlG3jaI+rCkv0uYLAwIUvN0llFdu/IEkKe+WINAsQucmqR61j5by/VCKAslypFomt4452vwbbctX8+Z0WR31hYeGER20rURuvM81c447hiTtt/Q4qPhsd9ezPNZVZEtqa7mnd0oVfa8DB0FU0XiSJfUh/VoKgoOhAJwa18hgjcMVNHKiMWudM9U6C83j2jW3FhFhxb2hVAmymy4PYJUN7jrX8oa9Irf/9f/1/0DvFTHVh3ZldS7RM+InqVaImGRRYv0VtsLX2jxaBHygIuKxEEDC6NaU0o6f/7kmQOAAPAXeFzCxXcSiQ7rmJDeo5VdXvsmPZpJqvufPAfAGQsE/aqOb1PrSNLpVJd/7PbQ4dV8bbDh5MwFCWHknGz5i+4d/8C5p1K5bDrn///j3wCSlTK7r9mzTLiJT0HNnqaq5yXZTpbQje1/FvXz3RDnBMusmvU11/QOuvoRXlTEjILcj63hR5L9ZKbDJlX5Nn+mZfhgucnXWkzNlx+o6CDQc5Dy0ggNZNq+/0oJytsHEsG/ry4e2u1f8T6WTrn1vtG4HishTTPZtSyhSVsGOXV19CZIQlgsKgKYs5LMYS7VVOqkocnX/JNC1BtFLIm+EYnbmeECrqMoAmLg8JScw8FGrTZBs/is/Cwwjs7gsIEEJnp+hm5hdDDH9W6CscA/0W9X5lqLzpVf3ToQNr/oeo3Y50/0Utft5Vdr6rkDRSSCAgHspxuRidhcn8XoyU7Ic2Unq1S6ZpB39vW6xw53TwW5ABPQ3ts/7zj/RUc0bv//+///CPr//////////0Ug3iEUQp8y6xFBBEROu+O8UkhFy4IehJ5KE3VgneRPar/+5JkDYADmV3deehsYEfG+70sDcKPCLdpzCF2ySmb7bz0nsIqYoPKEWlAbo6FG7X8ODKhu1f2WaWaqH605hROCEQnQSmHNsy0yxJNJYjEmTmDuDeEpJc8XDJjRBV00x/Iw7HV//+jrSM2Ss1q/Ttdke7om6Zgt/+1X/zjqaXpyQUAqhvvcb1HBSGxGwRF7WAuI1D1JnbpIMej278HiHaDsgmPY17lmR7/911JlYuEra/nTZbIF8EcJdKZGDnX1f//7PxC0bluYgokCVbgvFJJ/Nk0hYhDq6GtxCkUOh6WwWy+w2E0PatEqKSUvG01N3/1NoAmPbFGyaOgtv5U9qqrdaEEBUPRa5phVUtUvWOY/trjganfH2tngqt2Pf//eT+eVpOYVpsPsknIo4E4AtHwRvHwI4+V+jOgBntrKcs6GJEQZAECD230S4MB5Q3CexpVwE0yZfFhMmP94z6NbRjy/1KJmoGlVN1qZI175rD//8db//40Aq3+77kRLQ+xpBVL///6nP6afMuFMFMgQ0Y2nobisJI12s+dZjMOtxh1uUHh//uSZA2AA5RB2vsDbiBMhaseLw1WDNVDY8w9rUFlm+y89bcQhHWq0q6KF2m2ZDIbWdWJs9zidvH6FPCR7q8lT437+ON4d0G6IJ7VV4bMGKU+fms118VCx6ntTZKp1zleaKdFlOtJPSY8bLdbJF9Kq3XJQp2DTwNnvyrpFI6pRAhQMYWOoRFAKzQN1BbVXVMZNqwkEEQRSbpWnr+FdAN9+yQkjOfNFqWcTR+6ZDc1Z1MtdFT8uGKLNde2v1goCg6vzlP7/3N/yBeLrqkQRgF0hlZnfbjL67d24sijLsPhKqQKkczK8H+XpbORmUirmUsUWLqWN6ooTo4os8epVqLdNMipHGoccxGybnlu7UVYzFn/7JLrCuFB1pe11en0Hb/9J9eh////Y5ON/i9Wn/isdv7YA9EM5EgB4hpl2obpOA8lghHeWLe99SA8R60PLnkvGUuvnoI5Xd/nlklNOp5YR0NerH6q7cqGFjcPhJUj6X50IsdD5b0/pkyttZgDEBOJpmCv/m/c9+l77LYACACBYBdjHgynsCpE+N0uijIUwq65yv/7kkQNAAL5UNn55W4gXAarrz0ltIsUtW2nrVURhCvufPafCqGExDq0nhcKtV01GsTXVY2PQSI1JNWhn6oYWa03U+HByo7DwAHKTOPAqFN/dTefBlTq//b2b//+pX///9aJm3xd/GsCNCvDuhCRAEmk05OhCMTLpDkmdBlhhPV1k3TphKWxJS/CwUgwoNvb5xekcfCMmPueFXf3Gp5KMhVOTtdJl4IM5DNUAgRtP/uVH/6lRTBYOKHyX1u//6DxN3xGafoKT/7JGkRpgps7zUWiWRjmRiukUprMNiymgQnCJcdcUyk7RTykn3T/mYQgQlVQ+iUpSdcy48nltjKbYy6Bd3dbRtBMuoh9xv7T4VwSq+7T+3nuz/FAcB3/761iqh0MVERONOMwysLsOAegtpnk7aDdSqVnGRaNHBUZuZcx/MrlnEX03/odxWQC7N82X6xLP6lrqN2UtVAKNN3QikCIDXrRHWhqdEKGNv/2gN6f/7/nP6LXzf82dn1N/15aiKmWVjdH7YLZSenSebPQt6fVylIKn0PlFfgqc3EBTBidieL/+5JEEYADIjfg+e0eNGSrCy8+R4wL/M9n7DzrgYGabn2XoXCZVsBAq2t/KZqBwjUbaYllo+nW9qBLpDhITvuFAjRU0rNbqr9X9Fv+GjjClCOUUMYLA6IwqAiQVAJET2zO3+c/+uZzadRBAFQiKeJChJe0/Kjx9mkkUyN8nbOIfLDjkLnoJTldrrVU9zwEXCqjoFCEVNh0ESN6NBqk2dIijfHxtqDAo+0GQZN0KZxkZ6RAIjP/94Cm1///1V/53/v7ct/+YUHZfhMbF3byZAoBlkNTRx/YIgaGo9BTkTCHU7SY1YpXdHIxr2HnqK8iMmxYaeSmJTDiv3949nk/xvx8kaUFx5d1MCcJEOdZV2VWpVh4Tm/KhGTMT/yojyX/Kv/05EHgc+AdFo2++/d6EFzHl1U7jkOwRFmtQ1EoYbAKPn1o1iEPF3AXy2fCX1BvTWc43j+UGW9oeDh0gt5jx4//qCVlvoPw8iF4GA2mbpLsmQ6A8VHO9sAwJQFw8FN3f/+cQf//u/vJhRn01ez8djAIASEkuYA2P4WpXj1mumBAqk9B//uSZAuAA3pd2XntFqBJJqufMW18jylBX+w0uMEummy89DcIsmpgJNFlgr8KODdaSCLZ4Ga2jWtrWZm0AtNdrJTFyityu3cCJJSlIrIys/usR5rbcvH3+/CpH20TE2ASJszpJJf1IO/P//9HZmL/9//NFjAS0/9SX+XC5aImHYhAiCcTQABmPA7LioJKQqsl1+spp3S18e7zETHmf49HsnXb6u7YxjGMacYPRkvvXlOtXdMUf/sbVJGQYQB6GUYmqO6n/JrR1VMCIKBzABUsRYfWUtdd32duG5b0PxDl1N/m6ZXGceGcUjD+x994g7GHZB+MeEREmomu9/pwZAuGMSegRZCaThdWdRU1liqbr3WZs9lWUggXASU0PIUCeMIBzSZN9f5BwCdT///rUOtt39t9/KUaNAQAoM+Gk8oPXNdk0JgxDqEJMXi3VyhMOrJO7Rqq03/mD9Zk2wQdZpJaM6+cEwTeRS2J83niik8ovr+agSgjUGrKjzmc67//+o4Hn//nJZ/+n/+LBZWu/LlGBxHtKsmSBmZNdxEeRx1J5lVqJ//7kkQLgAMCUFp57IOQXOoLTz1CxgwdQWnnjPhBdSftNPG3CmSRL6UgSXLAuirhjA47ctagaxcYd49mg/DQSK8zSUpOp1rRZa0XHCRdZ5N61f9STN1CKGy//3WQP3R//9aE6zf///TOzA7+/2Jr7zbUQhX1UHZ0QbydFKbEk/OItxOVONGg3I+MmvixM2hLQLtkcXGK25pTQ5mSOrZIqKaF3Lrfs8gVFY1waRFHmq8Y/+cPvwMBs1f/37m///mIb6K6//86sI//LOXW/lyhkZCyMaXwjfay/lzPxQIiOch4K1jDqfv1eeUFybFmZzm8p57ldfFRdiIgKrDxOMkLOzdk92ose0umo3EMT/5/4KCz/ntdyoFC6Z703/nn648r/T//zEIEnG/FQrRrv/+SKSaRBLkY30WW9jPgnAQhDwjAKQwVOU7XHcg6PZrVMVVxY1RLzzV3uAZidvh4wLhGQYd2Z4huEMUI7O7j8JSH3//BgNmr//b///+r+r71dHuuoyAofIfXZoeGVYzclmFCINEhKdIpVBRESXFWGkczxdK5zMj/+5JEDIAC6VDYeeJuIF/qCz8+AsYLrUNx561REYCoLTz0KxA1odRSF666NW6h34B0VX3H45BxWQEKmbi7KH4zeVkCnlHX6F6Wv/or4mweF1er+k///79qF//+9bXpOs2RNBB/EvWJT1f25TMiI45Q38voEuRdjdPVKmAfyhUQpTkBOHU+VJQqyIr4uDp9T0PbOreNDSblWmoR/JSmIrstl1l+ndbPnbZkRJRt9XWr4a4uL/V/+v/+/XL+n7UuqLU5HAgoldZ/6niXljJCERtpuU9YSSlQ0w288hOScPkXsqk5RgHrT5OzTRkG0Vzz/Y8rb1nC43K7iGVL3pU8qQxmYw138fklv7mo3Kj8IUnfof7IY1v+eq75me7///rayLL3mU/8vRu92WisgvyQJwNZ5qBFofOj2Zdub088ivHAnCeFxM8uZ75mV3xhK6x/mKEvU0qUexF4+ULZ7Vpu7gy6Y7REnpK6c31v+3d080DQ1q7/zz/qYYYYYYYYz3XvbT////qcQKWN2rcwAhFCBbliIeTFwHiX2IhrCXq7nQ0lT453//uQRA4AAthB2PnmLYBn6hs9POXQi9VHZeehsUF8KGt48x8BXykolK19afW/+Wc8cAwg4UUWC0jXuk7UPcOvOfGt/VxMXFCMUoiHQm7u/9DOYz0KUpSlKUqf/cTN//Czk//tn/1RTRiRBLkBRjdLa4HvMTNTrUp3Sk/cdww94gh/UmVssFdn/GfQvuEO13HOWZOm6lX+VjFrLmez8sFKqqG3CVHWqhH/7eoiODxl/mXo5jf/qUrVV3e6//q2Y3SPGEFwccdIFTFP3i9/+fREBgImkLuRgeoZ44xvuTxMnW2J1PVM2+206o2z51I5G7u/2Ewnurca5yMvd9bwno3gulI9jF7+9ZiEUTR1XFwlDjf/////rdykhv3+u6nrPIlZkSiJRPsfUn/SlruZYQAQMNCEkcSbc2RKNSnUSmUrdc6X7UdrIqXwkMZ7CrGio59Vueq5Ei5CGJIuKIU7Ddgn+VlPGgqoObwdNrcKht1kX1oe/qwUM//RRxn3///qVMb//9WYqPGHqRjFfNqDEAEASQA3oTOHOkkkrnR1qwCooIdi//uSRAwAAodQ1/noVEBXKfs/PQe2ClEJc+esrdGBqGu9hJ7I+T1fDhpDNiytvBUDqunATD61uhrkU8xT9Wlx3MUQOtK//APT8CiWv/////7TFIjPv//6mscaU//Xef7MiCoCFVyyJ4eZjyaLkTgveFIZDXCGU2TJ9frk9tQ42o/cPT/EEIWqaGSKBlxQvtJtJin7qWRw5/irGNpC3U/Pb0Ikf/3hX///rc8qift//qyFHN/pmJdVQhQ3JEHJkiSU01CXpYfk+spjNnmJc8zAbvIugdSUREuYOjREAlczmNPhV8w2KkQEM5hvA8EeZY2v/INCTfR//9v///zxr9H9IaABz7DHGIrM4yEwMA0mk3Y7A7WoVJIDoo52akv4tLvabiLGyur75f3a3QzeT1T2epsRZHhysSsPD5laaGs2MPmxtzX3CgvJ0xweNWy9P8bi7Ot/qYFH///6klHzNf//9DjiI8Yx3izL2bgwFQGqINmLoiEGxFwRy5aHaKYj0gi6y+MT/2FscqqhDHUqXw1a97jQVE4nKEAhLElUkkxs0zgrqP/7kkQdgALWT9f56VWQXsobnzzqlos9QV3ntFjBV6esfPweST2Z4ePz6r/b/giGz//2///+qIIh1rs7f/3zVJw4V/+yKmYdCRxEkllkZC3DiJsrTdPconw3i9MfKV34JWPVcAOGk00uj1bJSj8aA1QNOPKy26dmLyDmI+DBPc26kaa/m7zlEsIxoYYvv9hB+Z/6ekqWLgVSA67r//70kbEDforsuqIAABkkDH0UfSDJ8oT+RqmMgfE5cLF0fdrHtbY4omU9ryNXhRdQZgOgoG5ifsS+jbOnqmrSWkWptrtGpH0kUP+pD8VDT/+k///1+iAQn9f//U84n+/xPVXdl2Yi4DRy9QSIS2ryRPJlPVxUKGN+BzRfQscG5eoj+rPnVjk1rX1iETjYhwlxSSMQkqX1Y9c/hZju447a/uh2rCcJDDG/8otzs3//+hzt///7oNVWKqvolCAAAIoCufQqbLBqVbklUriXyPyx+IEVTYAKKxJ7NpX2mrmZBg8F4YLKkiM6dLEnY01zjSrIq7f+f+BoKUz/9EHh+l///RqlqLf6AVD/+5JEJ4ACpEJW+Y9UkFGqGr48J8IKZQl155xx0UOorPzAiwkYjf/q3KnKtpAAMDEcSQ4k0pXFkhJ3vYyfqO+tDPFOhQQbLRO6rBjq26YdQbzBzArGxTQ93mvO89YTkUmwhEyyl/+idXUF4wa//6Pdv//+Uf///0VpYsbE1DuaGZCuN2wMBupdGqsRWEtPlIqkTZW7iqRPZtC0glLUnVuFy0IB0aAvGij45qNyeWdbn9P1b/zE6GjYSVv+b6U2J5M4ppTNCNOykZ0SLPf/gDd/cgzZCGs1t4HgHzYqDM+NxSiH3z1oWK+TmKWNeeuT81jmGKZqF5riSsC9cu6OwoyoikvHW4YjTrSuqV4cCFvbu36f//r0op+//+nmd0AR+NV4mJc0RCEcbkgM4fyDSZpjeXKARzCqRJZAUUSI7J+dMdzUJ4tSphQ5Vb5CmcQKGicJy182WLsk9OcRURcdXWa9Z7E6mHNunnDcUADDOXVvVBCTffHNbWvEd///flsD/2/1ohHIRyDhJDzMwxoZg9SieTgseAeLJRJHkd4MmFUip/oN//uSZEEAA0FQW3nrLHQ6igu+GCVxi8k5YaelTNEVFu98wKqWaO5DM3I8j+/p71IdUoV2AcX+hBqP//b///////90SyCO/2xJZCJAaVTCmUIlXIzl2yMq5FwHTzDWX2W0aDGGsbSkGcrMjCSG5GKuSiFPNd7ofZFI7Z6ElvX/4EZnVkBkiNd/mnLSi9Nr//1MMO/v//nkp40GmeOibOkGzn0rMTVVEIjKojBLZHrjoNzcbRHqcrQCXgnZ5UOCcibW3r06f9rvShJGk9250X///8WfvAkIzkZYJB0FjxMkkqr6nt1BL+dFiaq7a1AEBFAJKPylVp2L0M7lOxnYeaq2ob6jGVNZbpqS0Xxr6vr3HYecdyfSsGMxLS0rfszXLVSgHe4W6/+oDF+4v/Xr/1qLs3/4jLHvjUdKCLzDyxkJkY0A27OKEmpClWX5xOkRUhpfDvwQh32FGxdu/qPibMtca/q1ldlNPLNU0k8lXPQMAoR9ON///wYvxuD57f/nf///LSQ1fQ7+PDpB/9cihkgzvDKgAQCJkhwJleN+huwSbHmpDP/7kkRcgAKBLNbp6D4UVQhbPzxnwIqVQWHnsO8ZUCitfPWdqrYUMfIcs+Ejd9TLCW9MpO/tcBRH4/QMicgKElDz2OSWSfczOAINqeb/7I46PP5gJf/////9WIP+v/+eiHueTo+iJmWhDIzNbIblbScHWWFfFNQkG3pVk0FkdAmk48XjUpA4el3NGyrme5odeQtkwPzVlieq+cL3KacSL7U/8eG34Ht//1///+lv9v/9o+wvGhFwt/+qnN22cQIBHYr8KxTqhotYVZL0UDYBmhmJiLtYCL3kGac/bW/9/ZuBZQwffWD7WspzZzM63NZGEUSGuqVZVb+U+gYDZq//b//t29FEUZ92ft/9EUiJaYiJh0MjI2Rhu5cJ0+3S7shJ6EuFsAA5gwRB4MjqbHJsqZuvnqf/WF5gSimWJUCeudu6lDj1OP0GxDfT/7fiEn//0////p/X/9/NQgG0EaWd33Q9O7VIYAADJoJwWYDCQxtO+VKtrenlqc7G2spvqDmjPVi+sN2JN6s10CcgFwZ1cw009Z0ZPSVgtS1TRLGtG03/zfr/+5JEdIACqFBXeexScFLqG389J2qKHUNX541YAU2jK3z1tagDif/7f///5U1vp//9nQiety5dBASEcgUsXTOXJgN16dbt6ii3R8C4NMJAxB8bbwyjmE4mbxUXaJ+T1PjnmrpvacP1SKUd7oG6m//0wgQQWv/9P///5oo3NG+df+x5ARjXf/XVnO64MAEBE2A54bEqCAjhUh1MikOdjTuiV/DUBoNMIe0LCdifbLhqpZECvDeSkWHDNpKfvioudvLKfXTRfTo7pSu2+3+Hf/ALCP//+4l2f0QQT/9dTQ7uxkQia2gG7tRKsnZynapT+aLKmuhJmijGD/gNw2Kdc/5t/8ZkGU46cJ1hlMRDL6SY6pjbhbn8C1fblP//2CJ7f/5wLDS7AfO3sf/JFCDvs+2G5r/6GAhAWRDbisCaZUklWpEILfCeOJLVv7JeusJ+a1vn7+Nf3Iy93kUfKezLaAC/WQ5VR8Br6N//8z/9bPmKiI5WMrI5rI7XWtAS/T//5znIHaXd2IiEk2wG4K2NQLIah8laI6dZJT6UoHOoS4oa//jm//uSRI0AAqMsVXnxXQBT5ZsfPQrCijFBX+eYVkFFKC18xAojHCBIpnWPpGEQ+mWu67Bb3///2DCv+ZDsZSOVisZSmcqFRyoZWNNqb9P+z+oKygatm7//yUBkMVNL3CROuZOEcUCNN5OHezpOOUW8wzQT6woUZErnEBqrWv9SMoPKh1O/kxWOjR5/V7MyObrv+maoO2+QOf/2MvT//+s3//peg5jARgWOjM6YUTIBS7KkMqwgKBOKo6OsmJfuIg7Y6E5LXklZNfddajEDDTg8Go+JzCY6zYjF6Nf1R1etlLdvj5C/QFAxS/7/3O///aprv//+h6jjIWUs9Xc0gEQBhARobYCdLB1H4djKxJp20p0k50R4In6bb1VBgSeFdA/1lxMTkVa7eyxp2GMzwsiVs2NB6CrZQuJP/+AQvx4BJEjzWz/X3v/8Shosiu3JohQgEKaqQ22BhHRHsujQfKmEkanxqy+K8P6kePPbN8xKU9/KIqWsMJyzxcfR99vLu72kdu7u8fzz2b8R+okDFq//3N///+U////iQeK62nvLiDAQAf/7kkSmgAKYTld55y4iUOoK3zGnhAo0tVHnjPhBRKcrfPQW0QEB3DaHYyLI4joSjsqnBObBFVAPUcUVmhx4r+u5UHptiS5bjQGe3rbG4wcw71o6TnLXdp1NlXZ/+OA7d/FYFv/+v//66GlDCBR6Us/rIlV3/aMNAMpqNjMc6k+sGK2F6Y0bhplNM8fQcKPdMT55reM38OJ/hWIPMrtherlcvWFmNvpKzQUzT9jZyJ+j7/sG0/K+kjrv7f/ZDqDF8v//+cYoEZZiJcxMzEkbtwyo2HQSSTwIA8SBgTfCxb+StlxjwPNdIowv/5A5XDaLNcYJpRnDPKjt255q3KrQ56Pb6IdOO8dD9f/mmf//6ax7p0//WznoeTNJKntzJcGIBpc/aM7V0CAhiVOFrR7Gcj00Ze1DqRSRLY1V+t+N5Zv7DQVVX7vcNigRq5E8yrgzRLsDzpm6kVTuX0N+oEI//3V+X//7KLEFXb///0iHVa7dqjAQAV2vbhCF4cDNDIYxHvxYPYf0Bu7LBg0uL8zD/ypxmcvgAQwYIDrC88ZvQ2buex//+5JEwgACq0JUeY87UFLqGv08YsKKcUNn5iTtkVEnq7zxlxEJDwjyE2OmGNd6OmyZl/CgN//3fz///7ie3///tNUbGbipiFUUQTG2mUICHiAC5qQ5GwsbEfcqsXRnRuBAj6fFajUO9bVqJkB1VD81hScKp6f3UOU3UYyxRfNHkP83z/0By1P/ZzbOf///VhGNf///djlEYsJ0Vu7CiAAIrUN+DQHywOy90FDNgKyGdeIKPS+P67ypeUKawmf89+2gyR0xFQ4S6mRV2VDzGvzz6cX9Z6lzb6+/4YDd//0t7t//6uhCDsYXd/ESAVa97DKoAABItVsY+IY4nopWmNiWveQBcPuNoeNy1EMcrX6rxv47h3XEp2/6Ni1iiqznPPnHoSOrWVr1Ghv/sn1DxYcj/toYd2///vFTP///1U0w8tRVu+sAJARTLcGW4yz3LwhyqJmoDvJwW3aYxrg1E3Ke+6KV/vTlvW5cvxXWupEASIip2uzR935R5tN8Xb09JB3it3fmpr+YDw3/6sjGGI0w9/zD3PU/65AYlX1/2zNZtCUb//uSRNkAAqRQVfmIPhJVqgtfPWdtimEHU+Y9VEFQKCo8zB2hnqeslGQAEAy4pF8wmkxEUQVSGVs/TAamUMVFvWUGwXJUl/1eXwXiSiwXPMFTl5CLUoHjJLV2ERXSrpxidW6OlH3KTIjCa94mk+G/+BKEJayZ8P/KvI3/9tjSBzO6N///SQCGd9n1rWY7EAEAaaN/Hue5wk+YT+SdTeeJ/SDZZz0EnOiygjNk8Oeix5PejWGwySiNWMHGmfWtEzmU81Zy3wgPLMsY7JRtTnORuVA8//8pSlyqUpSt8rFKV0HlcFHW0o37rsyCBmjg47CTlQYgQAGARGx+saksaA6qN0phVmx10LVl6jI95KqdErv/Zw06vxyL47lIpAoVMiOjzjAZV/N3qdztdvv0pOP9N7ziibuU1tf6wEA8OI37ABLJ+3zu5///nLOYdOuemv9eZ7nk4hkcypttSAkIUVFBi+0IOoyLQCmG8mDqydt9cWJWTMWGNwrFnvRqrrdSRH08OxPsDJEKFTqnUqy0nmnGcRn/0/WF4r88YAoU1/9ZjmeWev/7kkTvAAMMUNTp5lW0ZKoKbz0CuAyZQ0/npLZJnigpfYYq2f//zW//553bjV54OJl0miDenvodDAUARAChDDxKnqEiIM9XcVTwG1zQpDLOQBEfjSh1YbHBYYbT743HgAyji6bls+gvd0Mls4Lrbc5vstB1aWjOBQ0loHTAWYEzJIpGjs7LUdMTiJkGzIICwsJg2a9Cn//MicJTbVoJAIoByDw4aFUPZVl6Ub9ma3gwHLbcDwUsQnLVid/F8b01XUoPtoopKvqYprBpu0PAjRkKFEdf/gf6D//9/X//15Sv5V/+lFKGM0Bqs8Q7mJoZjYEbuFEjUWUgwzVFtLiujwBV3FljZXxwmtokLKyKze9Nk/gY9iy11e/rI4pKz+udcleYc6o90//4RfQ0Ci2/+if///NHAG///9EVVGZ/08tVWad3IAAAgQJcN3ZW+LVmB1oGdOFQK+khR6eyJOOHo2eSyrzDdSzQVMvnY1LGymCds2lbTZy/altNl0PmpPhDg3UvNeWef77mCcSBh0uwXDT//3NbX/2581jh5RUGRwJD/lz/+5JE5IAC4lBVaepeVmUmeo88bcAJ2UNVp4RYWVgoa/zzixr5gg4Uasu3IFYBGgIpM456m4Z6oGCZadUoubYI5GvHEKJAZCGvE/NAiYe0l9oUxfzwodVrxFl/aGPG0pKy8NLyrldvUyaB03A9SXUyajICEBdQpf2frXoN//9aNFvsp//600XL6B484f/+1omZYwRDMcjbg9ka6LyulwJqX8a71SbO+/5wHGaq6kUjG6i6rndc/j3Md+mW6LHaJHjjsNWpIWSIUlE4R3WkCcEmH01jr4Jk523ChCNmP6r+Y/Vv/5tM1RnToy//7rNIx8MgvQorqZcAIACCIQG+EcNwvxzLtBWP0gomDosTQu2AApMNArtVNigpqIt2leTWghVqnMX+jp5PfM89FIVAYt7Cpfa5c8pc1iT80DkgXiaZQ/+pWqv//+pTfq//+qiZo/X/mUh3VAAAAIFB2D7LyMfd56H8UxvPuyi3kxWRUZKYAZ01pRSUuUM0tihe+ZltWzFpYwAM7dmhwvT72yC34GwxpOoxc8xGTQ1BmeZLur+TJ7i4//uSRPAAAzBB0XtDPhBmihp/PG3CDJFBY+ehWLl8KGk88ccQOtX/6v5Zv/nN1ZywtFsycv//rNYetmTTCBkYbhEceKGcOM3idspYEJOFdnBkNmWO2hZEUcUReVQSdQxGxY22uFc3VJx0B0OURUBvC23N006uyW/ab3rrO/+tT+wjMGY+s4h/1LT1N/7fuvJtF/nG//9NSRwTDGu/9V++pBSEbidowsLA/HIXrA+DwDhcKOA9OwDkoyOtUj2Y0ylyb1uN+PirqtETlB+CGcuaACQXPMcvjwIho+cl7oeb+FAa3/+vu//09XlC5+67//+axaxFVMsSIJCKUBbSOPPWIn6K16dEBijCyTow/R3TUSzhDQzOqxax64rowFqznW1ojnqIt7dCFQXSOb3ATqlWtaf8D+EI9X/////7Vt/b/6+mqpOdf/+pS8qWAAABE6NsMaQ4Os0jwThYUOOctqFQx9utQS4JyIsSRoNt3i4a49oUIC4L6GuXOa7p/WCAFRTojqKMUBMyifyI4YDuhU/Dn1CQb/7K5FcjI6C6Mcimdls6K//7kkTnAAMpUFB7IVYAZAoKbzzRtAqhQVemDPhZUqiqfPE3ENKC5G5Ff//9GFN//UkiWmg47AZ1EgSDRUAGHJKP35FylcuAaSGXfgO1k/806bU9dh9Xc76VrtjhydzdYg7srI+tP/r9AIh2/7JmSmUgfRqKSB5ykzC5WQFnKTIForwuSePr9Ruf//////+H+n6xH/5Kb6xBoBpI2QSZMN4ujqURMlCZBkLmGDZS2F4GKP0lQhyy919mP6/jeAWRyTlTaH0tId/4k9S+WdOmVBKa+Yez76KFAR/yf9JlGCjNkIv1X/pIFt8h//WQjkDmAnTzeM4gQAM5W2vj2kUqQXZjacjQasi6zwWBULuExPPJjeMVtqmYQY6p7gtRJo/Ymq5NRTHB983bpe2tKv+iUWtjfz8pkq5hyKiZDrwu2JqMqsaV3Lcrf/+zWFkT//6nY4tXUIP+xVu6lQABEQsnDjPCMwORerFQtN05JuLYqUk2UmdSmoa9nX/hU3u1ztZQC9hE41hbnKa5nT0OUeOdl1Z6n0b/wnT6CtP/9eh7//////v/+5JE7IADJlBSeeMuEGcKGu0w5tSLhTlRp7CxGZKoKfz1ixhTNuD0o5w+hLXUywAJAIU3SRjb1AMXgnY/NDChkJhukorVRCb4j7cC+9Y1nPV5snXKvxquEezVMkwhiSEhoB6IrqRmfmmjStrCcAIhP/puaUPZv///MO//+vmjYfMYsUvDqAAAAgATca43zLYsz9p7ZmsQy6LfQ6gu7E+h6C3HVlroUteBc7+b4y6PS+M00ZNUxCiWgwMinZZrPFS/1F3djTLlWbWaW/rgUXvJgHO//7I/JGf/rnGGnFBr5hV3/9c2cTjw26bCrmmIAIAwiaYP4pdykCTvjkOZCWwnawE0ZDa2gKiWmU2o08sTcbLKZfiq8JIHqGT1ufJFUE6hoa5EoOao4ObYB4UeEnJkUi0acRZLvpsHr+4IzFf5XLNHqaxF3Xp/VGoLf//ttQaDiIaIyaq//4ktBtx24YTydQWAUBceysHA+rtDlfZIvLjd+Plxmr4nXYvs8Yosqpa11LPMHPhPV9D0gMvbhctZF1Y44REJeB7//0PXqhv//zo+//uSROUAAqFQUvmYOuBWigpvPCfCDPVDP+yY9kmrqGj88xcIzEf0Xly4gsbIzHIGIB3NPIPu5d/pPF3uWxILuULTH3gKGHAdqjWIzjjOI3wt+sAU5b2opHStZLLhhnLnTghM88Lp1Yox87z7b+BhAxHP/882t1//90H3IEj////SVPnOzlAAAAKDtH5zTWZl4uvLUhDvJiOkFooPpiESOMFlEbmZHQUEPQ0jRVpovDdt0TRxSTds2Zh63uVXNQ0s7SB1n29m1c7P3biksQVv+WrM1O2L9QxG6f/3flSh/+z20qrjS2iER785vndkQqYM1KJ4ZzAAAAGATXu7KGuvQ+bZXFcmVMTjAMYZVDCe5z4CxjYZ9wad+71NE2sRVjBEPCn9ZEAIl2VgkueVs3cehY4la7yM5c/JPbe6J4lxBk1t+3nliKfrGoFLJF2S1f3VXQS//60jhePjDEghv//93OImpTLp9dW//1kpHe1mbqYp1GW8zB9DzKc33uQ9oHbkQ5AddvJ3LOiXA09XrgFF1Rzfbocj5OLNnM5NmMIDV1bZ+P/7kkTlAAKcQdXpgz4UV8n6fzxnxE3JQTmssVbB0qinOZW22EI4Qc4+zXcs3x0E3r/+nUg///8od6t/+3ua5hxcJzbkwMQEm1+g/phGmOyn6qiAE0NxhIcfW1CIynUfIssWm9+YEeIgCYOIB4Xnz6r+5Z7305pTDrh74t+aCMTNU99V1URgnCY5juv9WNazr/0zNZE5WFklpT//9ULlyBNNtqCWg225sPt8tl7WE8UWCZOYn2TtzKiSWoBw+nAkDYqGAcUOrXunN5BZUPHIFDzzZ7lby04ZlPvd3TYYkKu39LeUCI6v/2P6t/7oh75AernnUOeTGL+tH9kQkchrvJoRAgGe09wn8K5NCUtAWTBSDe7YK6wHT14Ipqxu+N2629xBlxOz0gtszS+fKc97XVSEy588ovDFe30+zjALkenO37dndmM/6f1fKkvf//6mmGkY8LGFZ5tdSW0GnXbh7Xe7PaVTIpgSzLguk9YYjIp7CoX8xvuW8Dxrq/ukB/RXklBZtA3mEzbOxRpja91FgVCuRMYhTB9+sSBlr+jGUjsj3cr/+5JE3IACvlDV4ew7zF9qCm89aopLnT9Rp5lWUWQoafzHqlGGVkdP/ZRE33//fznMwupNtoQ0Ai0o4MXWFiPVzXlNFHzaxMI12stR6hmMKcIF0MwNjetoejqrrEQir7b3/zsZdvbR2iNt9j+M92UhZY90xADwbdv9vnmP//zFoUVv/8zn6OPmuAWRbH/8AAAICN1H/fhUIqSZlMddSAHGuo1OZyIHOYqOAHjqSKQTdl91r0Fe1YtthVcHR04g3yYLKvQPPcld0tVtZEfXNfCCTeqiPaqG6P4wEI//1YQbUn//1qR31jT/+tBzDAIxBqrJe1DGBmQt8V3H2hDaXgsUc71wfzimoRrHhVQhOHHBlmtA1K3t8GLNvvTdhaVL7bFM1y6fP668aNbRpMqhiUbmZ22q522obyOVu1a3btLyajVYBQU6ePuBAHRNnJuxjTzJ5+Y1ufo237qTYIj3zb21567JahdQyLRHnNZVe/sASIaaMuH2i2JEhqbjFimeXJEZMG+0mOl4cDO069oVFdXUfGajcMap1x4kZlmjxh4755VR//uSROUAAtlQVWnpLRZYqhqNPMeMzJVBPaystsnrqGm8/B+BnhddCM+ULf+GP0L//7H9CLf//2duiK39d31HR0alRw6rySzfbBgaCquBJf7VnVSRVZRIYN5OE5eh+s0FMCThYTqEyS5GaPesqogC68k1qOWyk3pqiEIsnkz7GnOq//wGzPNGQAEenP+87Vv///qp7/zv/+joPTSZzv/0BEO7EJmIktm/H5zl1OM3I5eWc/0ch2CQRtSsSFTQLLqHz8Lff0CzMeB30oapGqB6qQ7byochXZX9te+xLHVVWzUGbj+cQv/9xujl//fuU4G24Z/te5b27oQIwVnAtn+3q5LDDsinZkGUTbnZunEWO62Yk8X23r01Du2FoccdX58jji2/mTaqJFjSO9d7bX/rmYwjMqo6iHpL//9v//1pLLp3CLv8MGf/9iozW0AAAAEG0fnWkTrPw4TSI02zoRN5AcqSgSTGAxprrGW3kD98bvDVLGi6cWgKfmG3hkya84ARBIABcpQI5iKL7xdhgxFRlfZz9bL74Oih3VO5xE5xNooZjf/7kkTaAALBUNPp4z4WWQoafz1qeAqlB1vnrFGRT6Dp/PG3CFP/6He7/6drZNLHJyU4z/7d1R3KrSHmXECABDAG4P7bobPZU2Bp7jvM7Wm3ileUmILnzN+pyjw5unw3q3S0w6Bp2MD38ZiQx2xOpfasMKBuqMUqOKNL/sUBQuoo8E8AnjVRiv6XX9P//+kyTfnf9uurSUZlZs4kb/UiIiOSbYfscFmP1mOkuSDRacyMm9Yw3i+DeOgm8demt5PA/xUHGy8vDDDqrKTWWSRIBrQ4IQEmVqw4xGt//5zA6Xb/+ea2jGf26aaxkz8412/8/800gqDe7LQVIjbqNNv1GYSyQc0zAMk4jiNDYnstpBLJBRNaVnOiNFg6prgYACocC4XxlHyl0l3yV2pNtXOtWyRgj/1o/hgI//+zam///5n/W///rXLwgDP/6xKmgAAARef9C/MCuJ8HzLTXjmmtGGGxZpw3JNKY0yWUwIq+UvE4N+BkrX9f9vYy0plRkkWCr8qAacrpYzMRrzdSSMepgfCMwOUgZtF0Wb+QWTppNR5Km6z/+5JE64ADblBM60lVoGIKKi9gTcRLGUFRp41YUVooKfz0NmAxC23/6l16Cuf/+/8x+iEf1ZYqc1UwAAIinUOR/2hbs8kulzbw69TXnpssItSuCnBjGU/UuufhypAmVNhl9clXIsWsWpfJJ2gxl5LXLcbMLEcEVh8XAxNKn/5Dr+EeLBvZ//v1L//9lmSKJsurdA///6S50Tvd/9butzBQDTklA/tyhtvtHWbxxlUJdShA5mO5qLcdDK3Y3EjRc/1r8vg2BVVJypqQVZNqAru8xjDzzSo6c2q7nBdg0kxtu7yhG9GKCJDZbNqn1MTqN0X/53ei/KlD5/9IU2Y6y3R9vTviIo9zd2n25afixktrZNzSZ2/OHMdoq3v+TBUTxZKYckre38XR/r66XKbWbDPPJH/0t9QNGv//89mU88898888/Seu39Ppp27MqXLPnvkVh3kAIAACRWw3/bTWmcxFQiUOOmmuyViBWG54lAB8Kv7DHZ2EUlS5Emh00hnaeNwkCxInYoZ0ro2X4jUiuGTRaaVt4+IRFMzZ8fvvkr8wYR+v//uSROsAA1dFy+NoViBlCgofYHLEC20XSaw9TVFiqOr09Kpj8vq43+uzdUQIZ/BN+fUpJgX/xCJCOQpwf65e1yrkWMInDem9nK+1AOgNE5oB33XXtRr8+ZkOEHR3xkpMIVY2+PQOm3+u2Cboq2hvvmQ2j3SrWzBf5VSTSjlr/9YZmZmb2Zv1W/1VVX+kjj+f//+q5kiB4zwmt7Ct2hDaJkSPptmZoSHiFocEQexs0D8cpEUGGQAOpSDybTvQ9Zbiy1thzRruUrcc0t2OJSRsYoczAaWHmV2QvODIus+cmgIGv8ff/9Lda//////8ybOFocET7/MJkRWOuDN3AnDS/LesJZTK0uFBdoG2w61XPaqke6ibrql/8nc05Jco30KM0z3zwwoj+FQ6qxGZorASDt/5pH+VBoM/1fnkl1cj0//1U4gPT/9EoshJDRLBsNFJGJoC0g3EQAAAAwb1DdNLKlK4Dxus/Upshj4eCuuSFzusCIWsR6HbeVlEUdxwTPBWWvpGZUyaGzROQcrXW0LsnkdWrDdFR42iQZYTs2LNGG6z+P/7kkToAAMSRU37KxWwZqoajT2IiMrxOUeHjPh5hSgqNPGrC8aswBiWg39xSc39ZEe3/3S9P/q/939Z43ZZq8cwMgCVd1ozua2nlE4qD9jqGCX+K8TB0ODViHCpeuZ9wHm7QCYLqATqaMs58XD1OqtzCJJRMwutVccVm5///+aYy8BEFcG+TXvdNG//99AwP7//1ykDIODIG/cGAS4BM1fyMvEtYLxUA+GwoLP0aqB/Zo+XIzBVPJbFt0RIu9fl0vbDLxQwmKg2UttQdh2crRSY53HpoxV+3uC5j/7D4tZ9I+Lf/Wf+3rxESN3q3MBIB57dMM/EOJdngKA7z5RTwll50LNtuccfEuHsBg9ErJDXAWoRCQmCyyxE8lkiXwdO1blFgrCBg5TopX1VwJho7N/Hyd4lgqOZOv8w2dPV///kiED///9qEQ+JUU3VFYAABLtumwyuzlmkerCddgqmxdJE0wkSN5cEmmNQwikh6nO4UAhYGAIc/roz6y1qswMmwklIAFLSyEmAfpcWHCJf5jzP3SEvhpmqd6km1i0fNqYNB0P/+5BE5gQDOEZKY0luEFrqGj88wrYKPLUzpmTrgYWoKDz0KwlC8z6mFjB3RgRhZen/qN18al/29nf9nUbRDoYEACqya0b52/F5bhDs+1zJ7JMqJwaN9VDHabWWTNaUYZ4wzq++XbnAK8mZAT1WZ7s7Ko7Zptnv5i3sajTa+G6yko4n+hrNqoegRCyWVNtvPOoxIU9f/RihCWArHmstX+v7cwow/LDw5oK4F21llWxt2adPm2/M+YJ76vWCSxy9irVn9f9gzcHYbA1obZlTvvrYbm3YxmaDGhxF7S+oo9WnO02FXOt3Ogi2DcCMdPOn9akA6mrNV6++thpT/V+tBXkr//FweJh0AxAVfS6j/3SU1WXT1Zrtd4IJEA4P3KEKYNpJmdnbt7dR5tTM59+OijYBrojQ1QXa5lHo5xZybXW6OxhwQBhd+uNl+KQYQMv/5nnGN//pOYdCEOJa///z0GpAoooEtwAAAwMF3XLfMtxaq5ceghrxigQ6TKEdTAYoEgCVj/ytvHDlbtshCDuLUNaJuu3UxtIFogkAA0nugoqLFFb/+5JE6YYDazhIw29VoGvqGd9gysJLaN0nDO20gXuoJ/2DHsEyaeMLpnY2xzEfNq6rtiTW4mdVcGRPe3+MyTWFU5/lf5Kb4st///X8sRfTLdsjGQ3WkSM13C3lVXeGkXwp7BsfD4HWADiWMaBZFTCxhCKt+N32YprQxYXssxwUe/MV5F94UkMdpTp9YYoUlHkd49YyYXAhHWvqW0eIjk/dwExCqcj27chWjlRFt//+oxLdkv//zmZCxLUDbYErA4BvnMJTXnI1HocrrnlgYGaC5TYDUU1mtq9lJELkarYNYt/L6TCMkJ0eYQQxQY4fS0u8axuM1OMeK4VHITTvYFXtImq1sPCME0W3bLFW9n/T9CVOpv//+nyBhwl/wAIDsYsg/8KGzjMOtcftpKW2KAd5YcVVB2E1XVq4QxP50jtqlqPTP1pVBBLiK+LG1sAwQ2GcLab4y/xitIARHFWc2io6Qbwh3b9yN/Kk5c//1k3lhNf/981qlCQ+lEf//zpxQVy7JgCoQAABAQbs4VMq8rjrOF3R6INNMJPWeiaXyPzwT4YQ//uSRN6EA09FyWNvVaBrSgpNParhy+EVLa09VomiqKZ1hirIuy4+VuQz7/Fl3do43MN0WcIY4KS06BrxBFuzFJNSFDk1pUxxhh5mYItpsYm+esCViR/XqNCKa+pv02+pL1pn/9Wv+r1LNmDdtAAAicErH+Pr5iYUTO0XCOubc+JWppo8XMXFVKHa50fY3CLGOiAnu+cEDK+xneqf5ttJb+t6jVtauK2LNwlgSQ3j94r1YPtDnTreQxKb/XvV/vM///MhnDDdz6//+6KCQYAOo09+EpHQEkxdVYyZ6BQM6YgIThjUs8XhWVGmzQw5rupUDos7MfeRyqcgBAE4joHSsFga4ktLqPljdu1Uu9tUdhzB0LiT9Kp1LAbIi1V1+5CGsb98pI/R/Uj6z5/6xbtwTEbchJR/jW6pVrSKhG4fGD4xDgHQ20+FSuXjSwH5FpvPlNl7dXsD5JFYmsOtRcNr2LuBGL8UkOaFF0xZvPCezP/gEf4DsX+hWoilWYd//+JKf7ZP77+McYBw4fEFtwAAAvABAavbs3IxD0YlMbd+LbG1yP/7kkTPBAM0RcjjT22gYgoZvT0C8Av43x6k7avBeyho9PUXg4xmIhKIIE847qVT83i/kPgb2VUkgorMPGm2PFOydHy0NHeiiMl/LUN44eQwBk8QcwVvy+aMScNAh//LCaQ/nv1/zb5uf+v9YWf6BJbEI0rIA3B/4U2sJ6ISWJTzd4yYVr1tsHPKVAtbGvJ3MyvBuzUjwXqJXINd+KA+kgH8C9NqY9m6eLnwosDCTBSTsYa6vbkH/wavx+Kz2/+f5rt/9fnqSnfs3/t7qTFxgXOCmAiKAA1zLda09MC527cQX2ZzOlfDw6EHA8pZa879Qy1SahuGSktB76QzF/ZG+I8bbuUryM+RldWYZ2yCxsjCnbKwUnQRZVXWVAlguS+j3UokQv2ynIz75g/1t6iXNv///6ZokHJahIVJT/92w9lq0m+9lAHqDqxiuBqGzSdY1FBU+SHz48GLgxRapQ9ZZGosQsMRNLbx7EjhIJqtp/dazX1rGxb/joPTm8DyP/+nz///pv+xn//z2JAndQwAGkAAapd1+52cJbHZVAK2jGogMCn/+5JEyoQTCjfJayxtoGIKKe1h6myMjRchTT22QVwn5/T2HtKWoHAQCXBAuELgp06aWFUCNUGLNqW00DXzJhUmHmln+8w3ig3i2KT735lxEJkrjivCvmWaLBpGWA5gRhPqb8wbnW/T/mnnCk3///61F4l/9HuCbkAJALwBDG+/z88r9jOYg2ODupJTvoILwuUwDUp5fJLayE7qtScy5xa6o6G1cMUk9Ml+jUI+NGIsqo1bKWYDe/+tHrBpjJ79f9H3R///1/Xb/9f6JedAIAouSzCp3nb2Hyl74EH25FAak0gBE2uwzKW6UMtp4cCoUwK+CpNKqavmY/gTI3j5TdbugSlGXcuZZd1exrCEiEQNFSUjstYoIIg8YhPiPUula2YER2lln+XH/MfOHk/QX/r+QARCA6AQu4Ya/de7ru4CeEzbMWC00XN2sBQGKOVLI6umhuKBB4mBLVS3UpzAGCJnAbi/PIdp6B7fOS37WWGEguLoDUZlsZ3rTGhdb1fUWX2TBLQqRvLKO/9/LRNP/qagh6a0DfzFEut928qpDGmDVAcw//uSRMoFAzpFRztvbaBXahldYRC0DITfGu0mOgGsIyPlo0tAlzGvwz/5RLM69twJKDNuvOS9m7VqaiqRKvFGlywadb5394Cgn4rGzx9DUuyLnFTC5qBmDIPGxYgboFBIvyYwgqX/xga57VfnTFuVUZUFVe5WdfzLmIAwVhfUt9queJGh1og6evUfkw2xAKwd6w7R/vefjH8CLHBuo+inBuoYXF+cmU97JMXO2sUy2CnG3VTvoIkCWezw4DjEgPoq+1JMg7ha+q7q4VZ+2HiYGXU1O9c79EWz1/q30sLE/8AGuNme5DNspw6sRJ02u37JowQ/JlhyB2krkEx6//1iac2XAijk23DEJWTVNQ6saLTC8BKRbf/Be0DhiruUtMZ89d6sPCQMJ0ZH7UmjCmjeKY62TKDWIQ+FwbzU6djkZq5W6o/6IECI36a+iVRqydV+l+xgr1UIDvDwjRCzXROQf63TD9vidRKPAyrN7iTosN0+zrtO1U8Qb3+P5R6n233lNiNe/4lHo+EAHDpOhtjAq4Qbh+4MV8X/6r8xv+qrlIqyPf/7kkTCAANoRMtrDUWwaOpZfT2i4gxBVzuHrFixmSnq/PQXFg1jbkEXIEGMQWFIwpDo7COp7LIyW+m/mGvJKgZndwWqI1OMtD7rTWYj+VyZPoxmhXzCRl5Tu8KIz5D+P8QXH36pJGlhYcOQJXNnhkTURmq16zPP1LMwF5AelFRcMlwWZJPuqLVErQ7dRR/4wgeD4GFwyNOuQEB6mor9fDYcyYlgOSuP66e6eoXnc2Kj7aJXilcMsb6E3su9i91/76LxN70Ao8UauYu7P4DR9wk1YnjMyAxtf8GPZHRn1UzNKyuanZK/oUGQC48SCcoY8kRt/iF/+oSy43YvRCn+tw2rGcZU7dkmN2RvHMzq56xs7EqDvqWLf//RMX2VQIaWfvaPeZUE8jp1HA4LXkTL/8LHrZ6u5qTu6/V6y/8JqMdB1mHyUKJawqX32sozII6tBsqA4Qm0R/eMu1dAvFub6tsLi7g2N6tl3aHaejWj9/6zAFr1Z6KBtxGnRyHssJNesK1plLWSjU3GKrW3tizutpL57lN5pjHWr5Rqs/ouU73Yfgr/+5JEsYADBz1OeestSFZnmYw9ArQKxQVFh5i2sVGgpvzzCsBpA7QgABf20nEQS1VvF1EUcYFAzQYhomg+srncKzevIRFv57ZOyJ11EkVEmTcw0xD1OKaVAiIDCnCJCUslnytea1CX3KU1K3fJovnMaSz1TSq9t/6nf//n9P/2/8hA/LAjIqDDkFAoviyol77ne7gAiMsj+nPznG4lCCoY19SeB2fioQReps6ZN8dI/v36L5/MV3+s300tfRy/SGAkan0vnPzn3yGT/TqaEQQCHaXV3UowCkpPyVosvCePN0kFExoc1CxHgVD43eEow2hz6+TXadPPA7sx9dj3L57JY5SZtorPs3+vJ+rfknrdO96/yq1Ont+yaoVqiIt9Oj7bpU0iN/rf+JlOBRd+oIeYh5l10jbScHdiF0OEFbAwhxAITQW96hiEssdxzi7y6z/87ikgAYbvqnK3r2OE76aqevtORtoQ9oOLc//FKmvk4W3jpr93JCR1LvcvScAABONCK1Q2De7Z29RjDXZh6IzbyLtVnKA8FodGGTaAJHIt5E/D//uSZL+AAwVkTGHoLaJLpGmuAYsOC8mTP+ewrUEoiOv8BjwmR23HJAq0dSImH0kWjGe5ACZ3lI5oUefUg57Qo809pA8KW9EN66dKVJ/8mF0m/57xHQYB/cevyuI2HkpanMIBFNw6oc97DNtOjor/1LpAFdF8YdjvrZT2Mhcc2DdGHYX8qYDzEcNMPvPgBvxOhETSr/6ub91f9/A4u9/7ZqMYzCC/PMY5ZkscDgO90dj43Tze2tEh2Yt7zN0HfNI0Jn4dubmJf5VOeH9R0AaeVZ1DDbJMtT2t67MyFOjlOsnRqddTIhbruxGqs9f3/TqR31T2///3/YzCAxomZlpmGsgTRU+zrXIdZ/G8CC0sE3QkeOlrJykZKqyF1e4H0zZcNHLo5O15wQOZ9X/el+JD7GMUI7tqnK2/+3Z6EJb+vgkACCo1aDYTMigAAMtS4LkbJbkPF0U224+5CQQrrUt9MWYNcsbAbk76FJi755NdQjzA3qnLptbaRZ0RakGRCR8RaSHPt/iqm37nsiFZDnsZyOpz1pWrUCiQQ2Ze6O5mKr0kuf/7kmTUAQKzI85hmEKQTORpzGEiaAuhkTtnoLTJH4qsfPYcvh3lBumUr9fn1otPv/k6GPYPzOGqHODMVBADwSDoWeZCAchmnCX9EHrIdOgTkl9+91n3JBBb+GT2jDMrK+pznrlYp8Y7IgqKI66kdr2T/+mndEpV2VG1oqq0YORtir1+Rvuje3/n///9vcTPizQ7qjqhREIElZhQzueDuyT5DyCNDxhMpWhAIPBxQyyLGkmCe3IHQebWuzbMPRXQZ7AnrkBMU01gJrq7Lc3957NyM9LuZu7Of7OgIS71ZmQqSUXp/5X6KdK3+TciL/3bpJ0Ohji0lmZkY0OpAokn4fGi1FuLcSEl6MeM/P3ZBO5nzrZgsDbLf8LQOboPMiIQrlnVKUr6mFv7erFMioxD0dyPW3lbw6ET95tnq51db//2tdj7mRSX+v///T8GOap4dnYlVz2JocrlmJgXcnpfSxmkqCfuUxUuZvRWBVv6yLLndnfre4HdXFLJnDc7Hqtax03nfGxGsoCupivd6vp66Kp7urC0fOxsxyJOpFIxBIphBpH/+5Jk7oADhmXOcegVslnsid49ZVhMnZdD55hNQWMyaHzzCaCMVotJoj0bvWtW7I/t9Grt/p841+U5HGVpTvDq0qcSCJIM4QW6GRgSTEV0HTCFU9X1Q7nY9n090G2nSQEkr2oRLISkDbTsulHMBFS+90/6Huidn++pBY9Bd0RrebGg63R+yi39P+zJoeoqHNkZOiVHDGY44zTMUHahJ0nK0qKpMGljPRgZnPCzHisDJhORLVpixM+pmCRGp1IDHiy9qZYYocRCAa7C9L7r/66ndt1tV3ZmS29MQSOSdJqPh8UTSilBxhbS6k/MfyRxQsdCIXNw4zLLY00ED/tQLhWhxE/eH4p01nOoCLfoSqyeMTj81gWPVo8B7w7OkM3qGVp4vs+EXuR1BY3ggbVpovMRpgZ8sz0XjHBISDl3f0/v/TwjiiJnmmQTNCQAAMsCiIelxcxvE/2lmdx0dWW/LBi7rSseOSnMFnvjp/WL++33xez7rCeeCHthun8WG4+DEv5zu7PMkPcrU0/6V3aFAAVx0Gc5nUPUObGyfHiVrdrP/n92//uSZOkAA2NmUXHjLTBPZvo/MQKCDLT9R8eMtMFJkul89A4Q7dD6fJPNc////7/Psc1PIJEbRdo4siIqIAZhn6dh+GK3Ej3ZiN9ztDh+elphhlyUCMhhk7R7kW0hRz1kIdkMxDsS9I1jsMA7JGUmob6MSetGpIqNRS5BFBVDa5Ynn3aTX8xmiAp0fspk8yIZq5djiFWogoFJrWhdjIB/J8gx0Hyh0A6KmeyoMuCeOpXPYB3VMnSliA4/AR+unuHz/0Mb58Yp0q2os/N/K5pYrwgDlBKG2mbUjzBBGkoDBu97Bb0rexogRF6VIXr9koouXUfDxKOrKdKd07Ybbc+yQmHl4cLmiJdX/gpEYNp3R1ZKPb8e8zUE/7EdKur0p/9pIEyJKzprRzI8x1t/VzOl9goAHffZ92Mi11lNppr7S//ev2n//9yh3hTUVtqZmWhGdT2EGG+IVxGx6xYSAIlmQtQtM5oPoRY1AymG9haIYLTI7alvSO5LnK1BOsKQ1/Kd3mRhWWmcPsUyyOXacPUlO3/zjiCEBqULlxwMn2mTdTEyw//7kmTuAAN9ZdDx5hzSWecqLj0lWAyYv03nmHCBXTEqfPSI+BbhATBN4cMHoEIPZ/4G1g4DF9+rkbqaKBa8E6VU8fAdzXGTBxDG4jJImQLLT59mu5WtlQDnmY3d2ttes1iDjAwpp6CFrat5AG5cINF/lYv/ar/QUUBAXFQRieUQx/f8YNOG7Sr8u9mGk1P6kseCwAF4kpPQfYH+o/kaTs86G81FCozhRUOOKTfMSLL2EW1nBlkjCTy0j5fVRFOlQwyngpcObEmsL78yX7JOH9/06Z33I2Q6oM6IBIslThNFRdZMHmqvZ//uqYYnd+5VUYtEiQmtXUkFN2JqUIOAYy3XCDALOYgMQFRgV3VqsrSyvpCK5LNJ3PajaTLMyUVXpfDZJ1nnVJl1p9uqv5tvqrVADaNtSQHkRHUyIu2qvX/pdU/////3OSj+mg7durqGaGZf+ixoaBJAkDAdBgQICC4PlRrToJkXXXB7BAsD+uZq4xZu0iF15HF2Rx0yIcG75CqgcRvmNT4RCIJvIABwwETomM2+OaLGJIipgnJj1LU4jW//+5Jk6gADOzbTceYcIFMjas09JjaMWPtTx6RuQYGz6n2EiTl6giTFTbQG8+cn//sc+hRCajMq3c0USSCYxBZDrXcQfjMbxxmmgxWmPLL22D8uPGbZWrJDQkyUwegDUszkX0LffsqZuBs+eRObfnXhAkJmUs8igGA1mM0kgfNGaa9Me9JZxRhBH/1vRyubdZkwyJEi0ElldNZhmMPwfbAZJ+qE32hUI57Bc/Eph9BdwkEWQKCajCCucrfNDNe/5ET7f2movhoZ6VKSufmy0zN7/bCai09aJVTEcm2qe67+f5Kv2RUKq5Pf//V0QG6thsPXlNVtDocTLIKOEPGmjCyXseBJCBoInocPwmEL35tHtursCWZQp3I3FtZWY6hy9XonIwYSBCJWGJK7b72M1LU1Qv5XlElnK0Xx5a7R2+4eyYXX/WPOL8OKvKu6iKVHGmgkpwTha6JCQBQFwIk0NywITiVQctnY6qSTSVd2nbMyRjXicpnjk1d6zC68MlEzs0IYiWY0NceuzKV7Bbpd2Xb1VRea7f7KrPY7ZFY+nJrn0Rmt//uSZOoAAy4iVfGMGlBZJbq/PYNUDHGLW+eMU4FcHGs89gh4Qpb9u+3/9kPdBaY/95wcqsaIRiK5QGlQ0XRDjBWnpkVjOTflVMEFQGdHLzz4Wb7vAwjEAAlKy+dCly2WW73sg0WdkGvRm1ffLKtrTnU/xpNyx1Kvp1d18ekl35+1uqTeSn3TMnv/2QyMCMauHFvu3uHh2RxlEBJuY1pVShXg4wOEw4BgkAQVB8MDqICVSNHBRqLG5yCzujo9gQWxRJGtYhV8jJRp2vMdaoav3Vjo/cnWl+qhMEYGv7fd7t6r+7L55SnVCrpf291+/9aGdSOq/YEtt0kqsMxrsAI4AiBMGSMfa6emVrTZfCybLltufds2y//+X6m1Fw98ypt9puU/VnYSaRAlJ2X/IrTF7OxdzLULeQxT/vtnen8m2n7f//o31//uoo4ft8NV/rzJyYNP2RpYBylzE9QtzVRumgxFslFjJQd62pVsmoeJ3ftozOZqafq63PsFHlZNR1r+56vZDOZmIy1a/KZFiGIt+6p5QjMYFGXtpSjJs1UdyJ/6kf/7kmTsAANEYtd5hhRCX0xqvjxlbAyFn13sJEWJWjGrOMGWaKuhtSMqo9b6///RKDy/SCTr/snKZ2ybRCafK0uJdlwTRIkrXBixn5Wq8yA0CdiQIyBDw4cuWP3UthL+5WXWiuzOpqsfK5iER2v0cs6I/b/XKLptpdFfo1L6J173+tuzt0erU/f//1ZhF1eXN01HfICSFmhBYQgRxjaMpFF8OCQ5CAEEOedDoLa+fwnqvdOTYrRnrPpdSFHEuxl/2m7rx6iHMm+2YyH3XzCprO+y2ebj5Dv2xvu7hb6fSDgaKibz9psg2tBrI6HXOnFf/5X2OZ2RlzUw7TIDGCQG2SaCqjhTpdzhV6MW+abpzUvkgvH14uJvaaCEHH5YBmilFesp8kqTMcEUz+MR2gGGJal/VQggKh4xMAMidY7EEzYjERMgBZFNn/4lU/sk1f2dy6mYWNogFqx4j6EQ0kEQHITE/idnuyF7zpJqiPHVjfBcUbSs75VUwSsZJKFFIXJyBxzkyJSci87W2qZru28vYhzGpsyouqlCSW9lP+09zv7SctH/+5Jk6YADKGjX8eYTwFhsaw88YmgM4Oldx4TSQWOcK7jwlqgLU6E1YwqFpzZT3+weHOQr/s+93nh/a0Cm7oIlot7WXNJq1Dlk+lwhQ3EMZT8P/33v3d7rqlLWxGV+ZB0RpgTIxVR6Rq5lGsgmGzQ+fny7s1dNqhMPalGAxO149ndiehzP//A6PG7VzNvLq26AihGbJuNYSDyYh8BwnnZ96M1K57aXFglFaBRai/eBon5yEHFjBkfBiwenSpzp+a90TKetLLgZL9prHORX73wgESQfUHJpa0hYmBlFGJ/6KUfVu4MMd2Wfn3l1dS9bJBLhdPT8rlgJS0EhPCdWQihDMnGk+56E3MpRtjHrfaTQlzyVOqDr++7/6MahCb2uiX9aWt6NS2zO4RDW/oiInSjU6/76pXZ1sraMzo9bLa3pLTt0GGBNOqv8zaqadmrSIITXQD6OQ+zTMIugxi3nq2os0l2ztLC8SDqOSIen22P03MMWISvCJWauyMX6JRHnZXVaE/T1VXoz3srKTRQyQwxNyq3rTinE+lcaS3DSanejkBZA//uSZOmAAyhRWPnjFNBVpvs/PCW4C7jfYcYMscF+say8xJVoabvp952WmpZYygAAlaHTmrRBTomLIisQHBOP2SO21ZY6fxaqIMi1jZweEW1Qb7y5VuUt+pKpe7nJ/Y50i4g25wu8Rmxv2LeBY7zKg6PAqknIYqt26KnO9yjMXsKeLAgRG5mJOy8uYZmIVAESarQ4XcmYc4uT87jrQxmVByHQ1yMk0+m1xvWLSyb/ud5rwrCRkz3JL/TYkyfuKVp1rnm/TmxjopuRyiCOXspA1lP+ej7ulVvztI0ud9vSjHS63vZf/0/9SIcWVvqiWZmVEQqlFVsi2BUYQ53Gouop6Kvw+8jgilf+VX8rkEdoCI+7xKZhWIj+Uvg3oX2f885+x0MVaQq//b+49Fsx3mOkSnDIUyBJyQRGjiYTGBbIJrJ686+Pb1wOj8WSdIeV/7t8uWdIyQACaMh0lyUqBP1tqvCvK5kJ6l4crHgS4CJQE0JSlp4GxKR+C/OQ65md+1/yo7rWj2b5FVDtqqslUMt7jjEwMCfT9Tvr1ujL9l/fcnvZbf/7kmTsgALwN9n55hOwYEcbDzxmjgyhk2PHjLOBgxxs+YGh+pN9br9vzKii2L5ch+Zs1LsqVtAAgnySwvCPL6dINgSFUHYl08rll/uBfSTNyYaY8s7/VA5a5HMJdkBsiqrotyysrIlFclF3+2x26MtHYyHzTNOP1NRSkdjdnfZ3Wv/f/r/X2/1//vIqCb09EQzK6qiH1SKpAezCGaThKpZQtaaWE5I3KKsFnsxxYqJKS2h3PNCEcJDI+CJLHBMZNk2WRIJMMEfvmHqF/eJcq5Th2b1yBwfiCv9+VZ1Zqqx0buzP/VyLenq73s1Nev9ZCDgE71/9XdzCsmRJAJK4GgVZKVQhIxi/GMdGkOethxYBhdHxLq3LyfprER1aWhV5UiZmXP+c8ikGLKAgPuN1VHlDl2XtD4qZoGoBxRQu8iG3rNVGvmi72KKlsAX5DyYYHIVwRb3Lq5p3WNIoAnBgCyk+FJwTk90+ThsLGkjkX11ltc8Nl3Cdveh1DBYR1Abv2qKjGC03u0QOpOibiQ44kobkTvNMmikW9Jn1qGdnzy4ZZ0n/+5JE6YADBWPZeeMT0F/Mm088wmgMiYltx4xR0XyRLXzzDaCElWrb+9rZdmRZH9LBFdnYEykTREfqxpbWT+dw4wexF1NO7tDuxp9UitwK1kL+MdAFzb4kJ6IQcKPampPMbQ3N7GbuwBDWAjiPl4L1M/y+5/DLnYhSLm7wqRpuU8FXaWRqpdm7GjPUBXP//9Z4Mt0df/DB76+i5eqlUPpQCRBY1afJB2pID4XTSdKWXD4tyScmsQEcKHFmiY5PwG5/MkYF5U5koYmzLkQqhyQ7ZGI39uyL3ZrGVF1dVU4Q5FVE9Ntl3dXVk3/QiTP2UktP1PQzXKrVqc+DEChfqd/Aqv8blbtU7axJABGAy6HYjL9PzAknZ0ViauMLrpFhwEgNrxU4AbQbOjh7FAtzUncfNvbJLC+OW796Wfv///64sn4jARrl1Zd0VVRDKkQAXwKKHABBgaMYaFpiUD8AMcAUEkDJWD8CJeLSM9P3CvE27Cr+VMYLBjzKz5+fZ5Einrb/elnlqVlBiV2+vXuP4yphoqd8Pf9u3ibgpo7EZDN0DxCC//uSZOaAA39iWvnjFPBT5uuuPGKOjRWDb8eMT4kPhi68Zghwqi5Jh9qdNgZU0WirbBjTqmhAAFRE8KYxYozVLQzMxsh9KisoD5PNLgsyAkhPskB2EgoAU6r5WFlVoIo0gmKBwKLcOBFQZix8+TpaEyRgiGYY8qcWIFF6NShBMO5w2CbKULvZlHqWWS9qffShYWEigWyC22dvZdVEKsZAIALWMkfIakXgAhRwn6nLkhpxr5pHvOuY7DJa7h4HhODCDPq6CHNfcv0O8Q0rr00yqqX///dI46WohlIRIT6uQxQpem6qpj3ez/JP01nIWVbFWy3nZev2OyKBkGCQXUw1b6UkpiWZkZTNBGBExpugQsteOzsMCcQrP6VBk5pvVdrHMfF1hwInXf1vNXIlEdzg4SIFSCmO//+zoHOy97s+fHml6rmol2M1AACx9ELJEniFn6njkNM/1Y0ksYlhwiyQWeMY9Y4RDU32u51WHJkIeBBjYwREMYwJnpxn3+siGtlVl519mCUkpmrmmuYcO1M6lznLvMjbeceHXEDyOJTLSna3j//7kmTtACO3OFtzDDFkWMGLnj0sRI1VYXPnjFHA+QXvOJwwCprY+1ibECCzjI8Wa1tOEkTQESaFwsK79ISpqeGRWNPqVIWxcxGYF4EyK8HwSY2RgKMOBDANv1yMW/XGIWSkTuTal2vfKBRyTUjY1OnZkHYQYJlChxAhEQmKsyBcymbZr7C4uYHhf4IZ84gqykEgMJIfXfkr2VDvDMyodTKiMiTDM0BlWSSqM5xNCZM6HIeyF9PxRrbp3WEO5Ww3iqr5cJaE1prKMNsxtn/T/lMQz1TVSDHRoHEV9p9IfQJcUMoQsJDiaWjxOLpE4WFjSqiyf6hbkiNVMAytDLG0kkW3nKWZN6BJmX9z+zusDZKDQvpCmSBQzDtv5a506ZVOgnTTl0VMSBiEMgylpsIWredayoXzTntZcH1xAAGpDJwYT/ygWaWkiKr/6aipp3rgC0QErHYLShRPi4GYwOCDEIBWGsTCoXjOLDhmIRz8qDk5sGTSoGEJIq7iBQU8jI/C9KXr5Ih6lvJIehEaw5bTM4X9devqVvTv6SOfsWTKvxozUoj/+5Jk74AD0lbbceM0YFuk+949IySLwKF/zDxh0UENsPz0jHLJeZtgnEsJbsjYZS0MCO7KiTIo2IBNS/uef80NFTqZJpEJnI6wSEurCgKITJjBwkqciJ7+Dgplkc5pDdfhFPJzcuzzMPKm1jJSIsulcOsF08jDuxKaNvE6Y43HEuaifeePrDIUKjBy30vgSesRLqzOqqZ1KjZBxDCdCQthOinZVMahASTIuicCqiyEcC6Ta8kRDhWRFgcDDuQZUZ85uEOJs0LNpHNjOB2I7eGWTH0EHFDNlIrYXyyWnxvSkCNKwaC7nHRGGcOxQ61N7+zqiz1fkPmOrKTKAAMycFiCHtc7jlAHFjb+Y1FGAAgmRluHxEBuBjtIzX5AS7DN5J5NfM+QsyLv5dpAqjXLQjOmRCCWpRZtqoECJgoykXgjadI+CsJB5Zk/dwpapuKVp3d2d0Q0kiAZhZQL8YxYgqjcPoo1peVJsMQoNBr5Ze9HoGlr9MbfQwAVkWZla5q5VkCEOhgKBaOINyDHm0kAgC7hVkaUtRLCsJuMNyrv/QgFSDrk//uSZOwAAytO3fHsGXBhiEvOPSNmjFDpe8ekbJFoH668ww1YKfe2LCXU8igbUP8rLs7MyoZFEEFSspPWcXsQvR2ElXaqXSEp8kqJKDkUQTkUShYNNZCWvuux2BYXpg8qnmpZ9f7zqmcvfM+fdVTNWTch5qFvRLHT8OtEoaCavyWCB0yZKnUFkqIjaxoayPo6Kd4d3ZUFtIhSggZbzDLyylYPSdjxBJ1HrB1EjRnALQnVmGzUZc4wzE7au4ZyOXygwqISAH2ILmyBZxqYKf+rvsngqms4Pt///41d/5e0sy8O6Xd2c7f7fyGZmdTMxSAATldivmGmkScCGlsenUVJ5tqHP2OD8FLyQxBpe0I9tSlzerKtCISTX9fivVIm9zhWRrf5lAUDsFDDuqkqxWPN5wKNsK9otYoyMWgqKMQVINCoSHPYd8fbd3jPcv9do2SQAAFImTHJAQ8mhKS/sJBz8RZ10TC6dAEHSMDSlggzqOkzI/jlPjPKmZUbeZebmR5xrohTjNnvXMa72Yd/sCU1K3bn5ytT/wufc0RPThPNhpQ3sP/7kkTpAAL/Id/57BrEYGbLvz2DYosAaYHnpGyZiZvufPQNqqrupIKoMnGNdomHaGU0IUSQA7TBGWjy9i9HadbQJOLCfrO7gHdHY084P1DFcWovFyzizUyLmDOdpt10ed6qq9cYHWt/+752U1dhsech4Vmiwl/40Skz3XY6gKk3jlFjzPASDp2oZQhzE83DQ7O6GQokgp2rkO+UxxDSwnoJrELyBIiFHGxAq6ChlKRGuIlDuSlW+hzIjbS5HSOnFzqKYQ3AVUu3n9DoORgIcPApxuGq9LqoEx3aGvgIO/+sPNd3zPx9PQd16lLJmv//a22iCCnZDM8vooi66agbqNIQVVglAkbPB4TyAOoySkEJNLI1tLbwU75mQfdTn+5Cgf/PHvzFbLRH2CBgZK5OeifdEz5sPM5ihSGyQQLmWWHBKP1/rJCzGtxtj7P//fW5enaDEAAAAEAldQBvRTcQpJG7Gw4PYyE2dBRcJsYKiiUNEzen3q5Ra0mGmWejs1P7dgQwo7JJsxeD354zWlnFzB2YBqWSImadWZlH6xdP2e6L72X/+5BE6oADBDJb6ekyhGCle488a4iL3NN156RsUYGY7bT2GRLf4E4ozSmyChuod3ZlVDJEkFzVzOVxEmbCYH2vJNFaSrKcxur56IS1O66rlviBg78jGd3xVUSltQmDiXmZQ2DgzKw5fVxMRZ2uHAMLHL72pYxDWLKW30s8rNq8Vih771ttoa9Vv//5IrEOzMyIRIkAqa1E7ISEWcxhoqIT074yZL6HO+P2IsKxPRWbE8CNRxza/oNXKyMWx7+RvZ/aXz7xsmIz/CCTBKjAccpIsxxmzW90CHiAFbLU+oehi9k93f8nDw7qpoRIkAOaqUoW8tR9j0m4XMNSS9xOdjQ9MJSZhFIERcyOFszSSzySYm+wzneaK3I1B++RnbMzK+VEEOGSWYGUjzvb/Sbv9GLQ/CDqeEo//0Oaim9gz//xR71K++tjZAAABdi4J2JwBqDyBukpJvdKs6BJEoUeLj+ElPHq7E66Iqm1n0aWdssPjh9RI6tu7aLoqFetunG40aIp1thI4OFFcrVFP/VcwPYvioDI8W5Ikj6DBIktj1pumPv/+5JE6IAC7DLY+eZjcl7oC388ZZiLEKlx54zVEXIerXzzCerQtatPiQv/t9YyiSAFfpo5mFsRydYUGLCSBcGSOzR1BlrTvzta92DdG2L8RSKI2ifBJDroHAdVcuNc6hQ62oYClbO1OqiE/btUW/02Tq2sTXsis3cVN+IUCFqzMn+MDcIZH9/0c//t+/qfeJJ2qHZ3ZVQSSQBc2V4r5AmAko5CdEHPU6yfIYeqIiqU+G1rXT5yZBzCrysW3Bc2opAZGmpDgmHj0B0I3M3sjMc30HFgKGpA0lhSMe8sIzY/Q73fpXTWt/2o00P/ORdAi/39khSAALmscv5MlIP0cg+lbBJahytNFCCpJM3HHFgHdtRrT9A6KPpI3300hKyvDOfkSqqyfnqABV/rg2vQTgJZ5f/ghcCiMArFQABWwCpv/k8c0s0Y2uz/6sxT/2trZRJIKmpshJBjLZCSWoE5JTzL+aJmqheQ+100lAyKqKU0/fIXQbTyNB45eoNyLSJyRjTsY6qqpTnwl840wUCocGg7OBEFGJFh2wM0SoYeHiCW/g1j//uSRO6AAykx2OnsQyRnaLs9PGKmy6ijbeegUNFwmay08w3azcKA4UOKh36bNltpQ88u7sqGRokgu7N5uHUW80YBaG4TMWccbIUKoPVHyKpdkgqaWaNRwzPcD4qKUYHqRSTVkXyvbWTVoYivbRAsekiGzKGHjsYSxLpsGrCdJ0aX6rdT3ob79V32w2WWhwqhDF/bWtokAgpzVIjvNIWwjaKNwVw/CdLkkrCoiRKG1Meo0getj9+97la8Q1upQWVadlnVUl7i7/kgVGC1Vd04BxNDiAHw8aSYutNExXNxKxWzjxmwkeU0qzDK/csIAV5CyFi+N6bO1u+glv/c40yCAZtpWuAXQu6uRAii4OZ6ZPoekI+GmFwCSgnobbmujTFMFGlKV7lf1+xjnIZWc5CMxjGMXQmn/2s17GRHkqwsYjnETCJGFCBgKi0nU1VN3vkIt1VLKqWGyKNKZVlFMyESAAVNYKLUxjGE9FdL80nWgCRlJgtITYmiWIj6UVS1MoJ4r7vTjf1CnSw5hj14UYolBXpZiDssHTLxd2970OMeVReLbv/7kkTqgAMjKFlp5kOUYESbLzzIco0A32OnpQrRfB+sdPMV0vv/pSEJtv+roR07b2NpIggFzbLapiTJhvRZ7nwrWktc8Iyk3rBARiAndX1+QUxykxM3IZlH2J6n3C1f0Zv7CYTS4XLO35l9ZtlFkl0/2pnv0Z2RUYRllNvpJJ1mlcKAAAKtqQCGj0Jw9UJEbPIkJnmCeirZTnOAyT8qpFCZzvU5RyacPvdzGU+0zxVZjRfT3LcKre3PYnDfwIE+up7uQqlebtNR6wxwhe2nKlTGmOLIrGEncikOmexntRE8t9235uT/9ulKDmjty797ZESXdYDCFYUpZnSDeBZF9NNRkEZnEvtzpglBRFLCz+Y9xToTk1btDf5QciYlqXkDEKUgpg1/RBz/yBh0kAANVpdV1hf5i0kUj3P8YsuYdFpHIEwikVrLuEmQGCyaXMb/tZP03Mr37eIgAAAKgNx2JKhZIlSoWYJkK0uyvVaF2nbFLcRbjSQ81Da82rxyUq1dL7hnTbHMK9Qc9Ew1EEot265sFVL7u0VOHbN4uguwO23xlcz/+5JE44AimydYeekatFAlCw09gzaN0Y1Zp5hP0ZoeK3TzDerh7kQMYpS/JzNQbBluUUlTWGftucjSQJAADlsKAMBepprusKx5b/QK2Eosli71qfLDr9bplP6sf6gPxbb/EkIxD5nZGUaaDK3vAOJ1rjGsl/sXnfaf////9tmHestI/JDawCchSj1wmKqdUbr0RfPMt32U8MXb2uNIggqW7FDTKc0FazCNIITG5DjTkUsEtOz5MClRFlZaHTMrsb2bTe0TRvfwO4qaVWiubPFaloyws0/I9QqKhvQUE6giRBZzUNbCQ9DHsQtVP6P6kJJnjTmVqFfSkNDIiGQkIBKC/AX4gbiiYBPyuJ5Ku0NbjNVRcWQvuXh+mHGv8rFmLLMsAhbw2YHNiJDw5qDws0c6U9Vey5WfgxRCMOLEGx24O/lOn///+38NVbbbIyQAAE5bd+IQjx1GWNwtCUk7J4Vp/HEYsdQrqlssaonrtpN2s2Z2WEB/W2d3Nb78g5DZ7skfmP6rP2dda9tpIobqDthu40TaLlRDELBWNZ6baDD6ADE1//uSZOYAAwg10+nsG/BhpsqtPYZci8inX6exB1FFFSs89A4iP0rVqHf3SjHXDoohaoria/7VRpoEFy7e4KQt44kmZBNShIM6Lb7I1XqNG2S0WNw1jFKTmSWOgkqTIafeZaU4cbpdaHV/LCyC1wRir11ASiIOFZPiep25mTb5W1Gm6XiqKh0wL0L++OC/i5PInyihSKTsssArIuXTbrJISIQU6dIyxDD7CqM5InQXqIuiyP9ILTM4E4OKIJP/8ZONzTqTS2Hx/e624VQSW44lkZ+BBBFjGQQ8r6ut2AyL6H7KeCltk+8c9F7q3epd7ZIkQCApbcuKGkBGKeZbl0YLi0niqzkOYisJ0zhaBmJd7sv+W9O8Z9uUazWzngiK3sLJd0RR3LCQ/kVith4okKafdGWwxNV0Tf7Ow29znen7+x3/3fUCKZrHFESAQC5biYFKOA+QLhA4J4HmzDvinJFOdsQ5OyOBugcYp1UiOpGI8KBTG0uUFG1RLycIYOl2yPJTbvnVxUSI9/yOmluUbW9P/gak64VYNqcWKDUTZqlTMsWYEP/7kkTrgQNEPFVp5izkaGbKzTzIdIoIsVVnmG9ZY5+q9PMVsnM0zdjzjI8m4UR5QCGErarJGmgAAAE5J4GpYOwEFNSPAjkoXxHIMxGTE1f5QLC/FFL7a3Jqe0sOLAAlr3kNYjLK0jNyuKWUotMfdcmo0TLdJNc4JdhVLpCIfQiPz5IHAPt/b2/pqiFr30mmeXt0ejvv1rjJBIBUtva4dFN9k5MN0GgKWryhqjfxYzJBkVn1qlYWkyTLRHEFKccemFrbOdHeprxY47nsdc7Z9iZZ6sPDplRyrTPZAlHM00gtf8cP4kHw9vVX8/aiw9a4FQPuFI3LVsrTlJizJFwK7WgSvYCyxtbY0gAAk7R+Yr0708qFaEdepRLog5RnFtuLRslJ5AL0KTlKWJKFtyg+OuLaZqq/SHrWriW5a5RYMEcAwUKGh6Y0mnOOk7kg6iE6m/pEzwyDpKVSMXs3teR2UL9dXGmSCVNd3gMAB8ibiBlgLCHkeJ3H8rSZruKuX79LLawgJNab2aMxocfxTQdoVSr3+eZOoKrbA4gKznuFCzoz3u//+5Jk7YADYzJUaeZENGDlCk0wycKOAPVTrDEMkWqWKjT2IZJVlbv84yZKG2/u1hMxhNZlaIsrMdf/LPUtL7WnqnOu1j76RsoAgN2j/ZwkK77ZwIABFclIGXyGNrwfRySunF7i5EhU9O+0nVTYuQQFqJdCGUh3CpCo5a+Uy7qxxX+czuggUBO/3fB8cHabH/26/WztLsZgAgAAzfsDLknQ31YNkthoto+Vgu5wNQ0yDpc+YJBSi71U8KwmTkihMRDF/HImX5K/iaw89eMEDjD/KJMFjVrHaGD+4oREQmMgcpcrNw5CpL1PQ8ibQfV64sre5+n1Ou+h66SREqSj4LubZC0wMEw3iGLsgiSHrRJzs6LP0yl9gYNGTS8UlSTIIFzOBqthcozjLfh1ZPS9/G2PL4k1aKYhQVjmvyKzzEWv941kY6GGs39xbJsb4Qd/P5/LYq8IZdn38gYQe2tjKQJJdtv2iixHYGUOBaLknjZYR/D/WAyhHWdmdHWYwUni5eav7hWOUbVtIDD02Y2MVnVJyM4Yttjp5bdMJTP27/7lBs2M//uSZOCAIxc+VmnjLTROhYqdYYVmjIyZR+M9IUGNGyl09JYr6DwNBc1Xb32YrT6/fd+tbq5JEIQAAB/A9kUg3xD3sQ3b5gvUZAc7sjDOu1PQirPZBdmzSlGgpGdCPwYrwlqxh8FSQSWzTanc0oNny10XX/+CQEo0H6Tz33s3vQ6h2xpIEgAFOSZfoEqBLl1Nh+jFekXiLHoVyjmikCVDEgcKRAJGQRcycL5+ktApLIF6X+Ujlq1stWvzKFVnyA8KsRT1M7FCEJnOKhZ4+ow0KDBZI4cqGxZYq4pKulBdSyG+iijTniv9Nbx0MhFK6GYALu2/iQj7ITFlP8kKUxOhWVTpkjKH0JamfYdUunJ4f5C/Y9Ow2JZz4uuLaQbK5l5l50yLCcWYxSaDgIkSe/9RrkBo6GgppF1gABMW+rZTpKlbnq5Q309hf3aP9iJ3uqgAAABS666tC8eQNxignhCyQSsEJ02XDkfiE8Lj5GpYYotTpis6xBCKQyrFE1kDjNyHV58RL2/xCTwzez8JNpt1zgbb1IGsnbWtahe0nNIHoAgwsf/7kmTjACK2N9Vp6Rs0TgZqTz0Cig1Er0mnmQ+Rg5VofPYhMJOqFAnPwekLo6lArMrbho/ht0Yr+xvX0g8KjmAAAAAN1qtY07DjYyqDjKpnIV+lFqDTaIeJ5/kKrCixVGmYHiq46kt2JqfUZ5g+k/qpsfpZ2YJzXIQSbdAuInCrW3eww4GnKYTDtZYBMstub0q/2f/bSsszmqAAK7DMMYD5zFyNUlR85Q8/glhDU82IceqEvYWFUZOx68NniRfQ0amjSe80+CXMD0lH2H0U24cDRFTdUCcd7JXfE1jUD3qZQE0nQaMhuaR62PRcJr0RdqaK9sy8ZioJDEAmbjGriFCMGunRbYb0NdRPW9iJyZSVJgWapliRfNk3g8cDrGzZn2dSVfF07TVRIl4eT8XRepOWCNfdYxiSAZf+yTHJTNayirChkvpkKkaIZCIAAAAO3bDyUW5Zdm6M9KBgcNyoFz5iJZJfcKqp9tZWr8MHlXDlGEhPGpo1FiNm2c7ZJvI8Mk0lhzKZ80HCs24zz9bWdLa9P+3efL54TyMvaNbhR9gsK3D/+5Jk6gIzbytP6YZlgFnEqg8B6QoL5KlD56UPAUYTKDgXpDCibLECVqQmbzqB25VK3W1adhnNJNS8ohkAAAv+84pEYqxj2PROCSMKAfD9AwQo9ciu+67fLw5BDy67CqUOjuGfuFmjlKpzBgSRTpgl3T+QoeFjDTK1mVVaqsLjGNWGpyJVNthRwgVYrfe7qf7NdlLN9ZJCkhoZFQQAABW7f1XY3DiIKjzSLBhYPVkOwyGxEA4qZgoxjN0j/Nvbb2gdYM/Vct9XFxKNIrPH8N1cFgGHx9unTdMPB4Jz7BZLL3tubFY1pt9tPVUz3eha7vZq56kXCHJFUgAHAAI46D8DW8nyksD0LRJEaKYjJlkXHFatRmmesVJYAeNN61rCdpVJTDVZO4ZcM2LcZTxUcmOgm8456aKxezfZN/r/tbcWukIAAABNwSFxNIXJFl5LlHKRHJ0jLpTIlKkvBaNo1LCxMZIiWrEjFQ1+QA910Om0Msozw8VO1dMW8cjLS+rmDwU7QIcDGCh5m7v7fptZ4EAWSCREoJwQQE1mBxVIqSXa1fqU//uSZOyAI3E2z/nsMmBgJmovMGW0C5inQ+elDUEnkWe8BiQpzTJnhzaLe9gvfpYAAACcgYXx3Q5mIjY9SgPQn1MNrULf5aRF0fThpc2VSyrhkeKFwerHr7p8qNF97LR6OLz1WruOzBSnWO1CR4DR1exzQ/IgmGEuCizoE/nJKatICq7GBCPVDlMVTaKISNIABUapZZH4esN3nbzSXohpWZtojOq3wC4TqQzF2gQKu5uTY4Dg9rr93GIQ+QklD8RiLUEqafGcccIf6tWK2p1+HphIimhcEQYpcxY+EQAYQvQspImK9TIPjg7I1+3Rn/jKoCs+vd8GGQIxa3jbTl6BrRUVXtbqSP/HAQAApfuKobyU5Lz8XIxrWOzJMGSbS1dTTzY94WEGXd111V01JRBJAwgVHRmlhax90Xr1VPQ6qYbTT/MR1x0LKJBC0KB2mZyL/K47jmAHP5IW/6MgAAKXYfMrQ9LwXYZwmRB1EdRP+ry2M52DIRX7r6KkrvEBewXtS34pm25iU3lBlo0MqP6Dgl6iRy60zmMeWATFzSJ6FVLFrP/7kmTxAgNfKEzoL2BgYcSZrQHsDA8A5SksMHpBSZkntAYgKITYLICAkYISrRdOtg131GmySA7bpEiKMyZqVQMUiALsohAj+bFc0RxhdGAl9rfPeZMKLKZx6KWVzHiPcMhiLfW/58IYuNrJuYWNcVAOBRrHOJv/qWXZBpRICscpZ3/YsBkAAMyrWRhTjSr1K1maUSuJuThCidQhikiL8f4TJzxI8qdNFOmayjAIVUI2YzgfxzLa6QpVGTLQvRCYqeNBbNJaOlacryxeyVgOlYlaGSGLKRjkk1NXRESAiSNFtosKEhVRo/J2nEezZ//2hAACoNUUrTaGBhgg7UqFSkFMSJCJ2/u56RomWVxhD+iPn2VBFZj+g3inlAc3iSZ1UkosCjjZ7ET6eMJWDGjKEeJrd3cbWxtpmtqZFSEiYWY2BFXHb13VRtBpTEEEAAzXnVLKxKRaqBxJqkkvjQy8P8iLFymUqgTrG2ZWl5uG8gmlnPF8noS+mNwmpio5K0vaMVCumbVGnUJ1lXLZaNDHgVoG1goSARdQx5IqWWW3HZgr7Or/+5Jk5AAC4CfNaelDwE2EyhwF5huNdKUfB7DaAWaXJFg3mbj7Pr7v6NaaewHAPee6MsIRBXBFnGcG0mqU8hrCnV5NqlhcHrcX5GG6SZQnSnYplBpxEQqFcYZms0qyjokYoU0hQsitRoHTP26RBcUQ4POSSKyQSWdPR6FLM1N2FdL3qW3+vpT6dey7ZdvacwnvM0Jyc8wOTAejc5qy4lXqHm3H0IRmorGT5eed8pFlaVm3Q5U1JJTkynXT2Odo8TeV2+AkbCuqJfdOnT+79BL9X9L/R87Z/oOtxstHa4QACWwAQk25SbwhiZS8kgRcyQksJ5L5kyWhU11VVW/9asZVaGxqUgMMKpY9BUSpyMys96ZK7Ro0fb+rjftb72gbVYxKoAAADPBJKZnPXaqNAKjiEyIg1OKHOrBFtXHCKFxVJaaitU2aWeQuimKXeBEXACMCWpUtKL+rApv/kd8IKeFdBRWUH+Hf4L7bvyCv//6L98vhUIKCv/4rvyWl66ElRQgo6oZ0kVJhXzeLRAwQAfr4zHV6xqJ5kGKw9ukFJlBDgIm4//uSROqHAvomRimPG+Bc5HjFGelMCnyZDgY8egEOkKN0FI2gVBSoexMzfGrGqqpBgIEKqqX8Pjf+x+3GVV/Xn1VKHQwp8NAzLA0VJVncliI9LBQO4duywFDWWDoSPBPiKMAplocCYjDYcEgkDYRBIAAH+YGAwYOAgeFsaYcB//t4u8wUA1aX+YFgWEAeupyvwMAuEhzf84DjkBTEhBy//qgW8NWP8FKbyiff/8G4QhCEewNxbiDHaTn//+In0PVaEMiGwt5hMX///pulH7+OFQV/OQwD44Gip0OBMRhsOCQSBsIgkAAD/MDAYMHAQPC2NMOA//28XeYKAatL/MCwLCAPXU5X4GAXCQ5v+cBxyApiQg5f/1QLeGrH+ClL8on3//BuEIQhHsDcW4gx2k5///iJ9D1WhDIhsLeYSu///9N0o/fxwqCv5yGAfHA0JTsx7kfDCMBVM2JQEwAAiD7/ELMakG0BARXxQBmdMF4DomAQvZYcLjv4VjUuGgYNASRmZaED8YCdANJ0zc2Rm6joyRHiVBZQtJJBNCyoLMBtmUBwCv/7kkT/gANIIr61GSACWCbn+aGMAA6kuS+514AR1pcl9zrwAky+anUSkufNTBA2FLjJDREAzYxSNt1GzrNETy2HPJoc0TuOoUiFlbJukglWtZmfPoJTJAQ4VAOXEOE+hc2HjFkDns+hUmkeNkHM0lo6KKh6KpPjSIqM2MMcBNlcmUqZxBborWYGSaaJkbmJxM0WYoIGqzA6sg47yCG5CkUPJGBcRLhFFmVaav///1OeNP///ycRPkUJgGAAApkHoEANjKNgAHBWVMUTIaxZBL6e6ab2qgMmyRdpw9mYWvYZOAi3U1oplJEPU6WCSi2StCugTctN48pIH/lFT4LT190Ex6PNTLMNp6U6cpx9MfGtFMjSGGEI38mTK020jkSZj91ob0Cp7Gp6/9oFIGFTWk710AS6PKhHZ1AXkWnD////////////vQz////////////sdKRiGsfIKuwkAmATcgTCBbMZiAIpYBQdCW3J+jOAA+ZgMKDTIhWNohGmvoGgxoRMpBzEwhwl1iIRIw69EeXdaYhpBoFnMQ0ONJRx5vrruvL/+5Jk6IAHOoRCBnpgAJuwh4XBmAAcpXll+byAAHmAIIMCMACJwKkKYnmOGWUtcwF4Him+3qdmKoS+Y9TTSnEhNVjcafn7svlcvV0sYhJS+dmAojTRVqW9/+890/aOBndjzoxRoVA3uHeQW31Pn+efafLDGCIHi0hfawzqCf+vX5/3Z7//ef29c/+4UkVmpdEpFO1da/LX7+7R6/8+87h///65/yqo+0bdqX2frSu5TSWmbieGP//cV//q/5bbb6cq4qv773r4t7/+7/UuVAP/9WT/VT/uT/+tSjgAAAA6ZCDqnSCyuqeGWc3m7o8qCmChaY3w5jUOpIpiux8ulsH1EjUBoiCZhh0Hp14ZZEAGCTOmgw7L6KLwEoMoMz8xMTDw4cMYhgMA0Xtv7DuecAqYoqiABmMzoBiUzqHu/r/3llNJTmJQslxLt1rfP/6lNJUYmqwnn///qJW7rsoMpwre7hdx5jVpaWIrrWU/1H////lb+ItZDAqsNPVbNLzf6y3lVnc//99//1uUqGwFLsauPP/9fjdx1/////67jVnLW8b3//uSZGQF9qFe0K9zgAAcQBfg4IAAGSmnO27qeICBgF+AAQwA/+Va00n4CLAzOywMh62f9yAhZ/TXaM9fnvq/7H+z702I//fp/b03qQBEAIwTBAeLoHANAKr3djrhOysKr4mA0FC+bFF+BsOIhRIgHIgAiEfbVw8UypSpmYJRweHKMYpA+AgSR5eB+ZYzqw+K2kGwsDg8O5qmSRgWBqRDS37gSfiuON2AAuEOqqXK81LWs16ueVBySFQebbWmnKLszWtd+5JqtQAwofsTqnVWtEyLeCSQTYG9LKRZbnHJ0mRAUgD/0K4G2YUaTiDJtdebFwnz1t+7GZGgsoqKM3/omp9qqPNUqhmUnSR+k60lKf85yVbLHJmGXr0atl9XqZ4Tb1+E9P2N3347+2rt9LfN7NlVNFdH6AOmIAAAAAAAIOR95LlNpQxPNK1OJxWQraHRQYLBi1vBj0JAVAlKhlcPwjsxDcOKVgAEjE0ZjlIsxIHHvbjS8lUzZpYw2VO4Lj6aGCwgq73nzU2Kmo3CIIExYWlk8gfXXczUs4ABEELHWLC0Wv/7kmQ2B/VsZ9BzPaLgIwAX0AAAABeVpzqO6niApwAfAAAAAKdAxCQIUoWnb6y2tQeUMsFZziauszMhvi4T6Cn++cAKADn59FvmZuzK1+8zQDez1b/pqNH/0tZEmebf1pv/q515DFPu5GnHdrvVjf2V+ruT5Git7e9JXXT7Pe3ctN9dpBSNBb6AYgDAwDBGFzPmdrCzLxLRa0kMXFMCQIMOhVPJ9jNohPMMQCFgJTOguPQh9qeMO2FgCMGzjMKybMMQGCABk8My6UyrO5PwcgDMMAWOQgfFhEW+7koldBW/DGUouGWBl2ozM3tXP3/PmkyTgvU1b+pvmrX6tTUaAioAaqbI1J50t4XiCzFOUDZTaKBwOYAEpAx6PNc4AG8c5c8k2pbLQWpWv3ph8Aac1F9VKi5SdV/ntQxGrPfqcxVf9TZ58vsm1CfxdGfoU97Ow2Uj32/1cu7TX6HDZC6y62l3OW3W0ua1NWKCD321WSkTi2EAUQSmfn3LblxggCDB0IzDgPDTttzWC1iINMdXYHaRYMYIU45QhMAQQL+xtjUYwfn/+5JkGYBlUU7Zc7t5xCJgCAAEIwATNWlbzTz6gKsNJaAEmJivmKkewm1JkOYlQf5rHgAfgS4+DKUDGzkYEJVd4AuaXekHQsM8AzOZoHwstjpX2gx6Njaj1YTMYZ9sl87p8avd+ZCopW/p/jVPlvdb//9P//XPv6U1v4pSGaF/TWfnfvI5og6Jt01l+rGTMe79TKu/hv7h/d8oCNdadxABANMwOFg2Aw9ywDYITTPphs0Hvv+bWxiP0///0J6wKrUQBlABc1Z6nCwNoKRyYz9CIK6rMX1Zywow5JN0xhM+144R8FfjCkjJkkU1LcY868oceWxKXSW8VQocI+UyC0+rsMSl8Mw7XjK0QonTjhlARWl1LEo+3XOvboRCU5Mj71v1r/beUSJ2t4hOTjr2/tbeXr10xQf9c0wbi1s0STR1jnzkW6mqNQXEnQ450OEkA47qcd///8qPAQIvfc0z4BBZIh9Qtn3YPm4wpV6YkaFiFFIrQQfticOUZ8QFJf/rf26fJgLdgBwAAYBaxjAnVF3RZzMt4/1Vgqej4in0tQJAHPCx//uSZBAAZLNqU2Mbk2AxBDm8AWgmDvVpX61M85C8EKcg0wmw1Y2mqLLy66y+2kLrg0gAjBgKM/Su83YYCRK8cyOL6lvp2SLW8rVl1gckE0MyQgG3ktu+Wit6loKFzuNUcgnn/zMnAJkIHaP5a/zF3Kxni6J72IzjcGqa6jh90T/OoKOJH9RsdatVsUclmo////8f0n/0Pq//5oAEIAAAAJyfhhJkSmrg3hb43SJdKlla6oaHYTmU8FjviWn5/mKr9C9H/t/3WvZ///2q/ekGgEIExMRkB4cARcQYEp5rKoWbNCWrD3tkqqZB84bFKGuNGvmmeRdWw3DjarmRQAsFBA+8az7qWZBBYT8iQJ5Mldv1FMY5NaL/+oPcLfT/1VF1yh/zeKjfQbRwXcqJEdccrGgLGytKgUJ//rt/p6AaPBzrypQBIX61VLWZBYiVQOykMm9ORpNGbSQnJfliD0n7LzsTOjfT9fhKXsNft2f/BBH/60eHliASNoFJNWXqXEokaRULhqBtyPyiVS5EEkolkMQSzx5rNFY/Cv2UOzB8N0dJy//7kmQYAGUsXt17DG7OK4KKLwHnKBGli4/nnf04ugqoOBeg0Kp0oXlnlrjwQ5zDD/9bU5+9Y0h3Gs6dtSm7J2JZvM5186aLIQiXv0YjmaXve937xvdHRcRrr4IipHHTS8S39pRYYGBwYOUfln7ff5o6SixSlKOLcQIoL+nv3o363QJxcLhcQYfQJ01TOMo0lw1hgOEDOOHrn9AAbAAAAAAAYqPg3g//iAkGV7Nlj9T8/vnpoaC8OPVL5z1He3/vu9deY//oV6eFMEZYzWnJ9IMZx0hsDfcU8RkDNZi2/1mDo5SyC1k2HyXwmx+CvhD1lDm2LWz+uLb7E6r8/4tv/eWMuBLo6GoojIYxYZVRGgsPE0ebc1Kx9n//1zgkOVDiojljphyHPtNNkaHb7tY41qsPjco/vXb92f01XLyDX0T0XwkmYBVo68Wtpdbe4lYTcGHLACjQC58ik7DF8qSBouED+63rRekSi2Y+7GFAtEShOHKSDw8lacPr//P/9Njf/1UDlpQABgAAARCAyIAozvM+TLaNzZhuz9uw3cED9A9iBYD/+5JkEIJkW15Uc5psUDBkShw1AngTNXVLjklcgLCKqPTQraAaEMfWQZFiT+MHnk1AEHBAk65B7rNbumwq3b3eoraHJH3Kv/P5n9dkFcLAjALnduZW5psZgqb/07z86cF4RV/qdzwbJu1Tf3oN2CdGDu7GSL0/66zE9/rSUfSX3Lg7fq1f+r/qR/rGOaltI8vAAAAAaN06rl8ymY/ikgdOZ5RUzIl5Uu5XYYcHwB5e6b986X/UBRNfs9X/s2f/rA3xAAAGBQLhgYaZDLvRx42bQmQzcMsCMVGYOETrp6v7EiQFgTasLoM6lOMBJQZ+bWH9nBYcyCg3XlIqABoXwNe3nrPvZkuHGC1RggbrdtY011O4w0hGDVWCz2JwGww0lof1sPgXDlAq/qdAqtWosg0sl+kw5DTT+RVH5//dWKl+gVgazmTEANnI1U3n2V2NVq12/qGI3PUf/WPtEGuNtRspnrH0PBoGmIhBozaFYqETkTETLrMaM54P//q/0O7P/kRM/7KZRUXc2AUGNgAR3WCFqtBjD0w7DCx3gXUzhl9IW6aA//uSZA6AY3xdV/tQVMA0hDouBeg2EE13Tc5psUCxCqj8FiCYyFqsIxgww2CtAM1Z4HWIPddj4DOfW9AjxF3/yQTYiZJt0QBseFFLUh//JxkkoW+m5ZucAUJm6C21/6tIE/0eVKl/FcdbyIvZf9yf/e39SULbkpBWR5AAAAALzWV5P0NESeMP92pHCkNrH3fCRO/uNUVACErdJHH19cN3/zjXvv/7P6uFn//oIZuVAAEAAAAvu6WT9vzFW/SsYc6TjqKMJMEntMVKp0VQQUlKarq6SMaq3PTucjndbuM9AhCz8msyohMhwq3zvcN6zqF7opWMYgiWP9vRY6BVScTZ/ltQjBQq/rmIw7ThZ9WYN7AG0JDXWzz39sl/+cdUrP+NLfOaX/n/6q239QmhtUCxUOGaNZA2dfEx0e2RGiCxKd9X2MdUqPiYiSw6BayWhwMm7Pi//6v/3t//UkecpQADEAhvcVY8PrCM7eAsuigwdZ7XWVQSkytIVCU4mg0seNQgJ6XF5kU0V+fdIAItKR/cXVOwpaRJ2UXN9DMHEgRQ2HZ1mf/7kGQkAEO+XNZzb5xAMAKaPiSvaBA5dVHN5bFAyI0o+BY0sIHkx9iYzIsEipN2f3YmC3qPf7/UISv9tKgv3rNP+/Uf8mGTMzdvR/6b/9etabax7A3uQAAAAAOz/P7eGCcCso6CDACJ7ErQbNMezNaDCF/AD2Aww12S579/2f0q3X//tFKrWAAQAAB2VLaTjbZh0CvAs5c7sqpZ0BbaMOiaIDObNPYcz3uXKquNTJUHO59qvsLZUedTPjVVP8/f6mxgti+TSKOCjGTjP/ng+J6VtTlbl0XoGZZV/m4lhDzhZ/o1vpASoofL72UZP7bf9F1rUrx3lyQShp6S/8xQ/6ut21kE/pB5uWQAzMwWNQMnh4fF1hJ0rEzr0pbe2tan0UnRuxFDedTqdR5Z8+v0YLp9P6t3/p//VQW51gAAEABoeOGJIwFr8Za9EG6MTdNrl0cDAaDB0Lk/jHziqAOJmKRe91u7Mct7/UwGClFhS/g9LU///x6uRTn5HjMrBQrefbsBAFChdDYo8GGO1f+sLcWvU3/3pk8LeHhmamPjUjBTev/7kmQ0gAPwXVTzG2vgM6RKXwWHOA2ld23nwFWY156p9BSc0np/+ktMqLO5NLrl9f1/9a//fv5kQwiZygAAAAANuDZwoQ7g3NAmqLoSoPtKXs5elGz06q5YJD6I6D6y/X9lvPL/0O//KO7P/1o0RToAKbjEbkpMTUF6VQgR2k1OlGlcnS+yAVGZ8Rc+YAcSjH2oFHBbQt9/OOoD02kmbKICJq61vUEYdyZogsWZ9FAvNzEvm//UkOQp//q+suuZGyWUW1f//+JMN1CgQoEZ7f/qP/P9TdDKAgo0W3UAAkgBKIbcmRhIPUkJZgoD/dGvm02a+pgoBFD52QdiSaf/Uv//Xb39//f9vSrkEGtWrEtShpvXIAAgg3HZo411lbjyuA1L2UGXZqm1pT0bdJ5GRqKVIJJLE5erdGBtadzBiAF2dho9jM0ll+Ljdc38b0Xv4NFSf0/KlkVHV75kHQYoVT7HoejePne6vofbMcxUZ//ez9WQo9X/gLnZcPpCJUwAAABAQjMiSFOdCHyHoPiV5MxX7klJr9fttwbBGPx80UAhmhf/+5JkSQBDWknYews74DekSi4F6FQOEXlp7Dzt4M0UKPgXnVB/L/6jRrxp/pXZsr+nT7f/1ze90gguqqbtm9ctCEGtO06y6Y3Ms6uOFt8dp0tp8PXoWEZSsqdZcFbr5120LmbD+DQ9yHa+M11AfbiZyX1N6zWsEfs+57dHLKb+uOkXj5n+aO6mjoMFpqm4QW5vr2/+Ont7EiM7Trb9U/69/NIml6VA0mxgAFGlMoRmtKDLOQ2JdmUzOjn61TeZoYBdzHVjQ0NDhV0r5dDFj5JP6ULUf+n//9FVFKioAAIBACRmCzmp07dmluTeiryrDLVlwYITZT8iKjHaQ7JBQi3Zr2IDdPL//6xQbv7knbjM2Cb5/6t2a1eLcjI6gjWOX7mAaMhyWUn/F4t/7VLZVv9G+ETU4+1f5nUEX/3Q/oGO32/+v//+ClWGbdQQAQAAQoKeZtLK4PolccDGd5mkmm9EgyG1dlfS9WqguZKYETyhzfvU9SGO//l7f/T/Z/+tZv+kCBALAFl+cJq64XFdaAWkslet0a7YbiHKkl7wQ7+Z0DO2//uSZGSAA2xc03NHFyI3RQpfBec4DCF3Wew0U8DSjSl8F5yoLes0BFP8CWNNUUzABQZ210aKjILWRn6wUdn7N/8wISpW3+pn6xNzS/bV/4N/+8kfw47e4in/Bn/pX/hhnBZrcAAAQQAw6O5BySGUeycDr0dH0Yjjbd4hbWv6podXdECAuOnFvKBiS9RRIn9y/T//+mKKRv9ACAAIc4K5n1gKebioduXOM8qsTgmJio0OqoPEpPNohz9cUCEboN4pOGYBLcsMqFRIxS8MItaoSQQSVsd1zKxA8WqMyr0htJy/DfMYCNahf8Ou73UHURr719YuCZ3IurW1zje42kujVku9P/zD/3pIn/KzzX1nr/9j//W+/rJ5RCL3HQgAwAK1qOqQgHtV5YcSpIXWExOqW6kip601z9S/izGP/9eoZ6toJqHX/d8n/b/7KEeXcwADAkxNEuMpWK0B4YGhmB2sUDgQwYxqg+gHU3Uup3LPJ1Zr23K6R/wdGx+H8tpfT/ztTAgAu+H43bpJQ3SWUMjbLnBIVJLua/UpD7u7OxLVxh6mtf/7kmSGAgQOXVDjeWxQM0UKjwXlHBB1c0ftYbFA0hrqtBSce+pSGigNQynnW6rZh9ANopLrrKD0HWn75n/1aKvUXDrmboMVmiC7/ume///j6N7oAKCCG4ANJUsAk5nNjybrq1XGGFyQKo/7TOr/UKkDS5f/ovhKlL6IZd2//p3silSS7erVJrZDAAYAAAR/y8AgA1Ki8oCDW1ay7LtOUypDIwMCT1MEGTQQRPqItNOd5mOxKinWVrJFj+RWb/151SE7r99bk6U9l3tylGRlZ1Mph2nKgHY//1Ti0IvmVvja0bDzT330jYkgtxak62/3rfg3duky1qNTZ+TT/ronwdDDQNvvf+dv+mqK3CupFmEUAAg0BAKbZgKDRu6TC2oDXFKGlwmDtjx7/2KweeHZs1aIhxkNH/0CWFU6IP7Xav0EbxBiAAAAPwkkzOXtyhp0laYeiUGZRGmc0hDpnANLgbAFgOawjYsA4Yl9JXVUAg6U5WMY62AgD3MaPPsdg7WNe/ecouyPE51g8gkwVGWNZ4RNRQ4JwiCvU0idsJkgR7VrXMr/+5JkjgIENl1Qc20vIDKkCj5AaoYRsXU9zmmxQM0PqrwXqKCjIJwUnZZvrqTzF7rRSAWCU902mCRgf962/63bby6UJse//6P+1bZy3KyhFhvWoAZ6CXsAGcWH4+u4yQ4RO26Vw1UPB1WTtnHGoWXUaczf/88DQudELG4xKTr8Uf70KhNNwAQAiqDV1LHSuvAwCWw+3R810R8GCsuuFhYZ2J4QHF2CQDNE6wFJdiLXrsAKZm0ExTd+/SMDNSOlecI+kgGhyxu6pZGQNBIkyFIW20ohOym/ejUtco0VUe+qGRuN24dDZJ31ybYzBbykeWoh10zB2nN2PlAKsP42D3qQExe6Jcf3fR/6qyRLNanHCkPE3Q//7/+tpz50YUjvY23qAYIpAPtl4raZn4KpJSTznwPFr1xCkDV8Z9KiX/3+SEYCIpTjGuuv/GwbI9SnrAAAEGM1zCwEPAMaU+8CejpvuyzFpbfCAwfwaAjtRuMJ9iIBMDWDFRxZ7eTcTJQMDK7Z5XL6SSQCLHM7DktlMjdGOSmNy+x19BUyaZDi8vloCBDy//uSZI+ABNtdTluabFIuhQq8LAiTk91pO428+oDQl6p0V52Sm3nwwZ4mp9yNktzmRmqY7zWm7d5ggCszuGff1TdtRImrzumqHO04A58wWTzGWNzxoQoYYq3pUWDDHnumKjG//1b+UT0DZzQULaxddgBEEC4oBvIgAHDUI0FSHD/wO7DqM/hev9zBlPo1P+oXCrWQutfVB69DJ/WyEbndP5clB5YAAABRNGUJYOBuYKhQSAfWhYqXVZSyVQ4340MYmOLiNwVqQxcaIWev+GGg4Kt9HF7y3BhRUbgRxpiBo6Amdi9G3dmxUIwVetuAGmxeMGDGJNrdYm2sPkwvk8/sSZChOM8STlafAEbqLxTmcWCoNrwFNzD0zMRgqNxgVXLbD8uyOxeVWWuD4/WrRyCfXtDnHtLU2q2ksqNAhwMNRbcfHy2u4JznOBAQMS34W222s//7motrb33/J/uXxjQsEUE7n6yAXDwgAQBkyiAfQmMetAIyZj6SUav7D5KzLldP+oLBOW5N/vj8MOFnbDX/6wIa5eQA5JKGtwY3d74caRZR4P/7kmSABAYRXc5jTDeSK+T6nygHkxM1eTCOabFAvBnqfASIsEIDMeO8FEsECILhABFdlIhARoKlCQNuz25gQhgGxaDTV7MqKgE1SpxaZ5JRBYqMAxvKvJM4ijrIr7PYbv1TQDopzWVd7TjtUSGPNKqYmIGSeQfTVJCbJEgJcUVsW36qJgVNqSAmAnbn1Vmyr+9E2aaGv+ukgo/5TNj1WdXrf+tH99Tf3NSke0gAV0gJSrkEvAHgHV4JdShiW/gkQI24E26/fgzLrhHFBit/gcvf/pLnt//8ONPfUgYIAAAARVA4cJGhMDTofNwVnNdYDDStoVBhni2GRQMCSAYMF4CfyvC4Jx3hjRhhp5ZihFQJ21K9orXnImKGDwS2IUiz4PbiIQAbXaFhTU0eUel68Ydl7Sm7nDDEx23jJ5S357AiTY0PSltUNIh2vb1j2/WqS+kluw+Ae5iZGBC03MmsVEqeoOYAA6EYOnlMTR7rY06lLSLtQ9n/1V0DfrGkolFSrGZSdK7fnGX63fbb1CwPmsf/+8ACHgABQBIUcwQ5L4lsJ7z/+5JkY4YFul3K25psYCmhqr8B5iSWhXUojm5RiLGQKXwXiVjeU2/jEYSFJfr6hrvKB6n6bH875xv9n/3KHAMQsQAAHTpWEjMRjiv3gc5gquwUDDZpiJnyAQqYmHphYXLsZweK+AOHjmQ/MQ2CAwwJOgmVXpdDohAjowhV8NupEn1FSMDdzryyC5fDq+oYbLGhGGTbGjDmN66lekj6Ag1uMMSAA4GVUpuywQiNFnd1nYwv8yhU+KcIGKxdKRLrWi8+jMDrWUdCejpWWmlgRqVmNm9a0kli5f+cPT5cK/WRQtV6jE2r/5me1911tv8WonH5RQCWpwQZCAiUcD5iyayquc4oGbNCdOC1Eg3+6sq+357O3+wIKN+UJQL/2//99QmAAABdyzhgArtY+9b/sSd9nUywoZD5gDJgULp7BwhCMYWaEAbPo2Ux8AXG6/7+IjmyHLTK89nbbQ3QmbNMPzHW4Dh2YKEVa0F6rxZgpCASwQgcIXoI2p2reFWOKrmCWIjASgjQvltuGSALkeWW8LOvzznJ4OwAzSWIiFSjyadEXD+p//uSZEGGBWNdSkObbGQsZBsvAWIblcV1LW49XIC4Git8oSo/EyAMAOJZip1BFlTVH7n7iff84yAuom3UI59TqTP1f8xLP+7VN8pEaVJgEVMAZItbUpAHICp+01TbrIq1ZTv10swyhn79MrhGX/nKNntMOBouDW1LW6AIUAvC/6eryrqmWxO9EVbXWU8BgGZuWRh8ZGEhmLGYwwJxIDpXHgoI805bjETS1Ek9CtxjXpvGQSG21O0KXtUCwdMJAFizQGttzWQKAMwmEwgFqeaDKl3Akjvz3PCbYQYcRztkQOVb+awGycdns2/LjcJtOtDDHpVsm/3PW/y+3ffvDCzc62+tH/Ey+q/trF7VFX/XcYHtaoXannj8uxxzMf/yX63lWVzT24TWqEoA8QoABpCQqgB9QnHIQ1vXyAxuxdlIUgCmv9J//g1bt/22CLASsw1g7FRPoE7OARoABFIIwIEQCqRvszf1p76tbcWD1QmSZChg6GD4Bmg4xGXYMqLkgCHAaThANxqQ3JUnoaINN7al0TqFgXM1cGvxtKCBLcmIgLHcxP/7kmQmAgW1Xcoju4xgKyaKbQGCJpORdS1uZlaAxhnq9HMLx0YMYOYchhhXSpDQCtEMaCIekNq9TQIaTZpLkxkX6frCoghYty1rt/86fV+IhmhMpkOo1qoGaCpiqfUoogM0sIJo3ND6yqWRyV1VG65t11dnZNZ7pjmJycIs9HVf+ZN/ac1nTVtIWo01/+xAAu7AQCAVQAWzX7AQTgsdg70FA3//9RCa56v/4Io3b/+wIczrzgxClVvh2IJpAAEGZqsUNd3UpgxoUNvJWfxKsyYcxIdmAiOZ6DBmcKIBCIAnaEoCj0hA29jJgZgsRw9jllBbcTKwzbSUMn7a633fiWVXphQBE0Gr5pHpNuSPV9V5Q1Q+Jj3NCE24vZmfHESS0V7OXHRJgPYJM3MR8G+pFNkKT3UgQwE4HLJ8waxzMiiz+rV/1H5l+Ui25Nmv1t/rQ/q0863qJYAX8AeOImkAfnWNVbV9DhACAjiLt59aGsEJ5p4p2cTJ/1Vi3b//BwyZx8c4+2W//gJaAOAAJGqq0vrOYYTMi5jKILVmAlAuoYKDemP/+5JkDQYEMEpLw3lVoDOGef0F6lQRjWszjTC8QMuRJvAXnVg0gWWwFTI43yM5IV3xLOulQZCMU+tcvMjNLDoXK3I5QYdy1lfqvgVdoCirVNQ0FiXtuZSqeQaM1Y4RGXvtF+D+Toctak9iYB0mOQoX9etD5ziuF0IoWlafqQ3/t/6SEgbyIesLjv923iTER6gAPcMBNhXCgfnUfo+65MibyDsYze/Q5XQyjnCfzd1p/oVD0QYcd4mf8vWjsZ81S6U/Kf607EAKjLNFOJiEtbZWziwwCHVT1jRqwxYOmD3gTgA0PAMELdDwYiBwxSesoWm2KSbuRiTE4CEU05OStU7rxCihucqWB0omrC6G9YWC32v24yhdjI22hyi8zToOr4ppq+ur7irumn/O9fKb9OdZA4OQ7yCGpyMedGO5G/9RJG/QKHHQvP/oOV0ujoy+NygALAAhQLMPyrKU/IK4c5t3FuTiixJirVZ6NZpI7THThqPN/mgsFYIsbI+HE2vtCvz6f7YjJwAIAAE1pThq9tsrDWAwhrUgl67WYmWiqiBIAdEB//uSZA+CBBNdTWNILwAyRBmtBepWEh11J220XIDGkCb0BhywQutZXR0iJfJMJMJdz9Kplk41Kp7DajxlQtnKXS6bTtlkpvVcrctlDAnmmJdko/zKtTQ0u4qDXDfOf+qSBB65VVWIgooa7W/0G9DAODl8B1b+xszf+ik6GExhW6P/////MLjdAAcoAxIAAFA/mpDwcvTE0eFkbilcoiQeJrdfxfXTEowoTEmv1EGShA453ntH+i/+6niwLkYAYFABepXzhSd0mXQiWxVgSaJCDGUZAGNkEAgCiu7R9UaP3zgwUftyoAWmtwy0gl+7k7g75CaQHTtNnZscCxJIpdcwpWBUT7SZY1iMgAAk+HbV2CgstQpbzq57LwDOLi3U/MVH0jMc7us92vmRq+tQVAlkUl1ieH5j+oWwAv+nUfwjDdATVv/VO1WX/4U+gAa4EJgAEjAdvTsGhFGHQgvbcPw878o6vfZ/Klm+K1HjW/4WGgcgh5Urv/2f5DfWt3RVJ3AQAm7CQHSqeyBK7SZ3K1Nv0000CGygehUGggsmTx8pYiqbyv/7kmQShgSDXUlDmmxQMSUZawcKVBFldSUOabFQyxClZCepUBJECYpRVZQqsLpWg2pmzukCyuHLD58oVmj3WKV6CrbeOdhm4sulhswYuD8fyrN1NXPRFX81rPpPC5hwWs9SSi6bEgBAkDyZ77qou98RQ6OypwfD0y/pVkur/VsVn/Knby9qv+omNr1dX/MD4AToAYCD8Gwi4kxg1u/rOqMEYKIguqKb9lM1Yc6noKrjF0sv1AyNAgOo/+p0vWj/UNBlBAcBrEcyKVnmfi5yA26KHmYiWsO0EwQMTVgMUGL+Gw6YUDiXUsrjAqPMmXcarfr1GfmlIQPdiu5KOCAEJqbmO1XhgeT2nhi0ZMkgZpn/3osEhEm11tFubJMJIKN69eX0yYBA5uiUPvkwtfUdAfTVdKw/tO/2qLP/spb+mbesvf/UZHv6qv9REehAGYAABAH4vqFSAR+ECTQ2DqIf6E2u2jNLKT2ZyOtWQPMhLNp1MBGIsOSxHypIaSf43n0qCahAAAAAZYkTc27T1PnVgmTTS00CBgcmLTAwLMFDQzgJ2VP/+5JkEYIkXF1J45lsUDBECY0B5yoR7XMpjbS8gLyZ5VgcKVBfM8Q1TW5blEraCeIEjxu37ibpenfd7mCAIIvdfKkh++1iTV59aEe0cpaoa3NdsHzMr15nAr3TIBylHraqyKZJB6oLI3+cfzgKYbLfSLuhV/n/+u5xF+srp0GOmRpWq/SrRLqvR6v+XmAFFaAAAAgAETf9YDGBJVF1Sznqc/Fcb0X0zNVOP7TyA4XN/qg4BcMmU/2HI5jvDaQ42QAQjGTMlOHdadHXtktyIvrEJeaK+goVISwOKzQxFyU1zW/6cnqbeKHQHBkO5VcsoYBwpLL1jsFLuTCa9D0/WdpkwyKoRSJ5ojABhRKRAdjeP2jLDGAWhuPZ2ZAeyd16XMTQLgNySZgUetBGoyduwSMo1ajZemfPefFf+0rFTwgpiAdirmNb9Rb6Ur5/DoIYA/fQ+LVqR9j9/XRUykU66siOcfyETEuUxAnC0MP+oFIJYfI1/6dHR2/pt/Fy6i3wABCq+zthwUlUPs0tSnKIvY34Cgo8RwaBQ6hmjwk2qVJmaniw//uSZBMGBEpdSUOabFAvhElIAeoqEDF3Jw5lsUDCmeVsF51YPlFLnSPMCltF3G/7xmpPvnXhVSy9L5/+8PmkgB43KVUaV0TCVkRqv1KFqhp7yNC9m0gbMxA0PQ+lUTw/l6gZLqqUrO1OuZhYCVsteYvOHTrehV/6mn57yvPpV//zD//v4/IaAMwABCJ/71hEPYkiSemGsdATaOqm21uiaxZ5x7iCQRyxlr64FpGGq1L26kW9XzRASoEwvdnr7/iym9jjADhpuGO0UXQHA+Y6ABiIGQIOgMwTKhYbKekd6+2EMfi1jdmu/pydQnBs1n4+3/cNcuxosRMmvM8iUDgJ9RC/hdtNMHKRdBQatB2BqdTdf0dEW9qj/q6qqqYN4OIoGLzMcTbJ/f//oqbzpuo0R2//ON//v6jdgAgwB3QH4+ZZUEiRVdawQolEQdUOk+6LV2cx94yupKo6WJEMz8UCOHI6v//3///HUwWQEDCJL+bi123EmkO3Ln7onQKoSY/bgIJJSQ54zA4SlUMFQLcNGAu13+nUZDChonTWOwWVRRit8f/7kmQcgARgSkjDemvgMwaKDAAqJ9F9SzHsIL4AyhEkpBetUOspRxbBpa3q9qUdxloquFhlZk1LLAIbp+bzsO076dK34r24eKxbIJ1p2L1FQDZd3Omy09TLc6tJ1Vj6anEnmgWlHWfV1qbb/3MjL67GSE79P9PpAEFCGdF6AvcNho+JThIEKQDROk1kbMKkxmun/5pgTQszio+dj/kA+m9VP7MhZHT6C4uLEnSCAAAAQalILtG1mPQEnI09+yopAJDTd5AbgNfKjjypHlTQZGd5qTdSrIpysTYxmqu6l8345i0y1Mtwd+KWrd+pZYc6NSGb9RJ7CvUq2mUM0iM/L7Hv2wRoduKWKWLVI7XmInsRgJ8P13tNMlWlTqznZbm2R2lQw1hhW36ZBHahTijHFbo2m/owO5YAAGABgH4vKwzrGwrnPMJ8Q2Tjzlz/zUf284+vqiexFE7fF/yoDkRwtdK/rTCopaob8ioIsAAAgFEJk0GstcN4WTx6pFWdtcNjLCgYVOuU3MGUwWsb5VNNisPTcYEI8w6V1pblZoSAIfje4lL/+5JkHIcET11IQ3pUUDOFCW0B50YQpXUfDbS8gMwUY8AMNSginTwym0JK61qrXxdPk3YbJDUaL6ow26mdl4jTgGosWlH1iEBsfbOtzEITREgeNkJvXyIi80JJd3yIBRkP/87/8jLn+UIvQ3/8YE39v/nlHy4AAYYMYItQA+OhHNgdCxjm9I1WVXQ9nMZW1LL2jVx8Vt/qEyhlKlj2OOStxMpSFgnjRn0ilUJQKv0+uL6wekFD0SxZ4OgZmVGDgtkYIGzCCKOJ0nS0ZQKy7PsFqWmgj0D81ucX+eijEwHAa7K1WGSZSk/7x3Gc7EBP9udAo2/uuT1R6zGClk7F4bs6OhsmtWjrprJIH9lGf/UtuoPg5PMAn56h/Sgx/6rgg8Ntnduh27/xJv6f/GvUrXaBG+Xs/WFc3OCkmSIuu1cNb1rSrGLupayCp0ji4hjE9u7W1IgkI6ismyz371pzVvo+uhhABMQzGmjXL8+2el3GnRHQY0rYLlCIXQwN6BWLsmPapEaIFhiljjIiigb21hSvsKDZ0gQqGSM5h2VEoaGGVPhl//uSZCCDpExdRytwVxAxhokIBepWEWF1Gw5qEUC9GiPEF6lQhfjmG60dg3EwYRKwmit0ldsAhTIIdaBKPBgii3oavWXZSFTdEzNP8zN/gXhQurKLwlLf+Q0Gbf62EEXJvF5nz20f+V/X/+pegAADAg/LybxXm8PkpmW9AC48J7woBnsjKy6ELppG7ILztPU4GBbA6qSVf8gl9P//5SkAYDLTX5hVWcku5PWlTgsuR9NgjUiQKdRAJjF4zdNQc4aXxYUwNSRqcGQ5uUbjWb9JK0OBqYMEWFLp6oSFwgBjrWGMBSmHuanHhBFZJKlrUtZupoZbKWbP1euGweiDFn39M8R4pakYjx28mD/rD9RYt2L4u3o/qL2XP+uqdQ9m+vUr/QP/2/+YG0qXh+f4IIGKT0k8LS7Jykyem9WOTL9x86Vwqk7oUayVqcA8FKBybJNe2eyObT//8jpqAaAABILhFyWYar1LEAVa5c8265Gi4xQSDCA2kES4cg9g45hXxp1AAC5V/ucoesckf+VvZOYEI4Yi781DkYnVg0A6p6CN1n6BU//7kmQkhvQiU0fDeWxQMOaI8QcKVBFhdRsOabFAwpojQBe1UKjFrG/yDDqWae87u5YJAogjrQ1pqugSggbMyiM2/u/oB8KDOuXRhHp1Ie2Z//rOr8ndq0//zh/t/PSigQ/L9ZV9eCm/qWaYQCXYWrNWtLsS6ONGyFUFQfB6SEtfoVBbANBI6hv/ar1/7/8ldIAwHplcOJhZbj9q9GV1J2lgDGCm4kEOj4kN5jAdMMhBy0QwDP40dIsY1xeBOymtPiIkegaryGHfn6ZDrJM5blUlUNgAWTBr0OxeGDJDaXXf7BRxyMMtXbtKepCwE6eurTolwNs9cyR9b5pV4KMe9lLJIYQ0oy83o7//ZX5NacN60P/zL9df6Pl15cr+f2snDWdwZSxuUAVBm10kPW6U21nCCrU0hMPhTRvs9jEL4IyKC2OdVWuv1P/v/yqiDAADY35aapbdz+frX39dZHkz6ZRogmAQKZ/AxqwAoxjoDJwYNCppl+WSuQhl6R8ztUojGH1VselbzSLFO+BMNV943AoYQihxDlIKhiQUjww/bIzUFwP/+5JkKwf0gF3Gq5psUi8miNEF6lQS0U0YDmmxQMEaIwEwC8AnSveO11Qlw8LdnOaAGSjRUQ/vl5la0g5AtnQqOBF0aSCbefq/69SjIoecNKKtfU/86n/Q27ekb+vlBD8vHIPm6qFEswqg+ALRM6LZtz3c3c4Wz2lDlESXEUhaifKHwSKMj/9vRv//x/QxuEtyT4kURmp+9ZsUipzSx3JiUKCExQlhgjpvgkdGnYMYVCrL4lSxyeOsSaDR0sj0WAZUxQzkrTJs0CLHeazwuvAMqk+KgVBwzAxmD6tWFfGGVUDJmDPgGz35ZtYWgIRT3VnaZiDfKaDFZC23zFlUVnAqRLF4xLqRICILdBP5cqb/X0BqKPqMWMkW+l/Wsha2n9GIg7AH6/mYeMvl4TJkR+AdIY81Qr3rZ2UqtiiW2zLPmJdIqg60WqrWQ0Y8VBlnE/9Sf8BPBBos61xx8bFWFP45cQfgGDBkfYAA4wgYOAGwXLMDGQIdEjAwoSBn9cuYEIuYygsSfh/KR94KMgZYxYQHw/km+02/MRiX1oYHRQeJJxOl//uSZCcChQtSxgtvL5QshEjoBepWEo0TGw3pT8C7ESMgF7VY5kyTAF5SyrKJ2VzzEG7vNKZ/dIVQJAl+u4WPt5YY8FJDfdXMOFEzemo8e7HSbeN3xNjeMuYPLfxSPffucPkI3+mUSGH+epNuqf0DYxAzf97f1P1AAAYEH5flLBpFHDPnYDcfiriw8rb2tuQkhyVuM3JCP/UoIQXhrOQm8KL/+xIJICAoV8O2rC90bisud6o1mkEACabahBaYGHGQh5rZwjwYVEbJqAhSfSqq9W5l3D7kFx0s5ZjwqHPK8Z3DavJDdGA6MD+2JqzEpudjmSTz6PsbtSPGYe+6/rRjFjXjfulvWsVyIw5U2su75l3dUfAeVhVf0THg/ZqsF+Ctj7EIDBtH/qp3/4xBKSFBK4qz5bgD5RFzwIBD+fOxn4dskkGomBOXPUseuq1vpEFFq8dhw4Vp6PsXg55qKCmUb+XLrQzUv5EEQAQaVgLuCQZbkD+w19JF28TPPAJRaPQdCyCegMIrJYnA1w8AWsaGIFQ4OyThIFfqOXrRbk84XTwiDv/7kmQdg7TAVsUrcBcwMERYuAHrSBQVcxIOba3AuhRiQAw1UB0vRAAkx5S591m1SRy7BKthIwBGXQoQZxDe92jFByFNnf3L0Q44HqtjJ7OYoD5Fjx9m77a5PIu3FyidGOG0jRZp6z/UYMp3/+Popt51PmXT+ocu2pA7rNIaZO1/6wAAJAD6axcoxIxcIuH4oxcH01Y7pfHG27+YIVt7W5PaXGT/qv4kAQeAi29ePce/+l8VJq6WzLZVBduzdjzdxEFDP9MMKAoQjJgigechkQMWzNw1USb1aXsAMNIzPJVeUZbFhNkoobqGuVYWNA3wcLGOH/evV7FmOhYDbmyk0CADFp+bVu/OhCWni6zxY6H0C5CVUyVJkFIpGgKMLJ0BdNvVx6urWoJkF5Y2QZIdXUZV93OzheV1bN1jhN7OtBvnurf1mJTVW1qVvXVnTF1d2u7TgNFoFE4bn+QCCCIUtUlXqZSzFS1KUzrqQRE1RLpmmqu2smD3GwKStZ//vPV/8opsqE5xHV1ST0ttTUy8QiBzOfMHJOAJWjZS1eIKAjMdIeD/+5JkEI/UbVLFA3ltMDKmiJEF7VQRjYESDmY0wK2aIoAXqVCLOb+KVg4QPPOkS5DHrdAzMzionK21pM1Hlp5Z583H85XkX0bsl+caiSEvwnMIbNJll79w3lsmBeD1e3niwCNI9MilD25ePu66xjmS0TqQxABlP7r+lUY/2Uqw5xdLW5zf1d6/dZS1I9q9p79YQfvu3Ag1chgP5inqU5WvWgtq3qTRM71FtdBNQ7HmB9/1LCvOiJZ03Sqt55Sb7f//mTJbqirE1yQLJaerzj3QKkENTASPaxAUFzb4QRRiRgpxo06sTLdCEZHIC8GB1p1iNSsYCI1XEjEuzxjQ9nIpZVoq9FySSxIqDqAxZ1Ya347gAA9O7FoEy4kFzw0H/W7loM7HZUaksyf5q/uQg7c4fOAN4wqTv5qucq/6Qm0f29K6uroetrT9TPzP/7Oyua/ryhkgoRgxnUeOhibZ1Yxe11KZjEi94rDQQBqdOh4gQVhDNVP+dv///qVpADAQAUl+aqNZx3ezyxXMstYQ1FoBwgCQIyAdMRGIgtwdlpZbpIfW//uSZBOA9IJIRktzPqAsJAiQBwpUEuF1Eq5ptMCjmiJAF6lQgYKagRxYFKa16w0oyEPk+cLxsSNg0PXbMzZdpHdj0yQAMrmg4AFGNUjegE+kBKxCqkNDJA8CSaWp84UQ/EbFZSN/bWfdCtQBgTd1NLgNI1sf0OlV0T31AkJRvjosQYcs1lwjkCPz2n6KfxfwYbUY1Xs54kKEmNEO7qzzWyIamWKpEtxue1u9YYBdgdOkrdBX/5lP//1AgACvO1GsSeJfIL+4JbEVAOYGeYgAYyHDDxVNRAhOZdoNb7E5qJuAkeYWBpyMvEQPg7KEx50TBRpbYU451Rdj/6/+ejwi3MAwA3KDRSYNEK/5Yy4QOIy8z81fJgIEC0pSm1ptYLuIhpEEW7drEokg7UQbopui8eoX82ZSBx/L+f6vZ88MT6T3S0/pW7E9f1UPr+Yuu0n9H6/sh0YslE5/B0C5lFRF6nLROUH76tFRBJVf8wLkXBxGUz/v6///oUoqAEAHIddJwuTDsSHdWtKU0jTHYSLn7NLIDeBNX4cBmNXQcDLgv1YaKv/7kGQUD/SEUsUreW0wK6aIgAIKKhGFSxINbbTQiJEiAAwpUBgdcUCQC71FKJKWBDe9ciUL3k+1U2P9/ffrEp0SrLegBjR11jUMWq1OSkteRQNtLrXl4BxjJV+hUgWC9QOCdf5eZSs4iJkaFxkSTC6JqWpmtnnU//58cRQ+9Dq6qu1yaU9Qn/PQmN6hV/dEWyLQLEVnMwiCgjTuhu1qvY8Wl5KpxGUFddvkQwJw4ezlm+m33///I2RQPE/0A7vw5/LtSNrCHnhBEQLkTAbjTp2VsBC7QvnOORAa6DCkTN72tSmYqxgQhp1osmvDbWIpdHQNQvu6+t1RkGQsiaIrY2MGRN4kX0m+3LbsrFk8ps5HQPRaXXn7uP4vaxuv9ZF9mNAfWdKiFtS2ZW83pP9/nSVMijQ7X67/3rRP6gtT30sfb1RtZmgfHUcd7ncSoqXuiq1N32zypImmQZ7zV+gwFUEkVC3kf/3VAEAOUCrsiVBO3rM9IoZZ8OAzHfy4rBzXFwncvkwYsypFDeagBxGvoim1iN/nKNZDAWcUPMUoGkwm0P/7kmQdC/SSYEUrW1VALCQIgAWHVBP1gQ8NQPyIs5AhwAaoqMAKF8o+9OYULjJWw+s52VkmHHA0bQ7PSykmX3gu1Xv5zRAAvPnl3eH733WCCLeUC29K8x6ZguC05VIuCY1v1ZFr/5g+Jhv/Vsv1/6Jt2/Nru67R5tePw1v/L/ga1sRXL0LQYLzlp2tsww/dRsYOq7O3oYF3BF6PR3/qnmf/9v/3//V/RQBl2UNJTihUDSGrS1cZ1xjPLhJ+g6AVJqyEvLWncicTRVhl7YgaCORDfLPCpNsIPf1fq6jlIrhKTImfMNYSqNy25GwILd6Lm3qLskdizNP8CRkVi1zLE6G1hm3Roo0q5wjxV2RGEzXqsShk7Wm4oizI/L4JpL0mVr56nf61OhUNXdWOe7Ts5EtrUVhI2tDlsi7s6TGPVSaFpdeYmeS6a3yr0BWWIcvlNcOyJlF+6W8oW6uokusvtdaOIIZBxAh8tt6+3I///3dX///V6doBECABhKhXLSO7OSuE8xxs5xwAnHa0OmRqRGm1N+ZYpLpbHpKww4I6Fc1O00T/+5JkFoD0lldEy1MusirkCHAB50YQiYMZjLz4wKWQIcAXnVBOBcm76ocLhUIkxK3h/flN3K0MDIacIEDQzJ+ZzoNDlMrmzTgGCIUEfZTrtdjwRGIctI+UltulYyb1kwM3oswdwrLU3VQi3utJe6CACuyWTbt0b1xFf0Dydy3Nfj41JIW/7l1v/5Pqxc352vHLvENIg1kWv6+UN63FB5Qk7fSwCRGDjbNDkJ/+3R/////V//9YBRJAgELa7smuyCc5O1+cwzlAoQTAW5STU02wWBRWJqneBuwm5Cctzl1DwGYw5SMWt3CwWvb8v+MW9TrWFIG8y2zbNhPJ91/uANh61/v/f1h0DvYs9cJTW84tbHzXXQkAc6PnDDv/LshNPvpYbhUZp9ud7/zS7Vv31XREnt6jC0MWBomT+D+URKpFfamxXllvb0dfn07DbMVqW5wqJBmR8sY/d9lX/rR6f///9HsqAAAgQkBxYi40Bwm7GqTHKrNNxNjNXS0ogKB12FSMTVKMX6W3OiMKclywaU0EtlCgx54Cv4bXBYlQ4dT4s7w///uSZB+OZN9Sw8tYVqIvBBhgBedUEjVLDg1BXgC4kCHgFZVQc1Z3Qo2vWzo0j0enOZ2O1RIctrUH8kpyKs7nf+rzLtupJiAKEG84MitnX//ceZ7x6hiRMblQJyW1u8h3tanacOTm5661LG9zuajOSco84zlqv6FeEAk8TH3momf7Kv54LjQqldm8qdenVTq60Y/unTKqe7/vYLDgY35+Jle1a+RGf+r+aLf//2K/d9Wda2/E7uNznM87EWOYnKzrDRGYMmJg1s4PS0uFd/FzgAsbd9DeuY2lFTaBYOqNlr9KgkaCzcrzq167/yu+2WFlQCZbcmFGabHvhwWN093u3qn9Wc96x5h2tWsjVBygojmS36JZzGx6EJiNIwaXVU3TKVOXXRuojFC2lLboZWlbdypIULrHQ6s5PWuaLMNX17Re9tgU7VFQOILHpB8qBgUX1/21I1VTYxX/1iwqGU/r+v2pR81f+v+lF4b6q7f/T2UAACE53qHpDO4009vPKhUcMHsT4ayXQKOz+yQDZsNzErcARhBuCxW1zWNciV0fYlW9uP/7kmQZCPPfRkTDUhagKeQYYAUlVBEVFw4tPPoIyRAhQBAcILUO8x/6sVg+4oY9EbNaECsFs89QWyOpoaRE1o72eySROh9VSxWl+xuhvHDzpIFHWzUt1/onYEADaors3RrbGkql1GmjzFdYsqVROv+xyyxLO+AICf6J5+j6cSiTdE1eCjgWuv9XRpq//SFvyH662//1SyukA9Q7UbWlrSnPuVWVJam//hBlRYEJTHjn4cE2w2D8NZygQlzBp3Kpfx02EywCzuls5WFOP7+sKzCJ7icchVQAFkFqxVtprAPUPj2rx0A8X2da0ZHG4FalCddXsUTPdSIOHNucFnav//qtJg+QLf+AnutueZl8IP2eKju+DCx1agYT4A/MpNBscuZIK4qGpJDQEAWevp6dr/jqnq6f0OKDFu1KUletNqlxVFl13lk7not8cqlduqKMTtTuYqzvsi72tIrmeOcsXWf6GNZ2QGVIg95ClbDTyH/z+o+5ck6Z5z+Z2NvAQi7FJPY/BCWP/zfbC+oElYMFsDfIyAUmTzt/HdlgTFqPHLp0Byj/+5JkJ48EeFLCg01XAiqECFAoI4gSrVkIDkR6yK+QIeQjicC+7vuzU4/H7mkRfzGWXLHnJUZBdnIlQyHHSiomPd82uyXj0suxp76Z6rZKGnzMacp7jZR2F/Yu/9fPbIRPJdBD8/ttGxw+fQHFTOvOv/Mjhqb/SKWiLbW+r34UH717fr/r0/+vb0OiLZX+jHKWuthyp+NLMPWMA4xTDjAwIFQKFBYZGDbZ4mzxlUWpcOFUECRocWmq6pYkiFP371awxhLHPefPygJq0wSA6TvWOCgEaIqZJmTsZuy2LAhciWyb11NFpGLrUtaCkqTLr84O42UmowD/mtaJ7WmzUmeFmRSEUgxsxc9+HWzmUzzVRM0ZQS4pvNpZNK608W9WFFYY2iO3SUAuIIDNStbkeNOG4LkPtX1XXt+e3P/ZBv96v0a/X9/6dbf+nOLLI/dzdrqQM5JLYnelWG+xqda0ghNpxwcwqpgwQ+Q12o9DgLjTNJPxhG8O5pMeYzr4lr98puaepLHDDfdbqymcSvdy0CTFuSKzKLcZZPM3crnaDyct57qo//uSZCkNBHxFwgt5W3IjQWhoBCMAEkWdBk2sfMivgGHwEIgAlSmi8friVrdVO+p4n5MT29umgZzVR/W6ttujq566pMythko9GZRbUdcyo5+zE/NUVap7E7DNPy1sZduO2ME2AiADz7TnLudv4wmlvtUNVqFPLBjurfs0/p0/6ei72/1/rUjHV2t9Jykx5Tv4kWcsvhDmrgv+Z6IPbSAkM7hc7wlFTFQ9+rOWGoBMWCJD783feIrANb1l+FvubJbr9iI7TXpMpm9bVhp5dV7ZwJzXf7v55KRhuOthtU+/mY4dmJZLHS4wj544mDrGM+WMhzffZTJ98X7cm5vMmi6G8iI+pvWzNKex1yJjEGpdj1iaemDkQ2q2SCWAIhgZU5C4mwiTpYKH29OriyvGOq28t/uYjMvQv/Xt7+vWvaxnu3s0u64hAA3JZiB8p+/nZqyx8SoCGY6xe6uWAMMLJ9+RQDius7ENscNJBpHUq8zeAZB7+T9RalyTxuW8f1lhu480raSFCYiBpbT5Yccrd3fdKgPBB0xen+6IYwY8K1DT0wx7Wf/7kmQviAR4TEGTax8SKSF4QAQCQA303RFA5WvAnYAhpBCISP7aEVqhghGivH1Tr7I0RgevKCC+PYpHUuP2OQqTMf1eg8bBHlax3dL3k6C89/0Qq4u7jjSMkogSzqLNKX4evWDC4MO2d3uOeljdmU3OzeX91dk79H9HYnv0lI4okSiMjBGTiCJ9THnJhYVFAcbbzXlR5fzTRhJiW5cyuVguNf3LL1yNyn+Z6+7Zv8jNyXBxQMG9Npo6SazObhEHPMap2XXHA0xbTsfuv4h0dSlU/OeOMZsTrAKWoMSvWsm08M1oQpUUiPkdp0MItqRAUASBKuMpYHkhTAi9NfooQm7hjb7be+u3RtnFa9H93/6v1fv19FUIAAfexpcc8d75dljhnxCJByx4kY7FPZy3/1FMxVONY9x7cLy3sLWHZvuXcP1lzvx7sGFmR9U5z33vZgWI/37aa3t5CvfTarZ1t5tj7mGTETlLPmbdFpmf1P3zLSEo5xDicYmIUEc2JbkcIla3hSnbPKwH2w5uSMq53sNnwqKMMQmpMfGaqUFHmFn8isH/+5JkRofz7l1BKysesjFhd9AEAzAN2TUEAORryGgAHAAAAABcq6WAoahIFS2tx7LHg0RbU9f/lvWMDv/hrW6Sq/xE/O/0jOyCbRkN8DLoS6pc3axw/D88KdyTNEo8P79ZFKj+z3tXDeWGPcd9zu4bWkPZxGEOfLA2TWmSOdCia+wRGN8lznGPHvmaXeqZ+MEKocUj0M52l5F6elNlcHDof3Dtdv3uUnQ3RPNjmsYrR+CAdNK1/tHakf/+tLNg3//79SG7T///sG60//+pDdICAACHrlvmvbX3WimAU1tpJjrb61WsAWABNHq5JyJMWPMbQ1SxEOsgDAKHStmf2+UqGfK2xrGuyqUqw1yY+e2xk1WG3AIyUWLjuL7woK14U803rpoQLliK4NhFRX9JDcnhWP4scG//////////6gIWTYeZJiEaD4fKI2NzcaIiqVrEIiB0HBguQI2HuaVVBB0eWWyysFBA6joZGslIyZZahkyhgoIEHRyMmVY5H/so15ISIqUURsPZJiERDIyMLsNu2MlkwTM/FhVkVZxX//xUVFuo//uSZGmE4y09QEGFHbIIYAdwBAAADLkAqCSNNwCyAFTEEAAAWCbMWFf/rZrFRa9Yo3//iwuzFhXrZ/8Vbioo3FRb/4sLsSAhYVDJkJC4qZqFakxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5BkQQ/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5BkQQ/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kGRBD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kGRBD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQZEEP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5BkQQ/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAASqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqTEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpUQUcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAyMDIzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==');
                audio.volume = NOTIFICATION_VOLUME;
                audio.play().catch(() => { });
            } catch (ee) { /* noop */ }
        }

        function startNotificationSound() {
            if (_notificationSoundInterval) return;
            playBeep();
            _notificationSoundInterval = setInterval(() => playBeep(), NOTIFICATION_BEEP_INTERVAL_MS);
        }

        function stopNotificationSound() {
            if (_notificationSoundInterval) {
                clearInterval(_notificationSoundInterval);
                _notificationSoundInterval = null;
            }
        }

        function updateNotificationTitleAndSound() {
            try {
                const notifs = getNotifications();
                const pending = notifs.filter(n => !n.seen && n.changed).length;

                // Update tab badge
                const tabNotifs = document.getElementById("kick-drops-tab-notifs");
                if (tabNotifs) {
                    tabNotifs.textContent = `${t.changedIcon || "🔔"} (${pending})`;
                    tabNotifs.style.color = pending > 0 ? colors.orange : colors.gray;
                }

                if (pending > 0) {
                    // Notificacion del navegador solo cuando pending sube (nuevos cambios)
                    if (pending > _lastNotifiedPending) {
                        _sendBrowserNotification(pending);
                    }
                    _lastNotifiedPending = pending;
                    startNotificationSound();
                    setTimeout(() => {
                        document.title = `(${pending}) ${ORIGINAL_TITLE}`;
                    }, 100);
                } else {
                    _lastNotifiedPending = 0;
                    stopNotificationSound();
                    setTimeout(() => {
                        if (document.title.startsWith('(')) document.title = ORIGINAL_TITLE;
                    }, 1000);
                }
            } catch (e) {
                console.warn('Error actualizando titulo/sonido:', e);
            }
        }

        // =============================================
        // GESTION DE DATOS DE NOTIFICACIONES
        // =============================================

        function markNotificationSeen(identifier) {
            const notifs = getNotifications();
            let changed = false;
            // Extraer titulo del key (formato: "titulo|id") para fallback por titulo
            const titleFromKey = (identifier && identifier.includes('|')) ? identifier.split('|').slice(0, -1).join('|') : identifier;
            for (const n of notifs) {
                if (n.seen) continue;
                // Match por key exacto, por titulo del key, o por titulo directo
                if (n.key === identifier || n.title === titleFromKey || n.title === identifier) {
                    n.seen = true;
                    n.updatedAt = Date.now();
                    changed = true;
                }
            }
            if (changed) saveNotifications(notifs);
            updateNotificationTitleAndSound();
        }

        function markAllNotificationsSeen() {
            const notifs = getNotifications();
            let changed = false;
            for (const n of notifs) {
                if (!n.seen && n.changed) {
                    n.seen = true;
                    n.updatedAt = Date.now();
                    changed = true;
                }
            }
            if (changed) saveNotifications(notifs);
            updateNotificationTitleAndSound();
        }

        function deleteNotificationsByKeyword(keyword) {
            const notifs = getNotifications();
            const filtered = [];
            for (const n of notifs) {
                if (!n.title.toLowerCase().includes(keyword)) {
                    filtered.push(n);
                }
            }
            saveNotifications(filtered);
            updateNotificationTitleAndSound();
        }

        function removeNotificationsNotInKeywords(keywords) {
            const notifs = getNotifications();
            const filtered = [];
            for (const n of notifs) {
                let found = false;
                for (const kw of keywords) {
                    if (n.title.toLowerCase().includes(kw)) {
                        found = true;
                        break;
                    }
                }
                if (found) filtered.push(n);
            }
            saveNotifications(filtered);
            updateNotificationTitleAndSound();
        }

        // =============================================
        // HELPERS GENERICOS DE UI (MODALES, BOTONES)
        // =============================================

        function createButton(label, color, onClick, inline = false) {
            const btn = document.createElement("button");
            btn.textContent = label;
            Object.assign(btn.style, {
                padding: "6px 10px",
                backgroundColor: colors.surface,
                color: color,
                border: `1px solid ${color}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                marginTop: inline ? "10px" : "0",
            });
            btn.onmouseenter = () => { btn.style.opacity = "0.8"; };
            btn.onmouseleave = () => { btn.style.opacity = "1"; };
            btn.onclick = onClick;
            return btn;
        }

        function setInertOnBodyChildrenExcept(overlay, inert) {
            if (inert) {
                const saved = [];
                Array.from(document.body.children).forEach((el) => {
                    if (el === overlay) return;
                    saved.push({ el, ariaHidden: el.getAttribute('aria-hidden'), tabIndex: el.hasAttribute('tabindex') ? el.tabIndex : null });
                    try {
                        el.setAttribute('aria-hidden', 'true');
                        el.inert = true;
                    } catch (e) { /* noop */ }
                });
                overlay._savedInert = saved;
            } else {
                const saved = overlay._savedInert || [];
                saved.forEach((s) => {
                    try {
                        if (s.ariaHidden === null) s.el.removeAttribute('aria-hidden');
                        else s.el.setAttribute('aria-hidden', s.ariaHidden);
                    } catch (e) { /* noop */ }
                    try {
                        if (s.tabIndex === null) s.el.removeAttribute('tabindex');
                        else s.el.tabIndex = s.tabIndex;
                        s.el.inert = false;
                    } catch (e) { /* noop */ }
                });
                overlay._savedInert = null;
            }
        }

        function closeOverlayAnimated(overlay) {
            return new Promise((resolve) => {
                try {
                    overlay.style.opacity = '0';
                    const box = overlay.firstChild;
                    if (box) {
                        box.style.transform = 'translateY(-8px) scale(0.98)';
                        box.style.opacity = '0';
                    }
                } catch (e) { /* noop */ }
                setTimeout(() => {
                    try {
                        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
                    } catch (e) { /* noop */ }
                    try { setInertOnBodyChildrenExcept(overlay, false); } catch (e) { /* noop */ }
                    resolve();
                }, 220);
            });
        }

        function createModalContainer() {
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '99999',
                transition: 'opacity 180ms ease', opacity: '0',
            });
            const box = document.createElement('div');
            Object.assign(box.style, {
                backgroundColor: colors.surface, color: colors.text, borderRadius: '14px',
                padding: '28px 32px', minWidth: '340px', maxWidth: '520px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: `1px solid ${colors.primary}`,
                fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px',
                transition: 'transform 180ms ease, opacity 180ms ease',
                transform: 'translateY(8px) scale(0.98)', opacity: '0',
            });
            overlay.appendChild(box);
            return { overlay, box };
        }

        function showInputModal(message, defaultValue = '') {
            return new Promise((resolve) => {
                const { overlay, box } = createModalContainer();
                const msg = document.createElement('div');
                msg.textContent = message;
                msg.style.marginBottom = '8px';
                box.appendChild(msg);

                const input = document.createElement('input');
                input.type = 'text';
                input.value = defaultValue || '';
                Object.assign(input.style, {
                    width: '100%', padding: '8px', marginBottom: '10px',
                    boxSizing: 'border-box', borderRadius: '4px',
                    border: `1px solid ${colors.primary}`,
                    background: colors.bg, color: colors.text,
                });
                box.appendChild(input);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'center';
                actions.style.gap = '8px';

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = t.cancel || 'Cancel';
                Object.assign(cancelBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.red, border: `1px solid ${colors.red}`, borderRadius: '6px', cursor: 'pointer',
                });
                cancelBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve(null)); };

                const okBtn = document.createElement('button');
                okBtn.textContent = t.accept || 'Accept';
                Object.assign(okBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '6px', cursor: 'pointer',
                });
                okBtn.onclick = () => {
                    const v = input.value;
                    closeOverlayAnimated(overlay).then(() => resolve(v));
                };

                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                box.appendChild(actions);

                // focus trap
                const focusable = [input, cancelBtn, okBtn];
                let fi = 0;
                focusable.forEach((el, idx) => el.tabIndex = idx + 1);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        if (e.shiftKey) fi = (fi - 1 + focusable.length) % focusable.length;
                        else fi = (fi + 1) % focusable.length;
                        focusable[fi].focus();
                    }
                });
                [cancelBtn, okBtn].forEach((el) => el.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        if (e.shiftKey) fi = (fi - 1 + focusable.length) % focusable.length;
                        else fi = (fi + 1) % focusable.length;
                        focusable[fi].focus();
                    }
                    if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
                }));

                document.body.appendChild(overlay);
                try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
                setTimeout(() => {
                    overlay.style.opacity = '1';
                    try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
                }, 10);
                setTimeout(() => input.focus(), 120);
            });
        }

        function showConfirmModal(message) {
            return new Promise((resolve) => {
                const { overlay, box } = createModalContainer();
                const msg = document.createElement('div');
                msg.textContent = message;
                msg.style.marginBottom = '12px';
                box.appendChild(msg);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'center';
                actions.style.gap = '8px';

                const noBtn = document.createElement('button');
                Object.assign(noBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.red, border: `1px solid ${colors.red}`, borderRadius: '6px', cursor: 'pointer',
                });
                noBtn.textContent = t.no || 'No';
                noBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve(false)); };

                const yesBtn = document.createElement('button');
                Object.assign(yesBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '6px', cursor: 'pointer',
                });
                yesBtn.textContent = t.yes || 'Yes';
                yesBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve(true)); };

                actions.appendChild(noBtn);
                actions.appendChild(yesBtn);
                box.appendChild(actions);

                // focus trap
                const focusable = [noBtn, yesBtn];
                let fi = 0;
                focusable.forEach((el, idx) => el.tabIndex = idx + 1);
                focusable.forEach((el) => el.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        if (e.shiftKey) fi = (fi - 1 + focusable.length) % focusable.length;
                        else fi = (fi + 1) % focusable.length;
                        focusable[fi].focus();
                    }
                    if (e.key === 'Escape') { e.preventDefault(); noBtn.click(); }
                }));

                document.body.appendChild(overlay);
                try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
                setTimeout(() => {
                    overlay.style.opacity = '1';
                    try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
                }, 10);
                setTimeout(() => yesBtn.focus(), 120);
            });
        }

        function showAlertModal(message, html = false) {
            return new Promise((resolve) => {
                const { overlay, box } = createModalContainer();
                const msg = document.createElement('div');
                if (html) { msg.innerHTML = message; } else { msg.textContent = message; }
                msg.style.marginBottom = '12px';
                box.appendChild(msg);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'center';

                const okBtn = document.createElement('button');
                Object.assign(okBtn.style, {
                    padding: '6px 10px', backgroundColor: colors.surface,
                    color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '6px', cursor: 'pointer',
                });
                okBtn.textContent = t.accept || 'Accept';
                okBtn.onclick = () => { closeOverlayAnimated(overlay).then(() => resolve()); };
                okBtn.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') { e.preventDefault(); okBtn.click(); }
                });

                actions.appendChild(okBtn);
                box.appendChild(actions);
                okBtn.tabIndex = 1;

                document.body.appendChild(overlay);
                try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
                setTimeout(() => {
                    overlay.style.opacity = '1';
                    try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
                }, 10);
                setTimeout(() => okBtn.focus(), 120);
            });
        }

        // =============================================
        // COMPONENTES DE UI ESPECIFICOS
        // =============================================

        function createEditKeywordsButton(inline = false) {
            return createButton(t.editKeywords, colors.primary, () => {
                (async () => {
                    const current = getStoredKeywords().join(", ");
                    const input = await showInputModal(t.editPrompt, current);
                    if (input !== null) {
                        const newKeywords = input.split(",").map((k) => k.trim().toLowerCase()).filter((k) => k.length > 0);
                        setStoredKeywords(newKeywords);
                        removeNotificationsNotInKeywords(newKeywords);
                        showAlertModal(t.keywordsModified + newKeywords.join(", ") + "\n" + t.reloading);
                        setCollapseFlag(false);
                        setTimeout(() => location.reload(), 1500);
                    }
                })();
            }, inline);
        }

        function createResetKeywordsButton(inline = false) {
            return createButton(t.resetKeywords, colors.orange, () => {
                (async () => {
                    const ok = await showConfirmModal(t.confirmReset);
                    if (ok) {
                        resetKeywords();
                        resetInventoryDeletedKeys();
                        resetNotifications();
                        showAlertModal(t.keywordsRestored);
                        setCollapseFlag(false);
                        setTimeout(() => location.reload(), 1500);
                    }
                })();
            }, inline);
        }

        function createReloadButton(inline = false) {
            return createButton(t.reload, colors.gray, () => {
                setCollapseFlag(false);
                resetInventoryDeletedKeys();
                resetNotifications();
                if (!location.pathname.includes("/all-campaigns")) {
                    location.href = "https://kick.com/drops/all-campaigns";
                } else {
                    location.reload();
                }
            }, inline);
        }

        function getAddKeyword() {
            const addBtn = document.createElement("button");
            addBtn.textContent = t.addButton || "+";
            Object.assign(addBtn.style, {
                color: colors.primary,
                cursor: "pointer",
                border: "1px solid " + colors.primary,
                backgroundColor: colors.surface,
                borderRadius: "4px",
                padding: "2px 6px",
                fontWeight: "bold",
                fontSize: "11px",
            });
            addBtn.title = t.addKeyword;
            addBtn.onclick = () => {
                (async () => {
                    const newKeyword = await showInputModal(t.addKeyword);
                    if (newKeyword) {
                        const k = newKeyword.trim().toLowerCase();
                        if (!keywords.includes(k)) {
                            keywords.push(k);
                            setStoredKeywords(keywords);
                            setCollapseFlag(false);
                            location.reload();
                        }
                    }
                })();
            };
            return addBtn;
        }

        function createInventoryCheckboxes(inline = false) {
            const container = document.createElement('div');
            Object.assign(container.style, {
                display: 'flex', flexDirection: 'column', gap: '6px',
                marginTop: inline ? '10px' : '0',
            });

            const makeCheckbox = (id, labelText, initial, onChange) => {
                const wrapper = document.createElement('label');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '6px';
                wrapper.style.cursor = 'pointer';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = id;
                cb.checked = !!initial;
                cb.style.width = '14px';
                cb.style.height = '14px';
                cb.style.accentColor = colors.primary;

                const txt = document.createElement('span');
                txt.textContent = labelText;
                txt.style.fontSize = '11px';
                txt.style.color = colors.text;

                cb.onchange = () => onChange(cb.checked);
                wrapper.appendChild(cb);
                wrapper.appendChild(txt);
                return wrapper;
            };

            const expiredCb = makeCheckbox('cb-hide-expired', t.hideExpired, cleanExpiredInventoryFlag, (checked) => {
                setInventoryExpiredFlag(checked);
                cleanExpiredInventoryFlag = checked;
                if (location.pathname.includes('/inventory')) {
                    if (checked) { cleanInventory("expired"); } else { setCollapseFlag(false); location.reload(); }
                }
            });

            container.appendChild(expiredCb);
            return container;
        }

        function showInfoModal() {
            const { overlay, box } = createModalContainer();
            const lines = [
                { label: t.scriptInfoName, value: "Kick Drops Highlighter + Keywords (Full + i18n)" },
                { label: t.scriptInfoVersion, value: SCRIPT_VERSION },
                { label: t.scriptInfoDescription, value: t.scriptInfoDescriptionText },
                { label: t.scriptInfoAuthor, value: "g31w0fw0rld" },
                { label: t.scriptInfoGitHub, value: "github.com/g31w0fw0rld/kick-drops-highlighter", isLink: true },
            ];
            const titleEl = document.createElement('div');
            titleEl.textContent = t.scriptInfoTitle;
            titleEl.style.fontWeight = 'bold';
            titleEl.style.fontSize = '16px';
            titleEl.style.marginBottom = '14px';
            titleEl.style.color = colors.primaryLight;
            box.appendChild(titleEl);
            lines.forEach(l => {
                const row = document.createElement('div');
                row.style.marginBottom = '8px';
                row.style.lineHeight = '1.5';
                const label = document.createElement('span');
                label.textContent = l.label + " ";
                label.style.fontWeight = 'bold';
                row.appendChild(label);
                if (l.isLink) {
                    const a = document.createElement('a');
                    a.href = "https://" + l.value;
                    a.textContent = l.value;
                    a.target = "_blank";
                    a.style.color = colors.primaryLight;
                    a.style.textDecoration = "underline";
                    row.appendChild(a);
                } else {
                    const val = document.createElement('span');
                    val.textContent = l.value;
                    row.appendChild(val);
                }
                box.appendChild(row);
            });
            const closeBtn = createButton(t.accept, colors.primary, async () => {
                await closeOverlayAnimated(overlay);
            });
            closeBtn.style.marginTop = '14px';
            box.appendChild(closeBtn);

            document.body.appendChild(overlay);
            try { setInertOnBodyChildrenExcept(overlay, true); } catch (e) { /* noop */ }
            setTimeout(() => {
                overlay.style.opacity = '1';
                try { box.style.transform = 'translateY(0) scale(1)'; box.style.opacity = '1'; } catch (e) { }
            }, 10);
        }

        // =============================================
        // FLOATING PANEL (Kick green theme)
        // =============================================

        function buildPanel() {
            const existing = document.getElementById("kick-drops-panel");
            if (existing) existing.remove();

            const panel = document.createElement("div");
            panel.id = "kick-drops-panel";
            Object.assign(panel.style, {
                position: "fixed", top: "70px", right: "16px", zIndex: "9999",
                backgroundColor: colors.surface, color: colors.text,
                border: `1px solid ${colors.border}`, borderRadius: "12px",
                padding: "0", fontFamily: "Inter, system-ui, sans-serif",
                fontSize: "13px", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                maxWidth: "390px", minWidth: "300px", maxHeight: "80vh",
                display: "flex", flexDirection: "column", overflow: "hidden",
            });

            // Header with gradient (Kick green)
            const header = document.createElement("div");
            Object.assign(header.style, {
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderBottom: `1px solid ${colors.border}`,
                cursor: "move", userSelect: "none",
                background: `linear-gradient(135deg, ${colors.primaryDark}22, ${colors.surface})`,
            });

            const titleEl = document.createElement("span");
            titleEl.textContent = "🎁 Kick Drops";
            titleEl.style.fontWeight = "bold";
            titleEl.style.fontSize = "14px";
            titleEl.style.color = colors.primaryLight;
            header.appendChild(titleEl);

            const headerBtns = document.createElement("div");
            headerBtns.style.display = "flex";
            headerBtns.style.gap = "6px";

            const infoBtn = document.createElement("span");
            infoBtn.textContent = "ℹ️";
            infoBtn.style.cursor = "pointer";
            infoBtn.style.fontSize = "14px";
            infoBtn.onclick = showInfoModal;
            headerBtns.appendChild(infoBtn);

            const collapseBtn = document.createElement("span");
            const isCollapsed = getCollapseFlag();
            collapseBtn.textContent = isCollapsed ? "🔽" : "🔼";
            collapseBtn.style.cursor = "pointer";
            collapseBtn.style.fontSize = "14px";
            headerBtns.appendChild(collapseBtn);

            header.appendChild(headerBtns);
            panel.appendChild(header);

            // Body
            const body = document.createElement("div");
            body.id = "kick-drops-panel-body";
            Object.assign(body.style, {
                padding: "10px 14px", overflow: "hidden", flex: "1",
                display: isCollapsed ? "none" : "flex", flexDirection: "column", minHeight: "0",
            });

            collapseBtn.onclick = () => {
                const collapsed = body.style.display === "none";
                body.style.display = collapsed ? "flex" : "none";
                collapseBtn.textContent = collapsed ? "🔼" : "🔽";
                setCollapseFlag(!collapsed);
            };

            // Keyword chips
            const kwSection = document.createElement("div");
            kwSection.style.marginBottom = "10px";
            const kwLabel = document.createElement("div");
            kwLabel.textContent = t.currentKeywords;
            kwLabel.style.marginBottom = "6px";
            kwLabel.style.fontSize = "11px";
            kwLabel.style.color = colors.gray;
            kwSection.appendChild(kwLabel);

            const kwChips = document.createElement("div");
            kwChips.style.display = "flex";
            kwChips.style.flexWrap = "wrap";
            kwChips.style.gap = "4px";

            const currentKws = getStoredKeywords();
            currentKws.forEach(kw => {
                const chip = document.createElement("span");
                chip.textContent = kw;
                chip.title = t.deleteKeywordTooltip;
                Object.assign(chip.style, {
                    padding: "2px 8px", backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`, borderRadius: "12px",
                    fontSize: "11px", cursor: "pointer", transition: "all 0.15s",
                    color: colors.text,
                });
                chip.onmouseenter = () => { chip.style.borderColor = colors.red; chip.style.color = colors.red; };
                chip.onmouseleave = () => { chip.style.borderColor = colors.border; chip.style.color = colors.text; };
                chip.onclick = () => {
                    (async () => {
                        const ok = await showConfirmModal(t.deleteKeywordQuestion + `"${kw}"?`);
                        if (ok) {
                            const updated = getStoredKeywords().filter(k => k !== kw);
                            setStoredKeywords(updated);
                            deleteNotificationsByKeyword(kw);
                            setCollapseFlag(false);
                            location.reload();
                        }
                    })();
                };
                kwChips.appendChild(chip);
            });

            // Add keyword button inline
            const addChip = document.createElement("span");
            addChip.textContent = "+";
            addChip.title = t.addKeyword;
            Object.assign(addChip.style, {
                padding: "2px 8px", backgroundColor: colors.bg,
                border: `1px solid ${colors.primary}`, borderRadius: "12px",
                fontSize: "11px", cursor: "pointer", transition: "all 0.15s",
                color: colors.primary, fontWeight: "bold",
            });
            addChip.onmouseenter = () => { addChip.style.backgroundColor = colors.primary; addChip.style.color = colors.bg; };
            addChip.onmouseleave = () => { addChip.style.backgroundColor = colors.bg; addChip.style.color = colors.primary; };
            addChip.onclick = () => {
                (async () => {
                    const newKeyword = await showInputModal(t.addKeyword);
                    if (newKeyword) {
                        const k = newKeyword.trim().toLowerCase();
                        if (!keywords.includes(k)) {
                            keywords.push(k);
                            setStoredKeywords(keywords);
                            setCollapseFlag(false);
                            location.reload();
                        }
                    }
                })();
            };
            kwChips.appendChild(addChip);

            kwSection.appendChild(kwChips);
            body.appendChild(kwSection);

            // Buttons row
            const btnRow = document.createElement("div");
            Object.assign(btnRow.style, {
                display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px",
            });
            btnRow.appendChild(createEditKeywordsButton());
            btnRow.appendChild(createResetKeywordsButton());
            btnRow.appendChild(createReloadButton());
            body.appendChild(btnRow);

            // Inventory checkboxes
            const invCbs = createInventoryCheckboxes();
            invCbs.style.marginBottom = "10px";
            body.appendChild(invCbs);

            // Tabs: Active | Expired | Notifications
            const tabBar = document.createElement("div");
            Object.assign(tabBar.style, {
                display: "flex", gap: "0", marginBottom: "10px",
                borderBottom: `1px solid ${colors.border}`,
            });

            const tabStyle = {
                flex: "1", padding: "6px 0", cursor: "pointer", fontSize: "11px",
                fontWeight: "bold", border: "none", borderBottom: `2px solid transparent`,
                backgroundColor: "transparent", color: colors.gray, textAlign: "inherit"
            };

            const tabActive = document.createElement("button");
            tabActive.id = "kick-drops-tab-active";
            tabActive.textContent = t.dropsActive;
            Object.assign(tabActive.style, { ...tabStyle });

            const tabExpired = document.createElement("button");
            tabExpired.id = "kick-drops-tab-expired";
            tabExpired.textContent = t.dropsExpired;
            Object.assign(tabExpired.style, { ...tabStyle });

            const tabNotifs = document.createElement("button");
            tabNotifs.id = "kick-drops-tab-notifs";
            tabNotifs.textContent = `${t.changedIcon || "🔔"} (0)`;
            Object.assign(tabNotifs.style, { ...tabStyle });

            tabBar.appendChild(tabActive);
            tabBar.appendChild(tabExpired);
            tabBar.appendChild(tabNotifs);
            body.appendChild(tabBar);

            // Scrollable tab content area (takes remaining space)
            const tabContent = document.createElement("div");
            Object.assign(tabContent.style, {
                flex: "1", overflowY: "auto", minHeight: "0",
            });

            // Active drops pane
            const activePane = document.createElement("div");
            activePane.id = "kick-drops-active-pane";
            tabContent.appendChild(activePane);

            // Expired drops pane (hidden by default)
            const expiredPane = document.createElement("div");
            expiredPane.id = "kick-drops-expired-pane";
            expiredPane.style.display = "none";
            tabContent.appendChild(expiredPane);

            // Hidden combined results container (used by renderResults internally)
            const results = document.createElement("div");
            results.id = "kick-drops-results";
            results.style.display = "none";
            tabContent.appendChild(results);

            // Notifications pane (hidden by default)
            const notifsPane = document.createElement("div");
            notifsPane.id = "kick-drops-notifs-pane";
            notifsPane.style.display = "none";
            tabContent.appendChild(notifsPane);

            // API loading indicator
            const apiLoadingEl = document.createElement("div");
            apiLoadingEl.id = "kick-drops-api-loading";
            Object.assign(apiLoadingEl.style, {
                display: _apiDataReady ? "none" : "flex",
                alignItems: "center", gap: "6px",
                padding: "6px 8px", marginBottom: "6px",
                backgroundColor: colors.orange + "15",
                border: `1px solid ${colors.orange}40`,
                borderRadius: "6px", fontSize: "11px",
                color: colors.orange,
            });
            const pulseDot = document.createElement("span");
            Object.assign(pulseDot.style, {
                display: "inline-block", width: "8px", height: "8px",
                borderRadius: "50%", backgroundColor: colors.orange,
                animation: "kick-pulse-dot 1.2s infinite",
            });
            apiLoadingEl.appendChild(pulseDot);
            apiLoadingEl.appendChild(document.createTextNode(t.readingApiDrops || "Reading drop changes from API..."));
            if (!document.getElementById("kick-pulse-dot-style")) {
                const style = document.createElement("style");
                style.id = "kick-pulse-dot-style";
                style.textContent = "@keyframes kick-pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }";
                document.head.appendChild(style);
            }
            body.appendChild(apiLoadingEl);

            body.appendChild(tabContent);

            // Tab helper: activate one tab, deactivate others
            function activateTab(activeBtn) {
                [tabActive, tabExpired, tabNotifs].forEach(btn => {
                    btn.style.borderBottom = `2px solid transparent`;
                    btn.style.color = colors.gray;
                });
                activeBtn.style.borderBottom = `2px solid ${colors.primary}`;
                activeBtn.style.color = colors.primaryLight;
                [activePane, expiredPane, notifsPane].forEach(p => p.style.display = "none");
            }

            tabActive.onclick = () => { activateTab(tabActive); activePane.style.display = "block"; };
            tabExpired.onclick = () => { activateTab(tabExpired); expiredPane.style.display = "block"; };
            tabNotifs.onclick = () => { activateTab(tabNotifs); notifsPane.style.display = "block"; };

            // Check if there are pending notifications to show that tab by default
            const pendingNotifs = getNotifications().filter(n => !n.seen && n.changed);
            if (pendingNotifs.length > 0) {
                activateTab(tabNotifs);
                notifsPane.style.display = "block";
            } else {
                activateTab(tabActive);
                activePane.style.display = "block";
            }

            panel.appendChild(body);

            // Drag support
            let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
            header.addEventListener("mousedown", (e) => {
                isDragging = true;
                const rect = panel.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                e.preventDefault();
            });
            document.addEventListener("mousemove", (e) => {
                if (!isDragging) return;
                panel.style.left = (e.clientX - dragOffsetX) + "px";
                panel.style.top = (e.clientY - dragOffsetY) + "px";
                panel.style.right = "auto";
            });
            document.addEventListener("mouseup", () => { isDragging = false; });

            document.body.appendChild(panel);
            return results;
        }

        // =============================================
        // CAMPAIGN CARD RENDERING (Kick-style)
        // =============================================

        // Scrolls the page so the campaign header (button with category image,
        // title, studio and date range) is centered, instead of centering the
        // full campaign container (which can be very tall when expanded and ends
        // up pushing the visible header off screen).
        function scrollToCampaignElement(node, block = "center") {
            if (!node) return;
            const header = node.querySelector('button[data-radix-collection-item]') ||
                           node.querySelector('button[aria-expanded]') ||
                           node;
            header.scrollIntoView({ behavior: "smooth", block });
        }

        // Finds a campaign node on the /all-campaigns page from a pending-click
        // descriptor ({id, title}). The id may be stale after re-scans (each
        // highlightAndLinkDrops clears and reassigns drop-match-* ids), so we
        // fall back to matching by display title against the freshly scanned
        // nodes.
        function findCampaignNodeFromClickInfo(info) {
            if (!info) return null;
            if (info.id) {
                const byId = document.getElementById(info.id);
                if (byId) return byId;
            }
            if (!info.title) return null;
            const wanted = info.title.toLowerCase();
            const scanned = document.querySelectorAll('[id^="drop-match-"]');
            for (const n of scanned) {
                const nameEl = n.querySelector('.text-base.font-bold') ||
                               n.querySelector('[class*="font-bold"]');
                if (!nameEl) continue;
                const nameText = nameEl.textContent.trim();
                const studioEl = n.querySelector('.text-secondary-onSecondaryVariant') ||
                                 n.querySelector('.text-start.text-sm');
                const studioText = (studioEl && studioEl !== nameEl) ? studioEl.textContent.trim() : '';
                const displayTitle = studioText ? `${nameText} - ${studioText}` : nameText;
                if (displayTitle.toLowerCase() === wanted || nameText.toLowerCase() === wanted) {
                    return n;
                }
            }
            return null;
        }

        function renderCampaignCard(campaign, isActive) {
            const accentColor = isActive ? colors.primary : colors.red;
            const card = document.createElement("div");
            Object.assign(card.style, {
                backgroundColor: colors.bg, border: `1px solid ${accentColor}`,
                borderRadius: "8px", padding: "10px", marginBottom: "8px", cursor: "pointer",
                transition: "all 0.15s",
            });
            card.onmouseenter = () => { card.style.boxShadow = `0 0 12px ${accentColor}40`; };
            card.onmouseleave = () => { card.style.boxShadow = "none"; };

            // Data attributes for notification bell removal
            if (campaign.title) card.setAttribute("data-notif-title", campaign.title);
            if (campaign.id) card.setAttribute("data-notif-id", campaign.id);

            // Header with image and name
            const cardHeader = document.createElement("div");
            cardHeader.style.display = "flex";
            cardHeader.style.alignItems = "center";
            cardHeader.style.gap = "8px";
            cardHeader.style.marginBottom = "6px";

            if (campaign.imgSrc) {
                const img = document.createElement("img");
                img.src = campaign.imgSrc;
                img.style.width = "36px";
                img.style.height = "48px";
                img.style.borderRadius = "4px";
                img.style.objectFit = "cover";
                cardHeader.appendChild(img);
            }

            const titleInfo = document.createElement("div");
            const nameEl = document.createElement("div");
            nameEl.textContent = campaign.title || campaign.gameName || '';
            nameEl.style.fontWeight = "bold";
            nameEl.style.fontSize = "13px";
            titleInfo.appendChild(nameEl);

            if (campaign.studio) {
                const studioEl = document.createElement("div");
                studioEl.textContent = campaign.studio;
                studioEl.style.fontSize = "11px";
                studioEl.style.color = colors.gray;
                titleInfo.appendChild(studioEl);
            }

            if (campaign.dateRange) {
                const dateEl = document.createElement("div");
                dateEl.textContent = campaign.dateRange;
                dateEl.style.fontSize = "10px";
                dateEl.style.color = colors.gray;
                titleInfo.appendChild(dateEl);
            }

            cardHeader.appendChild(titleInfo);

            // Changed indicator (bell icon)
            if (campaign.changed) {
                const bell = document.createElement("span");
                bell.className = "drop-bell-icon";
                bell.textContent = t.changedIcon || "🔔";
                bell.style.color = colors.orange;
                bell.style.marginLeft = "auto";
                bell.style.fontSize = "14px";
                bell.style.fontWeight = "bold";
                cardHeader.appendChild(bell);
            }

            card.appendChild(cardHeader);

            // Keywords matched chips
            if (campaign.matchedKeywords && campaign.matchedKeywords.length > 0) {
                const kwRow = document.createElement("div");
                kwRow.style.display = "flex";
                kwRow.style.flexWrap = "wrap";
                kwRow.style.gap = "3px";
                kwRow.style.marginBottom = "4px";
                campaign.matchedKeywords.forEach(kw => {
                    const chip = document.createElement("span");
                    chip.textContent = kw;
                    Object.assign(chip.style, {
                        padding: "1px 6px", backgroundColor: accentColor + "20",
                        color: accentColor,
                        border: `1px solid ${accentColor}40`,
                        borderRadius: "8px", fontSize: "10px",
                    });
                    kwRow.appendChild(chip);
                });
                card.appendChild(kwRow);
            }

            // Reward items (only for active drops) - from DOM or API fallback
            // if (isActive) {
            //     if (campaign.rewards && campaign.rewards.length > 0) {
            //         const rwRow = document.createElement("div");
            //         rwRow.style.display = "flex";
            //         rwRow.style.flexWrap = "wrap";
            //         rwRow.style.gap = "4px";
            //         rwRow.style.marginBottom = "4px";
            //         campaign.rewards.forEach(rw => {
            //             const rwChip = document.createElement("span");
            //             const time = rw.time.split(" ").slice(1).join(" ");
            //             rwChip.textContent = rw.name + (rw.time ? ` (${time})` : '');
            //             Object.assign(rwChip.style, {
            //                 padding: "1px 6px", backgroundColor: colors.surface,
            //                 color: colors.gray, border: `1px solid ${colors.border}`,
            //                 borderRadius: "6px", fontSize: "10px",
            //             });
            //             rwRow.appendChild(rwChip);
            //         });
            //         card.appendChild(rwRow);
            //     } else {
            //         // API fallback when DOM rewards are not available
            //         const apiDrops = _findDropNamesForTitle(campaign.title);
            //         if (apiDrops && apiDrops.length > 0) {
            //             _appendDropNamesTo(card, apiDrops);
            //         }
            //     }
            // }

            // Click to scroll to element on page
            card.onclick = () => {
                if (campaign.element && document.contains(campaign.element)) {
                    scrollToCampaignElement(campaign.element, "center");
                } else if (campaign.id) {
                    const target = document.getElementById(campaign.id);
                    if (target) {
                        scrollToCampaignElement(target, "center");
                    }
                }
                // If not on campaigns page, navigate there
                if (!location.pathname.includes("/all-campaigns")) {
                    const campaignsLink = document.querySelector('a[href="/drops/all-campaigns"]');
                    if (campaignsLink) {
                        divIdClickAfterClick = campaign;
                        campaignsLink.click();
                    }
                }
            };

            return card;
        }

        // =============================================
        // RENDER RESULTS IN PANEL
        // =============================================

        function renderResults(resultsContainer, activeItems, expiredItems) {
            // Render into separate panes (Active tab / Expired tab)
            const activePane = document.getElementById("kick-drops-active-pane");
            const expiredPane = document.getElementById("kick-drops-expired-pane");
            const tabActive = document.getElementById("kick-drops-tab-active");
            const tabExpired = document.getElementById("kick-drops-tab-expired");

            const totalActive = activeItems.length;
            const totalExpired = expiredItems.length;

            // Update tab labels with counts
            if (tabActive) tabActive.textContent = `${t.dropsActive} (${totalActive})`;
            if (tabExpired) tabExpired.textContent = `${t.dropsExpired} (${totalExpired})`;

            // Active pane
            if (activePane) {
                activePane.innerHTML = "";
                if (totalActive === 0) {
                    const msg = document.createElement("div");
                    msg.textContent = "\u2713 " + t.noResults;
                    msg.style.color = colors.gray;
                    msg.style.fontSize = "12px";
                    msg.style.padding = "12px 0";
                    msg.style.textAlign = "center";
                    activePane.appendChild(msg);
                } else {
                    activeItems.forEach(c => {
                        activePane.appendChild(renderCampaignCard(c, true));
                    });
                }
            }

            // Expired pane
            if (expiredPane) {
                expiredPane.innerHTML = "";
                if (totalExpired === 0) {
                    const msg = document.createElement("div");
                    msg.textContent = "\u2713 " + t.noResults;
                    msg.style.color = colors.gray;
                    msg.style.fontSize = "12px";
                    msg.style.padding = "12px 0";
                    msg.style.textAlign = "center";
                    expiredPane.appendChild(msg);
                } else {
                    expiredItems.forEach(c => {
                        expiredPane.appendChild(renderCampaignCard(c, false));
                    });
                }
            }
        }

        // =============================================
        // NOTIFICATIONS TAB (inside panel)
        // =============================================

        function removeBellFromCard(notifTitle, notifId) {
            ["kick-drops-active-pane", "kick-drops-expired-pane"].forEach(paneId => {
                const pane = document.getElementById(paneId);
                if (pane) {
                    pane.querySelectorAll("[data-notif-title]").forEach(card => {
                        const cardTitle = card.getAttribute("data-notif-title") || "";
                        const cardId = card.getAttribute("data-notif-id") || "";
                        if ((notifTitle && cardTitle === notifTitle) || (notifId && cardId === notifId)) {
                            const bell = card.querySelector(".drop-bell-icon");
                            if (bell) bell.remove();
                        }
                    });
                }
            });
        }

        function removeAllBellsFromCards() {
            ["kick-drops-active-pane", "kick-drops-expired-pane"].forEach(paneId => {
                const pane = document.getElementById(paneId);
                if (pane) {
                    pane.querySelectorAll(".drop-bell-icon").forEach(bell => bell.remove());
                }
            });
        }

        function renderNotificationsTab() {
            const notifsPane = document.getElementById("kick-drops-notifs-pane");
            if (!notifsPane) return;
            notifsPane.innerHTML = "";

            const notifs = getNotifications();
            const pending = notifs.filter(n => !n.seen && n.changed);

            // Update tab label with count
            const tabNotifs = document.getElementById("kick-drops-tab-notifs");
            if (tabNotifs) {
                tabNotifs.textContent = `${t.changedIcon || "🔔"} (${pending.length})`;
                if (pending.length > 0) {
                    tabNotifs.style.color = colors.orange;
                }
            }

            if (!pending.length) {
                const emptyMsg = document.createElement("div");
                emptyMsg.textContent = "\u2713 " + (t.noResults || "No notifications");
                emptyMsg.style.color = colors.gray;
                emptyMsg.style.fontSize = "12px";
                emptyMsg.style.textAlign = "center";
                emptyMsg.style.padding = "12px 0";
                notifsPane.appendChild(emptyMsg);
                updateNotificationTitleAndSound();
                return;
            }

            // Mark all as viewed button
            const markAllRow = document.createElement("div");
            Object.assign(markAllRow.style, {
                display: "flex", justifyContent: "flex-end", marginBottom: "8px",
            });
            const markAllBtn = document.createElement("button");
            markAllBtn.textContent = t.markAllAsViewed;
            Object.assign(markAllBtn.style, {
                backgroundColor: colors.surface, border: `1px solid ${colors.primary}`,
                color: colors.text, padding: "4px 8px", borderRadius: "4px",
                cursor: "pointer", fontSize: "11px",
            });
            markAllBtn.onclick = () => {
                markAllNotificationsSeen();
                removeAllBellsFromCards();
                renderNotificationsTab();
            };
            markAllRow.appendChild(markAllBtn);
            notifsPane.appendChild(markAllRow);

            // Notification rows
            pending.sort((a, b) => a.title.localeCompare(b.title)).forEach(n => {
                const row = document.createElement("div");
                Object.assign(row.style, {
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "6px 8px", marginBottom: "4px",
                    backgroundColor: colors.bg, borderRadius: "6px",
                    border: `1px solid ${colors.border}`,
                });

                const titleDiv = document.createElement("div");
                titleDiv.textContent = n.title;
                titleDiv.style.flex = "1";
                titleDiv.style.fontSize = "12px";
                titleDiv.style.overflow = "hidden";
                titleDiv.style.textOverflow = "ellipsis";
                titleDiv.style.whiteSpace = "nowrap";
                row.appendChild(titleDiv);

                const viewBtn = document.createElement("button");
                viewBtn.textContent = t.viewIcon || "👁️";
                viewBtn.title = t.viewed;
                Object.assign(viewBtn.style, {
                    backgroundColor: colors.surface, border: `1px solid ${colors.primary}`,
                    color: colors.text, padding: "4px 8px", borderRadius: "4px",
                    cursor: "pointer", fontSize: "11px", flexShrink: "0",
                });
                viewBtn.onclick = () => {
                    const notifTitle = n.title;
                    const notifId = (n.key && n.key.includes("|")) ? n.key.split("|")[1] : (n.id || "");
                    markNotificationSeen(n.key || n.title);
                    removeBellFromCard(notifTitle, notifId);

                    // If on inventory, navigate to campaigns and scroll to matching drop
                    if (location.pathname.includes("/inventory")) {
                        const campaignsLink = document.querySelector('a[href="/drops/all-campaigns"], a[href*="all-campaigns"]');
                        if (campaignsLink) {
                            divIdClickAfterClick = { id: notifId, title: notifTitle };
                            campaignsLink.click();
                        } else {
                            // Fallback: navigate directly
                            divIdClickAfterClick = { id: notifId, title: notifTitle };
                            location.href = "https://kick.com/drops/all-campaigns";
                        }
                    } else {
                        // Scroll the page to the actual campaign header on /all-campaigns
                        let pageScrolled = false;
                        if (notifId) {
                            const target = document.getElementById(notifId);
                            if (target) {
                                scrollToCampaignElement(target, "center");
                                pageScrolled = true;
                            }
                        }
                        // Also scroll the floating panel to the matching card
                        // (skip if page scroll succeeded and there's no separate panel card,
                        // to avoid fighting the page scroll)
                        if (!pageScrolled) {
                            const panes = ["kick-drops-active-pane", "kick-drops-expired-pane"];
                            for (const paneId of panes) {
                                const pane = document.getElementById(paneId);
                                if (!pane) continue;
                                const cards = pane.querySelectorAll("[data-notif-id], [data-notif-title]");
                                let matched = false;
                                for (const card of cards) {
                                    if ((notifId && card.getAttribute("data-notif-id") === notifId) ||
                                        (notifTitle && card.getAttribute("data-notif-title") === notifTitle)) {
                                        card.scrollIntoView({ behavior: "smooth", block: "center" });
                                        matched = true;
                                        break;
                                    }
                                }
                                if (matched) break;
                            }
                        }
                    }

                    // Re-render this tab
                    renderNotificationsTab();
                };
                row.appendChild(viewBtn);
                notifsPane.appendChild(row);
            });

            updateNotificationTitleAndSound();

            // Auto-switch to notifications tab when there are pending notifications
            if (pending.length > 0) {
                const tabActiveBtn = document.getElementById("kick-drops-tab-active");
                const tabExpiredBtn = document.getElementById("kick-drops-tab-expired");
                const activeP = document.getElementById("kick-drops-active-pane");
                const expiredP = document.getElementById("kick-drops-expired-pane");
                if (tabActiveBtn && tabExpiredBtn && tabNotifs && activeP && expiredP && notifsPane) {
                    [tabActiveBtn, tabExpiredBtn, tabNotifs].forEach(btn => {
                        btn.style.borderBottom = `2px solid transparent`;
                        btn.style.color = colors.gray;
                    });
                    tabNotifs.style.borderBottom = `2px solid ${colors.primary}`;
                    tabNotifs.style.color = colors.primaryLight;
                    activeP.style.display = "none";
                    expiredP.style.display = "none";
                    notifsPane.style.display = "block";
                }
            }
        }

        // =============================================
        // LOGICA CENTRAL (CORE)
        // =============================================

        let active = [];
        let expired = [];
        let seenTitles = new Set();
        let idx = 0;
        let reseted = false;
        let divIdClickAfterClick = null;

        function buildDataSnapshot(displayTitle) {
            const entry = _findEntryForTitle(displayTitle);
            if (!entry || !entry.drops || entry.drops.length === 0) {
                return JSON.stringify({ title: displayTitle.toLowerCase() });
            }
            // Sort drops by name for consistent comparison
            const sortedDrops = [...entry.drops].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return JSON.stringify({ drops: sortedDrops });
        }

        /**
         * highlightAndLinkDrops()
         *
         * Main scanning function adapted for Kick.com DOM structure.
         *
         * Kick's campaign page uses:
         * - h1 elements containing "Campanas abiertas" / "Closed campaigns" etc. as section headers
         * - [data-orientation="vertical"] containers as accordion groups
         * - Accordion buttons with game name (.text-base.font-bold), studio, dates, and image
         * - Nested sub-campaigns inside each accordion
         * - Reward items as li elements with img, name span, and time span
         */
        function highlightAndLinkDrops() {
            active = [];
            expired = [];
            seenTitles = new Set();
            reseted = false;
            idx = 0;
            // Clear previous drop-match IDs to allow re-scanning (needed when API data arrives after first DOM scan)
            document.querySelectorAll('[id^="drop-match-"]').forEach(el => el.removeAttribute('id'));

            // STEP 1: Find all h1 section headers to determine open/closed boundaries
            const allH1s = Array.from(document.querySelectorAll('h1'));

            let closedHeaderEl = null;
            let openHeaderEl = null;

            allH1s.forEach(h1 => {
                const text = h1.textContent.trim();
                if (CLOSED_HEADER_TEXTS.some(ct => text.toLowerCase() === ct.toLowerCase())) {
                    closedHeaderEl = h1;
                }
                if (OPEN_HEADER_TEXTS.some(ot => text.toLowerCase() === ot.toLowerCase())) {
                    openHeaderEl = h1;
                }
            });

            // STEP 2: Find all accordion containers (campaign groups)
            // Kick uses [data-orientation="vertical"] for accordion groups
            const accordionGroups = Array.from(document.querySelectorAll('[data-orientation="vertical"]'));

            // Determine which groups are in closed section by position relative to closed header
            const closedHeaderY = closedHeaderEl ? closedHeaderEl.getBoundingClientRect().top : Infinity;

            accordionGroups.forEach((group, groupIndex) => {
                // Find accordion items (buttons with [data-state])
                const accordionButtons = group.querySelectorAll('button[data-state], [data-state="open"], [data-state="closed"]');

                // If no accordion buttons, try finding direct campaign containers
                if (accordionButtons.length === 0) {
                    // Try alternative: look for campaign containers inside group
                    const campaignDivs = group.querySelectorAll('.bg-surface-base, [class*="bg-surface"]');
                    campaignDivs.forEach(div => {
                        processCampaignNode(div, closedHeaderY);
                    });
                    return;
                }

                accordionButtons.forEach(btn => {
                    // The parent accordion item contains all campaign data
                    const accordionItem = btn.closest('[data-state]') || btn.parentElement;
                    if (!accordionItem) return;

                    processCampaignNode(accordionItem, closedHeaderY);
                });
            });

            // If no accordion groups found, try a flat scan approach
            if (accordionGroups.length === 0) {
                // Fallback: scan all elements that look like campaign containers
                const fallbackNodes = document.querySelectorAll('[data-state], .bg-surface-base');
                fallbackNodes.forEach(node => {
                    processCampaignNode(node, closedHeaderY);
                });
            }

            // Render results in the floating panel
            const resultsContainer = document.getElementById("kick-drops-results");
            if (resultsContainer) {
                renderResults(resultsContainer, active, expired);
            }

            // Show notification popup
            renderNotificationsTab();

            // If there was a pending click from inventory->campaigns navigation
            if (divIdClickAfterClick) {
                let attempts = 0;
                const clickInterval = setInterval(() => {
                    attempts++;
                    let found = false;
                    // Try to find the actual page element — by ID first, and
                    // fall back to matching the campaign title because ids are
                    // reassigned on every scan and may no longer match the one
                    // captured before this navigation.
                    const target = findCampaignNodeFromClickInfo(divIdClickAfterClick);
                    if (target) {
                        scrollToCampaignElement(target, "center");
                        found = true;
                    }
                    // Also try to find matching card in panel by data-notif-id or data-notif-title
                    if (!found) {
                        const panes = ["kick-drops-active-pane", "kick-drops-expired-pane"];
                        for (const paneId of panes) {
                            const pane = document.getElementById(paneId);
                            if (pane) {
                                const cards = pane.querySelectorAll("[data-notif-id], [data-notif-title]");
                                for (const card of cards) {
                                    if ((divIdClickAfterClick.id && card.getAttribute("data-notif-id") === divIdClickAfterClick.id) ||
                                        (divIdClickAfterClick.title && card.getAttribute("data-notif-title") === divIdClickAfterClick.title)) {
                                        card.scrollIntoView({ behavior: "smooth", block: "center" });
                                        found = true;
                                        break;
                                    }
                                }
                            }
                            if (found) break;
                        }
                    }
                    if (found || attempts >= 10) {
                        divIdClickAfterClick = null;
                        clearInterval(clickInterval);
                    }
                }, 500);
            }
        }

        /**
         * processCampaignNode()
         *
         * Extract campaign data from a single accordion item / campaign node.
         * Adapted for Kick.com's HTML structure.
         */
        function processCampaignNode(node, closedHeaderY) {
            if (!(node instanceof HTMLElement)) return;
            if (node.id && node.id.startsWith('drop-match-')) return;

            // Extract game name from .text-base.font-bold inside the node
            let titleText = '';
            let studioText = '';
            let dateRange = '';
            let imgSrc = '';

            // Game name: .text-base.font-bold or first bold text
            const gameNameEl = node.querySelector('.text-base.font-bold') ||
                node.querySelector('[class*="font-bold"]');
            if (gameNameEl) {
                titleText = gameNameEl.textContent.trim();
            }

            // Studio: .text-secondary-onSecondaryVariant or .text-start.text-sm
            const studioEl = node.querySelector('.text-secondary-onSecondaryVariant') ||
                node.querySelector('.text-start.text-sm');
            if (studioEl && studioEl !== gameNameEl) {
                studioText = studioEl.textContent.trim();
            }

            // Dates: .text-neutral-300
            const dateEl = node.querySelector('.text-neutral-300');
            if (dateEl) {
                dateRange = dateEl.textContent.trim();
            }

            // Category image: img with h-[67px] w-[50px] rounded, or first img in button
            const imgEl = node.querySelector('img.rounded, img[class*="h-[67px]"], img[class*="w-[50px]"]') ||
                node.querySelector('button img') ||
                node.querySelector('img');
            if (imgEl) {
                imgSrc = imgEl.src;
            }

            // If no title found, try generic approach
            if (!titleText) {
                const boldEls = node.querySelectorAll('span[class*="font-bold"], div[class*="font-bold"], p[class*="font-bold"]');
                if (boldEls.length > 0) {
                    titleText = boldEls[0].textContent.trim();
                }
            }

            if (!titleText) return;

            // Combine title + studio for keyword matching
            const searchText = (titleText + " " + studioText).toLowerCase();
            if (!keywords.some(k => searchText.includes(k))) return;

            // Display title includes studio when present
            const displayTitle = studioText ? titleText + " - " + studioText : titleText;

            // Determine if expired by walking up the DOM to find the nearest h1 section header
            let isExpired = false;
            let walker = node.parentElement;
            while (walker) {
                // Check previous siblings for h1 headers
                let sibling = walker.previousElementSibling;
                while (sibling) {
                    const h1 = sibling.tagName === 'H1' ? sibling : sibling.querySelector('h1');
                    if (h1) {
                        const h1Text = h1.textContent.trim().toLowerCase();
                        if (CLOSED_HEADER_TEXTS.some(ct => h1Text === ct.toLowerCase())) {
                            isExpired = true;
                        }
                        // Found the nearest h1, stop walking
                        walker = null;
                        break;
                    }
                    // Also check if the sibling itself contains the section header div
                    const sectionH1s = sibling.querySelectorAll ? sibling.querySelectorAll('h1') : [];
                    for (const sh of sectionH1s) {
                        const shText = sh.textContent.trim().toLowerCase();
                        if (CLOSED_HEADER_TEXTS.some(ct => shText === ct.toLowerCase())) {
                            isExpired = true;
                            walker = null;
                            break;
                        }
                        if (OPEN_HEADER_TEXTS.some(ot => shText === ot.toLowerCase())) {
                            walker = null;
                            break;
                        }
                    }
                    if (walker === null) break;
                    sibling = sibling.previousElementSibling;
                }
                if (walker) walker = walker.parentElement;
            }
            // Fallback: Y-position approach if DOM walk didn't find any h1
            if (!isExpired && closedHeaderY !== Infinity) {
                const nodeY = node.getBoundingClientRect().top;
                if (nodeY >= closedHeaderY) {
                    isExpired = true;
                }
            }

            if (isExpired && !reseted) {
                seenTitles = new Set();
                reseted = true;
            }

            // Use displayTitle as a dedup key (since we don't have indices like Twitch)
            const dedupKey = displayTitle + (isExpired ? '_expired' : '_active');
            if (seenTitles.has(dedupKey)) return;
            seenTitles.add(dedupKey);

            const id = `drop-match-${idx++}-${isExpired ? 'expired' : 'active'}`;

            node.id = id;
            // Apply highlight styles to the individual campaign node (not the parent container)
            // On Kick, each campaign is a div[data-state] inside a shared div[data-orientation="vertical"]
            // If node has .bg-surface-base inside, style that; otherwise style the node itself
            const innerCard = node.querySelector('.bg-surface-base') || node;
            innerCard.setAttribute('style', (innerCard.getAttribute('style') || '') + ';' + (isExpired ? EXPIRED_STYLE : ACTIVE_STYLE));

            // Extract reward items from sub-campaigns (only for active drops)
            const rewards = [];
            if (!isExpired) {
                const rewardItems = node.querySelectorAll('li');
                rewardItems.forEach(li => {
                    const nameSpan = li.querySelector('span.text-sm.font-semibold, span[class*="font-semibold"]');
                    const timeSpan = li.querySelector('span.text-surface-onSurfaceSecondary, span[class*="onSurfaceSecondary"]');
                    const rwImg = li.querySelector('img');
                    if (nameSpan) {
                        rewards.push({
                            name: nameSpan.textContent.trim(),
                            time: timeSpan ? timeSpan.textContent.trim() : '',
                            imgSrc: rwImg ? rwImg.src : '',
                        });
                    }
                });
            }

            // Matched keywords
            const matchedKeywords = keywords.filter(k => searchText.includes(k));

            // Update/create notification (using API data instead of HTML snapshots)
            let changedFlag = false;
            const computedKey = displayTitle + '|' + id;
            if (!isExpired) {
                const notifs = getNotifications();
                let existingNotif = notifs.find((n) => n.key === computedKey) || notifs.find((n) => n.title === displayTitle);
                if (_apiDataReady) {
                    // Si la campaña ya no tiene drops activos en la API (expiró), no notificar cambio
                    const entry = _findEntryForTitle(displayTitle);
                    if (!entry || !entry.drops || entry.drops.length === 0) {
                        if (existingNotif) changedFlag = !existingNotif.seen && existingNotif.changed;
                    } else {
                    const dataSnapshot = buildDataSnapshot(displayTitle);
                    if (existingNotif) {
                        // Siempre actualizar key/id por si cambio el orden del DOM
                        const keyChanged = existingNotif.key !== computedKey;
                        existingNotif.id = id;
                        existingNotif.key = computedKey;
                        if (existingNotif.dataSnapshot !== dataSnapshot) {
                            existingNotif.changed = true;
                            existingNotif.seen = false;
                            existingNotif.dataSnapshot = dataSnapshot;
                            existingNotif.updatedAt = Date.now();
                            changedFlag = true;
                            saveNotifications(notifs);
                        } else {
                            if (keyChanged) saveNotifications(notifs);
                            changedFlag = !existingNotif.seen && existingNotif.changed;
                        }
                    } else {
                        const newN = {
                            id: id, title: displayTitle, key: computedKey,
                            dataSnapshot: dataSnapshot,
                            seen: false, changed: true,
                            createdAt: Date.now(), updatedAt: Date.now(),
                        };
                        notifs.push(newN);
                        saveNotifications(notifs);
                        changedFlag = true;
                    }
                    }
                } else if (existingNotif) {
                    changedFlag = !existingNotif.seen && existingNotif.changed;
                } else {
                    // No API data y no existia snapshot previo → drop nuevo detectado
                    const newN = {
                        id: id, title: displayTitle, key: computedKey,
                        dataSnapshot: '',
                        seen: false, changed: true,
                        createdAt: Date.now(), updatedAt: Date.now(),
                    };
                    notifs.push(newN);
                    saveNotifications(notifs);
                    changedFlag = true;
                }
            }

            const item = {
                title: displayTitle, studio: studioText, id, changed: changedFlag,
                key: computedKey, status: isExpired ? 'expired' : 'active',
                idx, imgSrc, dateRange, matchedKeywords, rewards,
                element: node,
            };
            (isExpired ? expired : active).push(item);
        }

        // =============================================
        // CLAIMED INVENTORY SECTION (from intercepted API)
        // =============================================

        const KICK_CDN_BASE = 'https://ext.cdn.kick.com/';

        // Fetch claimed inventory — uses intercepted data if available, else GM_xmlhttpRequest with captured auth token
        function _fetchClaimedInventory() {
            // If interceptor already captured the data, just render
            if (_claimedInventoryReady && _interceptedClaimedCampaigns.length > 0) {
                _renderClaimedInventory();
                return;
            }

            // Need auth token to fetch explicitly
            if (!_kickAuthToken) {
                console.warn('[Kick Drops] No auth token captured yet — cannot fetch claimed inventory');
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: KICK_DROPS_PROGRESS_URL,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': _kickAuthToken,
                },
                onload: function (response) {
                    try {
                        if (response.status !== 200) {
                            console.warn('[Kick Drops] Non-200 status:', response.status, response.responseText?.substring(0, 200));
                            return;
                        }
                        const data = JSON.parse(response.responseText);
                        if (data?.data && Array.isArray(data.data)) {
                            _interceptedClaimedCampaigns = data.data.filter(c =>
                                c.rewards && c.rewards.some(r => r.claimed)
                            );
                            _claimedInventoryReady = true;
                            if (location.pathname.includes('/inventory')) {
                                _renderClaimedInventory();
                            }
                        }
                    } catch (e) { console.warn('[Kick Drops] Error parsing claimed inventory:', e); }
                },
                onerror: function (e) { console.warn('[Kick Drops] Error fetching claimed inventory:', e); }
            });
        }

        // Relative time helper (e.g., "hace 3 días", "el mes pasado")
        function _timeAgo(dateStr) {
            if (!dateStr) return '';
            try {
                const diff = Date.now() - new Date(dateStr).getTime();
                const seconds = Math.floor(diff / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                const months = Math.floor(days / 30);
                const years = Math.floor(days / 365);

                const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
                if (years > 0) return rtf.format(-years, 'year');
                if (months > 0) return rtf.format(-months, 'month');
                if (days > 0) return rtf.format(-days, 'day');
                if (hours > 0) return rtf.format(-hours, 'hour');
                if (minutes > 0) return rtf.format(-minutes, 'minute');
                return rtf.format(-seconds, 'second');
            } catch (e) { return dateStr; }
        }

        function _renderClaimedInventory() {
            if (!_claimedInventoryReady || !location.pathname.includes('/inventory')) return;
            if (_interceptedClaimedCampaigns.length === 0) return;

            // Remove previous render
            const existing = document.getElementById('kick-claimed-inventory');
            if (existing) existing.remove();

            // Collect all claimed rewards from all campaigns into a flat list
            const allClaimed = [];
            for (const campaign of _interceptedClaimedCampaigns) {
                for (const reward of (campaign.rewards || [])) {
                    if (reward.claimed) {
                        allClaimed.push({
                            reward,
                            claimedAt: reward.claimed_at || reward.updated_at || campaign.updated_at || '',
                        });
                    }
                }
            }
            if (allClaimed.length === 0) return;

            // Find insertion point: after the "Reclamado" section
            const allH1s = Array.from(document.querySelectorAll('h1'));
            let reclamadoSection = null;
            for (const h1 of allH1s) {
                const txt = h1.textContent.trim().toLowerCase();
                if (txt === 'reclamado' || txt === 'claimed') {
                    reclamadoSection = h1.closest('.flex.w-full.shrink-0.grow-0') || h1.parentElement;
                    break;
                }
            }
            if (!reclamadoSection) {
                reclamadoSection = document.querySelector('[data-orientation="vertical"]')?.parentElement;
            }
            if (!reclamadoSection) return;

            const insertParent = reclamadoSection.parentElement;
            if (!insertParent) return;

            // Build section
            const section = document.createElement('div');
            section.id = 'kick-claimed-inventory';
            section.className = 'flex w-full shrink-0 grow-0 flex-col gap-3';

            // Section header
            const header = document.createElement('h1');
            header.className = 'font-semibold text-white lg:text-xl text-base';
            header.textContent = t.claimedInventoryTitle || 'Claimed';
            section.appendChild(header);

            // Rewards grid (Twitch-style cards)
            const grid = document.createElement('div');
            grid.className = 'grid gap-4';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';

            for (const { reward, claimedAt } of allClaimed) {
                const card = document.createElement('div');
                card.className = 'bg-surface-base flex flex-col rounded-lg overflow-hidden';

                // Image
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'relative aspect-square bg-surface-highest';
                const img = document.createElement('img');
                img.alt = reward.name || '';
                img.loading = 'lazy';
                img.className = 'w-full h-full object-cover';
                img.src = reward.image_url ? KICK_CDN_BASE + reward.image_url : '';
                imgWrapper.appendChild(img);
                card.appendChild(imgWrapper);

                // Info section: time + count + name
                const info = document.createElement('div');
                info.className = 'flex flex-col gap-1 p-3';

                // Row: time ago + count badge
                const topRow = document.createElement('div');
                topRow.className = 'flex items-center justify-between';

                const timeSpan = document.createElement('span');
                timeSpan.className = 'text-surface-onSurfaceSecondary text-xs';
                timeSpan.textContent = _timeAgo(claimedAt);
                topRow.appendChild(timeSpan);

                const badge = document.createElement('div');
                badge.className = 'flex items-center justify-center rounded bg-surface-highest px-1.5 py-0.5 text-xs text-white font-medium min-w-[20px]';
                badge.textContent = '1';
                topRow.appendChild(badge);

                info.appendChild(topRow);

                // Reward name
                const nameP = document.createElement('p');
                nameP.className = 'text-sm font-bold text-white line-clamp-2 break-words';
                nameP.textContent = reward.name || '';
                info.appendChild(nameP);

                card.appendChild(info);

                // Separator
                const sep = document.createElement('div');
                sep.className = 'bg-outline-decorative h-px w-full';
                card.appendChild(sep);

                // Checkmark footer
                const footer = document.createElement('div');
                footer.className = 'flex items-center justify-center py-2';
                const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                checkSvg.setAttribute('width', '20');
                checkSvg.setAttribute('height', '20');
                checkSvg.setAttribute('viewBox', '0 0 24 24');
                checkSvg.setAttribute('fill', 'none');
                checkSvg.setAttribute('class', 'text-surface-onSurfaceSecondary');
                const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                checkPath.setAttribute('d', 'M19.707 8.207 10 17.914l-6.207-6.207 1.414-1.414L10 15.086l8.293-8.293 1.414 1.414Z');
                checkPath.setAttribute('fill', 'currentColor');
                checkPath.setAttribute('clip-rule', 'evenodd');
                checkPath.setAttribute('fill-rule', 'evenodd');
                checkSvg.appendChild(checkPath);
                footer.appendChild(checkSvg);
                card.appendChild(footer);

                grid.appendChild(card);
            }

            section.appendChild(grid);

            // Insert after "Reclamado" section
            if (reclamadoSection.nextSibling) {
                insertParent.insertBefore(section, reclamadoSection.nextSibling);
            } else {
                insertParent.appendChild(section);
            }
        }

        // Register callback so the fetch interceptor (outside load listener) can trigger render
        _onClaimedDataReady = _renderClaimedInventory;

        // If data was already intercepted before load fired, render now
        if (_claimedInventoryReady && _interceptedClaimedCampaigns.length > 0 && location.pathname.includes('/inventory')) {
            setTimeout(() => _renderClaimedInventory(), 1000);
        }

        // =============================================
        // INVENTORY CLEANUP (cleanInventory)
        // =============================================

        // Localized texts for claimed/unavailable drop detection
        const CLAIMED_TEXTS = [
            "pedido", "claimed", "beansprucht", "réclamé", "resgatado",
            "востребовано", "talep edildi", "受け取り済み", "수령 완료", "odebrano",
            "lunastettu", "đã nhận", "已领取", "تم المطالبة", "दावा किया गया", "diklaim",
        ];

        // Localized texts for the "Expired" section heading on the Kick inventory page.
        // Matched case-insensitively against the exact trimmed text of the <h1>.
        const EXPIRED_HEADER_TEXTS = [
            "expiró", "expired", "abgelaufen", "expiré", "expirou", "expirado",
            "scaduto", "истекшие", "süresi dolan", "期限切れ", "만료됨",
            "wygasłe", "vanhentunut", "hết hạn", "已过期", "已過期",
            "انتهت صلاحيته", "समाप्त हो गया", "kedaluwarsa", "หมดอายุ",
        ];

        /**
         * cleanInventory()
         *
         * Handles auto-claim of completed drops, hiding fully-claimed campaigns,
         * selective per-campaign hiding via ❌ buttons, and hiding previously deleted campaigns.
         *
         * Drop states in Kick inventory:
         * - In progress: has progressbar[data-state="loading"], shows "63% de 2 h"
         * - Ready to claim: has progressbar[data-state="complete"] + button with "Pedir"/"Claim"
         * - Already claimed: NO progressbar, span text is "Pedido"/"Claimed"
         */
        function cleanInventory(type = "expired") {
            let attempts = 0;
            const maxAttempts = 15;
            const interval = 600;
            const deleted = getInventoryDeletedKeys();

            const checker = setInterval(() => {
                attempts++;

                // Hide the whole "Expiró" section (heading + all campaigns under it).
                // Kick groups already-expired campaigns under a localized <h1> sibling of the campaigns list.
                if (type === "expired") {
                    document.querySelectorAll('h1').forEach((h1) => {
                        const text = (h1.textContent || '').trim().toLowerCase();
                        if (!text) return;
                        if (!EXPIRED_HEADER_TEXTS.some(t => text === t)) return;
                        const section = h1.parentElement;
                        if (section) section.style.display = 'none';
                    });
                }

                // Find all campaign accordion containers in the inventory
                const campaignContainers = document.querySelectorAll('.bg-surface-base');

                if (campaignContainers.length === 0 && attempts >= maxAttempts) {
                    clearInterval(checker);
                    return;
                }

                if (campaignContainers.length === 0) return;

                let claimIndex = 0;

                campaignContainers.forEach(function (container) {
                    // Skip containers inside our custom claimed inventory section
                    if (container.closest('#kick-claimed-inventory')) return;

                    // Get campaign name for selective hide / deleted check
                    const nameEl = container.querySelector('.text-base.font-bold') ||
                        container.querySelector('[class*="font-bold"]');
                    const campaignName = nameEl ? nameEl.textContent.trim() : '';

                    // Hide campaigns previously deleted by user via ❌
                    if (campaignName && deleted.includes(campaignName)) {
                        const accordion = container.closest('[data-orientation="vertical"]') || container;
                        if (accordion) accordion.style.display = 'none';
                        return;
                    }

                    // Add ❌ button to campaign title (only on inventory page, once)
                    if (nameEl && !container.dataset.kickHideBtnAdded && location.pathname.includes('/inventory')) {
                        container.dataset.kickHideBtnAdded = "true";
                        const hideBtn = document.createElement('button');
                        hideBtn.textContent = t.removeIcon || '❌';
                        hideBtn.title = t.removeInventory;
                        Object.assign(hideBtn.style, {
                            color: colors.red, cursor: 'pointer', border: 'none',
                            background: 'transparent', fontSize: '14px', fontWeight: 'bold',
                            marginLeft: '8px', padding: '0 4px', lineHeight: '1',
                        });
                        hideBtn.onclick = (e) => {
                            e.stopPropagation();
                            const keys = getInventoryDeletedKeys();
                            if (!keys.includes(campaignName)) {
                                keys.push(campaignName);
                                setInventoryDeletedKeys(keys);
                            }
                            const accordion = container.closest('[data-orientation="vertical"]') || container;
                            if (accordion) accordion.style.display = 'none';
                        };
                        // Insert after the campaign name span
                        const nameRow = nameEl.closest('.flex.flex-row') || nameEl.parentElement;
                        if (nameRow) {
                            nameRow.appendChild(hideBtn);
                        }
                    }

                    // Find all drop items (li elements) inside this campaign
                    const dropItems = container.querySelectorAll('li');
                    if (dropItems.length === 0) return;

                    let allClaimedOrComplete = true;
                    let hasClaimableButton = false;

                    dropItems.forEach(function (li) {
                        const progressBar = li.querySelector('[role="progressbar"]');
                        const statusSpan = li.querySelector('.text-surface-onSurfaceSecondary');
                        const statusText = statusSpan ? statusSpan.textContent.trim().toLowerCase() : '';

                        if (progressBar) {
                            const state = progressBar.getAttribute('data-state');
                            if (state === 'complete') {
                                // Ready to claim - find and auto-click "Pedir"/"Claim" button
                                if (type === "expired") {
                                    const claimBtn = li.querySelector('button[aria-label*="Claim"], button[aria-label*="claim"]');
                                    if (claimBtn && !claimBtn.dataset.kickAutoClicked) {
                                        const btnText = (claimBtn.textContent || '').trim().toLowerCase();
                                        if (btnText.includes('pedir') || btnText.includes('claim') || claimBtn.getAttribute('aria-label')?.toLowerCase().includes('claim')) {
                                            claimBtn.dataset.kickAutoClicked = "true";
                                            setTimeout(() => { claimBtn.click(); }, claimIndex * 200);
                                            claimIndex++;
                                            hasClaimableButton = true;
                                        }
                                    }
                                }
                                // Still counts as complete for hiding purposes
                            } else {
                                // loading/indeterminate = in progress
                                allClaimedOrComplete = false;
                            }
                        } else {
                            // No progressbar - check if already claimed via text
                            const isClaimed = CLAIMED_TEXTS.some(ct => statusText.includes(ct));
                            if (isClaimed && type === "expired") {
                                // Hide individual claimed drop items
                                li.style.display = 'none';
                            }
                            if (!isClaimed) {
                                // Unknown state, don't consider fully complete
                                allClaimedOrComplete = false;
                            }
                        }
                    });

                    // Hide fully-claimed campaigns when checkbox is active
                    if (type === "expired" && allClaimedOrComplete && !hasClaimableButton && dropItems.length > 0) {
                        const accordion = container.closest('[data-orientation="vertical"]') || container;
                        if (accordion && accordion.parentElement) {
                            accordion.style.display = 'none';
                        }
                    }
                });

                // Fallback: auto-click any remaining claim buttons on the page
                if (type === "expired") {
                    const allClaimButtons = document.querySelectorAll('button[aria-label*="Claim"], button[aria-label*="claim"]');
                    allClaimButtons.forEach(function (btn, i) {
                        if (!btn.dataset.kickAutoClicked) {
                            const btnText = (btn.textContent || '').trim().toLowerCase();
                            if (btnText.includes('pedir') || btnText.includes('claim')) {
                                btn.dataset.kickAutoClicked = "true";
                                setTimeout(() => { btn.click(); }, (claimIndex + i) * 200);
                            }
                        }
                    });
                }

                if (attempts >= maxAttempts) {
                    clearInterval(checker);
                    // Fetch and render claimed inventory section after cleanup finishes
                    _fetchClaimedInventory();
                }
            }, interval);
        }

        // =============================================
        // CICLO DE VIDA / INICIALIZACION
        // =============================================

        let _loadingOverlay = null;

        function _showLoadingOverlay(message) {
            _hideLoadingOverlay();
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '999999',
            });
            const box = document.createElement('div');
            Object.assign(box.style, {
                background: colors.surface, color: colors.text,
                padding: '24px 32px', borderRadius: '10px', fontSize: '16px',
                fontWeight: '600', boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
                border: `2px solid ${colors.primary}`, textAlign: 'center',
            });
            box.textContent = message;
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _loadingOverlay = overlay;
        }

        function _hideLoadingOverlay() {
            if (_loadingOverlay && _loadingOverlay.parentElement) {
                _loadingOverlay.parentElement.removeChild(_loadingOverlay);
            }
            _loadingOverlay = null;
        }

        function waitForDropsFunction() {
            const path = location.pathname;
            const isCampaigns = path.includes("/all-campaigns");
            const isInventory = path.includes("/inventory");
            actualPath = isCampaigns ? "/drops/all-campaigns" : isInventory ? "/drops/inventory" : path;

            // Build the floating panel
            const resultsContainer = buildPanel();

            if (isInventory) {
                const campaignsTab = document.querySelector('a[href="/drops/all-campaigns"]');
                if (campaignsTab) {
                    _showLoadingOverlay(t.loadingDropsFromInventory);
                    skipNextUrlChange = true;
                    campaignsTab.click();
                    setTimeout(() => { _startDropsPolling(true); }, 2000);
                } else {
                    cleanInventory(cleanExpiredInventoryFlag ? 'expired' : '');
                    setTimeout(() => _fetchClaimedInventory(), 3000);
                }
                return;
            }

            _startDropsPolling(false);
        }

        function _startDropsPolling(returnToInventory) {
            if (!returnToInventory) {
                _showLoadingOverlay(t.loadingDrops);
            }
            let attempts = 0;
            const maxAttempts = 10;
            let waitForDrops = setInterval(() => {
                let found = 0;
                const seenTitlesLocal = new Set();

                // Kick campaign detection: look for accordion items with game names
                // Try multiple selector strategies for Kick's DOM
                const campaignNodes = document.querySelectorAll(
                    '[data-orientation="vertical"] [data-state], ' +
                    '[data-orientation="vertical"] button, ' +
                    '.bg-surface-base'
                );

                campaignNodes.forEach((node) => {
                    const gameNameEl = node.querySelector('.text-base.font-bold') ||
                        node.querySelector('[class*="font-bold"]');
                    if (!gameNameEl) return;
                    const text = gameNameEl.textContent.trim().toLowerCase();
                    if (!keywords.some((k) => text.includes(k))) return;
                    if (seenTitlesLocal.has(text)) return;
                    seenTitlesLocal.add(text);
                    found++;
                });

                if (found >= 1) {
                    clearInterval(waitForDrops);
                    if (!returnToInventory) _hideLoadingOverlay();
                    highlightAndLinkDrops();
                    _updateAllCardsWithDropNames();
                    if (returnToInventory) {
                        _navigateBackToInventory();
                    }
                } else {
                    attempts++;
                    const resultsContainer = document.getElementById("kick-drops-results");
                    if (resultsContainer && !resultsContainer.querySelector('#searching-status')) {
                        const searchEl = document.createElement("div");
                        searchEl.id = "searching-status";
                        searchEl.style.color = colors.orange;
                        searchEl.style.fontWeight = "bold";
                        searchEl.style.fontSize = "12px";
                        resultsContainer.appendChild(searchEl);
                    }
                    const searchEl = document.getElementById("searching-status");
                    if (searchEl) {
                        searchEl.textContent = `${t.searching}${".".repeat(attempts)}`;
                    }
                    if (attempts >= maxAttempts) {
                        clearInterval(waitForDrops);
                        if (!returnToInventory) _hideLoadingOverlay();
                        if (searchEl) searchEl.remove();
                        if (!returnToInventory) {
                            const resultsContainer = document.getElementById("kick-drops-results");
                            if (resultsContainer) {
                                const warn = document.createElement("div");
                                warn.style.color = colors.red;
                                warn.style.fontWeight = "bold";
                                warn.style.fontSize = "12px";
                                warn.textContent = t.noResults;
                                resultsContainer.appendChild(warn);

                                const waitMsg = document.createElement("div");
                                waitMsg.style.color = colors.gray;
                                waitMsg.style.fontSize = "11px";
                                waitMsg.style.fontStyle = "italic";
                                waitMsg.style.marginTop = "4px";
                                waitMsg.textContent = t.waitMessage;
                                resultsContainer.appendChild(waitMsg);
                            }
                        }
                        if (returnToInventory) {
                            _navigateBackToInventory();
                        }
                    }
                }
            }, 500);
        }

        function _navigateBackToInventory() {
            _hideLoadingOverlay();
            const inventoryTab = document.querySelector('a[href="/drops/inventory"]');
            if (inventoryTab) {
                skipNextUrlChange = true;
                inventoryTab.click();
                setTimeout(() => {
                    cleanInventory(cleanExpiredInventoryFlag ? 'expired' : '');
                    // Fetch and render claimed inventory after returning
                    setTimeout(() => _fetchClaimedInventory(), 3000);
                }, 2000);
            }
        }

        // =============================================
        // URL CHANGE OBSERVER (SPA navigation)
        // =============================================

        let actualPath = "";
        let skipNextUrlChange = false;

        function onUrlChange(callback) {
            const pushState = history.pushState;
            const replaceState = history.replaceState;

            history.pushState = function () {
                pushState.apply(history, arguments);
                callback();
            };
            history.replaceState = function () {
                replaceState.apply(history, arguments);
                callback();
            };

            window.addEventListener("popstate", callback);
        }

        onUrlChange(() => {
            const newPath = location.pathname;
            if (skipNextUrlChange) {
                skipNextUrlChange = false;
                actualPath = newPath;
                return;
            }
            if (newPath !== actualPath) {
                actualPath = newPath;
                if (newPath.startsWith("/drops/all-campaigns")) {
                    waitForDropsFunction();
                } else {
                    cleanInventory(cleanExpiredInventoryFlag ? 'expired' : '');
                }
            }
        });

        // Start
        waitForDropsFunction();

        // Auto-refresh every 15 minutes
        setInterval(() => {
            location.reload();
        }, 15 * 60 * 1000);
    });
})();
