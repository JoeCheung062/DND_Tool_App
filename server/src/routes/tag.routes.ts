import { Router } from "express";
import * as tagController from "../controllers/tag.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createTagSchema,
  idParamSchema,
  updateTagSchema,
} from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", tagController.list);
router.post("/", validate({ body: createTagSchema }), tagController.create);
router.get("/:id", validate({ params: idParamSchema }), tagController.getById);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateTagSchema }),
  tagController.update
);
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  tagController.remove
);

export default router;
