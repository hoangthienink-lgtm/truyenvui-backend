const db = require('../config/db');

exports.getUsers = (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, role, is_approved, created_at FROM users ORDER BY created_at DESC').all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.approveUser = (req, res) => {
  try {
    const { id } = req.params;
    const info = db.prepare('UPDATE users SET is_approved = 1 WHERE id = ?').run(id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, message: 'User approved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUser = (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
