const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { uploadBufferToS3, getSignedReadUrl } = require('../utils/s3');
const mime = require('mime-types');

// exports.recordCreate = async (req, res) => {
//   try {
//     const db = req.app.locals.db;
//     const authHeader = req.headers.authorization;
//     if (!authHeader?.startsWith('Bearer ')) {
//       return res.status(401).json({ message: 'Authorization Bearer token required' });
//     }
//     const accessToken = authHeader.split(' ')[1];
//     const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);

//     const userId = payload.uid;
//     if (!userId) return res.status(401).json({ message: 'token has no user id' });

//     const { context } = req.body;
//     if (!context) return res.status(400).json({ message: 'text is required' });

//     const now = new Date();
//     const doc = {
//       userId: new ObjectId(userId),  
//       type: 'text',
//       context,
//       media: null,
//       createdAt: now,
//       updatedAt: now
//     };

//     await db.collection('records').insertOne(doc);
//     return res.status(201).json({ message: 'record created'});

//   } catch (err) {
//     console.error('createRecord failed:', err);
//     return res.status(500).json({ message: 'server error' });
//   }
// };


//======= text + image ======
exports.recordCreate = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization Bearer token required' });
    }
    const accessToken = authHeader.split(' ')[1];
    const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    const userId = payload.uid;
    if (!userId) return res.status(401).json({ message: 'token has no user id' });

    // 입력 파싱 (multipart or json)
    const context = (req.body?.context ?? '').trim();
    const hasText = context.length > 0;
    
    let media = null;
    if (req.file) {
      // 이미지 검증
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({ message: 'unsupported file type' });
      }
      // 키 생성: userId/YYYY/MM/uuid.ext
      const ext = mime.extension(req.file.mimetype) || 'bin';
      const y = new Date().getFullYear();
      const m = String(new Date().getMonth() + 1).padStart(2, '0');
      const uuid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const key = `records/${userId}/${y}/${m}/${uuid}.${ext}`;

      await uploadBufferToS3({
        buffer: req.file.buffer,
        key,
        contentType: req.file.mimetype,
      });

      media = {
        type: 'image',
        bucket: process.env.AWS_S3_BUCKET,
        key,               // DB엔 key만 저장 (URL은 presigned로 제공)
        mime: req.file.mimetype,
        size: req.file.size,
      };
    }

    if (!hasText && !media) {
      return res.status(400).json({ message: 'text or image required' });
    }

    const now = new Date();
    const doc = {
      userId: new ObjectId(userId),
      type: media && hasText ? 'text+image' : (media ? 'image' : 'text'),
      context: hasText ? context : null,
      media, // {type:'image', key:'...', ...} 또는 null
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('records').insertOne(doc);

    // 클라이언트 미리보기 편의: 읽기 URL(1시간 유효) 포함해서 반환
    let imageUrl = null;
    if (media?.key) {
      imageUrl = await getSignedReadUrl(media.key);
    }

    return res.status(201).json({
      message: 'record created',
      record: {
        id: result.insertedId.toString(),
        type: doc.type,
        context: doc.context,
        imageUrl, // presigned URL (옵션)
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error('createRecord failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.recordList = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization Bearer token required' });
    }

    const accessToken = authHeader.split(' ')[1];
    const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    const userId = payload.uid;
    if (!userId) return res.status(401).json({ message: 'token has no user id' });

    // DB에서 현재 유저의 기록 가져오기 (최신순)
    const records = await db.collection('records')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();

    // 각 record에 presigned URL 붙이기
    const mapped = await Promise.all(records.map(async (r) => {
      let imageUrl = null;
      if (r.media?.key) {
        imageUrl = await getSignedReadUrl(r.media.key); // 유효시간 기본 1시간
      }
      return {
        id: r._id.toString(),
        type: r.type,
        context: r.context,
        imageUrl,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }));

    return res.status(200).json({
      message: 'record 목록 불러오기 성공',
      count: mapped.length,
      records: mapped,
    });
  } catch (err) {
    console.error('record list failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.recordUpdate = async (req, res) => {
    try {
        const db = req.app.locals.db;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(400).json({ message: "Authorization Bearer token required" });
        }
        const accessToken = authHeader.split(" ")[1];
        const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET)
        
        const ownerId = payload.uid
        if(!ownerId) return res.status(401).json({ message: 'token has no user id' })

        const {_id, context } = req.body;
        if (!_id) return res.status(400).json({ message: "record _id is required" });

        const record = await db.collection("records").findOne({ _id: new ObjectId(_id) });
        if (!record) return res.status(404).json({ message: "record not found" });

        if (record.userId.toString() !== ownerId) return res.status(403).json({ message: "수정 권한이 없습니다." });

        const updateFields = {};
        if (context) updateFields.context = context;
        // if (date) updateFields.date = date;
        if (Object.keys(updateFields).length === 0) 
        return res.status(400).json({ message: "수정할 필드를 적어도 하나는 입력해주세요." });
        
        updateFields.updatedAt = new Date();
        
        await db.collection('records').updateOne({_id: new ObjectId(_id)}, {$set: updateFields });
        return res.status(200).json({message: 'update 성공'})

        
        } catch (err) {
        console.error("record update failed:", err);
        return res.status(500).json({ message: "server error" });
        }   
}


exports.recordDelete = async (req, res) => {
    try {
        const db = req.app.locals.db;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(400).json({ message: "Authorization Bearer token required" });
        }
        const accessToken = authHeader.split(" ")[1];
        const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET)
        
        const ownerId = payload.uid
        if(!ownerId) return res.status(401).json({ message: 'token has no user id' })

        const {_id} = req.body;
        if (!_id) return res.status(400).json({ message: "record _id is required" });

        const record = await db.collection("records").findOne({ _id: new ObjectId(_id) });
        if (!record) return res.status(404).json({ message: "record not found" });

        if (record.userId.toString() !== ownerId) return res.status(403).json({ message: "수정 권한이 없습니다." });
        
        await db.collection('records').deleteOne({_id: new ObjectId(_id)});
        return res.status(200).json({message: 'delete 성공'})

        
        } catch (err) {
        console.error("record delete failed:", err);
        return res.status(500).json({ message: "server error" });
        }   
}