
import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Task title required"],
            trim: true
        },

        description: {
            type: String,
            trim: true,
            default: ""
        },

        status: {
            type: String,
            enum: ["pending", "in-progress", "completed"],
            default: "pending"
        },

        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "project",
            required: true
        },

        members: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        ],

        dueDate: {
            type: Date,
            required: [true, "Due date required"]
        }
    },
    { timestamps: true }
);

taskSchema.index({ project: 1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ members: 1 });

const taskModel = mongoose.model("Task", taskSchema);

export default taskModel;
