import ctypes
import json
import sys
from pathlib import Path


def resident_bytes(pid):
    if sys.platform.startswith("linux"):
        fields = Path(f"/proc/{pid}/status").read_text()[:65536].splitlines()
        resident = next(line for line in fields if line.startswith("VmRSS:"))
        return int(resident.split()[1]) * 1024

    if sys.platform == "darwin":
        library = ctypes.CDLL("/usr/lib/libproc.dylib")
        buffer = ctypes.create_string_buffer(4096)

        if library.proc_pid_rusage(pid, 2, ctypes.byref(buffer)) != 0:
            raise OSError("board-route-limit")

        return ctypes.c_uint64.from_buffer(buffer, 64).value

    return windows_resident(pid)


def windows_resident(pid):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
    handle = kernel.OpenProcess(0x1000 | 0x10, 0, pid)
    buffer = ctypes.create_string_buffer(80)
    ctypes.c_ulong.from_buffer(buffer).value = len(buffer)

    try:
        if not handle or not psapi.GetProcessMemoryInfo(handle, ctypes.byref(buffer), len(buffer)):
            raise OSError("board-route-limit")

        return ctypes.c_size_t.from_buffer(buffer, 16).value
    finally:
        kernel.CloseHandle(handle)


print(json.dumps({"rss": resident_bytes(int(sys.argv[1]))}))
