require('dotenv').config();

var express = require('express');
var app = express();
var fs = require('fs');
const bodyParser = require('body-parser');
const path = require('path');
app.use(express.static('public'));
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Create a connection pool to the MySQL database
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'whoswifi'
});

// Add second connection pool for chance database
const chanceDb = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'chance',
});

// Test the connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to MySQL database');
  connection.release();
});

// Test the chance connection
chanceDb.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the chance database:', err);
    return;
  }
  console.log('Connected to Chance MySQL database');
  connection.release();
});

// Add this near the top with your other constants
const saltRounds = 10;

app.get('/register_page', function (req, res) {
  fs.readFile('registration.html', function (err, data) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    });
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;

  // Basic validation
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required' });
  }

  if (username.toLowerCase() === 'guest') {
    return res.json({ success: false, message: 'Username "Guest" is reserved' });
  }

  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      console.error('Hashing error:', err);
      return res.json({ success: false, message: 'Error processing registration' });
    }

    // First database operation
    db.getConnection((err, connection) => {
      if (err) {
        return res.json({ success: false, message: 'Database connection error' });
      }

      const userQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
      connection.query(userQuery, [username, hash], (err, results) => {
        connection.release();
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.json({ success: false, message: 'Username already exists' });
          }
          return res.json({ success: false, message: 'Database error' });
        }

        const userId = results.insertId; // Get the ID from the first insert

        // Only proceed to chance database after successful whoswifi insert
        chanceDb.getConnection((err, chanceConnection) => {
          if (err) {
            return res.json({ success: false, message: 'Chance database connection error' });
          }

          const chanceQuery = 'INSERT INTO user_data (whoswifi_id, username, color) VALUES (?, ?, ?)';
          chanceConnection.query(chanceQuery, [userId, username, 'white'], (err, results) => {
            chanceConnection.release();
            if (err) {
              console.error('Chance query error:', err);
              return res.json({ success: false, message: 'Error creating game data' });
            }
            
            res.json({ success: true, message: 'Registration successful!' });
          });
        });
      });
    });
  });
});

// Simplified login route with just username in JWT
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Check if the user exists
  const query = 'SELECT username, password FROM users WHERE username = ?';
  db.query(query, [username], (err, results) => {
    if (err) return res.json({ success: false, message: 'Database error' });
    if (results.length === 0) return res.json({ success: false, message: 'User not found' });

    const user = results[0];

    // Compare passwords
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        // Create a signed token with just username
        const token = jwt.sign({ 
          username: user.username
        }, process.env.JWT_SECRET, {
          expiresIn: '24h'
        });
        
        // Set cookie
        res.cookie('whoswifi', token, {
          domain: '.whoswifi.com',
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ 
          success: true, 
          username: user.username
        });
      } else {
        res.json({ success: false, message: 'Invalid password' });
      }
    });
  });
});

// Simplified verify token middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies.whoswifi;
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Simplified login check endpoint
app.get('/login/check', verifyToken, (req, res) => {
  res.json({
    loggedIn: true,
    username: req.username
  });
});

let blogPosts = [];
const BLOGS_DIR = path.join(__dirname, 'blogs');

function loadBlogPosts() {
  try {
    const files = fs.readdirSync(BLOGS_DIR);
    blogPosts = []; // Reset the array before loading
    files.forEach(file => {
      if (file.endsWith('.html') && file !== 'template.html') { // Ignore template file
        try {
          const id = parseInt(file.split('.')[0]);
          const content = fs.readFileSync(path.join(BLOGS_DIR, file), 'utf8');
          // Extract title and preview from content using regex
          const titleMatch = content.match(/<h2 class="blog-post-title">(.*?)<\/h2>/);
          const metaMatch = content.match(/<div class="blog-post-meta">(.*?)<\/div>/);
          const previewMatch = content.match(/<div class="blog-post-content">(.*?)<\/div>/s);
          const tagsMatch = content.match(/<div class="blog-post-tags">(.*?)<\/div>/s);
          
          if (titleMatch) { // Only add if the file is valid
            blogPosts.push({
              id,
              title: titleMatch[1],
              meta: metaMatch ? metaMatch[1] : '',
              preview: previewMatch ? previewMatch[1].substring(0, 150) + '...' : '',
              tags: tagsMatch ? tagsMatch[1] : ''
            });
          }
        } catch (fileErr) {
          console.error(`Error processing file ${file}:`, fileErr);
        }
      }
    });
    blogPosts.sort((a, b) => b.id - a.id); // Sort by newest first
  } catch (err) {
    console.error('Error loading blog posts:', err);
    blogPosts = []; // Ensure blogPosts is empty on error
  }
}

