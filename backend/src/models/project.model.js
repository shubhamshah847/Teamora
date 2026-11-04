import mongoose from "mongoose";

const projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "project name required"],

    },
    description: {
        type: String,
        required: [true, "description required"],
        trim: true,
        default: ""
    },
    Team: {

        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        required: true,
    },
    status:{
        enum:["pending","planned","in-progress","active","completed","archived"],
        type:String,
        required:[true,"status are required"],
        default:"planned"
    },
    duesTime:{
        type:Date,
        required:[true,"Due date is required"]
    }
},{
        timestamps: true
    }
)

projectSchema.index({ team: 1 });
projectSchema.index({ team: 1, status: 1 });
projectSchema.index({ "members": 1 });

const projectModel = mongoose.model("project",projectSchema)

export default projectModel;


