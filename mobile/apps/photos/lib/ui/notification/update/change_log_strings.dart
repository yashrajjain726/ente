import 'dart:ui';

class ChangeLogStrings {
  final List<ChangeLogEntryStrings> entries;

  const ChangeLogStrings({required this.entries});

  static ChangeLogStrings? maybeForLocale(
    Locale locale, {
    bool isLocalGallery = false,
  }) {
    final key = locale.countryCode != null && locale.countryCode!.isNotEmpty
        ? '${locale.languageCode}_${locale.countryCode}'
        : locale.languageCode;
    final strings =
        _translations[key] ??
        _translations[locale.languageCode] ??
        _translations['en'];

    if (strings == null) {
      return null;
    }

    final entries = isLocalGallery
        ? strings.entries
              .where((entry) => !entry.isOnlineOnly)
              .toList(growable: false)
        : strings.entries;
    return entries.isEmpty ? null : ChangeLogStrings(entries: entries);
  }

  static bool hasContentForLocale(
    Locale locale, {
    bool isLocalGallery = false,
  }) {
    return maybeForLocale(locale, isLocalGallery: isLocalGallery) != null;
  }

  static const Map<String, ChangeLogStrings> _translations = {
    'en': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Faster, sharper face suggestions',
          description:
              "The image processing now runs 5-10 times faster! Also, blurry and sideways faces no longer muddy your people groups, and we will remember the faces you've already dismissed.",
        ),
        ChangeLogEntryStrings(
          title: 'Panoramas, reborn',
          description:
              'Rebuilt from the ground up. Panoramas open faster, move smoothly, and no longer come up blank.',
        ),
        ChangeLogEntryStrings(
          title: "Backups that don't get stuck",
          description:
              "If your device runs out of room mid-backup, Ente now tells you and picks up where it left off once you've freed some space.",
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Casting, simplified',
          description:
              'Screens are easier to find on Android and pair automatically on iOS. No extra setup.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Mute, remembered',
          description:
              'Silence a video once and it stays that way for the next one.',
        ),
        ChangeLogEntryStrings(
          title: 'and more!',
          description:
              'Clear your Trash straight from Free up space, a smoother and more reliable app lock, favoriting shared photos in memories, Traditional Chinese joins the language list, smoother swiping in the photo viewer, plus fixes for uploading to multiple albums and picking SD card media in other apps.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'ca': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Suggeriments de cares més ràpids i precisos',
          description:
              "El processament d'imatges ara és entre 5 i 10 vegades més ràpid! A més, les cares borroses o de costat ja no desordenen els grups de persones, i recordarem les cares que ja hagis descartat.",
        ),
        ChangeLogEntryStrings(
          title: 'Panoràmiques, renovades',
          description:
              "Refetes des de zero. Les panoràmiques s'obren més ràpid, es desplacen amb fluïdesa i ja no apareixen en blanc.",
        ),
        ChangeLogEntryStrings(
          title: "Còpies de seguretat que no es queden encallades",
          description:
              "Si el dispositiu es queda sense espai durant una còpia de seguretat, Ente t'avisa i reprèn la còpia des d'on s'havia aturat quan hagis alliberat una mica d'espai.",
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Transmissió simplificada',
          description:
              "Trobar pantalles és més fàcil a Android, i a iOS es vinculen automàticament. Sense cap configuració addicional.",
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Silenci recordat',
          description:
              'Silencia un vídeo una vegada i el següent continuarà silenciat.',
        ),
        ChangeLogEntryStrings(
          title: 'i molt més!',
          description:
              "Buida la Paperera directament des d'Allibera espai, un bloqueig de l'aplicació més fluid i fiable, marca com a favorites les fotos compartides als records, el xinès tradicional s'incorpora a la llista d'idiomes, un desplaçament més fluid al visualitzador de fotos i correccions per pujar contingut a diversos àlbums i seleccionar contingut multimèdia de la targeta SD en altres aplicacions.",
          isOnlineOnly: true,
        ),
      ],
    ),
    'cs': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Rychlejší a přesnější návrhy obličejů',
          description:
              'Zpracování obrázků je teď 5–10× rychlejší! Rozmazané obličeje a obličeje otočené na bok už navíc nenarušují skupiny osob a zapamatujeme si, které obličeje jste už zamítli.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramata jako znovuzrozená',
          description:
              'Přepracovali jsme je od základů. Panoramata se otevírají rychleji, plynule se posouvají a už se nezobrazují prázdná.',
        ),
        ChangeLogEntryStrings(
          title: 'Zálohy, které se nezaseknou',
          description:
              'Pokud v zařízení během zálohování dojde místo, Ente vás teď upozorní a po uvolnění místa zálohování naváže tam, kde skončilo.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Jednodušší přenos na obrazovku',
          description:
              'V Androidu se obrazovky snáze vyhledávají a v iOS se párují automaticky. Bez dalšího nastavování.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Ztlumení, které si pamatujeme',
          description:
              'Jednou video ztlumte a ztlumené zůstane i to následující.',
        ),
        ChangeLogEntryStrings(
          title: 'a ještě víc!',
          description:
              'Vyprázdnění Koše přímo z nabídky Uvolnit místo, plynulejší a spolehlivější zámek aplikace, přidávání sdílených fotek ze vzpomínek do oblíbených, tradiční čínština v seznamu jazyků, plynulejší přejíždění v prohlížeči fotek a také opravy nahrávání do více alb a výběru médií z SD karty v jiných aplikacích.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'de': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Schnellere, präzisere Gesichtsvorschläge',
          description:
              'Die Bildverarbeitung läuft jetzt 5–10-mal schneller! Außerdem bringen unscharfe und seitlich gedrehte Gesichter deine Personengruppen nicht mehr durcheinander, und wir merken uns, welche Gesichter du bereits verworfen hast.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramen, neu erfunden',
          description:
              'Von Grund auf neu entwickelt. Panoramen öffnen sich schneller, lassen sich flüssig bewegen und werden nicht mehr leer angezeigt.',
        ),
        ChangeLogEntryStrings(
          title: 'Backups, die nicht stecken bleiben',
          description:
              'Wenn auf deinem Gerät während eines Backups der Speicherplatz ausgeht, sagt Ente dir jetzt Bescheid und macht dort weiter, wo es aufgehört hat, sobald du etwas Speicherplatz freigegeben hast.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Casting, ganz einfach',
          description:
              'Auf Android lassen sich Bildschirme leichter finden, auf iOS werden sie automatisch gekoppelt. Keine zusätzliche Einrichtung.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Stummschaltung, gespeichert',
          description:
              'Schalte ein Video einmal stumm, und auch das nächste bleibt stumm.',
        ),
        ChangeLogEntryStrings(
          title: 'und vieles mehr!',
          description:
              'Leere deinen Papierkorb direkt über Speicherplatz freigeben, nutze eine flüssigere und zuverlässigere App-Sperre, markiere geteilte Fotos in Erinnerungen als Favoriten, wähle traditionelles Chinesisch aus der Sprachliste, wische flüssiger durch die Fotoanzeige und profitiere von Fehlerbehebungen beim Hochladen in mehrere Alben und beim Auswählen von Medien auf SD-Karten in anderen Apps.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'es': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Sugerencias de rostros más rápidas y precisas',
          description:
              '¡El procesamiento de imágenes ahora es entre 5 y 10 veces más rápido! Además, los rostros borrosos o girados de lado ya no enturbian tus grupos de personas, y recordaremos los rostros que ya hayas descartado.',
        ),
        ChangeLogEntryStrings(
          title: 'Panorámicas, renacidas',
          description:
              'Reconstruidas desde cero. Las panorámicas se abren más rápido, se mueven con fluidez y ya no aparecen en blanco.',
        ),
        ChangeLogEntryStrings(
          title: 'Copias de seguridad que no se atascan',
          description:
              'Si tu dispositivo se queda sin espacio durante una copia de seguridad, Ente te avisa y la reanuda desde donde se quedó en cuanto hayas liberado algo de espacio.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Transmisión simplificada',
          description:
              'En Android, las pantallas son más fáciles de encontrar y, en iOS, se vinculan automáticamente. Sin configuración adicional.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Silencio que se recuerda',
          description:
              'Silencia un vídeo una vez y el siguiente también permanecerá en silencio.',
        ),
        ChangeLogEntryStrings(
          title: '¡y mucho más!',
          description:
              'Vacía la Papelera directamente desde Liberar espacio, disfruta de un bloqueo de aplicación más fluido y fiable, marca como favoritas las fotos compartidas en los recuerdos, encuentra el chino tradicional en la lista de idiomas, desliza con más fluidez en el visor de fotos y aprovecha las correcciones para subir contenido a varios álbumes y elegir archivos multimedia de la tarjeta SD en otras aplicaciones.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'fr': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Des suggestions de visages plus rapides et plus précises',
          description:
              'Le traitement d’image est désormais 5 à 10 fois plus rapide ! De plus, les visages flous ou inclinés ne perturbent plus vos groupes de personnes, et nous mémoriserons les visages que vous avez déjà ignorés.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramas, nouvelle génération',
          description:
              'Entièrement reconstruits. Les panoramas s’ouvrent plus vite, se déplacent en toute fluidité et ne s’affichent plus vides.',
        ),
        ChangeLogEntryStrings(
          title: 'Des sauvegardes qui ne restent pas bloquées',
          description:
              'Si votre appareil manque d’espace en cours de sauvegarde, Ente vous prévient désormais et reprend là où elle s’était arrêtée dès que vous avez libéré de l’espace.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Diffusion simplifiée',
          description:
              'Les écrans sont plus faciles à trouver sous Android et s’associent automatiquement sous iOS. Aucune configuration supplémentaire.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Le mode silencieux, mémorisé',
          description:
              'Coupez le son d’une vidéo une fois, et la suivante restera également muette.',
        ),
        ChangeLogEntryStrings(
          title: 'et bien plus encore !',
          description:
              'Videz votre Corbeille directement depuis Libérer de l’espace, profitez d’un verrouillage de l’application plus fluide et plus fiable, ajoutez aux favoris les photos partagées dans les souvenirs, retrouvez le chinois traditionnel dans la liste des langues, parcourez la visionneuse de photos plus facilement et profitez de correctifs pour l’envoi vers plusieurs albums et la sélection de médias de la carte SD dans d’autres applications.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'it': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Suggerimenti di volti più rapidi e precisi',
          description:
              'L’elaborazione delle immagini ora è da 5 a 10 volte più veloce! Inoltre, i volti sfocati o ruotati di lato non confondono più i tuoi gruppi di persone e ricorderemo i volti che hai già ignorato.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramiche, rinate',
          description:
              'Ricostruite da zero. Le panoramiche si aprono più velocemente, si muovono con fluidità e non appaiono più vuote.',
        ),
        ChangeLogEntryStrings(
          title: 'Backup che non si bloccano',
          description:
              'Se il dispositivo esaurisce lo spazio durante un backup, Ente ora ti avvisa e riprende da dove si era interrotto non appena avrai liberato un po’ di spazio.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Trasmissione su schermo, semplificata',
          description:
              'Su Android è più facile trovare gli schermi, mentre su iOS si abbinano automaticamente. Nessuna configurazione aggiuntiva.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Il silenzioso resta attivo',
          description:
              'Disattiva l’audio di un video una volta e resterà disattivato anche per il successivo.',
        ),
        ChangeLogEntryStrings(
          title: 'e molto altro!',
          description:
              'Svuota il Cestino direttamente da Libera spazio, usa un blocco app più fluido e affidabile, aggiungi ai preferiti le foto condivise nei ricordi, trova il cinese tradizionale nell’elenco delle lingue, scorri più fluidamente nel visualizzatore di foto e approfitta delle correzioni per il caricamento in più album e la selezione dei contenuti della scheda SD in altre app.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'ja': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'より速く、より正確な顔の候補',
          description:
              '画像処理が5～10倍高速になりました！さらに、ぼやけた顔や横向きの顔が人物グループに混ざらなくなり、すでに除外した顔も記憶されます。',
        ),
        ChangeLogEntryStrings(
          title: 'パノラマを一新',
          description: 'ゼロから作り直しました。パノラマがより速く開き、滑らかに動作し、真っ白に表示されることもなくなりました。',
        ),
        ChangeLogEntryStrings(
          title: '止まらないバックアップ',
          description:
              'バックアップ中に端末の空き容量が不足すると、Enteがお知らせし、空き容量を確保した後に中断したところから再開します。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'キャストをシンプルに',
          description: 'Androidでは画面を見つけやすくなり、iOSでは自動でペアリングされます。追加の設定は必要ありません。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'ミュート設定を記憶',
          description: '一度動画をミュートにすると、次の動画でもミュートのままになります。',
        ),
        ChangeLogEntryStrings(
          title: 'ほかにも！',
          description:
              '「スペースを解放する」から直接ゴミ箱を空にできるようになったほか、よりスムーズで信頼性の高いアプリロック、思い出内の共有写真のお気に入り登録、繁体字中国語の言語リストへの追加、写真ビューアでのより滑らかなスワイプ、複数のアルバムへのアップロードや他のアプリでのSDカード内メディアの選択に関する修正を行いました。',
          isOnlineOnly: true,
        ),
      ],
    ),
    'nl': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Snellere, scherpere gezichtssuggesties',
          description:
              'De beeldverwerking is nu 5–10 keer zo snel! Bovendien vertroebelen onscherpe en gedraaide gezichten je persoonsgroepen niet meer en onthouden we welke gezichten je al hebt afgewezen.',
        ),
        ChangeLogEntryStrings(
          title: 'Panorama’s, herboren',
          description:
              'Helemaal opnieuw opgebouwd. Panorama’s openen sneller, bewegen soepel en worden niet meer blanco weergegeven.',
        ),
        ChangeLogEntryStrings(
          title: 'Back-ups die niet vastlopen',
          description:
              'Als de opslagruimte op je apparaat tijdens een back-up opraakt, laat Ente je dat nu weten en gaat de back-up verder waar die was gebleven zodra je wat ruimte hebt vrijgemaakt.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Casten, vereenvoudigd',
          description:
              'Schermen zijn gemakkelijker te vinden op Android en worden automatisch gekoppeld op iOS. Geen extra configuratie.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Dempen, onthouden',
          description:
              'Demp een video één keer en ook de volgende blijft gedempt.',
        ),
        ChangeLogEntryStrings(
          title: 'en nog veel meer!',
          description:
              'Leeg je Prullenbak rechtstreeks vanuit Ruimte vrijmaken, gebruik een soepelere en betrouwbaardere app-vergrendeling, voeg gedeelde foto’s in herinneringen toe aan je favorieten, kies Traditioneel Chinees in de talenlijst, veeg soepeler door de fotoviewer en profiteer van oplossingen voor uploaden naar meerdere albums en het kiezen van media op een SD-kaart in andere apps.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'no': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Raskere og skarpere ansiktsforslag',
          description:
              'Bildebehandlingen er nå 5–10 ganger raskere! I tillegg vil ikke uskarpe og sidelengs ansikter lenger rote til persongruppene dine, og vi husker ansiktene du allerede har avvist.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramaer, gjenfødt',
          description:
              'Bygget opp helt fra bunnen av. Panoramaer åpnes raskere, beveger seg jevnt og vises ikke lenger tomme.',
        ),
        ChangeLogEntryStrings(
          title: 'Sikkerhetskopier som ikke setter seg fast',
          description:
              'Hvis enheten din går tom for lagringsplass under sikkerhetskopiering, sier Ente fra og fortsetter der den slapp så snart du har frigjort litt plass.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Enklere casting',
          description:
              'Det er enklere å finne skjermer på Android, og på iOS sammenkobles de automatisk. Ingen ekstra oppsett.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Demping, husket',
          description:
              'Demp en video én gang, så forblir også den neste dempet.',
        ),
        ChangeLogEntryStrings(
          title: 'og mye mer!',
          description:
              'Tøm Papirkurv direkte fra Frigjør lagringsplass, bruk en jevnere og mer pålitelig applås, merk delte bilder i minner som favoritter, finn tradisjonell kinesisk i språklisten, sveip jevnere i bildevisningen, og få rettelser for opplasting til flere album og valg av medier fra SD-kort i andre apper.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'pl': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Szybsze i trafniejsze sugestie twarzy',
          description:
              'Przetwarzanie obrazów jest teraz 5–10 razy szybsze! Ponadto rozmazane i obrócone bokiem twarze nie zaburzają już grup osób, a twarze, które zostały już odrzucone, zostaną zapamiętane.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramy od nowa',
          description:
              'Przebudowane od podstaw. Panoramy otwierają się szybciej, przesuwają płynnie i nie wyświetlają się już jako puste.',
        ),
        ChangeLogEntryStrings(
          title: 'Kopie zapasowe, które się nie zacinają',
          description:
              'Jeśli podczas tworzenia kopii zapasowej na urządzeniu zabraknie miejsca, Ente teraz Cię o tym poinformuje i po zwolnieniu miejsca wznowi pracę od momentu, w którym została przerwana.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Prostsze przesyłanie na ekran',
          description:
              'W Androidzie ekrany łatwiej znaleźć, a w iOS parują się automatycznie. Bez dodatkowej konfiguracji.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Wyciszenie zapamiętane',
          description:
              'Wycisz film raz, a następny również pozostanie wyciszony.',
        ),
        ChangeLogEntryStrings(
          title: 'i wiele więcej!',
          description:
              'Opróżnianie Kosza bezpośrednio z opcji Zwolnij miejsce, płynniejsza i bardziej niezawodna blokada aplikacji, dodawanie do ulubionych udostępnionych zdjęć ze wspomnień, tradycyjny chiński na liście języków, płynniejsze przesuwanie w przeglądarce zdjęć oraz poprawki przesyłania do wielu albumów i wybierania multimediów z karty SD w innych aplikacjach.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'pt_BR': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Sugestões de rostos mais rápidas e precisas',
          description:
              'O processamento de imagens agora é de 5 a 10 vezes mais rápido! Além disso, rostos desfocados ou de lado não atrapalham mais seus grupos de pessoas, e vamos lembrar quais rostos você já dispensou.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramas, renovados',
          description:
              'Reconstruídos do zero. Os panoramas abrem mais rápido, movem-se com fluidez e não aparecem mais em branco.',
        ),
        ChangeLogEntryStrings(
          title: 'Backups que não travam',
          description:
              'Se o seu dispositivo ficar sem espaço durante um backup, o Ente agora avisa e retoma de onde parou assim que você liberar um pouco de espaço.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Transmissão simplificada',
          description:
              'No Android, é mais fácil encontrar telas; no iOS, elas são pareadas automaticamente. Sem configuração extra.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'O modo mudo fica salvo',
          description:
              'Silencie um vídeo uma vez e o próximo também ficará sem som.',
        ),
        ChangeLogEntryStrings(
          title: 'e muito mais!',
          description:
              'Esvazie a Lixeira direto em Liberar espaço, use um bloqueio do aplicativo mais fluido e confiável, favorite fotos compartilhadas nas memórias, encontre o chinês tradicional na lista de idiomas, deslize com mais fluidez no visualizador de fotos e aproveite as correções para uploads em vários álbuns e para selecionar mídias do cartão SD em outros aplicativos.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'pt_PT': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Sugestões de rostos mais rápidas e precisas',
          description:
              'O processamento de imagens é agora 5 a 10 vezes mais rápido! Além disso, os rostos desfocados ou de lado já não baralham os seus grupos de pessoas, e vamos recordar os rostos que já dispensou.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramas, renascidos',
          description:
              'Reconstruídos de raiz. Os panoramas abrem mais depressa, movem-se com fluidez e já não aparecem em branco.',
        ),
        ChangeLogEntryStrings(
          title: 'Cópias de segurança que não ficam bloqueadas',
          description:
              'Se o seu dispositivo ficar sem espaço durante uma cópia de segurança, o Ente avisa-o agora e retoma a partir de onde parou assim que libertar algum espaço.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Transmissão simplificada',
          description:
              'No Android, é mais fácil encontrar ecrãs; no iOS, estes são emparelhados automaticamente. Sem configuração adicional.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Silêncio, memorizado',
          description:
              'Silencie um vídeo uma vez e o seguinte também ficará sem som.',
        ),
        ChangeLogEntryStrings(
          title: 'e muito mais!',
          description:
              'Esvazie a Lixeira diretamente em Libertar espaço, use um bloqueio da aplicação mais fluido e fiável, marque como favoritas as fotografias partilhadas nas memórias, encontre o chinês tradicional na lista de idiomas, deslize mais suavemente no visualizador de fotografias e aproveite as correções nos envios para vários álbuns e na seleção de conteúdos do cartão SD noutras aplicações.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'ro': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Sugestii de fețe mai rapide și mai precise',
          description:
              'Procesarea imaginilor este acum de 5–10 ori mai rapidă! În plus, fețele neclare sau întoarse într-o parte nu vă mai încurcă grupurile de persoane, iar noi vom reține fețele pe care le-ați respins deja.',
        ),
        ChangeLogEntryStrings(
          title: 'Panorame, renăscute',
          description:
              'Reconstruite de la zero. Panoramele se deschid mai repede, se mișcă fluid și nu mai apar goale.',
        ),
        ChangeLogEntryStrings(
          title: 'Copii de siguranță care nu se blochează',
          description:
              'Dacă dispozitivul rămâne fără spațiu în timpul unei copii de siguranță, Ente vă anunță acum și reia de unde a rămas după ce eliberați puțin spațiu.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Transmitere simplificată',
          description:
              'Ecranele sunt mai ușor de găsit pe Android și se asociază automat pe iOS. Fără configurare suplimentară.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Sunet dezactivat, setare reținută',
          description:
              'Dezactivați sunetul unui videoclip o dată, iar următorul va rămâne și el fără sunet.',
        ),
        ChangeLogEntryStrings(
          title: 'și multe altele!',
          description:
              'Goliți Coșul de gunoi direct din Eliberați spațiu, folosiți o blocare a aplicației mai fluidă și mai fiabilă, adăugați la favorite fotografiile partajate din amintiri, găsiți chineza tradițională în lista de limbi, glisați mai fluid în vizualizatorul de fotografii și beneficiați de remedieri pentru încărcarea în mai multe albume și selectarea conținutului media de pe cardul SD în alte aplicații.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'ru': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Более быстрые и точные подсказки лиц',
          description:
              'Обработка изображений теперь работает в 5–10 раз быстрее! Кроме того, размытые и повёрнутые набок лица больше не вносят путаницу в группы людей, а мы запомним лица, которые вы уже отклонили.',
        ),
        ChangeLogEntryStrings(
          title: 'Панорамы, рождённые заново',
          description:
              'Полностью переработаны. Панорамы открываются быстрее, плавно перемещаются и больше не отображаются пустыми.',
        ),
        ChangeLogEntryStrings(
          title: 'Резервные копии, которые не застревают',
          description:
              'Если во время резервного копирования на устройстве закончится место, Ente теперь сообщит об этом и продолжит с места остановки, как только вы освободите немного места.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Трансляция стала проще',
          description:
              'На Android экраны теперь проще находить, а на iOS они подключаются автоматически. Никакой дополнительной настройки.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Отключение звука запоминается',
          description:
              'Отключите звук у одного видео — и следующее тоже останется без звука.',
        ),
        ChangeLogEntryStrings(
          title: 'и многое другое!',
          description:
              'Очищайте Корзину прямо из раздела Освободить место, пользуйтесь более плавной и надёжной блокировкой приложения, добавляйте в избранное общие фотографии из воспоминаний, выбирайте традиционный китайский в списке языков, плавнее листайте фотографии в средстве просмотра и получайте исправления загрузки в несколько альбомов и выбора медиафайлов с SD-карты в других приложениях.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'tr': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Daha hızlı, daha isabetli yüz önerileri',
          description:
              'Görüntü işleme artık 5–10 kat daha hızlı! Ayrıca bulanık ve yana dönük yüzler artık kişi gruplarınızı karıştırmıyor ve daha önce reddettiğiniz yüzleri hatırlıyoruz.',
        ),
        ChangeLogEntryStrings(
          title: 'Panoramalar yeniden doğdu',
          description:
              'Baştan sona yeniden geliştirildi. Panoramalar daha hızlı açılıyor, akıcı hareket ediyor ve artık boş görünmüyor.',
        ),
        ChangeLogEntryStrings(
          title: 'Takılıp kalmayan yedeklemeler',
          description:
              'Yedekleme sırasında cihazınızda yer kalmazsa Ente artık sizi bilgilendiriyor ve biraz alan açtıktan sonra kaldığı yerden devam ediyor.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Ekrana yansıtmak artık daha kolay',
          description:
              'Android’de ekranları bulmak daha kolay; iOS’ta ise otomatik olarak eşleştiriliyorlar. Ek kurulum gerekmiyor.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Sessiz ayarı hatırlanıyor',
          description:
              'Bir videonun sesini bir kez kapatın; sonraki video da sessiz kalsın.',
        ),
        ChangeLogEntryStrings(
          title: 've dahası!',
          description:
              'Çöp kutunuzu doğrudan Boş alan bölümünden temizleme, daha akıcı ve güvenilir bir uygulama kilidi, anılardaki paylaşılan fotoğrafları favorilere ekleme, dil listesine eklenen Geleneksel Çince, fotoğraf görüntüleyicide daha akıcı kaydırma, ayrıca birden fazla albüme yükleme ve diğer uygulamalarda SD kart medyası seçmeyle ilgili düzeltmeler.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'uk': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Швидші й точніші пропозиції облич',
          description:
              'Обробка зображень тепер працює в 5–10 разів швидше! Крім того, розмиті й повернуті набік обличчя більше не вносять плутанину у ваші групи людей, а ми запам’ятаємо обличчя, які ви вже відхилили.',
        ),
        ChangeLogEntryStrings(
          title: 'Панорами, народжені наново',
          description:
              'Повністю перебудовані. Панорами відкриваються швидше, рухаються плавно й більше не відображаються порожніми.',
        ),
        ChangeLogEntryStrings(
          title: 'Резервні копії, які не застрягають',
          description:
              'Якщо під час резервного копіювання на пристрої закінчиться місце, Ente тепер повідомить про це й продовжить із місця зупинки, щойно ви звільните трохи простору.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Трансляція стала простішою',
          description:
              'На Android екрани тепер легше знайти, а на iOS вони з’єднуються автоматично. Жодних додаткових налаштувань.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Вимкнення звуку запам’ятовується',
          description:
              'Вимкніть звук одного відео — і наступне теж залишиться без звуку.',
        ),
        ChangeLogEntryStrings(
          title: 'і багато іншого!',
          description:
              'Очищайте Смітник безпосередньо з розділу Звільнити місце, користуйтеся плавнішим і надійнішим блокуванням застосунку, додавайте до улюбленого спільні фотографії зі спогадів, вибирайте традиційну китайську в списку мов, плавніше гортайте у вікні перегляду фотографій, а також отримайте виправлення завантаження до кількох альбомів і вибору медіафайлів із SD-картки в інших застосунках.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'vi': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Gợi ý khuôn mặt nhanh hơn, chính xác hơn',
          description:
              'Khả năng xử lý hình ảnh giờ nhanh gấp 5–10 lần! Ngoài ra, các khuôn mặt bị mờ hoặc nghiêng ngang sẽ không còn làm lẫn lộn các nhóm người, và Ente sẽ ghi nhớ những khuôn mặt bạn đã loại bỏ.',
        ),
        ChangeLogEntryStrings(
          title: 'Ảnh toàn cảnh, tái sinh',
          description:
              'Được xây dựng lại từ đầu. Ảnh toàn cảnh mở nhanh hơn, chuyển động mượt mà và không còn hiển thị trống.',
        ),
        ChangeLogEntryStrings(
          title: 'Sao lưu không còn mắc kẹt',
          description:
              'Nếu thiết bị hết dung lượng giữa chừng khi sao lưu, Ente giờ sẽ thông báo và tiếp tục từ chỗ đã dừng sau khi bạn giải phóng được một ít dung lượng.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Truyền màn hình, đơn giản hơn',
          description:
              'Trên Android, bạn có thể tìm màn hình dễ dàng hơn; trên iOS, màn hình được tự động ghép đôi. Không cần thiết lập thêm.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Ghi nhớ chế độ tắt tiếng',
          description:
              'Tắt tiếng một video một lần và video tiếp theo cũng sẽ tiếp tục tắt tiếng.',
        ),
        ChangeLogEntryStrings(
          title: 'và nhiều hơn nữa!',
          description:
              'Xóa sạch Thùng rác ngay trong Giải phóng dung lượng, sử dụng khóa ứng dụng mượt mà và đáng tin cậy hơn, thêm ảnh được chia sẻ trong kỷ niệm vào mục yêu thích, chọn tiếng Trung phồn thể trong danh sách ngôn ngữ, vuốt mượt mà hơn trong trình xem ảnh, cùng các bản sửa lỗi khi tải lên nhiều album và chọn nội dung trên thẻ SD trong các ứng dụng khác.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'zh_CN': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: '更快、更精准的人脸建议',
          description: '图像处理速度现在提升了 5–10 倍！此外，模糊和侧转的人脸不再干扰人物分组，我们还会记住你已经忽略的人脸。',
        ),
        ChangeLogEntryStrings(
          title: '全景照片，焕然新生',
          description: '从头重构。全景照片打开更快、移动更流畅，也不会再显示为空白。',
        ),
        ChangeLogEntryStrings(
          title: '不再卡住的备份',
          description: '如果设备在备份过程中空间不足，Ente 现在会提醒你，并在你释放一些空间后从中断处继续。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '投屏，更简单',
          description: '在 Android 上更容易找到屏幕，在 iOS 上则会自动配对。无需额外设置。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '静音设置，自动记住',
          description: '将一个视频静音后，下一个视频也会保持静音。',
        ),
        ChangeLogEntryStrings(
          title: '还有更多！',
          description:
              '可直接从“释放空间”清空回收站，应用锁更流畅可靠，可在回忆中收藏共享照片，语言列表新增繁体中文，照片查看器滑动更流畅，以及修复了上传到多个相册和在其他应用中选取 SD 卡媒体的问题。',
          isOnlineOnly: true,
        ),
      ],
    ),
    'zh_TW': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: '更快、更精準的臉孔建議',
          description:
              '影像處理速度現在快了 5–10 倍！此外，模糊或橫向的臉孔不再干擾您的人物分組，而且我們會記住您已忽略的臉孔。',
        ),
        ChangeLogEntryStrings(
          title: '全景照片，煥然一新',
          description: '從頭徹底重建。全景照片開啟速度更快、移動更流暢，也不再顯示空白。',
        ),
        ChangeLogEntryStrings(
          title: '不再卡住的備份',
          description: '如果您的裝置在備份途中耗盡儲存空間，Ente 現在會通知您；釋放一些空間後，備份將從中斷處繼續。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '投放，更簡單',
          description: '在 Android 上更容易找到螢幕，iOS 上則會自動配對。無需額外設定。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '記住靜音設定',
          description: '將一部影片設為靜音後，下一部也會維持靜音。',
        ),
        ChangeLogEntryStrings(
          title: '還有更多！',
          description:
              '可直接從「釋放空間」清空垃圾桶、App 鎖定更流暢可靠、在回憶中將共享照片加入最愛、繁體中文加入語言清單、照片檢視器滑動更流暢，並修正上傳至多個相簿和在其他 App 中選取 SD 卡媒體的問題。',
          isOnlineOnly: true,
        ),
      ],
    ),
  };
}

class ChangeLogEntryStrings {
  final String title;
  final String description;
  final bool isOnlineOnly;

  const ChangeLogEntryStrings({
    required this.title,
    required this.description,
    this.isOnlineOnly = false,
  });
}