loadBlogPosts();

app.get('/', function (req, res) {
    fs.readFile('index.html', function (err, data) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        return res.end();
      });
});

app.get('/apps', function (req, res) {
  fs.readFile('apps.html', function (err, data) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    });
});

app.get('/blog', function (req, res) {
  fs.readFile('blog.html', 'utf8', function (err, data) {
    if (err) {
      res.status(500).send('Error loading blog page');
      return;
    }

    // Generate HTML for all blog posts
    const postsHTML = blogPosts.map(post => `
      <article class="blog-post" onclick="location.href='/blogs/${post.id}'">
        <header class="blog-post-header">
          <h2 class="blog-post-title">${post.title}</h2>
          <div class="blog-post-meta">${post.meta}</div>
        </header>
        <div class="blog-post-content">
          <div class="blog-post-preview">
            ${post.preview}
          </div>
        </div>
        <div class="blog-post-tags">
          ${post.tags}
        </div>
        <div class="post-actions">
          <button class="post-action-btn edit-btn" onclick="event.stopPropagation(); location.href='/blogs/${post.id}/edit'">[ EDIT ]</button>
          <form action="/blogs/${post.id}/delete" method="POST" style="display: inline;">
            <button type="submit" class="post-action-btn delete-btn" onclick="event.stopPropagation(); return confirm('Are you sure you want to delete this post?')">[ DELETE ]</button>
          </form>
        </div>
      </article>
    `).join('\n');

    // Replace the single post with all posts
    data = data.replace(
      /<div id="blog-posts">([\s\S]*?)<\/div>/,
      `<div id="blog-posts">${postsHTML}</div>`
    );

    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  });
});

app.get('/blogs/:id', function (req, res) {
  var id = req.params.id;
  fs.readFile(`blogs/${id}.html`, function (err, data) {
      if (err) {
        res.writeHead(404, {'Content-Type': 'text/html'});
        return res.end('Blog post not found');
      }
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    });
});

