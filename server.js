const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const http = require("node:http");
const https = require("node:https");
const next = require("next");

function isEnabled(value) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function resolvePath(rawPath) {
  if (!rawPath) {
    return null;
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function parseTlsHosts() {
  const rawHosts = process.env.TLS_HOSTS ?? "localhost,127.0.0.1,gpt_chat";

  return rawHosts
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildSubjectAltName(hosts) {
  return hosts
    .map((host) => (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ? `IP:${host}` : `DNS:${host}`))
    .join(",");
}

function ensureSelfSignedCertificate(certPath, keyPath) {
  const certDir = path.dirname(certPath);
  const keyDir = path.dirname(keyPath);
  const forceRegenerate = isEnabled(process.env.TLS_FORCE_REGENERATE);

  fs.mkdirSync(certDir, { recursive: true });
  fs.mkdirSync(keyDir, { recursive: true });

  if (forceRegenerate) {
    fs.rmSync(certPath, { force: true });
    fs.rmSync(keyPath, { force: true });
  }

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return;
  }

  const hosts = parseTlsHosts();
  const commonName = hosts.find((host) => !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) ?? "localhost";
  const subjectAltName = buildSubjectAltName(hosts);

  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-sha256",
      "-days",
      process.env.TLS_CERT_DAYS ?? "365",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-subj",
      `/CN=${commonName}`,
      "-addext",
      `subjectAltName=${subjectAltName}`,
    ],
    { stdio: "inherit" }
  );
}

function getTlsOptions() {
  if (!isEnabled(process.env.HTTPS)) {
    return null;
  }

  const certPath = resolvePath(process.env.TLS_CERT_PATH ?? ".data/tls/server.crt");
  const keyPath = resolvePath(process.env.TLS_KEY_PATH ?? ".data/tls/server.key");

  if (isEnabled(process.env.TLS_AUTOGENERATE)) {
    ensureSelfSignedCertificate(certPath, keyPath);
  }

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      `HTTPS is enabled but the TLS certificate files were not found. Expected cert at ${certPath} and key at ${keyPath}.`
    );
  }

  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
}

async function main() {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const hostname = process.env.HOSTNAME ?? "0.0.0.0";
  const dev = process.env.NODE_ENV !== "production";
  const tlsOptions = getTlsOptions();
  const protocol = tlsOptions ? "https" : "http";
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = tlsOptions
    ? https.createServer(tlsOptions, (request, response) => handle(request, response))
    : http.createServer((request, response) => handle(request, response));

  server.listen(port, hostname, () => {
    const publicHostname = hostname === "0.0.0.0" ? "localhost" : hostname;
    console.log(`> Ready on ${protocol}://${publicHostname}:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});