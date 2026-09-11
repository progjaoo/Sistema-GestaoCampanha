import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignRouter from "./campaign";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignRouter);

export default router;
