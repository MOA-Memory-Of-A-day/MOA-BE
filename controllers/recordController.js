const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { uploadBufferToS3, getSignedReadUrl, deleteFromS3 } = require('../utils/s3');
const { transcribeAudioBuffer } = require('../utils/stt');
const mime = require('mime-types');


//======= text + image ======
exports.recordCreate = async (req, res) => {
  try {

    console.log('[upload]', {
      fieldname: req.file?.fieldname,
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });
    const db = req.app.locals.db;

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization Bearer token required' });
    }
    const accessToken = authHeader.split(' ')[1];
    const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    const userId = payload.uid;
    if (!userId) return res.status(401).json({ message: 'token has no user id' });

    
    let context = (req.body?.context ?? '').trim();
    const hasText = context.length > 0;
    const file = req.file || null;
    
    let media = null;
    let type = 'text';
    if (file) {
      
      const isImage = file.mimetype?.startsWith('image/');
      const isAudio = file.mimetype?.startsWith('audio/');


    if (isImage) {
      // 이미지 MIME 허용
      const allowedImg = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      if (!allowedImg.includes(file.mimetype)) {
        return res.status(400).json({ message: 'unsupported image type' });
      }

      // S3 업로드
      const ext = mime.extension(file.mimetype) || 'bin';
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const uuid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const key = `records/${userId}/${y}/${m}/${uuid}.${ext}`;

      await uploadBufferToS3({
        buffer: file.buffer,
        key,
        contentType: file.mimetype,
      });

      media = {
        type: 'image',
        bucket: process.env.AWS_S3_BUCKET,
        key,
        mime: file.mimetype,
        size: file.size,
      };

      // 타입 결정
      type = hasText ? 'text+image' : 'image';
    } else if (isAudio) {
        // 오디오는 S3 저장 안 함 → Whisper로 텍스트 변환
        const allowedAud = [
          'audio/mpeg', 'audio/mp3', 'audio/mp4',
          'audio/wav', 'audio/x-wav',
          'audio/aac', 'audio/x-m4a', 'audio/m4a',
          'audio/ogg', 'audio/webm',
        ];
        if (!allowedAud.includes(file.mimetype)) {
          return res.status(400).json({ message: 'unsupported audio type' });
        }

        // Whisper 호출
        const filename = `audio.${mime.extension(file.mimetype) || 'bin'}`;
        const transcript = await transcribeAudioBuffer(file.buffer, filename, 'ko');

        // 기존 입력 텍스트가 있다면 붙여서 저장 (원하면 정책 변경 가능)
        context = [context, transcript].filter(Boolean).join('\n');
        if (!context) {
          return res.status(502).json({ message: 'STT failed: empty transcript' });
        }

        // 텍스트만 저장
        media = null;
        type = 'text';
      }
      else {
        return res.status(400).json({ message: 'unsupported file type' });
      }
    } else {
      // 파일이 없으면 텍스트만
      if (!hasText) {
        return res.status(400).json({ message: 'text or file required' });
      }
      type = 'text';
    }


    const now = new Date();
    const doc = {
      userId: new ObjectId(userId),
      type,                    // 'text' | 'image' | 'text+image'
      context: context || null,
      media,                   // 이미지인 경우만 객체, 나머지는 null
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('records').insertOne(doc);

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
        imageUrl, 
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error('createRecord failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

// exports.recordAudio = async (req, res) => {
//   try {
//     const db = req.app.locals.db;

//     const authHeader = req.headers.authorization || '';
//     if (!authHeader.startsWith('Bearer ')) {
//       return res.status(401).json({ message: 'Authorization Bearer token required' });
//     }
//     const accessToken = authHeader.split(' ')[1];
//     const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
//     const userId = payload.uid;
//     if (!userId) return res.status(401).json({ message: 'token has no user id' });


//     // - multipart/form-data 로 `audio` 파일
//     if (!req.file) {
//       return res.status(400).json({ message: 'audio file is required (field: audio)' });
//     }

    
//     const allowed = [
//       'audio/mpeg', 'audio/mp3',
//       'audio/wav', 'audio/x-wav',
//       'audio/aac', 'audio/x-m4a', 'audio/m4a',
//       'audio/ogg', 'audio/webm',
//     ];
//     if (!allowed.includes(req.file.mimetype)) {
//       return res.status(400).json({ message: 'unsupported audio type' });
//     }

//     // S3 Key 생성 및 업로드
//     const ext = mime.extension(req.file.mimetype) || 'bin';
//     const now = new Date();
//     const y = now.getFullYear();
//     const m = String(now.getMonth() + 1).padStart(2, '0');
//     const uuid = Math.random().toString(36).slice(2) + Date.now().toString(36);
//     const key = `records/${userId}/${y}/${m}/audio_${uuid}.${ext}`;

//     await uploadBufferToS3({
//       buffer: req.file.buffer,
//       key,
//       contentType: req.file.mimetype,
//     });

    
//     const doc = {
//       userId: new ObjectId(userId),
//       type: 'audio',
//       media: {
//         type: 'audio',
//         bucket: process.env.AWS_S3_BUCKET,
//         key,
//         mime: req.file.mimetype,
//         size: req.file.size,
//       },
//       createdAt: now,
//       updatedAt: now,
//     };

//     const result = await db.collection('records').insertOne(doc);

//     // presigned URL 생성
//     const audioUrl = await getSignedReadUrl(key);

//     return res.status(201).json({
//       message: 'audio record created',
//       record: {
//         id: result.insertedId.toString(),
//         type: doc.type,
//         context: doc.context,
//         audioUrl,        
//         createdAt: doc.createdAt,
//       },
//     });
//   } catch (err) {
//     console.error('recordaudioCreate failed:', err);
//     return res.status(500).json({ message: 'server error' });
//   }
// };

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

    //유저 기록 가져오기 (최신순)
    const records = await db.collection('records')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();

    // 각 record에 presigned URL 붙이기
    const mapped = await Promise.all(records.map(async (r) => {
      let imageUrl = null;
      if (r.media?.key) {
        imageUrl = await getSignedReadUrl(r.media.key); 
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
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization Bearer token required' });
    }
    const accessToken = authHeader.split(' ')[1];
    const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
    const ownerId = payload.uid;
    if (!ownerId) return res.status(401).json({ message: 'token has no user id' });

    const { _id } = req.body;
    if (!_id) return res.status(400).json({ message: 'record _id is required' });

    // 기존 레코드 조회/권한 체크
    const record = await db.collection('records').findOne({ _id: new ObjectId(_id) });
    if (!record) return res.status(404).json({ message: 'record not found' });
    if (record.userId.toString() !== ownerId) {
      return res.status(403).json({ message: '수정 권한이 없습니다.' });
    }

    // 입력 파싱
    // - context: 전달되면 갱신, 없으면 기존 유지
    // - removeImage: true면 이미지 제거
    // - req.file: 새 이미지 업로드 요청
    const contextIn = req.body.context;
    const finalContext = (contextIn !== undefined)
      ? (String(contextIn).trim() || null)
      : record.context;

    const removeImage = req.body.removeImage === 'true' || req.body.removeImage === true;

    // 이미지 처리 준비
    let newMedia = null;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

    // (A) 새 이미지 업로드 요청
    if (req.file) {
      if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({ message: 'unsupported file type' });
      }
      // 새 이미지 업로드
      const ext = mime.extension(req.file.mimetype) || 'bin';
      const y = new Date().getFullYear();
      const m = String(new Date().getMonth() + 1).padStart(2, '0');
      const uuid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const key = `records/${ownerId}/${y}/${m}/${uuid}.${ext}`;

      await uploadBufferToS3({
        buffer: req.file.buffer,
        key,
        contentType: req.file.mimetype,
      });

      newMedia = {
        type: 'image',
        bucket: process.env.AWS_S3_BUCKET,
        key,
        mime: req.file.mimetype,
        size: req.file.size,
      };

      // 이전 이미지가 있으면 제거
      if (record.media?.key) {
        try {
          await deleteFromS3(record.media.key);
        } catch (e) {
          // 업로드 성공했는데 기존 삭제 실패했다면 로그만 남김(재시도 가능)
          console.error('old image delete failed:', e);
        }
      }
    }
    // (B) 이미지 제거 요청
    else if (removeImage && record.media?.key) {
      try {
        await deleteFromS3(record.media.key);
      } catch (e) {
        console.error('image delete failed:', e);
      }
      newMedia = null; // 이미지 제거
    }
    // (C) 이미지 변경 없음 → 기존 media 유지
    else {
      newMedia = record.media ?? null;
    }

    // type 재계산
    const willHaveImage = !!(newMedia && newMedia.key);
    const hasText = !!finalContext;
    const newType = willHaveImage && hasText ? 'text+image' : (willHaveImage ? 'image' : 'text');

    // 업데이트 필드 구성
    const updateFields = {
      context: finalContext,
      media: willHaveImage ? newMedia : null,
      type: newType,
      updatedAt: new Date(),
    };

    // 아무 변화도 없는 경우 방어
    const noChange =
      (finalContext === record.context) &&
      JSON.stringify(updateFields.media) === JSON.stringify(record.media) &&
      updateFields.type === record.type;

    if (noChange) {
      return res.status(400).json({ message: '변경된 내용이 없습니다.' });
    }

    await db.collection('records').updateOne(
      { _id: new ObjectId(_id) },
      { $set: updateFields }
    );

    return res.status(200).json({ message: 'update 성공' });
  } catch (err) {
    console.error('record update failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};



exports.recordDelete = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization Bearer token required' });
    }
    const accessToken = authHeader.split(' ')[1];
    const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);

    const ownerId = payload.uid;
    if (!ownerId) return res.status(401).json({ message: 'token has no user id' });

    const { _id } = req.body;
    if (!_id) return res.status(400).json({ message: 'record _id is required' });

    const record = await db.collection('records').findOne({ _id: new ObjectId(_id) });
    if (!record) return res.status(404).json({ message: 'record not found' });
    if (record.userId.toString() !== ownerId) {
      return res.status(403).json({ message: '삭제 권한이 없습니다.' });
    }

    // S3 이미지가 있으면 먼저 삭제
    if (record.media?.key) {
      try {
        await deleteFromS3(record.media.key);
      } catch (e) {
        console.error('s3 image delete failed:', e);
        // 여기서 실패해도 DB 삭제는 진행할지 선택 — 보통은 진행
      }
    }

    await db.collection('records').deleteOne({ _id: new ObjectId(_id) });
    return res.status(200).json({ message: 'delete 성공' });
  } catch (err) {
    console.error('record delete failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};
