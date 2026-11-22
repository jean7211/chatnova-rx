const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const messages = [];

io.on("connection", (socket) => {
  socket.emit("chat history", messages);

  socket.on("chat message", (data) => {
    if (
      !data ||
      typeof data.name !== "string" ||
      typeof data.message !== "string"
    ) return;

    const name = data.name.trim().slice(0, 30);
    const message = data.message.trim().slice(0, 2000);

    if (!name || !message) return;

    const newMessage = {
      name,
      message,
      time: new Date().toISOString()
    };

    messages.push(newMessage);

    if (messages.length > 100) {
      messages.shift();
    }

    io.emit("chat message", newMessage);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ChatNova RX running on port ${PORT}`);
});
