using KeshavSingh.Localization.Models;
using KeshavSingh.Localization.Seeding;

namespace Admin.Api.Localization;

/// <summary>
/// The public sites' content — blog and portfolio. It is seeded here, not in those repos, because this
/// API is the single writer for the whole family: the sites only ever READ their strings and config
/// from <c>/api/i18n</c> and <c>/api/config</c>.
///
/// The <c>blog.*</c> config entries are JSON documents describing content that used to be array
/// literals inside Angular components (topic cards, footer link groups, social links). Their labels are
/// translation KEYS, not text, so adding a language needs no change here — and adding a card is a
/// config edit plus two strings, with no deploy at all.
///
/// URLs inside those documents are rendered through Angular's `[href]` binding, which sanitises the
/// scheme; the entries themselves are validated as JSON on write.
/// </summary>
public sealed class PublicSiteSeeds : ILocalizationSeedSource
{
    private const string En = "en";
    private const string Hi = "hi";

    public IEnumerable<TranslationSeed> Translations() => SeedBuilder.Bilingual(En, Hi, new[]
    {
        // ---- Blog: chrome ----
        ("blog", "nav.home", "Home", "होम"),
        ("blog", "nav.topics", "Topics", "विषय"),
        ("blog", "nav.search", "Search", "खोजें"),
        ("blog", "nav.about", "About", "परिचय"),
        ("blog", "nav.browseFolder", "Browse {name}", "{name} देखें"),
        ("blog", "nav.toggleMenu", "Toggle navigation", "नेविगेशन टॉगल करें"),

        // ---- Blog: home page ----
        ("blog", "hero.eyebrow", "Engineering Knowledge Base", "इंजीनियरिंग ज्ञान-कोश"),
        ("blog", "hero.title", "Deep-dive guides for modern developers",
            "आधुनिक डेवलपर्स के लिए विस्तृत मार्गदर्शिकाएँ"),
        ("blog", "hero.subtitle",
            "Hands-on notes and tutorials on C#/.NET, Azure, AWS, Docker, Kubernetes, design patterns and more — curated and kept current.",
            "C#/.NET, Azure, AWS, Docker, Kubernetes, डिज़ाइन पैटर्न और अधिक पर व्यावहारिक नोट्स और ट्यूटोरियल — चुने हुए और अद्यतन।"),
        ("blog", "hero.stat.articles", "Articles", "लेख"),
        ("blog", "hero.stat.topics", "Topics", "विषय"),
        ("blog", "hero.stat.free", "Free", "निःशुल्क"),
        ("blog", "hero.stat.forever", "Forever", "सदा के लिए"),
        ("blog", "home.title", "Notes and write-ups", "नोट्स और लेख"),
        ("blog", "home.subtitle", "Engineering notes, kept in the open.", "इंजीनियरिंग नोट्स, सार्वजनिक रूप से।"),
        ("blog", "home.browse", "Browse topics", "विषय देखें"),
        ("blog", "section.browseTopics", "Browse Topics", "विषय देखें"),
        ("blog", "section.allFiles", "All Files", "सभी फ़ाइलें"),

        // ---- Blog: search and content ----
        ("blog", "search.placeholder", "Search articles…", "लेख खोजें…"),
        ("blog", "search.noResults", "No matching articles", "कोई मिलता लेख नहीं"),
        ("blog", "search.resultCount", "{count} results", "{count} परिणाम"),
        ("blog", "content.readingTime", "{minutes} min read", "{minutes} मिनट पढ़ाई"),
        ("blog", "content.updated", "Updated {date}", "{date} को अद्यतन"),
        ("blog", "content.notFound", "That page could not be found.", "वह पृष्ठ नहीं मिला।"),
        ("blog", "tree.files", "{count} files", "{count} फ़ाइलें"),

        // ---- Blog: footer ----
        ("blog", "footer.about",
            "Comprehensive programming tutorials covering C#, Azure, AWS, Docker, Kubernetes, and modern development practices.",
            "C#, Azure, AWS, Docker, Kubernetes और आधुनिक विकास पद्धतियों को कवर करने वाले विस्तृत प्रोग्रामिंग ट्यूटोरियल।"),
        ("blog", "footer.learn", "Learn", "सीखें"),
        ("blog", "footer.tools", "Tools & Tech", "टूल्स और तकनीक"),
        ("blog", "footer.contact", "Contact", "संपर्क"),
        ("blog", "footer.reachOut", "Feel free to reach out:", "बेझिझक संपर्क करें:"),
        ("blog", "footer.portfolio", "Portfolio", "पोर्टफ़ोलियो"),
        ("blog", "footer.source", "Source Code", "स्रोत कोड"),
        ("blog", "footer.rights", "All rights reserved.", "सर्वाधिकार सुरक्षित।"),
        ("blog", "footer.builtWith", "Built with Angular & Bootstrap", "Angular और Bootstrap से बनाया गया"),

        // ---- Blog: topic cards. Referenced by the blog.topics config document. ----
        ("blog", "topic.interviewPrep.name", "Interview Prep", "इंटरव्यू तैयारी"),
        ("blog", "topic.interviewPrep.desc", "Senior/architect track", "सीनियर/आर्किटेक्ट ट्रैक"),
        ("blog", "topic.csharp.name", "C# Programming", "C# प्रोग्रामिंग"),
        ("blog", "topic.csharp.desc", "Language & patterns", "भाषा और पैटर्न"),
        ("blog", "topic.azure.name", "Azure Cloud", "Azure क्लाउड"),
        ("blog", "topic.azure.desc", "Cloud services", "क्लाउड सेवाएँ"),
        ("blog", "topic.aws.name", "AWS", "AWS"),
        ("blog", "topic.aws.desc", "Amazon Web Services", "Amazon वेब सेवाएँ"),
        ("blog", "topic.containers.name", "Containerize", "कंटेनरीकरण"),
        ("blog", "topic.containers.desc", "Docker & Kubernetes", "Docker और Kubernetes"),
        ("blog", "topic.sql.name", "SQL Database", "SQL डेटाबेस"),
        ("blog", "topic.sql.desc", "Database & queries", "डेटाबेस और क्वेरी"),
        ("blog", "topic.patterns.name", "Design Patterns", "डिज़ाइन पैटर्न"),
        ("blog", "topic.patterns.desc", "GOF patterns", "GOF पैटर्न"),
        ("blog", "topic.networking.name", "Networking", "नेटवर्किंग"),
        ("blog", "topic.networking.desc", "Protocols & concepts", "प्रोटोकॉल और अवधारणाएँ"),
        ("blog", "topic.extensions.name", "VS Code Extensions", "VS Code एक्सटेंशन"),
        ("blog", "topic.extensions.desc", "Extensions", "एक्सटेंशन"),

        // ---- Portfolio: chrome + the sections its screens render ----
        ("portfolio", "nav.home", "Home", "होम"),
        ("portfolio", "nav.about", "About", "परिचय"),
        ("portfolio", "nav.experience", "Experience", "अनुभव"),
        ("portfolio", "nav.projects", "Projects", "परियोजनाएँ"),
        ("portfolio", "nav.skills", "Skills", "कौशल"),
        ("portfolio", "nav.education", "Education", "शिक्षा"),
        ("portfolio", "nav.certifications", "Certifications", "प्रमाणपत्र"),
        ("portfolio", "nav.blog", "Blog", "ब्लॉग"),
        ("portfolio", "nav.contact", "Contact", "संपर्क"),
        ("portfolio", "nav.resume", "Résumé", "रिज़्यूमे"),
        ("portfolio", "hero.greeting", "Hello, I'm", "नमस्ते, मैं हूँ"),
        ("portfolio", "hero.cta.contact", "Get in touch", "संपर्क करें"),
        ("portfolio", "hero.cta.resume", "Download résumé", "रिज़्यूमे डाउनलोड करें"),
        ("portfolio", "contact.title", "Get in touch", "संपर्क करें"),
        ("portfolio", "contact.subtitle", "Questions, opportunities or just hello — all welcome.",
            "प्रश्न, अवसर या केवल नमस्ते — सब स्वागत है।"),
        ("portfolio", "contact.sent", "Thanks — your message has been sent.", "धन्यवाद — आपका संदेश भेज दिया गया।"),
        ("portfolio", "contact.failed", "That message could not be sent. Please try again.",
            "संदेश नहीं भेजा जा सका। कृपया फिर प्रयास करें।"),
        ("portfolio", "footer.rights", "All rights reserved.", "सर्वाधिकार सुरक्षित।"),
        ("portfolio", "cookies.message", "This site uses cookies to understand how it is used.",
            "यह साइट उपयोग समझने के लिए कुकीज़ का प्रयोग करती है।"),
        ("portfolio", "cookies.accept", "Accept", "स्वीकार करें"),
        ("portfolio", "cookies.decline", "Decline", "अस्वीकार करें"),
    });

