const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, requireAdmin, userController.getUsers);
router.put('/:id/approve', verifyToken, requireAdmin, userController.approveUser);
router.delete('/:id', verifyToken, requireAdmin, userController.deleteUser);

module.exports = router;
