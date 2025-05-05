const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3000;

// Setup database
const db = new sqlite3.Database('./data.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original TEXT,
    short TEXT UNIQUE,
    clicks INTEGER DEFAULT 0,
    user_id INTEGER
  )`);
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: 'super-secret',
  resave: false,
  saveUninitialized: true
}));

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// Serve HTML page routes
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Root route
app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  return res.redirect('/dashboard');
});

// Register user
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed], function (err) {
    if (err) {
      return res.send('Username sudah digunakan. <a href="/register">Kembali</a>');
    }
    res.redirect('/login');
  });
});

// Login user
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.send('Login gagal. <a href="/login">Coba lagi</a>');
    }
    req.session.userId = user.id;
    res.redirect('/dashboard');
  });
});

// Dashboard page
app.get('/dashboard', requireLogin, (req, res) => {
  db.all("SELECT * FROM links WHERE user_id = ?", [req.session.userId], (err, links) => {
    let html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Dashboard</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
      <div class="container">
        <h2>Dashboard</h2>
        <form method="POST" action="/generate">
          <input name="original" type="url" placeholder="Masukkan link asli" required />
          <button type="submit">Generate Link</button>
        </form>
        <h3>Link Anda:</h3>
        <ul>
    `;
    for (let link of links) {
      html += `<li><a href="/${link.short}" target="_blank">/${link.short}</a> → ${link.original} (${link.clicks} klik)</li>`;
    }
    html += `
        </ul>
        <a href="/logout">Logout</a>
      </div>
      </body>
      </html>
    `;
    res.send(html);
  });
});

// Generate short link
app.post('/generate', requireLogin, (req, res) => {
  const original = req.body.original;
  const generateShort = () => Math.random().toString(36).substring(2, 8);
  const short = generateShort();

  db.get("SELECT * FROM links WHERE short = ?", [short], (err, row) => {
    if (row) {
      return res.redirect('/dashboard'); // Avoid duplicate short
    }

    db.run("INSERT INTO links (original, short, user_id) VALUES (?, ?, ?)",
      [original, short, req.session.userId],
      err => {
        if (err) return res.send('Gagal membuat link.');
        res.redirect('/dashboard');
      });
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Redirect from short link
app.get('/:short', (req, res) => {
  db.get("SELECT * FROM links WHERE short = ?", [req.params.short], (err, row) => {
    if (!row) return res.status(404).send('Link tidak ditemukan');
    db.run("UPDATE links SET clicks = clicks + 1 WHERE id = ?", [row.id]);
    res.redirect(row.original);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
