<?php global $total_pages; ?>
<?php global $is_portfolio; ?>
<?php $slideshow_effect = of_get_option('ttrust_slideshow_effect'); ?>

<?php 
if($is_portfolio) :
	$infinite_scrolling = of_get_option('ttrust_infinite_projects_enabled');	
else :
	$infinite_scrolling = of_get_option('ttrust_infinite_posts_enabled'); 
endif;
?>

<?php if($infinite_scrolling) : ?>

<script type="text/javascript">
//<![CDATA[



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
					animation: '<?php echo $slideshow_effect; ?>',
					animationLoop: true
				});  
				
				newElems.fadeIn('slow');
				
			});
			var opts = jQuery('#content .cItems').data('infinitescroll').options;
			
			if(opts.state.currPage == <?php echo $total_pages; ?>){				
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
		jQuery('.infscrBtn span').text("<?php _e('Loading...','themetrust'); ?>"); 		   
	});	
	
});

//]]>
</script>

<?php endif; ?>