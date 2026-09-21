import { Router } from "express";
import * as campaignController from "../controllers/campaign.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createCampaignSchema,
  createCharacterSchema,
  idParamSchema,
  updateCampaignSchema,
} from "../validators/schemas.js";

const router = Router();

router.use(authenticate);

router.post(
  "/",
  validate({ body: createCampaignSchema }),
  campaignController.createCampaign
);

router.get("/", campaignController.listCampaigns);

// Character routes before /:id so "characters" is not parsed as an id
router.post(
  "/characters",
  validate({ body: createCharacterSchema }),
  campaignController.createCharacter
);

router.get("/characters/mine", campaignController.listCharacters);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  campaignController.getCampaign
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateCampaignSchema }),
  campaignController.updateCampaign
);

export default router;
