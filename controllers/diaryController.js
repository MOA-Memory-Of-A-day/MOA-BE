// controllers/diaryController.js
const axios = require('axios');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { toAIPayload } = require('../utils/aiAdapter');
const { getSignedReadUrl }= require('../utils/s3')

const AI_URL = process.env.AI_SERVICE_URL;

// KST(UTC+9) 기준 특정 날짜 00:00~24:00의 UTC 범위를 구함
function kstDayRange(dateStr) {
    // dateStr == 'YYYY-MM-DD' or null(오늘)
    const now = new Date();
    let y, m, d;
  
    if (dateStr) {
      const [Y, M, D] = dateStr.split('-').map(Number);
      y = Y; m = M; d = D;
    } else {
      // "오늘 KST" 기준으로 날짜 뽑기
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      y = kstNow.getUTCFullYear();
      m = kstNow.getUTCMonth() + 1;
      d = kstNow.getUTCDate();
    }
  
    // KST 자정(00:00)은 UTC로 전날 15:00 → hour = -9
    const startUtc = new Date(Date.UTC(y, m - 1, d, -9, 0, 0));      // KST 00:00
    const endUtc   = new Date(Date.UTC(y, m - 1, d + 1, -9, 0, 0));  // KST 다음날 00:00
    return { startUtc, endUtc };
  }

exports.createDiary = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // 1) 인증
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization Bearer token required' });
    }
    const { uid: userId } = jwt.verify(authHeader.split(' ')[1], process.env.JWT_ACCESS_SECRET);

    // 2) 입력 파싱
    const { date, persona = 0 } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    }

    // 3) KST 하루 범위로 레코드 자동 조회
    const { startUtc, endUtc } = kstDayRange(date);
    const records = await db.collection('records')
      .find({
        userId: new ObjectId(userId),
        createdAt: { $gte: startUtc, $lt: endUtc },
      })
      .sort({ createdAt: 1 })
      .toArray();

    if (records.length === 0) {
      return res.status(404).json({ message: 'no records for the specified date' });
    }

    // 4) AI 입력 변환
    const aiItems = await toAIPayload(records);
    // FastAPI 스키마: { items: [...], persona: number }
    const aiResp = await axios.post(`${AI_URL}/diary/generate`, {
      items: aiItems,
      persona,
    }, { timeout: 60_000 });

    const diaryText = aiResp.data?.diary || '';
    if (!diaryText) {
      return res.status(502).json({ message: 'AI empty response' });
    }

    // 5) 이미지 URL 리스트(미리보기용) + DB 저장용 키 리스트
    const imagePresigned = [];
    const imageKeys = [];
    for (const r of records) {
      if (r.media?.type === 'image' && r.media?.key) {
        const url = await getSignedReadUrl(r.media.key);
        imagePresigned.push({ url, createdAt: r.createdAt });
        imageKeys.push({ key: r.media.key, createdAt: r.createdAt });
      }
    }

    // 6) 일기 저장
    const now = new Date();
    const diaryDoc = {
      userId: new ObjectId(userId),
      text: diaryText,
      persona,
      // DB에는 key만 저장(권장). 필요 시 조회 API에서 presigned 발급
      images: imageKeys, // [{key, createdAt}]
      sources: records.map(r => ({
        recordId: r._id,
        type: r.type,
        createdAt: r.createdAt,
      })),
      createdAt: now,
      updatedAt: now,
      date, // 요청 날짜 메타 저장(선택)
    };
    const result = await db.collection('diaries').insertOne(diaryDoc);

    return res.status(201).json({
      message: 'diary created',
      diary: {
        id: result.insertedId.toString(),
        text: diaryText,
        persona,
        date,
        createdAt: now,
        // 미리보기 편의용 presigned URL 목록
        images: imagePresigned, // [{url, createdAt}]
      },
    });
  } catch (err) {
    console.error('createDiary failed:', err?.response?.data || err);
    return res.status(500).json({ message: 'server error' });
  }
};


