import projectModel from "../models/project.model.js";
import Team from "../models/team.model.js";
import { getIO } from "../utils/socket.js";

const canManageTeam = (team, userId) => Boolean(team && (
    team.owner.toString() === userId.toString()
    || team.members.some((member) => member.invitationStatus !== "pending"
        && member.role === "admin"
        && member.user?.toString() === userId.toString())
));

const createProject = async (req, res) => {
    const { teamId } = req.params;
    const { name, description = "", duesTime, status } = req.body;

    if (!name?.trim() || !teamId || !duesTime || !status) {
        return res.status(400).json({ message: "Project name, team, due date, and status are required." });
    }

    try {
        const team = await Team.findById(teamId);
        if (!team) return res.status(404).json({ message: "Team not found" });
        if (!canManageTeam(team, req.user)) {
            return res.status(403).json({ message: "Only the team owner or an admin can create projects." });
        }
        const project = await projectModel.create({
            name: name.trim(),
            description: typeof description === "string" ? description.trim() : "",
            Team: teamId,
            duesTime,
            status,
        });
        return res.status(201).json({ message: "Project created successfully", project });
    } catch (err) {
        console.error("Project creation failed:", err);
        return res.status(400).json({ message: err.message || "Project creation failed" });
    }
};
const getProject = async (req, res) => {
    const { teamId } = req.params
    if (!teamId) return res.status(401).json({ message: "teamId is required" })
    try {
        const projects = await projectModel.find({ Team: teamId })
        return res.status(200).json({ projects })
    }
    catch (err) {
        res.status(500).json({
            message: "failed to get projects"
        })
    }
}
const updateProject = async (req, res) => {
    const { projectId } = req.params
    const { name, description, duesTime, status } = req.body
    try {
             const project = await projectModel.findById(projectId);
             if (!project) return res.status(404).json({ message: "Project not found" });
             const team = await Team.findById(project.Team);
             if (!team) return res.status(404).json({ message: "Team not found" });
             if (!canManageTeam(team, req.user)) return res.status(403).json({ message: "Only the team owner or an admin can update projects." });
             const updatedProject = await projectModel.findByIdAndUpdate(projectId, { name, description, duesTime, status },{new:true, runValidators:true})
             if (!updatedProject) return res.status(404).json({ message: "Project not found" });
             getIO()?.emit("project-updated", updatedProject);
             return res.status(200).json({ message: "Project updated successfully", project: updatedProject })
    }
    catch (err) {
        return res.status(500).json({ message: "Failed to update project" })
    }
}
const deleteProject = async (req, res) => {
    const { projectId } = req.params
    if (!projectId) return res.status(401).json({ message: "projectId is required" })
    try {
        const project = await projectModel.findById(projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });
        const team = await Team.findById(project.Team);
        if (!team) return res.status(404).json({ message: "Team not found" });
        if (!canManageTeam(team, req.user)) return res.status(403).json({ message: "Only the team owner or an admin can delete projects." });
        await project.deleteOne();
        res.status(200).json({ message: "project deleted successfully" })
    }
    catch (err) {
        res.status(500).json({
            message: "failed to delete project"
        })
    }
}
const getporjectById = async (req, res) => {
    const { projectId } = req.params
    if (!projectId) return res.status(401).json({ message: "projectId is required" })
    try {
        const project = await projectModel.findById(projectId)
        res.status(200).json({ project })
    }
        catch(err){
        res.status(500).json({
            message: "failed to get project"
        })
    }
}
 export {createProject,
    getProject,
    updateProject,
    deleteProject,
    getporjectById
}