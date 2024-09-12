const TelegramBot = require("node-telegram-bot-api");
const { db } = require("../config/config");

// Telegram Bot Setup
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Define bot commands here
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

    db.run(
        "INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)",
        [userId, username],
        function (err) {
            if (err) {
                console.error("Error inserting user:", err.message);
            }
        },
    );

    bot.sendMessage(chatId, infoMessage);
});

bot.onText(/\/run/, (msg) => {
    const chatId = msg.chat.id;
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

bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
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

        for (const user of referredUsers) {
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

            TotalVolume += exchangeLogs.reduce(
                (total, exrow) => total + parseFloat(exrow.outputUSD || 0),
                0,
            );
            TotalRewards += exchangeLogs.reduce(
                (total, exrow) =>
                    total + parseFloat(exrow.primary_referral_reward_usd || 0),
                0,
            );

            if (user.referred_by === userId) {
                MyRewards += exchangeLogs.reduce(
                    (total, exrow) =>
                        total +
                        parseFloat(exrow.primary_referral_reward_usd || 0),
                    0,
                );
            }
        }

        const referralLink = `https://t.me/erwinbryan67_bot?start=${userId}`;
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

bot.onText(/\/start (.+)?/, (msg, match) => {
    const chatId = msg.chat.id;
    const referredBy = match[1] ? parseInt(match[1]) : null;
    const userId = msg.from.id;
    const username = msg.from.username || "unknown";

    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
        if (err) {
            console.error("Error fetching user:", err.message);
            bot.sendMessage(chatId, "An error occurred. Please try again.");
            return;
        }

        if (row) {
            if (row.referred_by === null && referredBy !== null) {
                db.run(
                    "UPDATE users SET referred_by = ? WHERE user_id = ?",
                    [referredBy, userId],
                    (err) => {
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
            db.run(
                "INSERT INTO users (user_id, username, referred_by) VALUES (?, ?, ?)",
                [userId, username, referredBy],
                (err) => {
                    if (err) {
                        console.error("Error inserting user:", err.message);
                    } else {
                        console.log("New user added:", username);
                    }
                },
            );
        }

        bot.sendMessage(
            chatId,
            referredBy
                ? "Welcome! You were referred by someone. Use /referral to refer others!"
                : "Welcome! Use /referral to refer others!",
        );
    });
});

module.exports = bot;
