import { Router } from "express";
import * as characterController from "../controllers/character.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createCharacterSchema,
  idParamSchema,
  updateCharacterSchema,
} from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", characterController.list);
router.post(
  "/",
  validate({ body: createCharacterSchema }),
  characterController.create
);
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  characterController.getById
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateCharacterSchema }),
  characterController.update
);
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  characterController.remove
);

export default router;
