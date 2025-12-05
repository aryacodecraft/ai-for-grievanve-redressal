const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// E function to log a grievance
exports.submitGrievance = functions.https.onRequest(async (req, res) => {
  // Allow POST requests only
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  //JSON body
  const { title, description, userId } = req.body;

  // Basic validation
  if (!title || !description || !userId) {
    return res.status(400).send("Missing required fields: title, description, userId");
  }

  try {
    //  to Firestore
    const newGrievance = {
      title,
      description,
      userId,
      status: "open",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await admin.firestore().collection("grievances").add(newGrievance);

    return res.status(200).json({ message: "Grievance submitted successfully!" });
  } catch (error) {
    console.error("Error submitting grievance:", error);
    return res.status(500).send("Internal Server Error");
  }
});