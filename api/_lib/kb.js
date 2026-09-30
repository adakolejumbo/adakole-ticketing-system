// Lightweight relevance scoring for knowledge base deflection.
const STOP = new Set('the and for with that this have from your when what does cant can not how why are was but our you all any out get got use one its it\'s just need help please'.split(' '));

export function terms(text) {
  return [...new Set(String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter((w) => !STOP.has(w));
}

export function rankArticles(articles, text, limit = 5) {
  const words = terms(text);
  if (!words.length) return [];
  return articles
    .map((a) => {
      const title = a.title.toLowerCase();
      const body = a.body.toLowerCase();
      const tags = (a.tags || []).join(' ').toLowerCase();
      let score = 0;
      let strong = false;
      for (const w of words) {
        if (title.includes(w)) { score += 3; strong = true; }
        if (tags.includes(w)) { score += 2; strong = true; }
        if (body.includes(w)) score += 1;
      }
      if (!strong) score = 0;
      return { id: a.id, title: a.title, excerpt: a.body.replace(/[#*_>`]/g, '').slice(0, 160), score };
    })
    .filter((a) => a.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
