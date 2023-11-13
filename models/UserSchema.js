const { default: mongoose } = require("mongoose");

const CounterSchema = new mongoose.Schema({
  _id: {
    type: String,
    unqiue: true,
    required: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

const Counter = mongoose.model("Counter", CounterSchema);

const UserSchema = new mongoose.Schema({
  id: {
    type: String,
    unqiue: true,
  },
  position: {
    type: Number,
  },
  name: {
    type: String,
    required: [true, "Name field is required for each user"],
  },
  points: {
    type: Number,
    default: 0,
  },
  additionalPoints: {
    type: Number,
    default: 0,
  },
  guessed: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ["admin", "player"],
    default: "player",
  },
});

UserSchema.pre("save", async function (next) {
  if (!this.isNew) return;

  const roomId = this.$parent().id;

  const counter = await Counter.findByIdAndUpdate(
    roomId,
    { $inc: { seq: 1 } },
    {
      upsert: true,
      new: true,
    },
  );

  this.position = counter.seq;

  next();
});

module.exports = UserSchema;
