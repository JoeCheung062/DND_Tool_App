import { Router } from "express";
import * as combinationController from "../controllers/combination.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createCombinationSchema,
  idParamSchema,
  updateCombinationSchema,
} from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", combinationController.list);
router.post(
  "/",
  validate({ body: createCombinationSchema }),
  combinationController.create
);
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  combinationController.getById
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateCombinationSchema }),
  combinationController.update
);
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  combinationController.remove
);

export default router;
