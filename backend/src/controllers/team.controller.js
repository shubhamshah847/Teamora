import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import Team from "../models/team.model.js";
import userModel from "../models/user.models.js";
import { getIO } from  "../utils/socket.js";
import { sendTeamWelcomeEmail } from "../services/email.service.js";
import { sendTeamRemovalEmail } from "../services/email.service.js";
const validId = (id) => mongoose.isValidObjectId(id);
const isOwner = (team, userId) => team.owner.toString() === userId.toString();
const getMembership = (team, userId) =>
	team.members.find((member) => member.invitationStatus !== "pending" && member.user && member.user.toString() === userId.toString());
const canManage = (team, userId) =>
	isOwner(team, userId) || getMembership(team, userId)?.role === "admin";

const populateTeam = (query) =>
	query
		.populate("owner", "name email")
		.populate("members.user", "name email");

export const createTeam = async (req, res) => {
	const { name, description = "" } = req.body;
	if (typeof name !== "string" || !name.trim()) {
		return res.status(400).json({ message: "Team name is required" });
	}

	try {
		const team = await Team.create({
			name: name.trim(),
			description: typeof description === "string" ? description.trim() : "",
			owner: req.user,
			members: [{ user: req.user, role: "admin" }],
		});
		await team.populate([
			{ path: "owner", select: "name email" },
			{ path: "members.user", select: "name email" },
		]);
		return res.status(201).json({ message: "Team created", team });
	} catch (error) {
		console.error("Team creation failed:", error);
		return res.status(500).json({ message: "Unable to create team" });
	}
};

export const getTeams = async (req, res) => {
	try {
		const teams = await populateTeam(
			Team.find({
				$or: [{ owner: req.user }, { "members.user": req.user }],
			}).sort({ updatedAt: -1 })
		);
		return res.status(200).json({ teams });
	} catch (error) {
		console.error("Teams lookup failed:", error);
		return res.status(500).json({ message: "Unable to get teams" });
	}
};

export const getTeam = async (req, res) => {
	const { teamId } = req.params;
	if (!validId(teamId)) {
		return res.status(400).json({ message: "Invalid team ID" });
	}

	try {
		const team = await populateTeam(
			Team.findOne({
				_id: teamId,
				$or: [{ owner: req.user }, { "members.user": req.user }],
			})
		);
		if (!team) return res.status(404).json({ message: "Team not found" });
		return res.status(200).json({ team });
	} catch (error) {
		console.error("Team lookup failed:", error);
		return res.status(500).json({ message: "Unable to get team" });
	}
};

export const updateTeam = async (req, res) => {
	const { teamId } = req.params;
	const { name, description } = req.body;
	if (!validId(teamId)) {
		return res.status(400).json({ message: "Invalid team ID" });
	}
	if (name === undefined && description === undefined) {
		return res.status(400).json({ message: "Provide a team name or description" });
	}
	if (name !== undefined && (typeof name !== "string" || !name.trim())) {
		return res.status(400).json({ message: "Team name cannot be empty" });
	}
	if (description !== undefined && typeof description !== "string") {
		return res.status(400).json({ message: "Description must be a string" });
	}

	try {
		const team = await Team.findById(teamId);
		if (!team) return res.status(404).json({ message: "Team not found" });
		if (!canManage(team, req.user)) {
			return res.status(403).json({ message: "You cannot update this team" });
		}

		if (name !== undefined) team.name = name.trim();
		if (description !== undefined) team.description = description.trim();
		await team.save();
		await team.populate([
			{ path: "owner", select: "name email" },
			{ path: "members.user", select: "name email" },
		]);
	    getIO().emit("team-updated", team); // Emit the updated team to all connected clients
		return res.status(200).json({ message: "Team updated", team });
	} catch (error) {
		console.error("Team update failed:", error);
		return res.status(500).json({ message: "Unable to update team" });
	}
};

export const deleteTeam = async (req, res) => {
	const { teamId } = req.params;
	if (!validId(teamId)) {
		return res.status(400).json({ message: "Invalid team ID" });
	}

	try {
		const team = await Team.findById(teamId);
		if (!team) return res.status(404).json({ message: "Team not found" });
		if (!isOwner(team, req.user)) {
			return res.status(403).json({ message: "Only the team owner can delete it" });
		}
		await team.deleteOne();
		return res.status(200).json({ message: "Team deleted" });
	} catch (error) {
		console.error("Team deletion failed:", error);
		return res.status(500).json({ message: "Unable to delete team" });
	}
};

