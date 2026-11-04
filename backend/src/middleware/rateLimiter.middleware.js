import { redis } from "../app.js";

const rateLimiter = async (req, res, next) => {
    try {
        const key = `rate:${req.id}`
        const requests = await redis.incr(key)
        
        if (requests === 1) {
            await redis.expire(key, 60);
        }

        if (requests > 5) {
            return res.status(429).json({
                message:"Too many requests. Try again later."
            });
        }

        next();

    } catch (error) {
        console.error("Rate limiter failed:", error);
       
    }
};

export default rateLimiter;