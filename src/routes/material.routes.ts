import { Router } from "express";
import * as materialController from "../controllers/material.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createMaterialSchema,
  idParamSchema,
  updateMaterialSchema,
} from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", materialController.list);
router.post(
  "/",
  validate({ body: createMaterialSchema }),
  materialController.create
);
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  materialController.getById
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateMaterialSchema }),
  materialController.update
);
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  materialController.remove
);

export default router;
