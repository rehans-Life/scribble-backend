const Room = require("../models/Room");

exports.getRoom = async (req, res) => {
  const { id } = req.params;

  const room = await Room.findById(id);

  res.status(200).json({
    status: "success",
    data: {
      room,
    },
  });
};
