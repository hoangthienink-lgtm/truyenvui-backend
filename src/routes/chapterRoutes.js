const express = require('express');
const router = express.Router();
const chapterController = require('../controllers/chapterController');

router.get('/', chapterController.getChapters);
router.get('/:comicId/:chapterSlug', chapterController.getChapterBySlug);

module.exports = router;
