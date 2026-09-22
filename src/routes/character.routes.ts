import { Router } from "express";
import * as characterController from "../controllers/character.controller.js";
import { authenticate } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", characterController.list);

/** Multipart: name, userId, optional illustration URL, optional file */
router.post("/", upload.single("file"), characterController.create);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  characterController.getById
);

router.patch(
  "/:id",
  validate({ params: idParamSchema }),
  upload.single("file"),
  characterController.update
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  characterController.remove
);

export default router;
