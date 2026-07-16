const express = require('express');
const router = express.Router();
const crawlController = require('../controllers/crawlController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.post('/', verifyToken, requireAdmin, crawlController.crawlNovel);

module.exports = router;
