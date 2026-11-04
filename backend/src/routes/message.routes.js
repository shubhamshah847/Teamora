import express from 'express';
import { isAuth } from '../middleware/auth.middleware.js';
import * as messageController from '../controllers/message.controller.js';


const router = express.Router();

router.post('/teams/:teamId/messages', isAuth, messageController.sendMessage);
router.get('/teams/:teamId/messages', isAuth, messageController.getTeamMessages);
router.delete('/teams/:teamId/delete-chat', isAuth, messageController.deleteMessage);
router.post('/chat/message-summarize/:teamId',isAuth,messageController.summarizeMessage)
export default router;

