// Languages and the interface strings for them. A page's language is read from
// its URL: /fr/… and /de/… are translations, everything else is English.
import { defaultLocale, locales, markets, site } from "../config/site.mjs";

export type Lang = "en" | "fr" | "de";
export const defaultLang = defaultLocale as Lang;
export const langs = locales.map((l) => l.code) as Lang[];
export const translatedLangs = langs.filter((l) => l !== defaultLang);
export const meta = Object.fromEntries(locales.map((l) => [l.code, l])) as Record<Lang, (typeof locales)[number]>;

const prefix = new RegExp(`^/?(${translatedLangs.join("|")})(/|$)`);

/** The language of a URL path ("/fr/x") or a post id ("fr/x"). */
export const langOf = (pathOrId: string): Lang =>
  (pathOrId.replace(/\.html$/, "").match(prefix)?.[1] as Lang | undefined) ?? defaultLang;

export type Market = "us" | "uk" | "au" | "ca" | "nz" | "fr" | "de";
export const marketMeta = Object.fromEntries(markets.map((m) => [m.code, m])) as Record<Market, (typeof markets)[number]>;
export const englishMarkets: Market[] = ["us", "uk", "au", "ca", "nz"];
const marketPrefix = /^\/?(uk|au|ca|nz|us)(\/|$)/;

/** The market of a URL path or a content id ("uk/x" → uk, "fr/x" → fr, "/us/standards/x" → us, "x" → us). */
export function marketOf(pathOrId: string): Market {
  const l = langOf(pathOrId);
  if (l !== defaultLang) return l as Market;
  return (pathOrId.match(marketPrefix)?.[1] as Market | undefined) ?? "us";
}
/** <html lang> and hreflang code of a page. */
export const hreflangOf = (path: string) => marketMeta[marketOf(path)].hreflang;
/** Interface language of a market. */
export const langOfMarket = (m: Market): Lang => (m === "fr" || m === "de" ? m : "en");

/** "/fr/x" → "/x", "fr/x" → "x". */
export function stripLang(pathOrId: string): string {
  if (!prefix.test(pathOrId)) return pathOrId;
  const rest = pathOrId.replace(prefix, "");
  return pathOrId.startsWith("/") ? `/${rest}` : rest;
}

/** The path of the same page in another language. */
export function inLang(path: string, lang: Lang): string {
  const base = stripLang(path);
  return lang === defaultLang ? base : `/${lang}${base === "/" ? "" : base}`;
}

export interface Strings {
  skip: string; home: string; blog: string; tags: string; allTags: string; categories: string; about: string; search: string;
  minRead: (n: number) => string; by: string; published: string; updated: string;
  keyTakeaways: string; toc: string; faq: string; sources: string; relatedPosts: string;
  latest: string; seeAll: string; backToBlog: string; postsTagged: (t: string) => string; categoryTitle: (c: string) => string;
  noPosts: string; notFound: string; goHome: string; language: string; footerRights: string;
  heroTitle: string; heroText: string; homeTitle: string; homeDescription: string;
  blogTitle: string; blogDescription: string; tagsDescription: string; tagTitle: (t: string) => string; tagDescription: (t: string) => string;
  privacy: string; terms: string; contact: string; rss: string;
  howMade: string; howMadeData: string; disclaimer: string; madeBy: string;
  hubGuides: string; hubStandards: string; hubIndustries: string; hubReports: string; hubPenalties: string;
  dataAsOf: (d: string) => string; checklist: string; print: string; downloadPdf: string; downloadExcel: string; resetChecklist: string;
  checked: (n: number, total: number) => string; whatToLookFor: string; reference: string; appComingSoon: string; appGet: string; appScan: string;
  related: string; guidesUsingStandard: string; breadcrumb: string; inMarket: (m: string) => string; marketHomeTitle: (m: string) => string;
  marketHomeDescription: (m: string) => string; guidesHubTitle: (m: string) => string; guidesHubDescription: (m: string) => string; checklistNote: string; aboutTitle: string; aboutDescription: string; aboutBody: string[];
}

