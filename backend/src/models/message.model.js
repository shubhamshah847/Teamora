import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    userId:{
        required: true,
        type:String,
        ref:'User'
    },
    teamId:{
        required: true,
        type:String,
        ref:'Team'
    },
    content:{
        required:true,
        type:String,
    }
},{timestamps:true})

messageSchema.index({teamId:1})

const messageModel = mongoose.model('Message',messageSchema)
export default messageModel ; 