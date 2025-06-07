// db_test.js

const mysql = require('mysql2/promise'); // Using the promise-based API for cleaner async/await

async function testDbConnection() {
    let connection;
    try {
        // Create the connection to database
        connection = await mysql.createConnection({
            host: 'localhost',      // Your MySQL host (usually localhost or 127.0.0.1)
            user: 'dailyearners_user', // The database user you created in MySQL Workbench
            password: 'AKRAM123joes.', // <-- IMPORTANT: Replace this with your actual dailyearners_user password
            database: 'dailyearners_db' // The database you created
        });

        console.log('Successfully connected to the database!');

        // --- Example: Fetching data from InvestmentPackages (which you inserted) ---
        const [rows, fields] = await connection.execute('SELECT * FROM InvestmentPackages');
        console.log('\nInvestment Packages Data:');
        if (rows.length > 0) {
            rows.forEach(pkg => {
                console.log(`- ${pkg.name}: ${pkg.daily_roi_percentage}% daily ROI`);
            });
        } else {
            console.log('No investment packages found.');
        }


        // --- Example: Fetching data from Users (will be empty initially, unless you've added some) ---
        const [users] = await connection.execute('SELECT user_id, username, email FROM Users');
        console.log('\nUsers Data:');
        if (users.length === 0) {
            console.log('No users found yet. The Users table is currently empty.');
        } else {
            users.forEach(user => {
                console.log(`- User ID: ${user.user_id}, Username: ${user.username}, Email: ${user.email}`);
            });
        }

    } catch (err) {
        console.error('Failed to connect or query the database:', err.message);
        console.error('Please check your database connection details (host, user, password, database name) and ensure MySQL server is running.');
    } finally {
        // Ensure the connection is closed even if an error occurs
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
}

// Call the async function to run the test
testDbConnection();