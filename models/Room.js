const { default: mongoose } = require("mongoose");
const UserSchema = require("./UserSchema");

const RoomSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
    },
    users: {
      type: [UserSchema],
      validate: [
        function (value) {
          return value.length <= this.players;
        },
        "Room is already full",
      ],
    },
    guessWord: {
      type: String,
    },
    hintWord: {
      type: String,
    },
    drawer: { type: String },
    gameState: {
      type: String,
      enum: ["waiting", "selecting", "drawing", "finished"],
      default: "waiting",
    },
    players: {
      type: Number,
      default: 8,
      min: 2,
      max: 20,
    },
    round: {
      type: Number,
      default: 0,
    },
    drawerTime: {
      type: Number,
      default: 15,
    },
    gameTime: {
      type: Number,
      default: 80,
      min: 20,
      max: 240,
    },
    hints: {
      type: Number,
      default: 2,
      min: 0,
      max: 5,
    },
    wordCount: {
      type: Number,
      default: 4,
      min: 2,
      max: 5,
    },
    gapTime: {
      type: Number,
      default: 5,
    },
  },
  {
    timestamps: true,
  },
);

const Room = mongoose.model("Room", RoomSchema);

module.exports = Room;
