const express = require('express');
const router = express.Router();
const comicController = require('../controllers/comicController');

router.get('/', comicController.getAllComics);
router.get('/:slug', comicController.getComicBySlug);
router.post('/:id/views', comicController.incrementComicViews);
router.delete('/:id', comicController.deleteComic);

module.exports = router;
