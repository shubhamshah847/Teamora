import express from 'express'
import dotenv from 'dotenv'
dotenv.config()
import Redis from 'ioredis'
import cors from 'cors'
import connectToDb from './db/db.js'
import authRoutes from './routes/auth.routes.js'
import teamRoutes from './routes/team.routes.js'
import projectRoutes from './routes/project.routes.js'
import messageRoutes from './routes/message.routes.js'
import taskRoutes from './routes/task.routes.js'
import cookieParser from 'cookie-parser'
const app = express()




app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

connectToDb()


export const redis = new Redis(process.env.REDIS_URI)

app.use(cookieParser())
app.use(express.json())
app.use('/auth',authRoutes)
app.use('/teams',teamRoutes)
app.use('/team',projectRoutes)
app.use('/team',taskRoutes)
app.use('/chat',messageRoutes)


export default app ;