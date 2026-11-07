"""Runs real servo client libraries, unmodified, against the emulator over a PTY."""

import json
import subprocess
import sys

from dynamixel_sdk import COMM_SUCCESS, PacketHandler, PortHandler
from scservo_sdk import PacketHandler as ScsPacket
from scservo_sdk import PortHandler as ScsPort

POSITION = 2048


def start(binary, family, extra):
    proc = subprocess.Popen(
        [binary, "--family", family, "--ids", "1,2,3", "--pty", *extra], stdout=subprocess.PIPE, text=True
    )
    line = proc.stdout.readline()
    return proc, json.loads(line)["pty"]


def feetech(path):
    port = ScsPort(path)
    assert port.openPort() and port.setBaudRate(1000000)
    packet = ScsPacket(0)
    for servo in (1, 2, 3):
        model, result, error = packet.ping(port, servo)
        assert result == 0 and error == 0, ("ping", servo, result, error)
        assert model == 777, ("model", model)
    result, error = packet.write1ByteTxRx(port, 1, 40, 1)
    assert result == 0 and error == 0, ("torque", result, error)
    result, error = packet.write2ByteTxRx(port, 1, 42, POSITION + 100)
    assert result == 0 and error == 0, ("goal", result, error)
    goal, result, error = packet.read2ByteTxRx(port, 1, 42)
    assert result == 0 and goal == POSITION + 100, ("readback", goal, result)
    missing = packet.ping(port, 9)[1]
    assert missing != 0, "Servo 9 should not answer"
    port.closePort()


def dynamixel(path):
    port = PortHandler(path)
    assert port.openPort() and port.setBaudRate(1000000)
    packet = PacketHandler(2.0)
    for servo in (1, 2, 3):
        model, result, error = packet.ping(port, servo)
        assert result == COMM_SUCCESS and error == 0, ("ping", servo, result, error)
        assert model == 1200, ("model", model)
    result, error = packet.write1ByteTxRx(port, 1, 64, 1)
    assert result == COMM_SUCCESS and error == 0, ("torque", result, error)
    result, error = packet.write4ByteTxRx(port, 1, 116, POSITION + 100)
    assert result == COMM_SUCCESS and error == 0, ("goal", result, error)
    goal, result, error = packet.read4ByteTxRx(port, 1, 116)
    assert result == COMM_SUCCESS and goal == POSITION + 100, ("readback", goal, result)
    assert packet.ping(port, 9)[1] != COMM_SUCCESS, "Servo 9 should not answer"
    port.closePort()


def main():
    binary, family, *extra = sys.argv[1:]
    proc, path = start(binary, family, extra)
    try:
        (feetech if family == "feetech" else dynamixel)(path)
    finally:
        proc.terminate()
    print("ok")


if __name__ == "__main__":
    main()
