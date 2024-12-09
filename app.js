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
    files.forEach(file => {
      if (file.endsWith('.html')) {
        const id = parseInt(file.split('.')[0]);
        const content = fs.readFileSync(path.join(BLOGS_DIR, file), 'utf8');
        // Extract title and preview from content using regex
        const titleMatch = content.match(/<h2 class="blog-post-title">(.*?)<\/h2>/);
        const metaMatch = content.match(/<div class="blog-post-meta">(.*?)<\/div>/);
        const previewMatch = content.match(/<div class="blog-post-content">(.*?)<\/div>/s);
        const tagsMatch = content.match(/<div class="blog-post-tags">(.*?)<\/div>/s);
        
        blogPosts.push({
          id,
          title: titleMatch ? titleMatch[1] : '',
          meta: metaMatch ? metaMatch[1] : '',
          preview: previewMatch ? previewMatch[1].substring(0, 150) + '...' : '',
          tags: tagsMatch ? tagsMatch[1] : ''
        });
      }
    });
    blogPosts.sort((a, b) => b.id - a.id); // Sort by newest first
  } catch (err) {
    console.error('Error loading blog posts:', err);
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

  const nextId = blogPosts.length > 0 ? Math.max(...blogPosts.map(p => p.id)) + 1 : 1;
  const date = new Date().toISOString().split('T')[0];
  const author = req.body.author || 'Anonymous';
  const tags = req.body.tags ? req.body.tags.split(',').map(tag => 
    `<span class="tag">${tag.trim()}</span>`
  ).join('\n') : '';

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
  ${fs.readFileSync('blogs/1.html', 'utf8').match(/<style>[\s\S]*?<\/style>/)[0]}
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

  <div class="blog-container">
    <article class="blog-post">
      <header class="blog-post-header">
        <h2 class="blog-post-title">${req.body.title}</h2>
        <div class="blog-post-meta">Posted by ${author} | ${date}</div>
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
      meta: `Posted by ${author} | ${date}`,
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

app.listen(5123, function () {
  console.log('Example app listening on port 5123!');
});