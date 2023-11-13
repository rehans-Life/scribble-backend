/* eslint-disable block-scoped-var */
/* eslint-disable no-plusplus */
/* eslint-disable for-direction */
/* eslint-disable node/no-unsupported-features/es-syntax */
const Room = require("../models/Room");
const words = require("../utils/random.json");

const firstEmpty = (word, start, end, dir = "front") => {
  if (dir === "front") {
    for (let i = start; i < end; i++) {
      if (word[i] === "_") return i;
    }
  } else {
    for (let i = start; i > end; i--) {
      if (word[i] === "_") return i;
    }
  }
};

const firstRandomEmptyIndex = (word, index) => {
  const dir = Math.floor(Math.random() * 2);

  let empty = -1;

  if (dir) {
    empty = firstEmpty(word, index + 1, word.length);
  } else {
    empty = firstEmpty(word, index - 1, -1, "backwards");
  }

  if (empty === -1) {
    if (dir) {
      empty = firstEmpty(word, index - 1, -1, "backwards");
    } else {
      empty = firstEmpty(word, index + 1, word.length);
    }
  }

  return empty;
};

const findRoom = async (roomId) => {
  if (!roomId) return;

  const room = await Room.findOne({
    id: roomId,
  });

  return room;
};

const initiateGame = async (io, socket, room) => {
  room = await findRoom(room.id);

  if (!room) {
    return;
  }

  if (!(room.users.length >= 2)) {
    return;
  }

  const randomIdx = Math.floor(Math.random() * words.length);
  const randomWords = words.slice(randomIdx, randomIdx + room.wordCount);

  let newDrawer;

  const drawer = room.users.find(({ id }) => id === room.drawer);

  if (drawer) {
    newDrawer = room.users.find(({ position }) => position > drawer.position);
    io.to(drawer.id).emit("clear-board");
  } else {
    io.to(room.id).emit("clear-board");
  }

  if (!newDrawer) {
    newDrawer = room.users[0];
  }

  room = await Room.findOneAndUpdate(
    {
      id: room.id,
    },
    {
      $set: {
        guessWord: undefined,
        hintWord: undefined,
        drawer: newDrawer.id,
        gameState: "selecting",
        "users.$[].guessed": false,
        "users.$[].additionalPoints": 0,
      },
      $inc: { round: 1 },
    },
    {
      new: true,
    },
  );

  io.to(room.drawer).emit("select-word", randomWords);
  io.to(room.id).emit("room-changed", room);

  setTimeout(async () => {
    const updatedRoom = await Room.findOne({
      id: room.id,
    });

    // If the drawer hasnt selected even after the drawer time then pick a random word and set
    // it as the guessed word
    if (
      updatedRoom &&
      updatedRoom.gameState === "selecting" &&
      updatedRoom.round === room.round
    ) {
      const randomWord =
        randomWords[Math.floor(Math.random() * updatedRoom.wordCount)];
      this.wordSelected(io, socket)(room.id, randomWord);
    }
  }, room.drawerTime * 1000);

  return room;
};

const endGame = async (io, socket, room) => {
  room.gameState = "finished";

  room.users.forEach((user) => {
    user.points += user.additionalPoints;
  });

  await room.save();

  io.to(room.id).emit("room-changed", room);
  io.to(room.id).emit("new-message-recieved", {
    content: `The correct word was ${room.guessWord}`,
    type: "finished",
  });

  // Only start the new game automatically if there are more than 2 players
  if (room.users.length > 1) {
    setTimeout(() => {
      initiateGame(io, socket, room);
    }, room.gapTime * 1000);
  }

  return room;
};

exports.joinRoom = (io, socket) => async (roomId, username) => {
  // Finding the room with the given id and adding the new user inside of it.

  const newUser = {
    id: socket.id,
    name: username,
  };

  let room = await findRoom(roomId);

  if (!room) {
    socket.emit("room-not-found");
    return;
  }

  if (room.users.some(({ id }) => id === socket.id)) return;

  try {
    room.users.push(newUser);
    room = await room.save();
  } catch (err) {
    socket.emit("error", err.message);
    return;
  }

  // Joining a room with the room id in case we need to emit to all users and also
  // joining a room with the users id just in case we need to emit an event just for
  // a particular user.
  socket.join(roomId);

  const clonedRoom = room.$clone();
  clonedRoom.guessWord = undefined;

  // Emitting the room joined event with the room data and the userId.
  socket.emit("room-joined", clonedRoom);

  // notifying the rest of the users about the new member who has joined.
  socket.to(room.id).emit("members-changed", room.users);

  socket.to(room.id).emit("new-member-joined", socket.id);

  socket.to(roomId).emit("new-message-recieved", {
    user: newUser,
    content: `${newUser.name} has joined the game`,
    type: "player-joined",
  });

  const admin = room.users.find(({ role }) => role === "admin");

  socket.emit("new-message-recieved", {
    content: `${admin.name} is now the room owner`,
    type: "room-owner",
  });

  // If after the new user joins the length becomes 2 and the game is in finished state
  // then we automatically start the new game.
  if (room.users.length === 2 && room.gameState === "finished") {
    await initiateGame(io, socket, room);
  }
};

