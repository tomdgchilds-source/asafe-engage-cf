import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
  text,
  decimal,
  integer,
  boolean,
  real,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  company: varchar("company"),
  phone: varchar("phone"),
  jobTitle: varchar("job_title"),
  department: varchar("department"),
  address: text("address"),
  city: varchar("city"),
  country: varchar("country"),
  role: varchar("role").default("customer"), // customer, admin — controls PERMISSIONS only
  // Job role = the person's day-job description (e.g. "BDM", "Engineering
  // Manager", "Procurement Lead"). Shown in email signatures, quote
  // headers, on-screen contact cards. Decoupled from `role` because
  // permission level and job title are different axes.
  jobRole: varchar("job_role").default("BDM"),
  // The rep's currently-active project. Header chip + every form
  // default reads from this. Set when the rep creates, opens, or
  // switches a project. Nullable — new reps won't have one until they
  // create their first project.
  activeProjectId: varchar("active_project_id"),
  // Verification fields
  emailVerified: boolean("email_verified").default(false),
  phoneVerified: boolean("phone_verified").default(false),
  verificationMethod: varchar("verification_method"), // 'email' or 'whatsapp'
  otpCode: varchar("otp_code", { length: 6 }),
  otpExpiry: timestamp("otp_expiry"),
  otpAttempts: integer("otp_attempts").default(0),
  lastOtpSent: timestamp("last_otp_sent"),
  profileCompleted: boolean("profile_completed").default(false),
  mustCompleteProfile: boolean("must_complete_profile").default(true),
  passwordHash: varchar("password_hash"),
  passwordResetToken: varchar("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry"),
  oauthProvider: varchar("oauth_provider"),
  oauthId: varchar("oauth_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Activity Tracking table - stores all viewed items for 1 week
export const userActivity = pgTable("user_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  itemType: varchar("item_type").notNull(), // product, resource, case_study, calculator, faq, etc.
  itemId: varchar("item_id").notNull(),
  itemTitle: varchar("item_title").notNull(),
  itemCategory: varchar("item_category"),
  itemSubcategory: varchar("item_subcategory"),
  itemImage: varchar("item_image"),
  metadata: jsonb("metadata"), // Additional data like product price, resource type, etc.
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  viewCount: integer("view_count").default(1).notNull(),
  lastViewedAt: timestamp("last_viewed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_recent_activity_user_id").on(table.userId),
  index("idx_user_recent_activity_viewed_at").on(table.viewedAt),
  index("idx_user_recent_activity_item_type").on(table.itemType),
  index("idx_user_recent_activity_composite").on(table.userId, table.itemType, table.itemId),
]);

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  orderNumber: varchar("order_number").notNull().unique(),
  status: varchar("status").notNull().default("pending"), // pending, submitted_for_review, processing, shipped, installation_in_progress, fulfilled, cancelled
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default("AED"),
  orderDate: timestamp("order_date").defaultNow(),
  deliveryDate: timestamp("delivery_date"),
  items: jsonb("items").notNull(), // Array of order items
  notes: text("notes"),
  companyLogoUrl: varchar("company_logo_url"), // Company logo for co-branded forms
  customOrderNumber: varchar("custom_order_number"), // Custom A-SAFE Order Form Number for CRM alignment
  // Customer information (can be different from user if order is for someone else)
  isForUser: boolean("is_for_user").notNull().default(true),
  customerName: varchar("customer_name"),
  customerJobTitle: varchar("customer_job_title"),
  customerCompany: varchar("customer_company"),
  customerMobile: varchar("customer_mobile"),
  customerEmail: varchar("customer_email"),
  // Service and discount information
  servicePackage: jsonb("service_package"),
  discountOptions: jsonb("discount_options"),
  // Partner discount information
  partnerDiscountCode: varchar("partner_discount_code"),
  partnerDiscountPercent: integer("partner_discount_percent"),
  // Installation complexity
  installationComplexity: varchar("installation_complexity").default("standard"),
  // Impact calculation data
  impactCalculationId: varchar("impact_calculation_id").references(() => impactCalculations.id),
  // Comprehensive project data
  applicationAreas: jsonb("application_areas"), // Array of areas with their impact calculations
  layoutDrawingId: varchar("layout_drawing_id").references(() => layoutDrawings.id),
  layoutMarkups: jsonb("layout_markups"), // Stored markups with product positions
  uploadedImages: jsonb("uploaded_images"), // Array of area and product images
  projectCaseStudies: jsonb("project_case_studies"), // Array of relevant case study IDs
  reciprocalCommitments: jsonb("reciprocal_commitments"), // Full commitment details
  serviceCareDetails: jsonb("service_care_details"), // Breakdown of service package services
  // Signature tracking with comments
  technicalSignature: jsonb("technical_signature"), // {signed: boolean, signedAt: timestamp, signedBy: string, jobTitle?: string, mobile?: string}
  commercialSignature: jsonb("commercial_signature"), // {signed: boolean, signedAt: timestamp, signedBy: string, jobTitle?: string, mobile?: string}
  // Marketing sign-off is the third leg of the section-level approval trio and
  // historically lived only as free-form comments; we track signatures here so
  // the live order-form view and the PDF can render "Approved by X on Y" the
  // same way Technical/Commercial do.
  marketingSignature: jsonb("marketing_signature"), // {signed: boolean, signedAt: timestamp, signedBy: string, jobTitle?: string, mobile?: string}
  technicalComments: text("technical_comments"), // Optional comments from technical approver
  marketingComments: text("marketing_comments"), // Optional comments from marketing approver
  // Rejection tracking
  rejectionReason: text("rejection_reason"), // Reason for rejection if order is rejected
  rejectedBy: varchar("rejected_by"), // Who rejected the order (technical or marketing)
  rejectionDate: timestamp("rejection_date"), // When the order was rejected
  // Revision tracking
  revisionCount: integer("revision_count").notNull().default(0),
  originalOrderId: varchar("original_order_id"), // Points to the original order if this is a revision
  previousOrderId: varchar("previous_order_id"), // Points to the immediate previous version
  isRevision: boolean("is_revision").notNull().default(false),
  // Project information for restoration
  projectName: varchar("project_name"),
  projectLocation: varchar("project_location"),
  projectDescription: text("project_description"),
  // Magic-link approval flow: captures the email the PREVIOUS approver (or the
  // sales rep, when kicking off technical) entered for the next section. We
  // store it per-section here rather than on approvalTokens so we can render
  // "sent to …" in the live order view without joining on the tokens table
  // every refresh, and so revoking+reissuing a token doesn't wipe the
  // UI-level "pending with X" state.
  // Shape: { technical?: email, commercial?: email, marketing?: email }
  nextApproverEmails: jsonb("next_approver_emails"),
  // ──────────────────────────────────────────────
  // Full order lifecycle beyond approvals. Drives the Admin Kanban + a
  // timeline on the order page. Each stage is tagged with the user + ts
  // in orderAuditLog (existing). `status` (above) is reused — we index it
  // here so the admin board grouping query is cheap. Lifecycle values:
  //   draft | submitted | approved | in_production | delivered |
  //   installed | invoiced | paid | cancelled
  // The existing legacy values (pending, submitted_for_review, …) are
  // preserved for in-flight rows; new orders should adopt the lifecycle
  // taxonomy via the PATCH /api/orders/:id/status endpoint.
  // ──────────────────────────────────────────────
  statusChangedAt: timestamp("status_changed_at"),
  statusChangedBy: varchar("status_changed_by").references(() => users.id),

  // ──────────────────────────────────────────────
  // Public, tokenised share link — customer views the order + PDF without
  // auth. Revocable by any order owner. Token is high-entropy hex.
  // ──────────────────────────────────────────────
  shareToken: varchar("share_token"),
  shareTokenExpiresAt: timestamp("share_token_expires_at"),
  shareTokenCreatedAt: timestamp("share_token_created_at"),
  shareTokenCreatedBy: varchar("share_token_created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("orders_status_idx").on(table.status),
  index("orders_share_token_idx").on(table.shareToken),
]);

// ──────────────────────────────────────────────
// Magic-link approval tokens
//
// Each row is an out-of-band invitation to approve a specific order section.
// Tokens are 32-char hex (128 bits of entropy) — large enough to resist
// enumeration without being brutal to type if someone ever has to copy one
// from an email client that didn't autolink. Single-use: `usedAt` gets stamped
// on successful approval; revoking a token (sales rep re-sends to a different
// email) sets `revokedAt`.
//
// The `token` column is the only thing the recipient ever sees — it's the
// bearer credential. Never log it, never return it from any API surface after
// it's dispatched.
// ──────────────────────────────────────────────
export const approvalTokens = pgTable("approval_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: varchar("token").notNull().unique(),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  // Which section this link approves — we don't infer it from order state
  // because multiple sections can be in-flight simultaneously (e.g. the sales
  // rep re-issued technical while commercial was also outstanding).
  section: varchar("section").notNull(), // "technical" | "commercial" | "marketing"
  // We compare case-insensitively at use time; storing the canonical form the
  // sender entered gives us a stable audit display ("sent to John.Doe@...").
  expectedEmail: varchar("expected_email").notNull(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  // 30-day window. Materialized here (vs. computed at read time) so retroactive
  // policy changes don't silently shorten previously-dispatched links.
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_approval_tokens_token").on(table.token),
  index("idx_approval_tokens_order").on(table.orderId),
]);

