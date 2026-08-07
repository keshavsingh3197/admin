/**
 * Migration 004 — publish the portfolio's STRUCTURED content per language.
 *
 * The portfolio's flat strings come from the translation catalogue, but two sections are arrays of
 * objects that a flat `namespace.key → value` bundle cannot express: the "about me" paragraphs and the
 * experience timeline. Those belong in AdminDb.website_content, which is already keyed by
 * site + key + LOCALE — exactly what they need.
 *
 * The portfolio reads them at `GET /api/website-content/public/portfolio/{about|experience}?locale=xx`
 * and merges them into its translate store under the `AboutMe.` / `Experience.` prefixes, so its
 * existing templates keep working unchanged (see ApiTranslateLoader in that repo).
 *
 * English is lifted verbatim from the file that used to be the source (`src/assets/i18n/en.json`), so
 * nothing changes visually. Hindi is provided for the same shape; anything left untranslated resolves
 * through the locale fallback chain instead of rendering blank.
 *
 * Tracked + idempotent (see 001). Published immediately — this is content the site already showed.
 *
 * Run:  mongosh "<connection string>" db/migrations/004_portfolio-structured-content.mongodb.js
 */

const dbx = db.getSiblingDB('AdminDb');
const MIGRATION_ID = '004_portfolio-structured-content';

