# Mijnrealiteit Photoblog

This is all the code behind my photoblog [mijnrealiteit](https://mijnrealiteit.nl).

The idea is simple: if have a directory structure like so:

    /hello-world/
    	- index.md
    	- picture1.jpg
    	- picture2.jpg
    /hello-world/
    	- index.md
    	- picture1.jpg
    	- picture2.jpg

you'll get a blog with 2 posts.

All the static blog stuff happens by wintersmith, this repo therefor only contains:

- A wintersmith photoblog theme.
- A small script that uses imagemagick to convert all images into smaller versions.

## Creating a blog

Step 1: Create a `config.json` file like so:

	{
	  "locals": {
	    "url": "https://example.com/",
	    "name": "Your blog",
	    "owner": "Your name",
	    "description": "description",
	    "logo": "/logo.png",
	    "gacode": "your-ga-code",
	    "domain": "example.com"
	  },
	  "plugins": [
	    "./node_modules/wintersmith-articles-helper/"
	  ],
	  "require": {
	    "moment": "moment",
	    "_": "underscore",
	    "typogr": "typogr"
	  },
	  "jade": {
	    "pretty": false
	  },
	  "markdown": {
	    "smartLists": true,
	    "smartypants": true
	  },
	  "ignore": ["**/.DS_Store"]
	}

Step 2: put a logo at `contents/logo.png`  
Step 4: create a directory `raw_articles` and write your blog.  
Step 5: install all dependencies with:

    npm install
    npm install -g wintersmith
    
    # note this is MacOS specific:
    brew install imagemagick
    brew install graphicsmagick

Step 6: check out your blog:

    node convertContent
    wintersmith preview