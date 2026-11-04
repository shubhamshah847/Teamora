import express from 'express'
import {registerController,otpVerify,
    loginController,
    otpNewGenerate,
    registerGoogleController,
    getCurrentUser,
    userLogout,refreshAccessToken,updateAccountSettings
} from '../controllers/auth.controllers.js'
import { isAuth } from '../middleware/auth.middleware.js'
import rateLimiter from '../middleware/rateLimiter.middleware.js'

const router = express.Router()

router.post('/user/register',rateLimiter,registerController)
router.post('/user/login',rateLimiter,loginController)
router.post('/verify-otp',otpVerify)
router.post('/generate-new-otp',rateLimiter,otpNewGenerate)
router.post('/user/google/register',rateLimiter,registerGoogleController)
router.get('/get-current-user',isAuth,getCurrentUser)
router.patch('/account',isAuth,updateAccountSettings)
router.get('/logout',isAuth,userLogout)
router.post('/refresh-access-token',refreshAccessToken)

export default router;