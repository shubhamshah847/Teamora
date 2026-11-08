import userModel from "../models/user.models.js";
import otpModel from "../models/otp.model.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { redis } from "../app.js";

import generateOtp from "../utils/otp.js";
import { sendOtp, regrestationEmail } from "../services/email.service.js";

const refreshCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 15 * 24 * 60 * 60 * 1000,
};

export const registerController = async (req, res) => {
    const { name, email, password, googleId } = req.body;

    if (!email || !name) {
        return res.status(400).json({ message: "Name and email are required" });
    }

    if (password) {
        if (password.length < 7) {
            return res.status(400).json({ message: "Minimum 7 characters password required" });
        }
    } else if (!googleId) {
        return res.status(400).json({ message: "Password or Google ID is required, sign again with Google" });
    }

    try {
        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await userModel.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(422).json({ message: "User already exists", status: "failed" });
        }

        const hashedPassword = password ? await bcrypt.hash(password, 10) : googleId;
        const otp = String(generateOtp());
        // await otpModel.deleteMany({ email: normalizedEmail });
        // await otpModel.create({
        //     email: normalizedEmail,
        //     name: name.trim(),
        //     password: hashedPassword,
        //     otp,
        // });
        const redisOtp = await redis.set(
            `otp:${normalizedEmail}`,
            JSON.stringify({ otp, name: name.trim(), password: hashedPassword }),
            "EX",
            1000
        )
        const sent = await sendOtp(normalizedEmail, name.trim(), otp);
        if (!sent) {
            await redis.del(`otp:${normalizedEmail}`)
            return res.status(502).json({ message: "OTP could not be sent. Please try again." });
        }

        return res.status(200).json({
            message: "Verification code sent. Your account will be created after verification.",
            pendingVerification: { name: name.trim(), email: normalizedEmail },
        });
    } catch (err) {
        console.error("User registration failed:", err);
        return res.status(500).json({ message: "User not created" });
    }
};
export const loginController = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Minimum 6 letters password required" });
    }

    try {
        const isExist = await userModel.findOne({ email: email.toLowerCase() });
        if (!isExist) {
            return res.status(422).json({ message: "User does not exist" });
        }

        if (!isExist.isVerified) {
            return res.status(403).json({ message: "Please verify your email first." });
        }

        const isValidPassword = await bcrypt.compare(password, isExist.password);
        if (!isValidPassword) {
            return res.status(400).json({ message: "Email or password wrong" });
        }

        const refreshToken = jwt.sign({ id: isExist._id }, process.env.JWT_WEB_TOKEN, { expiresIn: '7d' });
        const accessToken = jwt.sign({ id: isExist._id }, process.env.JWT_WEB_TOKEN, { expiresIn: '15m' });

        res.cookie('token', refreshToken, {
            ...refreshCookieOptions,
        });

        return res.status(200).json({
            message: "Login successfully",
            accessToken,
            user: { ...isExist.toObject(), password: undefined },
        });
    } catch (err) {
        console.error("Login failed:", err);
        return res.status(500).json({ message: "Not logged in. Something went wrong." });
    }
};
export const otpVerify = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required." });
    }

    if (!/^\d{6}$/.test(String(otp))) {
        return res.status(400).json({ message: "OTP must be 6 digits." });
    }

    try {
        const normalizedEmail = email.toLowerCase().trim();
        // const pendingSignup = await otpModel.findOne({
        //     email: normalizedEmail,
        //     expiresAt: { $gt: new Date() },
        // }).sort({ createdAt: -1 });

        // if (!pendingSignup) {
        //     return res.status(400).json({ message: "Verification code not found or expired. Please register again." });
        // }
        // if (pendingSignup.otp !== String(otp)) {
        //     return res.status(400).json({ message: "OTP is incorrect." });
        // }
        const pendingSignup = await redis.get(`otp:${normalizedEmail}`)
        console.log("redis otp -get", pendingSignup)
        if (!pendingSignup) {
            return res.status(400).json({ message: "Verification code is not found or expired. Please register again." })
        }

        const pendingData = JSON.parse(pendingSignup)
        if (pendingData.otp !== String(otp)) {
            return res.status(400).json({ message: "OTP is incorrect." })
        }

        const user = await userModel.create({
            name: pendingData.name,
            email: normalizedEmail,
            password: pendingData.password,
            isVerified: true,
        });
        await redis.del(`otp:${normalizedEmail}`)

        try {
            await regrestationEmail(user.email, user.name);
        } catch (emailError) {
            console.error("Registration email failed:", emailError);
        }

        const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_WEB_TOKEN, { expiresIn: '15d' });
        const accessToken = jwt.sign({ id: user._id }, process.env.JWT_WEB_TOKEN, { expiresIn: '15m' });
        res.cookie('token', refreshToken, {
            ...refreshCookieOptions,
        });

        return res.status(200).json({
            message: "Email verified and account created successfully.",
            accessToken,
            user: { _id: user._id, name: user.name, email: user.email },
        });
    } catch (err) {
        console.error("OTP verification failed:", err);
        return res.status(500).json({ message: "Something went wrong while verifying OTP." });
    }
};
export const otpNewGenerate = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required." });
    }

    try {

        const normalizedEmail = email.toLowerCase().trim();
        // const pendingSignup = await otpModel.findOne({ email: normalizedEmail });
        // if (!pendingSignup) {
        //     return res.status(404).json({ message: "Pending signup not found. Please register again." });
        // }
        const user = await userModel.findOne({ email: normalizedEmail })
        if (!user) return res.status(404).json({ message: "User not found." })
        if (user.isVerified) return res.status(409).json({message:"you are already verified"})
        const otp = String(generateOtp());
        await redis.set(
            `otp:${normalizedEmail}`,
            JSON.stringify({ otp, name: user.name, password: user.password }),
            "EX",
            1000
        )
        // pendingSignup.otp = otp;
        // pendingSignup.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        // await pendingSignup.save();

        const sent = await sendOtp(user.email, user.name, otp);
        if (!sent) {
            return res.status(500).json({ message: "Email not sent" });
        }

        return res.status(200).json({ message: "OTP sent successfully." });
    } catch (err) {
        console.error("OTP generation failed:", err);
        return res.status(500).json({ message: "Something went wrong while creating a new OTP." });
    }
};
export const registerGoogleController = async (req, res) => {
    const { name, email, googleId } = req.body;
    if (!email || !name) {
        return res.status(400).json({ message: "Name and email are required" });
    }

    if (!googleId) {
        return res.status(400).json({ message: "Google ID is required" });
    }

    try {
        const isExist = await userModel.findOne({ email: email.toLowerCase() });
        if (isExist) {
            return res.status(422).json({ message: "User already exists", status: "failed" });
        }

        const user = await userModel.create({
            name,
            email: email.toLowerCase(),
            password: googleId,
            isVerified: true,
        });
        const token = jwt.sign({ id: user._id }, process.env.JWT_WEB_TOKEN, { expiresIn: '15d' });
        res.cookie('token', token, {
            ...refreshCookieOptions,
        });

        await regrestationEmail(user.email, user.name);
        return res.status(200).json({
            message: "User created successfully",
            user: user,
            accessToken: token,
        });
    } catch (err) {
        console.error("Google registration failed:", err);
        return res.status(500).json({ message: "User not created" });
    }
};
export const getCurrentUser = async (req, res) => {
    const id = req.user;
    if (!id) return res.status(401).json({ message: "ID not found" });

    try {
        const user = await userModel.findById(id).select("-password");
        return res.status(200).json({ message: "Successfully found user", user });
    } catch (error) {
        console.error("User lookup failed:", error);
        return res.status(401).json({ message: "User not found" });
    }
};

