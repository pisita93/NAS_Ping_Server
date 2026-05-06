const bcrypt = require('bcryptjs');
const { db } = require('./db');

function findUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function verifyLogin(username, password) {
  const user = findUser(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return { id: user.id, username: user.username };
}

function changePassword(userId, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.method === 'GET') return res.redirect('/login');
  return res.status(401).send('Unauthorized');
}

module.exports = { verifyLogin, changePassword, requireAuth };
