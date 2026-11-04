import express from "express";
import {
    createProject,
    getProject,
    updateProject,
    deleteProject,getporjectById
} from "../controllers/project.controller.js";
import { isAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create/project/:teamId", isAuth, createProject);
router.get("/get/projects/:teamId", isAuth, getProject);
router.get("/get/project/:projectId", isAuth, getporjectById);
router.patch("/update/project/:projectId", isAuth, updateProject);
router.delete("/delete/project/:projectId", isAuth, deleteProject);
 
export default router;