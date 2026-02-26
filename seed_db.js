
const dbName = 'lms_engine';
const conn = new Mongo();
const db = conn.getDB(dbName);

const questions = db.questions.find({ course_code: 'DSA' }).toArray();
const seederEmail = 'analytics_seeds_3lrsx@example.com';
const seeder = db.users.findOne({ email: seederEmail });

if (!seeder) {
    print('Seeder user not found');
    quit();
}

print(`Found ${questions.length} DSA questions. Adjusting...`);

const now = new Date();
const oneDay = 24 * 60 * 60 * 1000;

for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    let status = 'pending';
    let weight = 1.0;
    let accepts = 0;
    let rejects = 0;

    // Backdate: distribute over last 7 days
    const daysAgo = i % 7;
    const backDate = new Date(now.getTime() - daysAgo * oneDay);

    if (i < 50) {
        status = 'approved';
        weight = 1.2;
        accepts = 2;
    } else if (i < 65) {
        status = 'rejected';
        weight = 0.6;
        rejects = 2;
    }

    db.questions.updateOne(
        { _id: q._id },
        {
            $set: {
                vetting_status: status,
                weight: weight,
                accept_count: accepts,
                reject_count: rejects,
                uploaded_at: backDate,
                // Ensure seeder is credited
                uploaded_by: seeder._id
            }
        }
    );
}

print('Database update complete.');
