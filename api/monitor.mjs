import { createMonitorHandler } from "../web-monitor/server.mjs";

const monitorHandler = createMonitorHandler();

export const config = {
  maxDuration: 180,
};

export default async function handler(request, response) {
  const incoming = new URL(request.url ?? "/api/monitor", "https://refocus.invalid");
  const route = incoming.searchParams.get("route") ?? "health";
  incoming.searchParams.delete("route");
  request.url = `/api/${route}${incoming.search}`;
  return monitorHandler(request, response);
}
