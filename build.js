#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const marked = require('marked');
const frontMatter = require('front-matter');
const moment = require('moment');
const typogr = require('typogr');
const _ = require('underscore');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE_OVERWRITE = args.includes('--force') || args.includes('-f');

// Image processing settings for photography blog
const MAX_WIDTH = 2000;        // Maximum width for web display
const JPEG_QUALITY = 85;       // JPEG quality (85% = good balance of quality/size)
const STRIP_METADATA = true;   // Remove EXIF data for privacy and smaller files
const THUMB_WIDTH = 200;       // Width for generated thumbnails

// Configuration
const config = {
    url: 'https://mijnrealiteit.nl/',
    name: 'mijnrealiteit',
    owner: 'Mike van Rossum',
    description: 'Photoblog',
    logo: '/static/logo.svg',
    domain: 'mijnrealiteit.nl'
};

// Directories
const RAW_ARTICLES = 'raw_articles';
const STATIC = 'static';
const BUILD = 'build';

// Global variable to store the CSS filename with hash
let cssFilename = 'main.css';

// Ensure build directory exists
if (!fs.existsSync(BUILD)) {
    fs.mkdirSync(BUILD, { recursive: true });
}

// Copy static assets
function copyStaticAssets() {
    console.log('Copying static assets...');
    
    // Clean up old CSS files first
    const cssDir = path.join(BUILD, 'css');
    const existingFiles = fs.readdirSync(cssDir);
    existingFiles.forEach(file => {
        if (file.startsWith('main-') && file.endsWith('.css') || file === 'main.css') {
            const oldCssPath = path.join(cssDir, file);
            fs.unlinkSync(oldCssPath);
            console.log(`Removed old CSS: ${file}`);
        }
    });

    // Copy CSS with hash-based filename
    if (!fs.existsSync(path.join(BUILD, 'css'))) {
        fs.mkdirSync(path.join(BUILD, 'css'), { recursive: true });
    }
    
    const cssSource = path.join(STATIC, 'css/main.css');
    if (fs.existsSync(cssSource)) {
        // Read CSS content and generate hash
        const cssContent = fs.readFileSync(cssSource, 'utf8');
        const hash = crypto.createHash('md5').update(cssContent).digest('hex').substring(0, 8);
        cssFilename = `main-${hash}.css`;
        
        const cssDest = path.join(BUILD, 'css', cssFilename);
        fs.copyFileSync(cssSource, cssDest);
        console.log(`CSS copied as ${cssFilename}`);
    }
    
    // Copy fonts
    if (fs.existsSync(path.join(STATIC, 'fonts'))) {
        if (!fs.existsSync(path.join(BUILD, 'fonts'))) {
            fs.mkdirSync(path.join(BUILD, 'fonts'), { recursive: true });
        }
        const fontFiles = fs.readdirSync(path.join(STATIC, 'fonts'));
        fontFiles.forEach(file => {
            fs.copyFileSync(
                path.join(STATIC, 'fonts', file),
                path.join(BUILD, 'fonts', file)
            );
        });
    }
    
    // Copy static files (logo.svg, favicon.ico)
    if (fs.existsSync(path.join(STATIC, 'logo.svg'))) {
        if (!fs.existsSync(path.join(BUILD, 'static'))) {
            fs.mkdirSync(path.join(BUILD, 'static'), { recursive: true });
        }
        fs.copyFileSync(
            path.join(STATIC, 'logo.svg'),
            path.join(BUILD, 'static', 'logo.svg')
        );
    }
    
    // Copy favicon
    if (fs.existsSync(path.join(STATIC, 'favicon.ico'))) {
        fs.copyFileSync(path.join(STATIC, 'favicon.ico'), path.join(BUILD, 'favicon.ico'));
    }
}

