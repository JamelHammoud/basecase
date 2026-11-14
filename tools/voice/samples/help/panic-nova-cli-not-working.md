# What to do if the Nova CLI is not working

When I attempt to use tab-completion with the CLI, it says “_values:compvalues:11: not enough arguments”

myuser@MyMacBookPro ~ % nova index|↦
_values:compvalues:11: not enough arguments

myuser@MyMacBookPro ~ % nova index|
This is caused by a conflict between the ZSH shell’s built-in completions and the nova CLI tool.

Why It Happens

As far as we have been able to determine, this only happens if you use the wildly popular Oh-My-ZSH framework alongside your ZSH shell.

ZSH ships with a set of built-in completions for commands that you might install in the future. One set of these are for the OpenStack suite of web platform tools, of which one sub-command is openstack nova, for the OpenStack Compute platform (which is also known as nova).

To remedy this, Nova installs alongside its nova tool a ZSH completions addition file in the /usr/local/share/zsh/site-functions directory. This file instructs ZSH to check if the OpenStack tools are installed. If they are not, it will then always use our command line tool when tab-completing files within the nova command. If they are installed, ZSH will ask you to be more specific.

Relatedly, ZSH will attempt to pre-compute completions to make the shell as fast as possible. In doing so, we’ve seen cases where these pre-computed completions built before Oh-My-ZSH is installed may cause a syntax error in the ZSH .zcompdump file, in part due to Oh-My-ZSH being more strict about the syntax. This may cause our completions addition file for ZSH to not be consulted, which will cause this problem to always occur.

How To Fix It

The easiest way to fix this is to delete any ZSH cached completion files in your home directory. These hidden files all begin with the name .zcompdump. Deleting this file will clear the ZSH completion cache and cause it to recompute its completions as needed, which should cause our nova tool to be included properly.

We have observed that this may be need to be cleared in any of the following circumstances:

Right after you install nova, before or after you have Oh-My-ZSH

After installing Oh-My-ZSH, whether or not nova is already installed

As this file is just a cache of completions that isn’t generally meant to be user-edited, it should not hurt to delete it.

You can delete these files using the following terminal command: rm ~/.zcompdump*