export const updateAccountSettings = async (req, res) => {
    const { name, currentPassword, newPassword } = req.body;
    if (name === undefined && (!currentPassword || !newPassword)) {
        return res.status(400).json({ message: "Provide a profile name or password change details." });
    }
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ message: "Name cannot be empty." });
    }
    if ((currentPassword || newPassword) && (!currentPassword || !newPassword)) {
        return res.status(400).json({ message: "Enter both your current and new password." });
    }
    if (newPassword && newPassword.length < 7) {
        return res.status(400).json({ message: "New password must be at least 7 characters." });
    }

    try {
        const user = await userModel.findById(req.user);
        if (!user) return res.status(404).json({ message: "Account not found." });

        if (newPassword) {
            const passwordMatches = await bcrypt.compare(currentPassword, user.password);
            if (!passwordMatches) return res.status(400).json({ message: "Current password is incorrect." });
            user.password = await bcrypt.hash(newPassword, 10);
        }
        if (name !== undefined) user.name = name.trim();

        await user.save();
        return res.status(200).json({
            message: newPassword ? "Account settings and password updated." : "Profile updated successfully.",
            user: { _id: user._id, name: user.name, email: user.email, role: user.role },
        });
    } catch (error) {
        console.error("Account settings update failed:", error);
        return res.status(500).json({ message: "Unable to update account settings." });
    }
};

export const userLogout = async (req, res) => {
    try {
        res.clearCookie('token', refreshCookieOptions);
        return res.status(200).json({ message: "Logout successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Logout failed" });
    }
};
export const refreshAccessToken = async (req, res) => {
    console.log("refreshAcessToken hit ")
    const refreshToken = req.cookies?.token;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token is missing. Please log in again." });

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_WEB_TOKEN);

        const user = await userModel.findById(decoded.id).select("_id isVerified");
        if (!user || !user.isVerified) {
            res.clearCookie("token", refreshCookieOptions);
            return res.status(401).json({ message: "Refresh token is no longer valid. Please log in again." });
        }
        const accessToken = jwt.sign({ id: user._id }, process.env.JWT_WEB_TOKEN, { expiresIn: "15m" });
        console.log("new access token",accessToken)
        const newRefreshToken = jwt.sign({ id: user._id }, process.env.JWT_WEB_TOKEN, { expiresIn: "15d" });
        console.log("new refresh token",newRefreshToken)
        res.clearCookie("token", refreshCookieOptions);
        res.cookie("token", newRefreshToken, refreshCookieOptions);

        return res.status(200).json({ message: "Access token refreshed", accessToken });
    } catch (error) {
        console.error("Refresh token failed:", error);
        res.clearCookie("token", refreshCookieOptions);
        return res.status(401).json({ message: "Refresh token expired or invalid. Please log in again." });
    }
};
