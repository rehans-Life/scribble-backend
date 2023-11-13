const { createServer } = require("http");

const dotenv = require("dotenv");
const { Server } = require("socket.io");
const { default: mongoose } = require("mongoose");

dotenv.config({
  path: "./config.env",
});

const app = require("./app");
const {
  leaveRoom,
  createRoom,
  joinRoom,
  boardChange,
  startGame,
  wordSelected,
  guessedWord,
  updateRoom,
} = require("./controllers/socketControllers");

const { PORT, IP } = process.env;
const DB_URI = process.env.DB_URI.replace(
  "<password>",
  process.env.DB_PASSWORD,
);

(async () => {
  await mongoose.connect(DB_URI);

  const httpServer = createServer(app);

  // Creating a socket io server out of an express server
  const io = new Server(httpServer, {
    pingTimeout: 60000,
    cors: {
      origin: process.env.FRONTEND_URL,
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected");

    socket.join(socket.id);

    socket.on("join-room", joinRoom(io, socket));
    socket.on("create-room", createRoom(socket));
    socket.on("update-room", updateRoom(io, socket));
    socket.on("board-change", boardChange(socket));
    socket.on("leave-room", leaveRoom(io, socket, socket.id));

    socket.on("start-game", startGame(io, socket));
    socket.on("word-selected", wordSelected(io, socket));
    socket.on("guess-word", guessedWord(io, socket));
    socket.on("set-time", (roomId, time) =>
      socket.to(roomId).emit("new-timer", time),
    );

    socket.on("disconnect", async () => {
      leaveRoom(io, socket, socket.id)();

      socket._cleanup();
      socket.disconnect();
    });
  });

  httpServer.listen(PORT, IP, () => {
    console.log(`Server Listening on PORT ${PORT}`);
  });
})();
