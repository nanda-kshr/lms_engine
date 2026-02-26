const mongoose = require('mongoose');

// MongoDB URI
const MONGO_URI = "mongodb+srv://publicUser:lfenK47pOfrv6KlA@mycluster.mt6afrt.mongodb.net/lms_engine?retryWrites=true&w=majority&appName=mycluster";

// Schemas
const roleSchema = new mongoose.Schema({
    name: String,
    level: Number
});
const Role = mongoose.model('Role', roleSchema);

const userSchema = new mongoose.Schema({
    email: String,
    role_id: mongoose.Schema.Types.ObjectId,
    role: String,
    roleLevel: Number
});
const User = mongoose.model('User', userSchema);

async function updateRole() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // Find Teacher Role
        const teacherRole = await Role.findOne({ name: { $regex: /teacher/i } });
        console.log("Found Teacher Role:", teacherRole);

        if (!teacherRole) {
            console.log("Teacher role not found. Listing all roles...");
            const roles = await Role.find({});
            console.log(roles);
            return;
        }

        const email = "analytics_seeds_test@example.com";

        // Update User with role_id
        const res = await User.updateOne(
            { email: email },
            {
                $set: {
                    role_id: teacherRole._id,
                    role: teacherRole.name,
                    roleLevel: teacherRole.level
                }
            }
        );

        if (res.modifiedCount > 0) {
            console.log(`Updated role for ${email} to ${teacherRole.name}`);
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
