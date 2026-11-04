import express from "express";
import {
	addMember,
	acceptTeamInvite,
	acceptPendingInvitation,
	changeMemberRole,
	createTeam,
	deleteMember,
	deleteTeam,
	getTeam,
	getTeams,
	getPendingInvitations,
	updateMember,
	updateTeam,
} from "../controllers/team.controller.js";
import { isAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(isAuth);

router.route("/").get(getTeams).post(createTeam);
router.post("/invitations/accept", acceptTeamInvite);
router.get("/invitations/pending", getPendingInvitations);
router.route("/:teamId").get(getTeam).patch(updateTeam).delete(deleteTeam);
router.post("/:teamId/invitations/:invitationId/accept", acceptPendingInvitation);
router.post("/:teamId/members",isAuth,addMember);
router.patch("/:teamId/members/:memberId", isAuth,updateMember);
router.patch("/:teamId/members/:memberId/role",isAuth, changeMemberRole);
router.delete("/:teamId/members/:memberId",isAuth, deleteMember);

export default router;
