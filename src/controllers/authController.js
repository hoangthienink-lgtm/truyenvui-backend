const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'truyenvui_secret_key_2026';

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const id = crypto.randomUUID();

    // The first user registered will be an admin, subsequent users are normal users.
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const role = userCount === 0 ? 'admin' : 'user';
    const is_approved = role === 'admin' ? 1 : 0;

    db.prepare('INSERT INTO users (id, username, password_hash, role, is_approved) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, password_hash, role, is_approved);

    res.status(201).json({ success: true, message: 'User registered successfully', role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.is_approved === 0) {
      return res.status(403).json({ error: 'Tài khoản của bạn đang chờ Admin duyệt' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMe = (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
