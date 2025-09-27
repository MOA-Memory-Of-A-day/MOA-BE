const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.todoCreate = async (req, res) => {
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

        const {context, date} = req.body;
        if(!context) return res.status(400).json({ message: '내용을 입력해주세요'})
        
        const now = new Date();
        const doc = {
            userId: new ObjectId(userId),
            context: context,
            date: date,
            done: false,
            createdAt: now,
            updatedAt: now,
        }

        await db.collection('todos').insertOne(doc);
        return res.status(201).json({ message: 'created'})

    } catch (err) {
        console.error('todo create failed:', err);
        return res.status(500).json({ message: 'server error' });
      }
}

exports.todoList = async (req, res) => {
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

            const todos = await db.collection('todos')
            .find({ userId: new ObjectId(userId) })
            .sort({ date: 1, createdAt: -1 })
            .toArray();
      
          // 3) 응답 매핑 (id 문자열화)
          return res.status(200).json({
            message: 'todo 목록 불러오기 성공',
            count: todos.length,
            todos: todos.map(t => ({
              id: t._id.toString(),
              context: t.context,
              date: t.date,              // "YYYY-MM-DD"로 저장되어 있을 것으로 가정
              done: !!t.done,
              createdAt: t.createdAt,
              updatedAt: t.updatedAt,
            })),
          });
        } catch (err) {
          console.error('todo list failed:', err);
          return res.status(500).json({ message: 'server error' });
        }
}

exports.todoUpdate = async (req, res) => {
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

        const {_id, context, date, done } = req.body;
        if (!_id) return res.status(400).json({ message: "todo _id is required" });

        const todo = await db.collection("todos").findOne({ _id: new ObjectId(_id) });
        if (!todo) return res.status(404).json({ message: "todo not found" });

        if (todo.userId.toString() !== ownerId) return res.status(403).json({ message: "수정 권한이 없습니다." });

        const updateFields = {};
        if (context) updateFields.context = context;
        if (date) updateFields.date = date;
        if (done !== undefined) updateFields.done = !!done;
        if (Object.keys(updateFields).length === 0) 
        return res.status(400).json({ message: "수정할 필드를 적어도 하나는 입력해주세요." });
        
        updateFields.updatedAt = new Date();
        
        await db.collection('todos').updateOne({_id: new ObjectId(_id)}, {$set: updateFields });
        return res.status(200).json({message: 'update 성공'})

        
        } catch (err) {
        console.error("todo update failed:", err);
        return res.status(500).json({ message: "server error" });
        }   
}

exports.todoDelete = async (req, res) => {
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
        if (!_id) return res.status(400).json({ message: "todo _id is required" });

        const todo = await db.collection("todos").findOne({ _id: new ObjectId(_id) });
        if (!todo) return res.status(404).json({ message: "todo not found" });

        if (todo.userId.toString() !== ownerId) return res.status(403).json({ message: "수정 권한이 없습니다." });
        
        await db.collection('todos').deleteOne({_id: new ObjectId(_id)});
        return res.status(200).json({message: 'delete 성공'})

        
        } catch (err) {
        console.error("todo delete failed:", err);
        return res.status(500).json({ message: "server error" });
        }   
}