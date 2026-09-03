using KeshavSingh.Localization.Models;
using KeshavSingh.Localization.Seeding;

namespace Admin.Api.Localization;

/// <summary>
/// What THIS app contributes to the catalogue: the strings its own screens render, and the config keys
/// that are specific to the keshavsingh.in family rather than to any package.
///
/// The language-neutral baseline (English + Hindi, the <c>common</c> wording, <c>ui.icon.*</c>,
/// <c>i18n.*</c>) comes from <c>KeshavSingh.Localization</c>'s own baseline source — it is not repeated
/// here. Public-site content lives in <see cref="PublicSiteSeeds"/>.
///
/// Seeding is additive: adding a row here ships a new string on the next deploy, and editing one here
/// does NOT overwrite a value an editor has since changed on the Localization screen. To change live
/// wording, change it there.
/// </summary>
public sealed class AdminAppSeeds : ILocalizationSeedSource
{
    private const string En = "en";
    private const string Hi = "hi";

    public IEnumerable<TranslationSeed> Translations() => SeedBuilder.Bilingual(En, Hi, new[]
    {
        // ---- Shell navigation. The keys the nav tables in app.ts point at. ----
        ("admin", "nav.dashboard", "Dashboard", "डैशबोर्ड"),
        // Sidebar section headings. The nav is grouped by what a page is FOR, not by who may
        // see it — see frontend/src/app/core/models/navigation.ts, the one place the grouping lives.
        ("admin", "nav.group.workspace", "Workspace", "कार्यक्षेत्र"),
        ("admin", "nav.group.content", "Content", "सामग्री"),
        ("admin", "nav.group.people", "People", "लोग"),
        ("admin", "nav.group.platform", "Platform", "प्लेटफ़ॉर्म"),
        ("admin", "nav.inbox", "Inbox", "इनबॉक्स"),
        ("admin", "nav.meetings", "Meetings", "मीटिंग"),
        ("admin", "nav.notes", "Notes", "नोट्स"),
        ("admin", "nav.files", "Files", "फ़ाइलें"),
        ("admin", "nav.shortLinks", "Short Links", "छोटे लिंक"),
        ("admin", "nav.finance", "Finance", "वित्त"),
        ("admin", "nav.security", "Security", "सुरक्षा"),
        ("admin", "nav.localization", "Localization", "स्थानीयकरण"),
        ("admin", "nav.websites", "Websites", "वेबसाइटें"),
        ("admin", "nav.database", "Database", "डेटाबेस"),
        ("admin", "nav.users", "Users", "उपयोगकर्ता"),
        ("admin", "nav.accountRequests", "Account requests", "खाता अनुरोध"),
        ("admin", "nav.groups", "Groups", "समूह"),
        ("admin", "nav.roles", "Roles", "भूमिकाएँ"),
        ("admin", "nav.moderation", "Chat moderation", "चैट मॉडरेशन"),
        ("admin", "nav.analytics", "Analytics", "विश्लेषण"),
        ("admin", "nav.audit", "Audit log", "ऑडिट लॉग"),
        ("admin", "nav.dataRetention", "Data retention", "डेटा प्रतिधारण"),
        ("admin", "nav.health", "Health", "स्वास्थ्य"),
        ("admin", "nav.packages", "Packages", "पैकेज"),
        ("admin", "nav.settings", "Settings", "सेटिंग्स"),
        ("admin", "nav.manage", "Manage", "प्रबंधन"),
        ("admin", "nav.signout", "Sign out", "साइन आउट"),
        ("admin", "nav.toggleMenu", "Toggle navigation menu", "नेविगेशन मेनू टॉगल करें"),

        // ---- The Localization screen itself ----
        ("admin", "i18n.title", "Localization", "स्थानीयकरण"),
        ("admin", "i18n.tab.locales", "Languages", "भाषाएँ"),
        ("admin", "i18n.tab.translations", "Translations", "अनुवाद"),
        ("admin", "i18n.tab.importExport", "Import / export", "आयात / निर्यात"),
        ("admin", "i18n.tab.config", "Configuration", "कॉन्फ़िगरेशन"),
        ("admin", "i18n.coverage", "Coverage", "पूर्णता"),
        ("admin", "i18n.missingOnly", "Untranslated only", "केवल अनुवादित नहीं"),
        ("admin", "i18n.sourceText", "Source text", "मूल पाठ"),
        ("admin", "i18n.translation", "Translation", "अनुवाद"),
        ("admin", "config.title", "Runtime configuration", "रनटाइम कॉन्फ़िगरेशन"),
        ("admin", "config.secretHint", "Stored secrets are never shown. Enter a value to replace one.",
            "संग्रहीत गुप्त मान कभी नहीं दिखाए जाते। बदलने के लिए नया मान भरें।"),

        // ---- The dashboard (launcher) screen ----
        ("admin", "dashboard.welcome", "Welcome", "स्वागत है"),
        ("admin", "dashboard.welcomeNamed", "Welcome, {name}", "स्वागत है, {name}"),
        ("admin", "dashboard.subtitle", "Your apps — one sign-in for all of them.", "आपके ऐप्स — सबके लिए एक ही साइन-इन।"),
        ("admin", "dashboard.analytics.desc", "View website health and usage metrics by site.",
            "साइट के अनुसार वेबसाइट स्वास्थ्य और उपयोग मैट्रिक्स देखें।"),
        ("admin", "dashboard.notes.desc", "Manage your notes and important information.",
            "अपने नोट्स और महत्वपूर्ण जानकारी प्रबंधित करें।"),
        ("admin", "dashboard.inbox.desc", "Team chat, visitors on the public sites, and the contact form — all in one place.",
            "टीम चैट, सार्वजनिक साइटों के आगंतुक, और संपर्क फ़ॉर्म — सब एक ही जगह।"),
        ("admin", "dashboard.documents", "Documents", "दस्तावेज़"),
        ("admin", "dashboard.documents.desc", "Private folders & documents — organize, preview, and share by permission.",
            "निजी फ़ोल्डर और दस्तावेज़ — अनुमति के अनुसार व्यवस्थित, पूर्वावलोकन और साझा करें।"),
        ("admin", "dashboard.finance.desc", "Household income, investments & goals — with suggestions to improve them.",
            "घरेलू आय, निवेश और लक्ष्य — उन्हें बेहतर बनाने के सुझावों के साथ।"),
        ("admin", "dashboard.blogAdmin", "Blog Admin", "ब्लॉग एडमिन"),
        ("admin", "dashboard.blogAdmin.desc", "Write and manage content for the blog.", "ब्लॉग के लिए सामग्री लिखें और प्रबंधित करें।"),
        ("admin", "dashboard.blog", "Blog", "ब्लॉग"),
        ("admin", "dashboard.blog.desc", "Open the public blog.", "सार्वजनिक ब्लॉग खोलें।"),
    });

