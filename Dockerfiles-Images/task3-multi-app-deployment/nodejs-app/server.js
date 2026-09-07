const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from the Node.js Docker app!');
});

server.listen(PORT, () => {
  console.log(`Node.js app listening on port ${PORT}`);
});
