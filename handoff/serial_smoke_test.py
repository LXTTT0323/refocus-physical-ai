#!/usr/bin/env python3
"""Cross-platform smoke test for REFOCUS_C_V2 USB serial protocol."""

from __future__ import annotations

import argparse
import json
import sys
import threading

PREFIX = "@REFOCUS "


def parse_device_line(line: str):
    line = line.strip()
    if not line.startswith(PREFIX):
        return None
    return json.loads(line[len(PREFIX) :])


def self_test() -> None:
    assert parse_device_line('I (10) boot: hello') is None
    parsed = parse_device_line('@REFOCUS {"v":1,"type":"session_active","value":true,"seq":2}')
    assert parsed == {"v": 1, "type": "session_active", "value": True, "seq": 2}
    print("SELF_TEST_OK")


def require_serial():
    try:
        import serial
        from serial.tools import list_ports
    except ImportError:
        print("缺少 pyserial：python3 -m pip install pyserial", file=sys.stderr)
        raise SystemExit(2)
    return serial, list_ports


def list_serial_ports() -> None:
    _, list_ports = require_serial()
    ports = list(list_ports.comports())
    if not ports:
        print("NO_SERIAL_PORTS")
        return
    for port in ports:
        print(f"{port.device}\t{port.description}")


def run_terminal(port: str, baud: int) -> None:
    serial, _ = require_serial()
    connection = serial.Serial(port, baudrate=baud, timeout=0.2)
    stop = threading.Event()

    def reader() -> None:
        while not stop.is_set():
            raw = connection.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").rstrip()
            try:
                event = parse_device_line(line)
            except json.JSONDecodeError:
                print(f"[invalid protocol frame] {line}")
                continue
            if event is not None:
                print(f"[device] {json.dumps(event, ensure_ascii=False)}")

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()

    commands = {
        "state": {"type": "get_state"},
        "off": {"type": "set_led", "rgb": "000000", "mode": "solid"},
        "yellow": {"type": "set_led", "rgb": "FFB000", "mode": "solid"},
        "green": {"type": "set_led", "rgb": "00FF00", "mode": "solid"},
        "red": {"type": "set_led", "rgb": "FF0000", "mode": "solid"},
        "blink-yellow": {"type": "set_led", "rgb": "FFB000", "mode": "slow_blink"},
        "blink-red": {"type": "set_led", "rgb": "FF0000", "mode": "slow_blink"},
    }
    print("命令：state/off/yellow/green/red/blink-yellow/blink-red/quit")
    try:
        while True:
            name = input("> ").strip()
            if name in {"quit", "exit"}:
                break
            command = commands.get(name)
            if not command:
                print("未知命令")
                continue
            payload = json.dumps(command, separators=(",", ":")) + "\n"
            connection.write(payload.encode("utf-8"))
            connection.flush()
    finally:
        stop.set()
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if args.list:
        list_serial_ports()
        return
    if not args.port:
        parser.error("请提供 --port，或使用 --list")
    run_terminal(args.port, args.baud)


if __name__ == "__main__":
    main()

