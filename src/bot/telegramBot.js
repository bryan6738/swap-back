const TelegramBot = require("node-telegram-bot-api");
const { db } = require("../config/config");

// Telegram Bot Setup
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Utility function to send bot info message
const sendInfoMessage = (chatId) => {
    bot.sendMessage(
        chatId,
        `
<b>Welcome to TeleSwap Bot! 🚀</b>

Use the following commands:
    - /start: <i>View bot information</i>
    - /run: <i>Start the app</i>
    - /referral: <i>Get your referral link</i>
    - /update_address: <i>Update your TON coin address</i>
    - /help: <i>Help how to use TeleSwap bot</i>
    `,
        { parse_mode: "HTML" },
    );
};

// Utility function to request TON coin address
const requestTonCoinAddress = (chatId, userId, username, referredBy) => {
    bot.sendMessage(
        chatId,
        "Please provide your TON coin address to receive your rewards (e.g., 0x123abc...):",
    );
    bot.once("message", (msg) => {
        if (msg.chat.id === chatId) {
            const tonCoinAddress = msg.text.trim();
            db.run(
                "UPDATE users SET ton_coin_address = ? WHERE user_id = ?",
                [tonCoinAddress, userId],
                (err) => {
                    if (err) {
                        console.error(
                            "Error updating TON coin address:",
                            err.message,
                        );
                        bot.sendMessage(
                            chatId,
                            "There was an error saving your address. Please try again.",
                        );
                    } else {
                        console.log(
                            `User ${username}'s TON coin address updated to ${tonCoinAddress}`,
                        );
                        bot.sendMessage(
                            chatId,
                            "Your TON coin address has been updated successfully! ✅",
                        );
                        sendInfoMessage(chatId);
                    }
                },
            );
        }
    });
};

// Handle /start command with optional referral code
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
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
            if (!row.ton_coin_address) {
                requestTonCoinAddress(chatId, userId, username, referredBy);
            } else if (row.referred_by === null && referredBy !== null) {
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
            } else {
                sendInfoMessage(chatId);
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
                        requestTonCoinAddress(
                            chatId,
                            userId,
                            username,
                            referredBy,
                        );
                    }
                },
            );
        }
    });
});

// Handle /run command
bot.onText(/\/run/, (msg) => {
    const chatId = msg.chat.id;
    const webAppUrl = "https://t.me/erwinbryan67_bot?startapp";
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Open TeleSwap Mini App", url: webAppUrl }],
                [
                    {
                        text: "Get Referral Link",
                        callback_data: "get_referral_link",
                    },
                    { text: "Update Address", callback_data: "update_address" },
                ],
            ],
        },
    };

    bot.sendMessage(chatId, "Click one of the options below:", options);
});

