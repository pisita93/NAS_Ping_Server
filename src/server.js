require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { DATA_DIR } = require('./db');
const routes = require('./routes');
const scheduler = require('./scheduler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(routes);

app.use((err, req, res, next) => {
  console.error('[server] error:', err);
  res.status(500).send('Internal server error');
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on :${PORT}`);
  scheduler.start();
});
