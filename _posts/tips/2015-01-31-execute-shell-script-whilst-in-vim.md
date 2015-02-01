---
layout: tip
title: "Run the script you are editing from within VIM"
categories: tips
---

###Whilst editing your shell script you can execute it without leaving VIM.

To execute a shell script type:

    :!./%

or a ruby script:

    :!ruby %

% is substituted with the name of the file you are editing.

This can also be useful if you have a terminal tab just for editing something like a podfile:

    :!pod update

That is better than :wq [up]&lt;CR&gt;[up]&lt;CR&gt; right? Remember you can go through you commands in vim with &lt;ctrl-p&gt;  and &lt;ctrl-n&gt;.

