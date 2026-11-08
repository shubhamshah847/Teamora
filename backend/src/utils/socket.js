import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Team from "../models/team.model.js";

let io;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "https://teamora-web.vercel.app/",
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_WEB_TOKEN);
      if (!decoded.id) return next(new Error("Invalid authentication token"));
      socket.user = { id: decoded.id };
      next();
    } catch {
      next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("user connected id:", socket.id);

    socket.on("join_team", async ({ teamId } = {}, ack) => {
      try {
        if (!mongoose.isValidObjectId(teamId)) {
          return ack?.({ ok: false, error: "Invalid team" });
        }

        const team = await Team.findOne({
          _id: teamId,
          $or: [{ owner: socket.user.id }, { "members.user": socket.user.id }],
        }).select("_id");

        if (!team) return ack?.({ ok: false, error: "Not a team member" });

        await socket.join(`team:${teamId}`);
        ack?.({ ok: true });
      } catch (error) {
        console.error("join_team socket error:", error);
        ack?.({ ok: false, error: "Could not join team" });
      }
    });

    socket.on("disconnect", () => {
      console.log("user disconnected id:", socket.id);
    });
  });

  return io;
}

export const getIO = () => io;
export default initializeSocket;


