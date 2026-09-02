import 'dart:ui';

class ChangeLogStrings {
  final List<ChangeLogEntryStrings> entries;

  const ChangeLogStrings({required this.entries});

  static ChangeLogStrings? maybeForLocale(
    Locale locale, {
    bool isLocalGallery = false,
    required bool isAndroid,
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

    final entries = strings.entries
        .where((entry) => !entry.isAndroidOnly || isAndroid)
        .where(
          (entry) =>
              isLocalGallery ? !entry.isOnlineOnly : !entry.isLocalGalleryOnly,
        )
        .toList(growable: false);
    return entries.isEmpty ? null : ChangeLogStrings(entries: entries);
  }

  static bool hasContentForLocale(
    Locale locale, {
    bool isLocalGallery = false,
    required bool isAndroid,
  }) {
    return maybeForLocale(
          locale,
          isLocalGallery: isLocalGallery,
          isAndroid: isAndroid,
        ) !=
        null;
  }

  static const Map<String, ChangeLogStrings> _translations = {
    'en': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Library sharing',
          description:
              'Share your current and future albums with family members automatically. Head to Settings → Family, pick a member, and tap Share albums.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Faster, everywhere',
          description:
              'Search, the map, and gallery scrolling are faster on large libraries.',
        ),
        ChangeLogEntryStrings(
          title: 'Location search',
          description:
              'You can now search by country and cities, with improved accuracy.',
        ),
        ChangeLogEntryStrings(
          title: 'System trash',
          description:
              'On Android 11 and newer, device photos deleted through Ente Photos move to the system trash and can be recovered from the app.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Album descriptions',
          description:
              'You can now add descriptions to albums that will reflect on shared links as well.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Album slideshows',
          description:
              'Convert your old tablet into a photo frame with album slideshows.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Edits that keep more',
          description:
              'Edited photos now keep key camera, date, and location details. JPEGs also retain their original quality when you only rotate or flip them.',
        ),
        ChangeLogEntryStrings(
          title: 'Better video playback',
          description:
              'Double-tap either side of a video to seek five seconds. You can also choose a playback speed.',
        ),
        ChangeLogEntryStrings(
          title: 'and more!',
          description:
              "We've added some music to memories that we composed. Also, smart albums work better, freeing up space is more reliable, and backup status shows progress for each file.",
          isOnlineOnly: true,
        ),
      ],
    ),
    'ca': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Compartició de la biblioteca',
          description:
              "Comparteix automàticament els àlbums actuals i futurs amb els membres de la família. Ves a Configuració → Família, tria un membre i toca Comparteix àlbums.",
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Més ràpid, a tot arreu',
          description:
              'La cerca, el mapa i el desplaçament per la galeria són més ràpids en biblioteques grans.',
        ),
        ChangeLogEntryStrings(
          title: 'Cerca per ubicació',
          description: 'Ara pots cercar per països i ciutats amb més precisió.',
        ),
        ChangeLogEntryStrings(
          title: 'Paperera del sistema',
          description:
              "A Android 11 i versions posteriors, les fotos del dispositiu que suprimeixes amb Ente Photos es mouen a la paperera del sistema i es poden recuperar des de l'aplicació.",
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Descripcions dels àlbums',
          description:
              'Ara pots afegir descripcions als àlbums, que també es mostraran als enllaços compartits.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: "Presentacions d'àlbums",
          description:
              "Converteix la teva tauleta antiga en un marc de fotos amb les presentacions d'àlbums.",
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Edicions que conserven més',
          description:
              'Les fotos editades ara conserven les dades clau de la càmera, la data i la ubicació. Els JPEG també mantenen la qualitat original quan només els rotes o els gires.',
        ),
        ChangeLogEntryStrings(
          title: 'Millor reproducció de vídeo',
          description:
              "Toca dues vegades qualsevol costat d'un vídeo per avançar o retrocedir cinc segons. També pots triar la velocitat de reproducció.",
        ),
        ChangeLogEntryStrings(
          title: 'I més coses!',
          description:
              "Hem afegit als Records música composta per nosaltres. A més, els Àlbums intel·ligents funcionen millor, Allibera espai és més fiable i l'Estat de la còpia de seguretat mostra el progrés de cada fitxer.",
          isOnlineOnly: true,
        ),
      ],
    ),
    'cs': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Sdílení knihovny',
          description:
              'Automaticky sdílejte svá současná i budoucí alba s členy rodiny. Přejděte do Nastavení → Rodina, vyberte člena a klepněte na Sdílet alba.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Rychlejší všude',
          description:
              'Vyhledávání, mapa a posouvání v galerii jsou u velkých knihoven rychlejší.',
        ),
        ChangeLogEntryStrings(
          title: 'Vyhledávání podle polohy',
          description:
              'Nově můžete s vyšší přesností vyhledávat podle zemí a měst.',
        ),
        ChangeLogEntryStrings(
          title: 'Systémový koš',
          description:
              'V systému Android 11 a novějším se fotografie v zařízení smazané prostřednictvím Ente Photos přesunou do systémového koše a lze je obnovit v aplikaci.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Popisy alb',
          description:
              'Nyní můžete k albům přidávat popisy, které se zobrazí také ve sdílených odkazech.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Prezentace alb',
          description:
              'Proměňte starý tablet ve fotorámeček pomocí prezentací alb.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Úpravy, které zachovají více',
          description:
              'Upravené fotografie si nyní zachovají klíčové údaje o fotoaparátu, datu a poloze. Soubory JPEG si také zachovají původní kvalitu, pokud je pouze otočíte nebo překlopíte.',
        ),
        ChangeLogEntryStrings(
          title: 'Lepší přehrávání videa',
          description:
              'Poklepáním na kteroukoli stranu videa se posunete o pět sekund vpřed nebo vzad. Můžete také zvolit rychlost přehrávání.',
        ),
        ChangeLogEntryStrings(
          title: 'A mnohem více!',
          description:
              'Do Vzpomínek jsme přidali hudbu, kterou jsme sami složili. Chytrá alba navíc fungují lépe, funkce Uvolnit místo je spolehlivější a Stav zálohování zobrazuje průběh každého souboru.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'de': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Bibliothek teilen',
          description:
              'Teile deine aktuellen und zukünftigen Alben automatisch mit Familienmitgliedern. Gehe zu Einstellungen → Familie, wähle ein Mitglied aus und tippe auf Alben teilen.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Schneller, überall',
          description:
              'Suche, Karte und Scrollen in der Galerie sind bei großen Bibliotheken schneller.',
        ),
        ChangeLogEntryStrings(
          title: 'Ortssuche',
          description:
              'Du kannst jetzt mit verbesserter Genauigkeit nach Ländern und Städten suchen.',
        ),
        ChangeLogEntryStrings(
          title: 'Systempapierkorb',
          description:
              'Unter Android 11 und neuer werden Gerätefotos, die über Ente Photos gelöscht werden, in den Systempapierkorb verschoben und können in der App wiederhergestellt werden.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Albumbeschreibungen',
          description:
              'Du kannst Alben jetzt Beschreibungen hinzufügen, die auch in geteilten Links angezeigt werden.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Album-Diashows',
          description:
              'Verwandle dein altes Tablet mit Album-Diashows in einen digitalen Bilderrahmen.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Bearbeitungen, die mehr bewahren',
          description:
              'Bearbeitete Fotos behalten jetzt wichtige Kamera-, Datums- und Standortinformationen. JPEGs behalten außerdem ihre Originalqualität, wenn du sie nur drehst oder spiegelst.',
        ),
        ChangeLogEntryStrings(
          title: 'Bessere Videowiedergabe',
          description:
              'Tippe doppelt auf eine der beiden Seiten eines Videos, um fünf Sekunden vor- oder zurückzuspringen. Du kannst auch die Wiedergabegeschwindigkeit wählen.',
        ),
        ChangeLogEntryStrings(
          title: 'Und mehr!',
          description:
              'Wir haben den Erinnerungen von uns komponierte Musik hinzugefügt. Außerdem funktionieren Smart-Alben besser, Speicherplatz freigeben ist zuverlässiger und der Sicherungsstatus zeigt den Fortschritt jeder Datei an.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'es': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Uso compartido de la biblioteca',
          description:
              'Comparte automáticamente tus álbumes actuales y futuros con tus familiares. Ve a Configuración → Familia, elige a un miembro y toca Compartir álbumes.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Más rápido, en todas partes',
          description:
              'La búsqueda, el mapa y el desplazamiento por la galería son más rápidos en bibliotecas grandes.',
        ),
        ChangeLogEntryStrings(
          title: 'Búsqueda por ubicación',
          description:
              'Ahora puedes buscar por países y ciudades con mayor precisión.',
        ),
        ChangeLogEntryStrings(
          title: 'Papelera del sistema',
          description:
              'En Android 11 y versiones posteriores, las fotos del dispositivo que elimines mediante Ente Photos se mueven a la papelera del sistema y pueden recuperarse desde la aplicación.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Descripciones de álbumes',
          description:
              'Ahora puedes añadir descripciones a los álbumes, que también se mostrarán en los enlaces compartidos.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Presentaciones de álbumes',
          description:
              'Convierte tu antigua tableta en un marco de fotos con las presentaciones de álbumes.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Ediciones que conservan más',
          description:
              'Las fotos editadas ahora conservan datos clave de la cámara, la fecha y la ubicación. Los archivos JPEG también mantienen su calidad original cuando solo los giras o volteas.',
        ),
        ChangeLogEntryStrings(
          title: 'Mejor reproducción de vídeo',
          description:
              'Toca dos veces cualquiera de los lados de un vídeo para avanzar o retroceder cinco segundos. También puedes elegir la velocidad de reproducción.',
        ),
        ChangeLogEntryStrings(
          title: '¡Y mucho más!',
          description:
              'Hemos añadido a Recuerdos música compuesta por nosotros. Además, los Álbumes inteligentes funcionan mejor, Liberar espacio es más fiable y el Estado de la copia de seguridad muestra el progreso de cada archivo.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'fr': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Partage de la photothèque',
          description:
              'Partagez automatiquement vos albums actuels et futurs avec les membres de votre famille. Accédez à Paramètres → Famille, choisissez un membre et touchez Partager les albums.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Plus rapide, partout',
          description:
              'La recherche, la carte et le défilement dans la galerie sont plus rapides avec les grandes photothèques.',
        ),
        ChangeLogEntryStrings(
          title: 'Recherche par lieu',
          description:
              'Vous pouvez désormais rechercher par pays et par ville avec une meilleure précision.',
        ),
        ChangeLogEntryStrings(
          title: 'Corbeille du système',
          description:
              'Sous Android 11 et les versions ultérieures, les photos de l’appareil supprimées via Ente Photos sont placées dans la corbeille du système et peuvent être récupérées depuis l’application.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Descriptions d’albums',
          description:
              'Vous pouvez désormais ajouter des descriptions aux albums. Elles apparaîtront également dans les liens partagés.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Diaporamas d’albums',
          description:
              'Transformez votre ancienne tablette en cadre photo grâce aux diaporamas d’albums.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Des modifications qui préservent davantage',
          description:
              'Les photos modifiées conservent désormais les principales informations relatives à l’appareil photo, à la date et au lieu. Les JPEG conservent également leur qualité d’origine lorsque vous les faites uniquement pivoter ou retourner.',
        ),
        ChangeLogEntryStrings(
          title: 'Meilleure lecture vidéo',
          description:
              'Touchez deux fois l’un des côtés d’une vidéo pour avancer ou reculer de cinq secondes. Vous pouvez également choisir la vitesse de lecture.',
        ),
        ChangeLogEntryStrings(
          title: 'Et plus encore !',
          description:
              'Nous avons ajouté aux Souvenirs de la musique composée par nos soins. De plus, les Albums intelligents fonctionnent mieux, Libérer de l’espace est plus fiable et l’État de la sauvegarde affiche la progression de chaque fichier.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'it': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Condivisione della libreria',
          description:
              'Condividi automaticamente gli album attuali e futuri con i membri della famiglia. Vai su Impostazioni → Famiglia, scegli un membro e tocca Condividi album.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Più veloce, ovunque',
          description:
              'La ricerca, la mappa e lo scorrimento della galleria sono più veloci nelle librerie di grandi dimensioni.',
        ),
        ChangeLogEntryStrings(
          title: 'Ricerca per località',
          description:
              'Ora puoi effettuare ricerche per Paese e città con maggiore precisione.',
        ),
        ChangeLogEntryStrings(
          title: 'Cestino di sistema',
          description:
              "Su Android 11 e versioni successive, le foto del dispositivo eliminate tramite Ente Photos vengono spostate nel cestino di sistema e possono essere recuperate dall'app.",
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Descrizioni degli album',
          description:
              'Ora puoi aggiungere descrizioni agli album, che verranno visualizzate anche nei link condivisi.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Presentazioni degli album',
          description:
              'Trasforma il tuo vecchio tablet in una cornice digitale con le presentazioni degli album.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Modifiche che conservano di più',
          description:
              'Le foto modificate ora conservano i dati principali su fotocamera, data e luogo. Anche i JPEG mantengono la qualità originale quando li ruoti o li capovolgi soltanto.',
        ),
        ChangeLogEntryStrings(
          title: 'Migliore riproduzione video',
          description:
              'Tocca due volte uno dei lati di un video per spostarti avanti o indietro di cinque secondi. Puoi anche scegliere la velocità di riproduzione.',
        ),
        ChangeLogEntryStrings(
          title: 'E non è tutto!',
          description:
              "Abbiamo aggiunto ai Ricordi un po' di musica composta da noi. Inoltre, gli Album intelligenti funzionano meglio, Libera spazio è più affidabile e Stato backup mostra l'avanzamento di ogni file.",
          isOnlineOnly: true,
        ),
      ],
    ),
    'ja': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'ライブラリ共有',
          description:
              '現在および今後作成するアルバムを家族と自動的に共有できます。［設定］→［ファミリー］でメンバーを選び、［アルバムを共有］をタップしてください。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'どこでも、より高速に',
          description: '大規模なライブラリで、検索、地図、ギャラリーのスクロールが高速になりました。',
        ),
        ChangeLogEntryStrings(
          title: '位置情報検索',
          description: '国や都市で検索できるようになり、精度も向上しました。',
        ),
        ChangeLogEntryStrings(
          title: 'システムのゴミ箱',
          description:
              'Android 11 以降では、Ente Photos から削除した端末上の写真はシステムのゴミ箱に移動し、アプリから復元できます。',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'アルバムの説明',
          description: 'アルバムに説明を追加できるようになりました。説明は共有リンクにも表示されます。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'アルバムのスライドショー',
          description: 'アルバムのスライドショーを使えば、古いタブレットをフォトフレームとして活用できます。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'より多くの情報を残す編集',
          description:
              '編集した写真で、カメラ、撮影日、場所の重要な情報が保持されるようになりました。JPEGは、回転または反転のみを行った場合、元の画質も維持されます。',
        ),
        ChangeLogEntryStrings(
          title: '動画再生の改善',
          description: '動画の左右どちらかをダブルタップすると、5秒早送りまたは巻き戻しできます。再生速度も選べます。',
        ),
        ChangeLogEntryStrings(
          title: 'ほかにも！',
          description:
              'Enteが作曲した音楽を思い出に追加しました。また、スマートアルバムの機能が向上し、「スペースを解放する」の信頼性が高まり、「バックアップの状態」でファイルごとの進捗を確認できるようになりました。',
          isOnlineOnly: true,
        ),
      ],
    ),
    'nl': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Bibliotheek delen',
          description:
              'Deel je huidige en toekomstige albums automatisch met gezinsleden. Ga naar Instellingen → Familie, kies een lid en tik op Albums delen.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Sneller, overal',
          description:
              'Zoeken, de kaart en scrollen door de galerij zijn sneller bij grote bibliotheken.',
        ),
        ChangeLogEntryStrings(
          title: 'Zoeken op locatie',
          description: 'Je kunt nu nauwkeuriger zoeken op landen en steden.',
        ),
        ChangeLogEntryStrings(
          title: 'Systeemprullenbak',
          description:
              "Op Android 11 en nieuwer worden apparaatfoto's die je via Ente Photos verwijdert naar de systeemprullenbak verplaatst en kun je ze vanuit de app herstellen.",
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Albumbeschrijvingen',
          description:
              'Je kunt nu beschrijvingen aan albums toevoegen. Deze worden ook in gedeelde links weergegeven.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Diavoorstellingen van albums',
          description:
              'Verander je oude tablet in een fotolijst met diavoorstellingen van albums.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Bewerkingen die meer behouden',
          description:
              "Bewerkte foto's behouden nu belangrijke camera-, datum- en locatiegegevens. JPEG's behouden ook hun oorspronkelijke kwaliteit als je ze alleen roteert of omdraait.",
        ),
        ChangeLogEntryStrings(
          title: 'Betere videoweergave',
          description:
              'Dubbeltik aan een van beide kanten van een video om vijf seconden vooruit of terug te springen. Je kunt ook een afspeelsnelheid kiezen.',
        ),
        ChangeLogEntryStrings(
          title: 'En meer!',
          description:
              'We hebben muziek die we zelf hebben gecomponeerd aan Herinneringen toegevoegd. Ook werken Slimme albums beter, is Ruimte vrijmaken betrouwbaarder en toont Back-up status de voortgang per bestand.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'no': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Deling av bibliotek',
          description:
              'Del nåværende og fremtidige album automatisk med familiemedlemmer. Gå til Innstillinger → Familie, velg et medlem og trykk på Del album.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Raskere, overalt',
          description:
              'Søk, kartet og rulling i galleriet er raskere for store biblioteker.',
        ),
        ChangeLogEntryStrings(
          title: 'Stedssøk',
          description:
              'Du kan nå søke etter land og byer med bedre nøyaktighet.',
        ),
        ChangeLogEntryStrings(
          title: 'Systemets papirkurv',
          description:
              'På Android 11 og nyere flyttes enhetsbilder som slettes gjennom Ente Photos, til systemets papirkurv og kan gjenopprettes fra appen.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Albumbeskrivelser',
          description:
              'Du kan nå legge til beskrivelser i album. De vises også i delte lenker.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Lysbildefremvisning av album',
          description:
              'Gjør det gamle nettbrettet ditt om til en fotoramme med lysbildefremvisninger av album.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Redigeringer som beholder mer',
          description:
              'Redigerte bilder beholder nå viktige kamera-, dato- og plasseringsdetaljer. JPEG-filer beholder også originalkvaliteten når du bare roterer eller speilvender dem.',
        ),
        ChangeLogEntryStrings(
          title: 'Bedre videoavspilling',
          description:
              'Dobbelttrykk på en av sidene i en video for å hoppe fem sekunder frem eller tilbake. Du kan også velge avspillingshastighet.',
        ),
        ChangeLogEntryStrings(
          title: 'Og mer!',
          description:
              'Vi har lagt til musikk vi har komponert i Minner. Dessuten fungerer Smarte album bedre, Frigjør lagringsplass er mer pålitelig, og Status for sikkerhetskopi viser fremdriften for hver fil.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'pl': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Udostępnianie biblioteki',
          description:
              'Automatycznie udostępniaj rodzinie swoje obecne i przyszłe albumy. Przejdź do Ustawienia → Rodzina, wybierz osobę i stuknij Udostępnij albumy.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Szybciej wszędzie',
          description:
              'Wyszukiwanie, mapa i przewijanie galerii działają szybciej przy dużych bibliotekach.',
        ),
        ChangeLogEntryStrings(
          title: 'Wyszukiwanie według lokalizacji',
          description:
              'Teraz możesz wyszukiwać według krajów i miast z większą dokładnością.',
        ),
        ChangeLogEntryStrings(
          title: 'Kosz systemowy',
          description:
              'W systemie Android 11 i nowszym zdjęcia z urządzenia usunięte za pośrednictwem Ente Photos trafiają do kosza systemowego i można je przywrócić w aplikacji.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Opisy albumów',
          description:
              'Teraz możesz dodawać opisy do albumów. Będą one również widoczne w udostępnionych linkach.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Pokazy slajdów z albumów',
          description:
              'Zmień swój stary tablet w ramkę cyfrową dzięki pokazom slajdów z albumów.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Edycje, które zachowują więcej',
          description:
              'Edytowane zdjęcia zachowują teraz kluczowe informacje o aparacie, dacie i lokalizacji. Pliki JPEG zachowują również oryginalną jakość, gdy jedyną zmianą jest ich obrócenie lub odwrócenie.',
        ),
        ChangeLogEntryStrings(
          title: 'Lepsze odtwarzanie filmów',
          description:
              'Stuknij dwukrotnie po dowolnej stronie filmu, aby przewinąć o pięć sekund do przodu lub do tyłu. Możesz też wybrać szybkość odtwarzania.',
        ),
        ChangeLogEntryStrings(
          title: 'I jeszcze więcej!',
          description:
              'Do Wspomnień dodaliśmy skomponowaną przez nas muzykę. Ponadto Inteligentne albumy działają lepiej, funkcja Zwolnij miejsce jest bardziej niezawodna, a Status kopii zapasowej pokazuje postęp każdego pliku.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'pt_BR': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Compartilhamento da biblioteca',
          description:
              'Compartilhe automaticamente seus álbuns atuais e futuros com familiares. Acesse Opções → Família, escolha uma pessoa e toque em Compartilhar álbuns.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Mais rápido em todos os lugares',
          description:
              'A pesquisa, o mapa e a rolagem da galeria estão mais rápidos em bibliotecas grandes.',
        ),
        ChangeLogEntryStrings(
          title: 'Pesquisa por localização',
          description:
              'Agora você pode buscar por países e cidades com mais precisão.',
        ),
        ChangeLogEntryStrings(
          title: 'Lixeira do sistema',
          description:
              'No Android 11 e versões mais recentes, as fotos do dispositivo excluídas por meio do Ente Photos são movidas para a lixeira do sistema e podem ser recuperadas no aplicativo.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Descrições de álbuns',
          description:
              'Agora você pode adicionar descrições aos álbuns, que também serão exibidas nos links compartilhados.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Apresentações de slides dos álbuns',
          description:
              'Transforme seu tablet antigo em um porta-retrato com apresentações de slides dos álbuns.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Edições que preservam mais',
          description:
              'As fotos editadas agora preservam detalhes importantes da câmera, da data e da localização. Os JPEGs também mantêm a qualidade original quando você apenas os gira ou inverte.',
        ),
        ChangeLogEntryStrings(
          title: 'Melhor reprodução de vídeo',
          description:
              'Toque duas vezes em um dos lados do vídeo para avançar ou voltar cinco segundos. Você também pode escolher a velocidade de reprodução.',
        ),
        ChangeLogEntryStrings(
          title: 'E muito mais!',
          description:
              'Adicionamos às Memórias músicas que compusemos. Além disso, os Álbuns inteligentes funcionam melhor, Liberar espaço está mais confiável e o Estado do backup mostra o progresso de cada arquivo.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'pt_PT': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Partilha da biblioteca',
          description:
              'Partilhe automaticamente os seus álbuns atuais e futuros com familiares. Aceda a Definições → Família, escolha um membro e toque em Partilhar álbuns.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Mais rápido em todo o lado',
          description:
              'A pesquisa, o mapa e o deslocamento na galeria são mais rápidos em bibliotecas grandes.',
        ),
        ChangeLogEntryStrings(
          title: 'Pesquisa por localização',
          description:
              'Agora pode pesquisar por países e cidades com maior precisão.',
        ),
        ChangeLogEntryStrings(
          title: 'Lixo do sistema',
          description:
              'No Android 11 e versões posteriores, as fotografias do dispositivo eliminadas através do Ente Photos são movidas para o lixo do sistema e podem ser recuperadas a partir da aplicação.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Descrições de álbuns',
          description:
              'Agora pode adicionar descrições aos álbuns, que também serão apresentadas nas ligações partilhadas.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Apresentações de diapositivos dos álbuns',
          description:
              'Transforme o seu tablet antigo numa moldura digital com apresentações de diapositivos dos álbuns.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Edições que preservam mais',
          description:
              'As fotografias editadas preservam agora detalhes importantes da câmara, da data e da localização. Os ficheiros JPEG também mantêm a qualidade original quando apenas os roda ou inverte.',
        ),
        ChangeLogEntryStrings(
          title: 'Melhor reprodução de vídeo',
          description:
              'Toque duas vezes num dos lados do vídeo para avançar ou recuar cinco segundos. Também pode escolher a velocidade de reprodução.',
        ),
        ChangeLogEntryStrings(
          title: 'E muito mais!',
          description:
              'Adicionámos às Memórias música composta por nós. Além disso, os Álbuns inteligentes funcionam melhor, Libertar espaço é mais fiável e o Status da cópia de segurança mostra o progresso de cada ficheiro.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'ro': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Partajarea bibliotecii',
          description:
              'Partajează automat albumele actuale și viitoare cu membrii familiei. Accesează Setări → Familie, alege un membru și atinge Partajează albumele.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Mai rapid, oriunde',
          description:
              'Căutarea, harta și derularea galeriei sunt mai rapide pentru bibliotecile mari.',
        ),
        ChangeLogEntryStrings(
          title: 'Căutare după locație',
          description:
              'Acum poți căuta după țări și orașe cu o precizie mai bună.',
        ),
        ChangeLogEntryStrings(
          title: 'Coșul de gunoi al sistemului',
          description:
              'Pe Android 11 și versiunile ulterioare, fotografiile de pe dispozitiv șterse prin Ente Photos sunt mutate în coșul de gunoi al sistemului și pot fi recuperate din aplicație.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Descrieri pentru albume',
          description:
              'Acum poți adăuga descrieri albumelor, care vor apărea și în linkurile partajate.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Prezentări de diapozitive ale albumelor',
          description:
              'Transformă vechea tabletă într-o ramă foto cu prezentările de diapozitive ale albumelor.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Editări care păstrează mai mult',
          description:
              'Fotografiile editate păstrează acum detaliile esențiale despre cameră, dată și locație. Fișierele JPEG își păstrează și calitatea originală atunci când doar le rotești sau le răstorni.',
        ),
        ChangeLogEntryStrings(
          title: 'Redare video îmbunătățită',
          description:
              'Atinge de două ori oricare dintre laturile unui videoclip pentru a derula înainte sau înapoi cu cinci secunde. De asemenea, poți alege viteza de redare.',
        ),
        ChangeLogEntryStrings(
          title: 'Și altele!',
          description:
              'Am adăugat în Amintiri muzică pe care am compus-o. În plus, Albumele inteligente funcționează mai bine, funcția „Eliberați spațiu” este mai fiabilă, iar „Stare copie de rezervă” afișează progresul fiecărui fișier.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'ru': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Общий доступ к библиотеке',
          description:
              'Автоматически делитесь текущими и будущими альбомами с членами семьи. Откройте Настройки → Семья, выберите участника и нажмите Поделиться альбомами.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Быстрее повсюду',
          description:
              'Поиск, карта и прокрутка галереи стали быстрее для больших библиотек.',
        ),
        ChangeLogEntryStrings(
          title: 'Поиск по местоположению',
          description:
              'Теперь можно с большей точностью искать по странам и городам.',
        ),
        ChangeLogEntryStrings(
          title: 'Системная корзина',
          description:
              'На Android 11 и новее фотографии с устройства, удалённые через Ente Photos, перемещаются в системную корзину, и их можно восстановить в приложении.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Описания альбомов',
          description:
              'Теперь к альбомам можно добавлять описания, которые также будут отображаться в общих ссылках.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Слайд-шоу альбомов',
          description:
              'Превратите старый планшет в цифровую фоторамку с помощью слайд-шоу альбомов.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Больше данных после редактирования',
          description:
              'Отредактированные фотографии теперь сохраняют важные данные о камере, дате и местоположении. Файлы JPEG также сохраняют исходное качество, если вы только поворачиваете или отражаете их.',
        ),
        ChangeLogEntryStrings(
          title: 'Улучшенное воспроизведение видео',
          description:
              'Дважды коснитесь любой стороны видео, чтобы перемотать на пять секунд вперёд или назад. Также можно выбрать скорость воспроизведения.',
        ),
        ChangeLogEntryStrings(
          title: 'И многое другое!',
          description:
              'Мы добавили во Воспоминания музыку, которую сочинили сами. Кроме того, Умные альбомы работают лучше, функция «Освободить место» стала надёжнее, а Статус резервного копирования показывает прогресс для каждого файла.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'tr': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Kütüphane paylaşımı',
          description:
              'Mevcut ve gelecekteki albümlerinizi aile üyeleriyle otomatik olarak paylaşın. Ayarlar → Aile bölümüne gidin, bir üye seçin ve Albümleri paylaş seçeneğine dokunun.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Her yerde daha hızlı',
          description:
              'Büyük kütüphanelerde arama, harita ve galeride kaydırma artık daha hızlı.',
        ),
        ChangeLogEntryStrings(
          title: 'Konum arama',
          description:
              'Artık ülke ve şehirlere göre daha yüksek doğrulukla arama yapabilirsiniz.',
        ),
        ChangeLogEntryStrings(
          title: 'Sistem çöp kutusu',
          description:
              'Android 11 ve sonraki sürümlerde, Ente Photos üzerinden silinen cihaz fotoğrafları sistem çöp kutusuna taşınır ve uygulamadan kurtarılabilir.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Albüm açıklamaları',
          description:
              'Artık albümlere açıklama ekleyebilirsiniz; bu açıklamalar paylaşılan bağlantılarda da gösterilir.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Albüm slayt gösterileri',
          description:
              'Albüm slayt gösterileriyle eski tabletinizi bir dijital fotoğraf çerçevesine dönüştürün.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Daha fazlasını koruyan düzenlemeler',
          description:
              "Düzenlenen fotoğraflar artık temel kamera, tarih ve konum ayrıntılarını koruyor. JPEG'ler de yalnızca döndürdüğünüzde veya çevirdiğinizde özgün kalitesini koruyor.",
        ),
        ChangeLogEntryStrings(
          title: 'Daha iyi video oynatma',
          description:
              'Beş saniye ileri veya geri atlamak için videonun iki yanından birine çift dokunun. Ayrıca oynatma hızını da seçebilirsiniz.',
        ),
        ChangeLogEntryStrings(
          title: 'Ve daha fazlası!',
          description:
              'Anılar’a bestesini bizim yaptığımız müzikler ekledik. Ayrıca Akıllı Albümler daha iyi çalışıyor, Boş alan açma daha güvenilir ve Yedekleme durumu her dosyanın ilerlemesini gösteriyor.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'uk': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Спільний доступ до бібліотеки',
          description:
              'Автоматично діліться поточними й майбутніми альбомами з членами родини. Відкрийте Налаштування → Сім’я, виберіть учасника й натисніть Поділитися альбомами.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Швидше всюди',
          description:
              'Пошук, мапа й прокручування галереї стали швидшими для великих бібліотек.',
        ),
        ChangeLogEntryStrings(
          title: 'Пошук за розташуванням',
          description:
              'Тепер можна з більшою точністю шукати за країнами й містами.',
        ),
        ChangeLogEntryStrings(
          title: 'Системний смітник',
          description:
              'На Android 11 і новіших версіях фотографії з пристрою, видалені через Ente Photos, переміщуються до системного смітника, і їх можна відновити в застосунку.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Описи альбомів',
          description:
              'Тепер до альбомів можна додавати описи, які також відображатимуться в спільних посиланнях.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Слайд-шоу альбомів',
          description:
              'Перетворіть старий планшет на цифрову фоторамку за допомогою слайд-шоу альбомів.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Редагування, що зберігають більше',
          description:
              'Відредаговані фотографії тепер зберігають ключові дані про камеру, дату й розташування. Файли JPEG також зберігають початкову якість, якщо ви лише обертаєте або віддзеркалюєте їх.',
        ),
        ChangeLogEntryStrings(
          title: 'Покращене відтворення відео',
          description:
              'Двічі торкніться будь-якого боку відео, щоб перейти на п’ять секунд уперед або назад. Також можна вибрати швидкість відтворення.',
        ),
        ChangeLogEntryStrings(
          title: 'І не тільки!',
          description:
              'Ми додали до Спогадів музику, яку створили самі. Крім того, Розумні альбоми працюють краще, функція «Звільнити місце» стала надійнішою, а Стан резервного копіювання показує перебіг для кожного файлу.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'vi': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: 'Chia sẻ thư viện',
          description:
              'Tự động chia sẻ các album hiện tại và trong tương lai với thành viên gia đình. Vào Cài đặt → Gia đình, chọn một thành viên rồi nhấn Chia sẻ album.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Nhanh hơn ở mọi nơi',
          description:
              'Tìm kiếm, bản đồ và cuộn thư viện nhanh hơn trên các thư viện lớn.',
        ),
        ChangeLogEntryStrings(
          title: 'Tìm kiếm vị trí',
          description:
              'Giờ đây, bạn có thể tìm kiếm theo quốc gia và thành phố với độ chính xác cao hơn.',
        ),
        ChangeLogEntryStrings(
          title: 'Thùng rác hệ thống',
          description:
              'Trên Android 11 trở lên, ảnh trên thiết bị bị xóa qua Ente Photos sẽ được chuyển vào thùng rác hệ thống và có thể khôi phục trong ứng dụng.',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Mô tả album',
          description:
              'Giờ đây, bạn có thể thêm mô tả cho album. Mô tả cũng sẽ hiển thị trên các liên kết chia sẻ.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Trình chiếu album',
          description:
              'Biến chiếc máy tính bảng cũ thành khung ảnh với trình chiếu album.',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: 'Chỉnh sửa giữ lại nhiều hơn',
          description:
              'Ảnh đã chỉnh sửa giờ đây giữ lại các chi tiết quan trọng về máy ảnh, ngày chụp và vị trí. Tệp JPEG cũng giữ nguyên chất lượng gốc khi bạn chỉ xoay hoặc lật ảnh.',
        ),
        ChangeLogEntryStrings(
          title: 'Phát video tốt hơn',
          description:
              'Nhấn đúp vào một trong hai bên video để tua tiến hoặc lùi năm giây. Bạn cũng có thể chọn tốc độ phát.',
        ),
        ChangeLogEntryStrings(
          title: 'Và còn nhiều hơn thế!',
          description:
              'Chúng tôi đã thêm vào Kỷ niệm một số bản nhạc do chính mình sáng tác. Ngoài ra, Album thông minh hoạt động tốt hơn, Giải phóng dung lượng đáng tin cậy hơn và Trạng thái sao lưu hiển thị tiến trình của từng tệp.',
          isOnlineOnly: true,
        ),
      ],
    ),
    'zh_CN': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: '图库共享',
          description: '自动与家人共享你当前和今后创建的相册。前往“设置”→“家庭”，选择一位成员，然后轻点“共享相册”。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '处处更快',
          description: '在大型图库中，搜索、地图和图库滚动都变得更快。',
        ),
        ChangeLogEntryStrings(
          title: '位置搜索',
          description: '现在可以按国家和城市搜索，准确度也有所提升。',
        ),
        ChangeLogEntryStrings(
          title: '系统回收站',
          description:
              '在 Android 11 及更高版本中，通过 Ente Photos 删除的设备照片会移至系统回收站，并可在应用内恢复。',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '相册描述',
          description: '现在可以为相册添加描述，描述也会显示在共享链接中。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '相册幻灯片',
          description: '利用相册幻灯片，把你的旧平板变成电子相框。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '编辑后保留更多信息',
          description: '编辑后的照片现在会保留相机、日期和位置等关键信息。仅旋转或翻转 JPEG 时，还会保留其原始画质。',
        ),
        ChangeLogEntryStrings(
          title: '视频播放体验升级',
          description: '双击视频任一侧，可前进或后退五秒。你还可以选择播放速度。',
        ),
        ChangeLogEntryStrings(
          title: '还有更多！',
          description:
              '我们为“回忆”加入了一些由我们创作的音乐。此外，智能相册更加好用，“释放空间”更加可靠，“备份状态”会显示每个文件的进度。',
          isOnlineOnly: true,
        ),
      ],
    ),
    'zh_TW': ChangeLogStrings(
      entries: [
        ChangeLogEntryStrings(
          title: '圖庫共享',
          description: '自動與家人共享您目前和未來建立的相簿。前往「設定」→「家庭」，選擇一位成員，然後點一下「共享相簿」。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '處處更快速',
          description: '在大型圖庫中，搜尋、地圖與圖庫捲動速度都變得更快。',
        ),
        ChangeLogEntryStrings(
          title: '位置搜尋',
          description: '現在可以依國家和城市搜尋，準確度也有所提升。',
        ),
        ChangeLogEntryStrings(
          title: '系統垃圾桶',
          description:
              '在 Android 11 及更新版本中，透過 Ente Photos 刪除的裝置照片會移至系統垃圾桶，並可在應用程式中復原。',
          isAndroidOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '相簿描述',
          description: '現在可以為相簿新增描述，描述也會顯示在共享連結中。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '相簿幻燈片',
          description: '利用相簿幻燈片，將您的舊平板變成數位相框。',
          isOnlineOnly: true,
        ),
        ChangeLogEntryStrings(
          title: '編輯後保留更多資訊',
          description: '編輯過的照片現在會保留相機、日期和位置等重要資訊。若只旋轉或翻轉 JPEG，還會保留原始畫質。',
        ),
        ChangeLogEntryStrings(
          title: '更好的影片播放體驗',
          description: '點兩下影片任一側，即可快轉或倒轉五秒。您也可以選擇播放速度。',
        ),
        ChangeLogEntryStrings(
          title: '還有更多！',
          description:
              '我們為「回憶」加入了一些由我們創作的音樂。此外，智慧相簿更加好用，「釋放空間」更加可靠，「備份狀態」會顯示每個檔案的進度。',
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
  final bool isLocalGalleryOnly;
  final bool isAndroidOnly;

  const ChangeLogEntryStrings({
    required this.title,
    required this.description,
    this.isOnlineOnly = false,
    this.isLocalGalleryOnly = false,
    this.isAndroidOnly = false,
  }) : assert(!(isOnlineOnly && isLocalGalleryOnly));
}