exports.createRoom = (socket) => async (roomId, username) => {
  const roomExists = await findRoom(roomId);

  if (roomExists) {
    socket.emit("room already exists");
    return;
  }

  if (!roomId && !username) {
    socket.emit("error", "Invalid Credentials");
    return;
  }

  // Creating a room with in the DB
  const room = await Room.create({
    id: roomId,
    users: [
      {
        id: socket.id,
        name: username,
        role: "admin",
        position: 1,
      },
    ],
    gameState: "waiting",
  });

  // Joining a room with the room id in case we need to emit to all users and also
  // joining a room with the users id just in case we need to emit an event just for
  // a particular user.
  socket.join(roomId);

  // Emitting the room joined event with the room data and the userId.
  socket.emit("room-created", room);
  socket.emit("new-message-recieved", {
    content: `${username} is now the room owner`,
    type: "room-owner",
  });
};

exports.updateRoom = (io, socket) => async (roomId, config) => {
  config = {
    gameTime: config.gameTime,
    players: config.players,
    hints: config.hints,
    wordCount: config.wordCount,
  };

  try {
    const room = await Room.findOneAndUpdate(
      {
        id: roomId,
        gameState: "waiting",
        users: { $elemMatch: { id: socket.id, role: "admin" } },
      },
      {
        $set: config,
      },
      {
        new: true,
      },
    );
    if (room) io.to(roomId).emit("room-changed", room);
  } catch (err) {
    socket.emit("error", err.message);
  }
};

exports.startGame = (io, socket) => async (roomId) => {
  const room = await Room.findOne({
    id: roomId,
  });

  if (!room) {
    socket.emit("error", "No room found");
    return;
  }

  const user = room.users.find(({ id }) => id === socket.id);

  if (!user) {
    socket.emit("error", "No User Found");
    return;
  }

  if (user.role !== "admin") {
    socket.emit("new-message-recieved", {
      content: "Only admins are allowed to start the game",
      type: "error",
    });

    return;
  }

  if (!(room.users.length >= 2)) {
    socket.emit("new-message-recieved", {
      content: "You need 2 players to start the game",
      type: "error",
    });
    return;
  }

  await initiateGame(io, socket, room);
};

exports.wordSelected = (io, socket) => async (roomId, selectedWord) => {
  let room = await findRoom(roomId);

  if (!room) {
    socket.emit("error", "Room not found");
    return;
  }

  room = await Room.findOneAndUpdate(
    { id: room.id },
    {
      $set: {
        guessWord: selectedWord,
        gameState: "drawing",
        hintWord: selectedWord
          .split("")
          .map((char) => (char === " " ? char : "_"))
          .join(""),
      },
    },
    {
      new: true,
    },
  );

  io.to(room.drawer).emit("room-changed", room);

  const clonedRoom = room.$clone();

  clonedRoom.guessWord = undefined;

  room.users.forEach(({ id }) => {
    if (id !== room.drawer) io.to(id).emit("room-changed", clonedRoom);
  });

  const drawer = room.users.find((user) => user.id === room.drawer);

  io.to(room.id).emit("new-message-recieved", {
    user: drawer?.name,
    content: `${drawer?.name} is now drawing`,
    type: "drawing",
  });

  const totalTime = room.gameTime;
  const hints =
    room.guessWord.length - room.hints <= 1
      ? room.guessWord.length - 2
      : room.hints;
  let divider = 1.75;

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < hints; i++) {
    setTimeout(
      async () => {
        const updatedRoom = await Room.findOne({
          id: room.id,
        });

        if (
          updatedRoom &&
          updatedRoom.gameState === "drawing" &&
          updatedRoom.round === room.round
        ) {
          let randomCharIndex = Math.floor(
            Math.random() * updatedRoom.guessWord.length,
          );

          if (updatedRoom.hintWord[randomCharIndex] !== "_") {
            randomCharIndex = firstRandomEmptyIndex(
              updatedRoom.hintWord,
              randomCharIndex,
            );
          }

          const newHintWord = Array.from(updatedRoom.hintWord);
          newHintWord.splice(
            randomCharIndex,
            1,
            updatedRoom.guessWord[randomCharIndex],
          );

          updatedRoom.hintWord = newHintWord.join("");

          await updatedRoom.save();

          const newClonedRoom = {
            ...updatedRoom.toObject(),
            guessWord: undefined,
          };

          updatedRoom.users.forEach(({ id }) => {
            if (id !== room.drawer)
              io.to(id).emit("room-changed", newClonedRoom);
          });
        }
      },
      (totalTime / divider) * 1000,
    );

    divider += 2;
  }

  setTimeout(
    async () => {
      const updatedRoom = await Room.findOne({
        id: roomId,
      });
      if (
        updatedRoom &&
        updatedRoom.gameState === "drawing" &&
        updatedRoom.round === room.round
      ) {
        await endGame(io, socket, updatedRoom);
      }
    },
    (room.gameTime + 1) * 1000,
  );
};

