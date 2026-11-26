// Loaded with `node --import`. Any network use throws NETWORK_BLOCKED.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const blocked = (what) => () => {
  throw new Error(`NETWORK_BLOCKED: ${what}`);
};
net.Socket.prototype.connect = blocked("net.Socket.connect");
dns.lookup = blocked("dns.lookup");
globalThis.fetch = blocked("fetch");
http.request = blocked("http.request");
https.request = blocked("https.request");
