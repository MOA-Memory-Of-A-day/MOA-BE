const { OAuth2Client } = require('google-auth-library');
const { signAccess, signRefresh } = require("../utils/jwt");
const { pickUser } = require("../utils/user");
const { ObjectId } = require('mongodb');
const crypto = require('crypto');



const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauthClient = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'postmessage'  
  );

// exports.googleVerify = async (req, res) => {

//     try {
//         const db = req.app.locals.db;
//         const { code } = req.body;
//         if (!code) return res.status(400).json({ message: 'code required' });
//         // console.log(code)
//         // auth code → tokens 교환
//         const { tokens } = await oauthClient.getToken(code);
//         if (!tokens.id_token) return res.status(401).json({ message: 'no id_token from Google' });
//         // console.log(tokens)
//         // id_token 검증
//         const ticket = await oauthClient.verifyIdToken({
//         idToken: tokens.id_token,
//         audience: GOOGLE_CLIENT_ID,
//         });
//         const payload = ticket.getPayload();
//         // console.log('id_token aud:', payload.aud);

//         //  DB에서 사용자 조회
//         const user = await db.collection('users').findOne({provider : 'google', providerID : payload.sub})
        
//         //신규 가입 유도 -> status 및 google token 내부 고유ID 반환
//         if(!user) return res.status(200).json({
//             status : 'need-signup', 
//             prefill: {email: payload.email ?? null, name: payload.name ?? null, picture: payload.picture ?? null}, 
//             hint : {provider: 'google', providerID: payload.sub }
//         });
        
//         //기존 가입자 -> access token 발급
//         const accessToken = signAccess(user)
//         const refreshToken = signRefresh(user)
//         await db.collection('users').updateOne(
//             { _id: user._id },
//             { $set: { lastLoginAt: new Date() } }
//           );

//         return res.json({ status: "login", accessToken, refreshToken, user: pickUser(user) });


//     } catch(err) {
//         console.error("토큰 검증 실패");
//         return res.status(401).json({ message: 'Invalid Google ID token' });
//     }
// }

exports.googleVerify = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'code required' });
    }

    let tokens;
    try {
      // ✅ Auth code → tokens 교환 시도
      tokens = (await oauthClient.getToken(code)).tokens;
      if (!tokens.id_token) {
        console.error('[DEBUG] getToken success but no id_token:', tokens);
        return res.status(401).json({ message: 'no id_token from Google' });
      }
    } catch (err) {
      // ✅ getToken 단계에서 발생한 에러 디버그
      const detail = err?.response?.data || err?.message || err;
      console.error('[DEBUG] getToken() failed:', detail);
      return res.status(401).json({
        message: 'Google token exchange failed',
        detail,
      });
    }

    // ✅ id_token 검증
    let ticket;
    try {
      ticket = await oauthClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: GOOGLE_CLIENT_ID,
      });
    } catch (verifyErr) {
      console.error('[DEBUG] verifyIdToken() failed:', verifyErr.message);
      return res.status(401).json({
        message: 'Invalid Google ID token',
        detail: verifyErr.message,
      });
    }

    const payload = ticket.getPayload();
    console.log('[DEBUG] Google ID Token payload:', {
      aud: payload.aud,
      sub: payload.sub,
      email: payload.email,
    });

    // ✅ DB에서 사용자 조회
    const user = await db.collection('users').findOne({
      provider: 'google',
      providerID: payload.sub,
    });

    // 신규가입 유도
    if (!user) {
      return res.status(200).json({
        status: 'need-signup',
        prefill: {
          email: payload.email ?? null,
          name: payload.name ?? null,
          picture: payload.picture ?? null,
        },
        hint: { provider: 'google', providerID: payload.sub },
      });
    }

    // 기존 가입자 → 토큰 발급
    const accessToken = signAccess(user);
    const refreshToken = signRefresh(user);
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: new Date() } }
    );

    return res.json({
      status: 'login',
      accessToken,
      refreshToken,
      user: pickUser(user),
    });

  } catch (err) {
    const detail = err?.response?.data || err?.message || String(err);
    console.error('[DEBUG] googleVerify total failed:', detail);
    return res.status(500).json({
      message: 'server error during googleVerify',
      detail,
    });
  }
};

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


/**
 * 개발/테스트 전용 로그인
 * 헤더: X-Dev-Secret: {DEV_LOGIN_SECRET}
 * 바디: { email?, nickname?, role? }  (원하는 필드 몇 개만)
 * - 해당 유저가 없으면 provider='dev' 로 생성
 * - 있으면 그대로 사용
 * - access/refresh 토큰 발급
 */
exports.devLogin = async (req, res) => {
    try {
      // 안전장치 1: 프로덕션 차단
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: 'dev login disabled in production' });
      }
  
      // 안전장치 2: 비밀키 검사
      const secret = req.header('X-Dev-Secret');
      if (!secret || secret !== process.env.DEV_LOGIN_SECRET) {
        return res.status(401).json({ message: 'invalid dev secret' });
      }
  
      const db = req.app.locals.db;
      const { email, nickname, role } = req.body || {};
  
      // 최소 식별값 보장: email 없으면 더미 생성
      const safeEmail = (email && String(email).trim()) || `dev_${Date.now()}@example.local`;
      const safeNickname = (nickname && String(nickname).trim()) || 'Dev User';
  
      // providerID 는 불변 식별자로 쓰자 (이메일 기반 or 랜덤)
      const providerID = `dev_${crypto.createHash('sha256').update(safeEmail).digest('hex').slice(0, 24)}`;
  
      // 찾거나 만들기
      let user = await db.collection('users').findOne({ provider: 'dev', providerID });
      if (!user) {
        const now = new Date();
        const newUserInfo = {
          provider: 'dev',
          providerID,
          email: safeEmail,
          name: null,
          picture: null,
          nickname: safeNickname,
          role: role ?? 'tester',     // 선택
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        };
        const result = await db.collection('users').insertOne(newUserInfo);
        user = { ...newUserInfo, _id: result.insertedId };
      } else {
        // 접속 로그만 업데이트
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { lastLoginAt: new Date() } }
        );
      }
  
      const accessToken = signAccess(user);
      const refreshToken = signRefresh(user);
      return res.status(200).json({
        status: 'login',
        accessToken,
        refreshToken,
        user: pickUser(user),
      });
    } catch (err) {
      console.error('devLogin failed:', err);
      return res.status(500).json({ message: 'server error' });
    }
  };

exports.logout = async (req,res) => {
    return res.status(200).json({ message: '로그아웃 되었습니다.' });
}


