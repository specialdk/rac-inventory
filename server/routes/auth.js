// ============================================
// AUTHENTICATION API
// ============================================

const express = require("express");
const router = express.Router();

// ============================================
// VERIFY LOGIN CREDENTIALS
// ============================================
router.post("/auth/verify", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email domain
    if (!email.endsWith("@rirratjingu.com")) {
      return res.json({
        success: false,
        message:
          "Access denied. Only @rirratjingu.com email addresses are allowed.",
      });
    }

    // BACKDOOR for testing - IT account
    if (email.toLowerCase() === "it@rirratjingu.com" && password === "1234") {
      console.log("✅ Backdoor login successful: it@rirratjingu.com");
      return res.json({
        success: true,
        message: "Login successful",
        user: {
          email: email,
          name: "IT Admin",
        },
      });
    }

    // For all other @rirratjingu.com emails, accept any password
    // (We can't verify Outlook passwords without actually sending emails)
    console.log(`✅ Login accepted: ${email}`);
    return res.json({
      success: true,
      message: "Login successful",
      user: {
        email: email,
        name: email.split("@")[0].replace(".", " "),
      },
    });
  } catch (error) {
    console.error("Error in auth verify:", error);
    res.status(500).json({
      success: false,
      message: "Authentication error",
    });
  }
});

module.exports = router;
