---
layout: project
title: "Maptoolkit"
image: {src: images/projects/maptoolkit/maptoolkit.jpg, width: 500, height: 281, title: "Drawify Screenshots"}
slides:
  - {image: /images/projects/maptoolkit/maptoolkit.jpg, title: "Drawify Overview"}
backgroundColor: "#18b1d3"
backgroundDark: yes
categories: projects
---

Maptoolkit is a framework I am responsible for the continued development of for the software house [Toursprung](http://toursprung.com). It was initially created by [Felix Krause](http://felixkrause.at/) 

<p>
	<ul>
		<li>All modules are organised as private cocoapods. Modules include Tracking, Login, Uploading of Points of Interest, Display of Routes, etc…</li>
		<li>Projects are compiled, tested, archived and uploaded to Testflight automatically on commit by a Jenkins setup.</li>
		<li>The project is compiled into a .Framework for use by SDK customers.</li>
		<li>We implemented a extra build layer to perform tasks like removing comments from configuration files and ignoring warnings on code that is not controlled by us.</li>
		<li>Frameworks used: 
			<ul>
				<li>CoreData</li>
				<li>CoreLocation</li>
				<li>ExternalAccessory</li>
				<li>Accounts</li>
				<li>Social</li>
				<li>AssetsLibrary</li>
				<li>AVFoundation</li>
				<li>CoreMedia</li>
				<li>CoreTelephony</li>
				<li>OpenGLES</li>
				<li>QuartzCore</li>
				<li>CoreText</li>
				<li>MessageUI</li>
				<li>CoreImage</li>
				<li>CoreLocation</li>
				<li>CoreGraphics</li>
				<li>CoreBluetooth</li>
			</ul>
		</li>
	</ul>
</p>

###Technical Details
Technology: Objective-C, CocoaPods, Ruby, JSON, Jenkins
