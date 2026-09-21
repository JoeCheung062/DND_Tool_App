import { Router } from "express";
import * as uploadController from "../controllers/upload.controller.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = Router();

router.get("/storage", optionalAuth, uploadController.storageInfo);

router.post(
  "/image",
  authenticate,
  upload.single("image"),
  uploadController.uploadImage
);

export default router;
