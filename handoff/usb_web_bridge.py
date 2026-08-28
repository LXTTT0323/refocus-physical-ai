#!/usr/bin/env python3
"""Forward RE:FOCUS USB button events and LED commands."""

from __future__ import annotations

import argparse
import http.client
import json
import time
import urllib.parse

PREFIX = "@REFOCUS "


def request_json(base_url: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    target = urllib.parse.urlsplit(base_url.rstrip("/"))
    connection_class = http.client.HTTPSConnection if target.scheme == "https" else http.client.HTTPConnection
    connection = connection_class(target.hostname, target.port, timeout=3)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    try:
        connection.request(method, f"{target.path.rstrip('/')}{path}", body=data, headers=headers)
        response = connection.getresponse()
        payload = json.loads(response.read().decode("utf-8"))
        return response.status, payload
    finally:
        connection.close()


def post_session_state(base_url: str, active: bool, sequence: int) -> None:
    status, _ = request_json(base_url, "POST", "/api/hardware/session-state", {
        "active": active,
        "sequence": sequence,
    })
    if status != 202:
        raise RuntimeError(f"web monitor returned HTTP {status}")


def get_led_commands(base_url: str, after: int) -> list[dict]:
    status, body = request_json(base_url, "GET", f"/api/hardware/commands?after={after}")
    if status != 200:
        raise RuntimeError(f"web monitor returned HTTP {status}")
    return body.get("commands", [])


def post_hardware_status(base_url: str, connected: bool, port: str) -> None:
    status, _ = request_json(base_url, "POST", "/api/hardware/status", {
        "connected": connected,
        "port": port,
    })
    if status != 202:
        raise RuntimeError(f"hardware status returned HTTP {status}")


def resolve_port(requested: str) -> str:
    if requested != "auto":
        return requested
    from serial.tools import list_ports

    ports = list(list_ports.comports())
    preferred = [
        item for item in ports
        if item.device.startswith("/dev/cu.usbmodem")
        or item.vid == 0x303A
        or "ESP32" in (item.description or "").upper()
    ]
    candidates = preferred or ports
    if not candidates:
        raise RuntimeError("no serial device detected; connect the C board with a USB data cable")
    selected = candidates[0].device
    print(f"BOARD_DETECTED port={selected} description={candidates[0].description}", flush=True)
    return selected


def run(requested_port: str, baud: int, base_url: str) -> None:
    import serial

    last_sequence = -1
    last_command_id = 0
    print(f"REFOCUS_USB_BRIDGE_READY port={requested_port} web={base_url}", flush=True)
    while True:
        try:
            port = resolve_port(requested_port)
            with serial.Serial(port, baudrate=baud, timeout=0.5) as connection:
                next_command_poll = 0.0
                next_status_heartbeat = 0.0
                while True:
                    raw = connection.readline()
                    if raw:
                        line = raw.decode("utf-8", errors="replace").strip()
                        if line.startswith("@REFOCUS_ACK "):
                            print(f"BOARD_ACK {line[len('@REFOCUS_ACK '):]}", flush=True)
                        elif line.startswith(PREFIX):
                            try:
                                event = json.loads(line[len(PREFIX):])
                            except json.JSONDecodeError:
                                print(f"IGNORED_INVALID_FRAME {line}", flush=True)
                                event = {}
                            if event.get("type") == "session_active":
                                sequence = event.get("seq")
                                active = event.get("value")
                                if isinstance(sequence, int) and isinstance(active, bool) and sequence > last_sequence:
                                    try:
                                        post_session_state(base_url, active, sequence)
                                    except (OSError, http.client.HTTPException, RuntimeError) as error:
                                        print(f"WEB_FORWARD_FAILED seq={sequence} error={error}", flush=True)
                                    else:
                                        last_sequence = sequence
                                        print(f"WEB_FORWARD_OK active={str(active).lower()} seq={sequence}", flush=True)

                    now = time.monotonic()
                    if now >= next_status_heartbeat:
                        try:
                            post_hardware_status(base_url, True, port)
                        except (OSError, http.client.HTTPException, RuntimeError) as error:
                            print(f"STATUS_HEARTBEAT_FAILED error={error}", flush=True)
                        next_status_heartbeat = now + 5.0
                    if now < next_command_poll:
                        continue
                    next_command_poll = now + 0.5
                    try:
                        commands = get_led_commands(base_url, last_command_id)
                    except (OSError, http.client.HTTPException, RuntimeError, json.JSONDecodeError) as error:
                        print(f"COMMAND_POLL_FAILED after={last_command_id} error={error}", flush=True)
                        continue
                    for command in commands:
                        command_id = command.get("id")
                        on = command.get("payload", {}).get("on")
                        if command.get("type") != "LED_SET" or not isinstance(command_id, int) or not isinstance(on, bool):
                            print(f"COMMAND_IGNORED command={command}", flush=True)
                            continue
                        frame = {"v": 1, "type": "led", "on": on, "id": command_id}
                        wire = "@REFOCUS_CMD " + json.dumps(frame, separators=(",", ":")) + "\n"
                        connection.write(wire.encode("utf-8"))
                        connection.flush()
                        last_command_id = command_id
                        print(f"BOARD_COMMAND_SENT led={str(on).lower()} id={command_id}", flush=True)
        except (serial.SerialException, RuntimeError) as error:
            print(f"SERIAL_RECONNECT error={error}", flush=True)
            time.sleep(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", default="auto")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--web", default="https://refocus-physical-ai.vercel.app")
    args = parser.parse_args()
    run(args.port, args.baud, args.web)


if __name__ == "__main__":
    main()
