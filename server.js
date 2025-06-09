// server.js

// 1. Core Modules and Third-party Libraries (Declare once at the top)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Ensure CORS is only imported once
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs'); // For password hashing

// 2. Firebase Admin SDK Initialization
// Load Firebase credentials from environment variable (for Render deployment)
// For local development, you must set the FIREBASE_ADMIN_CREDENTIALS env var locally,
// or use a local .json file with a fallback mechanism (e.g., dotenv, or explicit conditional check if needed for local-only file)
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Initialize Firestore Database
const db = admin.firestore();

// 3. Initialize Express App and Port
const app = express(); // Initialize Express app (ONLY ONCE)
const PORT = process.env.PORT || 3000; // Use port from environment (Render) or default to 3000 (local)

// 4. Middleware Setup
app.use(cors()); // Enable CORS for all requests (important for frontend-backend communication)
app.use(bodyParser.json()); // To parse JSON request bodies
app.use(bodyParser.urlencoded({ extended: true })); // To parse URL-encoded request bodies

// 5. API Endpoints

// Root endpoint for a simple check
app.get('/', (req, res) => {
    res.send('Welcome to the DailyEarners Backend API!');
});

// Endpoint to get investment packages from Firestore
app.get('/api/packages', async (req, res) => {
    try {
        const packagesRef = db.collection('investment_packages'); // Reference to your Firestore collection
        const snapshot = await packagesRef.get(); // Get all documents in the collection

        const packages = [];
        snapshot.forEach(doc => {
            // Add the document's data to the packages array
            packages.push(doc.data());
        });

        res.json(packages); // Send the packages as JSON response
    } catch (error) {
        console.error('Error fetching investment packages from Firestore:', error);
        res.status(500).json({ message: 'Failed to fetch investment packages', error: error.message });
    }
});

// User Registration Endpoint
app.post('/api/register', async (req, res) => {
    const { username, email, password, phone } = req.body; // Expect these fields from the frontend

    // Basic validation (you should add more robust validation later)
    if (!username || !email || !password || !phone) {
        return res.status(400).json({ message: 'All fields (username, email, password, phone) are required.' });
    }

    // Password strength validation (example)
    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    try {
        const usersRef = db.collection('users');

        // 1. Check if user already exists by email
        const emailSnapshot = await usersRef.where('email', '==', email).get();
        if (!emailSnapshot.empty) {
            return res.status(409).json({ message: 'Email already registered.' });
        }

        // 2. Check if username already exists
        const usernameSnapshot = await usersRef.where('username', '==', username).get();
        if (!usernameSnapshot.empty) {
            return res.status(409).json({ message: 'Username already taken.' });
        }

        // 3. Hash the password for security
        // The salt is a random string added to the password before hashing,
        // making it harder to crack using rainbow tables.
        const salt = await bcrypt.genSalt(10); // 10 rounds for salt generation (good balance of security/speed)
        const hashedPassword = await bcrypt.hash(password, salt); // Hash the password with the generated salt

        // 4. Create new user document in Firestore
        const newUser = {
            username,
            email,
            phone,
            password: hashedPassword, // Store the hashed password, NOT the plain text password
            balance: 0, // All new users start with 0 balance
            investments: [], // Array to store future investment IDs or summaries for the user
            depositHistory: [], // Array for deposit transaction records
            withdrawHistory: [], // Array for withdrawal transaction records
            referralCode: generateReferralCode(), // Generate a unique referral code for the new user
            referredBy: null, // Field to store the referral code of the user who referred them (if any)
            createdAt: admin.firestore.FieldValue.serverTimestamp() // Firestore timestamp for when the user was created
        };

        const docRef = await usersRef.add(newUser); // Add the new user data to the 'users' collection

        // 5. Respond with success message (do NOT send back sensitive info like password hash)
        res.status(201).json({
            message: 'Registration successful. Please log in.',
            userId: docRef.id, // The ID of the newly created document in Firestore
            username: newUser.username,
            email: newUser.email
        });

    } catch (error) {
        // Handle any errors that occur during the registration process
        console.error('Error during user registration:', error);
        res.status(500).json({ message: 'Internal server error during registration.', error: error.message });
    }
});

// Helper function: Generates a simple, unique referral code
// This is a basic implementation; for production, consider a more robust unique ID generator.
function generateReferralCode() {
    // Generates a 6-character uppercase alphanumeric string
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}


// 6. Start the Server
// This should always be the last part of your server.js file.
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
