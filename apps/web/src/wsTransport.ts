import { WsTransport as BaseWsTransport } from "@t3tools/client-core";

export class WsTransport extends BaseWsTransport {
  constructor(url?: string) {
    const bridgeUrl = window.desktopBridge?.getWsUrl();
    const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
    super({
      url:
        url ??
        (bridgeUrl && bridgeUrl.length > 0
          ? bridgeUrl
          : envUrl && envUrl.length > 0
            ? envUrl
            : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`),
    });
  }
}
