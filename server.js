const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const cors = require('cors'); // Import the cors middleware

// Initialize Firebase Admin SDK (replace with your actual service account key path or content)
// Ensure your Firebase service account key is correctly set up.
// For Render, you might store it as an environment variable or load from a JSON file.
// Example for environment variable (recommended for production):
// const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
// For local development, you might use a file:
// const serviceAccount = require('./path/to/your/serviceAccountKey.json');

// Using environment variable for service account key (BEST PRACTICE FOR DEPLOYMENT)
// Make sure you have a FIREBASE_SERVICE_ACCOUNT_KEY environment variable on Render
// that contains the entire JSON content of your Firebase service account key.
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } else {
        // Fallback for local development if not using environment variables (adjust path)
        serviceAccount = require('./serviceAccountKey.json'); // Make sure this file exists locally
    }
} catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY or load serviceAccountKey.json:", e);
    process.exit(1); // Exit if Firebase credentials can't be loaded
}


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// --- CORS Configuration (VERY IMPORTANT for frontend-backend communication) ---
// This middleware must be placed before any route handlers.
// For development, allow all origins. In production, restrict to your frontend domain.
app.use(cors({
    origin: '*', // Allow all origins for now. Change to your specific frontend URL in production, e.g., 'https://akramjoes1.github.io'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Explicitly allow methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Explicitly allow headers
    credentials: true // Allow cookies/auth headers to be sent cross-origin (if used)
}));

// Use body-parser middleware for parsing JSON and URL-encoded data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const PORT = process.env.PORT || 10000; // Use port 10000 as specified by Render config

// Helper function to generate referral code
function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to check if a user is an admin
const isAdminUser = async (userId) => {
    if (!userId) return false;
    const userDoc = await db.collection('users').doc(userId).get();
    return userDoc.exists && userDoc.data().isAdmin === true;
};


// --- API Endpoints ---

// Root endpoint for health check
app.get('/', (req, res) => {
    res.status(200).send('Dailyearners Backend is Running!');
});

// Register Endpoint
app.post('/api/register', async (req, res) => {
    const { username, email, password, phone, referralCode } = req.body;

    try {
        const userRef = db.collection('users').doc(email); // Use email as doc ID
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        const newUserReferralCode = generateReferralCode();

        let referredByUserId = null;
        if (referralCode) {
            const referrerUserDoc = await db.collection('users').where('referralCode', '==', referralCode).limit(1).get();
            if (!referrerUserDoc.empty) {
                referredByUserId = referrerUserDoc.docs[0].id; // Get the email (doc ID) of the referrer
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const isAdmin = (email === 'ty@gmail.com'); // Designate ty@gmail.com as admin

        await userRef.set({
            username,
            email,
            phone,
            password: hashedPassword,
            balance: 0,
            investments: [],
            depositHistory: [],
            withdrawHistory: [],
            referralCode: newUserReferralCode,
            referredBy: referredByUserId,
            isAdmin: isAdmin,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({ message: 'Registration successful! Please log in.', referralCode: newUserReferralCode, isAdmin: isAdmin });

    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Internal server error during registration.' });
    }
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userRef = db.collection('users').doc(email); // Use email as doc ID
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const userData = userDoc.data();
        const passwordMatch = await bcrypt.compare(password, userData.password);

        if (!passwordMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        // Return user data (excluding password for security)
        const userToReturn = {
            id: userDoc.id, // The email used as document ID
            username: userData.username,
            email: userData.email,
            phone: userData.phone,
            balance: userData.balance,
            investments: userData.investments,
            depositHistory: userData.depositHistory,
            withdrawHistory: userData.withdrawHistory,
            referralCode: userData.referralCode,
            referredBy: userData.referredBy,
            isAdmin: userData.isAdmin || false // Ensure isAdmin is always a boolean
        };

        res.status(200).json({ message: 'Login successful!', user: userToReturn });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

// Deposit Endpoint
app.post('/api/deposit', async (req, res) => {
    const { userId, amount, method } = req.body;

    if (!userId || typeof amount !== 'number' || amount <= 0 || !method) {
        return res.status(400).json({ message: 'Invalid deposit data provided.' });
    }

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userData = userDoc.data();
        let depositHistory = userData.depositHistory || [];

        const newDeposit = {
            id: Date.now().toString(), // Unique ID for the transaction
            date: new Date().toISOString(),
            amount: amount,
            method: method,
            status: 'Pending' // Initial status is now Pending
        };

        depositHistory.push(newDeposit);

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

// Withdrawal Endpoint (Initial version - will be updated for approval)
app.post('/api/withdraw', async (req, res) => {
    const { userId, amount, method, account } = req.body;

    if (!userId || typeof amount !== 'number' || amount <= 0 || !method || !account) {
        return res.status(400).json({ message: 'Invalid withdrawal data provided.' });
    }

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userData = userDoc.data();
        if (userData.balance < amount) {
            return res.status(400).json({ message: 'Insufficient balance for withdrawal.' });
        }

        let withdrawHistory = userData.withdrawHistory || [];

        const newWithdrawal = {
            id: Date.now().toString(), // Unique ID for the transaction
            date: new Date().toISOString(),
            amount: amount,
            method: method,
            account: account,
            status: 'Pending' // Initial status is now Pending
        };

        withdrawHistory.push(newWithdrawal);

        // Do NOT deduct balance immediately. Deduct on approval.
        await userRef.update({
            withdrawHistory: withdrawHistory
        });

        res.status(200).json({
            message: 'Withdrawal request submitted for approval.',
            withdrawalRecord: newWithdrawal,
            currentBalance: userData.balance // Return current balance, not updated yet
        });

    } catch (error) {
        console.error('Error during withdrawal request submission:', error);
        res.status(500).json({ message: 'Internal server error during withdrawal request.', error: error.message });
    }
});


// Admin Endpoint: Get Pending Transactions (Deposits and Withdrawals)
app.get('/api/admin/pending-transactions', async (req, res) => {
    const adminUserId = req.query.userId; // Expect userId (email) from frontend to check admin status

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
                    newBalance += tx.amount; // Update user's balance on deposit approval
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
            if (newBalance < amount) {
                // This scenario should ideally not happen if frontend validates,
                // but it's a critical backend check.
                return res.status(400).json({ message: 'Insufficient user balance for this withdrawal approval.' });
            }

            updatedHistory = (userData.withdrawHistory || []).map(tx => {
                if (tx.id === transactionId && tx.status === 'Pending') {
                    newBalance -= tx.amount; // Deduct from balance on withdrawal approval
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


// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
