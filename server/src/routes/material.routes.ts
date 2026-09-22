import { Router } from "express";
import * as materialController from "../controllers/material.controller.js";
import { authenticate } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", materialController.list);

/** Multipart: fields type, name, campaignIds, tagIds + optional file */
router.post("/", upload.single("file"), materialController.create);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  materialController.getById
);

router.patch(
  "/:id",
  validate({ params: idParamSchema }),
  upload.single("file"),
  materialController.update
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  materialController.remove
);

export default router;
