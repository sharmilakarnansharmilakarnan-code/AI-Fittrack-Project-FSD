const express = require("express");
const c = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const { validateBody, validateQuery, validateObjectId, PAGE_QUERY } = require("../middleware/validate");
const { ROLES } = require("../models/User");

const router = express.Router();

// authenticate -> authorize("admin") -> controller, for EVERY admin route
router.use(authenticate, authorize("admin"));

router.get("/stats", c.getStats);
router.get("/users", validateQuery({ ...PAGE_QUERY, q: { type: "string", max: 100 }, role: { type: "enum", enum: ROLES } }), c.getUsers);
router.get("/users/:id", validateObjectId("id"), c.getUserById);
router.put("/users/:id/role", validateObjectId("id"), validateBody({ role: { type: "enum", enum: ROLES, required: true } }), c.changeUserRole);
router.delete("/users/:id", validateObjectId("id"), c.deleteUser);

module.exports = router;
