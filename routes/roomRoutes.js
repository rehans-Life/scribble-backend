const { Router } = require("express");
const { getRoom } = require("../controllers/rooomsController");

const router = Router();

router.route("/:id").get(getRoom);

module.exports = router;
