const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGO_URI; // Your MongoDB URI from .env file
const client = new MongoClient(uri);

const connectDB = async () => {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("MongoDB connection error:", err);
    }
};

const db = client.db("teleswap"); // Define the database name

const allowedOrigins = [
    "http://localhost:5173",
    "https://intuitivefunction.github.io",
    "https://bryan6738.github.io",
    "https://teleswap.replit.app",
];

const corsOptions = {
    origin: function (origin, callback) {
        console.log("Incoming request from origin:", origin);
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST"],
};

module.exports = { corsOptions, connectDB, db };
