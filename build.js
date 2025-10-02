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
const MAX_WIDTH = 2200;        // Maximum width for web display
const TARGET_WIDTHS = [960, 1100, 1440, 2200];
const JPEG_QUALITY = 90;       // JPEG quality (85% = good balance of quality/size)
const WEBP_QUALITY = 80;       // WEBP quality
const AVIF_QUALITY = 75;       // AVIF quality (lower value ~ better compression)
const STRIP_METADATA = true;   // Remove EXIF data for privacy and smaller files

// Configuration
const config = {
    url: 'https://mijnrealiteit.nl/',
    name: 'mijnrealiteit',
    owner: 'Mike van Rossum',
    description: 'Mike\'s Photoblog',
    logo: '/static/logo.svg',
    domain: 'mijnrealiteit.nl'
};

// Directories
const RAW_ARTICLES = 'raw_articles';
const STATIC = 'static';
const BUILD = 'build';

// Image cache file
const IMAGE_CACHE_FILE = 'image-cache.json';
let IMAGE_CACHE = null; // in-memory cache loaded once per build

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
function generateLayout(title, content, bodyClass = '', canonicalUrl = '', socialMeta = {}, isHomepage = false) {
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
    <meta name="description" content="${meta.description}">
    <title>${title}</title>
    <link rel="alternate" href="${config.url}feed.xml" type="application/rss+xml" title="${config.description}">
    ${canonicalUrl ? `<link rel="canonical" href="${canonicalUrl}">` : ''}
    <link rel="stylesheet" href="/css/${cssFilename}">
    ${socialMetaTags}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
    <header id="site-header">
        <a href="/"><h2>${config.name}</h2></a>
        <a href="/"><img alt='mijnrealiteit logo' src="${config.logo}"></a>
    </header>
    <div id="main">
        <div id="content">
            ${content}
        </div>
    </div>
    ${isHomepage ? `<script>
    const contact = 'bW' + 'LQBN'.toLowerCase() + 'JlYWxpdGVpdEBtdnIubWU=';
    window.onload = () => {
      const link = document.getElementById('email')
      const emailAddress = atob(contact);
      link.href = 'mailto:' + emailAddress;
    }
  </script>` : ''}

</body>
</html>`;
}

// Utilities
function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
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

// Extract description from markdown content
function extractDescriptionFromMarkdown(markdownContent, title) {
    // Remove markdown syntax and HTML tags
    let cleanContent = markdownContent
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '') // Remove image syntax
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    // Find the first meaningful paragraph (skip empty or very short content)
    const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length > 0) {
        // Take the first meaningful sentence and clean it up
        let description = sentences[0].trim();
        
        // If description is too short, try to combine with second sentence
        if (description.length < 50 && sentences.length > 1) {
            description += '. ' + sentences[1].trim();
        }
        
        // Ensure description isn't too long (optimal for social media)
        if (description.length > 200) {
            description = description.substring(0, 197) + '...';
        }
        
        return description;
    }
    
    // Fallback: return title if no meaningful content found
    return title;
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
            const { attributes, body } = frontMatter(content);
            
            // Get article images for featured image fallback
            const articleDir = path.join(RAW_ARTICLES, dir);
            const files = fs.readdirSync(articleDir);
            const imageFiles = files.filter(file => 
                file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.gif')
            );
            
            // Extract first image from markdown content, fallback to first image file
            const firstImageFromContent = extractFirstImageFromMarkdown(body);
            const firstImage = firstImageFromContent || (imageFiles.length > 0 ? imageFiles[0] : null);
            
            // Get image metadata (size and dimensions) for each image
            const imageMetadata = imageFiles.map(imageFile => {
                const imagePath = path.join(articleDir, imageFile);
                try {
                    const stats = fs.statSync(imagePath);
                    return {
                        filename: imageFile,
                        size: stats.size,
                        // We'll get dimensions in the RSS generation since we need ImageMagick
                        path: imagePath
                    };
                } catch (error) {
                    return {
                        filename: imageFile,
                        size: 0,
                        path: imagePath
                    };
                }
            });
            
            articles.push({
                title: attributes.title,
                date: moment(attributes.date),
                slug: dir,
                url: `/articles/${dir}/`,
                featured: attributes.featured || false,
                description: extractDescriptionFromMarkdown(body, attributes.title),
                image: firstImage,
                images: imageFiles, // All images for multiple enclosures
                imageMetadata: imageMetadata // Image metadata for enclosures
            });
        }
    });
    
    // Sort by date (newest first)
    return articles.sort((a, b) => b.date - a.date);
}

// Generate multiple responsive variants (JPG, WEBP, AVIF) for an image
async function generateImageVariants(sourcePath, destDir, articleSlug, imageFileName) {
    try {
        // Load cache and return immediately if we already have variants (and not forcing)
        const cache = IMAGE_CACHE || loadImageCache();
        const cacheKey = getImageCacheKey(articleSlug, imageFileName);
        const cached = cache.images[cacheKey];
        if (!FORCE_OVERWRITE && cached && cached.variants && Object.keys(cached.variants).length > 0) {
            console.log(`\tSKIPPING variants ${articleSlug}/${imageFileName}`);
            const widths = Object.keys(cached.variants).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
            const largestWidth = widths.length ? widths[widths.length - 1] : (cached.original && cached.original.width) || 0;
            const largestJpg = widths.length ? cached.variants[largestWidth].jpg.filename : imageFileName;
            return { variants: cached.variants, largestWidth, largestJpgFilename: largestJpg };
        }

        // Proceed with generation path: now we may need filesystem and identify
        ensureDirExists(destDir);

        const { stdout } = await execAsync(`identify -format "%wx%h" "${sourcePath}"`);
        const [origWidth, origHeight] = stdout.trim().split('x').map(Number);

        // Determine target widths we can actually generate
        let widthsToGenerate = TARGET_WIDTHS.filter(w => w <= origWidth);
        if (widthsToGenerate.length === 0) {
            // If the original is smaller than the smallest target, just use original width once
            widthsToGenerate = [origWidth];
        }

        const baseName = path.parse(imageFileName).name; // without extension
        const variants = {};

        // If not forcing and cache already has all target widths and formats, skip entirely
        const cacheHasAllTargets = !FORCE_OVERWRITE && cached && cached.variants &&
            widthsToGenerate.every(w => cached.variants[w] && cached.variants[w].jpg && cached.variants[w].webp && cached.variants[w].avif);

        if (cacheHasAllTargets) {
            console.log(`\tSKIPPING variants ${articleSlug}/${imageFileName}`);
            const widths = Object.keys(cached.variants).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
            const largestWidth = widths.length ? widths[widths.length - 1] : origWidth;
            const largestJpg = widths.length ? cached.variants[largestWidth].jpg.filename : imageFileName;
            return { variants: cached.variants, largestWidth, largestJpgFilename: largestJpg };
        }

        let anyGenerated = false;
        for (const width of widthsToGenerate) {
            variants[width] = {};

            // JPG
            const jpgName = `${baseName}-${width}.jpg`;
            const jpgPath = path.join(destDir, jpgName);
            if (FORCE_OVERWRITE || !(cached && cached.variants && cached.variants[width] && cached.variants[width].jpg)) {
                const jpgCmd = `convert "${sourcePath}" -resize ${width}x -quality ${JPEG_QUALITY} ${STRIP_METADATA ? '-strip ' : ''}"${jpgPath}"`;
                console.log(`\tGENERATE JPG ${articleSlug}/${jpgName}`);
                await execAsync(jpgCmd);
                anyGenerated = true;
            }
            let jpgStats = null;
            let jpgDims = null;
            try {
                jpgStats = fs.statSync(jpgPath);
                jpgDims = await getImageDimensions(jpgPath);
            } catch (_) {
                // if generation was skipped but file not present (cache-only), we can't stat; rely on cache
            }
            variants[width].jpg = {
                filename: jpgName,
                size: (jpgStats && jpgStats.size) || (cached && cached.variants && cached.variants[width] && cached.variants[width].jpg && cached.variants[width].jpg.size) || 0,
                width: (jpgDims && jpgDims.width) || (cached && cached.variants && cached.variants[width] && cached.variants[width].jpg && cached.variants[width].jpg.width) || width,
                height: (jpgDims && jpgDims.height) || (cached && cached.variants && cached.variants[width] && cached.variants[width].jpg && cached.variants[width].jpg.height) || 0
            };

            // WEBP
            const webpName = `${baseName}-${width}.webp`;
            const webpPath = path.join(destDir, webpName);
            if (FORCE_OVERWRITE || !(cached && cached.variants && cached.variants[width] && cached.variants[width].webp)) {
                const webpCmd = `convert "${sourcePath}" -resize ${width}x -quality ${WEBP_QUALITY} ${STRIP_METADATA ? '-strip ' : ''}"${webpPath}"`;
                console.log(`\tGENERATE WEBP ${articleSlug}/${webpName}`);
                await execAsync(webpCmd);
                anyGenerated = true;
            }
            let webpStats = null;
            try { webpStats = fs.statSync(webpPath); } catch (_) {}
            variants[width].webp = {
                filename: webpName,
                size: (webpStats && webpStats.size) || (cached && cached.variants && cached.variants[width] && cached.variants[width].webp && cached.variants[width].webp.size) || 0
            };

            // AVIF
            const avifName = `${baseName}-${width}.avif`;
            const avifPath = path.join(destDir, avifName);
            if (FORCE_OVERWRITE || !(cached && cached.variants && cached.variants[width] && cached.variants[width].avif)) {
                const avifCmd = `convert "${sourcePath}" -resize ${width}x -quality ${AVIF_QUALITY} ${STRIP_METADATA ? '-strip ' : ''}"${avifPath}"`;
                console.log(`\tGENERATE AVIF ${articleSlug}/${avifName}`);
                await execAsync(avifCmd);
                anyGenerated = true;
            }
            let avifStats = null;
            try { avifStats = fs.statSync(avifPath); } catch (_) {}
            variants[width].avif = {
                filename: avifName,
                size: (avifStats && avifStats.size) || (cached && cached.variants && cached.variants[width] && cached.variants[width].avif && cached.variants[width].avif.size) || 0
            };
        }

        // Note: no explicit skip log here; skip handled by cacheHasAllTargets branch above

        // Decide whether to update cache and what to return
        if (anyGenerated) {
            const largestWidth = Math.max(...Object.keys(variants).map(n => parseInt(n, 10)));
            const largestJpg = variants[largestWidth].jpg;
            updateImageCacheWithVariants(articleSlug, imageFileName, destDir, { width: origWidth, height: origHeight }, variants, largestWidth, largestJpg.size);
            return { variants, largestWidth, largestJpgFilename: largestJpg.filename };
        } else {
            // Use cached variants for return without updating cache
            if (cached && cached.variants) {
                const widths = Object.keys(cached.variants).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
                const largestWidth = widths.length ? widths[widths.length - 1] : origWidth;
                const largestJpg = widths.length ? cached.variants[largestWidth].jpg.filename : imageFileName;
                return { variants: cached.variants, largestWidth, largestJpgFilename: largestJpg };
            }
            // No cache present, return computed variants (should not happen if skipped), no cache write
            const largestWidth = Math.max(...Object.keys(variants).map(n => parseInt(n, 10)));
            const largestJpg = variants[largestWidth] && variants[largestWidth].jpg ? variants[largestWidth].jpg.filename : imageFileName;
            return { variants, largestWidth, largestJpgFilename: largestJpg };
        }
    } catch (error) {
        console.error(`Error generating variants for ${articleSlug}/${imageFileName}:`, error.message);
        // Fallback: copy original as-is to destination directory
        const destOriginal = path.join(destDir, imageFileName);
        fs.copyFileSync(sourcePath, destOriginal);
        const stats = fs.statSync(destOriginal);
        const dims = await getImageDimensions(destOriginal);
        updateImageCache(articleSlug, imageFileName, destOriginal, dims, stats.size);
        return { variants: {}, largestWidth: dims.width, largestJpgFilename: imageFileName };
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
    const featuredArticles = articles.filter(article => article.featured);
    const featuredList = featuredArticles.map(article => `<li><a href="${article.url}">${article.date.format('YYYY-MM-DD')} - ${article.title}</a></li>`).join('');
    const articlesList = articles.map(article => `<li><a href="${article.url}">${article.date.format('YYYY-MM-DD')} - ${article.title}</a></li>`).join('');

    const mainContent = `
        <article class="article">
            <section class="content">${typogr.typogrify(aboutContent)}</section>
            ${featuredArticles.length > 0 ? `
            <section class="article-list">
                <h2 class='center'>highlights</h2>
                <nav>
                    <ul>
                        ${featuredList}
                    </ul>
                </nav>
            </section>
            ` : ''}
            <section class="article-list">
                <h2 class='center'>all stories</h2>
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
    }, true);
    
    fs.writeFileSync(path.join(BUILD, 'index.html'), html);
}

