import { Router } from "express";
import adminRoutes from "./admin.routes.js";
import adminsRoutes from "./admins.routes.js";
import authRoutes from "./auth.routes.js";
import campaignRoutes from "./campaign.routes.js";
import characterRoutes from "./character.routes.js";
import combinationRoutes from "./combination.routes.js";
import materialRoutes from "./material.routes.js";
import roomRoutes from "./room.routes.js";
import tagRoutes from "./tag.routes.js";
import uploadRoutes from "./upload.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      service: "dnd-app-server",
      timestamp: new Date().toISOString(),
    },
  });
});

router.use("/admin", adminRoutes);
router.use("/admins", adminsRoutes);
router.use("/auth", authRoutes);
router.use("/rooms", roomRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/characters", characterRoutes);
router.use("/tags", tagRoutes);
router.use("/materials", materialRoutes);
router.use("/combinations", combinationRoutes);
router.use("/uploads", uploadRoutes);

export default router;