export const addMember = async (req, res) => {
	const { teamId } = req.params;
	const { email, role = "member" } = req.body;
	if (!validId(teamId) || typeof email !== "string" || !email.trim()) {
		return res.status(400).json({ message: "A valid team ID and member email are required" });
	}
	const normalizedEmail = email.toLowerCase().trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
		return res.status(400).json({ message: "Enter a valid email address" });
	}
	if (!["admin", "member"].includes(role)) {
		return res.status(400).json({ message: "Role must be admin or member" });
	}

	try {
		const team = await Team.findById(teamId);
		if (!team) return res.status(404).json({ message: "Team not found" });
		if (!canManage(team, req.user)) {
			return res.status(403).json({ message: "You cannot manage this team" });
		}
		if (role === "admin" && !isOwner(team, req.user)) {
			return res.status(403).json({ message: "Only the owner can assign admin role" });
		}
		const user = await userModel.findOne({ email: normalizedEmail }).select("_id name email");
		if (role === "admin" && !user) {
			return res.status(404).json({ message: "Admin access can only be given to an existing Teamora user" });
		}
		if (user && (isOwner(team, user._id) || getMembership(team, user._id))) {
			return res.status(409).json({ message: "User is already on this team" });
		}
		if (team.members.some((member) => member.email?.toLowerCase() === normalizedEmail)) {
			return res.status(409).json({ message: "This email is already on the team or has a pending invitation" });
		}

		const invitationToken = randomBytes(32).toString("hex");
		team.members.push({
			name: user?.name || normalizedEmail.split("@")[0],
			email: normalizedEmail,
			role,
			invitationStatus: "pending",
			invitationTokenHash: createHash("sha256").update(invitationToken).digest("hex"),
			invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		});
		await team.save();
		await team.populate([
			{ path: "owner", select: "name email" },
			{ path: "members.user", select: "name email" },
		]);
		const inviter = await userModel.findById(req.user).select("name");


		const inviteBaseUrl = process.env.INVITE_APP_URL || "https://teamora-web.vercel.app";
		const acceptUrl = `${inviteBaseUrl.replace(/\/+$/, "")}/?invite=${encodeURIComponent(invitationToken)}`;
		const emailSent = await sendTeamWelcomeEmail(
			normalizedEmail,
			user?.name || normalizedEmail.split("@")[0],
			team.name,
			inviter?.name || "Your team admin",
			acceptUrl
		);
		return res.status(201).json({
			message: emailSent
				? "Invitation email sent. The teammate must accept it to join."
				: "Invitation created, but the email could not be sent.",
			emailSent,
			pending: true,
			team,
		});
	} catch (error) {
		console.error("Adding team member failed:", error);
		return res.status(500).json({ message: "Unable to add member" });
	}
};

export const acceptTeamInvite = async (req, res) => {
	const { token } = req.body;
	if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
		return res.status(400).json({ message: "A valid invitation link is required." });
	}

	try {
		const user = await userModel.findById(req.user).select("_id name email");
		if (!user) return res.status(404).json({ message: "Account not found." });

		const tokenHash = createHash("sha256").update(token).digest("hex");
		const team = await Team.findOne({ "members.invitationTokenHash": tokenHash }).select("+members.invitationTokenHash");
		if (!team) return res.status(404).json({ message: "This invitation is invalid or has already been used." });

		const invitation = team.members.find((member) => member.invitationTokenHash === tokenHash);
		if (!invitation || invitation.invitationStatus !== "pending") {
			return res.status(409).json({ message: "This invitation is no longer pending." });
		}
		if (invitation.invitationExpiresAt && invitation.invitationExpiresAt < new Date()) {
			return res.status(410).json({ message: "This invitation has expired. Ask the team admin to invite you again." });
		}
		if (invitation.email?.toLowerCase() !== user.email?.toLowerCase()) {
			return res.status(403).json({ message: "Sign in with the email address this invitation was sent to." });
		}
		if (isOwner(team, user._id) || getMembership(team, user._id)) {
			return res.status(409).json({ message: "You are already a member of this team." });
		}

		invitation.user = user._id;
		invitation.name = user.name;
		invitation.invitationStatus = "accepted";
		invitation.invitationTokenHash = undefined;
		invitation.invitationExpiresAt = undefined;
		await team.save();
		await team.populate([
			{ path: "owner", select: "name email" },
			{ path: "members.user", select: "name email" },
		]);
		getIO()?.emit("team-updated", team);
		return res.status(200).json({ message: `You joined ${team.name}.`, team });
	} catch (error) {
		console.error("Accepting team invitation failed:", error);
		return res.status(500).json({ message: "Unable to accept this invitation." });
	}
};

