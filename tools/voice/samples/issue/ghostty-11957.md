# Crash when using Find after clearing scrollback buffer (Cmd+K)


### Discussed in https://github.com/ghostty-org/ghostty/discussions/11684

<div type='discussions-op-text'>

<sup>Originally posted by **zzhaolei** March 20, 2026</sup>
### Issue Description

Ghostty crash when using Find after clearing scrollback buffer

### Expected Behavior

Ghostty should keep running and simply show no further matches.

### Actual Behavior

Ghostty crashes.

### Reproduction Steps

## demo

In fish shell, run:

```
for i in (seq 10000)
    echo 'error'
end
```

1. Press Cmd+F and search for error (keep the search box open).
2. Click the prompt area, then press Cmd+K to clear the scrollback buffer.
3. In the search box, click previous/next or press Enter.

### Ghostty Logs

_No response_

### Ghostty Version

```text
Ghostty 1.3.2-main+7966740b4

Version
  - version: 1.3.2-main+7966740b4
  - channel: tip
Build Config
  - Zig version   : 0.15.2
  - build mode    : .ReleaseFast
  - app runtime   : .none
  - font engine   : .coretext
  - renderer      : renderer.generic.Renderer(renderer.Metal)
  - libxev        : kqueue
```


### OS Version Information

macOS 26.3.1 (25D2128)

### (Linux only) Display Server

None

### (Linux only) Desktop Environment/Window Manager

_No response_

### Minimal Ghostty Configuration

```ini
none
```


### Additional Relevant Configuration

_No response_

### I acknowledge that:

- [X] I have reviewed the FAQ and confirm that my issue is NOT among them.
- [X] I have searched the Ghostty repository (both open and closed Discussions and Issues) and confirm this is not a duplicate of an existing issue or discussion.
- [X] I have checked the "Preview" tab on all text fields to ensure that everything looks right, and have wrapped all configuration and code in code blocks with a group of three backticks (` ``` `) on separate lines.</div>
