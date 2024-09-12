const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const allowedOrigins = [
    "http://localhost:5173",
    "https://intuitivefunction.github.io",
    "https://bryan6738.github.io/",
    "https://TeleswapApp.repl.io",
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
};

const db = new sqlite3.Database('./app.db');

module.exports = { corsOptions, db };
