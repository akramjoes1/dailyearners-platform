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

// User Login Endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body; // Expect email and password from the frontend

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const usersRef = db.collection('users');

        // 1. Find user by email in Firestore
        const snapshot = await usersRef.where('email', '==', email).limit(1).get(); // Limit to 1 result
        if (snapshot.empty) {
            // User not found
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Get user data and document ID
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id; // Get the Firestore document ID

        // 2. Compare provided password with stored hashed password
        const isMatch = await bcrypt.compare(password, userData.password);

        if (!isMatch) {
            // Passwords do not match
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 3. Login successful: Return non-sensitive user data
        // For a real application, you would typically generate and return a JWT (JSON Web Token) here.
        // For now, we'll return essential user details.
        res.status(200).json({
            message: 'Login successful!',
            // Return only necessary, non-sensitive data
            user: {
                id: userId, // The Firestore document ID
                username: userData.username,
                email: userData.email,
                phone: userData.phone,
                balance: userData.balance || 0,
                investments: userData.investments || [],
                depositHistory: userData.depositHistory || [],
                withdrawHistory: userData.withdrawHistory || [],
                referralCode: userData.referralCode || null,
                referredBy: userData.referredBy || null
            }
        });

    } catch (error) {
        console.error('Error during user login:', error);
        res.status(500).json({ message: 'Internal server error during login.', error: error.message });
    }
});
// In server.js, replace your existing /api/register endpoint with this:
app.post('/api/register', async (req, res) => {
    const { username, email, password, phone, referralCode } = req.body; // Added referralCode

    try {
        const userRef = db.collection('users').doc(email); // Use email as doc ID
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        // Generate a referral code for the new user
        const newUserReferralCode = generateReferralCode();

        // Check if the registering user used a referral code
        let referredByUserId = null;
        if (referralCode) {
            const referrerUserDoc = await db.collection('users').where('referralCode', '==', referralCode).limit(1).get();
            if (!referrerUserDoc.empty) {
                referredByUserId = referrerUserDoc.docs[0].id; // Get the email (doc ID) of the referrer
                // Optional: Add referral bonus to the referrer here if you want
                // Example: await db.collection('users').doc(referredByUserId).update({ balance: FieldValue.increment(REFERRAL_BONUS_AMOUNT) });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Determine if the user is an admin
        const isAdmin = (email === 'ty@gmail.com'); // Designate ty@gmail.com as admin

        await userRef.set({
            username,
            email,
            phone,
            password: hashedPassword,
            balance: 0, // Initial balance
            investments: [],
            depositHistory: [],
            withdrawHistory: [],
            referralCode: newUserReferralCode, // Store the generated referral code
            referredBy: referredByUserId, // Store who referred this user
            isAdmin: isAdmin, // Set admin status
            createdAt: new Date().toISOString()
        });

        res.status(201).json({ message: 'Registration successful! Please log in.', referralCode: newUserReferralCode, isAdmin: isAdmin });

    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Internal server error during registration.' });
    }
});


// In server.js, replace your existing /api/deposit endpoint with this:
app.post('/api/deposit', async (req, res) => {
    const { userId, amount, method } = req.body;

    // Basic validation
    if (!userId || typeof amount !== 'number' || amount <= 0 || !method) {
        return res.status(400).json({ message: 'Invalid deposit data provided.' });
    }

    try {
        const userRef = db.collection('users').doc(userId); // userId is the email
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userData = userDoc.data();
        let depositHistory = userData.depositHistory || [];

        // Create a new deposit record with status 'Pending'
        const newDeposit = {
            id: Date.now().toString(), // Unique ID for the transaction
            date: new Date().toISOString(),
            amount: amount,
            method: method,
            status: 'Pending' // Initial status is now Pending
        };

        depositHistory.push(newDeposit);

        // Update user document in Firestore to add to deposit history
        await userRef.update({
            depositHistory: depositHistory
        });

        res.status(200).json({
            message: 'Deposit request submitted for approval.',
            depositRecord: newDeposit,
            currentBalance: userData.balance // Return current balance, not updated yet
        });

    } catch (error) {
        console.error('Error during deposit request submission:', error);
        res.status(500).json({ message: 'Internal server error during deposit request.', error: error.message });
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
// Function to check if a user is an admin (based on email 'ty@gmail.com' for now)
const isAdminUser = async (userId) => {
    if (!userId) return false;
    const userDoc = await db.collection('users').doc(userId).get();
    return userDoc.exists && userDoc.data().isAdmin === true;
};

// Admin Endpoint: Get Pending Transactions (Deposits and Withdrawals)
app.get('/api/admin/pending-transactions', async (req, res) => {
    const adminUserId = req.query.userId; // Expect userId from frontend to check admin status

    if (!await isAdminUser(adminUserId)) {
        return res.status(403).json({ message: 'Unauthorized: Admin access required.' });
    }

    try {
        const usersSnapshot = await db.collection('users').get();
        let pendingTransactions = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const userId = doc.id; // User's email

            // Check pending deposits
            const pendingDeposits = (userData.depositHistory || []).filter(
                tx => tx.status === 'Pending'
            ).map(tx => ({ ...tx, userId: userId, type: 'deposit' }));

            pendingTransactions = pendingTransactions.concat(pendingDeposits);

            // Check pending withdrawals
            const pendingWithdrawals = (userData.withdrawHistory || []).filter(
                tx => tx.status === 'Pending'
            ).map(tx => ({ ...tx, userId: userId, type: 'withdrawal' }));

            pendingTransactions = pendingTransactions.concat(pendingWithdrawals);
        });

        // Sort by date (oldest first)
        pendingTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.status(200).json(pendingTransactions);

    } catch (error) {
        console.error('Error fetching pending transactions:', error);
        res.status(500).json({ message: 'Internal server error fetching pending transactions.', error: error.message });
    }
});


// Admin Endpoint: Approve Transaction
app.post('/api/admin/approve-transaction', async (req, res) => {
    const { adminUserId, userId, transactionId, type, amount } = req.body; // type: 'deposit' or 'withdrawal'

    if (!await isAdminUser(adminUserId)) {
        return res.status(403).json({ message: 'Unauthorized: Admin access required.' });
    }

    if (!userId || !transactionId || !type || typeof amount !== 'number') {
        return res.status(400).json({ message: 'Invalid transaction data for approval.' });
    }

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userData = userDoc.data();
        let updatedHistory;
        let newBalance = userData.balance || 0;

        if (type === 'deposit') {
            updatedHistory = (userData.depositHistory || []).map(tx => {
                if (tx.id === transactionId && tx.status === 'Pending') {
                    // Update user's balance on deposit approval
                    newBalance += tx.amount;
                    return { ...tx, status: 'Approved' };
                }
                return tx;
            });
            await userRef.update({
                depositHistory: updatedHistory,
                balance: newBalance // Update balance for deposits
            });
            res.status(200).json({ message: 'Deposit approved successfully!', newBalance: newBalance });

        } else if (type === 'withdrawal') {
            // For withdrawals, check if user has enough balance *before* approving
            // This is a critical security/logic check.
            if (newBalance < amount) {
                return res.status(400).json({ message: 'Insufficient user balance for this withdrawal approval.' });
            }

            updatedHistory = (userData.withdrawHistory || []).map(tx => {
                if (tx.id === transactionId && tx.status === 'Pending') {
                    // Deduct from balance on withdrawal approval
                    newBalance -= tx.amount;
                    return { ...tx, status: 'Approved' };
                }
                return tx;
            });
            await userRef.update({
                withdrawHistory: updatedHistory,
                balance: newBalance // Update balance for withdrawals
            });
            res.status(200).json({ message: 'Withdrawal approved successfully!', newBalance: newBalance });

        } else {
            return res.status(400).json({ message: 'Invalid transaction type.' });
        }

    } catch (error) {
        console.error('Error approving transaction:', error);
        res.status(500).json({ message: 'Internal server error during transaction approval.', error: error.message });
    }
});


// Admin Endpoint: Reject Transaction
app.post('/api/admin/reject-transaction', async (req, res) => {
    const { adminUserId, userId, transactionId, type } = req.body;

    if (!await isAdminUser(adminUserId)) {
        return res.status(403).json({ message: 'Unauthorized: Admin access required.' });
    }

    if (!userId || !transactionId || !type) {
        return res.status(400).json({ message: 'Invalid transaction data for rejection.' });
    }

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userData = userDoc.data();
        let updatedHistory;

        if (type === 'deposit') {
            updatedHistory = (userData.depositHistory || []).map(tx => {
                if (tx.id === transactionId && tx.status === 'Pending') {
                    return { ...tx, status: 'Rejected' };
                }
                return tx;
            });
            await userRef.update({ depositHistory: updatedHistory });
            res.status(200).json({ message: 'Deposit rejected successfully!' });

        } else if (type === 'withdrawal') {
            updatedHistory = (userData.withdrawHistory || []).map(tx => {
                if (tx.id === transactionId && tx.status === 'Pending') {
                    return { ...tx, status: 'Rejected' };
                }
                return tx;
            });
            await userRef.update({ withdrawHistory: updatedHistory });
            res.status(200).json({ message: 'Withdrawal rejected successfully!' });

        } else {
            return res.status(400).json({ message: 'Invalid transaction type.' });
        }

    } catch (error) {
        console.error('Error rejecting transaction:', error);
        res.status(500).json({ message: 'Internal server error during transaction rejection.', error: error.message });
    }
});

// Helper function to generate referral code (if not already defined)
function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}