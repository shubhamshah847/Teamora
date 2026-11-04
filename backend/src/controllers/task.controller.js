import taskmodel from "../models/task.model.js";
import projectModel from "../models/project.model.js";
import { getIO } from "../utils/socket.js";

const getProjectForTeamMember = async (projectId, userId) => {
    const project = await projectModel.findById(projectId).populate("Team");
    if (!project?.Team) return null;
    const team = project.Team;
    const isTeamMember = team.owner.toString() === userId.toString()
        || team.members.some((member) => member.invitationStatus !== "pending" && member.user && member.user.toString() === userId.toString());
    return isTeamMember ? { project, team } : null;
}

const membersBelongToTeam = (members, team) => {
    const allowedIds = new Set(team.members
        .filter((member) => member.invitationStatus !== "pending")
        .map((member) => member.user?.toString())
        .filter(Boolean));
    allowedIds.add(team.owner.toString());
    return members.every((memberId) => allowedIds.has(memberId.toString()));
};

const createTask = async (req, res) => {
    const { title, description = "", status = "pending", project, members = [], dueDate } = req.body
    if (!title?.trim() || !project || !dueDate) return res.status(400).json({ message: "Task title, project, and due date are required" })
    try {
        const projectAccess = await getProjectForTeamMember(project, req.user);
        if (!projectAccess) return res.status(404).json({ message: "Project not found or you are not a member of its team" });
        if (!Array.isArray(members) || !membersBelongToTeam(members, projectAccess.team)) {
            return res.status(400).json({ message: "Assigned task members must belong to this project's team" });
        }
        const task = await taskmodel.create({
            title: title.trim(), description, status, project, members, dueDate
        })
        await task.populate("members", "name email");
        return res.status(201).json({ message: "Task created successfully", task })
    }
    catch (err) {
        console.error("Task creation failed:", err)
        return res.status(400).json({ message: err.message || "Task creation failed" })
    }
}
const getTask = async (req, res) => {
    const { projectId } = req.params
    if (!projectId) return res.status(401).json({ message: "projectId is required" })
    try {
        const projectAccess = await getProjectForTeamMember(projectId, req.user);
        if (!projectAccess) return res.status(404).json({ message: "Project not found or you are not a member of its team" });
        const tasks = await taskmodel.find({ project: projectId }).populate("members", "name email")
        return res.status(200).json({ tasks })
    }
    catch (err) {
        res.status(500).json({
            message: "failed to get tasks"
        })
    }
}
const updateTask = async (req, res) => {
    const { taskId } = req.params
    if (!taskId) return res.status(401).json({ message: "taskId is required" })
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication is required" })
        const existingTask = await taskmodel.findById(taskId);
        if (!existingTask) return res.status(404).json({ message: "Task not found" });
        const projectAccess = await getProjectForTeamMember(existingTask.project, req.user);
        if (!projectAccess) return res.status(404).json({ message: "Task not found or you are not a member of its team" });

        const userId = req.user.toString();
        const team = projectAccess.team;
        const isOwner = team.owner.toString() === userId;
        const teamMembership = team.members.find((member) => member.invitationStatus !== "pending" && member.user?.toString() === userId);
        const canManageTask = isOwner || teamMembership?.role === "admin";
        const isAssignee = existingTask.members.some((memberId) => memberId.toString() === userId);
        const updates = req.body || {};
        const allowedFields = ["title", "description", "status", "members", "dueDate"];
       
        if (!canManageTask && !isAssignee) {
            return res.status(403).json({ message: "Only task assignees or team admins can update this task" });
        }
        if (!canManageTask && Object.keys(updates).some((field) => field !== "status")) {
            return res.status(403).json({ message: "Assigned users can only update task status" });
        }
        if (!canManageTask && updates.status === undefined) {
            return res.status(400).json({ message: "Provide a task status to update" });
        }
        if (Object.keys(updates).some((field) => !allowedFields.includes(field))) {
            return res.status(400).json({ message: "One or more task fields cannot be updated" });
        }
        if (updates.members !== undefined && (!Array.isArray(updates.members) || !membersBelongToTeam(updates.members, team))) {
            return res.status(400).json({ message: "Assigned task members must belong to this project's team" });
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "Provide at least one task field to update" });
        }

        const updateFields = Object.fromEntries(
            allowedFields.filter((field) => updates[field] !== undefined).map((field) => [field, updates[field]])
        );
        if (typeof updateFields.title === "string") updateFields.title = updateFields.title.trim();

        const updatedTask = await taskmodel.findByIdAndUpdate(taskId, updateFields, {
            new: true,
            runValidators: true,
        });

        if (!updatedTask) return res.status(404).json({ message: "Task not found" })

        await updatedTask.populate("members", "name email");
        getIO()?.emit("task-updated", updatedTask)
        return res.status(200).json({ message: "Task updated successfully", task: updatedTask })
    }
    
    catch (err) {
        console.error("Task update failed:", err)
        return res.status(400).json({ message: err.message || "Failed to update task" })
    }
}
const deleteTask = async (req, res) => {
    const { taskId } = req.params
    const id = req.user
    if(!id) return res.status(401).json({ message: "userId is required" })
    const isAdmin = await projectModel.findOne({ Team: { $elemMatch: { owner: id } } });
    if (!isAdmin) return res.status(403).json({ message: "You are not authorized to delete this task" });
    if (!taskId) return res.status(401).json({ message: "taskId is required" })
    try {
        const existingTask = await taskmodel.findById(taskId)
        if (!existingTask) return res.status(404).json({ message: "Task not found" })
        const projectAccess = await getProjectForTeamMember(existingTask.project, req.user)
        if (!projectAccess) return res.status(404).json({ message: "Task not found or you are not a member of its team" })
        await existingTask.deleteOne()
        return res.status(200).json({ message: "Task deleted successfully" })
    }
    catch (err) {
        res.status(500).json({
            message: "failed to delete task"
        })
    }
}
const memberTask = async (req, res) => {
    const { memberId } = req.params
    if (!memberId) return res.status(401).json({ message: "memberId is required" })
    try {
        const tasks = await taskmodel.find({ members: memberId })
        res.status(200).json({ tasks })
    }
    catch (err) {
        res.status(500).json({
            message: "failed to get tasks"
        })
    }
}
const getTaskById = async (req, res) => {
    const { taskId } = req.params
    if (!taskId) return res.status(401).json({ message: "taskId is required" })
    try {
        const task = await taskmodel.findById(taskId).populate("members", "name email")
        if (!task) return res.status(404).json({ message: "Task not found" })
        const projectAccess = await getProjectForTeamMember(task.project, req.user)
        if (!projectAccess) return res.status(404).json({ message: "Task not found or you are not a member of its team" })
        return res.status(200).json({ task })
    }
    catch (err) {
        res.status(500).json({
            message: "failed to get task"
        })
    }
}


export { createTask, getTask, updateTask, deleteTask, memberTask, getTaskById }