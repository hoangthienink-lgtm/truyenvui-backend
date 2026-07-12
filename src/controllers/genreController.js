const db = require('../config/db');

exports.getAllGenres = (req, res) => {
  try {
    const genres = db.prepare('SELECT * FROM genres').all();
    res.json({ total: genres.length, documents: genres });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
