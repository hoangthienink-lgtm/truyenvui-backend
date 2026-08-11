const db = require('../config/db');

exports.getChapters = (req, res) => {
  const { comicId, limit } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 500, 500);
  try {
    let chapters = [];
    if (comicId) {
      let targetComicId = comicId;
      const comic = db.prepare('SELECT id FROM comics WHERE id = ? OR slug = ?').get(comicId, comicId);
      if (comic) targetComicId = comic.id;

      chapters = db.prepare('SELECT id, comicId, chapterNumber, title, slug FROM chapters WHERE comicId = ? ORDER BY chapterNumber DESC').all(targetComicId);
    } else {
      chapters = db.prepare('SELECT id, comicId, chapterNumber, title, slug FROM chapters ORDER BY chapterNumber DESC LIMIT ?').all(maxLimit);
    }
    const docs = chapters.map(c => ({ ...c, $id: c.id }));
    res.json({ total: docs.length, documents: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getChapterBySlug = (req, res) => {
  try {
    const { comicId, chapterSlug } = req.params;
    const decodedSlug = decodeURIComponent(chapterSlug);
    
    // Resolve comic ID (accepts both UUID id or comic slug)
    let comic = db.prepare('SELECT id FROM comics WHERE id = ? OR slug = ?').get(comicId, comicId);
    const targetComicId = comic ? comic.id : comicId;

    // Parse potential numeric chapter number
    let chapNum = null;
    if (/^\d+$/.test(decodedSlug)) {
      chapNum = parseInt(decodedSlug);
    } else {
      const numMatch = decodedSlug.match(/chuong-(\d+)/i) || decodedSlug.match(/chap-(\d+)/i);
      if (numMatch) {
        chapNum = parseInt(numMatch[1]);
      }
    }

    let chapter = null;
    // 1. Match exact slug or decoded slug
    chapter = db.prepare('SELECT * FROM chapters WHERE comicId = ? AND (slug = ? OR slug = ?)').get(targetComicId, chapterSlug, decodedSlug);

    // 2. Match by chapterNumber
    if (!chapter && chapNum !== null) {
      chapter = db.prepare('SELECT * FROM chapters WHERE comicId = ? AND chapterNumber = ?').get(targetComicId, chapNum);
    }

    // 3. Fuzzy match by slug or title
    if (!chapter) {
      chapter = db.prepare('SELECT * FROM chapters WHERE comicId = ? AND (slug LIKE ? OR title LIKE ?)').get(targetComicId, `%${decodedSlug}%`, `%${decodedSlug}%`);
    }

    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    
    chapter.$id = chapter.id;
    res.json(chapter);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
