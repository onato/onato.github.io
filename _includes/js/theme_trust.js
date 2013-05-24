///////////////////////////////		
// Set Variables
///////////////////////////////
var catptionOffset = -20;
var thumbWidth = 350;
var widgetsHidden = false;
var themeColumns = 3;

///////////////////////////////		
// Mobile Detection
///////////////////////////////

function isMobile(){
    return (
        (navigator.userAgent.match(/Android/i)) ||
		(navigator.userAgent.match(/webOS/i)) ||
		(navigator.userAgent.match(/iPhone/i)) ||
		(navigator.userAgent.match(/iPod/i)) ||
		(navigator.userAgent.match(/iPad/i)) ||
		(navigator.userAgent.match(/BlackBerry/))
    );
}


///////////////////////////////
// Center Home Flexslider Text
///////////////////////////////

function centerFlexCaption() {
	jQuery('.home .slideshow .details').each(function(id){		
		jQuery(this).css('margin-top','-'+((jQuery(this).actual('height')/2)-catptionOffset)+'px');		
	});
}

///////////////////////////////
// Mobile Nav
///////////////////////////////

function setMobileNav(){
	jQuery('#mainNav .sf-menu').tinyNav({
		header: 'Navigation',
	    active: 'current-menu-item'
	});	
}

///////////////////////////////
// Initialize
///////////////////////////////	
	
jQuery.noConflict();
jQuery(window).load(function(){
	jQuery(".videoContainer").fitVids();
	centerFlexCaption();
	setMobileNav();
	//setMobileNav();	
	jQuery(window).on("debouncedresize", function( event ) {
		centerFlexCaption();	
	});
	jQuery('img').attr('title','');	
});