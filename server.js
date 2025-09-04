require('dotenv').config();
const { OAuth2Client } = require("google-auth-library");
const cors =require('cors');
const express = require('express');
const app = express();

// const errorHandler = require('./middlewares/errorHandler');

app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

let connectDB = require('./database');
let db;


connectDB.then((client) => {
    db = client.db(process.env.DB_NAME)
    console.log('Database connected');
    app.listen(process.env.PORT,()=>{
        console.log('Server is running');
    })
}).catch((e) => {
    console.log('Error starting server:', e);
})






app.get('/',(req,res)=>{res.send('Hello World');})

app.use('/auth',require('./routes/auth.js'));
// app.use('/subject',require('./routes/subject.js'));
// app.use('/task',require('./routes/task.js'));



// app.use(errorHandler);