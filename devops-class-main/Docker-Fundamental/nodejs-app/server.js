const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });

  res.end(`
        <h1>Hello World from Node.js + Docker!</h1>
        <p><strong>Name:</strong> Palak Agrawal</p>
        <p><strong>Roll No:</strong> 24BCS10504</p>
    `);
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