    public IEnumerable<ConfigEntrySeed> ConfigEntries() => new[]
    {
        // ---- Cross-app navigation targets. Editable without touching any build. ----
        SeedBuilder.Config("url.portfolio", "urls", ConfigValueType.Url,
            "https://keshavsingh.in", ConfigScope.Public, "Public portfolio site."),
        SeedBuilder.Config("url.blog", "urls", ConfigValueType.Url,
            "https://blog.keshavsingh.in", ConfigScope.Public,
            "Public blog. Mirrors the settings value; prefer this key in new code."),
        SeedBuilder.Config("url.blogadmin", "urls", ConfigValueType.Url,
            "https://blog.keshavsingh.in/admin", ConfigScope.Public, "Blog admin app."),
        SeedBuilder.Config("url.identity", "urls", ConfigValueType.Url,
            "https://admin.keshavsingh.in", ConfigScope.Public,
            "Identity provider app, used for interactive sign-in redirects."),
        SeedBuilder.Config("url.privacy", "urls", ConfigValueType.Url,
            "/privacy", ConfigScope.Public, "Privacy notice."),
        SeedBuilder.Config("url.terms", "urls", ConfigValueType.Url,
            "/terms", ConfigScope.Public, "Terms page."),

        // ---- Feature flags for the public sites ----
        SeedBuilder.Config("feature.visitorchat", "features", ConfigValueType.Bool,
            "true", ConfigScope.Public, "Show the visitor-chat widget on the public sites."),
        SeedBuilder.Config("feature.contactform", "features", ConfigValueType.Bool,
            "true", ConfigScope.Public, "Show the portfolio contact form."),
    };
}