app.post('/create_post', function (req, res) {
  if (!req.body || !req.body.title || !req.body.content) {
    return res.status(400).send('Missing required fields');
  }

  // More robust ID generation
  const existingIds = blogPosts.map(post => post.id);
  const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

  const date = new Date().toISOString().split('T')[0];
  const author = req.body.author || 'Anonymous';
  const category = req.body.category || 'Uncategorized';
  const tags = req.body.tags ? req.body.tags.split(',').map(tag => 
    `<span class="tag">${tag.trim()}</span>`
  ).join('\n') : '';

  // Get the template style
  const templateStyle = fs.readFileSync(path.join(BLOGS_DIR, 'template.html'), 'utf8')
    .match(/<style>[\s\S]*?<\/style>/)[0]
    .replace(/text-shadow:.*?;/g, 'text-shadow: none;');

  // Create the blog post HTML
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${req.body.title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=VT323&display=swap" rel="stylesheet">
  ${templateStyle}
  <style>
    .blog-post-title, 
    .blog-post-header h2,
    h3 {
      color: var(--neon-text-color);
      text-shadow: none;
    }
  </style>
</head>
<body>
  <nav>
    <ul class="nav-links">
      <li><a href="/">Home</a></li>
      <li><a href="/apps">Apps</a></li>
      <li><a href="/blog">Blog</a></li>
      <li><a href="/shop">Shop</a></li>
      <li><a href="/about">About</a></li>
      <li><a href="/contact">Contact</a></li>
      <li><a href="/login">Login/Register</a></li>
    </ul>
  </nav>

  <div class="blog-container">
    <article class="blog-post">
      <header class="blog-post-header">
        <h2 class="blog-post-title">${req.body.title}</h2>
        <div class="blog-post-meta">Posted by ${author} | ${date} | Category: ${category}</div>
      </header>
      <div class="blog-post-content">
        ${req.body.content}
      </div>
      <div class="blog-post-tags">
        ${tags}
      </div>
    </article>
  </div>
</body>
</html>`;

  // Save the new blog post
  fs.writeFile(path.join(BLOGS_DIR, `${nextId}.html`), htmlContent, function(err) {
    if (err) {
      return res.status(500).send('Error saving blog post');
    }
    
    // Add to in-memory posts
    blogPosts.unshift({
      id: nextId,
      title: req.body.title,
      meta: `Posted by ${author} | ${date} | Category: ${category}`,
      preview: req.body.content.substring(0, 150) + '...',
      tags: tags
    });

    res.redirect('/blog');
  });
});

app.get('/shop', function (req, res) {
  fs.readFile('shop.html', function (err, data) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    });
});

app.get('/images/burp_training', function (req, res) {
  fs.readFile('images/burp_training.png', function (err, data) {
      res.writeHead(200, {'Content-Type': 'image/png'});
      res.write(data);
      return res.end();
    });
});

app.get('/images/source_code', function (req, res) {
  fs.readFile('images/source_code.png', function (err, data) {
      res.writeHead(200, {'Content-Type': 'image/png'});
      res.write(data);
      return res.end();
    });
});

app.get('/images/reporting', function (req, res) {
  fs.readFile('images/reporting.png', function (err, data) {
      res.writeHead(200, {'Content-Type': 'image/png'});
      res.write(data);
      return res.end();
    });
});

app.get('/images/coming_soon', function (req, res) {
  fs.readFile('images/coming_soon.png', function (err, data) {
      res.writeHead(200, {'Content-Type': 'image/png'});
      res.write(data);
      return res.end();
    });
});

app.get('/about', function (req, res) {
  fs.readFile('about.html', function (err, data) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    });
});

app.get('/contact', function (req, res) {
  fs.readFile('contact.html', function (err, data) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    });
});

app.get('/login', function (req, res) {
  fs.readFile('login.html', function (err, data) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    });
});

// Get edit form for a blog post
app.get('/blogs/:id/edit', function (req, res) {
  const id = req.params.id;
  const filePath = path.join(BLOGS_DIR, `${id}.html`);
  
  fs.readFile(filePath, 'utf8', function (err, data) {
    if (err) {
      return res.status(404).send('Blog post not found');
    }

    // Improved content extraction with better regex patterns
    const titleMatch = data.match(/<h2 class="blog-post-title">([\s\S]*?)<\/h2>/);
    const metaMatch = data.match(/<div class="blog-post-meta">([\s\S]*?)<\/div>/);
    const contentMatch = data.match(/<div class="blog-post-content">([\s\S]*?)<\/div>\s*<div class="blog-post-tags">/);
    const tagsMatch = data.match(/<span class="tag">([\s\S]*?)<\/span>/g);
    const categoryMatch = metaMatch && metaMatch[1].match(/Category: (.*?)(?:\||$)/);
    
    const title = titleMatch ? titleMatch[1].trim() : '';
    const content = contentMatch ? contentMatch[1].trim() : '';
    const category = categoryMatch ? categoryMatch[1].trim() : '';
    const tags = tagsMatch 
      ? tagsMatch.map(tag => tag.match(/<span class="tag">(.*?)<\/span>/)[1]).join(', ')
      : '';

    // Send edit form HTML with preserved content
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Edit Post - ${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=VT323&display=swap" rel="stylesheet">
        ${data.match(/<style>[\s\S]*?<\/style>/)[0]}
        <style>
          .edit-form {
            max-width: 900px;
            margin: 2rem auto;
            padding: 2rem;
          }
          .form-group { margin-bottom: 1.5rem; }
          .form-group label { display: block; margin-bottom: 0.5rem; }
          .form-group input, .form-group textarea {
            width: 100%;
            background: rgba(100, 255, 218, 0.1);
            border: 1px solid var(--neon-text-color);
            color: var(--neon-text-color);
            padding: 0.5rem;
            font-family: 'Share Tech Mono', monospace;
          }
          .form-group textarea { 
            min-height: 300px; 
            resize: vertical;
            white-space: pre-wrap;
          }
          .button-group { display: flex; gap: 1rem; }
        </style>
      </head>
      <body>
        <nav>
          <ul class="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/apps">Apps</a></li>
            <li><a href="/blog">Blog</a></li>
            <li><a href="/shop">Shop</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/login">Login/Register</a></li>
          </ul>
        </nav>
        <div class="edit-form">
          <form id="edit-form" action="/blogs/${id}/update" method="POST">
            <div class="form-group">
              <label for="title">Title:</label>
              <input type="text" id="title" name="title" value="${title}" required>
            </div>
            <div class="form-group">
              <label for="category">Category:</label>
              <input type="text" id="category" name="category" value="${category}">
            </div>
            <div class="form-group">
              <label for="content">Content:</label>
              <textarea id="content" name="content" required>${content}</textarea>
            </div>
            <div class="form-group">
              <label for="tags">Tags (comma separated):</label>
              <input type="text" id="tags" name="tags" value="${tags}">
            </div>
            <div class="button-group">
              <button type="submit" class="new-post-btn">[ UPDATE ]</button>
              <button type="button" class="new-post-btn" onclick="location.href='/blog'">[ CANCEL ]</button>
            </div>
          </form>
        </div>
      </body>
      </html>
    `);
  });
});