export const getPendingInvitations = async (req, res) => {
	try {
		const user = await userModel.findById(req.user).select("email");
		if (!user) return res.status(404).json({ message: "Account not found." });
		const email = user.email.toLowerCase().trim();
		const teams = await Team.find({
			members: { $elemMatch: { email, invitationStatus: "pending" } },
		}).populate("owner", "name email");
		const invitations = teams.flatMap((team) => team.members
			.filter((member) => member.email?.toLowerCase() === email
				&& member.invitationStatus === "pending"
				&& (!member.invitationExpiresAt || member.invitationExpiresAt >= new Date()))
			.map((member) => ({
				teamId: team._id,
				teamName: team.name,
				invitationId: member._id,
				role: member.role,
				invitedBy: team.owner?.name || "A team admin",
			})));

		return res.status(200).json({ invitations });
	} catch (error) {
		console.error("Pending team invitations lookup failed:", error);
		return res.status(500).json({ message: "Unable to check pending invitations." });
	}
};

export const acceptPendingInvitation = async (req, res) => {
	const { teamId, invitationId } = req.params;
	if (!validId(teamId) || !validId(invitationId)) {
		return res.status(400).json({ message: "Invalid team invitation." });
	}

	try {
		const [user, team] = await Promise.all([
			userModel.findById(req.user).select("_id name email"),
			Team.findById(teamId),
		]);
		if (!user) return res.status(404).json({ message: "Account not found." });
		if (!team) return res.status(404).json({ message: "Team not found." });

		const invitation = team.members.id(invitationId);
		if (!invitation || invitation.invitationStatus !== "pending") {
			return res.status(404).json({ message: "Pending invitation not found." });
		}
		if (invitation.invitationExpiresAt && invitation.invitationExpiresAt < new Date()) {
			return res.status(410).json({ message: "This invitation has expired. Ask the team admin to invite you again." });
		}
		if (invitation.email?.toLowerCase() !== user.email?.toLowerCase()) {
			return res.status(403).json({ message: "This invitation was sent to a different email address." });
		}
		if (isOwner(team, user._id) || getMembership(team, user._id)) {
			return res.status(409).json({ message: "You are already a member of this team." });
		}

		invitation.user = user._id;
		invitation.name = user.name;
		invitation.invitationStatus = "accepted";
		invitation.invitationTokenHash = undefined;
		invitation.invitationExpiresAt = undefined;
		await team.save();
		await team.populate([
			{ path: "owner", select: "name email" },
			{ path: "members.user", select: "name email" },
		]);
		getIO()?.emit("team-updated", team);
		return res.status(200).json({ message: `You joined ${team.name}.`, team });
	} catch (error) {
		console.error("Accepting pending team invitation failed:", error);
		return res.status(500).json({ message: "Unable to accept this invitation." });
	}
};

