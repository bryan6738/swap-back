const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { corsOptions, connectDB } = require("./config/config");
const { createCollections } = require("./database/database");
const bot = require("./bot/telegramBot");
const routes = require("./routes/routes");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use("/", routes);

// Connect to MongoDB and create collections
connectDB().then(() => createCollections());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
