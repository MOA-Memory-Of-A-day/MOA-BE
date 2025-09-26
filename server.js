require('dotenv').config();
const cors =require('cors');
const express = require('express');
const app = express();

app.use(cors());
app.use(express.json());


let connectDB = require('./database');



connectDB.then((client) => {
    const db = client.db(process.env.DB_NAME)
    app.locals.db = db;
    console.log('Database connected');

    app.listen(process.env.PORT,()=>{
        console.log('Server is running');
    })
}).catch((e) => {
    console.log('Error starting server:', e);
})



app.get('/',(req,res)=>{res.send('MOA server testing');})
app.use('/auth',require('./routes/auth.js'));
// app.use('/subject',require('./routes/subject.js'));
// app.use('/task',require('./routes/task.js'));



// app.use(errorHandler);