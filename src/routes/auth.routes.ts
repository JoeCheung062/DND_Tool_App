import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createUserSchema,
  idParamSchema,
  loginSchema,
  registerSchema,
  updateUserProfileSchema,
} from "../validators/schemas.js";

const router = Router();

router.post(
  "/register",
  validate({ body: registerSchema }),
  authController.register
);

router.post("/login", validate({ body: loginSchema }), authController.login);

router.get("/me", authenticate, authController.me);

/** User CRUD */
router.get("/users", authenticate, authController.list);
router.post(
  "/users",
  authenticate,
  validate({ body: createUserSchema }),
  authController.create
);
router.get(
  "/users/:id",
  authenticate,
  validate({ params: idParamSchema }),
  authController.getById
);
router.patch(
  "/users/:id",
  authenticate,
  validate({ params: idParamSchema, body: updateUserProfileSchema }),
  authController.update
);
router.delete(
  "/users/:id",
  authenticate,
  validate({ params: idParamSchema }),
  authController.remove
);

export default router;
