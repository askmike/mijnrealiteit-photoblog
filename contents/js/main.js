console.log('Interested in a blog like this? It\'s open source!');
console.log('https://github.com/askmike/mijnrealiteit-photoblog');

// 			GA
var _gaq=[["_setAccount",window.gacode],["_setDomainName",window.domain],["_trackPageview"]];(function(e,a){var o=e.createElement(a),t=e.getElementsByTagName(a)[0];o.src=("https:"==location.protocol?"//ssl":"//www")+".google-analytics.com/ga.js",t.parentNode.insertBefore(o,t)})(document,"script");


$(function() {

  $('.content').children().each(function() {
    if($(this).text().length > 1)
      $(this).addClass('text');
    else
      $(this).addClass('fig');
  });

  var fixed = false;
  var top = false;
  var nonFixedHeight = $("#sidebar").offset().top;

  var check = function() {
    var b = $("#sidebar").height();
    var c = $(window).height();
    var d = $(window).scrollTop();
    var e = $("#main").height();

    if(b > e)
      return;

    if(c > b) {
      $("body").addClass('fixedSidebar').addClass('top');
      top = true;
      return;
    } else if(top) {
      $("body").removeClass('top');
      top = false;
    }
    
    if ((c+d)>(nonFixedHeight+b)) {
      console.log(fixed);
      if(fixed)
        return;

      $("body").addClass('fixedSidebar');

      fixed = true;
      console.log('aaa', fixed);

    } else {
      if(!fixed)
        return;

      $("body").removeClass('fixedSidebar');

      fixed = false;
    }
  }


  $(window).on('scroll', check);
  check();
});



