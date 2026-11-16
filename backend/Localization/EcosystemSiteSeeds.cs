using KeshavSingh.Localization.Models;
using KeshavSingh.Localization.Seeding;

namespace Admin.Api.Localization;

/// <summary>
/// Bilingual (English + Hindi) localization seeds for the entire keshavsingh.in product family:
/// Ecosystem shared chrome, Portfolio showcase/video explorer, Pratiyogita (+ Live Quiz &amp; Hall of Winners),
/// Hindu Panchang, Social Analytics (+ Growth Benchmarking), and AnimStudio AI (+ Comedy &amp; Songs UI).
/// Additive only: Admin edits in MongoDB are never overwritten on restart.
/// </summary>
public sealed class EcosystemSiteSeeds : ILocalizationSeedSource
{
    private const string En = "en";
    private const string Hi = "hi";

    public IEnumerable<TranslationSeed> Translations() => SeedBuilder.Bilingual(En, Hi, new[]
    {
        // ---- Ecosystem Shared Navigation & Language Switcher ----
        ("ecosystem", "language.label", "Language", "भाषा"),
        ("ecosystem", "language.en", "English", "English"),
        ("ecosystem", "language.hi", "हिन्दी", "हिन्दी"),
        ("ecosystem", "language.switch", "Switch Language", "भाषा बदलें"),
        ("ecosystem", "language.adminManaged", "Controlled via Admin & Site Settings", "एडमिन और साइट सेटिंग्स से नियंत्रित"),
        ("ecosystem", "nav.ecosystem", "Keshav Ecosystem", "केशव इकोसिस्टम"),
        ("ecosystem", "nav.channels", "Channels", "चैनल"),
        ("ecosystem", "nav.videos", "Video Library", "वीडियो लाइब्रेरी"),
        ("ecosystem", "actions.search", "Search", "खोजें"),
        ("ecosystem", "actions.reset", "Reset", "रीसेट"),
        ("ecosystem", "actions.save", "Save", "सहेजें"),
        ("ecosystem", "actions.cancel", "Cancel", "रद्द करें"),
        ("ecosystem", "actions.watch", "Watch Video", "वीडियो देखें"),
        ("ecosystem", "actions.loading", "Loading…", "लोड हो रहा है…"),

        // ---- Portfolio (keshavsingh.in): sections, showcase & video library ----
        ("portfolio", "nav.ecosystem", "Ecosystem", "इकोसिस्टम"),
        ("portfolio", "nav.videos", "Videos", "वीडियो"),
        ("portfolio", "section.about.title", "About Me", "मेरे बारे में"),
        ("portfolio", "section.experience.title", "Work Experience", "कार्य अनुभव"),
        ("portfolio", "section.projects.title", "Featured Projects", "प्रमुख परियोजनाएँ"),
        ("portfolio", "section.skills.title", "Technical Skills", "तकनीकी कौशल"),
        ("portfolio", "section.education.title", "Education", "शिक्षा"),
        ("portfolio", "section.certifications.title", "Certifications", "प्रमाणपत्र"),
        ("portfolio", "ecosystem.title", "Keshav Ecosystem & Products", "केशव इकोसिस्टम और उत्पाद"),
        ("portfolio", "ecosystem.subtitle",
            "Live websites, creator channels, community quizzes, Vedic Panchang, and AI animation studio powered from one unified platform.",
            "लाइव वेबसाइटें, क्रिएटर चैनल, सामुदायिक क्विज़, वैदिक पंचांग और एआई एनीमेशन स्टूडियो — एक ही एकीकृत प्लेटफॉर्म पर।"),
        ("portfolio", "videos.title", "Search Ecosystem Videos", "इकोसिस्टम वीडियो खोजें"),
        ("portfolio", "videos.subtitle",
            "Explore every video across our YouTube channels by topic, language, category, or duration.",
            "विषय, भाषा, श्रेणी या अवधि के अनुसार हमारे यूट्यूब चैनलों के सभी वीडियो खोजें।"),
        ("portfolio", "videos.searchPlaceholder", "Search videos, stories, comedy shorts, panchang…", "वीडियो, कथा, कॉमेडी शॉर्ट्स, पंचांग खोजें…"),
        ("portfolio", "videos.allChannels", "All Channels", "सभी चैनल"),
        ("portfolio", "videos.allLanguages", "All Languages", "सभी भाषाएँ"),
        ("portfolio", "videos.allTypes", "Shorts & Full Videos", "शॉर्ट्स और पूरे वीडियो"),
        ("portfolio", "videos.shortsOnly", "Shorts Only", "केवल शॉर्ट्स"),
        ("portfolio", "videos.videosOnly", "Full Videos Only", "केवल पूरे वीडियो"),
        ("portfolio", "videos.empty", "No matching videos found right now.", "अभी कोई मिलता-जुलता वीडियो नहीं मिला।"),
        ("portfolio", "videos.winnersCta", "View Live Quiz Winners on Pratiyogita →", "प्रतियोगिता पर लाइव क्विज़ विजेता देखें →"),

        // ---- Pratiyogita (Sports, Competitions, Live Quiz Claim & Hall of Winners) ----
        ("pratiyogita", "nav.home", "Home", "होम"),
        ("pratiyogita", "nav.competitions", "Competitions", "प्रतियोगिताएँ"),
        ("pratiyogita", "nav.leaderboard", "Leaderboard", "लीडरबोर्ड"),
        ("pratiyogita", "nav.winners", "Quiz Winners", "क्विज़ विजेता"),
        ("pratiyogita", "nav.news", "News & Events", "समाचार और कार्यक्रम"),
        ("pratiyogita", "nav.contribute", "Contribute", "योगदान दें"),
        ("pratiyogita", "nav.registerSchool", "Register School", "स्कूल पंजीकरण"),
        ("pratiyogita", "nav.settings", "Settings", "सेटिंग्स"),
        ("pratiyogita", "home.heroTag", "Verified Grassroots Sports & Live Quiz Arena", "सत्यापित जमीनी खेल और लाइव क्विज़ मंच"),
        ("pratiyogita", "home.heroTitle", "Celebrate Local Champions & Live Quiz Winners", "स्थानीय चैंपियनों और लाइव क्विज़ विजेताओं का सम्मान"),
        ("pratiyogita", "home.exploreCompetitions", "Explore Competitions", "प्रतियोगिताएँ देखें"),
        ("pratiyogita", "home.viewLeaderboard", "View Leaderboard", "लीडरबोर्ड देखें"),
        ("pratiyogita", "home.viewWinners", "Hall of Winners", "विजेता सूची"),
        ("pratiyogita", "winners.title", "Hall of Winners — Live Stream Quiz", "विजेता सूची — लाइव स्ट्रीम क्विज़"),
        ("pratiyogita", "winners.subtitle",
            "Verified viewers who answered live stream questions correctly and won via random selection.",
            "वे सत्यापित दर्शक जिन्होंने लाइव स्ट्रीम प्रश्नों का सही उत्तर दिया और रैंडम चयन से विजेता बने।"),
        ("pratiyogita", "winners.privacyNote",
            "Channel Verification Privacy: YouTube Sign-In reads your public channel name only in memory and NEVER logs or stores OAuth tokens or private data.",
            "चैनल सत्यापन गोपनीयता: यूट्यूब साइन-इन केवल आपका सार्वजनिक चैनल नाम पढ़ता है और कभी भी ओऑथ टोकन या निजी डेटा लॉग या सेव नहीं करता।"),
        ("pratiyogita", "winners.activeQuiz", "Live Stream Quiz Active", "लाइव स्ट्रीम क्विज़ सक्रिय है"),
        ("pratiyogita", "winners.signInYouTube", "Verify with YouTube Channel (Zero-Log)", "यूट्यूब चैनल से सत्यापित करें (जीरो-लॉग)"),
        ("pratiyogita", "winners.submitAnswer", "Submit Answer", "उत्तर सबमिट करें"),
        ("pratiyogita", "winners.historyTitle", "Past Winners Timeline", "पिछले विजेताओं का इतिहास"),
        ("pratiyogita", "settings.localizationTitle", "Website Language Settings", "वेबसाइट भाषा सेटिंग्स"),

        // ---- Hindu Panchang ----
        ("panchang", "nav.home", "Panchang", "पंचांग"),
        ("panchang", "nav.aarti", "Aarti & Chalisa", "आरती और चालीसा"),
        ("panchang", "nav.vrat", "Vrat & Festivals", "व्रत एवं त्यौहार"),
        ("panchang", "nav.videoHub", "3D Katha Hub", "३डी कथा हब"),
        ("panchang", "nav.itihaas", "Aaj Ka Itihaas", "आज का इतिहास"),
        ("panchang", "hero.title", "Daily Vedic Panchang & Shubh Muhurat", "दैनिक वैदिक पंचांग एवं शुभ मुहूर्त"),
        ("panchang", "hero.subtitle", "Live sunrise-accurate Tithi, Nakshatra, Rahu Kaal, Choghadiya and devotional 3D Kathas.", "सूर्योदय आधारित सटीक तिथि, नक्षत्र, राहुकाल, चौघड़िया एवं भक्तिमय ३डी कथाएँ।"),
        ("panchang", "card.tithi", "Tithi", "तिथि"),
        ("panchang", "card.nakshatra", "Nakshatra", "नक्षत्र"),
        ("panchang", "card.yoga", "Yoga", "योग"),
        ("panchang", "card.karana", "Karana", "करण"),
        ("panchang", "card.rahuKaal", "Rahu Kaal", "राहुकाल"),
        ("panchang", "card.abhijit", "Abhijit Muhurat", "अभिजीत मुहूर्त"),
        ("panchang", "card.sunrise", "Sunrise", "सूर्योदय"),
        ("panchang", "card.sunset", "Sunset", "सूर्यास्त"),
        ("panchang", "videoHub.title", "Devotional 3D Videos & Panchang Shorts", "भक्तिमय ३डी वीडियो और पंचांग शॉर्ट्स"),
        ("panchang", "videoHub.empty", "No published videos match this filter yet.", "इस फ़िल्टर से मेल खाने वाला कोई प्रकाशित वीडियो नहीं मिला।"),
        ("panchang", "footer.tagline", "Sanatan Panchang, Shubh Muhurat & Spiritual 3D Katha", "सनातन पंचांग, शुभ मुहूर्त एवं आध्यात्मिक ३डी कथा"),

        // ---- Social Analytics ----
        ("social", "nav.dashboard", "Overview", "अवलोकन"),
        ("social", "nav.channels", "My Channels", "मेरे चैनल"),
        ("social", "nav.outliers", "Growth Benchmarks", "ग्रोथ बेंचमार्क"),
        ("social", "nav.schedule", "Publish Schedule", "प्रकाशन समय-सारणी"),
        ("social", "nav.funnel", "Traffic & RPM", "ट्रैफ़िक और आय"),
        ("social", "nav.settings", "Settings", "सेटिंग्स"),
        ("social", "dashboard.title", "Creator Intelligence & Funnel Command", "क्रिएटर एनालिटिक्स और फ़नल कमान"),
        ("social", "outliers.title", "High-Growth Channel & Outlier Video Benchmarks", "तेज़ी से बढ़ने वाले चैनल और आउटलायर वीडियो विश्लेषण"),
        ("social", "outliers.subtitle",
            "Find high Views-per-Subscriber hooks, repeatable 10s-60s comedy pacing, and breakout retention patterns.",
            "उच्च व्यूज़-प्रति-सब्सक्राइबर हुक, १०-६० सेकंड की कॉमेडी गति और वायरल पैटर्न खोजें।"),
        ("social", "outliers.viewsPerSub", "Views / Sub Ratio", "व्यूज़ / सब्सक्राइबर अनुपात"),

        // ---- AnimStudio AI ----
        ("studio", "nav.projects", "Projects", "प्रोजेक्ट्स"),
        ("studio", "nav.storyAgent", "3D Story Agent", "३डी स्टोरी एजेंट"),
        ("studio", "nav.comedy", "KESHAV-ANIM-FF Comedy", "KESHAV-ANIM-FF कॉमेडी"),
        ("studio", "nav.songs", "Songs Studio", "संगीत स्टूडियो"),
        ("studio", "nav.automation", "Auto Post", "ऑटो पोस्ट"),
        ("studio", "nav.liveStream", "Go Live & Quiz", "गो लाइव और क्विज़"),
        ("studio", "nav.publishing", "Publishing", "प्रकाशन"),
        ("studio", "nav.settings", "Settings", "सेटिंग्स"),
        ("studio", "language.uiLabel", "Studio Interface Language", "स्टूडियो इंटरफ़ेस भाषा"),
        ("studio", "language.contentHint", "Output video & audio language is configured per job independently of UI language.", "वीडियो और ऑडियो की भाषा इंटरफ़ेस भाषा से स्वतंत्र रूप से चुनी जाती है।"),
        ("studio", "comedy.title", "3D Funny Shorts & Story Compilation Studio", "३डी कॉमेडी शॉर्ट्स और कहानी संकलन स्टूडियो"),
        ("studio", "comedy.compileTitle", "Build < 3 Min Multi-Joke Compilation", "३ मिनट से कम का मल्टी-जोक संकलन बनाएँ"),
        ("studio", "live.quizTitle", "Interactive Live Stream Quiz Host", "इंटरैक्टिव लाइव स्ट्रीम क्विज़ होस्ट"),
        ("studio", "live.pickWinner", "Pick Random Verified Winner", "रैंडम सत्यापित विजेता चुनें"),
    });

    public IEnumerable<ConfigEntrySeed> ConfigEntries() => Enumerable.Empty<ConfigEntrySeed>();
}
