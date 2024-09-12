const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    "http://localhost:5173",
    "https://intuitivefunction.github.io",
    "https://bryan6738.github.io/",
    "https://TeleswapApp.repl.io",
];

// CORS configuration
// app.use(
//     cors({
//         origin: function (origin, callback) {
//             if (!origin || allowedOrigins.indexOf(origin) !== -1) {
//                 callback(null, true);
//             } else {
//                 callback(new Error("Not allowed by CORS"));
//             }
//         },
//         methods: ["GET", "POST"],
//     }),
// );
app.use(cors());
app.use(express.json());

// Telegram Bot Setup
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Database Setup
const db = new sqlite3.Database("./app.db");

// Create the users table with referred_by column
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            referred_by INTEGER
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS exchange_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            exchange_id TEXT,                -- Unique identifier for the exchange
            amount_from TEXT,                -- Amount of tokens sent
            amount_to TEXT,            -- Amount of tokens received
            currency_from TEXT,                 -- Token name sent
            currency_to TEXT,             -- Token name received
            address_from TEXT,               -- Address from which tokens were sent
            address_to TEXT,           -- Address to which tokens were received
            inputUSD TEXT,     -- USD value of the input token
            outputUSD TEXT,    -- USD value of the output token
            timestamp TEXT,         -- ISO date-time of the exchange
            primary_rate REAL,               -- Primary exchange rate,
            primary_referral_reward_usd REAL,
            btc_usd_rate REAL,               -- BTC to USD rate
            exchange_finished INTEGER,       -- Boolean flag (0 for false, 1 for true)
            ip_address TEXT,
            user_agent TEXT,                 -- User agent string
            site_language TEXT,              -- Site language (e.g., "en-GB")
            accept_language TEXT,            -- Accept language(s) (e.g., "en-GB, en-US")
            device_timezone TEXT,            -- Device timezone (e.g., "Australia/Perth")
            device_operating_system TEXT     -- Device operating system (e.g., "Windows")
        )
    `);
});

// 1. /start Command: Shows information about the bot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || "unknown";

    const infoMessage = `
Welcome to TeleSwap Bot!
Use the following commands:
- /start: View bot information
- /run: Start the app
- /referral: Get your referral link
    `;

    // Insert user into the database if they are new
    db.run(
        `INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)`,
        [userId, username],
        function (err) {
            if (err) {
                console.error("Error inserting user:", err.message);
            }
        },
    );

    bot.sendMessage(chatId, infoMessage);

    // console.log("Fetching users data...");

    // db.all("SELECT * FROM users", [], (err, rows) => {
    //     if (err) {
    //         console.error("Error fetching users data:", err.message);
    //         return res.status(500).send("Failed to fetch users data");
    //     }

    //     console.log("Users data:", rows);
    // });
});

// 2. /run Command: Main functionality of the app
bot.onText(/\/run/, (msg) => {
    const chatId = msg.chat.id;

    // Example action: Sending a message to the user
    const webAppUrl = "https://t.me/erwinbryan67_bot?startapp";
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Open TeleSwap Mini App", url: webAppUrl }],
            ],
        },
    };

    bot.sendMessage(
        chatId,
        "Click here to open the TeleSwap Mini App:",
        options,
    );
});

// 3. /referral Command: Generates a referral link
bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        // Get all referred users
        const referredUsers = await new Promise((resolve, reject) => {
            db.all(
                "SELECT * FROM users WHERE referred_by = ?",
                [userId],
                (err, rows) => {
                    if (err) {
                        console.error(
                            "Error fetching users data:",
                            err.message,
                        );
                        return reject(err);
                    }
                    resolve(rows);
                },
            );
        });

        const TotalReferals = referredUsers.length;

        let TotalVolume = 0;
        let TotalRewards = 0;
        let MyRewards = 0;

        // Process each referral to calculate total volume and rewards
        for (let i = 0; i < referredUsers.length; i++) {
            const user = referredUsers[i];

            // Fetch exchange logs for each referred user where exchange_finished is 1
            const exchangeLogs = await new Promise((resolve, reject) => {
                db.all(
                    "SELECT * FROM exchange_logs WHERE user_id = ? AND exchange_finished = 0",
                    [user.user_id],
                    (err, exrows) => {
                        if (err) {
                            console.error(
                                "Error fetching exchange logs data:",
                                err.message,
                            );
                            return reject(err);
                        }
                        resolve(exrows);
                    },
                );
            });

            // Calculate total volume and total rewards from exchange logs
            TotalVolume += exchangeLogs.reduce(
                (total, exrow) => total + parseFloat(exrow.outputUSD || 0),
                0,
            );
            TotalRewards += exchangeLogs.reduce(
                (total, exrow) =>
                    total + parseFloat(exrow.primary_referral_reward_usd || 0),
                0,
            );

            if (referredUsers[i].referred_by === userId) {
                MyRewards += exchangeLogs.reduce(
                    (total, exrow) =>
                        total +
                        parseFloat(exrow.primary_referral_reward_usd || 0),
                    0,
                );
            }
        }

        // Generate referral link
        const referralLink = `https://t.me/erwinbryan67_bot?start=${userId}`;

        // Send the result to the user
        const message = `
Share this link to refer others: ${referralLink}

Total Referrals: ${TotalReferals}
Total Volume: $${TotalVolume.toFixed(2)}
Total Rewards: $${TotalRewards.toFixed(2)}
My Rewards: $${MyRewards.toFixed(2)}
`;

        bot.sendMessage(chatId, message);
    } catch (error) {
        bot.sendMessage(
            chatId,
            "There was an error fetching your referral data.",
        );
        console.error(error);
    }
});

