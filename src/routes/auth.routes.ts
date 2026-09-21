import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { loginSchema, registerSchema } from "../validators/schemas.js";

const router = Router();

router.post(
  "/register",
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  "/login",
  validate({ body: loginSchema }),
  authController.login
);

router.get("/me", authenticate, authController.me);

export default router;
