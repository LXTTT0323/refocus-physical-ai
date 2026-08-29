export const REFOCUS_SERIAL_PREFIX = "@REFOCUS ";

export function parseRefocusSerialLine(line) {
  const normalized = String(line ?? "").trim();
  if (!normalized.startsWith(REFOCUS_SERIAL_PREFIX)) return null;
  const frame = JSON.parse(normalized.slice(REFOCUS_SERIAL_PREFIX.length));
  if (!frame || frame.v !== 1 || typeof frame.type !== "string") {
    throw new Error("unsupported RE:FOCUS serial frame");
  }
  return frame;
}

export function serialCommandForLight(light) {
  const commands = {
    yellow: { type: "set_led", rgb: "201600", mode: "solid" },
    green: { type: "set_led", rgb: "002000", mode: "solid" },
    red: { type: "set_led", rgb: "200000", mode: "solid" },
    off: { type: "set_led", rgb: "000000", mode: "solid" },
  };
  const command = commands[light];
  if (!command) throw new Error(`unknown RE:FOCUS light: ${light}`);
  return command;
}

export function encodeRefocusSerialCommand(command) {
  return `${JSON.stringify(command)}\n`;
}
