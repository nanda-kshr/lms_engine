const mongoose = require('mongoose');

// MongoDB URI
const MONGO_URI = "mongodb+srv://publicUser:lfenK47pOfrv6KlA@mycluster.mt6afrt.mongodb.net/lms_engine?retryWrites=true&w=majority&appName=mycluster";

// User Schema (simplified)
const userSchema = new mongoose.Schema({
    email: String,
    role: String,
    roleLevel: Number
});

const User = mongoose.model('User', userSchema);

async function updateRole() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const email = "analytics_seeds_test@example.com";
        const userBefore = await User.findOne({ email });
        console.log("User before:", userBefore);

        const res = await User.updateOne(
            { email: email },
            { $set: { role: 'teacher', roleLevel: 2 } }
        );

        if (res.modifiedCount > 0) {
            console.log(`Updated role for ${email}`);
        } else {
            console.log(`Update result:`, res);
        }

        const userAfter = await User.findOne({ email });
        console.log("User after:", userAfter);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

updateRole();