// Add class="text" to paragraphs that contain text, but not to image-only paragraphs
function addTextClassToParagraphs(html) {
    return html.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/g, (match, attrs = '', inner) => {
        const containsImageTag = /<(img|picture)\b/i.test(inner);
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

// Replace markdown <img> tags with <picture> using available variants from cache
function replaceImagesWithPicture(html, articleSlug) {
    return html.replace(/<img([^>]*?)src=("|')([^"'>]+)\2([^>]*)>/gi, (m, preAttrs, q, src, postAttrs) => {
        const altMatch = m.match(/alt=("|')([^\1]*?)\1/i);
        const altText = altMatch ? altMatch[2] : '';
        const imageFilename = src.split('?')[0];
        // Normalize to basename to match cache keys even if src includes paths
        const lookupFilename = path.basename(imageFilename);
        const cache = loadImageCache();
        const cacheKey = getImageCacheKey(articleSlug, lookupFilename);
        const cached = cache.images[cacheKey];
        if (!cached || !cached.variants) {
            // No variants known; keep original img tag
            const hasLoading = /\bloading=/.test(m);
            return hasLoading ? m : m.replace(/<img/i, '<img');
        }

        const widths = Object.keys(cached.variants).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
        const makeSrcSet = (fmt) => widths.map(w => `${cached.variants[w][fmt].filename} ${w}w`).join(', ');
        const maxW = Math.max(...widths);
        const largestJpg = cached.variants[maxW].jpg.filename;

        // Build sizes attribute capped by intrinsic max width to avoid upscaling
        const size768 = '100vw';
        const size1024 = Math.min(960, maxW) + 'px';
        const size1440 = Math.min(1100, maxW) + 'px';
        const sizeDefault = Math.min(1440, maxW) + 'px';
        const sizesAttr = `(max-width: 768px) ${size768}, (max-width: 1024px) ${size1024}, (max-width: 1440px) ${size1440}, ${sizeDefault}`;

        const picture = `
<picture>
  <source srcset="${makeSrcSet('avif')}" type="image/avif" sizes="${sizesAttr}">
  <source srcset="${makeSrcSet('webp')}" type="image/webp" sizes="${sizesAttr}">
  <img src="${largestJpg}" srcset="${makeSrcSet('jpg')}" sizes="${sizesAttr}" alt="${altText}">
</picture>`;
        return picture;
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
        
        // Process and copy article images (generate responsive variants first)
        const articleDir = path.join(RAW_ARTICLES, article.slug);
        const files = fs.readdirSync(articleDir);
        const imageFiles = files.filter(file => 
            file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.gif')
        );

        // Ensure destination directory exists
        const articleBuildDir = path.join(BUILD, 'articles', article.slug);
        if (!fs.existsSync(articleBuildDir)) {
            fs.mkdirSync(articleBuildDir, { recursive: true });
        }

        // Generate image variants and keep track of largest for meta
        const variantsByImage = {};
        for (const imageFile of imageFiles) {
            const sourcePath = path.join(articleDir, imageFile);
            const { variants, largestWidth, largestJpgFilename } = await generateImageVariants(sourcePath, articleBuildDir, article.slug, imageFile);
            variantsByImage[imageFile] = { variants, largestWidth, largestJpgFilename };
        }

        // Process markdown content
        const processedContent = marked.parse(body);
        // Replace <img> with <picture> based on cache/variants
        const withPictures = replaceImagesWithPicture(processedContent, article.slug);
        // Add class to text paragraphs (not image-only paragraphs)
        const withTextClasses = addTextClassToParagraphs(withPictures);
        // Apply typography improvements
        const finalContent = typogr.typogrify(withTextClasses);
        
        // Extract first image from markdown content for social media
        const firstImageFromContent = extractFirstImageFromMarkdown(body);
        const firstImage = firstImageFromContent || (imageFiles.length > 0 ? imageFiles[0] : null);

        // Extract description from markdown content
        const description = extractDescriptionFromMarkdown(body, article.title);

        // Determine best social image (largest JPG variant, max 2200)
        let socialImageFilename = firstImage || '';
        if (firstImage && variantsByImage[firstImage] && variantsByImage[firstImage].variants) {
            const widths = Object.keys(variantsByImage[firstImage].variants).map(n => parseInt(n, 10));
            if (widths.length > 0) {
                const largestW = Math.max(...widths);
                socialImageFilename = variantsByImage[firstImage].variants[largestW].jpg.filename;
            }
        }

        // Create social media metadata
        const socialMeta = {
            slug: article.slug,
            title: article.title,
            description: description,
            image: socialImageFilename,
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
                <p class="center"><a href="/">other stories</a></p>
            </footer>
        `;
        
        const html = generateLayout(`${article.title} - ${config.name}`, articleContent, 'article-detail', `${config.url}articles/${article.slug}/`, socialMeta, false);
        
        // Write article HTML
        fs.writeFileSync(path.join(articleBuildDir, 'index.html'), html);
    }
}

// Get image dimensions using ImageMagick
async function getImageDimensions(imagePath) {
    try {
        const { stdout } = await execAsync(`identify -format "%wx%h" "${imagePath}"`);
        const [width, height] = stdout.trim().split('x').map(Number);
        return { width, height };
    } catch (error) {
        return { width: 0, height: 0 };
    }
}

// Image dimension cache management
function loadImageCache() {
    try {
        if (fs.existsSync(IMAGE_CACHE_FILE)) {
            const cacheData = fs.readFileSync(IMAGE_CACHE_FILE, 'utf8');
            return JSON.parse(cacheData);
        }
    } catch (error) {
        console.warn('Warning: Could not load image cache, starting fresh:', error.message);
    }
    
    return {
        version: '2.0',
        lastUpdated: new Date().toISOString(),
        images: {}
    };
}

function saveImageCache(cache) {
    try {
        cache.lastUpdated = new Date().toISOString();
        fs.writeFileSync(IMAGE_CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (error) {
        console.error('Error saving image cache:', error.message);
    }
}

function getImageCacheKey(articleSlug, imageFilename) {
    return `articles/${articleSlug}/${imageFilename}`;
}

function getCachedImageDimensions(articleSlug, imageFilename) {
    const cache = IMAGE_CACHE || loadImageCache();
    const cacheKey = getImageCacheKey(articleSlug, imageFilename);
    const cachedImage = cache.images[cacheKey];
    
    if (!cachedImage) {
        return null;
    }
    
    return {
        width: cachedImage.width || (cachedImage.original && cachedImage.original.width) || 0,
        height: cachedImage.height || (cachedImage.original && cachedImage.original.height) || 0,
        size: cachedImage.size || 0
    };
}

function updateImageCache(articleSlug, imageFilename, imagePath, dimensions, fileSize) {
    const cache = IMAGE_CACHE || loadImageCache();
    const cacheKey = getImageCacheKey(articleSlug, imageFilename);
    
    try {
        let fileModified = new Date().toISOString();
        
        cache.images[cacheKey] = {
            ...(cache.images[cacheKey] || {}),
            width: dimensions.width,
            height: dimensions.height,
            size: fileSize,
            lastModified: fileModified,
            processed: true
        };
        
        IMAGE_CACHE = cache;
        saveImageCache(IMAGE_CACHE);
        console.log(`\tCACHED dimensions for ${articleSlug}/${imageFilename}`);
    } catch (error) {
        console.warn(`Warning: Could not update cache for ${imageFilename}:`, error.message);
    }
}

function updateImageCacheWithVariants(articleSlug, imageFilename, destDir, originalDimensions, variants, largestWidth, largestSize) {
    const cache = IMAGE_CACHE || loadImageCache();
    const cacheKey = getImageCacheKey(articleSlug, imageFilename);
    try {
        cache.images[cacheKey] = {
            versioned: true,
            original: originalDimensions,
            largestWidth,
            size: largestSize,
            lastModified: new Date().toISOString(),
            processed: true,
            variants
        };

        IMAGE_CACHE = cache;
        saveImageCache(IMAGE_CACHE);
        console.log(`\tCACHED variants for ${articleSlug}/${imageFilename}`);
    } catch (error) {
        console.warn(`Warning: Could not update variant cache for ${imageFilename}:`, error.message);
    }
}

// Generate RSS feed
async function generateRSSFeed() {
    console.log('Generating RSS feed...');
    
    const articles = getArticles();
    
    // Process image metadata for all articles using cache when possible
    const articlesWithMetadata = await Promise.all(articles.map(async (article) => {
        const processedImages = await Promise.all(article.imageMetadata.map(async (imageMeta) => {
            // Use cache dimensions only
            const cachedDimensions = getCachedImageDimensions(article.slug, imageMeta.filename);
            return {
                ...imageMeta,
                ...(cachedDimensions || { width: 0, height: 0, size: imageMeta.size || 0 })
            };
        }));
        
        // Select a single largest JPG variant based on the article's primary image
        const cache = IMAGE_CACHE || loadImageCache();
        let rssImage = null;
        if (article.image) {
            const key = getImageCacheKey(article.slug, article.image);
            const cached = cache.images[key];
            if (cached && cached.variants) {
                const widths = Object.keys(cached.variants).map(n => parseInt(n, 10));
                if (widths.length > 0) {
                    const w = Math.max(...widths);
                    const jpg = cached.variants[w].jpg;
                    rssImage = {
                        filename: jpg.filename,
                        width: jpg.width || w,
                        height: jpg.height || 0,
                        size: jpg.size || 0
                    };
                }
            }
        }
        // Fallback: pick the widest processed image if variants not found
        if (!rssImage && processedImages.length > 0) {
            const widest = processedImages.reduce((a, b) => (b.width || 0) > (a.width || 0) ? b : a, processedImages[0]);
            rssImage = {
                filename: widest.filename,
                width: widest.width || 0,
                height: widest.height || 0,
                size: widest.size || 0
            };
        }

        return {
            ...article,
            rssImage
        };
    }));
    
    const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
    <channel>
        <title>${config.name}</title>
        <link>${config.url}</link>
        <description>${config.description}</description>
        <language>en</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${articlesWithMetadata.map(article => `
        <item>
            <title>${article.title}</title>
            <link>${config.url}articles/${article.slug}/</link>
            <guid>${config.url}articles/${article.slug}/</guid>
            <pubDate>${article.date.toDate().toUTCString()}</pubDate>
            <description><![CDATA[${article.description}]]></description>
            <author>${config.owner}</author>
            ${article.rssImage ? `<media:content url="${config.url}articles/${article.slug}/${article.rssImage.filename}" type="image/jpeg" medium="image" fileSize="${article.rssImage.size || ''}"${article.rssImage.width > 0 ? ` width="${article.rssImage.width}" height="${article.rssImage.height}"` : ''} />` : ''}
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
        // Load image cache once into memory
        IMAGE_CACHE = loadImageCache();
        copyStaticAssets();
        buildMainPage();
        await buildArticles();
        await generateRSSFeed();
        
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

