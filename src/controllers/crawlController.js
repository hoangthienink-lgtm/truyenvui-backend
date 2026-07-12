const crawlerService = require('../services/crawlerService');

exports.crawlNovel = async (req, res) => {
  const { url, crawlNextCount = 1 } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const result = await crawlerService.crawlNovelAndChapters(url.trim(), Number(crawlNextCount));
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Crawl Error:', err);
    res.status(500).json({ error: err.message });
  }
};
