const express = require('express');
const router = express.Router();
const comicController = require('../controllers/comicController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', comicController.getAllComics);
router.get('/:slug', comicController.getComicBySlug);
router.post('/:id/views', comicController.incrementComicViews);
router.delete('/:id', verifyToken, requireAdmin, comicController.deleteComic);

module.exports = router;
