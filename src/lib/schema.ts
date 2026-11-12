// JSON-LD builders. Pages pass the result to <JsonLd>.
import { entity, site } from "../config/site.mjs";
import type { Faq } from "./schemas";
import { isoDate } from "./dates";

export const abs = (path: string) => new URL(path, site.url).href;
export const orgId = `${site.url}/#organization`;
export const ogImage = abs("/og-default.png");

export function organization() {
  return {
    "@type": "Organization", "@id": orgId, name: site.name, url: site.url,
    logo: { "@type": "ImageObject", url: abs("/icon-512.png"), width: 512, height: 512 },
    description: entity.definition, email: site.contactEmail,
  };
}

export function blogPosting(p: { path: string; title: string; description: string; image?: string; date: Date; updated?: Date; keywords?: string[]; section?: string; lang: string }) {
  return {
    "@type": "BlogPosting", "@id": `${abs(p.path)}#article`, mainEntityOfPage: abs(p.path),
    headline: p.title, description: p.description, image: p.image ? abs(p.image) : ogImage,
    datePublished: isoDate(p.date), dateModified: isoDate(p.updated ?? p.date),
    author: { "@id": orgId }, publisher: { "@id": orgId }, inLanguage: p.lang,
    ...(p.section && { articleSection: p.section }),
    ...(p.keywords?.length && { keywords: p.keywords.join(", ") }),
  };
}

export const faqPage = (faq: Faq) => ({
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
});

/** WebPage for standard, industry, report and penalty pages; the markup matches what the page shows. */
export function webPage(p: { path: string; title: string; description: string; date: Date; updated?: Date; image?: string; lang: string; about?: string }) {
  return {
    "@type": "WebPage", "@id": `${abs(p.path)}#webpage`, url: abs(p.path), name: p.title, description: p.description,
    datePublished: isoDate(p.date), dateModified: isoDate(p.updated ?? p.date), inLanguage: p.lang,
    publisher: { "@type": "Organization", "@id": orgId, name: site.name, url: site.url },
    ...(p.image && { primaryImageOfPage: { "@type": "ImageObject", url: abs(p.image) } }),
    ...(p.about && { about: { "@type": "Thing", name: p.about } }),
  };
}

export interface Crumb { label: string; href: string }
export const breadcrumbList = (crumbs: Crumb[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: abs(c.href) })),
});
