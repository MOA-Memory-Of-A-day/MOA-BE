const { OAuth2Client } = require('google-auth-library');
// const bcrypt = require('bcrypt');
// const jwt = require('jsonwebtoken');
// const connectDB = require('../database');
// const { ObjectId } = require('mongodb');

// let db;
// connectDB.then((client) => {
//     db = client.db(process.env.DB_NAME); 
// }).catch((err) => {
//     console.error("Database connection failed:", err);
//     throw { status: 500, message: "Database connection failed" };
// });


const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

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

exports.googleLogin = async (req, res) => {
    
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken required' });

    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: CLIENT_ID, // 반드시 웹 클라 ID
        });
        const payload = ticket.getPayload();
        console.log(payload);
        
        return res.json({
            message: 'Google token verified',
            userid: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            email_verified: payload.email_verified,
          });


    } catch(err) {
        console.error("토큰 검증 실패");
        return res.status(401).json({ message: 'Invalid Google ID token' });
    }
   
}

exports.logout = async (req,res) => {
    // Client 에서 토큰 만료 처리
    return res.status(200).json({ message: '로그아웃 되었습니다.' });
}