export const updateMember = async (req, res) => {
	const { teamId, memberId } = req.params;
	const { userId, role } = req.body;
	if (!validId(teamId) || !validId(memberId)) {
		return res.status(400).json({ message: "Invalid team or member ID" });
	}
	if (userId !== undefined && !validId(userId)) {
		return res.status(400).json({ message: "Invalid replacement user ID" });
	}
	if (role !== undefined && !["admin", "member"].includes(role)) {
		return res.status(400).json({ message: "Role must be admin or member" });
	}
	if (userId === undefined && role === undefined) {
		return res.status(400).json({ message: "Provide a user ID or role to update" });
	}

	try {
		const team = await Team.findById(teamId);
		if (!team) return res.status(404).json({ message: "Team not found" });
		if (!canManage(team, req.user)) {
			return res.status(403).json({ message: "You cannot manage this team" });
		}
		const member = getMembership(team, memberId);
		if (!member) return res.status(404).json({ message: "Team member not found" });
		if (isOwner(team, memberId)) {
			return res.status(400).json({ message: "The team owner's membership cannot be changed" });
		}
		if (!isOwner(team, req.user) && member.role === "admin") {
			return res.status(403).json({ message: "Only the owner can update an admin" });
		}
		if (role === "admin" && !isOwner(team, req.user)) {
			return res.status(403).json({ message: "Only the owner can assign admin role" });
		}
		if (userId !== undefined) {
			const user = await userModel.findById(userId).select("_id");
			if (!user) return res.status(404).json({ message: "User not found" });
			if (isOwner(team, userId) || (userId !== member.user.toString() && getMembership(team, userId))) {
				return res.status(409).json({ message: "User is already on this team" });
			}
			member.user = userId;
		}
		if (role !== undefined) member.role = role;

		await team.save();
		await team.populate("members.user", "name email");
		await team.populate("owner", "name email");
		return res.status(200).json({ message: "Member updated", team });
	} catch (error) {
		console.error("Team member update failed:", error);
		return res.status(500).json({ message: "Unable to update member" });
	}
};

export const changeMemberRole = async (req, res) => {
	const { teamId, memberId } = req.params;
	const { role } = req.body;
	if (!validId(teamId) || !validId(memberId)) {
		return res.status(400).json({ message: "Invalid team or member ID" });
	}
	if (!["admin", "member"].includes(role)) {
		return res.status(400).json({ message: "Role must be admin or member" });
	}

	try {
		const team = await Team.findById(teamId);
		if (!team) return res.status(404).json({ message: "Team not found" });
		if (!canManage(team, req.user)) {
			return res.status(403).json({ message: "You cannot manage this team" });
		}
		const member = getMembership(team, memberId);
		if (!member) return res.status(404).json({ message: "Team member not found" });
		if (isOwner(team, memberId)) {
			return res.status(400).json({ message: "The team owner's role cannot be changed" });
		}
		if (!isOwner(team, req.user) && (member.role === "admin" || role === "admin")) {
			return res.status(403).json({ message: "Only the owner can change admin roles" });
		}

		member.role = role;
		await team.save();
		await team.populate("members.user", "name email");
		await team.populate("owner", "name email");
		return res.status(200).json({ message: "Member role updated", team });
	} catch (error) {
		console.error("Member role update failed:", error);
		return res.status(500).json({ message: "Unable to update member role" });
	}
};

export const deleteMember = async (req, res) => {
	const { teamId, memberId } = req.params;
	if (!validId(teamId) || !memberId) {
		return res.status(400).json({ message: "A valid team ID and member identifier are required" });
	}

	try {
		const team = await Team.findById(teamId);
		if (!team) return res.status(404).json({ message: "Team not found" });
		if (!canManage(team, req.user)) {
			return res.status(403).json({ message: "You cannot manage this team" });
		}
		const member = team.members.find((entry) =>
			(entry.user && entry.user.toString() === memberId)
			|| (entry._id && entry._id.toString() === memberId)
			|| entry.email?.toLowerCase() === decodeURIComponent(memberId).toLowerCase()
		);
		if (!member) return res.status(404).json({ message: "Team member not found" });
		if (member.user && isOwner(team, member.user)) {
			return res.status(400).json({ message: "The team owner cannot be removed" });
		}
		if (!isOwner(team, req.user) && member.role === "admin") {
			return res.status(403).json({ message: "Only the owner can remove an admin" });
		}

		team.members = team.members.filter((entry) => entry !== member);
		await team.save();
		await team.populate([
			{ path: "owner", select: "name email" },
			{ path: "members.user", select: "name email" },
		]);
		const remover = await userModel.findById(req.user).select("name");
		const emailSent = await sendTeamRemovalEmail(
			member.email,
			member.name,
			team.name,
			remover?.name || "A team admin"
		);
		return res.status(200).json({ message: "Member removed", emailSent, team });
	} catch (error) {
		console.error("Team member removal failed:", error);
		return res.status(500).json({ message: "Unable to remove member" });
	}
};