exports.getDiary = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Authorization Bearer token required' });
    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_ACCESS_SECRET);
    const userId = payload.uid;

    const { id } = req.params;
    const diary = await db.collection('diaries').findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });
    if (!diary) return res.status(404).json({ message: 'diary not found' });

    return res.status(200).json({
      id: diary._id.toString(),
      text: diary.text,
      persona: diary.persona,
      createdAt: diary.createdAt,
      updatedAt: diary.updatedAt,
      sources: diary.sources?.map(s => ({ recordId: s.recordId.toString(), type: s.type, createdAt: s.createdAt })) ?? [],
    });
  } catch (err) {
    console.error('getDiary failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.listDiaries = async (req, res) => {
    try {
      const db = req.app.locals.db;
  
      // --- 인증 ---
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization Bearer token required' });
      }
      const { uid: userId } = jwt.verify(
        authHeader.split(' ')[1],
        process.env.JWT_ACCESS_SECRET
      );
  
      // --- 유저의 모든 다이어리 최신순 조회 ---
      const diaries = await db.collection('diaries')
        .find({ userId: new ObjectId(userId) })
        .sort({ createdAt: -1 })
        .toArray();
  
      if (diaries.length === 0) {
        return res.status(200).json({ count: 0, diaries: [] });
      }
  
      // 모든 다이어리의 recordId 수집 후 한 번에 레코드 조회 (성능)
      const allRecordIds = [];
      for (const d of diaries) {
        const src = Array.isArray(d.sources) ? d.sources : [];
        for (const s of src) {
          if (s.recordId) allRecordIds.push(s.recordId);
        }
      }
      const uniqueIds = [...new Set(allRecordIds.map(id => id.toString()))]
        .map(id => new ObjectId(id));
  
      const allRecords = uniqueIds.length
        ? await db.collection('records')
            .find({ _id: { $in: uniqueIds }, userId: new ObjectId(userId) })
            .toArray()
        : [];
  
      // recordId -> record 문서 매핑
      const recordMap = new Map(allRecords.map(r => [r._id.toString(), r]));
  
      // --- 다이어리별 상세 페이로드 구성 ---
      const payload = await Promise.all(diaries.map(async (d) => {
        const src = Array.isArray(d.sources) ? d.sources : [];
        // 기록은 시간 오름차순으로 정렬
        src.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
        const records = [];
        const images = []; // 이미지들만 모은 리스트
  
        for (const s of src) {
          const rec = recordMap.get(s.recordId?.toString());
          if (!rec) continue;
  
          const item = {
            작성날짜: rec.createdAt,                 // createdAt (Date)
            타입: rec.type,                          // 'text' | 'image' | 'text+image' | 'audio'
            내용: rec.context ?? null,               // text content or null
            이미지: null,                            // presigned URL or null
            오디오: null                             // presigned URL or null
          };
  
          // 이미지 presigned URL
          if ((rec.type === 'image' || rec.type === 'text+image') && rec.media?.key) {
            try {
              const url = await getSignedReadUrl(rec.media.key);
              item.이미지 = url;
              images.push({ url, createdAt: rec.createdAt });
            } catch {
              item.이미지 = null;
            }
          }
  
          // 오디오 presigned URL
          if (rec.type === 'audio' && rec.media?.key) {
            try {
              const url = await getSignedReadUrl(rec.media.key);
              item.오디오 = url;
            } catch {
              item.오디오 = null;
            }
          }
  
          records.push(item);
        }
  
        return {
          작성날짜: d.date ?? null,          // 다이어리의 기준 날짜(YYYY-MM-DD)
          내용: d.text,                      // 생성된 다이어리 본문
          기록리스트: records,               // 시간 오름차순
          이미지리스트: images,              // 기록리스트에서 이미지 가진 것만
          emotion: d.emotion ?? null,        // 현재는 null
          meta: {                            // 필요 시 활용(클라이언트 노출 X 가능)
            id: d._id.toString(),
            persona: d.persona,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          }
        };
      }));
  
      // 요청 예시에서 기대하는 구조:
      // diaries = [ diary1, diary2, diary3, ... ]
      return res.status(200).json({
        count: payload.length,
        diaries: payload
      });
    } catch (err) {
      console.error('listDiaries failed:', err);
      return res.status(500).json({ message: 'server error' });
    }
  };

// exports.listDiaries = async (req, res) => {
//   try {
//     const db = req.app.locals.db;
//     const authHeader = req.headers.authorization || '';
//     if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Authorization Bearer token required' });
//     const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_ACCESS_SECRET);
//     const userId = payload.uid;

//     const diaries = await db.collection('diaries')
//       .find({ userId: new ObjectId(userId) })
//       .sort({ createdAt: -1 })
//       .toArray();

//     return res.status(200).json({
//       count: diaries.length,
//       diaries: diaries.map(d => ({
//         id: d._id.toString(),
//         text: d.text,
//         persona: d.persona,
//         createdAt: d.createdAt,
//         updatedAt: d.updatedAt,
//       })),
//     });
//   } catch (err) {
//     console.error('listDiaries failed:', err);
//     return res.status(500).json({ message: 'server error' });
//   }
// };