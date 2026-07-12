const express = require('express');
const router = express.Router();
const googleTTS = require('google-tts-api');
const https = require('https');
const http = require('http');

// POST /api/tts
// Body: { text: "...", lang: "vi", speed: 1 }
// Returns: audio/mpeg stream (concatenated from Google TTS chunks)
router.post('/', async (req, res) => {
  try {
    const { text, lang = 'vi', speed = 1 } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing "text" in request body' });
    }

    // Limit text length to avoid abuse
    const trimmedText = text.substring(0, 5000);

    // Get all audio URLs (auto-chunked by google-tts-api)
    const audioUrls = googleTTS.getAllAudioUrls(trimmedText, {
      lang,
      slow: speed < 1,
      host: 'https://translate.google.com',
    });

    // Set response headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Fetch and pipe each audio chunk sequentially
    const fetchAndPipe = (index) => {
      if (index >= audioUrls.length) {
        res.end();
        return;
      }

      const url = audioUrls[index].url;
      const protocol = url.startsWith('https') ? https : http;

      protocol.get(url, { 
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://translate.google.com/'
        }
      }, (audioRes) => {
        audioRes.on('data', (chunk) => {
          res.write(chunk);
        });
        audioRes.on('end', () => {
          fetchAndPipe(index + 1);
        });
        audioRes.on('error', () => {
          fetchAndPipe(index + 1);
        });
      }).on('error', () => {
        fetchAndPipe(index + 1);
      });
    };

    fetchAndPipe(0);

  } catch (err) {
    console.error('TTS Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate TTS audio' });
    }
  }
});

module.exports = router;
