import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createUserSchema,
  idParamSchema,
  loginSchema,
  updateUserProfileSchema,
} from "../validators/schemas.js";

const router = Router();

/** Admin-only login. User accounts are rejected. */
router.post("/login", validate({ body: loginSchema }), authController.login);

/** Disabled — kept so clients get a clear 403 instead of 404 */
router.post("/register", authController.register);

router.get("/me", authenticate, authController.me);

/** User CRUD (profiles only — no login credentials) */
router.get("/users", authenticate, authController.listUsers);
router.post(
  "/users",
  authenticate,
  validate({ body: createUserSchema }),
  authController.createUser
);
router.get(
  "/users/:id",
  authenticate,
  validate({ params: idParamSchema }),
  authController.getUser
);
router.patch(
  "/users/:id",
  authenticate,
  validate({ params: idParamSchema, body: updateUserProfileSchema }),
  authController.updateUser
);
router.delete(
  "/users/:id",
  authenticate,
  validate({ params: idParamSchema }),
  authController.removeUser
);

export default router;
