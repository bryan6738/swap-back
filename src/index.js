const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { corsOptions } = require('./config/config');
const { createTables } = require('./database/database');
const bot = require('./bot/telegramBot');
const routes = require('./routes/routes');

const app = express();
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use('/api', routes);

// Initialize database tables
createTables();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
