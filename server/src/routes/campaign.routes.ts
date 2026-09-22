import { Router } from "express";
import * as campaignController from "../controllers/campaign.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createCampaignSchema,
  idParamSchema,
  updateCampaignSchema,
} from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", campaignController.list);
router.post(
  "/",
  validate({ body: createCampaignSchema }),
  campaignController.create
);
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  campaignController.getById
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateCampaignSchema }),
  campaignController.update
);
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  campaignController.remove
);

export default router;