    public IEnumerable<ConfigEntrySeed> ConfigEntries() => new[]
    {
        SeedBuilder.Config("blog.topics", "blog", ConfigValueType.Json, BlogTopics, ConfigScope.Public,
            "Topic cards on the blog home page: nameKey/descriptionKey are translation keys, folderName "
            + "matches the content folder, icon is a Font Awesome class, color is a CSS background."),
        SeedBuilder.Config("blog.social", "blog", ConfigValueType.Json, BlogSocial, ConfigScope.Public,
            "Social links in the blog footer: label, icon (Font Awesome class) and url."),
        SeedBuilder.Config("blog.footer.groups", "blog", ConfigValueType.Json, BlogFooterGroups, ConfigScope.Public,
            "Footer link groups: titleKey is a translation key; each link has a labelKey plus either a "
            + "path (+ optional query) for an in-site route or a url for an external one."),
        SeedBuilder.Config("blog.contact.email", "blog", ConfigValueType.String,
            "keshavsingh4522@gmail.com", ConfigScope.Public, "Contact address shown in the blog footer."),
    };

    // -----------------------------------------------------------------------------------------
    // The JSON documents. These reproduce exactly what the blog components used to hold as array
    // literals — seeding them changes nothing on first run, it only moves the content somewhere an
    // editor can reach it.
    // -----------------------------------------------------------------------------------------

