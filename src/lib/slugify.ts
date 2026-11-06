// "Fire Safety" → "fire-safety"; accents dropped.
export const slugify = (text: string) =>
  text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-");
