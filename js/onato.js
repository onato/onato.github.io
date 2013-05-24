---
---
{% include js/jquery.infinitescroll.min.js %}
{% include js/jquery.debouncedresize.js %}
{% include js/jquery.imagesloaded.min.js %}
{% include js/jquery.actual.min.js %}
{% include js/jquery.fitvids.min.js %}
{% include js/jquery.flexslider-min.js %}
{% include js/tinynav.min.js %}
{% include js/theme_trust.js %}



jQuery(window).load(function() {
  jQuery('.home #header .flexslider').flexslider({
    slideshowSpeed: 6000,
    directionNav: true,
    slideshow: 1,
    animation: 'fade',
    animationLoop: true
  });  
});

jQuery(window).load(function() {
  jQuery('#content .flexslider').flexslider({
    directionNav: true,
    slideshow: 0,
    animation: 'fade',
    animationLoop: true
  });  
});

jQuery(window).load(function(){
  jQuery('#content .cItems').infinitescroll({

    navSelector  : "div.pagination",
    nextSelector : "div.pagination a:first",
    itemSelector : "#content .cItems div.hentry",
    loading: {
      finishedMsg: "",
      img: "",
      msgText: ""
    },
    errorCallback: function() {   
      jQuery('.infscrBtn').animate({opacity: 0.8},2000).fadeOut('normal');
    }},     
    function( newElements ) {
      var newElems = jQuery(newElements);
      newElems.hide();
      newElems.imagesLoaded(function(){
        jQuery(".videoContainer").fitVids();
              
        jQuery('#content .flexslider').flexslider({
          directionNav: true,
          slideshow: 0,
          animation: 'fade',
          animationLoop: true
        });  
        
        newElems.fadeIn('slow');
        
      });
      var opts = jQuery('#content .cItems').data('infinitescroll').options;
      
      if(opts.state.currPage == 2){       
        jQuery('.infscrBtn').fadeOut('normal');
      }else{
        jQuery('.infscrBtn span').text("Load More"); 
      } 
    }
  );
  

  jQuery(window).unbind('.infscr');
  
  jQuery('.cItems div.hentry').css("display: none;");
  
  // hook up the manual click.
  jQuery('.infscrBtn').click(function(){
    jQuery('#content .cItems').infinitescroll('retrieve');
    jQuery('.infscrBtn span').text("Loading...");
  }); 
  
});