if (dbx._migrations.findOne({ _id: MIGRATION_ID })) {
  print(`[skip] ${MIGRATION_ID} (already applied)`);
} else {
  const now = new Date();

  const about = {
    en: {
      Title: 'About me',
      Paragraphs: [
        "A diligent backend developer with a strong foundation in .NET Core, ASP.NET Core Web API, and a suite of AWS services. My experience spans creating high-performance microservices, enhancing API response times, and contributing to agile, cross-functional teams. I'm passionate about continuous learning, embracing everyday challenges, and leveraging my skills for meaningful project contributions. Mentorship from industry experts has honed my problem-solving abilities and shaped my approach to innovative software development.",
      ],
    },
    hi: {
      Title: 'मेरे बारे में',
      Paragraphs: [
        '.NET Core, ASP.NET Core Web API और AWS सेवाओं की मजबूत नींव वाला एक परिश्रमी बैकएंड डेवलपर। मेरा अनुभव उच्च-प्रदर्शन माइक्रोसर्विसेज बनाने, API प्रतिक्रिया समय सुधारने और एजाइल, क्रॉस-फ़ंक्शनल टीमों में योगदान देने तक फैला है। मैं निरंतर सीखने, रोज़ की चुनौतियों को अपनाने और अपने कौशल से सार्थक योगदान देने के लिए उत्साहित हूँ। उद्योग विशेषज्ञों के मार्गदर्शन ने मेरी समस्या-समाधान क्षमता को निखारा है।',
      ],
    },
  };

  const experience = {
    en: {
      Title: 'Experience',
      Jobs: [
        {
          Tab: 'Unthinkable',
          Company: {
            Name: 'Unthinkable Solutions LLP',
            CompanyLink: 'https://www.unthinkable.co/',
            GithubLink: 'https://www.linkedin.com/company/unthinkable-software/',
          },
          Title: 'Backend .NET Developer',
          Date: 'January 2021 - July 2023',
          Description: [
            'Implemented gRPC Microservices using .NET Core, enhancing API response times by 40%.',
            'Worked with AWS technologies like SQS, Lambda, and API Gateway to develop scalable solutions.',
            'Practiced Test-Driven Development and participated in agile methodologies for timely deliverables.',
            'Collaborated with cross-functional teams to develop and deploy software solutions.',
            'Mentored junior developers and conducted training sessions on .NET Core and AWS services.',
          ],
        },
        {
          Tab: 'Marlabs',
          Company: {
            Name: 'Marlabs Inc.',
            CompanyLink: 'https://www.marlabs.com/',
            GithubLink: 'https://www.linkedin.com/company/marlabs/',
          },
          Title: 'Backend Developer',
          Date: 'July 2023 - October 2023',
          Description: [
            'Engaged in backend development for projects involving loan management and risk assessment.',
            'Optimized code and implemented encryption/decryption using AWS KMS for data security.',
          ],
        },
        {
          Tab: 'Internships',
          Company: { Name: 'Internships', CompanyLink: '', GithubLink: '' },
          Title: 'Intern',
          Date: 'During B.Tech',
          Description: [
            'Completed two internships focusing on cybersecurity and global software solutions.',
            'Gained practical experience and insights into the software development industry.',
          ],
        },
      ],
    },
    hi: {
      Title: 'अनुभव',
      Jobs: [
        {
          Tab: 'Unthinkable',
          Company: {
            Name: 'Unthinkable Solutions LLP',
            CompanyLink: 'https://www.unthinkable.co/',
            GithubLink: 'https://www.linkedin.com/company/unthinkable-software/',
          },
          Title: 'बैकएंड .NET डेवलपर',
          Date: 'जनवरी 2021 - जुलाई 2023',
          Description: [
            '.NET Core से gRPC माइक्रोसर्विसेज बनाए, API प्रतिक्रिया समय 40% तक सुधारा।',
            'स्केलेबल समाधान बनाने के लिए AWS SQS, Lambda और API Gateway का उपयोग किया।',
            'टेस्ट-ड्रिवन डेवलपमेंट अपनाया और समयबद्ध डिलीवरी के लिए एजाइल प्रक्रिया में भाग लिया।',
            'सॉफ़्टवेयर समाधान बनाने और तैनात करने के लिए क्रॉस-फ़ंक्शनल टीमों के साथ काम किया।',
            '.NET Core और AWS पर जूनियर डेवलपर्स को मार्गदर्शन और प्रशिक्षण दिया।',
          ],
        },
        {
          Tab: 'Marlabs',
          Company: {
            Name: 'Marlabs Inc.',
            CompanyLink: 'https://www.marlabs.com/',
            GithubLink: 'https://www.linkedin.com/company/marlabs/',
          },
          Title: 'बैकएंड डेवलपर',
          Date: 'जुलाई 2023 - अक्तूबर 2023',
          Description: [
            'लोन प्रबंधन और जोखिम आकलन परियोजनाओं के लिए बैकएंड विकास किया।',
            'कोड अनुकूलित किया और डेटा सुरक्षा के लिए AWS KMS से एन्क्रिप्शन/डिक्रिप्शन लागू किया।',
          ],
        },
        {
          Tab: 'Internships',
          Company: { Name: 'इंटर्नशिप', CompanyLink: '', GithubLink: '' },
          Title: 'इंटर्न',
          Date: 'बी.टेक के दौरान',
          Description: [
            'साइबर सुरक्षा और वैश्विक सॉफ़्टवेयर समाधानों पर केंद्रित दो इंटर्नशिप पूरी कीं।',
            'सॉफ़्टवेयर विकास उद्योग का व्यावहारिक अनुभव और समझ प्राप्त की।',
          ],
        },
      ],
    },
  };

  const blocks = [
    { contentKey: 'about', byLocale: about },
    { contentKey: 'experience', byLocale: experience },
  ];

  let written = 0;
  for (const block of blocks) {
    for (const locale of Object.keys(block.byLocale)) {
      // $setOnInsert only: a block an editor has already changed on the Websites screen is left alone.
      const result = dbx.website_content.updateOne(
        { SiteKey: 'portfolio', ContentKey: block.contentKey, Locale: locale },
        {
          $setOnInsert: {
            SiteKey: 'portfolio',
            ContentKey: block.contentKey,
            Locale: locale,
            PayloadJson: JSON.stringify(block.byLocale[locale]),
            IsPublished: true,
            Version: 1,
            CreatedAt: now,
            UpdatedAt: now,
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount) written++;
    }
  }

  print(`  website_content: ${written} portfolio block(s) published`);

  dbx._migrations.insertOne({ _id: MIGRATION_ID, appliedAt: now });
  print(`[ok] ${MIGRATION_ID}`);
}
