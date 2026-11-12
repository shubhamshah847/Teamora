import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name:{
        type:String,
        required:[true,"Name is required"]
    },
    email:{
        type:String,
        required:[true,"Email is required"],
        lowercase:true,
        match:[/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,"email is not valid"]
    },
    password:{
        type:String,
        required:[true,"password is required "],
        minlength:[6,"minimun 6 letters password reqruied"]
    },
    
    isVerified:{
        type:Boolean,
        default:false
    },
    role:{
        type:String,
        enum:["user","admin"],
        default:"user"
    },
})

const userModel = mongoose.model("User",userSchema)

export default userModel ;