exports.boardChange = (socket) => (roomId, data) => {
  socket.to(roomId).emit("board-change", data);
};

exports.guessedWord = (io, socket) => async (roomId, message, time) => {
  const room = await findRoom(roomId);

  if (!room) {
    socket.emit("error", "No room found");
    return;
  }

  const userIdx = room.users.findIndex(({ id }) => id === socket.id);

  if (userIdx === -1) {
    socket.emit("error", "user not found");
    return;
  }

  const user = room.users[userIdx];

  if (user.id === room.drawer) return;

  const messageObj = {
    username: user.name,
  };

  if (
    room.guessWord &&
    room.guessWord.toLowerCase() === message.toLowerCase() &&
    room.gameState !== "finished"
  ) {
    room.users[userIdx].guessed = true;
    room.users[userIdx].additionalPoints = Math.floor(
      (325 * time) / room.gameTime,
    );
    const drawer = room.users.find(({ id }) => id === room.drawer);
    drawer.additionalPoints += Math.floor((85 * time) / room.gameTime);
    await room.save();

    messageObj.content = `${user.name} has guessed correctly`;
    messageObj.type = "correct-guess";

    // finish game if all users have guessed;
    if (room.users.every(({ guessed, id }) => guessed || id === room.drawer)) {
      endGame(io, socket, room);
    }
  } else {
    messageObj.content = message;
    messageObj.type = "default";
  }

  io.to(room.id).emit("members-changed", room.users);
  io.to(room.id).emit("new-message-recieved", messageObj);
};

exports.leaveRoom = (io, socket, userId) => async () => {
  // find the room the user is a part off
  let room = await Room.findOne({
    "users.id": userId,
  });
  let nextAdmin;

  if (!room) {
    socket.emit("error", "No room found");
    return;
  }

  // leave the room
  socket.leave(room.id);

  // find the user to be removed
  const userToRemove = room.users.find(({ id }) => id === userId);

  // remove the user from the users array
  const newUsers = room
    .$clone()
    .users.filter(({ id }) => id !== userToRemove.id);

  // emit a message to let everyone know a user left
  socket.to(room.id).emit("new-message-recieved", {
    user: userToRemove.name,
    content: `${userToRemove.name} has left the game`,
    type: "player-left",
  });

  // if no more users then delete the room
  if (!newUsers.length) {
    await Room.deleteOne({
      id: room.id,
    });
    return;
  }

  // If the user that left was the admin then select a new admin
  if (userToRemove.role === "admin") {
    nextAdmin = newUsers.find(
      ({ position }) => position > userToRemove.position,
    );

    if (!nextAdmin) {
      nextAdmin = newUsers[0];
    }

    nextAdmin.role = "admin";

    io.to(room.id).emit("new-message-recieved", {
      content: `${nextAdmin.name} is now the room owner`,
      type: "room-owner",
    });
  }

  room = await Room.findOneAndUpdate(
    {
      id: room.id,
    },
    {
      $set: {
        users: newUsers,
      },
    },
    {
      new: true,
    },
  );

  // If the user who left was a drawer then end the game if its in a drawing or selecting state.
  if (
    (room.users.length === 1 && room.gameState !== "waiting") ||
    (userToRemove.id === room.drawer && room.gameState === "drawing") ||
    room.users.every(({ guessed, id }) => guessed || id === room.drawer)
  ) {
    room.drawer = undefined;
    room = await endGame(io, socket, room);
  }

  if (userToRemove.id === room.drawer && room.gameState === "selecting") {
    room.drawer = undefined;
    room = await initiateGame(io, socket, room);
  }

  // emit the new users to other users wihtin the room
  socket.to(room.id).emit("members-changed", room.users);
  socket.to(room.id).emit("member-left");
};
