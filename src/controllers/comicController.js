const db = require('../config/db');

exports.getAllComics = (req, res) => {
  try {
    const comics = db.prepare('SELECT * FROM comics ORDER BY id DESC').all();
    const mapped = comics.map(c => ({...c, genreIds: JSON.parse(c.genreIds || '[]')}));
    res.json({ total: mapped.length, documents: mapped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getComicBySlug = (req, res) => {
  try {
    const comic = db.prepare('SELECT * FROM comics WHERE slug = ?').get(req.params.slug);
    if (!comic) return res.status(404).json({ error: 'Comic not found' });
    
    comic.genreIds = JSON.parse(comic.genreIds || '[]');
    res.json(comic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.incrementComicViews = (req, res) => {
  try {
    db.prepare('UPDATE comics SET views = views + 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteComic = (req, res) => {
  const { id } = req.params;
  try {
    const deleteChapters = db.prepare('DELETE FROM chapters WHERE comicId = ?');
    const deleteComic = db.prepare('DELETE FROM comics WHERE id = ?');
    
    const chapterInfo = deleteChapters.run(id);
    const comicInfo = deleteComic.run(id);
    
    if (comicInfo.changes === 0) {
      return res.status(404).json({ error: 'Truyện không tồn tại.' });
    }
    
    res.json({ success: true, message: `Đã xóa truyện và ${chapterInfo.changes} chương liên quan.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

