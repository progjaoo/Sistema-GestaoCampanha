import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignRouter from "./campaign";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth);
router.use(campaignRouter);

export default router;
