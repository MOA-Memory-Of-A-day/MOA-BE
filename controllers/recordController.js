const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.recordCreate = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization Bearer token required' });
    }
    const accessToken = authHeader.split(' ')[1];
    const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);

    const userId = payload.uid;
    if (!userId) return res.status(401).json({ message: 'token has no user id' });

    const { context } = req.body;
    if (!context) return res.status(400).json({ message: 'text is required' });

    const now = new Date();
    const doc = {
      userId: new ObjectId(userId),  
      type: 'text',
      context,
      media: null,
      createdAt: now,
      updatedAt: now
    };

    await db.collection('records').insertOne(doc);
    return res.status(201).json({ message: 'record created'});

  } catch (err) {
    console.error('createRecord failed:', err);
    return res.status(500).json({ message: 'server error' });
  }
};

exports.recordList = async (req, res) => {
    try {
        const db = req.app.locals.db;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(400).json({ message: "Authorization Bearer token required" });
        }
        const accessToken = authHeader.split(" ")[1];
        const payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET)
        
        const userId = payload.uid
        if(!userId) return res.status(401).json({ message: 'token has no user id' })

            const records = await db.collection('records')
            .find({ userId: new ObjectId(userId) })
            .sort({ createdAt: -1 })
            .toArray();
      
          
          return res.status(200).json({
            message: 'record 목록 불러오기 성공',
            count: records.length,
            records: records.map(r => ({
              id: r._id.toString(),
              context: r.context,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            })),
          });
        } catch (err) {
          console.error('record list failed:', err);
          return res.status(500).json({ message: 'server error' });
        }
}

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