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
	    "pretty": true
	  },
	  "markdown": {
	    "smartLists": true,
	    "smartypants": true
	  },
	  "ignore": ["**/.DS_Store"]
	}

Step 2: put a logo at `contents/logo.png`  
Step 4: create a directory `raw_articles` and write your blog.  
Step 5: Add a file called `contents/about.md` and fill it with markdown.  
Step 6: install all dependencies with:

    npm install
    npm install -g wintersmith
    
    # note this is MacOS specific:
    brew install imagemagick
    brew install graphicsmagick

Step 7: check out your blog:

    node convertContent
    wintersmith preview

## License

The MIT License (MIT)

Copyright (c) 2014 Mike van Rossum <mike@mvr.me>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.