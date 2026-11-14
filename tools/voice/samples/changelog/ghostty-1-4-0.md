# Ghostty 1.4.0

Release notes for Ghostty 1.4.0, released on October 27, 2026.

Ghostty 1.4.0 is a major release that includes large performance and memory improvements, a 100% complete Kitty graphics implementation including animation and relative placements (the first non-Kitty terminal to do so), SSH integration improvements, and hundreds more improvements and fixes across all platforms.

This release features 7 months of work with changes from 172 contributors over 2,889 commits. Thank you to all the contributors, maintainers, community moderators, translators, packagers, and users who each helped make this release possible.

These release notes are painstakingly and lovingly hand-crafted by human Ghostty maintainers, including the full changelog. They take a combined 16+ hours to write, so please enjoy. ## Highlights

### macOS 27 Support

Ghostty 1.4 supports macOS 27 (Golden Gate). Most of the work was compatibility fixes:
- Tabs in the titlebar (macos-titlebar-style = tabs) lay out correctly again.
- The native tab bar no longer draws as a solid gray bar on top of your theme. It now lets the new glass style blend with your terminal background.
- macos-titlebar-style = hidden no longer covers the top lines of the terminal when Reduce Transparency is on.
- The app icon no longer has a thin border.
- The Shortcuts "New Window" action no longer opens two windows when Ghostty is running without any windows.

Ghostty 1.4 remains fully compatible with prior macOS versions back to and including macOS 13 (Ventura). See the system requirements for more details.

Note: Ghostty 1.3.1 works on macOS 27, but it has some of the visual issues listed above, such as the gray tab bar.

### Kitty Graphics Animation and Relative Placements

Ghostty now supports Kitty graphics animation and relative placements. These were the last major features of the Kitty graphics protocol that Ghostty didn't support.

Programs that display animated images with the Kitty protocol, such as an animated GIF shown with kitten icat, now animate in Ghostty instead of showing a single still frame. Frame transmission, composition, and playback control are all supported, and animations pause while the terminal isn't visible. Relative placements let a program position one image relative to another image's placement, so the child image moves along with its parent.

We also did a full conformance pass against the specification and Kitty itself, fixing dozens of behavioral differences. For example, images now scroll with text inside scroll regions (#4323), retransmitting an image ID replaces the old image (#6711), and invalid image data now gets an error response instead of silence, which could leave clients hanging. The full list is in the terminal capabilities section.

Kitty graphics are faster, too. Image payloads are now parsed in bulk with SIMD instead of one byte at a time, making large image transfers about 16x faster to parse in our benchmarks (64 MiB of image data, x86_64 Linux), and drawing images costs much less per frame.

Our Kitty graphics implementation now covers 100% of the published specification, making Ghostty (and libghostty) the first terminal to do this outside of Kitty itself.
