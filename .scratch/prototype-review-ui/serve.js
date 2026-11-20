// Tiny zero-dependency local server for the throwaway Browser OK List prototype.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +(process.env.PORT || 4173);
const HTML_PATH = path.join(__dirname, "ok-list-prototype.html");

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    fs.createReadStream(HTML_PATH).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("PROTOTYPE_READY http://127.0.0.1:" + PORT);
});
