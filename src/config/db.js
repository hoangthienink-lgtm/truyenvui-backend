const Database = require('better-sqlite3');
const crypto = require('crypto');

// Setup database
const db = new Database('database.sqlite');
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS comics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    coverImageUrl TEXT,
    author TEXT,
    status TEXT,
    views INTEGER DEFAULT 0,
    genreIds TEXT, -- JSON array
    slug TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    comicId TEXT NOT NULL,
    chapterNumber INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    slug TEXT NOT NULL,
    FOREIGN KEY(comicId) REFERENCES comics(id)
  );

  CREATE TABLE IF NOT EXISTS genres (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    is_approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: add is_approved column if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  const hasIsApproved = tableInfo.some(col => col.name === 'is_approved');
  if (!hasIsApproved) {
    db.exec('ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 1');
    console.log('Migration: added is_approved column to users table.');
  }
} catch (err) {
  console.error('Migration error:', err);
}

// Normalize database to NFC on startup
try {
  const comics = db.prepare('SELECT * FROM comics').all();
  for (const c of comics) {
    db.prepare('UPDATE comics SET title = ?, description = ?, author = ?, status = ?, genreIds = ? WHERE id = ?')
      .run(
        (c.title || '').normalize('NFC'),
        (c.description || '').normalize('NFC'),
        (c.author || '').normalize('NFC'),
        (c.status || '').normalize('NFC'),
        (c.genreIds || '').normalize('NFC'),
        c.id
      );
  }
  const chapters = db.prepare('SELECT * FROM chapters').all();
  for (const ch of chapters) {
    db.prepare('UPDATE chapters SET title = ?, content = ? WHERE id = ?')
      .run((ch.title || '').normalize('NFC'), (ch.content || '').normalize('NFC'), ch.id);
  }
  console.log('Database NFC normalization completed.');
} catch (err) {
  console.error('Error during DB NFC normalization:', err);
}

// Seed data if empty
const hasComics = db.prepare('SELECT COUNT(*) as count FROM comics').get();
if (hasComics.count === 0) {
  const insertComic = db.prepare('INSERT INTO comics (id, title, description, coverImageUrl, author, status, views, genreIds, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertChapter = db.prepare('INSERT INTO chapters (id, comicId, chapterNumber, title, content, slug) VALUES (?, ?, ?, ?, ?, ?)');
  const insertGenre = db.prepare('INSERT INTO genres (id, name, slug) VALUES (?, ?, ?)');
  
  const comicId = crypto.randomUUID();
  insertComic.run(comicId, 'Attack on Titan', 'Hành trình diệt Titan của Eren.', 'https://upload.wikimedia.org/wikipedia/vi/d/d6/Shingeki_no_Kyojin_manga_volume_1.jpg', 'Hajime Isayama', 'Completed', 100, JSON.stringify(['action', 'fantasy']), 'attack-on-titan');
  insertChapter.run(crypto.randomUUID(), comicId, 1, 'Chương 1: Khởi đầu', 'Nội dung chương 1...', 'chuong-1');
  
  insertGenre.run('action', 'Action', 'action');
  insertGenre.run('fantasy', 'Fantasy', 'fantasy');
}

module.exports = db;
