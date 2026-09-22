import { Router } from "express";
import * as roomController from "../controllers/room.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createRoomSchema,
  idParamSchema,
  updateRoomSchema,
} from "../validators/schemas.js";

const router = Router();
router.use(authenticate);

router.get("/", roomController.list);
router.post("/", validate({ body: createRoomSchema }), roomController.create);
router.get(
  "/:id",
  validate({ params: idParamSchema }),
  roomController.getById
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateRoomSchema }),
  roomController.update
);
router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  roomController.remove
);

export default router;
