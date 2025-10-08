const { OAuth2Client } = require('google-auth-library');
const { signAccess, signRefresh } = require("../utils/jwt");
const { pickUser } = require("../utils/user");
const { ObjectId } = require('mongodb');


const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauthClient = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    ''  
  );

exports.googleVerify = async (req, res) => {

    try {
        const db = req.app.locals.db;
        const { code } = req.body;
        if (!code) return res.status(400).json({ message: 'code required' });

        // auth code → tokens 교환
        const { tokens } = await oauthClient.getToken(code);
        if (!tokens.id_token) return res.status(401).json({ message: 'no id_token from Google' });
        
        // id_token 검증
        const ticket = await oauthClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        //  DB에서 사용자 조회
        const user = await db.collection('users').findOne({provider : 'google', providerID : payload.sub})
        
        //신규 가입 유도 -> status 및 google token 내부 고유ID 반환
        if(!user) return res.status(200).json({
            status : 'need-signup', 
            prefill: {email: payload.email ?? null, name: payload.name ?? null, picture: payload.picture ?? null}, 
            hint : {provider: 'google', providerID: payload.sub }
        });
        
        //기존 가입자 -> access token 발급
        const accessToken = signAccess(user)
        const refreshToken = signRefresh(user)
        await db.collection('users').updateOne(
            { _id: user._id },
            { $set: { lastLoginAt: new Date() } }
          );

        return res.json({ status: "login", accessToken, refreshToken, user: pickUser(user) });


    } catch(err) {
        console.error("토큰 검증 실패");
        return res.status(401).json({ message: 'Invalid Google ID token' });
    }
}

exports.googleSignUp = async (req, res) => {

    try {
        const db = req.app.locals.db;
        const { providerID, nickname, birthdate, gender, email, name, picture } = req.body;
        if (!providerID) return res.status(400).json({ message: 'providerID required' });
    
        const exists = await db.collection('users').findOne({ provider: 'google', providerID });
        if (exists) return res.status(409).json({ message: 'already-registered' });
        
        const now = new Date();
        const newUserInfo = {
            provider: 'google',
            providerID,
            email:   email   ?? null,
            name:    name    ?? null,
            picture: picture ?? null,
            nickname: String(nickname).trim(),
            birthdate: birthdate ?? null, // "YYYY-MM-DD" 가정
            gender:    gender    ?? null,
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now,
        };
        
        const result = await db.collection('users').insertOne(newUserInfo);
        const newUser = {...newUserInfo, _id: result.insertedId};

        const accessToken = signAccess(newUser)
        const refreshToken = signRefresh(newUser)

        return res.status(201).json({ status: "registered", accessToken, refreshToken, user: pickUser(newUser) });
    
    } catch (err) {
        console.error('googleSignUp failed:', err);
        return res.status(500).json({ message: 'server error' });
      }

}


exports.googleRefresh = async (req,res) => {
    try{
        return res.status(200).json({ message: '미구현 된 기능입니다.'})
    } catch {
        return res.status(401).json({ message: 'invalid or expired idToken' });
    }
}

exports.logout = async (req,res) => {
    return res.status(200).json({ message: '로그아웃 되었습니다.' });
}