// Update the update route as well to properly handle the content
app.post('/blogs/:id/update', function (req, res) {
  const id = req.params.id;
  if (!req.body || !req.body.title || !req.body.content) {
    return res.status(400).send('Missing required fields');
  }

  const filePath = path.join(BLOGS_DIR, `${id}.html`);
  
  // Read the template file to get the structure
  fs.readFile(TEMPLATE_PATH, 'utf8', (err, template) => {
    if (err) {
      return res.status(500).send('Error updating post');
    }

    // Create the updated content
    const updatedContent = template
      .replace(/<title>.*?<\/title>/, `<title>${req.body.title}</title>`)
      .replace(/<h2 class="blog-post-title">.*?<\/h2>/, `<h2 class="blog-post-title">${req.body.title}</h2>`)
      .replace(/<div class="blog-post-meta">.*?<\/div>/, `<div class="blog-post-meta">Posted by WhosWiFi | ${new Date().toISOString().split('T')[0]} (Updated) | Category: ${req.body.category || 'Uncategorized'}</div>`)
      .replace(/<div class="blog-post-content">[\s\S]*?<\/div>\s*<div class="blog-post-tags">/, `<div class="blog-post-content">${req.body.content}</div><div class="blog-post-tags">`)
      .replace(/<div class="blog-post-tags">[\s\S]*?<\/div>/, `<div class="blog-post-tags">${
        req.body.tags ? req.body.tags.split(',').map(tag => `<span class="tag">${tag.trim()}</span>`).join('\n') : ''
      }</div>`);

    // Save the updated file
    fs.writeFile(filePath, updatedContent, function(err) {
      if (err) {
        return res.status(500).send('Error saving updated blog post');
      }
      
      // Update in-memory posts
      loadBlogPosts();
      res.redirect('/blog');
    });
  });
});

// Delete a blog post
app.post('/blogs/:id/delete', function (req, res) {
  const id = req.params.id;
  const filePath = path.join(BLOGS_DIR, `${id}.html`);

  fs.unlink(filePath, function(err) {
    if (err) {
      return res.status(500).send('Error deleting blog post');
    }

    // Remove from in-memory posts
    blogPosts = blogPosts.filter(post => post.id !== parseInt(id));
    res.redirect('/blog');
  });
});

// Add new route for IP lookup
app.get('/ip', function (req, res) {
  fs.readFile('ip.html', function (err, data) {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html'});
      return res.end('IP lookup not found');
    }
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  });
});

app.get('/api/ip', function (req, res) {
  const ipv4 = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress?.replace(/^::ffff:/, '');

  res.json({
    ipv4: ipv4,
  });
});

app.get('/tetris', function (req, res) {
  fs.readFile('tetris.html', function (err, data) {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html'});
      return res.end('Tetris not found');
    }
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  });
});

app.get('/chess', function (req, res) {
  fs.readFile('chess.html', function (err, data) {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html'});
      return res.end('Chess not found');
    }
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  });
});

app.get('/puzzle', function (req, res) {
  fs.readFile('puzzle.html', function (err, data) {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html'});
      return res.end('Puzzle game not found');
    }
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  });
});

app.get('chance_user', (req, res) => {
  if (req.session && req.session.userId && req.session.username) {
    res.json({
      loggedIn: true,
      username: req.session.username
    });
  } else {
    res.json({
      loggedIn: false
    });
  }
});

app.listen(5123, function () {
  console.log('Example app listening on port 5123!');
});