const db = require('../config/db');

exports.getChapters = (req, res) => {
  const { comicId, limit } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 500, 500);
  try {
    let chapters = [];
    if (comicId) {
      // For a specific comic: return all chapters but WITHOUT content
      chapters = db.prepare('SELECT id, comicId, chapterNumber, title, slug FROM chapters WHERE comicId = ? ORDER BY chapterNumber DESC').all(comicId);
    } else {
      // Global listing: return recent chapters WITHOUT content, with a limit
      chapters = db.prepare('SELECT id, comicId, chapterNumber, title, slug FROM chapters ORDER BY chapterNumber DESC LIMIT ?').all(maxLimit);
    }
    res.json({ total: chapters.length, documents: chapters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getChapterBySlug = (req, res) => {
  try {
    const chapter = db.prepare('SELECT * FROM chapters WHERE comicId = ? AND slug = ?').get(req.params.comicId, req.params.chapterSlug);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    res.json(chapter);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
