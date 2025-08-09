const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.FRONT_PORT || 3000;

// No templating engine needed; serve static HTML files

// Serve static assets from the shared static directory used by Flask
// This reuses the existing HTML, CSS and JS files without duplication
app.use('/', express.static(path.join(__dirname, '../static')));

// Routes for pages: serve the corresponding static HTML files from public directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/categories', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'categories.html'));
});

app.get('/sessions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sessions.html'));
});

app.get('/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'users.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Fallback: serve 404 page
app.use((req, res) => {
  res.status(404).send('Página no encontrada');
});

app.listen(PORT, () => {
  console.log(`Frontend server running on port ${PORT}`);
});