// server.js

const express = require('express');
const mysql = require('mysql2/promise'); // Use the promise-based API
const app = express();
// server.js (add these lines)
const cors = require('cors'); // Import the cors package

app.use(cors()); // Use cors middleware to enable all CORS requests
const port = 3000; // You can choose any available port

// Middleware to parse JSON bodies
app.use(express.json());

// Database connection configuration
const dbConfig = {
    host: 'localhost',
    user: 'dailyearners_user',
    password: 'AKRAM123joes.', // <-- IMPORTANT: Replace with your actual password
    database: 'dailyearners_db'
};

// Test route for the root URL
app.get('/', (req, res) => {
    res.send('Welcome to the Daily Earners API!');
});

// API endpoint to get all investment packages
app.get('/api/packages', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows, fields] = await connection.execute('SELECT * FROM InvestmentPackages');
        res.json(rows); // Send the packages as JSON response
    } catch (err) {
        console.error('Error fetching investment packages:', err.message);
        res.status(500).json({ error: 'Failed to fetch investment packages', details: err.message });
    } finally {
        if (connection) {
            await connection.end(); // Close the connection
        }
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Test API endpoint: http://localhost:${port}/api/packages`);
});