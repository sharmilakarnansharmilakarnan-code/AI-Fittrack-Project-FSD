const express = require("express");
const c = require("../controllers/attendanceController");
const { authenticate } = require("../middleware/authMiddleware");
const { validateQuery, PAGE_QUERY } = require("../middleware/validate");

const router = express.Router();
router.use(authenticate);

router.post("/check-in", c.checkIn);
router.post("/check-out", c.checkOut);
router.get("/", validateQuery({ ...PAGE_QUERY, from: { type: "dateOnly" }, to: { type: "dateOnly" } }), c.getAttendance);

module.exports = router;
