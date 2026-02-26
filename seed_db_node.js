
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://publicUser:lfenK47pOfrv6KlA@mycluster.mt6afrt.mongodb.net/lms_engine?retryWrites=true&w=majority&appName=mycluster';

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const Question = mongoose.model('Question', new mongoose.Schema({}, { strict: false }));
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        const seeder = await User.findOne({ email: 'analytics_seeds_3lrsx@example.com' });
        if (!seeder) {
            console.log('Seeder not found');
            process.exit(1);
        }

        const questions = await Question.find({ course_code: 'DSA' });
        console.log(`Found ${questions.length} DSA questions`);

        const now = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            let status = 'pending';
            let weight = 1.0;
            let accepts = 0;
            let rejects = 0;

            const daysAgo = i % 7;
            const backDate = new Date(now.getTime() - (daysAgo * oneDay));

            if (i < 50) {
                status = 'approved';
                weight = 1.2;
                accepts = 2;
            } else if (i < 65) {
                status = 'rejected';
                weight = 0.6;
                rejects = 2;
            }

            await Question.updateOne(
                { _id: q._id },
                {
                    $set: {
                        vetting_status: status,
                        weight: weight,
                        accept_count: accepts,
                        reject_count: rejects,
                        uploaded_at: backDate,
                        uploaded_by: seeder._id
                    }
                }
            );
            if ((i + 1) % 10 === 0) console.log(`Processed ${i + 1}/${questions.length}`);
        }

        console.log('Database update complete.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
}

seed();
