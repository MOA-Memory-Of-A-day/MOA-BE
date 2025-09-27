const { OAuth2Client } = require('google-auth-library');
const { signAccess, signRefresh } = require("../utils/jwt");
const { pickUser } = require("../utils/user");
const { ObjectId } = require('mongodb');


const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

exports.googleVerify = async (req, res) => {

    try {
        const db = req.app.locals.db;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(400).json({ message: "Authorization Bearer token required" });
        }
        const idToken = authHeader.split(" ")[1];

        const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
        const payload = ticket.getPayload();
        const user = await db.collection('users').findOne({provider : 'google', providerID : payload.sub})
        
        //신규 가입자는 token내 정보 반환 후 추가 정보 기입받아서 로그인 절차 유도
        if(!user) return res.status(200).json({ status : 'need-signup'})
        
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
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(400).json({ message: "Authorization Bearer token required" });
        }
        const idToken = authHeader.split(" ")[1];
        const {nickname, birthdate, gender} = req.body;

        const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
        const payload = ticket.getPayload();
        
        let user = await db.collection('users').findOne({provider : 'google', providerID : payload.sub})
        
        //가입된 정보가 있다면 409 에러 발송
        if (user) return res.status(409).json({ message: 'already-registered' });
        
        const now = new Date();
        const newUserInfo = {
            provider: 'google',
            providerID: payload.sub,                         // 고정 식별자
            email: payload.email ?? null,                     // 동의/변경 가능
            name: payload.name ?? null,
            picture: payload.picture ?? null,
            nickname: String(nickname).trim(),
            birthdate: birthdate,             // ex) "2000-01-31"
            gender: gender,                   // ex) "male"
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now,
          };
        
        const result = await db.collection('users').insertOne(newUserInfo);
        const newUser = {...newUserInfo, _id: result.insertedId};

        const accessToken = signAccess(newUser)
        const refreshToken = signRefresh(newUser)


        return res.status(201).json({ status: "registered", accessToken, refreshToken, user: pickUser(newUser) });


    } catch(err) {
        return res.status(401).json({ message: 'invalid or expired idToken' });
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
    // Client 에서 토큰 만료 처리
    return res.status(200).json({ message: '로그아웃 되었습니다.' });
}




// exports.getUser = async(req, res)=>{
//     try{
//         console.log(req.token);
//         const userId = req.token.userId;
//         console.log(userId)
         
//         const userInfo = await db.collection('users').findOne({ _id : new ObjectId(userId)})
//         console.log(userInfo)
//         if(!userInfo) {
//             console.log("등록되지않은 유저 정보 요청")
//             return res.status(400).json({
//                 message: "찾을 수 없는 유저입니다.",
//                 userInfo: null
//             })
//         } 

//         return res.status(200).json({
//             message: "유저 정보 불러오기 성공.",
//             userId,
//             university: userInfo.university,
//             studentId: userInfo.studentId,
//             major: userInfo.major,
//             status: userInfo.status,

//         })
        
//     } catch (error) {
//         console.log("token:", token);
//         console.log("userId:", userId);  // undefined 인지 확인
//         console.error('유저 정보 조회 오류:', error);
//         res.status(500).json({ message: '서버 오류 발생' });
//     }

// }

// // 클라이언트로부터 로그인정보를 받아옴.
// exports.register = async (req,res) =>{
//     try{
//         const { 
//             loginId, 
//             password, 
//             email, 
//             phone, 
//             university,
//             studentId,
//             major,
//             status
//         } = req.body;

//         if (
//             !loginId||
//             !password||
//             !email||
//             !phone||
//             !university||
//             !studentId||
//             !major||
//             !status
//         ) {
//             console.log("Registration failed : 모든 필드값 입력 필요.")
//             return res.status(400).json({message:"모든 필드를 입력해주세요."})
//         }

//         if (!email.includes('@')) {
//             console.log("Registration failed : 올바른 이메일 형식 입력 필요.")
//             return res.status(400).json({ message: '이메일 형식이 올바르지 않습니다.' });
//           }

//         //유효성 검사(이미 가입된 이메일인지 확인)
//         const userExist = await db.collection('users').findOne({ email });
//         if (userExist) {
//             console.log("이미 가입된 이메일 입니다.");
//             return res.status(409).json({ message: "이미 가입된 이메일 입니다." });
//         }

        
//         const saltRounds = 10;
//         const hashedPassword = await bcrypt.hash(password, saltRounds);

        
//         const result = await db.collection('users').insertOne({
//                 loginId,
//                 password: hashedPassword,
//                 email,
//                 phone,
//                 university,
//                 studentId,
//                 major,
//                 status //string
//             });

//         const userId = result.insertedId

//         await db.collection('tasks').insertMany([
//             { userId : new ObjectId(userId),taskCategory : "학부연구생",title: "", note: "상세 내용을 입력해주세요", status: 0},
//             { userId : new ObjectId(userId),taskCategory : "현장실습",title: "", note: "상세 내용을 입력해주세요", status: 0},
//             { userId : new ObjectId(userId),taskCategory : "인턴",title: "", note: "상세 내용을 입력해주세요", status: 0},
//             { userId : new ObjectId(userId),taskCategory : "전공연수",title: "", note: "상세 내용을 입력해주세요", status: 0},
//             { userId : new ObjectId(userId),taskCategory : "경진대회",title: "", note: "상세 내용을 입력해주세요", status: 0},
//             { userId : new ObjectId(userId),taskCategory : "한국어도우미",title: "", note: "상세 내용을 입력해주세요", status: 0},
//             ]);
//         res.status(201).json({ message: '회원가입 성공' });
        
//     } catch (err) {
//         console.log("Registration failed 서버 오류")
//         const status = err.status || 500;
//         const message = err.message || '서버 오류';
//         return res.status(status).json({ message });
//     }
// };


//== 구글 로그인 후 발급받은 토큰 전달
