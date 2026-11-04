import mongoose from 'mongoose'

const connectToDb = async()=>{
    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("connected to DB")
    } catch (err) {
        console.error("Database connection failed:",err)
        
    }
    
} 
export default connectToDb ;