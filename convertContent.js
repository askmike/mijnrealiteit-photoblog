var co = require('co');
var gm = require('co-gm');
var fs = require('co-fs');
var _ = require('lodash');
var forEach = require('co-foreach');

var FROM = 'raw_articles/';
var TO = 'contents/articles/';

co(function *() {

  console.log('converting content');

  if(!(yield fs.exists(TO)))
    fs.mkdir(TO);

  var articles = yield fs.readdir(FROM);

  console.log('found', articles.length, 'articles...');

  yield forEach(articles, function * (article) {
    var isDir = (yield fs.stat(FROM + article)).isDirectory();

    if(!isDir)
      return;

    var content = yield fs.readdir(FROM + article);
    content = content.filter(i => i !== '.DS_Store');

    if(!_.find(content, c => c === 'index.md'))
      return;

    // we have a post!

    // make directory
    if(!(yield fs.exists(TO + article)))
      fs.mkdir(TO + article);

    // write post data
    var index = yield fs.readFile(FROM + article + '/index.md');
    yield fs.writeFile(TO + article + '/index.md', index);
    
    // convert pictures
    var pics = content = content.filter(i => _.endsWith(i, '.jpg'));
    yield forEach(pics, function *(picName) {
      var doneAlready = yield fs.exists(TO + article + '/' + picName)
      if(doneAlready)
        return console.log('skipping', article + '/' + picName);

      var stats = yield gm(FROM + article + '/' + picName).identify()
      if(stats.size.width < 1100) {
        // normal copy
        yield gm(FROM + article + '/' + picName)
          .noProfile()
          .write(TO + article + '/' + picName);
      } else {
        // resize
        console.log('RESIZING', article, picName);
        yield gm(FROM + article + '/' + picName)
          .noProfile()
          .resize(1100)
          .write(TO + article + '/' + picName);
      }
    });

  });
});