export const ui: Record<Lang, Strings> = {
  en: {
    skip: "Skip to content", home: "Home", blog: "blog", tags: "Tags", allTags: "All tags", categories: "Categories", about: "about", search: "Search",
    minRead: (n) => `${n} min read`, by: "By", published: "Published", updated: "Updated",
    keyTakeaways: "Key takeaways", toc: "Table of contents", faq: "Frequently asked questions", sources: "Sources", relatedPosts: "Related guides",
    latest: "Latest guides", seeAll: "See all guides", backToBlog: "Back to blog", postsTagged: (t) => `Guides tagged “${t}”`, categoryTitle: (c) => `${c} guides`,
    noPosts: "No guides yet.", notFound: "404: Page not found", goHome: "Go to home page", language: "Language", footerRights: "All rights reserved.",
    heroTitle: "Workplace safety, explained from the primary sources",
    heroText: "Plain-language guides to OSHA, ANSI, NFPA and NIOSH requirements. Every claim links to the regulation or standard it comes from.",
    homeTitle: "Safety Index: workplace safety guides from primary sources",
    homeDescription: "Plain-language workplace safety guides to OSHA, ANSI, NFPA and NIOSH requirements, each linked to the primary sources behind it.",
    blogTitle: "All safety guides", blogDescription: "Every Safety Index guide, newest first.", tagsDescription: "Every tag used on Safety Index guides.",
    tagTitle: (t) => `Tag: ${t}`, tagDescription: (t) => `Workplace safety guides tagged “${t}”.`,
    privacy: "Privacy", terms: "Terms", contact: "Contact", rss: "RSS",
    howMade: "How this guide was made: it was researched and written by Claude, an AI model, from primary sources (regulators, standards bodies) opened during research, and the sources are linked above. Before it goes live, a separate AI check compares it with those sources, and automated checks test every clause reference, number and link. The featured image is AI-generated and illustrative. It has not been reviewed line by line by a named safety professional.",
    howMadeData: "How this page was made: it is built by a script directly from the official data listed above (no AI writing); the figures are copied from that data, and the page is rebuilt when new data is published. The featured image is AI-generated and illustrative.",
    hubGuides: "Guides", hubStandards: "OSHA standards", hubIndustries: "Industries", hubReports: "Reports", hubPenalties: "OSHA penalties",
    dataAsOf: (d) => `Data as of ${d}`, checklist: "Checklist", print: "Print", downloadPdf: "Download PDF", downloadExcel: "Download Excel", resetChecklist: "Clear ticks",
    checked: (n, t) => `${n} of ${t} checked`, whatToLookFor: "What to look for", reference: "Ref.", appComingSoon: "Coming soon on Android and iOS.", appGet: "Use this checklist in the app", appScan: "Scan to get the app on your phone",
    related: "Related", guidesUsingStandard: "Guides using this standard", breadcrumb: "Breadcrumb", inMarket: (m) => `In ${m}`,
    marketHomeTitle: (m) => `Safety guides and checklists for ${m}`, marketHomeDescription: (m) => `Workplace safety guides, standards and checklists for ${m}, written from the official regulations and linked to them.`,
    guidesHubTitle: (m) => `Safety guides for ${m}, by topic`, guidesHubDescription: (m) => `Every Safety Index guide for ${m}, grouped by topic, with links to the regulations each one is written from.`,
    checklistNote: "Tick boxes work on this page and are not saved. Print it, or download the PDF or Excel version (no sign-up).",
    madeBy: "Made by the team behind the Conform app.",
    disclaimer: "General information, not legal or professional advice. Rules differ by country, state and industry: check the regulation that applies to your site and ask your regulator or a competent safety professional.",
    aboutTitle: "About Safety Index", aboutDescription: "What Safety Index is, how every guide is researched and written with AI, and what that means for how you use it.",
    aboutBody: [
      "Safety Index publishes plain-language workplace safety guides and checklists for the US, UK, Germany, France, Australia, Canada and New Zealand. Made by the team behind the Conform app. Each one is built from primary sources: the regulation, the standard or the regulator's own guidance, linked in the sources list so you can read the original.",
      "## How we write",
      "Guides are researched and written by Claude, an AI model made by Anthropic. During research it opens the regulator and standards pages it cites, and the build refuses a guide that cites a page it did not open. A second, separate AI call then checks every draft against its sources only (it never sees the writing instructions); a page that still fails after one rewrite is dropped, not published. Standard and industry pages are written from the regulation text on eCFR and from the U.S. Department of Labor's enforcement data; data reports are built by script from that data with no AI writing. We do not invent authors, case studies, statistics or experience: worked examples are labelled as examples. Featured images are generated by Google's Gemini image model, are illustrative only, and carry the IPTC label for AI-generated media.",
      "Google's guidance is that content is judged on whether it helps people, not on how it was produced. We still tell you plainly how this is made, because safety is a topic where accuracy matters. Guides are not reviewed line by line by a named safety professional.",
      "## What to do with a guide",
      "Use it to understand a rule and find the source. Before you rely on it for your own site, read the linked regulation and ask your regulator or a competent safety professional. If you find a mistake, tell us on the contact page and we will correct it and update the date.",
      "## Languages",
      "Each guide is also written for French and German readers. These are rewrites for that market, researched with local search terms and local regulators where they exist, not word-for-word translations.",
    ],
  },
  fr: {
    skip: "Aller au contenu", home: "Accueil", blog: "blog", tags: "Mots-clés", allTags: "Tous les mots-clés", categories: "Catégories", about: "à propos", search: "Rechercher",
    minRead: (n) => `${n} min de lecture`, by: "Par", published: "Publié le", updated: "Mis à jour le",
    keyTakeaways: "À retenir", toc: "Sommaire", faq: "Questions fréquentes", sources: "Sources", relatedPosts: "Guides liés",
    latest: "Derniers guides", seeAll: "Voir tous les guides", backToBlog: "Retour au blog", postsTagged: (t) => `Guides avec le mot-clé « ${t} »`, categoryTitle: (c) => `Guides : ${c}`,
    noPosts: "Aucun guide pour le moment.", notFound: "404 : page introuvable", goHome: "Retour à l'accueil", language: "Langue", footerRights: "Tous droits réservés.",
    heroTitle: "La sécurité au travail, expliquée à partir des sources officielles",
    heroText: "Des guides clairs sur les exigences de sécurité au travail. Chaque affirmation renvoie au texte réglementaire ou à la norme dont elle provient.",
    homeTitle: "Safety Index : guides de sécurité au travail",
    homeDescription: "Guides clairs sur la sécurité au travail, chacun relié aux sources officielles (réglementation, normes) sur lesquelles il s'appuie.",
    blogTitle: "Tous les guides sécurité", blogDescription: "Tous les guides Safety Index, du plus récent au plus ancien.", tagsDescription: "Tous les mots-clés utilisés dans les guides Safety Index.",
    tagTitle: (t) => `Mot-clé : ${t}`, tagDescription: (t) => `Guides de sécurité au travail avec le mot-clé « ${t} ».`,
    privacy: "Confidentialité", terms: "Conditions", contact: "Contact", rss: "RSS",
    howMade: "Comment ce guide a été réalisé : il a été recherché et rédigé par Claude, un modèle d'IA, à partir de sources officielles (autorités, organismes de normalisation) consultées pendant la recherche ; les sources sont indiquées ci-dessus. Avant sa mise en ligne, une vérification par une autre IA le compare à ces sources, et des contrôles automatiques testent chaque référence, chiffre et lien. L'image d'illustration est générée par IA. Il n'a pas été relu ligne par ligne par un professionnel de la sécurité identifié.",
    howMadeData: "Comment cette page a été réalisée : elle est produite par un script directement à partir des données officielles citées ci-dessus (sans rédaction par IA) et reconstruite à chaque nouvelle publication des données. L'image d'illustration est générée par IA.",
    hubGuides: "Guides", hubStandards: "Normes OSHA", hubIndustries: "Secteurs", hubReports: "Rapports", hubPenalties: "Sanctions OSHA",
    dataAsOf: (d) => `Données à jour au ${d}`, checklist: "Liste de contrôle", print: "Imprimer", downloadPdf: "Télécharger le PDF", downloadExcel: "Télécharger le fichier Excel", resetChecklist: "Tout décocher",
    checked: (n, t) => `${n} sur ${t} cochés`, whatToLookFor: "Points à vérifier", reference: "Réf.", appComingSoon: "Bientôt disponible sur Android et iOS.", appGet: "Utiliser cette liste dans l'application", appScan: "Scannez pour installer l'application",
    related: "À lire aussi", guidesUsingStandard: "Guides qui citent ce texte", breadcrumb: "Fil d'Ariane", inMarket: (m) => `En ${m}`,
    marketHomeTitle: (m) => `Sécurité au travail en ${m} : guides et listes de contrôle`, marketHomeDescription: (m) => `Guides et listes de contrôle de sécurité au travail pour la ${m}, rédigés à partir des textes officiels et reliés à eux.`,
    guidesHubTitle: () => "Guides de sécurité au travail par thème", guidesHubDescription: () => "Tous les guides Safety Index pour la France, classés par thème, avec les textes dont chacun est tiré.",
    checklistNote: "Les cases se cochent sur cette page et ne sont pas enregistrées. Imprimez-la ou téléchargez la version PDF ou Excel (sans inscription).",
    madeBy: "Réalisé par l'équipe de l'application Conform.",
    disclaimer: "Informations générales, ni conseil juridique ni conseil professionnel. Les règles varient selon le pays et le secteur : consultez le texte applicable à votre site et demandez conseil à l'autorité compétente ou à une personne compétente en prévention.",
    aboutTitle: "À propos de Safety Index", aboutDescription: "Ce qu'est Safety Index, comment chaque guide est recherché et rédigé avec l'IA, et ce que cela implique pour vous.",
    aboutBody: [
      "Safety Index publie des guides clairs et des listes de contrôle sur la sécurité au travail. Réalisé par l'équipe de l'application Conform. Chacun s'appuie sur des sources officielles : la réglementation, la norme ou les recommandations de l'autorité, indiquées dans la liste des sources pour que vous puissiez lire l'original.",
      "## Comment nous écrivons",
      "Les guides sont recherchés et rédigés par Claude, un modèle d'IA d'Anthropic. Pendant la recherche, il ouvre les pages des autorités et organismes qu'il cite, et la publication est refusée si un guide cite une page non consultée. Une seconde IA, distincte, vérifie ensuite chaque brouillon au regard de ses seules sources ; une page qui échoue encore après une réécriture n'est pas publiée. Nous n'inventons ni auteurs, ni études de cas, ni statistiques, ni expérience : les exemples chiffrés sont présentés comme des exemples. Les images d'illustration sont générées par le modèle d'images Gemini de Google, purement illustratives, et portent le marquage IPTC des contenus générés par IA.",
      "Selon Google, un contenu est jugé sur son utilité pour les lecteurs, pas sur la façon dont il est produit. Nous indiquons malgré tout clairement comment il est fait, car la sécurité exige de l'exactitude. Les guides ne sont pas relus ligne par ligne par un professionnel de la sécurité identifié.",
      "## Comment utiliser un guide",
      "Servez-vous-en pour comprendre une règle et trouver sa source. Avant de vous y fier pour votre site, lisez le texte cité et demandez conseil à l'autorité compétente ou à un préventeur. Si vous repérez une erreur, signalez-la via la page de contact : nous la corrigerons et mettrons la date à jour.",
      "## Langues",
      "Chaque guide existe aussi pour les lecteurs français et allemands. Ce sont des réécritures pour le marché local, fondées sur les requêtes réellement utilisées et sur les autorités locales lorsqu'elles existent, pas des traductions mot à mot.",
    ],
  },
  de: {
    skip: "Zum Inhalt springen", home: "Startseite", blog: "blog", tags: "Schlagwörter", allTags: "Alle Schlagwörter", categories: "Kategorien", about: "über uns", search: "Suchen",
    minRead: (n) => `${n} Min. Lesezeit`, by: "Von", published: "Veröffentlicht am", updated: "Aktualisiert am",
    keyTakeaways: "Das Wichtigste", toc: "Inhaltsverzeichnis", faq: "Häufige Fragen", sources: "Quellen", relatedPosts: "Weitere Ratgeber",
    latest: "Neueste Ratgeber", seeAll: "Alle Ratgeber ansehen", backToBlog: "Zurück zum Blog", postsTagged: (t) => `Ratgeber zum Schlagwort „${t}“`, categoryTitle: (c) => `Ratgeber: ${c}`,
    noPosts: "Noch keine Ratgeber.", notFound: "404: Seite nicht gefunden", goHome: "Zur Startseite", language: "Sprache", footerRights: "Alle Rechte vorbehalten.",
    heroTitle: "Arbeitsschutz, erklärt anhand der Originalquellen",
    heroText: "Verständliche Ratgeber zu Anforderungen im Arbeitsschutz. Jede Aussage verweist auf die Vorschrift oder Norm, aus der sie stammt.",
    homeTitle: "Safety Index: Ratgeber zum Arbeitsschutz",
    homeDescription: "Verständliche Arbeitsschutz-Ratgeber, jeweils mit Verweis auf die Originalquellen (Vorschriften, Normen), auf denen sie beruhen.",
    blogTitle: "Alle Arbeitsschutz-Ratgeber", blogDescription: "Alle Safety-Index-Ratgeber, neueste zuerst.", tagsDescription: "Alle Schlagwörter der Safety-Index-Ratgeber.",
    tagTitle: (t) => `Schlagwort: ${t}`, tagDescription: (t) => `Arbeitsschutz-Ratgeber zum Schlagwort „${t}“.`,
    privacy: "Datenschutz", terms: "Nutzungsbedingungen", contact: "Kontakt", rss: "RSS",
    howMade: "So ist dieser Ratgeber entstanden: Er wurde von Claude, einem KI-Modell, anhand von Originalquellen (Behörden, Normungsorganisationen) recherchiert und geschrieben, die während der Recherche geöffnet wurden; die Quellen sind oben verlinkt. Vor der Veröffentlichung gleicht eine zweite, unabhängige KI-Prüfung ihn mit diesen Quellen ab, und automatische Prüfungen testen jede Fundstelle, jede Zahl und jeden Link. Das Titelbild ist KI-generiert und dient der Illustration. Er wurde nicht Zeile für Zeile von einer namentlich genannten Fachkraft für Arbeitssicherheit geprüft.",
    howMadeData: "So ist diese Seite entstanden: Ein Skript erstellt sie direkt aus den oben genannten amtlichen Daten (ohne KI-Text) und baut sie neu, sobald neue Daten erscheinen. Das Titelbild ist KI-generiert und dient der Illustration.",
    hubGuides: "Ratgeber", hubStandards: "OSHA-Vorschriften", hubIndustries: "Branchen", hubReports: "Berichte", hubPenalties: "OSHA-Bußgelder",
    dataAsOf: (d) => `Datenstand: ${d}`, checklist: "Checkliste", print: "Drucken", downloadPdf: "PDF herunterladen", downloadExcel: "Excel herunterladen", resetChecklist: "Häkchen entfernen",
    checked: (n, t) => `${n} von ${t} abgehakt`, whatToLookFor: "Worauf achten", reference: "Fundstelle", appComingSoon: "Bald für Android und iOS verfügbar.", appGet: "Diese Checkliste in der App nutzen", appScan: "Scannen, um die App zu laden",
    related: "Weiterlesen", guidesUsingStandard: "Ratgeber zu dieser Vorschrift", breadcrumb: "Brotkrümelnavigation", inMarket: (m) => `In ${m}`,
    marketHomeTitle: () => "Arbeitsschutz in Deutschland: Ratgeber und Checklisten", marketHomeDescription: () => "Ratgeber und Checklisten zum Arbeitsschutz in Deutschland, geschrieben anhand der amtlichen Vorschriften und mit ihnen verlinkt.",
    guidesHubTitle: () => "Arbeitsschutz-Ratgeber nach Themen", guidesHubDescription: () => "Alle Safety-Index-Ratgeber für Deutschland, nach Themen geordnet, mit den Vorschriften, auf denen sie beruhen.",
    checklistNote: "Die Kästchen lassen sich auf dieser Seite abhaken und werden nicht gespeichert. Drucken Sie die Seite oder laden Sie die PDF- oder Excel-Fassung herunter (ohne Anmeldung).",
    madeBy: "Vom Team hinter der Conform-App.",
    disclaimer: "Allgemeine Informationen, keine Rechts- oder Fachberatung. Die Vorschriften unterscheiden sich je nach Land und Branche: Prüfen Sie die für Ihren Betrieb geltende Regelung und fragen Sie Ihre Behörde, den Unfallversicherungsträger oder eine Fachkraft für Arbeitssicherheit.",
    aboutTitle: "Über Safety Index", aboutDescription: "Was Safety Index ist, wie jeder Ratgeber mit KI recherchiert und geschrieben wird und was das für die Nutzung bedeutet.",
    aboutBody: [
      "Safety Index veröffentlicht verständliche Ratgeber und Checklisten zum Arbeitsschutz. Vom Team hinter der Conform-App. Jeder stützt sich auf Originalquellen: die Vorschrift, die Norm oder die Hinweise der zuständigen Stelle, verlinkt in der Quellenliste, damit Sie das Original lesen können.",
      "## Wie wir schreiben",
      "Die Ratgeber werden von Claude, einem KI-Modell von Anthropic, recherchiert und geschrieben. Bei der Recherche öffnet es die Seiten der Behörden und Normungsstellen, die es zitiert; ein Ratgeber, der eine nicht geöffnete Seite zitiert, wird nicht veröffentlicht. Anschließend prüft eine zweite, getrennte KI jeden Entwurf allein anhand seiner Quellen; eine Seite, die auch nach einer Überarbeitung durchfällt, wird nicht veröffentlicht. Wir erfinden keine Autoren, Fallstudien, Statistiken oder Erfahrungen: Rechenbeispiele sind als Beispiele gekennzeichnet. Titelbilder werden mit dem Bildmodell Gemini von Google erzeugt, dienen nur der Illustration und tragen die IPTC-Kennzeichnung für KI-generierte Medien.",
      "Laut Google zählt, ob ein Inhalt Menschen hilft, nicht wie er entstanden ist. Wir sagen trotzdem offen, wie er entsteht, weil im Arbeitsschutz Genauigkeit zählt. Die Ratgeber werden nicht Zeile für Zeile von einer namentlich genannten Fachkraft für Arbeitssicherheit geprüft.",
      "## Wie Sie einen Ratgeber nutzen",
      "Nutzen Sie ihn, um eine Regel zu verstehen und die Quelle zu finden. Lesen Sie vor der Anwendung in Ihrem Betrieb die verlinkte Vorschrift und fragen Sie Ihre Behörde oder eine Fachkraft für Arbeitssicherheit. Wenn Sie einen Fehler finden, melden Sie ihn über die Kontaktseite; wir korrigieren ihn und aktualisieren das Datum.",
      "## Sprachen",
      "Jeder Ratgeber erscheint auch für französische und deutsche Leser. Das sind Neufassungen für den jeweiligen Markt, recherchiert mit den dort üblichen Suchbegriffen und, wo vorhanden, lokalen Behörden, keine Wort-für-Wort-Übersetzungen.",
    ],
  },
};

export const t = (pathOrLang: string): Strings => ui[(langs as string[]).includes(pathOrLang) ? (pathOrLang as Lang) : langOf(pathOrLang)];
export const siteName = site.name;
