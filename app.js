var express = require('express');
var app = express();
var fs = require('fs');
const bodyParser = require('body-parser');
const path = require('path');
app.use(bodyParser.urlencoded({ extended: true }));

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

app.get('/images/monopoly_dollar', function (req, res) {
  fs.readFile('images/monopoly_dollar.png', function (err, data) {
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
            <li><a href="/apps">Apps</a></li>
            <li><a href="/blog">Blog</a></li>
            <li><a href="#shop">Shop</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
            <li><a href="#login">Login/Register</a></li>
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

app.listen(5123, function () {
  console.log('Example app listening on port 5123!');
});