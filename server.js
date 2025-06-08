// server.js

// 1. Core Modules and Third-party Libraries (Declare once at the top)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Ensure CORS is only imported once
const admin = require('firebase-admin');
// Removed: const mysql = require('mysql2/promise'); // We are using Firestore, so this is not needed

// 2. Firebase Admin SDK Initialization
// IMPORTANT: For LOCAL TESTING, we require the JSON file directly.
// For Render deployment, we will use an environment variable (see Part 8 in previous instructions).
const serviceAccount = require('./dailyearners-firebase-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 3. Initialize Firestore Database and Express App
const db = admin.firestore(); // Initialize Firestore
const app = express(); // Initialize Express app (ONLY ONCE)
const PORT = process.env.PORT || 3000;

// 4. Middleware Setup
app.use(cors()); // Use cors middleware to enable all CORS requests
app.use(bodyParser.json()); // To parse JSON request bodies
app.use(bodyParser.urlencoded({ extended: true })); // To parse URL-encoded request bodies

// 5. API Endpoints (as provided in previous instructions)

// Define an endpoint to get investment packages from Firestore
app.get('/api/packages', async (req, res) => {
    try {
        const packagesRef = db.collection('investment_packages');
        const snapshot = await packagesRef.get();

        const packages = [];
        snapshot.forEach(doc => {
            packages.push(doc.data());
        });

        res.json(packages);
    } catch (error) {
        console.error('Error fetching investment packages from Firestore:', error);
        res.status(500).json({ message: 'Failed to fetch investment packages', error: error.message });
    }
});

// Add your other API endpoints here as you implement them (e.g., /api/register, /api/login, /api/invest)
// For example:
/*
app.post('/api/register', async (req, res) => {
    // Implement user registration logic here
    res.status(200).json({ message: 'Registration successful (simulated)' });
});
*/


// 6. Start the Server (usually at the very bottom of the file)
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});