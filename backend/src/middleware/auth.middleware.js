import jwt from 'jsonwebtoken'
export const isAuth = (req,res,next)=>{
    console.log("request received for authentication check");
    const authorization = req.headers.authorization
    const accessToken = authorization?.startsWith('Bearer')
        ? authorization.slice(7)
        : null
    console.log("accessTOKEN",accessToken)
    if(!accessToken) return res.status(401).json({message:"your are not a user"})
    try {
        const decoded = jwt.verify(accessToken,process.env.JWT_WEB_TOKEN) 
        console.log("decoded token:", decoded);
        req.user=decoded.id
        console.log("user authenticated with id:", req.user);
        next()
    } catch (error) {
        // conosle.error("Authentication error:", error);
        res.status(401).json({
            message:"you are not verified user"
        })
    }
}