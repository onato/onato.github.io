<?php $slideshow_effect = of_get_option('ttrust_slideshow_effect'); ?>

<script type="text/javascript">
//<![CDATA[

jQuery(window).load(function() {			
	jQuery('#content .flexslider').flexslider({		 
		directionNav: true,
		slideshow: 0,				 				
		animation: '<?php echo $slideshow_effect; ?>',
		animationLoop: true
	});  
});

//]]>
</script>