import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

const router = Router();
router.use(authenticate);

router.get("/overview", adminController.overview);
router.get("/tables", adminController.tables);
router.get(
  "/tables/:table",
  validate({
    params: z.object({
      table: z.string().min(1).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    }),
  }),
  adminController.describe
);

export default router;
