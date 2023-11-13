const express = require("express");
const { default: helmet } = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const roomRoutes = require("./routes/roomRoutes");

const app = express();

app.use(express.json());
app.use(helmet());
app.use(cors());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use("/api/rooms", roomRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
  });
});

module.exports = app;
