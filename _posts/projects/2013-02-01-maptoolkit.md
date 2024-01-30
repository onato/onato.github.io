---
layout: project
title: "Maptoolkit / Bikemap 2013-14"
image: {src: images/projects/maptoolkit/maptoolkit.jpg, width: 500, height: 281, title: "Maptoolkit Screenshots"}
slides:
  - {image: /images/projects/maptoolkit/maptoolkit.jpg, title: "Maptoolkit Overview"}
backgroundColor: "#18b1d3"
backgroundDark: yes
categories: projects
---

Maptoolkit was the framework underlying the Bikemap App that I was responsible for the at the software house [Toursprung](http://toursprung.com) along with [Felix Krause](http://felixkrause.at/).

<p>
	<ul>
		<li>I created a modular achitecture using private cocoapods. Modules included Tracking, Authentication, Points of Interest Uploading, Routes Rendering, Route Recording etc…</li>
		<li>The app and framework were compiled, tested, archived and uploaded to Testflight automatically on commit by a Jenkins CI setup.</li>
		<li>The project was distributed as a binary framework for use by SDK customers.</li>
		<li>Apple Frameworks used: 
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
				<li>CoreGraphics</li>
				<li>CoreBluetooth</li>
			</ul>
		</li>
	</ul>
</p>

###Technical Details
Technology: Objective-C, CocoaPods, Ruby, JSON, Jenkins