// Handle users referred through referral links
bot.onText(/\/start (.+)?/, (msg, match) => {
    const chatId = msg.chat.id;
    const referredBy = match[1] ? parseInt(match[1]) : null; // Get referrer ID from the referral link

    const userId = msg.from.id;
    const username = msg.from.username || "unknown";

    // First, check if the user exists in the database
    db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
        if (err) {
            console.error("Error fetching user:", err.message);
            bot.sendMessage(chatId, "An error occurred. Please try again.");
            return;
        }

        if (row) {
            // If user exists and referred_by is null, update it
            if (row.referred_by === null && referredBy !== null) {
                db.run(
                    `UPDATE users SET referred_by = ? WHERE user_id = ?`,
                    [referredBy, userId],
                    function (err) {
                        if (err) {
                            console.error(
                                "Error updating referred_by:",
                                err.message,
                            );
                        } else {
                            console.log(
                                `User ${username}'s referral updated to ${referredBy}`,
                            );
                        }
                    },
                );
            }
        } else {
            // If user doesn't exist, insert the new user with referred_by info
            db.run(
                `INSERT INTO users (user_id, username, referred_by) VALUES (?, ?, ?)`,
                [userId, username, referredBy],
                function (err) {
                    if (err) {
                        console.error("Error inserting user:", err.message);
                    } else {
                        console.log("New user added:", username);
                    }
                },
            );
        }

        // Send welcome message to the user
        bot.sendMessage(
            chatId,
            referredBy
                ? "Welcome! You were referred by someone. Use /referral to refer others!"
                : "Welcome! Use /referral to refer others!",
        );
    });
});

// 4. Log Exchange Data: POST request to log exchange details

app.post("/log-exchange", (req, res) => {
    console.log("Received a POST request to /log-exchange");

    // console.log("Fetching exchange logs data...");

    // db.all("SELECT * FROM exchange_logs", [], (err, rows) => {
    //     if (err) {
    //         console.error("Error fetching exchange logs data:", err.message);
    //         return res.status(500).send("Failed to fetch exchange logs data");
    //     }

    //     console.log("Exchange logs data:", rows);
    //     // res.json(rows);
    // });

    const timestamp = new Date().toISOString();
    const exchange = req.body || {};

    // Extract additional information
    const ipAddress =
        req.headers["x-forwarded-for"] || req.connection.remoteAddress; // Get IP Address
    const userAgent = exchange.UserAgent || null;
    const siteLanguage = exchange.SiteLanguage || null;
    const acceptLanguage = exchange.AcceptLanguage || null;
    const deviceTimezone = exchange.DeviceTimezone || null;
    const deviceOperatingSystem = exchange.DeviceOperatingSystem || null;
    const primaryRate = 0.0025;
    const primaryReferralRewardUSD =
        (exchange.OutputTokenUSDTValue || 0) * primaryRate;
    const btcUsdRate = exchange.BTC_USDRate || 0;

    console.log("Exchange data:", exchange);

    const exchangeID = exchange.ExchangeID || null;

    // Check if a row with the same ExchangeID exists
    const checkQuery = `SELECT * FROM exchange_logs WHERE exchange_id = ?`;
    db.get(checkQuery, [exchangeID], (err, row) => {
        if (err) {
            console.error("Database Error:", err.message);
            return res
                .status(500)
                .send("Failed to check existing exchange data");
        }

        if (row) {
            // If row exists, update the ExchangeFinished field
            const updateQuery = `
                    UPDATE exchange_logs
                    SET
                        exchange_finished = ?,
                        timestamp = ?
                    WHERE exchange_id = ?`;

            db.run(
                updateQuery,
                [exchange.ExchangeFinished || 0, timestamp, exchangeID],
                function (err) {
                    if (err) {
                        console.error("Database Error:", err.message);
                        return res
                            .status(500)
                            .send("Failed to update exchange data");
                    } else {
                        console.log("Exchange data updated successfully");
                        return res
                            .status(200)
                            .send("Exchange data updated successfully");
                    }
                },
            );
        } else {
            // If row doesn't exist, insert new data
            const insertQuery = `
                    INSERT INTO exchange_logs (
                        exchange_id,
                        user_id,
                        amount_from,
                        amount_to,
                        currency_from,
                        currency_to,
                        address_from,
                        address_to,
                        inputUSD,
                        outputUSD,
                        timestamp,
                        primary_rate,
                        primary_referral_reward_usd,
                        btc_usd_rate,
                        exchange_finished,
                        ip_address,
                        user_agent,
                        site_language,
                        accept_language,
                        device_timezone,
                        device_operating_system
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.run(
                insertQuery,
                [
                    exchangeID,
                    exchange.UserID || null,
                    exchange.AmountSent || 0,
                    exchange.AmountReceived || 0,
                    exchange.TokenSent || "",
                    exchange.TokenReceived || "",
                    exchange.AddressSent || "",
                    exchange.AddressReceived || "",
                    exchange.InputTokenUSDTValue || "",
                    exchange.OutputTokenUSDTValue || "",
                    timestamp,
                    primaryRate,
                    primaryReferralRewardUSD,
                    btcUsdRate,
                    exchange.ExchangeFinished || 0,
                    ipAddress,
                    userAgent,
                    siteLanguage,
                    acceptLanguage,
                    deviceTimezone,
                    deviceOperatingSystem,
                ],
                function (err) {
                    if (err) {
                        console.error("Database Error:", err.message);
                        return res
                            .status(500)
                            .send("Failed to log exchange data");
                    } else {
                        console.log("Exchange data logged successfully");
                        return res
                            .status(200)
                            .send("Exchange data logged successfully");
                    }
                },
            );
        }
    });
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
