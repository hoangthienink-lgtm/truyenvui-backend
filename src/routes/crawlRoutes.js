const express = require('express');
const router = express.Router();
const crawlController = require('../controllers/crawlController');

router.post('/', crawlController.crawlNovel);

module.exports = router;