    private const string BlogTopics = """
    [
      { "nameKey": "blog.topic.interviewPrep.name", "descriptionKey": "blog.topic.interviewPrep.desc", "icon": "fa-user-graduate", "color": "linear-gradient(135deg,#6366f1,#a855f7)", "folderName": "Interview-Prep" },
      { "nameKey": "blog.topic.csharp.name", "descriptionKey": "blog.topic.csharp.desc", "icon": "fa-code", "color": "linear-gradient(135deg,#667eea,#764ba2)", "folderName": "CSharp" },
      { "nameKey": "blog.topic.azure.name", "descriptionKey": "blog.topic.azure.desc", "icon": "fa-cloud", "color": "linear-gradient(135deg,#0072c6,#00b4f0)", "folderName": "Azure" },
      { "nameKey": "blog.topic.aws.name", "descriptionKey": "blog.topic.aws.desc", "icon": "fa-amazon", "color": "linear-gradient(135deg,#ff9900,#ff6600)", "folderName": "AWS" },
      { "nameKey": "blog.topic.containers.name", "descriptionKey": "blog.topic.containers.desc", "icon": "fa-box", "color": "linear-gradient(135deg,#0db7ed,#066da5)", "folderName": "Containerization" },
      { "nameKey": "blog.topic.sql.name", "descriptionKey": "blog.topic.sql.desc", "icon": "fa-database", "color": "linear-gradient(135deg,#11998e,#38ef7d)", "folderName": "SQL" },
      { "nameKey": "blog.topic.patterns.name", "descriptionKey": "blog.topic.patterns.desc", "icon": "fa-puzzle-piece", "color": "linear-gradient(135deg,#f953c6,#b91d73)", "folderName": "GOF" },
      { "nameKey": "blog.topic.networking.name", "descriptionKey": "blog.topic.networking.desc", "icon": "fa-network-wired", "color": "linear-gradient(135deg,#4facfe,#00f2fe)", "folderName": "Networking" },
      { "nameKey": "blog.topic.extensions.name", "descriptionKey": "blog.topic.extensions.desc", "icon": "fa-puzzle-piece", "color": "linear-gradient(135deg,#f7971e,#ffd200)", "folderName": "Extensions" }
    ]
    """;

    private const string BlogSocial = """
    [
      { "label": "LinkedIn", "icon": "fab fa-linkedin-in", "url": "https://www.linkedin.com/in/keshavsingh4522/" },
      { "label": "GitHub", "icon": "fab fa-github", "url": "https://github.com/keshavsingh4522" },
      { "label": "X / Twitter", "icon": "fab fa-x-twitter", "url": "https://x.com/Keshavsingh4522" },
      { "label": "Instagram", "icon": "fab fa-instagram", "url": "https://www.instagram.com/keshavsingh3197/" }
    ]
    """;

    private const string BlogFooterGroups = """
    [
      {
        "titleKey": "blog.footer.learn", "icon": "fas fa-book",
        "links": [
          { "labelKey": "blog.topic.csharp.name", "path": "/file", "query": { "path": "src/CSharp/csharp.md" } },
          { "labelKey": "blog.topic.azure.name", "path": "/file", "query": { "path": "src/Azure/azure.md" } },
          { "labelKey": "blog.topic.aws.name", "path": "/file", "query": { "path": "src/AWS/aws.md" } },
          { "labelKey": "blog.topic.sql.name", "path": "/file", "query": { "path": "src/SQL/sql.md" } }
        ]
      },
      {
        "titleKey": "blog.footer.tools", "icon": "fas fa-tools",
        "links": [
          { "labelKey": "blog.topic.patterns.name", "path": "/file", "query": { "path": "src/GOF/GOF.md" } },
          { "labelKey": "blog.topic.networking.name", "path": "/file", "query": { "path": "src/Networking/network.md" } },
          { "labelKey": "blog.footer.portfolio", "url": "https://www.keshavsingh.net" },
          { "labelKey": "blog.footer.source", "url": "https://github.com/keshavsingh4522/content-blog" }
        ]
      }
    ]
    """;
}