// Handle /referral command
bot.onText(/\/referral/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const referredUsers = await new Promise((resolve, reject) => {
            db.all(
                "SELECT * FROM users WHERE referred_by IS NOT NULL",
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

        let TotalVolume = 0;
        let TotalRewards = 0;
        let MyRewards = 0;

        for (const user of referredUsers) {
            const exchangeLogs = await new Promise((resolve, reject) => {
                db.all(
                    "SELECT * FROM exchange_logs WHERE user_id = ? AND exchange_finished = 1",
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
<b>Total Referrals:</b> ${referredUsers.length}
<b>Total Volume:</b> $${TotalVolume.toFixed(2)}
<b>Total Rewards:</b> $${TotalRewards.toFixed(2)}
<b>My Rewards:</b> $${MyRewards.toFixed(2)}

Share this link to refer others: 
    <a href="${referralLink}">${referralLink}</a>
        `;

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (error) {
        bot.sendMessage(
            chatId,
            "There was an error fetching your referral data.",
        );
        console.error(error);
    }
});

// Handle /update_address command
bot.onText(/\/update_address/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    db.get(
        "SELECT ton_coin_address FROM users WHERE user_id = ?",
        [userId],
        (err, row) => {
            if (err) {
                console.error("Error fetching user data:", err.message);
                bot.sendMessage(chatId, "An error occurred. Please try again.");
                return;
            }

            if (row) {
                if (!row.ton_coin_address) {
                    bot.sendMessage(
                        chatId,
                        "You don't have a TON coin address yet. Please provide it now:",
                    );
                    bot.once("message", (msg) => {
                        if (msg.chat.id === chatId) {
                            const tonCoinAddress = msg.text.trim();
                            db.run(
                                "UPDATE users SET ton_coin_address = ? WHERE user_id = ?",
                                [tonCoinAddress, userId],
                                (err) => {
                                    if (err) {
                                        console.error(
                                            "Error updating TON coin address:",
                                            err.message,
                                        );
                                        bot.sendMessage(
                                            chatId,
                                            "There was an error saving your address. Please try again.",
                                        );
                                    } else {
                                        console.log(
                                            `User ${userId}'s TON coin address updated to ${tonCoinAddress}`,
                                        );
                                        bot.sendMessage(
                                            chatId,
                                            "Your TON coin address has been updated successfully! ✅",
                                        );
                                    }
                                },
                            );
                        }
                    });
                } else {
                    bot.sendMessage(
                        chatId,
                        "If you wish to update it, please provide the new address:",
                    );
                    bot.once("message", (msg) => {
                        if (msg.chat.id === chatId) {
                            const tonCoinAddress = msg.text.trim();
                            db.run(
                                "UPDATE users SET ton_coin_address = ? WHERE user_id = ?",
                                [tonCoinAddress, userId],
                                (err) => {
                                    if (err) {
                                        console.error(
                                            "Error updating TON coin address:",
                                            err.message,
                                        );
                                        bot.sendMessage(
                                            chatId,
                                            "There was an error updating your address. Please try again.",
                                        );
                                    } else {
                                        console.log(
                                            `User ${userId}'s TON coin address updated to ${tonCoinAddress}`,
                                        );
                                        bot.sendMessage(
                                            chatId,
                                            "Your TON coin address has been updated successfully! ✅",
                                        );
                                    }
                                },
                            );
                        }
                    });
                }
            } else {
                bot.sendMessage(
                    chatId,
                    "You need to start the bot first to set your TON coin address.",
                );
            }
        },
    );
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const message = `
<b>How to use TeleSwap Bot:</b>

1. <b>/start:</b> Begin using the bot and get an overview.
2. <b>/run:</b> Launch the app and start interacting.
3. <b>/referral:</b> Get your unique referral link to share.
4. <b>/update_address:</b> Provide or update your TON coin address.

Need more help? Contact support or <a href="https://teleswap.com">visit our website</a>.
    `;

    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
});

// Handle callback queries
bot.on("callback_query", (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;

    if (callbackData === "get_referral_link") {
        const userId = callbackQuery.from.id;
        const referralLink = `https://t.me/erwinbryan67_bot?start=${userId}`;
        bot.sendMessage(chatId, `Your referral link: ${referralLink}`);
    } else if (callbackData === "update_address") {
        bot.sendMessage(chatId, "Please provide your new TON coin address:");
        bot.once("message", (msg) => {
            if (msg.chat.id === chatId) {
                const tonCoinAddress = msg.text.trim();
                db.run(
                    "UPDATE users SET ton_coin_address = ? WHERE user_id = ?",
                    [tonCoinAddress, callbackQuery.from.id],
                    (err) => {
                        if (err) {
                            console.error(
                                "Error updating TON coin address:",
                                err.message,
                            );
                            bot.sendMessage(
                                chatId,
                                "There was an error updating your address. Please try again.",
                            );
                        } else {
                            console.log(
                                `User ${callbackQuery.from.id}'s TON coin address updated to ${tonCoinAddress}`,
                            );
                            bot.sendMessage(
                                chatId,
                                "Your TON coin address has been updated successfully! ✅",
                            );
                        }
                    },
                );
            }
        });
    }
});
