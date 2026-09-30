const express = require("express");
const c = require("../controllers/progressController");
const { authenticate } = require("../middleware/authMiddleware");
const { validateQuery } = require("../middleware/validate");

const router = express.Router();
router.use(authenticate);

router.get("/summary", c.getSummary);
router.get("/weekly", validateQuery({ weeks: { type: "integer", min: 1, max: 52 } }), c.getWeekly);

module.exports = router;
