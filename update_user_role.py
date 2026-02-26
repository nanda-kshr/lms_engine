from pymongo import MongoClient

# MongoDB connection string
MONGO_URI = "mongodb+srv://publicUser:nandakishore123@mycluster.mt6afrt.mongodb.net/lms_engine"
EMAIL = "analytics_seeds_test@example.com"

def update_role():
    try:
        client = MongoClient(MONGO_URI)
        db = client['lms_engine']
        users_collection = db['users']
        
        # Update user role
        result = users_collection.update_one(
            {"email": EMAIL},
            {"$set": {"role": "teacher", "roleLevel": 2}}
        )
        
        if result.modified_count > 0:
            print(f"Successfully updated role for {EMAIL}.")
        else:
            print(f"No document updated. User might not exist or role already set.")
            
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    update_role()
