import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const users = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// POST /api/auth/send-verification
// ──────────────────────────────────────────────
users.post("/api/auth/send-verification", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const { method, phone } = await c.req.json<{ method?: string; phone?: string }>();

    // Validate request body
    if (!method || (method !== "email" && method !== "whatsapp")) {
      return c.json(
        { success: false, message: "Invalid method. Must be 'email' or 'whatsapp'" },
        400,
      );
    }

    if (method === "whatsapp" && !phone) {
      return c.json(
        { success: false, message: "Phone number is required for WhatsApp verification" },
        400,
      );
    }

    // If WhatsApp with phone, update user's phone first
    if (method === "whatsapp" && phone) {
      await storage.updateUser(userId, { phone });
    }

    // TODO: Port VerificationService – for now, inline a minimal implementation
    const user = await storage.getUser(userId);
    if (!user) {
      return c.json({ success: false, message: "User not found" }, 404);
    }

    // Check if already verified
    if (user.emailVerified && method === "email") {
      return c.json({ success: false, message: "Email already verified" }, 400);
    }

    // Rate limiting: 1 minute between sends
    if (user.lastOtpSent) {
      const timeSinceLast = Date.now() - new Date(user.lastOtpSent).getTime();
      if (timeSinceLast < 60_000) {
        return c.json(
          { success: false, message: "Please wait 1 minute before requesting a new code" },
          429,
        );
      }
    }

    // Generate OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await storage.updateUser(userId, {
      otpCode,
      otpExpiry,
      otpAttempts: 0,
      lastOtpSent: new Date(),
      verificationMethod: method,
    });

    // TODO: Actually send the code via email/WhatsApp service
    // For now just return success so the flow works
    console.log(`[send-verification] OTP ${otpCode} generated for user ${userId} via ${method}`);

    return c.json({ success: true, message: "Verification code sent" });
  } catch (error) {
    console.error("Error sending verification code:", error);
    return c.json({ success: false, message: "Failed to send verification code" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/verify-code
// ──────────────────────────────────────────────
users.post("/api/auth/verify-code", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const { code } = await c.req.json<{ code?: string }>();

    // Validate request body
    if (!code || typeof code !== "string") {
      return c.json({ success: false, message: "Verification code is required" }, 400);
    }

    // TODO: Port full VerificationService.verifyCode – inline minimal version
    const user = await storage.getUser(userId);
    if (!user) {
      return c.json({ success: false, message: "User not found" }, 404);
    }

    if (user.emailVerified) {
      return c.json({ success: true, message: "Already verified" });
    }

    if (!user.otpCode || !user.otpExpiry) {
      return c.json({ success: false, message: "No verification code has been sent" }, 400);
    }

    // Check expiry
    if (new Date(user.otpExpiry).getTime() < Date.now()) {
      return c.json({ success: false, message: "Verification code has expired" }, 400);
    }

    // Check attempts
    const attempts = (user.otpAttempts ?? 0) + 1;
    if (attempts > 5) {
      return c.json(
        { success: false, message: "Too many attempts. Please request a new code." },
        400,
      );
    }

    await storage.updateUser(userId, { otpAttempts: attempts });

    if (code !== user.otpCode) {
      return c.json({ success: false, message: "Invalid verification code" }, 400);
    }

    // Code is correct – mark as verified
    await storage.updateUser(userId, {
      emailVerified: true,
      otpCode: null,
      otpExpiry: null,
      otpAttempts: 0,
    });

    return c.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    console.error("Error verifying code:", error);
    return c.json({ success: false, message: "Failed to verify code" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/resend-code
// ──────────────────────────────────────────────
users.post("/api/auth/resend-code", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const { method, phone } = await c.req.json<{ method?: string; phone?: string }>();

    // Validate request body
    if (!method || (method !== "email" && method !== "whatsapp")) {
      return c.json(
        { success: false, message: "Invalid method. Must be 'email' or 'whatsapp'" },
        400,
      );
    }

    if (method === "whatsapp" && !phone) {
      return c.json(
        { success: false, message: "Phone number is required for WhatsApp verification" },
        400,
      );
    }

    // If WhatsApp with phone, update user's phone first
    if (method === "whatsapp" && phone) {
      await storage.updateUser(userId, { phone });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return c.json({ success: false, message: "User not found" }, 404);
    }

    // Rate limiting: 1 minute between sends
    if (user.lastOtpSent) {
      const timeSinceLast = Date.now() - new Date(user.lastOtpSent).getTime();
      if (timeSinceLast < 60_000) {
        return c.json(
          { success: false, message: "Please wait 1 minute before requesting a new code" },
          429,
        );
      }
    }

    // Generate new OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await storage.updateUser(userId, {
      otpCode,
      otpExpiry,
      otpAttempts: 0,
      lastOtpSent: new Date(),
      verificationMethod: method,
    });

    // TODO: Actually send the code via email/WhatsApp service
    console.log(`[resend-code] OTP ${otpCode} generated for user ${userId} via ${method}`);

    return c.json({ success: true, message: "Verification code resent" });
  } catch (error) {
    console.error("Error resending verification code:", error);
    return c.json({ success: false, message: "Failed to resend verification code" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/auth/verification-status
// ──────────────────────────────────────────────
users.get("/api/auth/verification-status", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    const user = await storage.getUser(userId);
    if (!user) {
      return c.json(
        {
          isVerified: false,
          profileCompleted: false,
          mustCompleteProfile: true,
          message: "User not found",
        },
        404,
      );
    }

    return c.json({
      isVerified: user.emailVerified || false,
      profileCompleted: user.profileCompleted || false,
      mustCompleteProfile: user.mustCompleteProfile || false,
    });
  } catch (error) {
    console.error("Error checking verification status:", error);
    return c.json(
      {
        isVerified: false,
        profileCompleted: false,
        mustCompleteProfile: true,
        message: "Failed to check verification status",
      },
      500,
    );
  }
});

// ──────────────────────────────────────────────
// PATCH /api/users/complete-profile
// ──────────────────────────────────────────────
users.patch("/api/users/complete-profile", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const profileData = await c.req.json();

    // Validate profile data
    const profileSchema = z.object({
      company: z.string().min(1).optional(),
      jobTitle: z.string().min(1).optional(),
      department: z.string().min(1).optional(),
      phone: z.string().min(1).optional(),
      address: z.string().min(1).optional(),
      city: z.string().min(1).optional(),
      country: z.string().min(1).optional(),
    });

    const validatedData = profileSchema.parse(profileData);

    // TODO: Port VerificationService.completeProfile – inline minimal version
    // Mark profile as completed and update fields
    const updatedUser = await storage.updateUser(userId, {
      ...validatedData,
      profileCompleted: true,
      mustCompleteProfile: false,
    });

    return c.json({
      success: true,
      message: "Profile completed successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        company: updatedUser.company,
        phone: updatedUser.phone,
        jobTitle: updatedUser.jobTitle,
        department: updatedUser.department,
        address: updatedUser.address,
        city: updatedUser.city,
        country: updatedUser.country,
        profileImageUrl: updatedUser.profileImageUrl,
        role: updatedUser.role,
        profileCompleted: updatedUser.profileCompleted,
      },
    });
  } catch (error) {
    console.error("Error completing profile:", error);
    if (error instanceof z.ZodError) {
      return c.json(
        { success: false, message: "Invalid profile data", errors: error.errors },
        400,
      );
    }
    return c.json({ success: false, message: "Failed to complete profile" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/auth/profile
// ──────────────────────────────────────────────
users.get("/api/auth/profile", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    const user = await storage.getUser(userId);
    if (!user) {
      return c.json({ message: "User not found" }, 404);
    }

    // Map database columns to camelCase for frontend
    const profileData = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      company: user.company,
      phone: user.phone,
      jobTitle: user.jobTitle,
      department: user.department,
      address: user.address,
      city: user.city,
      country: user.country,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return c.json(profileData);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return c.json({ message: "Failed to fetch profile" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/auth/profile
// ──────────────────────────────────────────────
users.put("/api/auth/profile", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const requestData = await c.req.json();

    // Validate profile data
    const profileSchema = z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      company: z.string().min(1),
      jobTitle: z.string().optional(),
      department: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
    });

    const validatedData = profileSchema.parse(requestData);

    console.log("Updating profile for user:", userId, "with data:", validatedData);

    const updatedUser = await storage.updateUser(userId, validatedData);

    console.log("Profile updated successfully:", updatedUser);

    // Map database columns to camelCase for frontend
    const profileData = {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      company: updatedUser.company,
      phone: updatedUser.phone,
      jobTitle: updatedUser.jobTitle,
      department: updatedUser.department,
      address: updatedUser.address,
      city: updatedUser.city,
      country: updatedUser.country,
      profileImageUrl: updatedUser.profileImageUrl,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };

    return c.json(profileData);
  } catch (error) {
    console.error("Error updating profile:", error);
    if (error instanceof z.ZodError) {
      return c.json({ message: "Invalid profile data", errors: error.errors }, 400);
    }
    return c.json({ message: "Failed to update profile" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/profile/image
// ──────────────────────────────────────────────
users.post("/api/auth/profile/image", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    // Parse multipart form data (Workers-native FormData)
    const formData = await c.req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return c.json({ message: "No image found in upload" }, 400);
    }

    // Upload to R2
    const buffer = await file.arrayBuffer();
    const key = `profiles/${userId}/${file.name}`;

    await c.env.R2_BUCKET.put(key, buffer, {
      httpMetadata: { contentType: file.type },
    });

    // TODO: Generate a public URL for the R2 object.
    // For now, use a relative path that a separate route can serve,
    // or a custom domain pointing at the R2 bucket.
    const imageUrl = `/r2/${key}`;

    // Update user profile with the image URL
    await storage.updateUser(userId, { profileImageUrl: imageUrl });

    return c.json({ imageUrl });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    return c.json({ message: "Failed to upload profile image" }, 500);
  }
});

export default users;
