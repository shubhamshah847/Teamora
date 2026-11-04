import express from "express";
import {createTask,getTask,updateTask,deleteTask,memberTask,getTaskById} from "../controllers/task.controller.js"
import { isAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create/task",isAuth,createTask);
router.get("/get/tasks/:projectId",isAuth,getTask);
router.patch("/update/task/:taskId",isAuth,updateTask);
router.delete("/delete/task/:taskId",isAuth,deleteTask);
router.get("/get/member/tasks/:memberId",isAuth,memberTask);
router.get("/get/task/:taskId",isAuth,getTaskById);

 
export default router;