// Generate HTML for the main layout
function generateLayout(title, content, bodyClass = '', canonicalUrl = '', socialMeta = {}) {
    // Default social media metadata
    const defaultMeta = {
        title: title,
        description: config.description,
        image: config.logo,
        url: canonicalUrl || config.url,
        type: 'website',
        siteName: config.name
    };
    
    // Merge with provided social media metadata
    const meta = { ...defaultMeta, ...socialMeta };
    
    // Generate Open Graph and Twitter meta tags
    const socialMetaTags = `
    <meta property="og:type" content="${meta.type}">
    <meta property="og:url" content="${meta.url}">
    <meta property="og:title" content="${meta.title}">
    <meta property="og:description" content="${meta.description}">
    <meta property="og:image" content="${meta.image.startsWith('http') ? meta.image : (meta.type === 'article' ? meta.url + meta.image : config.url + meta.image.replace(/^\//, ''))}">
    <meta property="og:site_name" content="${meta.siteName}">
    <meta property="og:locale" content="en_US">

    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${meta.url}">
    <meta property="twitter:title" content="${meta.title}">
    <meta property="twitter:description" content="${meta.description}">
    <meta property="twitter:image" content="${meta.image.startsWith('http') ? meta.image : (meta.type === 'article' ? meta.url + meta.image : config.url + meta.image.replace(/^\//, ''))}">`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <meta name="viewport" content="width=device-width">
    <title>${title}</title>
    <link rel="alternate" href="${config.url}feed.xml" type="application/rss+xml" title="${config.description}">
    ${canonicalUrl ? `<link rel="canonical" href="${canonicalUrl}">` : ''}
    <link rel="stylesheet" href="/css/${cssFilename}">
    ${socialMetaTags}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
    <header id="site-header">
        <a href="/"><h2>${config.name}</h2></a>
        <a href="/"><img src="${config.logo}"></a>
    </header>
    <div id="main">
        <div id="content">
            ${content}
        </div>
    </div>
    <script>
    const contact = 'bW' + 'LQBN'.toLowerCase() + 'JlYWxpdGVpdEBtdnIubWU=';
    window.onload = () => {
      const link = document.getElementById('email')
      const emailAddress = atob(contact);
      link.href = 'mailto:' + emailAddress;
    }
  </script>

</body>
</html>`;
}

// Extract the first image that appears in markdown content
function extractFirstImageFromMarkdown(markdownContent) {
    // Look for markdown image syntax: ![alt text](image.jpg)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [];
    let match;
    
    while ((match = imageRegex.exec(markdownContent)) !== null) {
        matches.push({
            alt: match[1],
            filename: match[2]
        });
    }
    
    // Return the first image found, or null if none
    return matches.length > 0 ? matches[0].filename : null;
}

// Generate navigation from articles
function generateNavigation() {
    const articles = getArticles();
    return articles.map(article => 
        `<li><a href="${article.url}">${article.title}</a></li>`
    ).join('');
}

// Get all articles sorted by date
function getArticles() {
    const articles = [];
    const articleDirs = fs.readdirSync(RAW_ARTICLES).filter(name => {
        const fullPath = path.join(RAW_ARTICLES, name);
        return fs.statSync(fullPath).isDirectory();
    });
    
    articleDirs.forEach(dir => {
        const indexPath = path.join(RAW_ARTICLES, dir, 'index.md');
        if (fs.existsSync(indexPath)) {
            const content = fs.readFileSync(indexPath, 'utf8');
            const { attributes } = frontMatter(content);
            articles.push({
                title: attributes.title,
                date: moment(attributes.date),
                slug: dir,
                url: `/articles/${dir}/`
            });
        }
    });
    
    // Sort by date (newest first)
    return articles.sort((a, b) => b.date - a.date);
}

// Process a single image with compression and resizing
async function processImage(sourcePath, targetPath, articleName, imageFileName) {
    try {
        // Check if already processed (unless force overwrite is enabled)
        if (!FORCE_OVERWRITE && fs.existsSync(targetPath)) {
            console.log(`\tSKIPPING ${articleName}/${imageFileName}`);
            return;
        }

        // Get image dimensions using ImageMagick
        const { stdout } = await execAsync(`identify -format "%w" "${sourcePath}"`);
        const width = parseInt(stdout.trim());
        
        if (width < MAX_WIDTH) {
            // Image is small enough, just copy
            console.log(`\tCOPYING ${articleName} ${imageFileName}`);
            fs.copyFileSync(sourcePath, targetPath);
        } else {
            // Resize image with better quality for photography
            console.log(`\tRESIZING ${articleName} ${imageFileName}`);
            const resizeCmd = `convert "${sourcePath}" -resize ${MAX_WIDTH}x -quality ${JPEG_QUALITY}`;
            const finalCmd = STRIP_METADATA ? `${resizeCmd} -strip` : resizeCmd;
            await execAsync(`${finalCmd} "${targetPath}"`);
        }
    } catch (error) {
        console.error(`Error processing ${imageFileName}:`, error.message);
        // Fallback: just copy the file
        console.log(`\tFALLBACK: copying ${articleName} ${imageFileName}`);
        fs.copyFileSync(sourcePath, targetPath);
    }
}

// Create thumbnail from the first image in an article
async function createThumbnail(sourcePath, articleName) {
    try {
        const thumbnailsDir = path.join(BUILD, 'thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
            fs.mkdirSync(thumbnailsDir, { recursive: true });
        }
        
        const thumbDest = path.join(thumbnailsDir, `${articleName}-thumb.jpg`);

        // Skip if exists unless forcing overwrite
        if (!FORCE_OVERWRITE && fs.existsSync(thumbDest)) {
            console.log(`\tSKIPPING thumbnail ${articleName}-thumb.jpg`);
            return;
        }

        console.log(`\tCREATING thumbnail ${articleName}-thumb.jpg`);
        const thumbCmd = `convert "${sourcePath}" -resize ${THUMB_WIDTH}x -quality ${JPEG_QUALITY} ${STRIP_METADATA ? '-strip ' : ''}"${thumbDest}"`;
        await execAsync(thumbCmd);
    } catch (thumbErr) {
        console.error(`\tError creating thumbnail for ${articleName}:`, thumbErr.message);
    }
}

// Build the main page
function buildMainPage() {
    console.log('Building main page...');
    
    const aboutContent = `<div class="about">
        <p>${typogr.typogrify("I'm Mike and sometimes I take pictures. My journey led met from Holland through Asia, and this captures a part of that journey.")}</p>
        <p><a id='email' href="#">Contact me</a>.</p>
    </div>`;

    const articles = getArticles();
    const articlesList = articles.map(article => `<li><a href="${article.url}">${article.date.format('YYYY-MM-DD')} - ${article.title}</a></li>`).join('');

    const mainContent = `
        <article class="article">
            <section class="content">${typogr.typogrify(aboutContent)}</section>
            <section class="article-list">
                <h2 class='center'>Photos</h2>
                <nav>
                    <ul>
                        ${articlesList}
                    </ul>
                </nav>
            </section>
        </article>`;
    const html = generateLayout(config.name, mainContent, '', `${config.url}`, {
        title: config.name,
        description: config.description,
        image: config.logo,
        type: 'website',
        url: config.url
    });
    
    fs.writeFileSync(path.join(BUILD, 'index.html'), html);
}

// Add class="text" to paragraphs that contain text, but not to image-only paragraphs
function addTextClassToParagraphs(html) {
    return html.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/g, (match, attrs = '', inner) => {
        const containsImageTag = /<img\b/i.test(inner);
        const strippedInnerText = inner.replace(/<[^>]*>/g, '').trim();
        const isImageOnlyParagraph = containsImageTag && strippedInnerText.length === 0;

        if (isImageOnlyParagraph) {
            if (attrs && /\bclass\s*=/.test(attrs)) {
                const newAttrs = attrs.replace(/class=("|')(.*?)(\1)/, (m, q, cls) => `class=${q}${cls} center${q}`);
                return `<p${newAttrs}>${inner}</p>`;
            }
            return `<p class="center"${attrs}>${inner}</p>`;
        }

        if (attrs && /\bclass\s*=/.test(attrs)) {
            // Append to existing class attribute
            const newAttrs = attrs.replace(/class=("|')(.*?)(\1)/, (m, q, cls) => `class=${q}${cls} text${q}`);
            return `<p${newAttrs}>${inner}</p>`;
        }

        // Insert new class attribute
        return `<p class="text"${attrs}>${inner}</p>`;
    });
}

// Build individual articles
async function buildArticles() {
    console.log('Building articles...');
    
    const articles = getArticles();
    
    for (const article of articles) {
        console.log(`  Building ${article.slug}...`);
        
        const indexPath = path.join(RAW_ARTICLES, article.slug, 'index.md');
        const content = fs.readFileSync(indexPath, 'utf8');
        const { body } = frontMatter(content);
        
        // Process markdown content
        const processedContent = marked.parse(body);

        // Add class to text paragraphs (not image-only paragraphs)
        const withTextClasses = addTextClassToParagraphs(processedContent);
        
        // Apply typography improvements
        const finalContent = typogr.typogrify(withTextClasses);
        
        // Process and copy article images
        const articleDir = path.join(RAW_ARTICLES, article.slug);
        const files = fs.readdirSync(articleDir);
        const imageFiles = files.filter(file => 
            file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.gif')
        );
        
        // Extract first image from markdown content for social media
        const firstImageFromContent = extractFirstImageFromMarkdown(body);
        const firstImage = firstImageFromContent || (imageFiles.length > 0 ? imageFiles[0] : null);
        
        // Create social media metadata
        const socialMeta = {
            slug: article.slug,
            title: article.title,
            description: article.title, // You could extract a description from the content if needed
            image: firstImage,
            type: 'article',
            url: `${config.url}articles/${article.slug}/`
        };
        
        // Generate article HTML with social media metadata
        const articleContent = `
            <h1 class="text">${article.title}</h1>
            <p class="date text">${article.date.format('MMMM DD, YYYY')}</p>
            <article class="article">
                <section class="content">
                    ${finalContent}
                </section>
            </article>
            <footer class="article-footer text">
                <p class="center"><a href="/">more photos</a></p>
            </footer>
        `;
        
        const html = generateLayout(`${article.title} - ${config.name}`, articleContent, 'article-detail', `${config.url}articles/${article.slug}/`, socialMeta);
        
        // Create article directory in build
        const articleBuildDir = path.join(BUILD, 'articles', article.slug);
        if (!fs.existsSync(articleBuildDir)) {
            fs.mkdirSync(articleBuildDir, { recursive: true });
        }
        
        // Write article HTML
        fs.writeFileSync(path.join(articleBuildDir, 'index.html'), html);
        
        // Process and copy article images
        for (const imageFile of imageFiles) {
            const sourcePath = path.join(articleDir, imageFile);
            const destPath = path.join(articleBuildDir, imageFile);
            await processImage(sourcePath, destPath, article.slug, imageFile);
        }

        // Create thumbnail if images were found
        if (imageFiles.length > 0) {
            const firstImagePath = path.join(articleBuildDir, imageFiles[0]);
            await createThumbnail(firstImagePath, article.slug);
        }
    }
}

// Generate RSS feed
function generateRSSFeed() {
    console.log('Generating RSS feed...');
    
    const articles = getArticles();
    const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>${config.name}</title>
        <link>${config.url}</link>
        <description>${config.description}</description>
        <language>en</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${articles.map(article => `
        <item>
            <title>${article.title}</title>
            <link>${config.url}articles/${article.slug}/</link>
            <guid>${config.url}articles/${article.slug}/</guid>
            <pubDate>${article.date.toDate().toUTCString()}</pubDate>
        </item>`).join('')}
    </channel>
</rss>`;
    
    fs.writeFileSync(path.join(BUILD, 'feed.xml'), rssContent);
}

// Main build function
async function build() {
    console.log('Starting build process...');
    if (FORCE_OVERWRITE) {
        console.log('⚠️  FORCE OVERWRITE mode enabled - all images will be reprocessed');
    }
    
    try {
        copyStaticAssets();
        buildMainPage();
        await buildArticles();
        generateRSSFeed();
        
        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Run build if this script is executed directly
if (require.main === module) {
    build();
}

module.exports = { build, generateLayout, getArticles };

