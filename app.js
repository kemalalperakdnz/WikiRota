/**
 * VikiRota — Vanilla JS oyun motoru
 * Kayıt, kategori, rastgele Türkçe Vikipedi maddeleri, rekorlar
 */

(() => {
  "use strict";

  const API_BASE = "https://tr.wikipedia.org/w/api.php";
  const STORAGE_PLAYER = "vikirota_player";
  const STORAGE_RECORDS = "vikirota_records";
  const STORAGE_DAILY_COMPLETIONS = "vikirota_daily_completions";
  const STORAGE_WEEKLY_COMPLETIONS = "vikirota_weekly_completions";
  const STORAGE_SYNC_QUEUE = "vikirota_sync_queue";
  const STORAGE_PROFILES = "vikirota_profiles";
  const STORAGE_SOUND = "vikirota_sound";
  const STORAGE_THEME = "vikirota_theme";
  const MAX_RECORDS = 50;

  /** Tamamen cihazdaki profil verileriyle açılan 20 kademeli rozet galerisi */
  const ACHIEVEMENTS = [
    { id: "level_01", level: 1, tier: "starter", title: "Ahşap Çaylak", description: "İlk rotanı tamamla", condition: (p) => p.wins >= 1 },
    { id: "level_02", level: 2, tier: "starter", title: "Taş Gezgin", description: "5 rota tamamla", condition: (p) => p.wins >= 5 },
    { id: "level_03", level: 3, tier: "starter", title: "Kömür Kâşif", description: "10 rota tamamla", condition: (p) => p.wins >= 10 },
    { id: "level_04", level: 4, tier: "starter", title: "Bakır İzci", description: "20 rota tamamla", condition: (p) => p.wins >= 20 },
    { id: "level_05", level: 5, tier: "starter", title: "Tunç Seyyah", description: "25 galibiyet ve 3 farklı kategori tamamla", condition: (p) => p.wins >= 25 && Object.keys(p.categoryWins).length >= 3 },
    { id: "level_06", level: 6, tier: "growth", title: "Demir Bağlantı", description: "35 rota tamamla", condition: (p) => p.wins >= 35 },
    { id: "level_07", level: 7, tier: "growth", title: "Çelik Düğüm", description: "Orta zorlukta 15 kez kazan", condition: (p) => p.difficultyWins.medium >= 15 },
    { id: "level_08", level: 8, tier: "growth", title: "Gümüş Kılavuz", description: "7 günlük yarış tamamla", condition: (p) => p.dailyWins >= 7 },
    { id: "level_09", level: 9, tier: "growth", title: "Altın Rota", description: "40 galibiyet sonrası 5 adımda rota bitir", condition: (p) => p.wins >= 40 && p.bestSteps <= 5 },
    { id: "level_10", level: 10, tier: "growth", title: "Platin Rehber", description: "50 galibiyet ve 60 saniye altı derece yap", condition: (p) => p.wins >= 50 && p.bestTimeMs <= 60000 },
    { id: "level_11", level: 11, tier: "master", title: "Titanyum Atlama", description: "Zor seviyede 10 kez kazan", condition: (p) => p.difficultyWins.hard >= 10 },
    { id: "level_12", level: 12, tier: "master", title: "Ametist Sörfçü", description: "60 galibiyet ve 7 farklı kategori tamamla", condition: (p) => p.wins >= 60 && Object.keys(p.categoryWins).length >= 7 },
    { id: "level_13", level: 13, tier: "master", title: "Zümrüt Ansiklopedi", description: "20 günlük yarış tamamla", condition: (p) => p.dailyWins >= 20 },
    { id: "level_14", level: 14, tier: "master", title: "Safir Köprü", description: "75 rota tamamla", condition: (p) => p.wins >= 75 },
    { id: "level_15", level: 15, tier: "master", title: "Yakut Bilge", description: "Zor seviyede 25 kez kazan", condition: (p) => p.difficultyWins.hard >= 25 },
    { id: "level_16", level: 16, tier: "legendary", title: "Elmas Ağ", description: "100 galibiyet sonrası 3 adımda rota bitir", condition: (p) => p.wins >= 100 && p.bestSteps <= 3 },
    { id: "level_17", level: 17, tier: "legendary", title: "Obsidyen Usta", description: "120 galibiyet ve 10 farklı kategori tamamla", condition: (p) => p.wins >= 120 && Object.keys(p.categoryWins).length >= 10 },
    { id: "level_18", level: 18, tier: "legendary", title: "Meteorit Sentez", description: "150 rota tamamla", condition: (p) => p.wins >= 150 },
    { id: "level_19", level: 19, tier: "legendary", title: "Karanlık Madde", description: "12 kategori ve 50 zor galibiyet tamamla", condition: (p) => Object.keys(p.categoryWins).length >= 12 && p.difficultyWins.hard >= 50 },
    { id: "level_20", level: 20, tier: "legendary", title: "Kozmik Üstat", description: "250 galibiyet, 12 kategori ve 50 günlük yarış tamamla", condition: (p) => p.wins >= 250 && Object.keys(p.categoryWins).length >= 12 && p.dailyWins >= 50 },
  ];

  /** Başarım rozet görsel yolunu döndürür */
  function getAchievementBadgeSrc(level) {
    return `images/achievements/level-${String(level).padStart(2, "0")}.png`;
  }

  /** Vikipedi özel ad alanları — oyun rotasına dahil edilmez */
  const BLOCKED_PREFIXES = [
    "Dosya:", "File:", "Resim:", "Image:",
    "Kategori:", "Category:", "Şablon:", "Template:",
    "Portal:", "Vikipedi:", "Wikipedia:", "Yardım:", "Help:",
    "MediaWiki:", "Modül:", "Module:", "Özel:", "Special:",
    "Kullanıcı:", "User:", "Tartışma:", "Talk:",
  ];

  /**
   * Oyun kategorileri
   * "all" → tüm Türkçe madde uzayı (list=random)
   * diğerleri → ilgili Vikipedi kategorilerinden rastgele seçim
   */
  const CATEGORIES = [
    {
      id: "all",
      label: "Hepsi",
      description: "Türkçe Vikipedi’nin bütün maddeleri",
      mode: "random",
    },
    {
      id: "people",
      label: "Ünlü İsimler",
      description: "Kişiler, biyografiler, tarihe mal olmuş adlar",
      mode: "category",
      wikiCategories: [
        "Kategori:Osmanlı padişahları",
        "Kategori:Türkiye cumhurbaşkanları",
        "Kategori:Türk yazarlar",
        "Kategori:Türk bilim insanları",
        "Kategori:Türk müzisyenler",
        "Kategori:Türk sinema oyuncuları",
        "Kategori:Türk futbolcular",
        "Kategori:Nobel Ödülü sahipleri",
        "Kategori:20. yüzyıl Türkleri",
      ],
    },
    {
      id: "places",
      label: "Yerler",
      description: "İller, ülkeler, şehirler, coğrafya",
      mode: "category",
      wikiCategories: [
        "Kategori:Türkiye'deki şehirler",
        "Kategori:Avrupa ülkeleri",
        "Kategori:Afrika ülkeleri",
        "Kategori:Güney Amerika ülkeleri",
        "Kategori:Kuzey Amerika ülkeleri",
        "Kategori:Okyanusya ülkeleri",
        "Kategori:Dağlar",
        "Kategori:Göller",
        "Kategori:Nehirler",
      ],
    },
    {
      id: "history",
      label: "Tarih",
      description: "Olaylar, dönemler, imparatorluklar",
      mode: "category",
      wikiCategories: [
        "Kategori:Osmanlı İmparatorluğu",
        "Kategori:Türkiye tarihi",
        "Kategori:Savaşlar",
        "Kategori:Antlaşmalar",
        "Kategori:Orta Çağ",
        "Kategori:Türk tarihi",
        "Kategori:Birinci Dünya Savaşı",
        "Kategori:İkinci Dünya Savaşı",
      ],
    },
    {
      id: "science",
      label: "Bilim",
      description: "Doğa bilimleri, matematik, buluşlar",
      mode: "category",
      wikiCategories: [
        "Kategori:Fizik",
        "Kategori:Kimya",
        "Kategori:Biyoloji",
        "Kategori:Matematik",
        "Kategori:Astronomi",
        "Kategori:Tıp",
        "Kategori:Bilgisayar bilimi",
        "Kategori:Jeoloji",
      ],
    },
    {
      id: "sports",
      label: "Spor",
      description: "Takımlar, branşlar, sporcular",
      mode: "category",
      wikiCategories: [
        "Kategori:Futbol kulüpleri",
        "Kategori:Basketbol",
        "Kategori:Olimpiyat Oyunları",
        "Kategori:Türk futbolcular",
        "Kategori:Spor dalları",
        "Kategori:Tenis",
        "Kategori:Voleybol",
      ],
    },
    {
      id: "culture",
      label: "Sanat & Kültür",
      description: "Edebiyat, müzik, sinema, gelenekler",
      mode: "category",
      wikiCategories: [
        "Kategori:Türk edebiyatı",
        "Kategori:Türk müziği",
        "Kategori:Türk filmleri",
        "Kategori:Mimarlık",
        "Kategori:Resim",
        "Kategori:Tiyatro",
        "Kategori:Romanlar",
      ],
    },
    {
      id: "nature",
      label: "Doğa & Canlılar",
      description: "Hayvanlar, bitkiler, doğa olayları",
      mode: "category",
      wikiCategories: [
        "Kategori:Kuşlar",
        "Kategori:Memeliler",
        "Kategori:Balıklar",
        "Kategori:Ağaçlar",
        "Kategori:Çiçekler",
        "Kategori:Böcekler",
        "Kategori:Sürüngenler",
      ],
    },
    {
      id: "technology",
      label: "Teknoloji",
      description: "Bilgisayarlar, internet, yazılım ve mühendislik",
      mode: "category",
      wikiCategories: [
        "Kategori:Teknoloji",
        "Kategori:Bilgisayar bilimi",
      ],
    },
    {
      id: "health",
      label: "Sağlık & Tıp",
      description: "İnsan sağlığı, tıp dalları ve tedaviler",
      mode: "category",
      wikiCategories: [
        "Kategori:Sağlık",
        "Kategori:Tıp",
      ],
    },
    {
      id: "food",
      label: "Yemek & Mutfak",
      description: "Türk mutfağı, yemekler ve gastronomi",
      mode: "category",
      wikiCategories: [
        "Kategori:Türk mutfağı",
        "Kategori:Yemekler",
      ],
    },
    {
      id: "games",
      label: "Oyunlar",
      description: "Video oyunları, masa oyunları ve oyun kültürü",
      mode: "category",
      wikiCategories: [
        "Kategori:Video oyunları",
        "Kategori:Masa oyunları",
      ],
    },
    {
      id: "mythology",
      label: "Mitoloji",
      description: "Efsaneler, tanrılar ve mitolojik kahramanlar",
      mode: "category",
      wikiCategories: [
        "Kategori:Mitoloji",
        "Kategori:Türk mitolojisi",
      ],
    },
  ];

  const LOADER_LINES = [
    "Ansiklopedi sayfası açılıyor…",
    "Bilgi izi takip ediliyor…",
    "Makale satırları derleniyor…",
    "Vikipedi köşeleri taranıyor…",
    "Bağlantılar süzülüyor…",
    "Rastgele madde seçiliyor…",
    "Kategori rafları karıştırılıyor…",
  ];

  const WIN_MESSAGES = [
    "Hedef maddeye vardın; bilgi patikan tamamlandı.",
    "Rotanın son durağına ulaştın — ne güzel bir keşif!",
    "Ansiklopedik yolculuğun taçlandı. Tebrikler, gezgin!",
    "Varış noktasındasın. Adımların bir hikâyeye dönüştü.",
    "Zinciri tamamladın; başlangıçtan hedefe köprü kuruldu.",
    "Mükemmel bir iz sürdün. VikiRota seninle gurur duyar.",
  ];

  const WIN_EYEBROWS = ["Rotanın sonu", "Varış kutlaması", "Keşif tamam", "Zafer anı", "Patika bitti"];
  const WIN_HEADINGS = ["Tebrikler!", "Başardın!", "Hedefe vardın!", "Bravo, gezgin!", "Yolculuk tamam!"];

  /** Geri sayım sırasında dönen kısa uyarılar */
  const COUNTDOWN_HINTS = {
    3: ["Gözlerini hedefe dik…", "Rotayı aklına kazı…", "İlk adımı planla…"],
    2: ["Bağlantılar seni bekliyor…", "Patika açılıyor…", "Nefesini tut…"],
    1: ["Son saniye!", "Hazırsan…", "Şimdi!"],
    go: ["BAŞLA!", "İLERLE!", "YOLA ÇIK!"],
  };

  const COUNTDOWN_EYEBROWS = [
    "Rotan hazır",
    "Görev kartı",
    "Yeni patika",
    "Keşif emri",
    "Bilgi duellosu",
  ];

  /** Zorluk dereceleri — madde uzunluğuna göre süzülür */
  const DIFFICULTIES = [
    {
      id: "easy",
      label: "Kolay",
      description: "Tanıdık, zengin bağlantılı maddeler",
      hint: "Kolay: bilinen, zengin maddeler",
    },
    {
      id: "medium",
      label: "Orta",
      description: "Karışık zorluk — dengeli bir koşu",
      hint: "Orta: ne çok kolay ne uçurum",
    },
    {
      id: "hard",
      label: "Zor",
      description: "Kısa, ücra, az bilinen maddeler",
      hint: "Zor: ücra köşeler, sert patika",
    },
  ];

  /** Lobide uçuşan Vikipedi esintili kelimeler */
  const FLOAT_WORDS = [
    "İstanbul", "Atatürk", "Karadeniz", "Osmanlı", "Ankara", "Futbol",
    "Matematik", "Ege", "Mozart", "Pirinç", "Kapadokya", "Fizik",
    "Mevlana", "Van Gölü", "Tiyatro", "Çınar", "DNA", "Trakya",
    "Sinema", "Uzay", "Anadolu", "Nobel", "Boğaz", "Şiir",
  ];

  /** Kategori üyesi önbelleği — tekrarlayan API çağrılarını azaltır */
  const categoryCache = new Map();
  const outgoingLinksCache = new Map();
  const backlinksCache = new Map();

  const state = {
    playerName: "",
    categoryId: "all",
    difficultyId: "easy",
    gameMode: "normal",
    dailyKey: "",
    dailyChallenge: null,
    weeklyKey: "",
    weeklyChallenge: null,
    sharedChallenge: null,
    startTitle: "",
    targetTitle: "",
    currentTitle: "",
    routeHistory: [],
    routeProof: [],
    validatedRoute: [],
    steps: 0,
    startedAt: 0,
    elapsedMs: 0,
    timerId: null,
    isRunning: false,
    isWon: false,
    isFetching: false,
    isRegistered: false,
    isCountingDown: false,
    isHinting: false,
    roundProfileCounted: false,
    soundEnabled: localStorage.getItem(STORAGE_SOUND) !== "off",
    theme: localStorage.getItem(STORAGE_THEME) === "dark" ? "dark" : "light",
    audioContext: null,
    installPrompt: null,
    leaderboardScope: "local",
    supabaseClient: null,
    supabaseReady: false,
    onlineSessionId: "",
    onlineRecords: [],
    duelRoom: null,
    duelRole: "",
    duelUserId: "",
    duelChannel: null,
    duelPollId: null,
    duelRaceLaunched: false,
    duelBusy: false,
    duelCategoryId: "all",
    lastBeginMode: "normal",
    duelDifficultyId: "easy",
  };

  const els = {
    lobby: document.getElementById("lobby"),
    howToPage: document.getElementById("how-to-page"),
    howToLink: document.getElementById("how-to-link"),
    howToBackBtn: document.getElementById("how-to-back-btn"),
    howToLobbyBtn: document.getElementById("how-to-lobby-btn"),
    feedbackPage: document.getElementById("feedback-page"),
    feedbackLink: document.getElementById("feedback-link"),
    feedbackBackBtn: document.getElementById("feedback-back-btn"),
    feedbackLobbyBtn: document.getElementById("feedback-lobby-btn"),
    feedbackForm: document.getElementById("feedback-form"),
    feedbackName: document.getElementById("feedback-name"),
    feedbackEmail: document.getElementById("feedback-email"),
    feedbackType: document.getElementById("feedback-type"),
    feedbackSubject: document.getElementById("feedback-subject"),
    feedbackMessage: document.getElementById("feedback-message"),
    privacyPage: document.getElementById("privacy-page"),
    privacyLink: document.getElementById("privacy-link"),
    privacyBackBtn: document.getElementById("privacy-back-btn"),
    privacyLobbyBtn: document.getElementById("privacy-lobby-btn"),
    soundToggle: document.getElementById("sound-toggle"),
    themeToggle: document.getElementById("theme-toggle"),
    installAppBtn: document.getElementById("install-app-btn"),
    themeColorMeta: document.getElementById("theme-color-meta"),
    gameShell: document.getElementById("game-shell"),
    registerForm: document.getElementById("register-form"),
    registerHint: document.getElementById("register-hint"),
    playerName: document.getElementById("player-name"),
    registerBtn: document.getElementById("register-btn"),
    changePlayerBtn: document.getElementById("change-player-btn"),
    categoryGrid: document.getElementById("category-grid"),
    difficultyGrid: document.getElementById("difficulty-grid"),
    difficultyHint: document.getElementById("difficulty-hint"),
    startBtn: document.getElementById("start-btn"),
    dailyStartBtn: document.getElementById("daily-start-btn"),
    weeklyDate: document.getElementById("weekly-date"),
    weeklyTitle: document.getElementById("weekly-title"),
    weeklyMeta: document.getElementById("weekly-meta"),
    weeklyStatus: document.getElementById("weekly-status"),
    weeklyStartBtn: document.getElementById("weekly-start-btn"),
    weeklyStandingsList: document.getElementById("weekly-standings-list"),
    dailyDate: document.getElementById("daily-date"),
    dailyTitle: document.getElementById("daily-title"),
    dailyMeta: document.getElementById("daily-meta"),
    dailyStatus: document.getElementById("daily-status"),
    sharedChallenge: document.getElementById("shared-challenge"),
    sharedChallengeTitle: document.getElementById("shared-challenge-title"),
    sharedChallengeMeta: document.getElementById("shared-challenge-meta"),
    sharedStartBtn: document.getElementById("shared-start-btn"),
    duelSection: document.getElementById("duel-section"),
    duelTitle: document.getElementById("duel-title"),
    duelMeta: document.getElementById("duel-meta"),
    duelStatus: document.getElementById("duel-status"),
    duelCreateBtn: document.getElementById("duel-create-btn"),
    duelApplySettingsBtn: document.getElementById("duel-apply-settings-btn"),
    duelShareBtn: document.getElementById("duel-share-btn"),
    duelReadyBtn: document.getElementById("duel-ready-btn"),
    duelCancelBtn: document.getElementById("duel-cancel-btn"),
    duelSettings: document.getElementById("duel-settings"),
    duelCategorySelect: document.getElementById("duel-category-select"),
    duelDifficultySelect: document.getElementById("duel-difficulty-select"),
    duelSettingsHint: document.getElementById("duel-settings-hint"),
    duelPlayers: document.getElementById("duel-players"),
    duelHostName: document.getElementById("duel-host-name"),
    duelHostState: document.getElementById("duel-host-state"),
    duelGuestName: document.getElementById("duel-guest-name"),
    duelGuestState: document.getElementById("duel-guest-state"),
    duelHostCard: document.getElementById("duel-host-card"),
    duelGuestCard: document.getElementById("duel-guest-card"),
    duelResult: document.getElementById("duel-result"),
    duelResultStatus: document.getElementById("duel-result-status"),
    duelResultGrid: document.getElementById("duel-result-grid"),
    duelCompleteBadge: document.getElementById("duel-complete-badge"),
    profileGames: document.getElementById("profile-games"),
    profileWins: document.getElementById("profile-wins"),
    profileAverageTime: document.getElementById("profile-average-time"),
    profileFavoriteCategory: document.getElementById("profile-favorite-category"),
    profileAchievements: document.getElementById("profile-achievements"),
    pairStatus: document.getElementById("pair-status"),
    pairRetryBtn: document.getElementById("pair-retry-btn"),
    bestEmpty: document.getElementById("best-empty"),
    bestFilled: document.getElementById("best-filled"),
    bestPlayer: document.getElementById("best-player"),
    bestTime: document.getElementById("best-time"),
    bestSteps: document.getElementById("best-steps"),
    bestRoute: document.getElementById("best-route"),
    bestMeta: document.getElementById("best-meta"),
    recordsBody: document.getElementById("records-body"),
    clearRecordsBtn: document.getElementById("clear-records-btn"),
    leaderboardOnlineTab: document.getElementById("leaderboard-online-tab"),
    leaderboardLocalTab: document.getElementById("leaderboard-local-tab"),
    leaderboardCategoryFilter: document.getElementById("leaderboard-category-filter"),
    leaderboardDifficultyFilter: document.getElementById("leaderboard-difficulty-filter"),
    leaderboardModeFilter: document.getElementById("leaderboard-mode-filter"),
    leaderboardStatus: document.getElementById("leaderboard-status"),
    playerChip: document.getElementById("player-chip"),
    categoryChip: document.getElementById("category-chip"),
    difficultyChip: document.getElementById("difficulty-chip"),
    gameModeBadge: document.getElementById("game-mode-badge"),
    floatWords: document.getElementById("float-words"),
    backLobbyBtn: document.getElementById("back-lobby-btn"),
    finishRaceBtn: document.getElementById("finish-race-btn"),
    hintBtn: document.getElementById("hint-btn"),
    hintMessage: document.getElementById("hint-message"),
    shareChallengeBtn: document.getElementById("share-challenge-btn"),
    gameSoundToggle: document.getElementById("game-sound-toggle"),
    timer: document.getElementById("timer"),
    stepCount: document.getElementById("step-count"),
    targetTitle: document.getElementById("target-title"),
    currentTitle: document.getElementById("current-title"),
    startTitle: document.getElementById("start-title"),
    routeHistoryList: document.getElementById("route-history-list"),
    finalRouteList: document.getElementById("final-route-list"),
    newAchievements: document.getElementById("new-achievements"),
    loader: document.getElementById("loader"),
    loaderText: document.getElementById("loader-text"),
    article: document.getElementById("article-view"),
    articleTitle: document.getElementById("article-title"),
    articleBody: document.getElementById("article-body"),
    winModal: document.getElementById("win-modal"),
    winEyebrow: document.getElementById("win-eyebrow"),
    winHeading: document.getElementById("win-heading"),
    winMessage: document.getElementById("win-message"),
    winBadge: document.getElementById("win-badge"),
    dailyCompleteBadge: document.getElementById("daily-complete-badge"),
    weeklyCompleteBadge: document.getElementById("weekly-complete-badge"),
    finalTime: document.getElementById("final-time"),
    finalSteps: document.getElementById("final-steps"),
    replayBtn: document.getElementById("replay-btn"),
    lobbyFromWinBtn: document.getElementById("lobby-from-win-btn"),
    countdown: document.getElementById("countdown"),
    countdownFrom: document.getElementById("countdown-from"),
    countdownTo: document.getElementById("countdown-to"),
    countdownNumber: document.getElementById("countdown-number"),
    countdownHint: document.getElementById("countdown-hint"),
    countdownEyebrow: document.getElementById("countdown-eyebrow"),
  };

  /* ---------- Yardımcılar ---------- */

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function normalizeTitle(title) {
    return decodeURIComponent(String(title || ""))
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("tr-TR");
  }

  function formatTime(ms) {
    const totalTenths = Math.floor(ms / 100);
    const tenths = totalTenths % 10;
    const totalSeconds = Math.floor(totalTenths / 10);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function getCategoryById(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
  }

  function getDifficultyById(id) {
    return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
  }

  function isBlockedTitle(title) {
    return BLOCKED_PREFIXES.some((prefix) =>
      title.toLocaleLowerCase("tr-TR").startsWith(prefix.toLocaleLowerCase("tr-TR"))
    );
  }

  /** Anlam ayrımı / liste / çok teknik sayfaları ele */
  function isPlayableTitle(title) {
    if (!title || title.length < 2) return false;
    if (isBlockedTitle(title)) return false;
    const lower = title.toLocaleLowerCase("tr-TR");
    if (lower.includes("(anlam ayrımı)")) return false;
    if (lower.includes("listesi")) return false;
    if (lower.includes("şablonu")) return false;
    if (/^iso\s/i.test(title)) return false;
    return true;
  }

  /** API rate limit için kısa bekleme */
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function playTone(frequency, duration = 0.12, delay = 0, type = "sine") {
    if (!state.soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audioContext ||= new AudioContext();
    const context = state.audioContext;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function playSound(name, option = {}) {
    if (name === "countdown") {
      playTone(option.go ? 740 : 440, option.go ? 0.28 : 0.13, 0, "triangle");
    } else if (name === "click") {
      playTone(560, 0.08, 0, "sine");
    } else if (name === "hint") {
      playTone(660, 0.12, 0, "triangle");
      playTone(880, 0.14, 0.1, "triangle");
    } else if (name === "victory") {
      [523, 659, 784, 1047].forEach((frequency, index) =>
        playTone(frequency, 0.3, index * 0.11, "triangle")
      );
    }
  }

  function renderSoundControls() {
    const icon = state.soundEnabled ? "🔊" : "🔇";
    const label = state.soundEnabled ? "Sesi kapat" : "Sesi aç";
    [els.soundToggle, els.gameSoundToggle].forEach((button) => {
      if (!button) return;
      button.textContent = icon;
      button.setAttribute("aria-pressed", String(state.soundEnabled));
      button.setAttribute("aria-label", label);
      button.title = label;
    });
  }

  function applyTheme(theme) {
    state.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", state.theme);
    localStorage.setItem(STORAGE_THEME, state.theme);
    if (els.themeColorMeta) {
      els.themeColorMeta.setAttribute(
        "content",
        state.theme === "dark" ? "#000000" : "#ffffff"
      );
    }
    if (els.themeToggle) {
      const isDark = state.theme === "dark";
      els.themeToggle.textContent = isDark ? "☀️" : "🌙";
      els.themeToggle.setAttribute("aria-pressed", String(isDark));
      els.themeToggle.setAttribute(
        "aria-label",
        isDark ? "Aydınlık temaya geç" : "Karanlık temaya geç"
      );
      els.themeToggle.title = isDark ? "Aydınlık tema" : "Karanlık tema";
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(STORAGE_SOUND, state.soundEnabled ? "on" : "off");
    renderSoundControls();
    if (state.soundEnabled) playTone(660, 0.12);
  }

  function initializePwa() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Servis çalışanı kaydedilemedi:", error);
      });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.installPrompt = event;
      els.installAppBtn.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      state.installPrompt = null;
      els.installAppBtn.hidden = true;
    });
  }

  async function installPwa() {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    els.installAppBtn.hidden = true;
  }

  /** Europe/Istanbul saat diliminde YYYY-MM-DD günlük anahtarı üretir */
  function getIstanbulDateKey() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  /** Tarihe göre tüm oyuncular için aynı katalog öğesini seçer */
  function getDailyChallenge() {
    const catalog = window.VIKIROTA_DAILY_CHALLENGES || [];
    if (!catalog.length) return null;
    const key = getIstanbulDateKey();
    const dayNumber = Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000);
    return { ...catalog[Math.abs(dayNumber) % catalog.length], key };
  }

  function loadDailyCompletions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_DAILY_COMPLETIONS) || "{}");
    } catch {
      return {};
    }
  }

  function markDailyCompletion(entry) {
    const completions = loadDailyCompletions();
    completions[entry.dailyKey] = {
      steps: entry.steps,
      timeMs: entry.timeMs,
      completedAt: entry.date,
    };
    localStorage.setItem(STORAGE_DAILY_COMPLETIONS, JSON.stringify(completions));
  }

  function renderDailyChallenge() {
    const challenge = getDailyChallenge();
    if (!challenge) {
      els.dailyTitle.textContent = "Günlük görev yüklenemedi";
      els.dailyMeta.textContent = "Katalog bulunamadı.";
      els.dailyStartBtn.disabled = true;
      return;
    }

    const date = new Date(`${challenge.key}T12:00:00+03:00`);
    const completion = loadDailyCompletions()[challenge.key];
    els.dailyDate.textContent = date.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    els.dailyTitle.textContent = `${challenge.startTitle} → ${challenge.targetTitle}`;
    els.dailyMeta.textContent =
      `${getCategoryById(challenge.categoryId).label} · ` +
      `${getDifficultyById(challenge.difficultyId).label}`;
    els.dailyStatus.textContent = completion
      ? `Tamamlandı: ${completion.steps} adım · ${formatTime(completion.timeMs)}`
      : "Bugünkü ortak yarış henüz tamamlanmadı.";
    els.dailyStatus.classList.toggle("is-complete", Boolean(completion));
    els.dailyStartBtn.textContent = completion
      ? "Günlük yarışı yeniden oyna"
      : "Günlük yarışa katıl";
    els.dailyStartBtn.disabled = !state.isRegistered;
  }

  /** Istanbul takvim gününden ISO hafta anahtarı üretir (ör. 2026-W30) */
  function getIstanbulWeekKey() {
    const key = getIstanbulDateKey();
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const isoYear = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
  }

  /** Haftaya göre tüm oyuncular için aynı lig rotasını seçer */
  function getWeeklyChallenge() {
    const catalog = window.VIKIROTA_WEEKLY_CHALLENGES || [];
    if (!catalog.length) return null;
    const key = getIstanbulWeekKey();
    const weekMatch = key.match(/^(\d{4})-W(\d{2})$/);
    if (!weekMatch) return null;
    const weekIndex = Number(weekMatch[1]) * 53 + Number(weekMatch[2]);
    return { ...catalog[Math.abs(weekIndex) % catalog.length], key };
  }

  function loadWeeklyCompletions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_WEEKLY_COMPLETIONS) || "{}");
    } catch {
      return {};
    }
  }

  function markWeeklyCompletion(entry) {
    const completions = loadWeeklyCompletions();
    const previous = completions[entry.weeklyKey];
    if (
      !previous ||
      entry.steps < previous.steps ||
      (entry.steps === previous.steps && entry.timeMs < previous.timeMs)
    ) {
      completions[entry.weeklyKey] = {
        steps: entry.steps,
        timeMs: entry.timeMs,
        completedAt: entry.date,
      };
      localStorage.setItem(STORAGE_WEEKLY_COMPLETIONS, JSON.stringify(completions));
    }
  }

  /** Bu haftanın lig sıralamasını (yerel + çevrim içi) çizer */
  function renderWeeklyStandings() {
    const weekKey = getIstanbulWeekKey();
    const merged = new Map();

    for (const record of [...loadRecords(), ...state.onlineRecords]) {
      if (record.gameMode !== "weekly" || record.weeklyKey !== weekKey) continue;
      const key = normalizeTitle(record.playerName || "");
      const previous = merged.get(key);
      if (!previous || compareRecords(record, previous) < 0) {
        merged.set(key, record);
      }
    }

    const standings = [...merged.values()].sort(compareRecords).slice(0, 10);
    if (!standings.length) {
      els.weeklyStandingsList.innerHTML =
        `<li class="weekly-standings__empty">Bu hafta henüz lig skoru yok.</li>`;
      return;
    }

    els.weeklyStandingsList.innerHTML = standings
      .map(
        (record, index) => `
        <li>
          <span>${index + 1}</span>
          <strong>${escapeHtml(record.playerName)}</strong>
          <span>${record.steps} adım · ${formatTime(record.timeMs)}</span>
        </li>
      `
      )
      .join("");
  }

  /** Haftalık lig kartını lobiye yazar */
  function renderWeeklyChallenge() {
    const challenge = getWeeklyChallenge();
    if (!challenge) {
      els.weeklyTitle.textContent = "Haftalık lig yüklenemedi";
      els.weeklyMeta.textContent = "Katalog bulunamadı.";
      els.weeklyStartBtn.disabled = true;
      renderWeeklyStandings();
      return;
    }

    const completion = loadWeeklyCompletions()[challenge.key];
    els.weeklyDate.textContent = `Sezon ${challenge.key}`;
    els.weeklyTitle.textContent = `${challenge.startTitle} → ${challenge.targetTitle}`;
    els.weeklyMeta.textContent =
      `${getCategoryById(challenge.categoryId).label} · ` +
      `${getDifficultyById(challenge.difficultyId).label} · Pazartesi sıfırlanır`;
    els.weeklyStatus.textContent = completion
      ? `En iyi: ${completion.steps} adım · ${formatTime(completion.timeMs)}`
      : "Bu haftanın ortak ligi henüz tamamlanmadı.";
    els.weeklyStatus.classList.toggle("is-complete", Boolean(completion));
    els.weeklyStartBtn.textContent = completion
      ? "Haftalık ligi yeniden oyna"
      : "Haftalık lige katıl";
    els.weeklyStartBtn.disabled = !state.isRegistered;
    renderWeeklyStandings();
  }

  function readSharedChallenge() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") !== "challenge") return null;
    const cleanSharedTitle = (value) =>
      String(value || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    const startTitle = cleanSharedTitle(params.get("start"));
    const targetTitle = cleanSharedTitle(params.get("target"));
    if (
      !isPlayableTitle(startTitle) ||
      !isPlayableTitle(targetTitle) ||
      normalizeTitle(startTitle) === normalizeTitle(targetTitle)
    ) {
      return null;
    }
    const categoryId = CATEGORIES.some((item) => item.id === params.get("category"))
      ? params.get("category")
      : "all";
    const difficultyId = DIFFICULTIES.some(
      (item) => item.id === params.get("difficulty")
    )
      ? params.get("difficulty")
      : "easy";
    return { startTitle, targetTitle, categoryId, difficultyId };
  }

  function renderSharedChallenge() {
    const challenge = state.sharedChallenge;
    els.sharedChallenge.hidden = !challenge;
    if (!challenge) return;
    els.sharedChallengeTitle.textContent =
      `${challenge.startTitle} → ${challenge.targetTitle}`;
    els.sharedChallengeMeta.textContent =
      `${getCategoryById(challenge.categoryId).label} · ` +
      `${getDifficultyById(challenge.difficultyId).label}`;
    els.sharedStartBtn.disabled = !state.isRegistered;
  }

  async function shareCurrentChallenge() {
    if (!state.startTitle || !state.targetTitle) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      mode: "challenge",
      start: state.startTitle,
      target: state.targetTitle,
      category: state.categoryId,
      difficulty: state.difficultyId,
    }).toString();
    const shareData = {
      title: "VikiRota meydan okuması",
      text: `${state.startTitle} maddesinden ${state.targetTitle} maddesine ulaşabilir misin?`,
      url: url.toString(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        els.hintMessage.textContent = "Meydan okuma paylaşım menüsüne gönderildi.";
      } else {
        await navigator.clipboard.writeText(shareData.url);
        els.hintMessage.textContent = "Meydan okuma bağlantısı panoya kopyalandı.";
      }
      els.hintMessage.hidden = false;
    } catch (error) {
      if (error.name === "AbortError") return;
      window.prompt("Bu meydan okuma bağlantısını kopyala:", shareData.url);
    }
  }

  /* ---------- Arkadaş düellosu ---------- */

  function readDuelRoomIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") !== "duel") return "";
    const roomId = String(params.get("room") || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId
    )
      ? roomId
      : "";
  }

  function buildDuelInviteUrl(roomId) {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      mode: "duel",
      room: roomId,
    }).toString();
    return url.toString();
  }

  function setDuelInviteUrl(roomId) {
    const next = buildDuelInviteUrl(roomId);
    window.history.replaceState({}, "", next);
  }

  function clearDuelInviteUrl() {
    const url = new URL(window.location.href);
    if (url.searchParams.get("mode") !== "duel") return;
    url.search = "";
    window.history.replaceState({}, "", url.pathname + url.hash);
  }

  function mapDuelRoom(row) {
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      categoryId: row.category_id,
      difficultyId: row.difficulty_id,
      startTitle: row.start_title,
      targetTitle: row.target_title,
      hostUserId: row.host_user_id,
      hostName: row.host_name,
      hostReady: Boolean(row.host_ready),
      hostFinished: Boolean(row.host_finished),
      hostSteps: row.host_steps,
      hostTimeMs: row.host_time_ms,
      hostRoute: Array.isArray(row.host_route) ? row.host_route : [],
      guestUserId: row.guest_user_id,
      guestName: row.guest_name,
      guestReady: Boolean(row.guest_ready),
      guestFinished: Boolean(row.guest_finished),
      guestSteps: row.guest_steps,
      guestTimeMs: row.guest_time_ms,
      guestRoute: Array.isArray(row.guest_route) ? row.guest_route : [],
      raceStartedAt: row.race_started_at,
      expiresAt: row.expires_at,
    };
  }

  function getDuelRole(room = state.duelRoom) {
    if (!room || !state.duelUserId) return "";
    if (room.hostUserId === state.duelUserId) return "host";
    if (room.guestUserId === state.duelUserId) return "guest";
    return "";
  }

  function duelPlayerStateLabel(ready, finished, present) {
    if (!present) return "Bekleniyor";
    if (finished) return "Bitirdi";
    if (ready) return "Hazır";
    return "Hazırlanıyor";
  }

  function populateDuelSettingSelects() {
    if (!els.duelCategorySelect || !els.duelDifficultySelect) return;
    if (!els.duelCategorySelect.options.length) {
      els.duelCategorySelect.innerHTML = CATEGORIES.map(
        (cat) => `<option value="${cat.id}">${cat.label}</option>`
      ).join("");
    }
    if (!els.duelDifficultySelect.options.length) {
      els.duelDifficultySelect.innerHTML = DIFFICULTIES.map(
        (diff) => `<option value="${diff.id}">${diff.label}</option>`
      ).join("");
    }
  }

  function duelSettingsDirty() {
    const room = state.duelRoom;
    if (!room) return false;
    return (
      state.duelCategoryId !== room.categoryId ||
      state.duelDifficultyId !== room.difficultyId
    );
  }

  function renderDuelSettingsControls() {
    populateDuelSettingSelects();
    if (!els.duelCategorySelect || !els.duelDifficultySelect) return;

    const room = state.duelRoom;
    const role = getDuelRole(room);
    const inLobbyPhase = !room || ["waiting", "ready"].includes(room.status);
    const hostCanEdit = (!room && state.isRegistered) || (role === "host" && inLobbyPhase);

    if (room) {
      // Oda varken seçiciler oda değerini gösterir; host kirliyse kendi taslağını korur
      if (role !== "host" || !duelSettingsDirty()) {
        state.duelCategoryId = room.categoryId;
        state.duelDifficultyId = room.difficultyId;
      }
    } else if (!state.duelCategoryId) {
      state.duelCategoryId = state.categoryId || "all";
      state.duelDifficultyId = state.difficultyId || "easy";
    }

    els.duelCategorySelect.value = state.duelCategoryId;
    els.duelDifficultySelect.value = state.duelDifficultyId;
    els.duelCategorySelect.disabled = !hostCanEdit || state.duelBusy;
    els.duelDifficultySelect.disabled = !hostCanEdit || state.duelBusy;

    if (els.duelApplySettingsBtn) {
      const showApply = Boolean(room) && role === "host" && inLobbyPhase && duelSettingsDirty();
      els.duelApplySettingsBtn.hidden = !showApply;
      els.duelApplySettingsBtn.disabled = state.duelBusy || !showApply;
    }

    if (els.duelSettingsHint) {
      if (!room) {
        els.duelSettingsHint.textContent =
          "Kategori ve zorluğu seç, sonra odayı oluştur. Rakip senin ayarınla oynar.";
      } else if (role === "host" && inLobbyPhase) {
        els.duelSettingsHint.textContent = duelSettingsDirty()
          ? "Ayar değişti. “Rotayı güncelle” ile yeni ortak rota üret; hazırlar sıfırlanır."
          : "İstersen kategori/zorluğu değiştirip rotayı güncelleyebilirsin.";
      } else if (role === "guest") {
        els.duelSettingsHint.textContent =
          "Bu ayarları yalnızca ev sahibi düzenler. Sen aynı rotayla yarışırsın.";
      } else {
        els.duelSettingsHint.textContent = "Oda ayarları kilitli.";
      }
    }
  }

  function renderDuelLobby() {
    if (!els.duelSection) return;
    const room = state.duelRoom;
    const online = state.supabaseReady;

    if (!room) {
      if (!state.duelCategoryId) state.duelCategoryId = state.categoryId || "all";
      if (!state.duelDifficultyId) state.duelDifficultyId = state.difficultyId || "easy";
      els.duelTitle.textContent =
        "Oda oluştur, linki paylaş, ikiniz de hazır olunca başlayın";
      els.duelMeta.textContent = online
        ? `${getCategoryById(state.duelCategoryId).label} · ${getDifficultyById(state.duelDifficultyId).label} ile ortak rota üretilecek.`
        : "Çevrim içi bağlantı gerekli — Supabase yapılandırmasını kontrol et.";
      els.duelStatus.textContent = online
        ? ""
        : "Düello için çevrim içi oturum açılamadı.";
      els.duelCreateBtn.hidden = false;
      if (els.duelApplySettingsBtn) els.duelApplySettingsBtn.hidden = true;
      els.duelShareBtn.hidden = true;
      els.duelReadyBtn.hidden = true;
      els.duelCancelBtn.hidden = true;
      els.duelPlayers.hidden = true;
      renderDuelSettingsControls();
      updateStartButtonState();
      return;
    }

    const role = getDuelRole(room);
    state.duelRole = role;
    els.duelTitle.textContent = `${room.startTitle} → ${room.targetTitle}`;
    els.duelMeta.textContent =
      `${getCategoryById(room.categoryId).label} · ` +
      `${getDifficultyById(room.difficultyId).label} · ` +
      (room.status === "racing"
        ? "Yarış sürüyor"
        : room.status === "finished"
          ? "Düello bitti"
          : room.status === "cancelled"
            ? "Oda iptal edildi"
            : "Rakip ve hazır bekleniyor");

    const guestPresent = Boolean(room.guestUserId);
    els.duelHostName.textContent = room.hostName || "—";
    els.duelGuestName.textContent = room.guestName || "Bekleniyor…";
    els.duelHostState.textContent = duelPlayerStateLabel(
      room.hostReady,
      room.hostFinished,
      true
    );
    els.duelGuestState.textContent = duelPlayerStateLabel(
      room.guestReady,
      room.guestFinished,
      guestPresent
    );
    els.duelHostCard.classList.toggle("is-ready", room.hostReady && !room.hostFinished);
    els.duelGuestCard.classList.toggle("is-ready", room.guestReady && !room.guestFinished);
    els.duelHostCard.classList.toggle("is-you", role === "host");
    els.duelGuestCard.classList.toggle("is-you", role === "guest");
    els.duelPlayers.hidden = false;

    const inLobbyPhase = ["waiting", "ready"].includes(room.status);
    els.duelCreateBtn.hidden = true;
    els.duelShareBtn.hidden = !inLobbyPhase;
    els.duelCancelBtn.hidden = !inLobbyPhase || !role;
    els.duelReadyBtn.hidden = !inLobbyPhase || !role || !guestPresent;

    const iAmReady = role === "host" ? room.hostReady : room.guestReady;
    els.duelReadyBtn.disabled = state.duelBusy || iAmReady;
    els.duelReadyBtn.classList.toggle("is-armed", iAmReady);
    els.duelReadyBtn.textContent = iAmReady ? "Hazır ✓" : "Hazırım";

    if (room.status === "waiting") {
      els.duelStatus.textContent = role === "host"
        ? "Oda hazır. İstersen ayarı değiştir; linki paylaş, rakip katılınca Hazırım deyin."
        : "Odaya katılınıyor…";
    } else if (room.status === "ready") {
      els.duelStatus.textContent = iAmReady
        ? "Rakibin hazır olması bekleniyor…"
        : "Rakip odada. Hazır olduğunda Hazırım’a bas.";
    } else if (room.status === "racing") {
      els.duelStatus.textContent = "İkiniz de hazır — düello başlıyor!";
    } else if (room.status === "finished") {
      els.duelStatus.textContent = "Düello tamamlandı.";
    } else if (room.status === "cancelled") {
      els.duelStatus.textContent = "Oda iptal edildi.";
    }

    renderDuelSettingsControls();
    updateStartButtonState();
  }

  function stopDuelWatchers() {
    if (state.duelPollId) {
      clearInterval(state.duelPollId);
      state.duelPollId = null;
    }
    if (state.duelChannel && state.supabaseClient) {
      state.supabaseClient.removeChannel(state.duelChannel);
      state.duelChannel = null;
    }
  }

  async function fetchDuelRoom(roomId) {
    const { data, error } = await state.supabaseClient
      .from("duel_rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();
    if (error) throw error;
    return mapDuelRoom(data);
  }

  async function applyDuelRoomUpdate(room, options = {}) {
    const { autoStart = true } = options;
    if (!room) return;
    state.duelRoom = room;
    state.duelRole = getDuelRole(room);
    renderDuelLobby();
    renderDuelResultPanel();

    if (autoStart && room.status === "racing" && !state.duelRaceLaunched) {
      state.duelRaceLaunched = true;
      beginRound({ mode: "duel" });
    }

    if (["finished", "cancelled"].includes(room.status)) {
      stopDuelWatchers();
    }
  }

  function startDuelWatchers(roomId) {
    stopDuelWatchers();
    if (!state.supabaseClient || !roomId) return;

    state.duelChannel = state.supabaseClient
      .channel(`duel-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "duel_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const mapped = mapDuelRoom(payload.new);
          if (mapped) applyDuelRoomUpdate(mapped);
        }
      )
      .subscribe();

    state.duelPollId = setInterval(async () => {
      if (!state.duelRoom || state.duelBusy) return;
      try {
        const fresh = await fetchDuelRoom(roomId);
        if (!fresh) return;
        const prev = state.duelRoom;
        const changed =
          !prev ||
          prev.status !== fresh.status ||
          prev.hostReady !== fresh.hostReady ||
          prev.guestReady !== fresh.guestReady ||
          prev.hostFinished !== fresh.hostFinished ||
          prev.guestFinished !== fresh.guestFinished ||
          prev.guestUserId !== fresh.guestUserId ||
          prev.categoryId !== fresh.categoryId ||
          prev.difficultyId !== fresh.difficultyId ||
          prev.startTitle !== fresh.startTitle ||
          prev.targetTitle !== fresh.targetTitle;
        if (changed) applyDuelRoomUpdate(fresh);
      } catch (error) {
        console.warn("Düello oda yenilemesi başarısız:", error);
      }
    }, 2000);
  }

  async function ensureDuelUser() {
    if (!state.supabaseReady || !state.supabaseClient) {
      throw new Error("Düello için çevrim içi bağlantı gerekli.");
    }
    const user = await ensureAnonymousSession();
    state.duelUserId = user.id;
    return user;
  }

  async function createDuelRoom() {
    if (!state.isRegistered || state.duelBusy) return;
    state.duelBusy = true;
    updateStartButtonState();
    renderDuelSettingsControls();
    els.duelStatus.textContent = "Seçtiğin ayara göre ortak rota hazırlanıyor…";

    try {
      await ensureDuelUser();
      const categoryId = state.duelCategoryId || state.categoryId || "all";
      const difficultyId = state.duelDifficultyId || state.difficultyId || "easy";
      const selection = await pickValidatedStartAndTarget(categoryId, difficultyId);
      const { data, error } = await state.supabaseClient.rpc("create_duel_room", {
        p_player_name: state.playerName,
        p_category_id: categoryId,
        p_difficulty_id: difficultyId,
        p_start_title: selection.startTitle,
        p_target_title: selection.targetTitle,
      });
      if (error) throw error;
      const room = mapDuelRoom(Array.isArray(data) ? data[0] : data);
      if (!room) throw new Error("Oda oluşturulamadı.");

      state.duelCategoryId = room.categoryId;
      state.duelDifficultyId = room.difficultyId;
      state.duelRaceLaunched = false;
      setDuelInviteUrl(room.id);
      startDuelWatchers(room.id);
      await applyDuelRoomUpdate(room, { autoStart: false });
      els.duelStatus.textContent =
        "Oda kuruldu. Linki arkadaşına gönder; ikiniz de Hazırım deyince başlar.";
    } catch (error) {
      console.error(error);
      els.duelStatus.textContent =
        error.message ||
        "Oda oluşturulamadı. duel-rooms-migration.sql dosyasını Supabase’te çalıştırdığından emin ol.";
    } finally {
      state.duelBusy = false;
      updateStartButtonState();
      renderDuelLobby();
    }
  }

  async function updateDuelRoomSettings() {
    if (!state.duelRoom || state.duelBusy || getDuelRole() !== "host") return;
    if (!duelSettingsDirty()) {
      els.duelStatus.textContent = "Değişen bir ayar yok.";
      return;
    }

    state.duelBusy = true;
    updateStartButtonState();
    renderDuelSettingsControls();
    els.duelStatus.textContent = "Yeni ayara göre rota üretiliyor…";

    try {
      await ensureDuelUser();
      const categoryId = state.duelCategoryId;
      const difficultyId = state.duelDifficultyId;
      const selection = await pickValidatedStartAndTarget(categoryId, difficultyId);
      const { data, error } = await state.supabaseClient.rpc("update_duel_settings", {
        p_room_id: state.duelRoom.id,
        p_category_id: categoryId,
        p_difficulty_id: difficultyId,
        p_start_title: selection.startTitle,
        p_target_title: selection.targetTitle,
      });
      if (error) throw error;
      const room = mapDuelRoom(Array.isArray(data) ? data[0] : data);
      if (!room) throw new Error("Ayarlar güncellenemedi.");
      state.duelCategoryId = room.categoryId;
      state.duelDifficultyId = room.difficultyId;
      await applyDuelRoomUpdate(room, { autoStart: false });
      els.duelStatus.textContent =
        "Rota güncellendi. Hazır durumları sıfırlandı — ikiniz de yeniden Hazırım deyin.";
    } catch (error) {
      console.error(error);
      els.duelStatus.textContent =
        error.message ||
        "Ayar güncellenemedi. duel-settings-migration.sql dosyasını çalıştırdığından emin ol.";
    } finally {
      state.duelBusy = false;
      updateStartButtonState();
      renderDuelLobby();
    }
  }

  async function joinDuelRoom(roomId) {
    if (!state.isRegistered) {
      els.duelStatus.textContent = "Önce gezgin adını kaydet, sonra düelloya katıl.";
      return;
    }
    if (state.duelBusy) return;
    state.duelBusy = true;
    updateStartButtonState();
    els.duelStatus.textContent = "Odaya katılınıyor…";

    try {
      await ensureDuelUser();
      let room = await fetchDuelRoom(roomId);
      if (!room) throw new Error("Düello odası bulunamadı.");
      if (room.status === "cancelled") throw new Error("Bu oda iptal edilmiş.");
      if (room.status === "finished") throw new Error("Bu düello zaten bitmiş.");

      const alreadyIn =
        room.hostUserId === state.duelUserId ||
        room.guestUserId === state.duelUserId;

      if (!alreadyIn) {
        const { data, error } = await state.supabaseClient.rpc("join_duel_room", {
          p_room_id: roomId,
          p_player_name: state.playerName,
        });
        if (error) throw error;
        room = mapDuelRoom(Array.isArray(data) ? data[0] : data);
      }

      state.duelRaceLaunched = room.status === "racing" ? false : state.duelRaceLaunched;
      setDuelInviteUrl(room.id);
      startDuelWatchers(room.id);
      await applyDuelRoomUpdate(room);
    } catch (error) {
      console.error(error);
      els.duelStatus.textContent = error.message || "Odaya katılınamadı.";
      clearDuelInviteUrl();
    } finally {
      state.duelBusy = false;
      updateStartButtonState();
      renderDuelLobby();
    }
  }

  async function markDuelReady() {
    if (!state.duelRoom || state.duelBusy) return;
    state.duelBusy = true;
    updateStartButtonState();
    try {
      await ensureDuelUser();
      const { data, error } = await state.supabaseClient.rpc("set_duel_ready", {
        p_room_id: state.duelRoom.id,
        p_ready: true,
      });
      if (error) throw error;
      const room = mapDuelRoom(Array.isArray(data) ? data[0] : data);
      await applyDuelRoomUpdate(room);
    } catch (error) {
      console.error(error);
      els.duelStatus.textContent = error.message || "Hazır durumu kaydedilemedi.";
    } finally {
      state.duelBusy = false;
      updateStartButtonState();
      renderDuelLobby();
    }
  }

  async function shareDuelLink() {
    if (!state.duelRoom) return;
    const url = buildDuelInviteUrl(state.duelRoom.id);
    const shareData = {
      title: "VikiRota düellosu",
      text: `${state.duelRoom.startTitle} → ${state.duelRoom.targetTitle} düellosuna gel!`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        els.duelStatus.textContent = "Düello daveti paylaşım menüsüne gönderildi.";
      } else {
        await navigator.clipboard.writeText(url);
        els.duelStatus.textContent = "Oda linki panoya kopyalandı.";
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      window.prompt("Bu düello linkini kopyala:", url);
    }
  }

  async function leaveDuelRoom() {
    if (!state.duelRoom) {
      clearDuelInviteUrl();
      renderDuelLobby();
      return;
    }
    const roomId = state.duelRoom.id;
    const status = state.duelRoom.status;
    try {
      if (["waiting", "ready"].includes(status)) {
        await state.supabaseClient.rpc("cancel_duel_room", { p_room_id: roomId });
      }
    } catch (error) {
      console.warn("Düello iptali:", error);
    }
    stopDuelWatchers();
    state.duelRoom = null;
    state.duelRole = "";
    state.duelRaceLaunched = false;
    clearDuelInviteUrl();
    renderDuelLobby();
    updateStartButtonState();
  }

  async function submitDuelFinish(entry) {
    if (!state.duelRoom || !state.supabaseClient) return null;
    try {
      const { data, error } = await state.supabaseClient.rpc("finish_duel", {
        p_room_id: state.duelRoom.id,
        p_steps: entry.steps,
        p_time_ms: entry.timeMs,
        p_route: entry.routeHistory,
      });
      if (error) throw error;
      const room = mapDuelRoom(Array.isArray(data) ? data[0] : data);
      await applyDuelRoomUpdate(room, { autoStart: false });
      return room;
    } catch (error) {
      console.warn("Düello sonucu gönderilemedi:", error);
      if (els.duelResultStatus) {
        els.duelResultStatus.textContent =
          error.message || "Sonuç sunucuya yazılamadı; rakip karşılaştırması gecikebilir.";
      }
      return null;
    }
  }

  function duelSortKey(steps, timeMs) {
    return Number(steps) * 1e9 + Number(timeMs);
  }

  function renderDuelResultPanel() {
    if (!els.duelResult) return;
    const room = state.duelRoom;
    const isDuel = state.gameMode === "duel" || (room && ["racing", "finished"].includes(room.status));
    if (!isDuel || !room || !state.isWon) {
      els.duelResult.hidden = true;
      if (els.duelCompleteBadge) els.duelCompleteBadge.hidden = true;
      return;
    }

    els.duelResult.hidden = false;
    if (els.duelCompleteBadge) {
      els.duelCompleteBadge.hidden = room.status !== "finished";
    }

    const hostDone = room.hostFinished;
    const guestDone = room.guestFinished;
    let winnerSide = "";
    if (hostDone && guestDone) {
      const hostKey = duelSortKey(room.hostSteps, room.hostTimeMs);
      const guestKey = duelSortKey(room.guestSteps, room.guestTimeMs);
      if (hostKey < guestKey) winnerSide = "host";
      else if (guestKey < hostKey) winnerSide = "guest";
      else winnerSide = "tie";
      els.duelResultStatus.textContent =
        winnerSide === "tie"
          ? "Berabere! Aynı adım ve süre."
          : winnerSide === "host"
            ? `${room.hostName} kazandı.`
            : `${room.guestName} kazandı.`;
    } else {
      els.duelResultStatus.textContent = "Rakibin bitirmesi bekleniyor…";
    }

    const cards = [
      {
        side: "host",
        name: room.hostName,
        done: hostDone,
        steps: room.hostSteps,
        timeMs: room.hostTimeMs,
      },
      {
        side: "guest",
        name: room.guestName || "Rakip",
        done: guestDone,
        steps: room.guestSteps,
        timeMs: room.guestTimeMs,
      },
    ];

    els.duelResultGrid.innerHTML = cards
      .map((card) => {
        const you = getDuelRole(room) === card.side ? " (sen)" : "";
        const winnerClass =
          winnerSide === card.side ? " is-winner" : card.done ? "" : " is-pending";
        const body = card.done
          ? `<span>${card.steps} adım</span><span>${formatTime(card.timeMs)}</span>`
          : "<span>Henüz bitmedi</span>";
        return `<div class="duel-result__card${winnerClass}">
          <strong>${escapeHtml(card.name || "—")}${you}</strong>
          ${body}
        </div>`;
      })
      .join("");
  }

  async function maybeResumeDuelFromUrl() {
    const roomId = readDuelRoomIdFromUrl();
    if (!roomId || !state.supabaseReady) {
      renderDuelLobby();
      return;
    }
    if (!state.isRegistered) {
      els.duelStatus.textContent =
        "Düello daveti algılandı. Gezgin adını kaydet; odaya otomatik katılacağız.";
      renderDuelLobby();
      return;
    }
    await joinDuelRoom(roomId);
  }

  function loadProfiles() {
    try {
      const profiles = JSON.parse(localStorage.getItem(STORAGE_PROFILES) || "{}");
      return profiles && typeof profiles === "object" ? profiles : {};
    } catch {
      return {};
    }
  }

  function getProfileKey(name = state.playerName) {
    return String(name || "").trim().toLocaleLowerCase("tr-TR");
  }

  function createEmptyProfile() {
    return {
      gamesStarted: 0,
      wins: 0,
      totalTimeMs: 0,
      totalSteps: 0,
      categoryWins: {},
      difficultyWins: { easy: 0, medium: 0, hard: 0 },
      dailyWins: 0,
      bestSteps: 9999,
      bestTimeMs: Number.MAX_SAFE_INTEGER,
      achievements: [],
    };
  }

  function normalizeProfile(profile) {
    const empty = createEmptyProfile();
    const normalized = {
      ...empty,
      ...profile,
      categoryWins: { ...empty.categoryWins, ...(profile.categoryWins || {}) },
      difficultyWins: {
        ...empty.difficultyWins,
        ...(profile.difficultyWins || {}),
      },
      achievements: Array.isArray(profile.achievements)
        ? [...profile.achievements]
        : [],
    };
    if (!Number.isFinite(normalized.bestSteps) || normalized.bestSteps < 1) {
      normalized.bestSteps = empty.bestSteps;
    }
    if (!Number.isFinite(normalized.bestTimeMs) || normalized.bestTimeMs < 1) {
      normalized.bestTimeMs = empty.bestTimeMs;
    }

    const legacyMap = {
      first_finish: "level_01",
      under_five: "level_09",
      speed_minute: "level_10",
      daily_finish: "level_08",
      ten_wins: "level_10",
      ten_categories: "level_19",
    };
    normalized.achievements = [
      ...new Set(
        normalized.achievements.map((id) => legacyMap[id] || id)
      ),
    ];
    return normalized;
  }

  function getPlayerProfile() {
    const profiles = loadProfiles();
    return normalizeProfile(profiles[getProfileKey()] || createEmptyProfile());
  }

  function savePlayerProfile(profile) {
    const profiles = loadProfiles();
    profiles[getProfileKey()] = profile;
    localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles));
  }

  function markProfileGameStarted() {
    if (!state.playerName || state.roundProfileCounted) return;
    const profile = getPlayerProfile();
    profile.gamesStarted += 1;
    savePlayerProfile(profile);
    state.roundProfileCounted = true;
    renderProfile();
  }

  function completeProfileRound(entry) {
    const profile = getPlayerProfile();
    profile.wins += 1;
    profile.totalTimeMs += entry.timeMs;
    profile.totalSteps += entry.steps;
    profile.categoryWins[entry.categoryId] =
      (profile.categoryWins[entry.categoryId] || 0) + 1;
    profile.difficultyWins[entry.difficultyId] =
      (profile.difficultyWins[entry.difficultyId] || 0) + 1;
    if (entry.gameMode === "daily") profile.dailyWins += 1;
    profile.bestSteps = Math.min(profile.bestSteps, entry.steps);
    profile.bestTimeMs = Math.min(profile.bestTimeMs, entry.timeMs);

    const unlocked = new Set(profile.achievements);
    const newIds = ACHIEVEMENTS
      .filter((achievement) =>
        achievement.condition(profile) && !unlocked.has(achievement.id)
      )
      .map((achievement) => achievement.id);
    newIds.forEach((id) => unlocked.add(id));
    profile.achievements = [...unlocked];
    savePlayerProfile(profile);
    renderProfile();
    return newIds;
  }

  function renderProfile() {
    const profile = state.playerName ? getPlayerProfile() : createEmptyProfile();
    els.profileGames.textContent = String(profile.gamesStarted);
    els.profileWins.textContent = String(profile.wins);
    els.profileAverageTime.textContent = profile.wins
      ? formatTime(profile.totalTimeMs / profile.wins)
      : "—";
    const favorite = Object.entries(profile.categoryWins).sort(
      (a, b) => b[1] - a[1]
    )[0];
    els.profileFavoriteCategory.textContent = favorite
      ? getCategoryById(favorite[0]).label
      : "—";

    const unlocked = new Set(profile.achievements);
    els.profileAchievements.innerHTML = ACHIEVEMENTS.map(
      (achievement) => `
        <li class="achievement achievement--${achievement.tier} ${
          unlocked.has(achievement.id) ? "is-unlocked" : "is-locked"
        }">
          <img
            class="achievement__badge"
            src="${getAchievementBadgeSrc(achievement.level)}"
            alt="${achievement.title} rozeti"
            loading="lazy"
          />
          <div>
            <strong>Level ${achievement.level} · ${achievement.title}</strong>
            <small>${achievement.description}</small>
          </div>
        </li>
      `
    ).join("");
  }

  /* ---------- Rekor depolama ---------- */

  /** Yerel rekor listesini okur */
  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_RECORDS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Rekorları diske yazar */
  function saveRecords(records) {
    localStorage.setItem(STORAGE_RECORDS, JSON.stringify(records.slice(0, MAX_RECORDS)));
  }

  /**
   * Sıralama: önce daha az adım, eşitse daha kısa süre.
   * Skor anahtarı küçük olan daha iyi.
   */
  function recordSortKey(record) {
    return record.steps * 1e9 + record.timeMs;
  }

  function compareRecords(a, b) {
    return recordSortKey(a) - recordSortKey(b);
  }

  /** Genel en iyi rekoru döndürür */
  function getBestRecord(records = loadRecords()) {
    if (!records.length) return null;
    return [...records].sort(compareRecords)[0];
  }

  /** Yeni bitişi kaydeder; genel rekor kırıldıysa true döner */
  function addRecord(entry) {
    const records = loadRecords();
    const previousBest = getBestRecord(records);
    records.push(entry);
    records.sort(compareRecords);
    saveRecords(records);

    const isNewBest =
      !previousBest || recordSortKey(entry) < recordSortKey(previousBest);
    return isNewBest;
  }

  /* ---------- UI: lobi / rekorlar ---------- */

  /** Arka planda yavaşça yükselen kelime etiketlerini üretir */
  function spawnFloatWords() {
    if (!els.floatWords) return;
    els.floatWords.innerHTML = "";
    const picks = shuffle(FLOAT_WORDS).slice(0, 14);
    picks.forEach((word, i) => {
      const span = document.createElement("span");
      span.textContent = word;
      span.style.left = `${6 + ((i * 7) % 88)}%`;
      span.style.bottom = `${-10 - (i % 5) * 8}%`;
      span.style.animationDuration = `${14 + (i % 7) * 2.2}s`;
      span.style.animationDelay = `${i * 0.7}s`;
      span.style.setProperty("--rot", `${(i % 2 === 0 ? -1 : 1) * (3 + (i % 5))}deg`);
      els.floatWords.appendChild(span);
    });
  }

  function renderDifficulties() {
    els.difficultyGrid.innerHTML = "";
    DIFFICULTIES.forEach((diff) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        `difficulty-card difficulty-card--${diff.id}` +
        (diff.id === state.difficultyId ? " is-selected" : "");
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", diff.id === state.difficultyId ? "true" : "false");
      btn.dataset.difficultyId = diff.id;
      btn.innerHTML = `
        <div class="difficulty-card__top">
          <span class="difficulty-card__name">${diff.label}</span>
          <span class="difficulty-card__bars" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
        <p class="difficulty-card__desc">${diff.description}</p>
      `;
      btn.addEventListener("click", () => selectDifficulty(diff.id));
      els.difficultyGrid.appendChild(btn);
    });
    if (els.difficultyHint) {
      els.difficultyHint.textContent = getDifficultyById(state.difficultyId).hint;
    }
  }

  function selectDifficulty(id) {
    state.difficultyId = id;
    renderDifficulties();
    renderDuelLobby();
  }

  function renderCategories() {
    els.categoryGrid.innerHTML = "";
    CATEGORIES.forEach((cat, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-chip" + (cat.id === state.categoryId ? " is-selected" : "");
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", cat.id === state.categoryId ? "true" : "false");
      btn.dataset.categoryId = cat.id;
      btn.title = cat.description;
      btn.textContent = cat.label;
      btn.style.animationDelay = `${0.04 * index}s`;
      btn.addEventListener("click", () => selectCategory(cat.id));
      els.categoryGrid.appendChild(btn);
    });
  }

  function selectCategory(id) {
    state.categoryId = id;
    renderCategories();
    updateStartButtonState();
    renderDuelLobby();
  }

  function updateStartButtonState() {
    const inDuelLobby =
      Boolean(state.duelRoom) &&
      ["waiting", "ready"].includes(state.duelRoom.status);
    const busy = state.duelBusy || inDuelLobby;
    els.startBtn.disabled = !state.isRegistered || busy;
    els.dailyStartBtn.disabled = !state.isRegistered || busy;
    els.weeklyStartBtn.disabled = !state.isRegistered || busy;
    els.sharedStartBtn.disabled = !state.isRegistered || busy;
    if (els.duelCreateBtn) {
      els.duelCreateBtn.disabled =
        !state.isRegistered ||
        !state.supabaseReady ||
        state.duelBusy ||
        inDuelLobby;
    }
  }

  function setRegisteredUI(name) {
    state.playerName = name;
    state.isRegistered = true;
    els.playerName.value = name;
    els.playerName.disabled = true;
    els.registerBtn.hidden = true;
    els.changePlayerBtn.hidden = false;
    els.registerHint.textContent = `Hoş geldin, ${name} — arena senin.`;
    updateStartButtonState();
    renderProfile();
    renderDuelLobby();
    if (state.supabaseReady) maybeResumeDuelFromUrl();
  }

  function setUnregisterUI() {
    state.isRegistered = false;
    state.playerName = "";
    els.playerName.disabled = false;
    els.playerName.value = "";
    els.registerBtn.hidden = false;
    els.changePlayerBtn.hidden = true;
    els.registerHint.textContent = "Gezgin adını yaz, arenaya gir";
    updateStartButtonState();
    renderProfile();
    localStorage.removeItem(STORAGE_PLAYER);
  }

  /** Yerel veya çevrim içi rekor listesini etkin filtrelerle çizer */
  function renderRecords(recordsInput = null, scope = state.leaderboardScope) {
    const categoryFilter = els.leaderboardCategoryFilter.value;
    const difficultyFilter = els.leaderboardDifficultyFilter.value;
    const modeFilter = els.leaderboardModeFilter.value;
    const currentWeekKey = getIstanbulWeekKey();
    const currentDayKey = getIstanbulDateKey();
    let sourceRecords =
      recordsInput ||
      (scope === "online" ? state.onlineRecords : loadRecords());

    // Çevrim içi haftalık/günlük boşsa bu cihazdaki sezon skorlarını da göster
    if (!recordsInput && scope === "online" && (modeFilter === "weekly" || modeFilter === "daily")) {
      const onlineMatched = state.onlineRecords.filter((record) =>
        modeFilter === "weekly"
          ? record.gameMode === "weekly" && record.weeklyKey === currentWeekKey
          : record.gameMode === "daily" && record.dailyKey === currentDayKey
      );
      if (!onlineMatched.length) {
        sourceRecords = loadRecords();
        setLeaderboardStatus(
          modeFilter === "weekly"
            ? "Çevrim içi haftalık skor yok; bu haftanın cihaz skorları gösteriliyor."
            : "Çevrim içi günlük skor yok; bugünün cihaz skorları gösteriliyor.",
          "warning"
        );
      }
    }

    const records = sourceRecords
      .filter((record) => !categoryFilter || record.categoryId === categoryFilter)
      .filter((record) => !difficultyFilter || record.difficultyId === difficultyFilter)
      .filter((record) => {
        if (!modeFilter) return true;
        if (modeFilter === "daily") {
          return record.gameMode === "daily" && record.dailyKey === currentDayKey;
        }
        if (modeFilter === "weekly") {
          return record.gameMode === "weekly" && record.weeklyKey === currentWeekKey;
        }
        return record.gameMode !== "daily" && record.gameMode !== "weekly";
      })
      .sort(compareRecords);
    const best = getBestRecord(records);

    state.leaderboardScope = scope;
    els.leaderboardOnlineTab.classList.toggle("is-active", scope === "online");
    els.leaderboardLocalTab.classList.toggle("is-active", scope === "local");
    els.leaderboardOnlineTab.setAttribute(
      "aria-selected",
      scope === "online" ? "true" : "false"
    );
    els.leaderboardLocalTab.setAttribute(
      "aria-selected",
      scope === "local" ? "true" : "false"
    );
    els.clearRecordsBtn.hidden = scope === "online";

    if (!best) {
      els.bestEmpty.hidden = false;
      els.bestFilled.hidden = true;
    } else {
      els.bestEmpty.hidden = true;
      els.bestFilled.hidden = false;
      els.bestPlayer.textContent = best.playerName;
      els.bestTime.textContent = formatTime(best.timeMs);
      els.bestSteps.textContent = String(best.steps);
      els.bestRoute.textContent = `${best.startTitle} → ${best.targetTitle}`;
      els.bestMeta.textContent =
        `${best.categoryLabel} · ${new Date(best.date).toLocaleString("tr-TR")}`;
      els.bestMeta.hidden = false;
    }

    if (!records.length) {
      els.recordsBody.innerHTML = `
        <tr class="records__empty">
          <td colspan="6">${
            scope === "online"
              ? "Bu filtrelerde çevrim içi sonuç bulunamadı."
              : "Henüz kayıtlı bir bitiriş yok."
          }</td>
        </tr>
      `;
      return;
    }

    els.recordsBody.innerHTML = records
      .slice(0, 20)
      .map(
        (r, i) => `
        <tr class="${i === 0 ? "is-top" : ""}">
          <td>${i + 1}</td>
          <td>${escapeHtml(r.playerName)}</td>
          <td>${escapeHtml(r.categoryLabel)}</td>
          <td>${escapeHtml(r.difficultyLabel || "—")}</td>
          <td>${r.steps}</td>
          <td>${formatTime(r.timeMs)}</td>
        </tr>
      `
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Çevrim içi liderlik ---------- */

  function populateLeaderboardFilters() {
    for (const category of CATEGORIES) {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.label;
      els.leaderboardCategoryFilter.appendChild(option);
    }
  }

  function setLeaderboardStatus(message, type = "info") {
    els.leaderboardStatus.textContent = message;
    els.leaderboardStatus.dataset.type = type;
  }

  function loadSyncQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_SYNC_QUEUE) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSyncQueue(queue) {
    localStorage.setItem(STORAGE_SYNC_QUEUE, JSON.stringify(queue));
  }

  function enqueueRecordForSync(entry) {
    const queue = loadSyncQueue();
    if (!queue.some((item) => item.id === entry.id)) queue.push(entry);
    saveSyncQueue(queue.slice(-50));
  }

  function mapOnlineRecord(row) {
    return {
      id: String(row.id),
      playerName: row.player_name,
      categoryId: row.category_id,
      categoryLabel: getCategoryById(row.category_id).label,
      difficultyId: row.difficulty_id,
      difficultyLabel: getDifficultyById(row.difficulty_id).label,
      gameMode: row.game_mode,
      dailyKey: row.daily_key,
      weeklyKey: row.weekly_key,
      startTitle: row.start_title,
      targetTitle: row.target_title,
      routeHistory: row.route_history || [],
      steps: row.steps,
      timeMs: row.time_ms,
      date: row.created_at,
    };
  }

  async function fetchOnlineRecords() {
    if (!state.supabaseReady || !state.supabaseClient) return;
    setLeaderboardStatus("Çevrim içi rekorlar yükleniyor…");

    const { data, error } = await state.supabaseClient
      .from("leaderboard_public")
      .select("*")
      .order("steps", { ascending: true })
      .order("time_ms", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      setLeaderboardStatus(`Çevrim içi tablo alınamadı: ${error.message}`, "error");
      return;
    }

    state.onlineRecords = (data || []).map(mapOnlineRecord);
    setLeaderboardStatus("Çevrim içi genel sıralama gösteriliyor.", "success");
    if (state.leaderboardScope === "online") {
      renderRecords(null, "online");
    }
    renderWeeklyStandings();
  }

  async function ensureAnonymousSession() {
    const { data: sessionData } = await state.supabaseClient.auth.getSession();
    if (sessionData.session) return sessionData.session.user;

    const { data, error } = await state.supabaseClient.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  /** Sunucuda süre ölçümünü başlatan tek kullanımlık yarış oturumu açar. */
  async function startVerifiedOnlineSession() {
    state.onlineSessionId = "";
    if (!state.supabaseReady || !state.supabaseClient) return false;

    try {
      await ensureAnonymousSession();
      const { data, error } = await state.supabaseClient.functions.invoke(
        "verify-score",
        {
          body: {
            action: "start",
            playerName: state.playerName,
            categoryId: state.categoryId,
            difficultyId: state.difficultyId,
            gameMode: state.gameMode,
            dailyKey: state.dailyKey || null,
            weeklyKey: state.weeklyKey || null,
            startTitle: state.startTitle,
            targetTitle: state.targetTitle,
          },
        }
      );
      if (error || !data?.sessionId) throw error || new Error("Oturum açılamadı.");
      state.onlineSessionId = data.sessionId;
      return true;
    } catch (error) {
      console.warn("Doğrulanmış yarış oturumu açılamadı:", error);
      return false;
    }
  }

  async function submitOnlineRecord(entry, addToQueueOnFailure = true) {
    if (!entry.onlineSessionId || !Array.isArray(entry.routeProof)) {
      return false;
    }
    if (!state.supabaseReady || !state.supabaseClient) {
      if (addToQueueOnFailure) enqueueRecordForSync(entry);
      return false;
    }

    try {
      await ensureAnonymousSession();
      const { error } = await state.supabaseClient.functions.invoke("verify-score", {
        body: {
          action: "finish",
          sessionId: entry.onlineSessionId,
          clientRecordId: entry.id,
          routeProof: entry.routeProof,
          steps: entry.steps,
        },
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn("Skor sunucuda doğrulanamadı:", error);
      if (addToQueueOnFailure) enqueueRecordForSync(entry);
      return false;
    }
  }

  async function syncPendingRecords() {
    const queue = loadSyncQueue();
    if (!queue.length || !state.supabaseReady) return;

    const remaining = [];
    for (const entry of queue) {
      if (!entry.onlineSessionId || !Array.isArray(entry.routeProof)) continue;
      const synced = await submitOnlineRecord(entry, false);
      if (!synced && (entry.syncAttempts || 0) < 3) {
        remaining.push({ ...entry, syncAttempts: (entry.syncAttempts || 0) + 1 });
      }
    }
    saveSyncQueue(remaining);
  }

  async function initializeSupabase() {
    const config = window.VIKIROTA_SUPABASE_CONFIG || {};
    const hasConfig =
      /^https:\/\/.+\.supabase\.co$/i.test(config.url || "") &&
      Boolean(config.publishableKey);

    if (!hasConfig || !window.supabase?.createClient) {
      state.leaderboardScope = "local";
      setLeaderboardStatus(
        "Çevrim içi tablo için supabase-config.js yapılandırılmalı.",
        "warning"
      );
      renderRecords(null, "local");
      return;
    }

    try {
      state.supabaseClient = window.supabase.createClient(
        config.url,
        config.publishableKey
      );
      await ensureAnonymousSession();
      state.supabaseReady = true;
      await syncPendingRecords();
      state.leaderboardScope = "online";
      await fetchOnlineRecords();
      await maybeResumeDuelFromUrl();
      renderDuelLobby();
    } catch (error) {
      console.warn("Supabase başlatılamadı:", error);
      state.supabaseReady = false;
      state.leaderboardScope = "local";
      setLeaderboardStatus(
        "Çevrim içi bağlantı kurulamadı; cihaz kayıtları kullanılacak.",
        "error"
      );
      renderRecords(null, "local");
      renderDuelLobby();
    }
  }

  function switchLeaderboard(scope) {
    if (scope === "online") {
      state.leaderboardScope = "online";
      if (!state.supabaseReady) {
        renderRecords([], "online");
        setLeaderboardStatus(
          "Çevrim içi liderlik henüz yapılandırılmadı veya bağlantı kurulamadı.",
          "warning"
        );
        return;
      }
      renderRecords(state.onlineRecords, "online");
      fetchOnlineRecords();
      return;
    }

    setLeaderboardStatus("Bu cihazdaki kayıtlar gösteriliyor.");
    renderRecords(null, "local");
  }

  /* ---------- MediaWiki API ---------- */

  async function apiQuery(params) {
    const search = new URLSearchParams({
      format: "json",
      formatversion: "2",
      origin: "*",
      ...params,
    });

    // MediaWiki yoğunluk sınırına girerse üstel beklemelerle yeniden dene
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${API_BASE}?${search.toString()}`);
      const responseText = await response.text();
      const isRateLimited =
        response.status === 429 ||
        response.status === 503 ||
        /too many requests|maxlag/i.test(responseText);

      if (isRateLimited && attempt < 4) {
        await wait(800 * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Ağ yanıtı başarısız: ${response.status}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("Vikipedi geçici olarak geçersiz yanıt verdi.");
      }

      if (data.error) throw new Error(data.error.info || "API hatası");
      return data;
    }

    throw new Error("Vikipedi şu anda yoğun. Biraz sonra yeniden dene.");
  }

  /** Bir maddenin ana ad alanındaki çıkış bağlantılarını önbellekli çeker */
  async function fetchOutgoingLinks(pageTitle, maxLinks = 160) {
    const cacheKey = normalizeTitle(pageTitle);
    if (outgoingLinksCache.has(cacheKey)) {
      return outgoingLinksCache.get(cacheKey).slice(0, maxLinks);
    }

    const links = [];
    let continuation = {};
    do {
      const data = await apiQuery({
        action: "query",
        prop: "links",
        titles: pageTitle,
        plnamespace: "0",
        pllimit: "max",
        redirects: "1",
        ...continuation,
      });
      const page = data.query?.pages?.[0];
      links.push(...(page?.links || []).map((link) => link.title));
      continuation = data.continue
        ? { plcontinue: data.continue.plcontinue, continue: data.continue.continue }
        : {};
    } while (continuation.plcontinue && links.length < maxLinks);

    const unique = [...new Set(links)].filter(isPlayableTitle).slice(0, maxLinks);
    outgoingLinksCache.set(cacheKey, unique);
    return unique;
  }

  /** Birden çok maddenin çıkış bağlantılarını az sayıda API isteğiyle çeker */
  async function fetchOutgoingLinksBatch(pageTitles, maxLinks = 100) {
    const result = new Map();
    const uncached = [];

    for (const title of pageTitles) {
      const key = normalizeTitle(title);
      if (outgoingLinksCache.has(key)) {
        result.set(key, outgoingLinksCache.get(key).slice(0, maxLinks));
      } else {
        uncached.push(title);
      }
    }

    for (let index = 0; index < uncached.length; index += 8) {
      const chunk = uncached.slice(index, index + 8);
      const data = await apiQuery({
        action: "query",
        prop: "links",
        titles: chunk.join("|"),
        plnamespace: "0",
        pllimit: String(maxLinks),
        redirects: "1",
      });
      const pageMap = new Map();
      for (const page of data.query?.pages || []) {
        const links = [...new Set((page.links || []).map((link) => link.title))]
          .filter(isPlayableTitle)
          .slice(0, maxLinks);
        outgoingLinksCache.set(normalizeTitle(page.title), links);
        pageMap.set(normalizeTitle(page.title), links);
      }
      const redirectMap = new Map(
        (data.query?.redirects || []).map((redirect) => [
          normalizeTitle(redirect.from),
          normalizeTitle(redirect.to),
        ])
      );
      for (const title of chunk) {
        const key = normalizeTitle(title);
        const canonicalKey = redirectMap.get(key) || key;
        const links = pageMap.get(canonicalKey) || [];
        outgoingLinksCache.set(key, links);
        result.set(key, links);
      }
      if (index + 8 < uncached.length) await wait(120);
    }

    return result;
  }

  /** Hedef maddeye bağlantı veren ana ad alanı sayfalarını önbellekli çeker */
  async function fetchBacklinks(pageTitle, maxLinks = 220) {
    const cacheKey = normalizeTitle(pageTitle);
    if (backlinksCache.has(cacheKey)) {
      return backlinksCache.get(cacheKey).slice(0, maxLinks);
    }

    const links = [];
    let continuation = {};
    do {
      const data = await apiQuery({
        action: "query",
        list: "backlinks",
        bltitle: pageTitle,
        blnamespace: "0",
        bllimit: "max",
        blfilterredir: "nonredirects",
        ...continuation,
      });
      links.push(...(data.query?.backlinks || []).map((link) => link.title));
      continuation = data.continue
        ? { blcontinue: data.continue.blcontinue, continue: data.continue.continue }
        : {};
    } while (continuation.blcontinue && links.length < maxLinks);

    const unique = [...new Set(links)].filter(isPlayableTitle).slice(0, maxLinks);
    backlinksCache.set(cacheKey, unique);
    return unique;
  }

  /**
   * Başlangıçtan hedefe doğrudan, iki veya üç bağlantılık yönlü yol arar.
   * allowedTitles verilirse ara duraklar yalnızca seçilen kategori havuzundan gelir.
   * Canlıda kategori start/target havuzda kalır; ara hop’lar genelde serbest bırakılır.
   */
  async function findRouteWithinThree(startTitle, targetTitle, allowedTitles = null) {
    const targetKey = normalizeTitle(targetTitle);
    const allowedKeys = allowedTitles
      ? new Set([...allowedTitles].map(normalizeTitle))
      : null;
    const isAllowed = (title) => !allowedKeys || allowedKeys.has(normalizeTitle(title));

    const [startLinksRaw, targetBacklinksRaw] = await Promise.all([
      fetchOutgoingLinks(startTitle, 160),
      fetchBacklinks(targetTitle, 220),
    ]);
    const startLinks = startLinksRaw.filter(isAllowed);
    const directTitle = startLinks.find((title) => normalizeTitle(title) === targetKey);
    if (directTitle) return [startTitle, directTitle];

    const backlinkMap = new Map(
      targetBacklinksRaw.filter(isAllowed).map((title) => [normalizeTitle(title), title])
    );
    const twoStep = startLinks.find((title) => backlinkMap.has(normalizeTitle(title)));
    if (twoStep) return [startTitle, twoStep, targetTitle];

    const middleCandidates = shuffle(startLinks)
      .filter((title) => normalizeTitle(title) !== targetKey)
      .slice(0, 36);

    const middleLinkMap = await fetchOutgoingLinksBatch(middleCandidates, 120);
    for (const middleTitle of middleCandidates) {
      const links = middleLinkMap.get(normalizeTitle(middleTitle)) || [];
      const bridge = links
        .filter(isAllowed)
        .find((title) => backlinkMap.has(normalizeTitle(title)));
      if (bridge) return [startTitle, middleTitle, bridge, targetTitle];
    }

    return null;
  }

  /** +1 adım karşılığında hedefe giden bir sonraki bağlantıyı vurgular */
  async function requestHint() {
    if (
      state.isHinting ||
      state.isFetching ||
      state.isCountingDown ||
      state.isWon ||
      !state.currentTitle
    ) {
      return;
    }

    state.isHinting = true;
    els.hintBtn.disabled = true;
    els.hintMessage.hidden = false;
    els.hintMessage.textContent = "Yakın bir bilgi izi aranıyor…";

    try {
      const currentKey = normalizeTitle(state.currentTitle);
      const routeIndex = state.validatedRoute.findIndex(
        (title) => normalizeTitle(title) === currentKey
      );
      let nextTitle =
        routeIndex >= 0 ? state.validatedRoute[routeIndex + 1] : null;

      if (!nextTitle) {
        const route = await findRouteWithinThree(
          state.currentTitle,
          state.targetTitle
        );
        nextTitle = route?.[1];
      }
      if (!nextTitle) {
        throw new Error("Bu maddeden üç adım içinde güvenli bir ipucu bulunamadı.");
      }

      const anchor = [...els.articleBody.querySelectorAll("a.wiki-link")].find(
        (link) =>
          normalizeTitle(link.getAttribute("data-title")) ===
          normalizeTitle(nextTitle)
      );
      if (!anchor) {
        throw new Error("Önerilen bağlantı bu maddede görünmüyor.");
      }

      // İpucu yalnızca bir sonraki adımı gösterir; ceza sadece +1 adımdır.
      state.steps += 1;
      refreshHud();

      els.articleBody
        .querySelectorAll(".is-hint")
        .forEach((link) => link.classList.remove("is-hint"));
      anchor.classList.add("is-hint");
      anchor.scrollIntoView({ behavior: "smooth", block: "center" });
      playSound("hint");
      els.hintMessage.textContent =
        `İpucu: “${anchor.textContent.trim()}” bağlantısını dene. (+1 adım)`;
    } catch (error) {
      els.hintMessage.textContent = error.message;
    } finally {
      state.isHinting = false;
      els.hintBtn.disabled = state.isWon || state.isCountingDown;
    }
  }

  /** Makale HTML içeriğini çeker */
  async function fetchArticleHtml(pageTitle) {
    const data = await apiQuery({
      action: "parse",
      page: pageTitle,
      prop: "text|displaytitle",
      redirects: "1",
      disableeditsection: "1",
    });
    return {
      title: data.parse.title,
      html: data.parse.text,
    };
  }

  /**
   * Tüm Türkçe madde uzayından rastgele başlıklar alır.
   * Anlam ayrımı ve yönlendirmeler elenir.
   */
  async function fetchRandomTitles(count = 8) {
    const data = await apiQuery({
      action: "query",
      list: "random",
      rnnamespace: "0",
      rnfilterredir: "nonredirects",
      rnlimit: String(Math.min(count, 20)),
    });
    const titles = (data.query?.random || [])
      .map((item) => item.title)
      .filter(isPlayableTitle);
    return filterDisambiguations(titles);
  }

  /**
   * Kategorideki düz maddeleri çeker (alt kategori değil).
   */
  async function fetchPagesInCategory(categoryTitle, limit = 100) {
    const data = await apiQuery({
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmnamespace: "0",
      cmtype: "page",
      cmlimit: String(limit),
    });
    return (data.query?.categorymembers || [])
      .map((m) => m.title)
      .filter(isPlayableTitle);
  }

  /** Kategorinin alt kategorilerini listeler */
  async function fetchSubcategories(categoryTitle) {
    const data = await apiQuery({
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmtype: "subcat",
      cmlimit: "40",
    });
    return (data.query?.categorymembers || []).map((m) => m.title);
  }

  /**
   * Kategori + rastgele alt kategorilerden madde havuzu kurar.
   * Üst kategorilerde madde az olduğundan alt raflara iner.
   */
  async function fetchCategoryTitles(categoryTitle) {
    if (categoryCache.has(categoryTitle)) {
      return categoryCache.get(categoryTitle);
    }

    const titles = [];
    titles.push(...(await fetchPagesInCategory(categoryTitle)));

    const subcats = shuffle(await fetchSubcategories(categoryTitle)).slice(0, 3);
    for (const sub of subcats) {
      await wait(140);
      const pages = await fetchPagesInCategory(sub);
      titles.push(...pages);

      // Toplam havuz hâlâ zayıfsa yalnızca bir seviye daha in
      if (titles.length < 20 && pages.length < 8) {
        const deeper = shuffle(await fetchSubcategories(sub)).slice(0, 1);
        for (const deep of deeper) {
          await wait(140);
          titles.push(...(await fetchPagesInCategory(deep)));
        }
      }
    }

    const unique = [...new Set(titles)].filter(isPlayableTitle);
    categoryCache.set(categoryTitle, unique);
    return unique;
  }

  /** pageprops ile anlam ayrımı sayfalarını ayıklar */
  async function filterDisambiguations(titles) {
    if (!titles.length) return [];
    const chunk = titles.slice(0, 40);
    const data = await apiQuery({
      action: "query",
      titles: chunk.join("|"),
      prop: "pageprops|info",
      redirects: "1",
      ppprop: "disambiguation",
    });

    const pages = data.query?.pages || [];
    return pages
      .filter((p) => !p.missing && !p.pageprops?.disambiguation)
      .map((p) => p.title)
      .filter(isPlayableTitle);
  }

  /**
   * Başlık listesine madde uzunluğu ekler (zorluk süzgeci için).
   */
  async function enrichWithLength(titles) {
    const unique = [...new Set(titles)].slice(0, 80);
    if (!unique.length) return [];

    const scored = [];
    for (let i = 0; i < unique.length; i += 20) {
      const chunk = unique.slice(i, i + 20);
      const data = await apiQuery({
        action: "query",
        titles: chunk.join("|"),
        prop: "info",
        redirects: "1",
      });
      for (const page of data.query?.pages || []) {
        if (page.missing) continue;
        scored.push({
          title: page.title,
          length: page.length || 0,
        });
      }
      if (i + 20 < unique.length) await wait(120);
    }
    return scored.filter((item) => isPlayableTitle(item.title));
  }

  /**
   * Zorluğa göre madde havuzunu süz:
   * kolay → uzun/zengin, orta → orta kuşak, zor → kısa/ücra (ama tamamen ölü stub değil)
   */
  function filterPoolByDifficulty(scored, difficultyId) {
    if (scored.length <= 2) return scored.map((s) => s.title);

    const sorted = [...scored].sort((a, b) => b.length - a.length);

    if (difficultyId === "easy") {
      const rich = sorted.filter((s) => s.length >= 18000);
      const pool = rich.length >= 2 ? rich : sorted.slice(0, Math.max(4, Math.ceil(sorted.length * 0.4)));
      return pool.map((s) => s.title);
    }

    if (difficultyId === "hard") {
      const stubs = sorted.filter((s) => s.length >= 1200 && s.length <= 18000);
      const pool =
        stubs.length >= 2
          ? stubs
          : sorted.slice(-Math.max(4, Math.ceil(sorted.length * 0.45)));
      return pool.map((s) => s.title);
    }

    // orta
    const start = Math.floor(sorted.length * 0.2);
    const end = Math.ceil(sorted.length * 0.75);
    const mid = sorted.slice(start, end);
    const pool = mid.length >= 2 ? mid : sorted;
    return pool.map((s) => s.title);
  }

  /** Bağlantısı çok zayıf maddeleri alta iterek rota bulunabilirliğini artırır */
  async function preferLinkedTitles(titles, minLinks = 3) {
    if (titles.length < 3) return titles;
    const sample = titles.slice(0, Math.min(titles.length, 24));
    const linkMap = await fetchOutgoingLinksBatch(sample, 40);
    const rich = sample.filter(
      (title) => (linkMap.get(normalizeTitle(title)) || []).length >= minLinks
    );
    if (rich.length < 2) return titles;
    const richKeys = new Set(rich.map(normalizeTitle));
    const rest = titles.filter((title) => !richKeys.has(normalizeTitle(title)));
    return shuffle([...rich, ...rest]);
  }

  /**
   * Seçilen kategori + zorluğa göre iki farklı oynanabilir madde seçer.
   */
  async function pickStartAndTarget(categoryId, difficultyId = state.difficultyId) {
    const category = getCategoryById(categoryId);
    let pool = [];

    if (category.mode === "random") {
      // Zorluk süzgeci için daha geniş havuz
      const rounds = difficultyId === "easy" ? 6 : 5;
      for (let i = 0; i < rounds; i += 1) {
        const batch = await fetchRandomTitles(15);
        pool.push(...batch);
        await wait(150);
      }
    } else {
      const wikiCats = shuffle(category.wikiCategories || []);
      // Havuz yeterli olana kadar yalnızca seçilen kategorinin köklerini tara
      for (const wikiCat of wikiCats) {
        try {
          const titles = await fetchCategoryTitles(wikiCat);
          pool.push(...titles);
          await wait(160);
          if (new Set(pool).size >= 100) break;
        } catch (err) {
          console.warn("Kategori okunamadı:", wikiCat, err);
        }
      }
    }

    pool = shuffle([...new Set(pool)]).filter(isPlayableTitle);
    pool = await filterDisambiguations(pool);

    if (pool.length < 2) {
      if (category.mode === "random") {
        pool = await fetchRandomTitles(25);
      } else {
        throw new Error(
          `${category.label} kategorisinde bu tur için yeterli madde bulunamadı. Yeniden dene.`
        );
      }
    }

    const scored = await enrichWithLength(pool);
    let filtered = filterPoolByDifficulty(scored, difficultyId);
    filtered = shuffle(filtered);

    if (filtered.length < 2) {
      filtered = shuffle(scored.map((s) => s.title));
    }

    if (filtered.length < 2) {
      throw new Error("Yeterli madde bulunamadı. Biraz sonra yeniden dene.");
    }

    const minLinks = difficultyId === "hard" ? 3 : difficultyId === "medium" ? 2 : 1;
    if (minLinks > 1) {
      filtered = await preferLinkedTitles(filtered, minLinks);
    }

    const startTitle = filtered[0];
    const targetTitle = filtered.find(
      (t) => normalizeTitle(t) !== normalizeTitle(startTitle)
    );
    if (!targetTitle) {
      throw new Error("Başlangıç ve hedef ayrılamadı.");
    }

    return {
      startTitle,
      targetTitle,
      filteredPool: filtered,
      validationPool: pool,
    };
  }

  /** Tek havuz turunda geçerli start/target + rota arar; bulunamazsa null döner */
  async function pickValidatedStartAndTargetOnce(categoryId, difficultyId) {
    const category = getCategoryById(categoryId);
    const selection = await pickStartAndTarget(categoryId, difficultyId);
    const candidates = shuffle(selection.filteredPool);
    // Start/target kategoriden gelir; ara hop’lar hub’lara açık (rota güvenilirliği)
    const pairs = [
      [selection.startTitle, selection.targetTitle],
      ...candidates.slice(0, 16).map((startTitle, index) => [
        startTitle,
        candidates[(index + 5) % candidates.length],
      ]),
    ];

    for (const [startTitle, targetTitle] of pairs.slice(0, 12)) {
      if (!targetTitle || normalizeTitle(startTitle) === normalizeTitle(targetTitle)) {
        continue;
      }
      const route = await findRouteWithinThree(startTitle, targetTitle, null);
      if (route) return { startTitle, targetTitle, validationRoute: route };
    }

    if (category.mode === "random") {
      const fallbackStarts = shuffle(candidates).slice(0, 16);
      for (const startTitle of fallbackStarts) {
        const links = shuffle(
          (await fetchOutgoingLinks(startTitle, 160)).filter(isPlayableTitle)
        );
        for (const targetTitle of links.slice(0, 8)) {
          if (normalizeTitle(startTitle) === normalizeTitle(targetTitle)) continue;
          const route = await findRouteWithinThree(startTitle, targetTitle, null);
          if (route) return { startTitle, targetTitle, validationRoute: route };
        }
        const direct = links.find(
          (title) => normalizeTitle(title) !== normalizeTitle(startTitle)
        );
        if (direct) {
          return {
            startTitle,
            targetTitle: direct,
            validationRoute: [startTitle, direct],
          };
        }
      }
      return null;
    }

    const candidateMap = new Map(
      selection.validationPool.map((title) => [normalizeTitle(title), title])
    );
    const fallbackStarts = shuffle([
      ...candidates,
      ...selection.validationPool,
    ]).slice(0, 16);

    for (const startTitle of fallbackStarts) {
      const links = await fetchOutgoingLinks(startTitle, 160);
      const reachable = shuffle(links).find(
        (title) =>
          normalizeTitle(title) !== normalizeTitle(startTitle) &&
          candidateMap.has(normalizeTitle(title))
      );
      if (reachable) {
        const targetTitle = candidateMap.get(normalizeTitle(reachable));
        return {
          startTitle,
          targetTitle,
          validationRoute: [startTitle, targetTitle],
        };
      }
    }

    for (const startTitle of candidates.slice(0, 10)) {
      for (const targetTitle of shuffle(candidates).slice(0, 6)) {
        if (normalizeTitle(startTitle) === normalizeTitle(targetTitle)) continue;
        const route = await findRouteWithinThree(startTitle, targetTitle, null);
        if (route) return { startTitle, targetTitle, validationRoute: route };
      }
    }

    return null;
  }

  /** Aynı havuzdan seçilen çiftlerden en fazla üç bağlantıda erişilebileni bulur */
  async function pickValidatedStartAndTarget(categoryId, difficultyId) {
    let lastError = null;
    for (let poolAttempt = 0; poolAttempt < 3; poolAttempt += 1) {
      try {
        const found = await pickValidatedStartAndTargetOnce(categoryId, difficultyId);
        if (found) return found;
      } catch (error) {
        lastError = error;
      }
      if (poolAttempt < 2) await wait(220);
    }

    throw (
      lastError ||
      new Error(
        "Bu kategori içinde üç bağlantıyı aşmayan uygun bir rota bulunamadı. Yeniden dene."
      )
    );
  }

  /* ---------- Kronometre & yükleme ---------- */

  function updateTimerDisplay() {
    const now = state.isRunning ? Date.now() - state.startedAt : state.elapsedMs;
    els.timer.textContent = formatTime(now);
  }

  function startTimer() {
    if (state.isRunning) return;
    state.startedAt = Date.now() - state.elapsedMs;
    state.isRunning = true;
    state.timerId = window.setInterval(updateTimerDisplay, 100);
  }

  function stopTimer() {
    if (!state.isRunning) return;
    state.elapsedMs = Date.now() - state.startedAt;
    state.isRunning = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    updateTimerDisplay();
  }

  function setLoading(isLoading) {
    state.isFetching = isLoading;
    els.loader.hidden = !isLoading;
    els.article.classList.toggle("is-loading", isLoading);
    if (isLoading) {
      els.loaderText.textContent = pickRandom(LOADER_LINES);
    }
  }

  function refreshHud() {
    els.stepCount.textContent = String(state.steps);
    els.targetTitle.textContent = state.targetTitle || "—";
    els.targetTitle.title = state.targetTitle || "";
    els.currentTitle.textContent = state.currentTitle || "—";
    els.startTitle.textContent = state.startTitle || "—";
    els.playerChip.textContent = state.playerName || "Gezgin";
    els.categoryChip.textContent = getCategoryById(state.categoryId).label;
    if (els.difficultyChip) {
      els.difficultyChip.textContent = getDifficultyById(state.difficultyId).label;
    }
    els.gameModeBadge.hidden = state.gameMode === "normal";
    els.gameModeBadge.classList.toggle("is-weekly", state.gameMode === "weekly");
    els.gameModeBadge.classList.toggle("is-duel", state.gameMode === "duel");
    els.gameModeBadge.textContent =
      state.gameMode === "daily"
        ? "Günlük yarış"
        : state.gameMode === "weekly"
          ? "Haftalık lig"
          : state.gameMode === "duel"
            ? "Arkadaş düellosu"
            : "Meydan okuma";
    renderRouteHistory(els.routeHistoryList, state.routeHistory);
  }

  /** Rota dizisini güvenli DOM düğümleriyle kırıntı yolu olarak çizer */
  function renderRouteHistory(container, route) {
    container.innerHTML = "";
    route.forEach((title, index) => {
      const item = document.createElement("li");
      item.textContent = title;
      item.title = `${index + 1}. durak: ${title}`;
      if (index === route.length - 1) item.classList.add("is-current");
      container.appendChild(item);
    });
    container.scrollLeft = container.scrollWidth;
  }

  /* ---------- Hile koruması ---------- */

  function hasBlockedPrefix(title) {
    const decoded = decodeURIComponent(title.replace(/_/g, " "));
    return isBlockedTitle(decoded);
  }

  function unwrapOrRemove(anchor) {
    const parent = anchor.parentNode;
    if (!parent) return;
    while (anchor.firstChild) {
      parent.insertBefore(anchor.firstChild, anchor);
    }
    parent.removeChild(anchor);
  }

  /** Ham HTML'i oyun için temizler; yalnızca geçerli wiki linkleri kalır */
  function sanitizeArticleHtml(rawHtml) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = rawHtml;
    const root = wrapper.querySelector(".mw-parser-output") || wrapper;

    root
      .querySelectorAll(
        ".redirectMsg, .redirectText, .hatnote, .dablink, .ambox, .tmbox, .ombox, .sistersitebox"
      )
      .forEach((n) => n.remove());

    root
      .querySelectorAll(
        "sup.reference, .mw-references-wrap, .reflist, .references, ol.references, .mw-editsection, .reference"
      )
      .forEach((n) => n.remove());

    root
      .querySelectorAll(
        "figure, .thumb, .gallery, .gallerybox, a.image, a.mw-file-description, .mw-file-element, img"
      )
      .forEach((n) => n.remove());

    root
      .querySelectorAll(".navbox, .vertical-navbox, .navbox-styles, .metadata, .noprint, .portal")
      .forEach((n) => n.remove());

    root.querySelectorAll("a").forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";

      if (/cite_(note|ref)/i.test(href) || anchor.closest("sup")) {
        unwrapOrRemove(anchor);
        return;
      }

      if (
        anchor.classList.contains("new") ||
        /action=edit/i.test(href) ||
        /redlink=1/i.test(href)
      ) {
        unwrapOrRemove(anchor);
        return;
      }

      const isExternalClass =
        anchor.classList.contains("external") || anchor.classList.contains("extiw");
      const isForeignHttp =
        /^https?:\/\//i.test(href) && !/tr\.wikipedia\.org\/wiki\//i.test(href);
      if (isExternalClass || isForeignHttp) {
        unwrapOrRemove(anchor);
        return;
      }

      const wikiMatch = href.match(
        /^(?:https?:\/\/tr\.wikipedia\.org)?\/wiki\/([^#?]+)/i
      );
      if (!wikiMatch) {
        unwrapOrRemove(anchor);
        return;
      }

      let pageName = wikiMatch[1];
      try {
        pageName = decodeURIComponent(pageName);
      } catch {
        /* ignore */
      }

      if (hasBlockedPrefix(pageName)) {
        unwrapOrRemove(anchor);
        return;
      }

      const readableTitle = pageName.replace(/_/g, " ");
      anchor.className = "wiki-link";
      anchor.setAttribute("href", `#/wiki/${encodeURIComponent(readableTitle)}`);
      anchor.setAttribute("data-title", readableTitle);
      anchor.removeAttribute("title");
      anchor.removeAttribute("rel");
    });

    root.querySelectorAll("span.mw-reflink-text").forEach((n) => n.remove());
    return root.innerHTML;
  }

  /* ---------- Oyun akışı ---------- */

  function showLobby() {
    stopTimer();
    state.isCountingDown = false;
    els.winModal.hidden = true;
    els.countdown.hidden = true;
    els.countdown.classList.remove("is-exit");
    els.howToPage.hidden = true;
    els.feedbackPage.hidden = true;
    els.privacyPage.hidden = true;
    els.gameShell.hidden = true;
    els.lobby.hidden = false;
    renderRecords();
    renderDailyChallenge();
    renderWeeklyChallenge();
    renderSharedChallenge();
    renderDuelLobby();
    renderProfile();
    if (state.supabaseReady) fetchOnlineRecords();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Vikipedi temalı ayrıntılı yardım sayfasını açar */
  function showHowTo() {
    els.lobby.hidden = true;
    els.gameShell.hidden = true;
    els.feedbackPage.hidden = true;
    els.privacyPage.hidden = true;
    els.howToPage.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** İstek ve düzenleme formunun bulunduğu iletişim sayfasını açar */
  function showFeedbackPage() {
    els.lobby.hidden = true;
    els.gameShell.hidden = true;
    els.howToPage.hidden = true;
    els.privacyPage.hidden = true;
    els.feedbackPage.hidden = false;

    if (!els.feedbackName.value && state.playerName) {
      els.feedbackName.value = state.playerName;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Gizlilik ve KVKK bilgilendirme sayfasını açar */
  function showPrivacyPage() {
    els.lobby.hidden = true;
    els.gameShell.hidden = true;
    els.howToPage.hidden = true;
    els.feedbackPage.hidden = true;
    els.privacyPage.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Form içeriğini kullanıcının e-posta uygulamasında hazır taslağa dönüştürür */
  function openFeedbackEmail() {
    const subject = `[VikiRota - ${els.feedbackType.value}] ${els.feedbackSubject.value.trim()}`;
    const body = [
      "Merhaba,",
      "",
      `İleti türü: ${els.feedbackType.value}`,
      `Gönderen: ${els.feedbackName.value.trim()}`,
      `İletişim e-postası: ${els.feedbackEmail.value.trim()}`,
      "",
      "Açıklama:",
      els.feedbackMessage.value.trim(),
      "",
      "VikiRota geri bildirim formundan gönderildi.",
    ].join("\n");

    const mailto =
      `mailto:alperkemalakdeniz@gmail.com` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  }

  /** Devam eden yarışı onay alarak sonlandırıp ana lobiye döner */
  function finishRace() {
    if (state.isRunning || state.steps > 0) {
      const leave = window.confirm(
        "Yarışma sonlandırılacak ve bu tur rekorlara yazılmayacak. Ana lobiye dönülsün mü?"
      );
      if (!leave) return;
    }
    if (state.gameMode === "duel" && state.duelRoom) {
      if (["waiting", "ready"].includes(state.duelRoom.status)) {
        leaveDuelRoom();
      } else {
        stopDuelWatchers();
        state.duelRoom = null;
        state.duelRole = "";
        state.duelRaceLaunched = false;
        clearDuelInviteUrl();
      }
    }
    showLobby();
  }

  function showGame() {
    els.lobby.hidden = true;
    els.howToPage.hidden = true;
    els.feedbackPage.hidden = true;
    els.privacyPage.hidden = true;
    els.gameShell.hidden = false;
  }

  /**
   * Efsane geri sayım sahnesi:
   * kelimeden kelimeye gösterimi + 3 → 2 → 1 → BAŞLA
   */
  async function runCountdown(fromTitle, toTitle) {
    state.isCountingDown = true;
    els.countdown.classList.remove("is-exit");
    els.countdownEyebrow.textContent = pickRandom(COUNTDOWN_EYEBROWS);
    els.countdownFrom.textContent = fromTitle;
    els.countdownTo.textContent = toTitle;
    els.countdown.hidden = false;

    const beats = [
      { value: "3", hintKey: 3, go: false },
      { value: "2", hintKey: 2, go: false },
      { value: "1", hintKey: 1, go: false },
      { value: pickRandom(COUNTDOWN_HINTS.go), hintKey: "go", go: true },
    ];

    for (const beat of beats) {
      // Animasyonu yeniden tetikle
      els.countdownNumber.classList.remove("is-go");
      els.countdownNumber.style.animation = "none";
      void els.countdownNumber.offsetWidth;
      els.countdownNumber.style.animation = "";

      els.countdownNumber.textContent = beat.value;
      els.countdownNumber.classList.toggle("is-go", beat.go);
      playSound("countdown", { go: beat.go });
      els.countdownHint.textContent =
        beat.hintKey === "go"
          ? "Zaman başladı — ilk bağlantıyı seç!"
          : pickRandom(COUNTDOWN_HINTS[beat.hintKey]);

      await wait(beat.go ? 900 : 1000);
    }

    els.countdown.classList.add("is-exit");
    await wait(380);
    els.countdown.hidden = true;
    els.countdown.classList.remove("is-exit");
    state.isCountingDown = false;
  }

  /**
   * Makaleyi yükler, temizler ve ekrana basar.
   * @param {string} pageTitle
   * @param {boolean} countsAsStep
   * @param {{ autoStartTimer?: boolean }} options
   */
  async function loadArticle(pageTitle, countsAsStep = false, options = {}) {
    const { autoStartTimer = true } = options;
    if (state.isFetching || state.isWon || state.isCountingDown) return;

    const sourceTitle = state.currentTitle;
    setLoading(true);

    try {
      const { title, html } = await fetchArticleHtml(pageTitle);
      const cleanHtml = sanitizeArticleHtml(html);

      state.currentTitle = title;
      const lastRouteTitle = state.routeHistory[state.routeHistory.length - 1];
      if (normalizeTitle(lastRouteTitle) !== normalizeTitle(title)) {
        state.routeHistory.push(title);
      }
      if (countsAsStep && sourceTitle) {
        state.routeProof.push({
          from: sourceTitle,
          linkTitle: pageTitle,
          to: title,
        });
      }
      els.articleTitle.textContent = title;
      els.articleBody.innerHTML = cleanHtml;
      els.hintMessage.hidden = true;

      els.article.style.animation = "none";
      void els.article.offsetWidth;
      els.article.style.animation = "";

      if (countsAsStep) state.steps += 1;

      refreshHud();
      window.scrollTo({ top: 0, behavior: "smooth" });

      if (normalizeTitle(title) === normalizeTitle(state.targetTitle)) {
        handleVictory();
      } else if (autoStartTimer && !state.isRunning && !state.isWon) {
        startTimer();
      }
    } catch (error) {
      console.error(error);
      els.articleTitle.textContent = "Sayfa açılamadı";
      els.articleBody.innerHTML = `
        <p>Bu maddeye ulaşılamadı. Bağlantı kırık olabilir veya ağ yanıt vermiyor.</p>
        <p style="color: var(--muted)">${escapeHtml(error.message)}</p>
        <p><button type="button" class="btn btn--ghost" id="article-retry-btn">Yeniden dene</button></p>
      `;
      state.currentTitle = sourceTitle || "Hata";
      refreshHud();
      const retryBtn = document.getElementById("article-retry-btn");
      if (retryBtn) {
        retryBtn.addEventListener(
          "click",
          () => {
            loadArticle(pageTitle, countsAsStep, options);
          },
          { once: true }
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleVictory() {
    state.isWon = true;
    playSound("victory");
    els.hintBtn.disabled = true;
    stopTimer();

    const category = getCategoryById(state.categoryId);
    const difficulty = getDifficultyById(state.difficultyId);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerName: state.playerName,
      categoryId: category.id,
      categoryLabel: category.label,
      difficultyId: difficulty.id,
      difficultyLabel: difficulty.label,
      gameMode: state.gameMode,
      dailyKey: state.dailyKey || null,
      weeklyKey: state.weeklyKey || null,
      startTitle: state.startTitle,
      targetTitle: state.targetTitle,
      routeHistory: [...state.routeHistory],
      routeProof: state.routeProof.map((edge) => ({ ...edge })),
      onlineSessionId: state.onlineSessionId,
      timeMs: state.elapsedMs,
      steps: state.steps,
      date: new Date().toISOString(),
    };

    const isDuel = state.gameMode === "duel";
    const isNewBest = isDuel ? false : addRecord(entry);
    const newAchievementIds = completeProfileRound(entry);
    if (state.gameMode === "daily" && state.dailyKey) {
      markDailyCompletion(entry);
      renderDailyChallenge();
    }
    if (state.gameMode === "weekly" && state.weeklyKey) {
      markWeeklyCompletion(entry);
      renderWeeklyChallenge();
    }
    if (!isDuel) {
      renderRecords();
      submitOnlineRecord(entry).then((synced) => {
        if (synced) fetchOnlineRecords();
      });
    } else {
      submitDuelFinish(entry).then(() => renderDuelResultPanel());
    }

    els.winEyebrow.textContent = isDuel
      ? "Arkadaş düellosu"
      : pickRandom(WIN_EYEBROWS);
    els.winHeading.textContent = isDuel ? "Rotayı bitirdin!" : pickRandom(WIN_HEADINGS);
    els.winMessage.textContent = isDuel
      ? "Skorun kaydedildi. Rakibin sonucu gelince karşılaştırma güncellenir."
      : pickRandom(WIN_MESSAGES);
    els.finalTime.textContent = formatTime(state.elapsedMs);
    els.finalSteps.textContent = String(state.steps);
    renderRouteHistory(els.finalRouteList, state.routeHistory);
    els.winBadge.hidden = !isNewBest;
    els.dailyCompleteBadge.hidden = state.gameMode !== "daily";
    els.weeklyCompleteBadge.hidden = state.gameMode !== "weekly";
    if (els.duelCompleteBadge) els.duelCompleteBadge.hidden = true;
    renderDuelResultPanel();
    els.replayBtn.textContent = isDuel ? "Yeni düello kur" : "Aynı ayarla yeniden";
    els.newAchievements.hidden = newAchievementIds.length === 0;
    els.newAchievements.innerHTML = newAchievementIds.length
      ? `<strong>Yeni başarım!</strong>${newAchievementIds
          .map((id) => {
            const achievement = ACHIEVEMENTS.find((item) => item.id === id);
            if (!achievement) return "";
            const badgeSrc = getAchievementBadgeSrc(achievement.level);
            return `<span class="new-achievement">
              <img class="new-achievement__badge" src="${badgeSrc}" alt="${achievement.title} rozeti" />
              <span>Level ${achievement.level} · ${achievement.title}</span>
            </span>`;
          })
          .join("")}`
      : "";
    els.winModal.hidden = false;
    els.replayBtn.focus();
  }

  /** Yeni tur: normal veya günlük çift → geri sayım → oyun */
  async function beginRound(options = {}) {
    if (!state.isRegistered) return;
    const requestedMode = options.mode || state.gameMode || "normal";
    state.lastBeginMode = requestedMode;

    if (els.pairRetryBtn) els.pairRetryBtn.hidden = true;
    els.pairStatus.hidden = false;
    els.pairStatus.textContent =
      requestedMode === "daily"
        ? "Günün ortak rotası hazırlanıyor…"
        : requestedMode === "weekly"
          ? "Haftalık lig rotası hazırlanıyor…"
          : requestedMode === "duel"
            ? "Düello rotası hazırlanıyor…"
            : "Rota ve zorluk ayarlanıyor…";
    els.startBtn.disabled = true;
    els.dailyStartBtn.disabled = true;
    els.weeklyStartBtn.disabled = true;
    if (els.duelCreateBtn) els.duelCreateBtn.disabled = true;

    stopTimer();
    state.gameMode = requestedMode;
    state.dailyKey = "";
    state.dailyChallenge = null;
    state.weeklyKey = "";
    state.weeklyChallenge = null;
    state.steps = 0;
    state.elapsedMs = 0;
    state.startedAt = 0;
    state.isWon = false;
    state.isCountingDown = false;
    state.isHinting = false;
    state.roundProfileCounted = false;
    state.currentTitle = "";
    state.startTitle = "";
    state.targetTitle = "";
    state.routeHistory = [];
    state.routeProof = [];
    state.validatedRoute = [];
    state.onlineSessionId = "";
    els.winModal.hidden = true;
    els.countdown.hidden = true;
    els.hintMessage.hidden = true;
    els.hintBtn.disabled = true;
    updateTimerDisplay();

    try {
      let startTitle;
      let targetTitle;

      if (state.gameMode === "daily") {
        const challenge = getDailyChallenge();
        if (!challenge) throw new Error("Günlük yarış kataloğu yüklenemedi.");
        state.dailyChallenge = challenge;
        state.dailyKey = challenge.key;
        state.categoryId = challenge.categoryId;
        state.difficultyId = challenge.difficultyId;
        startTitle = challenge.startTitle;
        targetTitle = challenge.targetTitle;
        els.pairStatus.textContent = "Günlük rota doğrulanıyor…";
        const dailyRoute = await findRouteWithinThree(startTitle, targetTitle);
        if (!dailyRoute) {
          throw new Error(
            "Bugünün rotası şu anda doğrulanamadı. Ağ bağlantını kontrol edip yeniden dene."
          );
        }
        state.validatedRoute = dailyRoute;
      } else if (state.gameMode === "weekly") {
        const challenge = getWeeklyChallenge();
        if (!challenge) throw new Error("Haftalık lig kataloğu yüklenemedi.");
        state.weeklyChallenge = challenge;
        state.weeklyKey = challenge.key;
        state.categoryId = challenge.categoryId;
        state.difficultyId = challenge.difficultyId;
        startTitle = challenge.startTitle;
        targetTitle = challenge.targetTitle;
        els.pairStatus.textContent = "Haftalık lig rotası doğrulanıyor…";
        const weeklyRoute = await findRouteWithinThree(startTitle, targetTitle);
        if (!weeklyRoute) {
          throw new Error(
            "Bu haftanın rotası şu anda doğrulanamadı. Ağ bağlantını kontrol edip yeniden dene."
          );
        }
        state.validatedRoute = weeklyRoute;
      } else if (state.gameMode === "shared") {
        const challenge = state.sharedChallenge;
        if (!challenge) throw new Error("Paylaşılan meydan okuma bulunamadı.");
        state.categoryId = challenge.categoryId;
        state.difficultyId = challenge.difficultyId;
        startTitle = challenge.startTitle;
        targetTitle = challenge.targetTitle;
        els.pairStatus.textContent = "Paylaşılan rota doğrulanıyor…";
        const sharedRoute = await findRouteWithinThree(startTitle, targetTitle);
        if (!sharedRoute) {
          throw new Error("Paylaşılan rota şu anda doğrulanamadı.");
        }
        state.validatedRoute = sharedRoute;
      } else if (state.gameMode === "duel") {
        const room = state.duelRoom;
        if (!room || room.status !== "racing") {
          throw new Error("Düello odası yarışa hazır değil.");
        }
        state.categoryId = room.categoryId;
        state.difficultyId = room.difficultyId;
        startTitle = room.startTitle;
        targetTitle = room.targetTitle;
        els.pairStatus.textContent = "Düello rotası doğrulanıyor…";
        const duelRoute = await findRouteWithinThree(startTitle, targetTitle);
        if (!duelRoute) {
          throw new Error("Düello rotası şu anda doğrulanamadı.");
        }
        state.validatedRoute = duelRoute;
      } else {
        els.pairStatus.textContent = "Rota uygunluğu doğrulanıyor…";
        const selection = await pickValidatedStartAndTarget(
          state.categoryId,
          state.difficultyId
        );
        startTitle = selection.startTitle;
        targetTitle = selection.targetTitle;
        state.validatedRoute = selection.validationRoute;
      }

      state.startTitle = startTitle;
      state.targetTitle = targetTitle;
      markProfileGameStarted();

      showGame();
      refreshHud();
      els.pairStatus.hidden = true;
      if (els.pairRetryBtn) els.pairRetryBtn.hidden = true;

      // Makaleyi yükle ama kronometreyi henüz başlatma
      await loadArticle(startTitle, false, { autoStartTimer: false });

      // Efsane sahne: kelimeden kelimeye + 3-2-1
      await runCountdown(startTitle, targetTitle);

      if (!state.isWon) {
        if (state.gameMode !== "duel") {
          await startVerifiedOnlineSession();
        }
        startTimer();
        els.hintBtn.disabled = false;
      }
    } catch (error) {
      console.error(error);
      if (requestedMode === "duel") state.duelRaceLaunched = false;
      els.pairStatus.hidden = false;
      els.pairStatus.textContent = error.message || "Madde seçilemedi.";
      if (els.pairRetryBtn && requestedMode !== "duel") {
        els.pairRetryBtn.hidden = false;
      }
      showLobby();
    } finally {
      updateStartButtonState();
    }
  }

  function onArticleClick(event) {
    if (state.isCountingDown) {
      event.preventDefault();
      return;
    }

    const link = event.target.closest("a.wiki-link");
    if (!link || !els.articleBody.contains(link)) return;
    event.preventDefault();

    const nextTitle = link.getAttribute("data-title");
    if (!nextTitle) return;
    if (normalizeTitle(nextTitle) === normalizeTitle(state.currentTitle)) return;

    playSound("click");
    loadArticle(nextTitle, true);
  }

  function registerPlayer(name) {
    const cleaned = name.replace(/\s+/g, " ").trim();
    if (cleaned.length < 2) {
      els.playerName.focus();
      return false;
    }
    localStorage.setItem(STORAGE_PLAYER, cleaned);
    setRegisteredUI(cleaned);
    return true;
  }

  /* ---------- Başlatma ---------- */

  function init() {
    initializePwa();
    spawnFloatWords();
    renderDifficulties();
    renderCategories();
    renderSoundControls();
    applyTheme(state.theme);
    state.sharedChallenge = readSharedChallenge();
    renderSharedChallenge();
    state.duelCategoryId = state.categoryId || "all";
    state.duelDifficultyId = state.difficultyId || "easy";
    populateDuelSettingSelects();
    renderDuelLobby();
    populateLeaderboardFilters();
    renderRecords();
    renderDailyChallenge();
    renderWeeklyChallenge();
    updateStartButtonState();

    const savedName = localStorage.getItem(STORAGE_PLAYER);
    if (savedName && savedName.trim().length >= 2) {
      setRegisteredUI(savedName.trim());
    }

    els.registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      registerPlayer(els.playerName.value);
    });

    els.changePlayerBtn.addEventListener("click", () => {
      setUnregisterUI();
      els.playerName.focus();
    });

    els.startBtn.addEventListener("click", () => beginRound({ mode: "normal" }));
    els.dailyStartBtn.addEventListener("click", () => beginRound({ mode: "daily" }));
    els.weeklyStartBtn.addEventListener("click", () => beginRound({ mode: "weekly" }));
    if (els.pairRetryBtn) {
      els.pairRetryBtn.addEventListener("click", () => {
        beginRound({ mode: state.lastBeginMode || "normal" });
      });
    }
    els.sharedStartBtn.addEventListener("click", () =>
      beginRound({ mode: "shared" })
    );
    els.duelCreateBtn.addEventListener("click", createDuelRoom);
    if (els.duelApplySettingsBtn) {
      els.duelApplySettingsBtn.addEventListener("click", updateDuelRoomSettings);
    }
    if (els.duelCategorySelect) {
      els.duelCategorySelect.addEventListener("change", () => {
        state.duelCategoryId = els.duelCategorySelect.value;
        renderDuelLobby();
      });
    }
    if (els.duelDifficultySelect) {
      els.duelDifficultySelect.addEventListener("change", () => {
        state.duelDifficultyId = els.duelDifficultySelect.value;
        renderDuelLobby();
      });
    }
    els.duelShareBtn.addEventListener("click", shareDuelLink);
    els.duelReadyBtn.addEventListener("click", markDuelReady);
    els.duelCancelBtn.addEventListener("click", leaveDuelRoom);
    els.howToLink.addEventListener("click", showHowTo);
    els.howToBackBtn.addEventListener("click", showLobby);
    els.howToLobbyBtn.addEventListener("click", showLobby);
    els.feedbackLink.addEventListener("click", showFeedbackPage);
    els.feedbackBackBtn.addEventListener("click", showLobby);
    els.feedbackLobbyBtn.addEventListener("click", showLobby);
    els.privacyLink.addEventListener("click", showPrivacyPage);
    els.privacyBackBtn.addEventListener("click", showLobby);
    els.privacyLobbyBtn.addEventListener("click", showLobby);
    els.feedbackForm.addEventListener("submit", (event) => {
      event.preventDefault();
      openFeedbackEmail();
    });
    els.replayBtn.addEventListener("click", () => {
      if (state.gameMode === "duel") {
        leaveDuelRoom();
        showLobby();
        return;
      }
      beginRound({ mode: state.gameMode });
    });
    els.lobbyFromWinBtn.addEventListener("click", () => {
      if (state.gameMode === "duel") {
        leaveDuelRoom();
      }
      showLobby();
    });
    els.backLobbyBtn.addEventListener("click", finishRace);
    els.finishRaceBtn.addEventListener("click", finishRace);
    els.hintBtn.addEventListener("click", requestHint);
    els.shareChallengeBtn.addEventListener("click", shareCurrentChallenge);
    els.soundToggle.addEventListener("click", toggleSound);
    if (els.themeToggle) els.themeToggle.addEventListener("click", toggleTheme);
    els.gameSoundToggle.addEventListener("click", toggleSound);
    els.installAppBtn.addEventListener("click", installPwa);
    els.leaderboardOnlineTab.addEventListener("click", () =>
      switchLeaderboard("online")
    );
    els.leaderboardLocalTab.addEventListener("click", () =>
      switchLeaderboard("local")
    );
    els.leaderboardCategoryFilter.addEventListener("change", () =>
      renderRecords()
    );
    els.leaderboardDifficultyFilter.addEventListener("change", () =>
      renderRecords()
    );
    els.leaderboardModeFilter.addEventListener("change", () => renderRecords());

    els.clearRecordsBtn.addEventListener("click", () => {
      const ok = window.confirm("Bu cihazdaki tüm rekorlar silinsin mi?");
      if (!ok) return;
      localStorage.removeItem(STORAGE_RECORDS);
      renderRecords();
    });

    els.articleBody.addEventListener("click", onArticleClick);

    // Oyun doğrudan başlamaz — lobi bekler
    showLobby();
    initializeSupabase();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
