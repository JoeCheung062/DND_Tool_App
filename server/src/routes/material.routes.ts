import { Router } from "express";
import * as materialController from "../controllers/material.controller.js";
import { authenticate } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", materialController.list);

const materialFiles = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "characterArt", maxCount: 1 },
]);

/** Multipart: fields type, name, campaignIds, tagIds, npc + file and optional characterArt */
router.post("/", materialFiles, materialController.create);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  materialController.getById
);

router.patch(
  "/:id",
  validate({ params: idParamSchema }),
  materialFiles,
  materialController.update
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  materialController.remove
);

export default router;
