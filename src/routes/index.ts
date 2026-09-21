import { Router } from "express";
import authRoutes from "./auth.routes.js";
import campaignRoutes from "./campaign.routes.js";
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

router.use("/auth", authRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/uploads", uploadRoutes);

export default router;