// ──────────────────────────────────────────────
// Order audit log
//
// Append-only record of everything-that-happened to an order's approval
// lifecycle. Intentionally denormalized — we store `actorEmail` alongside
// `actorUserId` because magic-link approvers have no account, so userId is
// frequently null. The `details` jsonb is freeform per-event so we can add
// new event types without a migration (e.g. tokenId on email_sent,
// rejectReason on rejected, nextApproverEmail on approver_email_captured).
// ──────────────────────────────────────────────
export const orderAuditLog = pgTable("order_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  // Event taxonomy — keep this list tight; unexpected values indicate a bug.
  // "approved" | "rejected" | "email_sent" | "magic_link_clicked"
  //   | "self_approved_next" | "approver_email_captured" | "token_revoked"
  eventType: varchar("event_type").notNull(),
  section: varchar("section"), // nullable — not every event is section-scoped
  actorUserId: varchar("actor_user_id").references(() => users.id),
  actorEmail: varchar("actor_email"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_order_audit_log_order").on(table.orderId),
  index("idx_order_audit_log_created").on(table.createdAt),
]);

// Vehicle Types table - Comprehensive vehicle catalog with weight specifications
export const vehicleTypes = pgTable("vehicle_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Electric Pallet Truck", "Counterbalance Forklift", etc.
  category: varchar("category").notNull(), // "forklift", "pedestrian", "airport", "truck", etc.
  description: text("description"),
  // Weight specifications (in kg for consistency)
  weightMin: decimal("weight_min", { precision: 8, scale: 2 }).notNull(), // Minimum weight in kg
  weightMax: decimal("weight_max", { precision: 8, scale: 2 }).notNull(), // Maximum weight in kg
  weightTypical: decimal("weight_typical", { precision: 8, scale: 2 }).notNull(), // Most common weight in kg
  // Vehicle specifications
  maxSpeed: integer("max_speed"), // Typical max speed in km/h
  capacityMin: integer("capacity_min"), // Min lifting capacity in kg
  capacityMax: integer("capacity_max"), // Max lifting capacity in kg
  // Visual and UI
  iconUrl: varchar("icon_url").notNull(), // Standardized vehicle icon/image
  thumbnailUrl: varchar("thumbnail_url"),
  hexColor: varchar("hex_color"), // Brand color for UI consistency
  // Classification
  applicationAreas: jsonb("application_areas"), // Array of where this vehicle is typically used
  industries: jsonb("industries"), // Array of industries that commonly use this vehicle
  isActive: boolean("is_active").default(true),
  isPopular: boolean("is_popular").default(false), // Track popular/commonly used vehicles
  sortOrder: integer("sort_order").default(0), // For UI ordering
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Media table - Multiple images, videos, documents per product
export const productMedia = pgTable("product_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").references(() => products.id).notNull(),
  mediaType: varchar("media_type").notNull(), // "image", "video", "document", "3d_model"
  mediaUrl: varchar("media_url").notNull(),
  thumbnailUrl: varchar("thumbnail_url"),
  title: varchar("title"),
  description: text("description"),
  fileSize: integer("file_size"), // In bytes
  mimeType: varchar("mime_type"),
  // Categorization
  category: varchar("category"), // "gallery", "technical", "installation", "test_video", "datasheet"
  tags: jsonb("tags"), // Array of tags for searchability
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Application Types table - Different use cases for barriers
export const applicationTypes = pgTable("application_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(), // "Column Protection", "Rack Protection", etc.
  category: varchar("category").notNull(), // "structural", "traffic", "pedestrian", "storage"
  description: text("description"),
  iconUrl: varchar("icon_url").notNull(), // Application icon/image
  thumbnailUrl: varchar("thumbnail_url"),
  hexColor: varchar("hex_color"), // Brand color for UI consistency
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  isPopular: boolean("is_popular").default(false), // Track popular/commonly used areas
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product-Application Compatibility table - Links products to suitable applications
export const productApplicationCompatibility = pgTable("product_application_compatibility", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").references(() => products.id).notNull(),
  applicationTypeId: varchar("application_type_id").references(() => applicationTypes.id).notNull(),
  isPrimary: boolean("is_primary").default(false), // Primary/main application for this product
  effectiveness: varchar("effectiveness"), // "excellent", "good", "adequate"
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Vehicle-Product Compatibility table - Links vehicles to suitable products
export const vehicleProductCompatibility = pgTable("vehicle_product_compatibility", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleTypeId: varchar("vehicle_type_id").references(() => vehicleTypes.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  compatibilityLevel: varchar("compatibility_level").notNull(), // "optimal", "suitable", "acceptable", "not_recommended"
  // Impact calculation context
  recommendedSpeed: integer("recommended_speed"), // Recommended max speed for this combination
  safetyMargin: decimal("safety_margin", { precision: 5, scale: 2 }), // Safety margin percentage
  notes: text("notes"), // Specific notes about this vehicle-product combination
  // Validation and metadata
  testedConfiguration: boolean("tested_configuration").default(false), // Whether this combo has been physically tested
  certificationStandard: varchar("certification_standard"), // "PAS 13", "TÜV Nord", etc.
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Products table (aligned with actual database structure)
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  category: varchar("category").notNull(), // traffic-guardrails, pedestrian-guardrails, bollards, etc.
  subcategory: varchar("subcategory"),
  description: text("description").notNull(),
  // Enhanced technical specifications
  specifications: jsonb("specifications"), // Technical specs
  impactRating: integer("impact_rating"), // Joule rating
  heightMin: integer("height_min"), // Minimum height in mm
  heightMax: integer("height_max"), // Maximum height in mm
  // PAS 13:2017 Compliance
  pas13Compliant: boolean("pas_13_compliant").default(false), // Whether product meets PAS 13:2017 standards
  pas13TestMethod: varchar("pas_13_test_method"), // "pendulum", "vehicle", "sled" as per PAS 13
  pas13TestJoules: integer("pas_13_test_joules"), // Actual joules tested to per PAS 13
  pas13Sections: jsonb("pas_13_sections"), // Array of PAS 13 sections this product complies with
  pas13CertificationDate: timestamp("pas_13_certification_date"), // When PAS 13 testing was conducted
  deflectionZone: integer("deflection_zone"), // Deflection zone in mm per PAS 13 requirements
  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }),
  basePricePerMeter: decimal("base_price_per_meter", { precision: 10, scale: 2 }), // Per-meter pricing for barriers
  currency: varchar("currency").default("AED"),
  // Primary SKU (for per_unit products this is the only SKU; for per_length
  // families this is the canonical/preferred variant SKU — see product_variants
  // for the full list).
  sku: varchar("sku"),
  // Media
  // imageUrl is the clean product-only hero (studio / catalog-render shot).
  // lifestyleImageUrl is the optional in-situ photo used as a supplementary
  // context strip beneath the hero on product detail pages + order-form
  // Proposed Solutions cards. Keeping them split enforces visual consistency
  // on thumbnails/grids (always hero) without losing the context photography.
  imageUrl: varchar("image_url"),
  lifestyleImageUrl: varchar("lifestyle_image_url"),
  // Flagged true when the current imageUrl is a placeholder sourced from a
  // sibling family (e.g. Bollard Bumper using Monoplex 190). Surfaces a
  // warning badge on the Admin products list so photography backlog stays
  // visible.
  needsImageReview: boolean("needs_image_review").default(false),
  technicalSheetUrl: varchar("technical_sheet_url"),
  installationGuideUrl: varchar("installation_guide_url"),
  // Classification and filtering
  applications: jsonb("applications"), // Array of application areas
  industries: jsonb("industries"), // Array of suitable industries
  features: jsonb("features"), // Array of key features
  // Pricing logic and ordering
  pricingLogic: varchar("pricing_logic"), // per_unit | per_meter | per_length | per_component | per_rate
  minimumOrderMeters: decimal("minimum_order_meters", { precision: 8, scale: 2 }),
  // Catalog taxonomy flags
  isColdStorage: boolean("is_cold_storage").default(false), // CS variants (white rails, cold-rated elastomer)
  isNew: boolean("is_new").default(false), // Matches the "NEW" badge on the price list
  // Price-list audit trail so we can detect stale pricing after a rev
  priceListSource: varchar("price_list_source"), // e.g. PRL-1019-ASF-AED-07112025-1
  priceListVersion: varchar("price_list_version"), // e.g. 2025v1
  priceListEffectiveDate: timestamp("price_list_effective_date"),
  // Metadata
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// product_variants — one row per priced SKU. A family like "iFlex Single Traffic"
// has 6 rows here (one per length). A family like "iFlex Post 130" has a single
// row. Height restrictor + swing gate families have rows tagged with `kind` so
// the quote/cart UI can assemble full-height-restrictor setups from post+rail.
export const productVariants = pgTable("product_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku: varchar("sku"), // A-SAFE part number; may be null for the RackGuard rate-card row
  name: varchar("name").notNull(), // "iFlex Single Traffic - 1600mm"
  variantType: varchar("variant_type").notNull(), // length | size | color | component | rate
  kind: varchar("kind"), // post | top-rail | gate | variant (for multi-part families)
  lengthMm: integer("length_mm"),
  widthMm: integer("width_mm"),
  heightMm: integer("height_mm"),
  dimensionLabel: varchar("dimension_label"), // "100mm x 100mm" for square column guards
  colorLabel: varchar("color_label"), // "Yellow" | "Black"
  priceAed: decimal("price_aed", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default("AED"),
  isNew: boolean("is_new").default(false),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"), // free-form extras (e.g. CSK flag, sided designation)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  productIdx: index("product_variants_product_idx").on(t.productId),
  skuIdx: index("product_variants_sku_idx").on(t.sku),
  lengthIdx: index("product_variants_length_idx").on(t.productId, t.lengthMm),
}));

export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;

// Case Studies table - Updated to match actual database structure
export const caseStudies = pgTable("case_studies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  industry: varchar("industry").notNull(), // manufacturing, logistics, pharmaceuticals, etc.
  company: varchar("company"),
  description: text("description").notNull(),
  challenge: text("challenge"),
  solution: text("solution"),
  outcomes: jsonb("outcomes"), // Array of outcomes/benefits
  imageUrl: varchar("image_url"),
  pdfUrl: varchar("pdf_url"),
  videoUrl: varchar("video_url"), // YouTube or other video URLs
  contentType: varchar("content_type").notNull().default("document"), // "document", "video"
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Solution Finder - Problem submissions table
export const solutionRequests = pgTable("solution_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  problemTitle: varchar("problem_title").notNull(),
  problemDescription: text("problem_description").notNull(),
  industry: varchar("industry"),
  workplaceType: varchar("workplace_type"), // warehouse, manufacturing, office, outdoor, etc.
  vehicleTypes: jsonb("vehicle_types"), // Array of vehicle types involved (forklift, trucks, pedestrians, etc.)
  hazardTypes: jsonb("hazard_types"), // Array of hazard types (collision, impact, falling, etc.)
  impactRequirement: integer("impact_requirement"), // Estimated impact rating needed
  currentSolutions: text("current_solutions"), // What they currently use
  budget: varchar("budget"), // budget range
  timeline: varchar("timeline"), // when they need solution
  urgency: varchar("urgency").default("medium"), // low, medium, high - priority level
  keywords: jsonb("keywords"), // Extracted keywords for matching
  recommendedProducts: jsonb("recommended_products"), // AI-generated product recommendations
  recommendedCaseStudies: jsonb("recommended_case_studies"), // AI-generated case study recommendations
  matchScore: real("match_score"), // Confidence score of recommendations
  status: varchar("status").default("pending"), // pending, reviewed, resolved
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Resources table
export const resources = pgTable("resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  category: varchar("category").notNull(), // Product categories: Traffic Guardrails, Bollards, Column Guards, etc.
  resourceType: varchar("resource_type"), // Resource types: Technical Specifications, Video Guides, Certificates, Installation Guides
  description: text("description"),
  fileUrl: varchar("file_url").notNull(),
  thumbnailUrl: varchar("thumbnail_url"), // Thumbnail image URL for visual preview
  fileSize: integer("file_size"), // in bytes
  fileType: varchar("file_type"), // pdf, doc, etc.
  downloadCount: integer("download_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product-Resource junction table
export const productResources = pgTable("product_resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  resourceId: varchar("resource_id").notNull().references(() => resources.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueProductResource: unique().on(table.productId, table.resourceId),
}));

// FAQ table
export const faqs = pgTable("faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: varchar("category"), // general, products, installation, etc.
  priority: integer("priority").default(0), // for ordering
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Impact Calculations table (for storing user calculations)
export const impactCalculations = pgTable("impact_calculations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  operatingZone: varchar("operating_zone").notNull(), // Mandatory operating zone field
  operationalZoneImageUrl: varchar("operational_zone_image_url"), // Photo of the operational zone
  vehicleMass: decimal("vehicle_mass", { precision: 8, scale: 2 }).notNull(),
  loadMass: decimal("load_mass", { precision: 8, scale: 2 }).notNull(),
  speed: decimal("speed", { precision: 6, scale: 2 }).notNull(),
  speedUnit: varchar("speed_unit").notNull(), // mph, kmh, ms
  impactAngle: decimal("impact_angle", { precision: 5, scale: 2 }).notNull(),
  kineticEnergy: decimal("kinetic_energy", { precision: 10, scale: 2 }).notNull(),
  // PAS 13:2017 Calculation Fields
  aisleWidth: decimal("aisle_width", { precision: 6, scale: 2 }), // Aisle width in meters for PAS 13 angle calculation
  maxImpactAngle: decimal("max_impact_angle", { precision: 5, scale: 2 }), // Maximum angle per PAS 13 Figure 17
  pas13AdjustedEnergy: decimal("pas_13_adjusted_energy", { precision: 10, scale: 2 }), // Energy with PAS 13 45° adjustment
  pas13Compliant: boolean("pas_13_compliant").default(false), // Whether calculation meets PAS 13 requirements
  pas13SafetyMargin: decimal("pas_13_safety_margin", { precision: 5, scale: 2 }), // Safety margin percentage applied
  recommendedProducts: jsonb("recommended_products"), // Array of product IDs
  createdAt: timestamp("created_at").defaultNow(),
});

// Order Form Requests table - Updated to match actual database structure
export const quoteRequests = pgTable("quote_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productNames: text("product_names").array().notNull(), // Array field to match actual DB
  contactMethod: varchar("contact_method").notNull(), // 'email' or 'whatsapp'
  email: varchar("email"),
  phoneNumber: varchar("phone_number"),
  company: varchar("company"),
  customOrderNumber: varchar("custom_order_number"), // Custom CRM quote number (optional)
  message: text("message").notNull(), // Stores full quote details
  status: varchar("status").notNull().default("pending"), // 'pending', 'in_progress', 'quoted', 'completed'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Order Form Request Items table - For itemized cart items in order form requests
export const quoteRequestItems = pgTable("quote_request_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteRequestId: varchar("quote_request_id").notNull().references(() => quoteRequests.id),
  productName: varchar("product_name").notNull(),
  unitPrice: real("unit_price").notNull(),
  quantity: real("quantity").notNull(),
  totalPrice: real("total_price").notNull(),
  pricingTier: varchar("pricing_tier"),
  pricingType: varchar("pricing_type").notNull(),
  notes: text("notes"),
  // Delivery options
  requiresDelivery: boolean("requires_delivery").default(false),
  deliveryAddress: text("delivery_address"),
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 8 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 11, scale: 8 }),
  // Installation options
  requiresInstallation: boolean("requires_installation").default(false),
  // Column guard specific options
  columnLength: varchar("column_length"),
  columnWidth: varchar("column_width"),
  sidesToProtect: integer("sides_to_protect"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cart Items table - matching actual database structure
export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productName: varchar("product_name").notNull(),
  unitPrice: real("unit_price").notNull(),
  quantity: real("quantity").notNull(), // For barriers: meters, for items: pieces
  totalPrice: real("total_price").notNull(),
  pricingTier: varchar("pricing_tier"),
  pricingType: varchar("pricing_type").notNull(),
  notes: text("notes"),
  applicationArea: text("application_area"), // Optional field for specific application/location reference
  // Delivery options
  requiresDelivery: boolean("requires_delivery").default(false),
  deliveryAddress: text("delivery_address"),
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 8 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 11, scale: 8 }),
  // Installation options
  requiresInstallation: boolean("requires_installation").default(false),
  // Column guard specific options
  columnLength: varchar("column_length"), // Length in mm
  columnWidth: varchar("column_width"),   // Width in mm
  sidesToProtect: integer("sides_to_protect"), // Number of sides (1-4)
  // FlexiShield spacer options
  lengthSpacers: integer("length_spacers"), // Number of 100mm spacer pairs for length
  widthSpacers: integer("width_spacers"),   // Number of 100mm spacer pairs for width
  // Height restrictor specific options
  restrictorHeight: decimal("restrictor_height"),
  restrictorWidth: decimal("restrictor_width"),
  // Topple Barrier specific options
  toppleHeight: decimal("topple_height"),
  toppleWidth: decimal("topple_width"),
  // Calculator images from product configurator
  calculatorImages: jsonb("calculator_images"), // Array of image URL strings
  // Selected variant details
  selectedVariant: jsonb("selected_variant"), // Object with variant info (itemId, variant, length, width, height, price, code)
  // Impact calculation linkage
  impactCalculationId: varchar("impact_calculation_id").references(() => impactCalculations.id),
  calculationContext: jsonb("calculation_context"), // Store calculation details for display
  // Site reference images
  referenceImages: jsonb("reference_images"), // Array of {url: string, caption: string, uploadedAt: timestamp}
  installationLocation: text("installation_location"), // Where this product will be installed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Pricing table (for barriers with linear meter pricing)
export const productPricing = pgTable("product_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productName: varchar("product_name").notNull(),
  pricingType: varchar("pricing_type").notNull(), // 'linear_meter' or 'per_item'
  tier1Min: varchar("tier1_min").notNull(), // 1-2 meters
  tier1Max: varchar("tier1_max").notNull(),
  tier1Price: varchar("tier1_price").notNull(),
  tier2Min: varchar("tier2_min").notNull(), // 2-10 meters
  tier2Max: varchar("tier2_max").notNull(),
  tier2Price: varchar("tier2_price").notNull(),
  tier3Min: varchar("tier3_min").notNull(), // 10-20 meters
  tier3Max: varchar("tier3_max").notNull(),
  tier3Price: varchar("tier3_price").notNull(),
  tier4Min: varchar("tier4_min").notNull(), // 20+ meters
  tier4Max: varchar("tier4_max").notNull(),
  tier4Price: varchar("tier4_price").notNull(),
  currency: varchar("currency").notNull().default("AED"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company Logos cache table
export const companyLogos = pgTable("company_logos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: varchar("company_name").notNull().unique(),
  logoUrl: varchar("logo_url").notNull(),
  thumbnailUrl: varchar("thumbnail_url"),
  source: varchar("source"), // Where the logo was found
  confidenceScore: real("confidence_score"), // 0-1 confidence in match
  isVerified: boolean("is_verified").default(false), // User confirmed
  metadata: jsonb("metadata"), // Additional info about the logo
  lastUsed: timestamp("last_used").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Site Surveys table
export const siteSurveys = pgTable("site_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  facilityName: varchar("facility_name").notNull(),
  facilityLocation: text("facility_location"),
  companyLogoUrl: varchar("company_logo_url"), // Company logo
  logoConfidenceScore: real("logo_confidence_score"), // Confidence in logo match
  surveyDate: timestamp("survey_date").defaultNow(),
  status: varchar("status").notNull().default("draft"), // draft, completed, shared
  description: text("description"),
  // Requested by information
  requestedByName: varchar("requested_by_name"),
  requestedByPosition: varchar("requested_by_position"),
  requestedByEmail: varchar("requested_by_email"),
  requestedByMobile: varchar("requested_by_mobile"),
  // Overall facility assessment
  overallRiskLevel: varchar("overall_risk_level"), // low, medium, high, critical
  totalAreasReviewed: integer("total_areas_reviewed").default(0),
  totalIssuesIdentified: integer("total_issues_identified").default(0),
  estimatedBudgetRequired: decimal("estimated_budget_required", { precision: 12, scale: 2 }),
  // Solution finding results
  recommendedProducts: jsonb("recommended_products"), // Array of product recommendations
  recommendedCaseStudies: jsonb("recommended_case_studies"), // Array of relevant case studies
  solutionSummary: text("solution_summary"), // AI-generated solution summary
  // Report generation
  pdfReportUrl: varchar("pdf_report_url"),
  htmlReportUrl: varchar("html_report_url"),
  sharedWithManagement: boolean("shared_with_management").default(false),
  sharedAt: timestamp("shared_at"),
  lastViewed: timestamp("last_viewed"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Site Survey Areas table - Individual areas of concern
export const siteSurveyAreas = pgTable("site_survey_areas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteSurveyId: varchar("site_survey_id").notNull().references(() => siteSurveys.id),
  zoneName: varchar("zone_name").notNull(), // Zone/area grouping (e.g., "Staging Area", "Loading Dock")
  areaType: varchar("area_type").notNull(), // From applicationAreaData
  areaName: varchar("area_name").notNull(), // Custom name for this specific area
  description: text("description"),
  currentCondition: varchar("current_condition").notNull(), // good, damaged, critical, unprotected
  riskLevel: varchar("risk_level").notNull(), // low, medium, high, critical
  issueDescription: text("issue_description").notNull(),
  recommendedAction: text("recommended_action"),
  // Priority and costing
  priority: varchar("priority").notNull().default("medium"), // low, medium, high, urgent
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  // Location data
  locationDescription: text("location_description"),
  coordinates: jsonb("coordinates"), // {lat, lng} if GPS available
  // Photos and documentation
  photosUrls: jsonb("photos_urls"), // Array of photo URLs
  // Impact calculation data for the zone
  vehicleWeight: real("vehicle_weight"),
  vehicleSpeed: real("vehicle_speed"),
  impactAngle: real("impact_angle").default(90),
  calculatedJoules: real("calculated_joules"),
  // Recommended products based on impact calculation
  recommendedProducts: jsonb("recommended_products"), // Array of {productId, productName, imageUrl, reason}
  // Solution matching results
  justification: text("justification"), // Why these products were recommended
  matterportUrl: varchar("matterport_url"),
  matterportModelId: varchar("matterport_model_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Create insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserActivitySchema = createInsertSchema(userActivity).omit({
  id: true,
  viewedAt: true,
  lastViewedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApprovalTokenSchema = createInsertSchema(approvalTokens).omit({
  id: true,
  issuedAt: true,
  createdAt: true,
});

export const insertOrderAuditLogSchema = createInsertSchema(orderAuditLog).omit({
  id: true,
  createdAt: true,
});

export const insertVehicleTypeSchema = createInsertSchema(vehicleTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductMediaSchema = createInsertSchema(productMedia).omit({
  id: true,
  createdAt: true,
});

export const insertVehicleProductCompatibilitySchema = createInsertSchema(vehicleProductCompatibility).omit({
  id: true,
  createdAt: true,
});

export const insertApplicationTypeSchema = createInsertSchema(applicationTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductApplicationCompatibilitySchema = createInsertSchema(productApplicationCompatibility).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCaseStudySchema = createInsertSchema(caseStudies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFaqSchema = createInsertSchema(faqs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSiteSurveySchema = createInsertSchema(siteSurveys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSiteSurveyAreaSchema = createInsertSchema(siteSurveyAreas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Site Survey types
export type SiteSurvey = typeof siteSurveys.$inferSelect;
export type InsertSiteSurvey = z.infer<typeof insertSiteSurveySchema>;
export type SiteSurveyArea = typeof siteSurveyAreas.$inferSelect;
export type InsertSiteSurveyArea = z.infer<typeof insertSiteSurveyAreaSchema>;

export const insertImpactCalculationSchema = createInsertSchema(impactCalculations).omit({
  id: true,
  createdAt: true,
});

export const insertQuoteRequestSchema = createInsertSchema(quoteRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteRequestItemSchema = createInsertSchema(quoteRequestItems).omit({
  id: true,
  createdAt: true,
});

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductPricingSchema = createInsertSchema(productPricing).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Discount Options table
export const discountOptions = pgTable("discount_options", {
  id: varchar("id").primaryKey(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  category: varchar("category").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Discount Selections table (tracks what discounts a user has selected for their cart)
export const userDiscountSelections = pgTable("user_discount_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  discountOptionId: varchar("discount_option_id").notNull().references(() => discountOptions.id),
  isSelected: boolean("is_selected").default(true),
  // LinkedIn social discount data
  linkedinDiscountData: jsonb("linkedin_discount_data"), // { companyUrl, followers, commitment, postUrl, proofUrls, status, verifiedAt, verifiedBy, baseAedDiscount, appliedDiscount }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Partner discount codes — channel-partner / reseller rates. Codes are stored
// case-insensitively (compared via LOWER()); the client can't enumerate them.
export const partnerCodes = pgTable("partner_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(),
  partnerName: varchar("partner_name").notNull(),
  discountPercent: integer("discount_percent").notNull(), // 1..35
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  usageCap: integer("usage_cap"),          // null = unlimited
  usageCount: integer("usage_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // case-insensitive lookup index
  codeLowerIdx: index("partner_codes_code_lower_idx").on(sql`lower(${t.code})`),
}));

// Every time a partner code is actually *applied* to an order we write a row
// here. This gives sales ops a clean audit trail and lets us enforce usage
// caps atomically (increment on this write, not on validate).
export const partnerCodeRedemptions = pgTable("partner_code_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerCodeId: varchar("partner_code_id").notNull().references(() => partnerCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  orderId: varchar("order_id"), // set when the redemption is tied to a created order
  cartSubtotal: decimal("cart_subtotal", { precision: 12, scale: 2 }),
  discountPercentApplied: integer("discount_percent_applied").notNull(),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
});

export const insertPartnerCodeSchema = createInsertSchema(partnerCodes).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});
export type PartnerCode = typeof partnerCodes.$inferSelect;
export type InsertPartnerCode = z.infer<typeof insertPartnerCodeSchema>;
export type PartnerCodeRedemption = typeof partnerCodeRedemptions.$inferSelect;

export const insertDiscountOptionSchema = createInsertSchema(discountOptions).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertUserDiscountSelectionSchema = createInsertSchema(userDiscountSelections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Service Care Options table
export const serviceCareOptions = pgTable("service_care_options", {
  id: varchar("id").primaryKey(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  chargeable: boolean("chargeable").notNull(),
  value: varchar("value").notNull(), // "Free", "5%", "10%", etc.
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Service Selection table
export const userServiceSelections = pgTable("user_service_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  serviceOptionId: varchar("service_option_id").notNull().references(() => serviceCareOptions.id),
  isSelected: boolean("is_selected").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const currencyRates = pgTable("currency_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("AED"),
  targetCurrency: varchar("target_currency", { length: 3 }).notNull(),
  rate: decimal("rate", { precision: 12, scale: 6 }).notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => ({
  uniqueCurrencyPair: unique().on(table.baseCurrency, table.targetCurrency),
}));

// Layout drawings table
export const layoutDrawings = pgTable("layout_drawings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  projectName: varchar("project_name"),
  company: varchar("company"),
  location: varchar("location"),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  fileType: varchar("file_type").notNull(), // 'pdf' or 'image'
  thumbnailUrl: varchar("thumbnail_url"),
  scale: real("scale"), // Scale factor (pixels per mm)
  scaleLine: jsonb("scale_line"), // {start: {x, y}, end: {x, y}, actualLength: number, zoomLevel: number}
  isScaleSet: boolean("is_scale_set").default(false),
  // ── Title-block / frame metadata (matches the A-SAFE DWC LLC drawing template) ──
  // Populated when a drawing is created; editable from the LayoutMarkupEditor.
  // When blank we fall back to placeholders at render time (TBD, today's date, etc.).
  dwgNumber: varchar("dwg_number"),            // e.g. "DWGAE002882"
  revision: varchar("revision"),                // e.g. "03"
  drawingDate: varchar("drawing_date"),         // stored as "DD-MMM-YYYY" string for exact match to the printed format
  drawingTitle: varchar("drawing_title"),       // e.g. "A-SAFE BARRIER PROPOSAL"
  drawingScale: varchar("drawing_scale"),       // "NTS" / "1:100" / etc.
  author: varchar("author"),                    // initials e.g. "VM"
  checkedBy: varchar("checked_by"),             // initials e.g. "SS"
  revisionHistory: jsonb("revision_history"),   // [{ rev: "01", date: "12-JAN-2026", notes: "STB-CS added" }, ...]
  notesSection: text("notes_section"),          // free-text bulleted note list for the "Notes Section" block
  deletedAt: timestamp("deleted_at"), // For soft delete functionality
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Layout markups table - for annotating drawings with product placements
export const layoutMarkups = pgTable("layout_markups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  layoutDrawingId: varchar("layout_drawing_id").references(() => layoutDrawings.id).notNull(),
  cartItemId: varchar("cart_item_id"), // Reference to specific cart item
  productName: varchar("product_name"), // Store product name for reference
  xPosition: real("x_position").notNull(), // X coordinate on image (as percentage)
  yPosition: real("y_position").notNull(), // Y coordinate on image (as percentage)
  endX: real("end_x"), // End X coordinate for lines (backward compatibility)
  endY: real("end_y"), // End Y coordinate for lines (backward compatibility)
  pathData: text("path_data"), // JSON string of drawing path points for freehand drawing
  comment: text("comment"), // User comment like "tarmac floor" or "replace steel barrier"
  calculatedLength: real("calculated_length"), // Calculated barrier length in mm
  deletedAt: timestamp("deleted_at"), // For soft delete functionality
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Draft Projects table - for saving cart projects as drafts
export const draftProjects = pgTable("draft_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  projectName: varchar("project_name").notNull(),
  description: text("description"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  currency: varchar("currency").default("AED"),
  // Store the entire cart as JSON including all cart items and their details
  cartData: jsonb("cart_data").notNull(), // Complete cart snapshot
  // Additional project metadata
  discountSelections: jsonb("discount_selections"), // User's discount selections
  serviceSelections: jsonb("service_selections"), // User's service selections
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cart Project Information table - for auto-saving project info in cart
export const cartProjectInfo = pgTable("cart_project_info", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  company: varchar("company"),
  location: varchar("location"),
  projectDescription: text("project_description"),
  companyLogoUrl: varchar("company_logo_url"), // Customer company logo (shown in app header + PDFs)
  // Social media commitment data
  socialCommitment: jsonb("social_commitment"), // { linkedin: { companyUrl, followers, postCommitment, postUrl, proofUrls, status } }
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════
// OPPORTUNITY / PROJECT / CONTACT MODEL
//
// Built so sales reps don't retype the same company, site, and
// customer-contact details across Site Survey, Layout Drawing, Order
// Form, and PDF cover pages. Entities are separate so a single customer
// (e.g. Dnata) can have multiple concurrent projects (warehouse A,
// warehouse B, office fit-out) that share the company profile and logo
// but have distinct sites, contacts, and orders.
// ═══════════════════════════════════════════════════════════════════

// A customer company — persistent across projects. One Dnata record
// feeds logo + billing address into every Dnata project. Owned by the
// sales rep who created it (to avoid cross-rep data bleed on a shared
// tenancy); exposure to other reps is a future permissions feature.
export const customerCompanies = pgTable("customer_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  logoUrl: varchar("logo_url"),
  industry: varchar("industry"),
  billingAddress: text("billing_address"),
  city: varchar("city"),
  country: varchar("country"),
  website: varchar("website"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  userIdx: index("customer_companies_user_idx").on(t.userId),
  nameLowerIdx: index("customer_companies_name_lower_idx").on(sql`lower(${t.name})`),
}));

// A project = one opportunity against one customer. Sales reps may have
// many active projects in parallel, and can switch between them via
// the header chip. `lastAccessedAt` drives the "Recent projects" list.
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  customerCompanyId: varchar("customer_company_id").references(() => customerCompanies.id),
  name: varchar("name").notNull(),
  location: varchar("location"),
  description: text("description"),
  status: varchar("status").default("active"), // active | won | lost | on_hold
  defaultDeliveryAddress: text("default_delivery_address"),
  defaultInstallationComplexity: varchar("default_installation_complexity"), // simple | standard | complex
  // Free-form per-project templates — lets a rep save their go-to
  // reciprocal commitments and service tier for one-click reapplication.
  preferredReciprocalCommitmentIds: jsonb("preferred_reciprocal_commitment_ids"), // string[]
  preferredServiceOptionId: varchar("preferred_service_option_id"),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  userIdx: index("projects_user_idx").on(t.userId),
  customerIdx: index("projects_customer_idx").on(t.customerCompanyId),
  lastAccessedIdx: index("projects_last_accessed_idx").on(t.lastAccessedAt),
}));

// Customer contacts, attached to projects (and, through the project, to
// the customer company). Roles drive which contact is suggested when we
// dispatch the Technical / Commercial / Marketing approval emails.
// lastInteractedAt updates whenever a contact approves, rejects, or is
// manually selected — so the "usual suspects" bubble to the top.
export const projectContacts = pgTable("project_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  customerCompanyId: varchar("customer_company_id").references(() => customerCompanies.id),
  name: varchar("name").notNull(),
  jobTitle: varchar("job_title"),
  email: varchar("email"),
  mobile: varchar("mobile"),
  // Contact role. `primary` = day-to-day PM / main liaison.
  // technical_approver / commercial_approver / marketing_lead feed the
  // approval-chain email dispatch default suggestions.
  role: varchar("role"), // primary | technical_approver | commercial_approver | marketing_lead | pm | other
  notes: text("notes"),
  lastInteractedAt: timestamp("last_interacted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  projectIdx: index("project_contacts_project_idx").on(t.projectId),
  emailIdx: index("project_contacts_email_idx").on(sql`lower(${t.email})`),
}));

// Project collaborators — opt-in shared access. The project's primary
// owner is tracked via projects.userId; this table adds additional reps
// at owner | editor | viewer role levels. Instant-grant model: the
// invite becomes active the moment the row is written (acceptedAt
// defaults to now). Downstream entities (orders, surveys, drawings,
// project contacts) inherit access via the project reference.
export const projectCollaborators = pgTable("project_collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role").notNull().default("editor"), // owner | editor | viewer
  invitedBy: varchar("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at").defaultNow(),
  acceptedAt: timestamp("accepted_at").defaultNow(), // instant-grant, so default-now
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  projectIdx: index("project_collaborators_project_idx").on(t.projectId),
  userIdx: index("project_collaborators_user_idx").on(t.userId),
  uniqProjectUser: uniqueIndex("project_collaborators_project_user_unique").on(t.projectId, t.userId),
}));

export type ProjectCollaborator = typeof projectCollaborators.$inferSelect;
export type InsertProjectCollaborator = typeof projectCollaborators.$inferInsert;

export const insertCustomerCompanySchema = createInsertSchema(customerCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAccessedAt: true,
});
export const insertProjectContactSchema = createInsertSchema(projectContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastInteractedAt: true,
});
export type CustomerCompany = typeof customerCompanies.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectContact = typeof projectContacts.$inferSelect;
export type InsertCustomerCompany = z.infer<typeof insertCustomerCompanySchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertProjectContact = z.infer<typeof insertProjectContactSchema>;

// Project Case Studies table - for associating case studies with user projects
export const projectCaseStudies = pgTable("project_case_studies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  caseStudyId: varchar("case_study_id").notNull().references(() => caseStudies.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat conversations table
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  role: varchar("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  imageUrl: varchar("image_url"), // For screenshot uploads
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertServiceCareOptionSchema = createInsertSchema(serviceCareOptions).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertUserServiceSelectionSchema = createInsertSchema(userServiceSelections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDraftProjectSchema = createInsertSchema(draftProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSolutionRequestSchema = createInsertSchema(solutionRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  keywords: true, // Auto-generated by server
  recommendedProducts: true, // Auto-generated by matching algorithm
  recommendedCaseStudies: true, // Auto-generated by matching algorithm
  matchScore: true, // Auto-generated by matching algorithm
  status: true, // Has default value
  isPublished: true, // Has default value
}).partial({
  hazardTypes: true, // Optional - not always provided by frontend
  currentSolutions: true, // Optional - not always provided by frontend
  budget: true, // Optional - not always provided by frontend
  timeline: true, // Optional - not always provided by frontend
  industry: true, // Make optional to match frontend schema
  workplaceType: true, // Make optional to match frontend schema
});

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertCartProjectInfoSchema = createInsertSchema(cartProjectInfo).omit({
  id: true,
  updatedAt: true,
});

export const insertProjectCaseStudySchema = createInsertSchema(projectCaseStudies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Notifications and Messaging System
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: varchar("type").notNull(), // order_update, new_product, case_study, system_alert, message, quote_update, project_share
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"), // Additional context data
  isRead: boolean("is_read").default(false),
  priority: varchar("priority").default("normal"), // low, normal, high, urgent
  actionUrl: varchar("action_url"), // Optional deep link
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // direct, project, support, group
  title: varchar("title"),
  description: text("description"),
  metadata: jsonb("metadata"), // Additional context (order_id, project_id, etc.)
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: varchar("role").default("participant"), // participant, moderator, admin
  joinedAt: timestamp("joined_at").defaultNow(),
  lastReadAt: timestamp("last_read_at"),
  isActive: boolean("is_active").default(true),
});

export const messages: any = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  senderId: varchar("sender_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  messageType: varchar("message_type").default("text"), // text, image, file, system
  attachments: jsonb("attachments"), // File attachments
  replyToId: varchar("reply_to_id").references((): any => messages.id),
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messageReactions = pgTable("message_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  emoji: varchar("emoji").notNull(), // 👍, ❤️, 😊, etc.
  createdAt: timestamp("created_at").defaultNow(),
});


export const safetyMetrics = pgTable("safety_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  companyId: varchar("company_id"), // For multi-company users
  metricType: varchar("metric_type").notNull(), // incident_reduction, cost_savings, compliance_score
  value: decimal("value", { precision: 15, scale: 2 }).notNull(),
  unit: varchar("unit"), // percentage, currency, count, etc.
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("created_at").defaultNow(),
});

// Smart Planning and Compliance
export const complianceChecks = pgTable("compliance_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  region: varchar("region").notNull(), // UAE, Saudi, UK, EU, etc.
  industryCode: varchar("industry_code"), // NAICS or similar
  standardsChecked: jsonb("standards_checked"), // Array of standards checked
  productId: varchar("product_id").references(() => products.id),
  complianceStatus: varchar("compliance_status").notNull(), // compliant, non_compliant, partial, unknown
  findings: jsonb("findings"), // Detailed compliance findings
  recommendations: jsonb("recommendations"),
  lastChecked: timestamp("last_checked").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const smartReorders = pgTable("smart_reorders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  lastOrderDate: timestamp("last_order_date"),
  averageOrderInterval: integer("average_order_interval"), // Days
  predictedReorderDate: timestamp("predicted_reorder_date"),
  currentStock: integer("current_stock"),
  reorderThreshold: integer("reorder_threshold"),
  recommendedQuantity: integer("recommended_quantity"),
  priority: varchar("priority").default("normal"), // low, normal, high, urgent
  status: varchar("status").default("pending"), // pending, scheduled, ordered, cancelled
  notificationSent: boolean("notification_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Knowledge Hub and Training
export const trainingModules = pgTable("training_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  category: varchar("category"), // installation, maintenance, safety, compliance
  difficulty: varchar("difficulty").default("beginner"), // beginner, intermediate, advanced
  estimatedDuration: integer("estimated_duration"), // Minutes
  contentType: varchar("content_type").notNull(), // video, interactive, document, quiz
  contentUrl: varchar("content_url"),
  contentData: jsonb("content_data"), // Rich content structure
  prerequisites: jsonb("prerequisites"), // Array of prerequisite module IDs
  certificationRequired: boolean("certification_required").default(false),
  isPublished: boolean("is_published").default(true),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userTrainingProgress = pgTable("user_training_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  moduleId: varchar("module_id").references(() => trainingModules.id).notNull(),
  status: varchar("status").default("not_started"), // not_started, in_progress, completed, failed
  progressPercentage: integer("progress_percentage").default(0),
  timeSpent: integer("time_spent").default(0), // Minutes
  score: integer("score"), // For quizzes
  certificateUrl: varchar("certificate_url"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const forumCategories: any = pgTable("forum_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  icon: varchar("icon"),
  color: varchar("color"),
  parentId: varchar("parent_id").references((): any => forumCategories.id),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const forumTopics = pgTable("forum_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").references(() => forumCategories.id).notNull(),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  isPinned: boolean("is_pinned").default(false),
  isLocked: boolean("is_locked").default(false),
  tags: jsonb("tags"), // Array of topic tags
  viewCount: integer("view_count").default(0),
  replyCount: integer("reply_count").default(0),
  lastReplyAt: timestamp("last_reply_at"),
  lastReplyBy: varchar("last_reply_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const forumReplies: any = pgTable("forum_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").references(() => forumTopics.id).notNull(),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  parentReplyId: varchar("parent_reply_id").references((): any => forumReplies.id),
  isAcceptedAnswer: boolean("is_accepted_answer").default(false),
  likeCount: integer("like_count").default(0),
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Business Intelligence
export const marketTrends = pgTable("market_trends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  region: varchar("region").notNull(),
  industry: varchar("industry").notNull(),
  trendType: varchar("trend_type").notNull(), // demand, pricing, regulation, technology
  title: varchar("title").notNull(),
  description: text("description"),
  impact: varchar("impact"), // low, medium, high
  confidence: varchar("confidence"), // low, medium, high
  dataPoints: jsonb("data_points"), // Historical data
  predictions: jsonb("predictions"), // Future projections
  sources: jsonb("sources"), // Data sources
  isPublic: boolean("is_public").default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  contractType: varchar("contract_type").notNull(), // service, supply, partnership
  title: varchar("title").notNull(),
  contractNumber: varchar("contract_number").unique(),
  status: varchar("status").default("draft"), // draft, active, expired, terminated, renewed
  value: decimal("value", { precision: 15, scale: 2 }),
  currency: varchar("currency").default("AED"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  renewalDate: timestamp("renewal_date"),
  terms: jsonb("terms"), // Contract terms and conditions
  documents: jsonb("documents"), // Contract documents
  notifications: jsonb("notifications"), // Renewal reminders, etc.
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin Users table - separate from regular users for security
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").notNull().unique(),
  passwordHash: varchar("password_hash").notNull(),
  email: varchar("email").notNull().unique(),
  fullName: varchar("full_name").notNull(),
  role: varchar("role").notNull().default("admin"), // admin, super_admin
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Activity Logs table - tracks all user actions
export const userActivityLogs = pgTable("user_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  activityType: varchar("activity_type").notNull(), // page_view, calculation, order_draft, order_submit, etc.
  section: varchar("section").notNull(), // dashboard, calculator, products, cart, etc.
  details: jsonb("details"), // Additional activity-specific data
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  sessionId: varchar("session_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_activity_user_id").on(table.userId),
  index("idx_user_activity_created_at").on(table.createdAt),
]);

// Global Offices table - for A-SAFE worldwide offices and resellers
export const globalOffices = pgTable("global_offices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: varchar("company_name").notNull(), // e.g., "A-SAFE UK Ltd", "A-SAFE DWC-LLC"
  officeType: varchar("office_type").notNull(), // "office" or "reseller"
  region: varchar("region").notNull(), // "Europe", "Middle East", "Asia Pacific", "Americas"
  country: varchar("country").notNull(), // "United Kingdom", "United Arab Emirates", etc.
  city: varchar("city").notNull(),
  addressLine1: varchar("address_line1").notNull(),
  addressLine2: varchar("address_line2"),
  addressLine3: varchar("address_line3"),
  postalCode: varchar("postal_code"),
  phone: varchar("phone").notNull(),
  email: varchar("email").notNull(),
  imageUrl: varchar("image_url"),
  googleMapsUrl: varchar("google_maps_url"),
  // Coordinates for mapping
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  // Additional office details
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // For marking default office per region
  sortOrder: integer("sort_order").default(0), // For custom ordering
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for new tables
export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});


export const insertSafetyMetricsSchema = createInsertSchema(safetyMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertComplianceCheckSchema = createInsertSchema(complianceChecks).omit({
  id: true,
  lastChecked: true,
  createdAt: true,
});

export const insertSmartReorderSchema = createInsertSchema(smartReorders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingModuleSchema = createInsertSchema(trainingModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertForumTopicSchema = createInsertSchema(forumTopics).omit({
  id: true,
  viewCount: true,
  replyCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMarketTrendSchema = createInsertSchema(marketTrends).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserActivityLogSchema = createInsertSchema(userActivityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertGlobalOfficeSchema = createInsertSchema(globalOffices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertUserActivity = z.infer<typeof insertUserActivitySchema>;
export type UserActivity = typeof userActivity.$inferSelect;
export type InsertVehicleType = z.infer<typeof insertVehicleTypeSchema>;
export type VehicleType = typeof vehicleTypes.$inferSelect;
export type InsertProductMedia = z.infer<typeof insertProductMediaSchema>;
export type ProductMedia = typeof productMedia.$inferSelect;
export type InsertVehicleProductCompatibility = z.infer<typeof insertVehicleProductCompatibilitySchema>;
export type VehicleProductCompatibility = typeof vehicleProductCompatibility.$inferSelect;
export type InsertApplicationType = z.infer<typeof insertApplicationTypeSchema>;
export type ApplicationType = typeof applicationTypes.$inferSelect;
export type InsertProductApplicationCompatibility = z.infer<typeof insertProductApplicationCompatibilitySchema>;
export type ProductApplicationCompatibility = typeof productApplicationCompatibility.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type ApprovalToken = typeof approvalTokens.$inferSelect;
export type InsertApprovalToken = z.infer<typeof insertApprovalTokenSchema>;
export type OrderAuditLog = typeof orderAuditLog.$inferSelect;
export type InsertOrderAuditLog = z.infer<typeof insertOrderAuditLogSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type InsertCartProjectInfo = z.infer<typeof insertCartProjectInfoSchema>;
export type CartProjectInfo = typeof cartProjectInfo.$inferSelect;

// Product type with proper nullable field handling. Kept hand-written
// (rather than `typeof products.$inferSelect`) so the card components
// can consume it without dragging in the full pg column-type machinery.
// Must stay in sync with the `products` table columns above.
export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  description: string;
  specifications?: unknown;
  impactRating?: number | null;
  heightMin?: number | null;
  heightMax?: number | null;
  // PAS 13:2017 (mirrors products table lines 366-371)
  pas13Compliant?: boolean | null;
  pas13TestMethod?: string | null;
  pas13TestJoules?: number | null;
  pas13Sections?: unknown;
  pas13CertificationDate?: Date | null;
  deflectionZone?: number | null;
  price?: string | null;
  currency?: string | null;
  imageUrl?: string | null;
  technicalSheetUrl?: string | null;
  applications?: unknown;
  industries?: unknown;
  features?: unknown;
  isActive?: boolean | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}
export type InsertCaseStudy = z.infer<typeof insertCaseStudySchema>;
export type CaseStudy = typeof caseStudies.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resources.$inferSelect;
export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type Faq = typeof faqs.$inferSelect;
export type InsertImpactCalculation = z.infer<typeof insertImpactCalculationSchema>;
export type ImpactCalculation = typeof impactCalculations.$inferSelect;
export type InsertQuoteRequest = z.infer<typeof insertQuoteRequestSchema>;
export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type InsertQuoteRequestItem = z.infer<typeof insertQuoteRequestItemSchema>;
export type QuoteRequestItem = typeof quoteRequestItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertProductPricing = z.infer<typeof insertProductPricingSchema>;
export type ProductPricing = typeof productPricing.$inferSelect;
export type InsertDiscountOption = z.infer<typeof insertDiscountOptionSchema>;
export type DiscountOption = typeof discountOptions.$inferSelect;
export type InsertUserDiscountSelection = z.infer<typeof insertUserDiscountSelectionSchema>;
export type UserDiscountSelection = typeof userDiscountSelections.$inferSelect;
export type InsertServiceCareOption = z.infer<typeof insertServiceCareOptionSchema>;
export type ServiceCareOption = typeof serviceCareOptions.$inferSelect;
export type InsertUserServiceSelection = z.infer<typeof insertUserServiceSelectionSchema>;
export type UserServiceSelection = typeof userServiceSelections.$inferSelect;
export type LayoutDrawing = typeof layoutDrawings.$inferSelect;
export type LayoutMarkup = typeof layoutMarkups.$inferSelect;
export type InsertDraftProject = z.infer<typeof insertDraftProjectSchema>;
export type DraftProject = typeof draftProjects.$inferSelect;
export type InsertSolutionRequest = z.infer<typeof insertSolutionRequestSchema>;
export type SolutionRequest = typeof solutionRequests.$inferSelect;
export type InsertProjectCaseStudy = z.infer<typeof insertProjectCaseStudySchema>;
export type ProjectCaseStudy = typeof projectCaseStudies.$inferSelect;

// New type exports for advanced features
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type SafetyMetric = typeof safetyMetrics.$inferSelect;
export type InsertSafetyMetric = z.infer<typeof insertSafetyMetricsSchema>;
export type ComplianceCheck = typeof complianceChecks.$inferSelect;
export type InsertComplianceCheck = z.infer<typeof insertComplianceCheckSchema>;
export type SmartReorder = typeof smartReorders.$inferSelect;
export type InsertSmartReorder = z.infer<typeof insertSmartReorderSchema>;
export type TrainingModule = typeof trainingModules.$inferSelect;
export type InsertTrainingModule = z.infer<typeof insertTrainingModuleSchema>;
export type UserTrainingProgress = typeof userTrainingProgress.$inferSelect;
export type ForumCategory = typeof forumCategories.$inferSelect;
export type ForumTopic = typeof forumTopics.$inferSelect;
export type InsertForumTopic = z.infer<typeof insertForumTopicSchema>;
export type ForumReply = typeof forumReplies.$inferSelect;
export type MarketTrend = typeof marketTrends.$inferSelect;
export type InsertMarketTrend = z.infer<typeof insertMarketTrendSchema>;
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = z.infer<typeof insertUserActivityLogSchema>;
export type GlobalOffice = typeof globalOffices.$inferSelect;
export type InsertGlobalOffice = z.infer<typeof insertGlobalOfficeSchema>;

// Communication Plan Tables
export const communicationTemplates = pgTable("communication_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // 'email', 'whatsapp', 'sms'
  category: varchar("category").notNull(), // 'quote_request', 'follow_up', 'proposal', 'negotiation', 'closure'
  subject: varchar("subject"),
  content: text("content").notNull(),
  variables: jsonb("variables"), // Available template variables
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const communicationPlans = pgTable("communication_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  targetAudience: varchar("target_audience"), // 'new_lead', 'warm_lead', 'existing_customer'
  stages: jsonb("stages"), // Array of stage configurations
  isDefault: boolean("is_default").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const communicationSequences = pgTable("communication_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").references(() => communicationPlans.id),
  name: varchar("name").notNull(),
  triggerEvent: varchar("trigger_event").notNull(), // 'quote_created', 'no_response', 'proposal_sent'
  sequence: jsonb("sequence"), // Array of steps with timing and templates
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const communicationLogs = pgTable("communication_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  customerId: varchar("customer_id"),
  templateId: varchar("template_id").references(() => communicationTemplates.id),
  sequenceId: varchar("sequence_id").references(() => communicationSequences.id),
  quoteRequestId: varchar("quote_request_id").references(() => quoteRequests.id),
  orderId: varchar("order_id").references(() => orders.id),
  channel: varchar("channel").notNull(), // 'email', 'whatsapp', 'sms'
  recipient: varchar("recipient").notNull(),
  subject: varchar("subject"),
  content: text("content"),
  status: varchar("status").notNull(), // 'sent', 'delivered', 'read', 'failed'
  metadata: jsonb("metadata"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const salesEngagements = pgTable("sales_engagements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  salesRepId: varchar("sales_rep_id").references(() => users.id),
  customerId: varchar("customer_id"),
  customerName: varchar("customer_name").notNull(),
  customerCompany: varchar("customer_company"),
  customerEmail: varchar("customer_email"),
  customerPhone: varchar("customer_phone"),
  planId: varchar("plan_id").references(() => communicationPlans.id),
  currentStage: varchar("current_stage"), // 'initial_contact', 'discovery', 'proposal', 'negotiation', 'closed'
  status: varchar("status").notNull(), // 'active', 'paused', 'completed', 'lost'
  notes: text("notes"),
  nextActionDate: timestamp("next_action_date"),
  nextActionType: varchar("next_action_type"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Safety Tips table for contextual notifications
export const safetyTips = pgTable("safety_tips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  category: varchar("category").notNull(), // 'compliance', 'installation', 'maintenance', 'best_practice', 'warning'
  triggerType: varchar("trigger_type").notNull(), // 'product_view', 'calculation', 'zone_selection', 'time_based', 'action'
  triggerConditions: jsonb("trigger_conditions"), // Conditions for when to show the tip
  priority: varchar("priority").notNull().default("medium"), // 'low', 'medium', 'high', 'critical'
  icon: varchar("icon"), // Icon identifier for display
  relatedProducts: jsonb("related_products"), // Array of product IDs this tip relates to
  relatedZones: jsonb("related_zones"), // Array of zones this tip applies to
  compliance: jsonb("compliance"), // PAS 13:2017 or other standards references
  isActive: boolean("is_active").default(true),
  displayCount: integer("display_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Safety Progress Tracking table for radar chart
export const safetyProgress = pgTable("safety_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  facilityId: varchar("facility_id"), // Optional facility identifier
  facilityName: varchar("facility_name"),
  // Zone coverage metrics (0-100 percentage for each)
  loadingBaysCoverage: integer("loading_bays_coverage").default(0),
  pedestrianZonesCoverage: integer("pedestrian_zones_coverage").default(0),
  machineryProtectionCoverage: integer("machinery_protection_coverage").default(0),
  rackingProtectionCoverage: integer("racking_protection_coverage").default(0),
  columnProtectionCoverage: integer("column_protection_coverage").default(0),
  vehicleSegregationCoverage: integer("vehicle_segregation_coverage").default(0),
  doorwayProtectionCoverage: integer("doorway_protection_coverage").default(0),
  mezzanineProtectionCoverage: integer("mezzanine_protection_coverage").default(0),
  // Compliance metrics
  pas13Compliance: boolean("pas_13_compliance").default(false),
  lastAuditDate: timestamp("last_audit_date"),
  nextAuditDate: timestamp("next_audit_date"),
  // Investment tracking
  totalInvestment: decimal("total_investment", { precision: 12, scale: 2 }).default("0"),
  implementedProducts: jsonb("implemented_products"), // Array of installed products
  pendingImplementations: jsonb("pending_implementations"), // Array of planned products
  // Recommendations
  recommendedImprovements: jsonb("recommended_improvements"), // AI-generated recommendations
  priorityZones: jsonb("priority_zones"), // Zones needing immediate attention
  estimatedBudgetNeeded: decimal("estimated_budget_needed", { precision: 12, scale: 2 }),
  // Metadata
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Safety Tip Interactions table
export const userSafetyTipInteractions = pgTable("user_safety_tip_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tipId: varchar("tip_id").notNull().references(() => safetyTips.id),
  action: varchar("action").notNull(), // 'viewed', 'dismissed', 'clicked', 'shared'
  context: jsonb("context"), // Where/when the tip was shown
  helpful: boolean("helpful"), // User feedback on tip helpfulness
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for communication features
export const insertCommunicationTemplateSchema = createInsertSchema(communicationTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommunicationPlanSchema = createInsertSchema(communicationPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommunicationSequenceSchema = createInsertSchema(communicationSequences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommunicationLogSchema = createInsertSchema(communicationLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSalesEngagementSchema = createInsertSchema(salesEngagements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type exports for communication features
export type CommunicationTemplate = typeof communicationTemplates.$inferSelect;
export type InsertCommunicationTemplate = z.infer<typeof insertCommunicationTemplateSchema>;
export type CommunicationPlan = typeof communicationPlans.$inferSelect;
export type InsertCommunicationPlan = z.infer<typeof insertCommunicationPlanSchema>;
export type CommunicationSequence = typeof communicationSequences.$inferSelect;
export type InsertCommunicationSequence = z.infer<typeof insertCommunicationSequenceSchema>;
export type CommunicationLog = typeof communicationLogs.$inferSelect;
export type InsertCommunicationLog = z.infer<typeof insertCommunicationLogSchema>;
export type SalesEngagement = typeof salesEngagements.$inferSelect;
export type InsertSalesEngagement = z.infer<typeof insertSalesEngagementSchema>;

// Safety Tips type exports
export type SafetyTip = typeof safetyTips.$inferSelect;
export type SafetyProgress = typeof safetyProgress.$inferSelect;
export type UserSafetyTipInteraction = typeof userSafetyTipInteractions.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// Installation Timeline
//
// When an order is marked won AND installation is purchased (any of:
// installationComplexity != 'none' | servicePackage present | any line
// item with requiresInstallation=true) we create one installation row,
// idempotent on orderId. Manual installs (followup/rework) have no
// orderId and are created directly from the Installation Timeline UI.
// ═══════════════════════════════════════════════════════════════════

// External install crews — not app users. Free-form team roster with
// contact details, region, and weekly capacity. Members hang off
// installTeamMembers. Teams are shared org-wide (no userId scope).
export const installTeams = pgTable("install_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  region: varchar("region"), // e.g. "UAE North" | "UAE South" | "Saudi"
  leadContactName: varchar("lead_contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  capacityJobsPerWeek: integer("capacity_jobs_per_week").default(3),
  // Calendar swatch / kanban chip colour. Free-form hex so admins can
  // pick anything; the client falls back to a deterministic palette
  // keyed off team id if this is null.
  colour: varchar("colour"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  nameIdx: index("install_teams_name_idx").on(t.name),
  activeIdx: index("install_teams_active_idx").on(t.active),
}));

export const installTeamMembers = pgTable("install_team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => installTeams.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  roleInTeam: varchar("role_in_team"), // lead | installer | apprentice | safety
  certifications: jsonb("certifications"), // string[]
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  teamIdx: index("install_team_members_team_idx").on(t.teamId),
}));

// One row per installation project. Auto-created when an order is won
// (orderId set); or manually created for follow-ups / rework (orderId
// null). Fields like customerName/location/contactEmail are
// denormalized so the list view renders in one query and manual installs
// don't need a fake order.
export const installations = pgTable("installations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Idempotency anchor — one install per order. Nullable so manual
  // follow-up / rework installs can exist without an order.
  orderId: varchar("order_id").references(() => orders.id),
  projectId: varchar("project_id").references(() => projects.id),
  customerCompanyId: varchar("customer_company_id").references(() => customerCompanies.id),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  updatedByUserId: varchar("updated_by_user_id").references(() => users.id),

  // Display + manual-install fallbacks
  title: varchar("title").notNull(),
  customerName: varchar("customer_name"),
  location: text("location"),
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),

  // Classification
  source: varchar("source").notNull().default("order_won"), // order_won | followup | rework | manual_other
  complexity: varchar("complexity").notNull().default("standard"), // simple | standard | complex
  status: varchar("status").notNull().default("planning"), // planning | scheduled | in_progress | completed | on_hold | cancelled

  // Schedule + progress
  plannedStart: timestamp("planned_start"),
  plannedEnd: timestamp("planned_end"),
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  // 0-100 roll-up from phases. Kept on the parent so the list view
  // doesn't have to aggregate N phase rows to show one progress bar.
  progress: integer("progress").notNull().default(0),

  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Partial-unique: one install per order (null orderId allowed many
  // times for manual installs). Enforced via a where clause at DB level.
  orderUnique: uniqueIndex("installations_order_unique").on(t.orderId).where(sql`${t.orderId} IS NOT NULL`),
  statusIdx: index("installations_status_idx").on(t.status),
  plannedStartIdx: index("installations_planned_start_idx").on(t.plannedStart),
  projectIdx: index("installations_project_idx").on(t.projectId),
}));

export const installationPhases = pgTable("installation_phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  installationId: varchar("installation_id").notNull().references(() => installations.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  name: varchar("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: varchar("status").notNull().default("not_started"), // not_started | in_progress | completed | delayed | on_hold
  progress: integer("progress").notNull().default(0),
  assignedTeamId: varchar("assigned_team_id").references(() => installTeams.id),
  // Free-form phase dependency graph. JSON array of phase ids the UI
  // can walk to render timeline arrows. Not DB-enforced.
  dependencies: jsonb("dependencies"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  installationIdx: index("installation_phases_installation_idx").on(t.installationId),
  teamIdx: index("installation_phases_team_idx").on(t.assignedTeamId),
}));

export const installationMilestones = pgTable("installation_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phaseId: varchar("phase_id").notNull().references(() => installationPhases.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  date: timestamp("date"),
  completed: boolean("completed").notNull().default(false),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  phaseIdx: index("installation_milestones_phase_idx").on(t.phaseId),
}));

// An installation can span multiple team windows (handover between
// crews, primary + safety-check team). Join table rather than a single
// FK on installations so the history is preserved.
export const installationAssignments = pgTable("installation_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  installationId: varchar("installation_id").notNull().references(() => installations.id, { onDelete: "cascade" }),
  teamId: varchar("team_id").notNull().references(() => installTeams.id, { onDelete: "restrict" }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  installationIdx: index("installation_assignments_install_idx").on(t.installationId),
  teamIdx: index("installation_assignments_team_idx").on(t.teamId),
}));

// Zod insert schemas
export const insertInstallTeamSchema = createInsertSchema(installTeams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInstallTeamMemberSchema = createInsertSchema(installTeamMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInstallationSchema = createInsertSchema(installations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInstallationPhaseSchema = createInsertSchema(installationPhases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInstallationMilestoneSchema = createInsertSchema(installationMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInstallationAssignmentSchema = createInsertSchema(installationAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InstallTeam = typeof installTeams.$inferSelect;
export type InsertInstallTeam = z.infer<typeof insertInstallTeamSchema>;
export type InstallTeamMember = typeof installTeamMembers.$inferSelect;
export type InsertInstallTeamMember = z.infer<typeof insertInstallTeamMemberSchema>;
export type Installation = typeof installations.$inferSelect;
export type InsertInstallation = z.infer<typeof insertInstallationSchema>;
export type InstallationPhase = typeof installationPhases.$inferSelect;
export type InsertInstallationPhase = z.infer<typeof insertInstallationPhaseSchema>;
export type InstallationMilestone = typeof installationMilestones.$inferSelect;
export type InsertInstallationMilestone = z.infer<typeof insertInstallationMilestoneSchema>;
export type InstallationAssignment = typeof installationAssignments.$inferSelect;
export type InsertInstallationAssignment = z.infer<typeof insertInstallationAssignmentSchema>;

