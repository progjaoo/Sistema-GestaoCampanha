import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignRouter from "./campaign";
import authRouter from "./auth";
import operationsRouter, { publicOperationsRouter } from "./operations";
import sheetsRouter from "./sheets";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(publicOperationsRouter);
router.use(requireAuth);
router.use(operationsRouter);
router.use(sheetsRouter);
router.use(campaignRouter);

export default router;
