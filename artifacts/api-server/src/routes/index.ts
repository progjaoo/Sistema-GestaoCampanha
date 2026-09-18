import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignRouter from "./campaign";
import authRouter from "./auth";
import operationsRouter, { publicOperationsRouter } from "./operations";
import materialsRouter from "./materials";
import sheetsRouter from "./sheets";
import googleCalendarOAuthRouter from "./google-calendar-oauth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(googleCalendarOAuthRouter);
router.use(publicOperationsRouter);
router.use(requireAuth);
router.use(operationsRouter);
router.use(materialsRouter);
router.use(sheetsRouter);
router.use(campaignRouter);

export default router;
