"""Runs conformance.py unmodified on macOS, where a PTY refuses pyserial's custom-baud ioctl.

macOS has no B1000000 termios constant, so pyserial sets 1 Mbaud with the IOSSIOSPEED ioctl, which only real
serial drivers accept; a PTY answers ENOTTY. A PTY has no baud rate, so this wrapper turns that one ioctl into a
no-op on PTY file descriptors and leaves every other call, the SDKs and the conformance script untouched.
"""

import errno
import fcntl
import os
import runpy
import sys

IOSSIOSPEED = 0x80045402
_real_ioctl = fcntl.ioctl


def _is_pty(fd):
    try:
        return os.ttyname(fd).startswith("/dev/ttys")
    except OSError:
        return False


def _ioctl(fd, request, *args):
    try:
        return _real_ioctl(fd, request, *args)
    except OSError as error:
        if request == IOSSIOSPEED and error.errno == errno.ENOTTY and _is_pty(fd):
            return 0
        raise


def main():
    script = os.path.join(os.path.dirname(__file__), "conformance.py")
    if sys.platform == "darwin":
        fcntl.ioctl = _ioctl
    sys.argv = [script, *sys.argv[1:]]
    runpy.run_path(script, run_name="__main__")


if __name__ == "__main__":
    main()
