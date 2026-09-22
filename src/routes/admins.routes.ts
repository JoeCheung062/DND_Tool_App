import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createAdminSchema,
  idParamSchema,
  updateAdminSchema,
} from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", authController.listAdmins);
router.post("/", validate({ body: createAdminSchema }), authController.createAdmin);
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  authController.getAdmin
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateAdminSchema }),
  authController.updateAdmin
);
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  authController.removeAdmin
);

export default router;
