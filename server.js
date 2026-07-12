const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Setup server
const app = express();
const port = process.env.PORT || 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer storage for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const comicRoutes = require('./src/routes/comicRoutes');
const chapterRoutes = require('./src/routes/chapterRoutes');
const genreRoutes = require('./src/routes/genreRoutes');
const crawlRoutes = require('./src/routes/crawlRoutes');
const ttsRoutes = require('./src/routes/ttsRoutes');

app.use('/api/comics', comicRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/crawl', crawlRoutes);
app.use('/api/tts', ttsRoutes);

// Legacy File upload endpoint (kept for backward compatibility)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const host = req.get('host') || 'localhost:3001';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const url = `${protocol}://${host}/uploads/${req.file.filename}`;
  res.json({ id: req.file.filename, url: url });
});

// Start Server - bind to 0.0.0.0 for LAN access
app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
