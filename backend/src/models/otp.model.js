import mongoose from "mongoose";

const otpSchema  = new mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"user",
        required:false
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    name: {
        type: String
    },
    password: {
        type: String
    },
    otp:{
        type:String,
        required:true,
        length:6
    },
    expiresAt:{
        type:Date,
        required:true,
        default:()=>new Date(Date.now()+5*60*1000)
    }
},{
    timestamps:true
})

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    
const otpModel = mongoose.model("otp",otpSchema)

export default otpModel;
