import {
  users,
  userActivity,
  orders,
  products,
  caseStudies,
  resources,
  faqs,
  impactCalculations,
  quoteRequests,
  quoteRequestItems,
  cartItems,
  productPricing,
  productVariants,
  discountOptions,
  userDiscountSelections,
  partnerCodes,
  partnerCodeRedemptions,
  serviceCareOptions,
  userServiceSelections,
  cartProjectInfo,
  customerCompanies,
  projects,
  projectContacts,
  projectCollaborators,
  projectCaseStudies,
  layoutDrawings,
  layoutMarkups,
  draftProjects,
  chatConversations,
  chatMessages,
  solutionRequests,
  // Enhanced product catalog tables
  vehicleTypes,
  applicationTypes,
  productMedia,
  vehicleProductCompatibility,
  productApplicationCompatibility,
  // New advanced feature tables
  notifications,
  conversations,
  conversationParticipants,
  messages,
  messageReactions,
  safetyMetrics,
  complianceChecks,
  smartReorders,
  trainingModules,
  userTrainingProgress,
  forumCategories,
  forumTopics,
  forumReplies,
  marketTrends,
  contracts,
  siteSurveys,
  siteSurveyAreas,
  adminUsers,
  userActivityLogs,
  globalOffices,
  communicationTemplates,
  communicationPlans,
  communicationSequences,
  communicationLogs,
  salesEngagements,
  approvalTokens,
  orderAuditLog,
  type User,
  type UpsertUser,
  type UserActivity,
  type InsertUserActivity,
  type AdminUser,
  type InsertAdminUser,
  type UserActivityLog,
  type InsertUserActivityLog,
  type SiteSurvey,
  type InsertSiteSurvey,
  type SiteSurveyArea,
  type InsertSiteSurveyArea,
  type InsertUser,
  type Order,
  type InsertOrder,
  type Product,
  type InsertProduct,
  type CaseStudy,
  type InsertCaseStudy,
  type Resource,
  type InsertResource,
  type Faq,
  type InsertFaq,
  type ImpactCalculation,
  type InsertImpactCalculation,
  type QuoteRequest,
  type InsertQuoteRequest,
  type QuoteRequestItem,
  type InsertQuoteRequestItem,
  type CartItem,
  type InsertCartItem,
  type ProductPricing,
  // Enhanced product catalog types
  type VehicleType,
  type InsertVehicleType,
  type ApplicationType,
  type InsertApplicationType,
  type ProductMedia,
  type InsertProductMedia,
  type VehicleProductCompatibility,
  type InsertVehicleProductCompatibility,
  type ProductApplicationCompatibility,
  type InsertProductApplicationCompatibility,
  type InsertProductPricing,
  type DiscountOption,
  type InsertDiscountOption,
  type UserDiscountSelection,
  type InsertUserDiscountSelection,
  type ServiceCareOption,
  type InsertServiceCareOption,
  type UserServiceSelection,
  type InsertUserServiceSelection,
  type InsertCartProjectInfo,
  type CartProjectInfo,
  type CustomerCompany,
  type InsertCustomerCompany,
  type Project,
  type InsertProject,
  type ProjectContact,
  type InsertProjectContact,
  type ProjectCollaborator,
  type InsertProjectCollaborator,
  type ProjectCaseStudy,
  type InsertProjectCaseStudy,
  type LayoutDrawing,
  type LayoutMarkup,
  type DraftProject,
  type InsertDraftProject,
  type ChatConversation,
  type ChatMessage,
  type InsertChatConversation,
  type InsertChatMessage,
  type SolutionRequest,
  type InsertSolutionRequest,
  // New advanced feature types
  type Notification,
  type InsertNotification,
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type Message,
  type InsertMessage,
  type MessageReaction,
  type SafetyMetric,
  type InsertSafetyMetric,
  type ComplianceCheck,
  type InsertComplianceCheck,
  type SmartReorder,
  type InsertSmartReorder,
  type TrainingModule,
  type InsertTrainingModule,
  type UserTrainingProgress,
  type ForumCategory,
  type ForumTopic,
  type InsertForumTopic,
  type ForumReply,
  type MarketTrend,
  type InsertMarketTrend,
  type Contract,
  type InsertContract,
  type GlobalOffice,
  type InsertGlobalOffice,
  type CommunicationTemplate,
  type InsertCommunicationTemplate,
  type CommunicationPlan,
  type InsertCommunicationPlan,
  type CommunicationSequence,
  type InsertCommunicationSequence,
  type CommunicationLog,
  type InsertCommunicationLog,
  type SalesEngagement,
  type InsertSalesEngagement,
  type ApprovalToken,
  type InsertApprovalToken,
  type OrderAuditLog,
  type InsertOrderAuditLog,
} from "@shared/schema";
import { eq, desc, and, ilike, or, sql, isNull, isNotNull, lte, gte, asc, like, inArray, type SQL } from "drizzle-orm";
import type { Database } from "./db";
import {
  PER_USER_SAME_CODE_WINDOW_MONTHS,
  PER_USER_TOTAL_REDEMPTIONS_PER_WINDOW,
} from "@shared/discountLimits";

// Shape of a per-section signature stored in orders.technical_signature,
// orders.commercial_signature, and orders.marketing_signature. We read these
// back as `unknown` (jsonb) so callers type-narrow via the `signed` flag.
export interface OrderSectionSignature {
  signed: true;
  signedBy: string;
  jobTitle: string;
  mobile?: string;
  // ISO-8601 UTC timestamp; the server always wins here — clients may send a
  // display-formatted date but it is stored alongside, not instead of, this.
  signedAt: string;
  date?: string;
  ipAddress?: string;
}

export interface OrderApprovalStatus {
  technical: OrderSectionSignature | null;
  commercial: OrderSectionSignature | null;
  marketing: OrderSectionSignature | null;
}

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  
  // Admin user operations
  getAdminByUsername(username: string): Promise<AdminUser | undefined>;
  getAdminByEmail(email: string): Promise<AdminUser | undefined>;
  updateAdminLastLogin(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  
  // User activity logging
  logUserActivity(log: InsertUserActivityLog): Promise<UserActivityLog>;
  getUserActivities(userId: string): Promise<UserActivityLog[]>;
  getAllUserActivities(): Promise<UserActivityLog[]>;
  
  // User activity tracking (for recent activity feature)
  recordUserActivity(activity: InsertUserActivity): Promise<UserActivity>;
  getUserRecentActivity(userId: string, limit?: number): Promise<UserActivity[]>;
  cleanupOldActivity(): Promise<void>;
  
  // Global Offices operations
  getGlobalOffices(filters?: { region?: string; country?: string; officeType?: string }): Promise<GlobalOffice[]>;
  getGlobalOffice(id: string): Promise<GlobalOffice | undefined>;
  getGlobalOfficesByRegion(region: string): Promise<GlobalOffice[]>;
  getGlobalOfficesByCountry(country: string): Promise<GlobalOffice[]>;
  getDefaultOfficeForRegion(region: string): Promise<GlobalOffice | undefined>;
  createGlobalOffice(office: InsertGlobalOffice): Promise<GlobalOffice>;
  updateGlobalOffice(id: string, updates: Partial<InsertGlobalOffice>): Promise<GlobalOffice>;
  deleteGlobalOffice(id: string): Promise<void>;
  
  // Order operations
  getUserOrders(userId: string): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;
  getOrdersByStatus(status: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order>;
  // Section-level sign-off: writes a signature object into the appropriate
  // signature column. Returns the refreshed order so callers can echo the
  // canonical state back to the client.
  saveOrderSectionApproval(
    orderId: string,
    section: "technical" | "commercial" | "marketing",
    signature: OrderSectionSignature,
  ): Promise<Order>;
  // Convenience read used by the live order-form view. Returning only the
  // three signature objects keeps the payload small vs. re-sending the whole
  // order after every approval.
  getOrderApprovalStatus(orderId: string): Promise<OrderApprovalStatus | undefined>;
  
  // Product operations
  getProducts(filters?: { category?: string; industry?: string; search?: string }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductByName(name: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  getProductRecommendations(jouleRating: number): Promise<Product[]>;
  getProductVariants(baseName: string): Promise<Product[]>;
  
  // Case Study operations
  getCaseStudies(industry?: string): Promise<CaseStudy[]>;
  getCaseStudy(id: string): Promise<CaseStudy | undefined>;
  createCaseStudy(caseStudy: InsertCaseStudy): Promise<CaseStudy>;
  updateCaseStudy(id: string, updates: Partial<InsertCaseStudy>): Promise<CaseStudy>;
  deleteCaseStudy(id: string): Promise<void>;
  
  // Resource operations
  getResources(category?: string): Promise<Resource[]>;
  getResource(id: string): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: string, updates: Partial<InsertResource>): Promise<Resource>;
  deleteResource(id: string): Promise<void>;
  incrementDownloadCount(id: string): Promise<void>;
  
  // FAQ operations
  getFaqs(category?: string): Promise<Faq[]>;
  getFaq(id: string): Promise<Faq | undefined>;
  createFaq(faq: InsertFaq): Promise<Faq>;
  updateFaq(id: string, updates: Partial<InsertFaq>): Promise<Faq>;
  deleteFaq(id: string): Promise<void>;
  
  // Impact Calculation operations
  getUserCalculations(userId: string): Promise<ImpactCalculation[]>;
  getAllCalculations(): Promise<ImpactCalculation[]>;
  getCalculation(id: string): Promise<ImpactCalculation | undefined>;
  getImpactCalculation(id: string): Promise<ImpactCalculation | undefined>;
  createCalculation(calculation: InsertImpactCalculation): Promise<ImpactCalculation>;
  saveImpactCalculation(calculation: InsertImpactCalculation): Promise<ImpactCalculation>;
  deleteCalculation(id: string): Promise<void>;
  
  // Order Form Request operations
  getUserQuoteRequests(userId: string): Promise<QuoteRequest[]>;
  getAllQuoteRequests(): Promise<QuoteRequest[]>;
  getQuoteRequestsByStatus(status: string): Promise<QuoteRequest[]>;
  getQuoteRequest(id: string): Promise<QuoteRequest | undefined>;
  createQuoteRequest(request: InsertQuoteRequest): Promise<QuoteRequest>;
  updateQuoteRequest(id: string, updates: Partial<InsertQuoteRequest>): Promise<QuoteRequest>;
  updateQuoteRequestStatus(id: string, status: string): Promise<QuoteRequest>;
  deleteQuoteRequest(id: string): Promise<void>;
  clearUserQuoteRequests(userId: string): Promise<void>;
  getQuoteRequestStats(): Promise<{ total: number; pending: number; inProgress: number; completed: number }>;
  
  // Order Form Request Item operations
  getQuoteRequestItems(quoteRequestId: string): Promise<QuoteRequestItem[]>;
  createQuoteRequestItem(item: InsertQuoteRequestItem): Promise<QuoteRequestItem>;
  
  // Cart operations
  getUserCart(userId: string): Promise<CartItem[]>;
  addToCart(item: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: string, updates: Partial<InsertCartItem>): Promise<CartItem>;
  removeFromCart(id: string): Promise<void>;
  clearUserCart(userId: string): Promise<void>;
  
  // Cart Project Information operations
  getCartProjectInfo(userId: string): Promise<CartProjectInfo | undefined>;
  saveCartProjectInfo(userId: string, data: Partial<InsertCartProjectInfo>): Promise<CartProjectInfo>;
  // Customer / project / contact CRUD (new opportunity model)
  listCustomerCompanies(userId: string): Promise<CustomerCompany[]>;
  getCustomerCompany(id: string): Promise<CustomerCompany | undefined>;
  createCustomerCompany(data: InsertCustomerCompany): Promise<CustomerCompany>;
  updateCustomerCompany(id: string, data: Partial<InsertCustomerCompany>): Promise<CustomerCompany>;
  listProjects(userId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  getProjectWithDetails(id: string): Promise<(Project & { customerCompany: CustomerCompany | null; contacts: ProjectContact[] }) | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project>;
  touchProjectAccess(id: string): Promise<void>;
  listProjectContacts(projectId: string): Promise<ProjectContact[]>;
  createProjectContact(data: InsertProjectContact): Promise<ProjectContact>;
  updateProjectContact(id: string, data: Partial<InsertProjectContact>): Promise<ProjectContact>;
  deleteProjectContact(id: string): Promise<void>;
  // Project collaboration (shared access)
  canAccessProject(
    projectId: string,
    userId: string,
    minRole?: "viewer" | "editor" | "owner",
  ): Promise<{ allowed: boolean; role: "owner" | "editor" | "viewer" | null }>;
  accessibleProjectIds(userId: string): Promise<string[]>;
  listCollaborators(projectId: string): Promise<Array<{
    id: string;
    userId: string;
    role: string;
    invitedBy: string | null;
    invitedAt: Date | null;
    acceptedAt: Date | null;
    user: { id: string; email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  }>>;
  addCollaborator(input: {
    projectId: string;
    userId: string;
    role: "owner" | "editor" | "viewer";
    invitedBy: string;
  }): Promise<any>;
  removeCollaborator(projectId: string, userId: string): Promise<boolean>;
  updateCollaboratorRole(
    projectId: string,
    userId: string,
    role: "owner" | "editor" | "viewer",
  ): Promise<boolean>;
  listShareableUsers(opts: {
    excludeUserId: string;
    excludeProjectId?: string;
    query?: string;
  }): Promise<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null }>>;
  // Active project accessor — reads user.activeProjectId, lazily seeds a
  // project from cartProjectInfo for existing reps who pre-date the
  // projects model.
  getOrSeedActiveProject(userId: string): Promise<(Project & { customerCompany: CustomerCompany | null; contacts: ProjectContact[] }) | null>;
  setActiveProject(userId: string, projectId: string | null): Promise<void>;
  upsertCartProjectInfo(data: InsertCartProjectInfo): Promise<CartProjectInfo>;
  
  // Product Pricing operations
  getProductPricing(): Promise<ProductPricing[]>;
  getProductPricingByName(productName: string): Promise<ProductPricing | undefined>;
  calculatePrice(productName: string, quantity: number): Promise<{ unitPrice: number; totalPrice: number; tier: string; requiresQuote?: boolean }>;
  createProductPricing(pricing: InsertProductPricing): Promise<ProductPricing>;
  updateProductPricing(id: string, updates: Partial<InsertProductPricing>): Promise<ProductPricing>;
  deleteProductPricing(id: string): Promise<void>;
  
  // Discount operations
  getDiscountOptions(): Promise<DiscountOption[]>;
  getUserDiscountSelections(userId: string): Promise<UserDiscountSelection[]>;
  saveUserDiscountSelections(userId: string, selections: string[]): Promise<UserDiscountSelection[]>;

  // Partner code operations
  //
  // `validatePartnerCode` is per-user because the two per-user rate limits
  // (same-code-within-12mo, total-redemptions-within-12mo) must surface at
  // validate time so the client can show a friendly error BEFORE the user
  // tries to check out. `userId` is required, not optional — every caller
  // is already in an authenticated route.
  validatePartnerCode(code: string, userId: string): Promise<
    | { valid: true; codeId: string; partnerName: string; discountPercent: number }
    | {
        valid: false;
        reason:
          | "invalid"
          | "inactive"
          | "expired"
          | "notYetValid"
          | "exhausted"
          | "per_user_same_code_limit"
          | "per_user_total_limit";
      }
  >;
  redeemPartnerCode(
    code: string,
    userId: string,
    orderId: string | null,
    cartSubtotal: number | null
  ): Promise<{ redemptionId: string; discountPercent: number } | null>;
  listPartnerCodes(): Promise<any[]>;
  createPartnerCode(input: {
    code: string;
    partnerName: string;
    discountPercent: number;
    validFrom?: Date | null;
    validTo?: Date | null;
    usageCap?: number | null;
    notes?: string | null;
    createdBy?: string | null;
  }): Promise<any>;
  setPartnerCodeActive(id: string, isActive: boolean): Promise<void>;
  
  // LinkedIn Discount operations
  upsertLinkedInDiscount(userId: string, linkedinData: {
    companyUrl: string;
    followers: number;
    commitment: boolean;
    postUrl?: string;
    proofUrls?: string[];
    status?: string;
  }): Promise<UserDiscountSelection>;
  getLinkedInDiscountForCart(userId: string): Promise<UserDiscountSelection | undefined>;
  verifyLinkedInDiscount(selectionId: string, verifiedFollowers: number, status: string): Promise<UserDiscountSelection>;
  calculateLinkedInDiscount(followers: number, subtotal: number): Promise<{ baseAedDiscount: number; cappedDiscount: number }>;
  
  // Service Care operations
  getServiceCareOptions(): Promise<ServiceCareOption[]>;
  getUserServiceSelection(userId: string): Promise<UserServiceSelection | undefined>;
  saveUserServiceSelection(userId: string, serviceOptionId: string): Promise<UserServiceSelection>;
  
  // Layout Drawing operations
  getLayoutDrawings(userId: string): Promise<LayoutDrawing[]>;
  getLayoutDrawing(id: string): Promise<LayoutDrawing | undefined>;
  createLayoutDrawing(drawing: { userId: string; projectName?: string; company?: string; location?: string; fileName: string; fileUrl: string; fileType: string; thumbnailUrl?: string }): Promise<LayoutDrawing>;
  deleteLayoutDrawing(id: string): Promise<void>;
  getTrashedLayoutDrawings(userId: string): Promise<LayoutDrawing[]>;
  restoreLayoutDrawing(id: string): Promise<void>;
  permanentlyDeleteLayoutDrawing(id: string): Promise<void>;
  updateLayoutDrawingScale(id: string, scaleData: { scale?: number; scaleLine?: any; isScaleSet?: boolean }): Promise<LayoutDrawing>;
  updateLayoutDrawingTitle(id: string, fileName: string): Promise<LayoutDrawing>;
  updateLayoutDrawing(id: string, patch: Partial<LayoutDrawing>): Promise<LayoutDrawing>;
  
  // Layout Markup operations
  getLayoutMarkups(layoutDrawingId: string): Promise<LayoutMarkup[]>;
  createLayoutMarkup(markup: { layoutDrawingId: string; cartItemId?: string; productName?: string; xPosition: number; yPosition: number; endX?: number; endY?: number; pathData?: string; comment?: string; calculatedLength?: number }): Promise<LayoutMarkup>;
  updateLayoutMarkup(id: string, updates: { cartItemId?: string; productName?: string; xPosition?: number; yPosition?: number; endX?: number; endY?: number; pathData?: string; comment?: string; calculatedLength?: number }): Promise<LayoutMarkup>;
  deleteLayoutMarkup(id: string): Promise<void>;
  restoreLayoutMarkup(id: string): Promise<void>;
  permanentlyDeleteLayoutMarkup(id: string): Promise<void>;

  // Draft Project operations
  getUserDraftProjects(userId: string): Promise<DraftProject[]>;
  getDraftProject(id: string): Promise<DraftProject | undefined>;
  createDraftProject(draft: InsertDraftProject): Promise<DraftProject>;
  updateDraftProject(id: string, updates: Partial<InsertDraftProject>): Promise<DraftProject>;
  deleteDraftProject(id: string): Promise<void>;

  // Chat operations
  getChatConversations(userId: string): Promise<ChatConversation[]>;
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  deleteChatConversation(conversationId: string, userId: string): Promise<void>;
  getChatMessages(conversationId: string, userId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // OTP operations
  generateAndStoreOtp(userId: string): Promise<{ otpCode: string; expiryTime: Date }>;
  verifyOtp(userId: string, otpCode: string): Promise<{ success: boolean; attempts: number; maxAttemptsReached: boolean }>;
  markPhoneAsVerified(userId: string): Promise<User>;
  getUserByPhone(phone: string): Promise<User | undefined>;

  // Solution Request operations
  getSolutionRequestsByUser(userId: string): Promise<SolutionRequest[]>;
  getSolutionRequest(id: string, userId: string): Promise<SolutionRequest | undefined>;
  createSolutionRequest(request: InsertSolutionRequest): Promise<SolutionRequest>;
  updateSolutionRequest(id: string, updates: Partial<InsertSolutionRequest>): Promise<SolutionRequest>;
  deleteSolutionRequest(id: string, userId: string): Promise<void>;

  // Notification System
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  
  // Messaging System
  getUserConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<InsertConversation>): Promise<Conversation>;
  
  getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]>;
  addConversationParticipant(conversationId: string, userId: string, role?: string): Promise<ConversationParticipant>;
  removeConversationParticipant(conversationId: string, userId: string): Promise<void>;
  
  getConversationMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, content: string): Promise<Message>;
  deleteMessage(id: string): Promise<void>;
  
  getMessageReactions(messageId: string): Promise<MessageReaction[]>;
  addMessageReaction(messageId: string, userId: string, emoji: string): Promise<MessageReaction>;
  removeMessageReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  
  
  getUserSafetyMetrics(userId: string, metricType?: string): Promise<SafetyMetric[]>;
  createSafetyMetric(metric: InsertSafetyMetric): Promise<SafetyMetric>;
  updateSafetyMetric(id: string, updates: Partial<InsertSafetyMetric>): Promise<SafetyMetric>;
  
  // Compliance
  getComplianceChecks(userId: string, region?: string): Promise<ComplianceCheck[]>;
  createComplianceCheck(check: InsertComplianceCheck): Promise<ComplianceCheck>;
  updateComplianceStatus(id: string, status: string, findings?: any, recommendations?: any): Promise<ComplianceCheck>;
  
  // Smart Reordering
  getSmartReorders(userId: string, status?: string): Promise<SmartReorder[]>;
  createSmartReorder(reorder: InsertSmartReorder): Promise<SmartReorder>;
  updateSmartReorder(id: string, updates: Partial<InsertSmartReorder>): Promise<SmartReorder>;
  processSmartReorders(): Promise<void>;
  
  // Training
  getTrainingModules(category?: string, difficulty?: string): Promise<TrainingModule[]>;
  getTrainingModule(id: string): Promise<TrainingModule | undefined>;
  createTrainingModule(module: InsertTrainingModule): Promise<TrainingModule>;
  updateTrainingModule(id: string, updates: Partial<InsertTrainingModule>): Promise<TrainingModule>;
  
  getUserTrainingProgress(userId: string, moduleId?: string): Promise<UserTrainingProgress[]>;
  updateTrainingProgress(userId: string, moduleId: string, progressPercentage: number, timeSpent: number): Promise<UserTrainingProgress>;
  completeTraining(userId: string, moduleId: string, score?: number): Promise<UserTrainingProgress>;
  
  // Forum
  getForumCategories(): Promise<ForumCategory[]>;
  getForumCategory(id: string): Promise<ForumCategory | undefined>;
  
  getForumTopics(categoryId: string, limit?: number, offset?: number): Promise<ForumTopic[]>;
  getForumTopic(id: string): Promise<ForumTopic | undefined>;
  createForumTopic(topic: InsertForumTopic): Promise<ForumTopic>;
  updateForumTopic(id: string, updates: Partial<InsertForumTopic>): Promise<ForumTopic>;
  incrementTopicViews(id: string): Promise<void>;
  
  getForumReplies(topicId: string, limit?: number, offset?: number): Promise<ForumReply[]>;
  createForumReply(reply: Omit<ForumReply, 'id' | 'createdAt'>): Promise<ForumReply>;
  updateForumReply(id: string, content: string): Promise<ForumReply>;
  likeForumReply(id: string): Promise<void>;
  markReplyAsAnswer(id: string): Promise<void>;
  
  // Business Intelligence
  getMarketTrends(region?: string, industry?: string, isPublic?: boolean): Promise<MarketTrend[]>;
  getMarketTrend(id: string): Promise<MarketTrend | undefined>;
  createMarketTrend(trend: InsertMarketTrend): Promise<MarketTrend>;
  updateMarketTrend(id: string, updates: Partial<InsertMarketTrend>): Promise<MarketTrend>;
  
  getUserContracts(userId: string, status?: string): Promise<Contract[]>;
  getContract(id: string): Promise<Contract | undefined>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: string, updates: Partial<InsertContract>): Promise<Contract>;
  getExpiringContracts(daysFromNow: number): Promise<Contract[]>;
  
  // Site Survey operations
  getUserSiteSurveys(userId: string): Promise<SiteSurvey[]>;
  getSiteSurvey(id: string): Promise<SiteSurvey | undefined>;
  createSiteSurvey(survey: InsertSiteSurvey): Promise<SiteSurvey>;
  updateSiteSurvey(id: string, updates: Partial<InsertSiteSurvey>): Promise<SiteSurvey>;
  deleteSiteSurvey(id: string): Promise<void>;
  completeSiteSurvey(id: string): Promise<SiteSurvey>;
  
  // Site Survey Area operations
  getSiteSurveyAreas(siteSurveyId: string): Promise<SiteSurveyArea[]>;
  getSiteSurveyArea(id: string): Promise<SiteSurveyArea | undefined>;
  createSiteSurveyArea(area: InsertSiteSurveyArea): Promise<SiteSurveyArea>;
  updateSiteSurveyArea(id: string, updates: Partial<InsertSiteSurveyArea>): Promise<SiteSurveyArea>;
  deleteSiteSurveyArea(id: string): Promise<void>;
  
  // Vehicle Type operations
  getVehicleTypes(): Promise<VehicleType[]>;
  getVehicleType(id: string): Promise<VehicleType | undefined>;
  createVehicleType(vehicle: InsertVehicleType): Promise<VehicleType>;
  updateVehicleType(id: string, updates: Partial<InsertVehicleType>): Promise<VehicleType>;
  deleteVehicleType(id: string): Promise<void>;
  
  // Application Type operations
  getApplicationTypes(): Promise<ApplicationType[]>;
  getApplicationType(id: string): Promise<ApplicationType | undefined>;
  createApplicationType(app: InsertApplicationType): Promise<ApplicationType>;
  updateApplicationType(id: string, updates: Partial<InsertApplicationType>): Promise<ApplicationType>;
  deleteApplicationType(id: string): Promise<void>;
  
  // Vehicle-Product Compatibility operations
  getVehicleProductCompatibilities(productId?: string, vehicleTypeId?: string): Promise<VehicleProductCompatibility[]>;
  createVehicleProductCompatibility(compat: InsertVehicleProductCompatibility): Promise<VehicleProductCompatibility>;
  updateVehicleProductCompatibility(id: string, updates: Partial<InsertVehicleProductCompatibility>): Promise<VehicleProductCompatibility>;
  deleteVehicleProductCompatibility(id: string): Promise<void>;
  
  // Product-Application Compatibility operations
  getProductApplicationCompatibilities(productId?: string, applicationTypeId?: string): Promise<ProductApplicationCompatibility[]>;
  createProductApplicationCompatibility(compat: InsertProductApplicationCompatibility): Promise<ProductApplicationCompatibility>;
  updateProductApplicationCompatibility(id: string, updates: Partial<InsertProductApplicationCompatibility>): Promise<ProductApplicationCompatibility>;
  deleteProductApplicationCompatibility(id: string): Promise<void>;

  // Password reset operations
  createPasswordResetToken(email: string): Promise<{ token: string; user: any } | null>;
  verifyPasswordResetToken(token: string): Promise<any | null>;
  resetUserPassword(userId: string, newPasswordHash: string): Promise<void>;

  // User creation
  createUser(data: { email: string; passwordHash: string; firstName: string; lastName: string; company?: string | null; phone?: string | null; jobTitle?: string | null; role?: string }): Promise<any>;

  // OAuth operations
  getUserByOAuth(provider: string, oauthId: string): Promise<any | undefined>;
  createOAuthUser(profile: { email: string; firstName: string; lastName: string; provider: string; oauthId: string }): Promise<any>;
  linkOAuthAccount(userId: string, provider: string, oauthId: string): Promise<void>;

  // ── Approval-token / magic-link operations ─────────────────────────────
  // Token endpoints are used by both authenticated routes (sales rep dispatches)
  // and public routes (the magic-link consumer). Keep all write paths through
  // these helpers so the audit-log stays in sync with token state.
  createApprovalToken(input: InsertApprovalToken): Promise<ApprovalToken>;
  getApprovalTokenByToken(token: string): Promise<ApprovalToken | undefined>;
  getApprovalTokenById(id: string): Promise<ApprovalToken | undefined>;
  getApprovalTokensForOrder(orderId: string): Promise<ApprovalToken[]>;
  findActiveApprovalTokenForSection(
    orderId: string,
    section: string,
  ): Promise<ApprovalToken | undefined>;
  markApprovalTokenUsed(tokenId: string): Promise<void>;
  revokeApprovalToken(tokenId: string): Promise<void>;

  // ── Order audit log ────────────────────────────────────────────────────
  appendOrderAuditLog(entry: InsertOrderAuditLog): Promise<OrderAuditLog>;
  getOrderAuditLog(orderId: string): Promise<OrderAuditLog[]>;

  // ── Shared section-approval helper ─────────────────────────────────────
  // Single write path for both the authenticated /approve-section endpoint
  // and the public magic-link consume endpoint. Bundles: write the signature,
  // append an "approved" audit-log entry, and return the refreshed order.
  applySectionApproval(input: {
    orderId: string;
    section: "technical" | "commercial" | "marketing";
    signature: OrderSectionSignature;
    actorUserId?: string | null;
    actorEmail?: string | null;
    tokenId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<Order>;
}

export class DatabaseStorage implements IStorage {
  constructor(private db: Database) {}

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await this.db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
  
  // Admin user operations
  async getAdminByUsername(username: string): Promise<AdminUser | undefined> {
    const [admin] = await this.db.select().from(adminUsers).where(eq(adminUsers.username, username));
    return admin;
  }

  async getAdminByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await this.db.select().from(adminUsers).where(eq(adminUsers.email, email));
    return admin;
  }
  
  async updateAdminLastLogin(id: string): Promise<void> {
    await this.db.update(adminUsers).set({ lastLogin: new Date() }).where(eq(adminUsers.id, id));
  }
  
  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users).orderBy(desc(users.createdAt));
  }
  
  // User activity logging
  async logUserActivity(log: InsertUserActivityLog): Promise<UserActivityLog> {
    const [activity] = await this.db.insert(userActivityLogs).values(log).returning();
    return activity;
  }
  
  async getUserActivities(userId: string): Promise<UserActivityLog[]> {
    return await this.db.select().from(userActivityLogs).where(eq(userActivityLogs.userId, userId)).orderBy(desc(userActivityLogs.createdAt));
  }
  
  async getAllUserActivities(): Promise<any[]> {
    const rows = await this.db
      .select({
        id: userActivityLogs.id,
        userId: userActivityLogs.userId,
        activityType: userActivityLogs.activityType,
        section: userActivityLogs.section,
        details: userActivityLogs.details,
        ipAddress: userActivityLogs.ipAddress,
        userAgent: userActivityLogs.userAgent,
        createdAt: userActivityLogs.createdAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(userActivityLogs)
      .leftJoin(users, eq(userActivityLogs.userId, users.id))
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(1000);
    return rows;
  }

  // User activity tracking (for recent activity feature)
  async recordUserActivity(activity: InsertUserActivity): Promise<UserActivity> {
    // Check if the user has already viewed this item
    const [existing] = await this.db.select()
      .from(userActivity)
      .where(
        and(
          eq(userActivity.userId, activity.userId),
          eq(userActivity.itemType, activity.itemType),
          eq(userActivity.itemId, activity.itemId)
        )
      );

    if (existing) {
      // Update the existing record
      const [updated] = await this.db.update(userActivity)
        .set({
          viewCount: existing.viewCount + 1,
          lastViewedAt: new Date(),
          itemTitle: activity.itemTitle || existing.itemTitle,
          itemCategory: activity.itemCategory || existing.itemCategory,
          itemSubcategory: activity.itemSubcategory || existing.itemSubcategory,
          itemImage: activity.itemImage || existing.itemImage,
          metadata: activity.metadata || existing.metadata,
        })
        .where(eq(userActivity.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create a new record
      const [created] = await this.db.insert(userActivity)
        .values(activity)
        .returning();
      return created;
    }
  }

  async getUserRecentActivity(userId: string, limit: number = 50): Promise<UserActivity[]> {
    return await this.db.select()
      .from(userActivity)
      .where(eq(userActivity.userId, userId))
      .orderBy(desc(userActivity.lastViewedAt))
      .limit(limit);
  }

  async cleanupOldActivity(): Promise<void> {
    // Delete activities older than 1 week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.db.delete(userActivity)
      .where(lte(userActivity.lastViewedAt, oneWeekAgo));
  }

  // Global Offices operations
  async getGlobalOffices(filters?: { region?: string; country?: string; officeType?: string }): Promise<GlobalOffice[]> {
    const whereConditions = [eq(globalOffices.isActive, true)];
    
    if (filters?.region) {
      whereConditions.push(eq(globalOffices.region, filters.region));
    }
    
    if (filters?.country) {
      whereConditions.push(eq(globalOffices.country, filters.country));
    }
    
    if (filters?.officeType) {
      whereConditions.push(eq(globalOffices.officeType, filters.officeType));
    }
    
    return await this.db
      .select()
      .from(globalOffices)
      .where(and(...whereConditions))
      .orderBy(asc(globalOffices.sortOrder), asc(globalOffices.companyName));
  }

  async getGlobalOffice(id: string): Promise<GlobalOffice | undefined> {
    const [office] = await this.db.select().from(globalOffices).where(eq(globalOffices.id, id));
    return office;
  }

  async getGlobalOfficesByRegion(region: string): Promise<GlobalOffice[]> {
    return await this.db
      .select()
      .from(globalOffices)
      .where(and(eq(globalOffices.region, region), eq(globalOffices.isActive, true)))
      .orderBy(asc(globalOffices.sortOrder), asc(globalOffices.companyName));
  }

  async getGlobalOfficesByCountry(country: string): Promise<GlobalOffice[]> {
    return await this.db
      .select()
      .from(globalOffices)
      .where(and(eq(globalOffices.country, country), eq(globalOffices.isActive, true)))
      .orderBy(asc(globalOffices.sortOrder), asc(globalOffices.companyName));
  }

  async getDefaultOfficeForRegion(region: string): Promise<GlobalOffice | undefined> {
    const [office] = await this.db
      .select()
      .from(globalOffices)
      .where(and(
        eq(globalOffices.region, region),
        eq(globalOffices.isDefault, true),
        eq(globalOffices.isActive, true)
      ));
    return office;
  }

  async createGlobalOffice(office: InsertGlobalOffice): Promise<GlobalOffice> {
    const [newOffice] = await this.db.insert(globalOffices).values(office).returning();
    return newOffice;
  }

  async updateGlobalOffice(id: string, updates: Partial<InsertGlobalOffice>): Promise<GlobalOffice> {
    const [updatedOffice] = await this.db
      .update(globalOffices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(globalOffices.id, id))
      .returning();
    return updatedOffice;
  }

  async deleteGlobalOffice(id: string): Promise<void> {
    await this.db.delete(globalOffices).where(eq(globalOffices.id, id));
  }

  // Order operations
  async getUserOrders(userId: string): Promise<Order[]> {
    return await this.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.orderDate));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await this.db.insert(orders).values(order).returning();
    return newOrder;
  }

  async getAllOrders(): Promise<Order[]> {
    return await this.db
      .select()
      .from(orders)
      .orderBy(desc(orders.orderDate));
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    return await this.db
      .select()
      .from(orders)
      .where(eq(orders.status, status))
      .orderBy(desc(orders.orderDate));
  }

  async updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order> {
    const [updatedOrder] = await this.db
      .update(orders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  // Writes the signature to the correct column based on section. We funnel
  // through updateOrder() rather than issuing a hand-rolled UPDATE so the
  // updatedAt bump + returning semantics stay consistent with every other
  // write path.
  async saveOrderSectionApproval(
    orderId: string,
    section: "technical" | "commercial" | "marketing",
    signature: OrderSectionSignature,
  ): Promise<Order> {
    const column =
      section === "technical"
        ? "technicalSignature"
        : section === "commercial"
          ? "commercialSignature"
          : "marketingSignature";
    return await this.updateOrder(orderId, {
      [column]: signature,
    } as Partial<InsertOrder>);
  }

  // Thin read that reuses getOrder() — returns null for any section that has
  // never been signed, so the client can render `Approved by …` or the form
  // off a single boolean check (`!!status.technical`).
  async getOrderApprovalStatus(
    orderId: string,
  ): Promise<OrderApprovalStatus | undefined> {
    const order = await this.getOrder(orderId);
    if (!order) return undefined;
    const normalize = (raw: unknown): OrderSectionSignature | null => {
      if (!raw || typeof raw !== "object") return null;
      const sig = raw as Partial<OrderSectionSignature>;
      return sig.signed ? (sig as OrderSectionSignature) : null;
    };
    return {
      technical: normalize(order.technicalSignature),
      commercial: normalize(order.commercialSignature),
      marketing: normalize((order as any).marketingSignature),
    };
  }

  // Product operations
  // Vehicle Types
  async getVehicleTypes(): Promise<VehicleType[]> {
    return await this.db.select().from(vehicleTypes)
      .where(eq(vehicleTypes.isActive, true))
      .orderBy(vehicleTypes.sortOrder, vehicleTypes.name);
  }

  async createVehicleType(vehicleType: InsertVehicleType): Promise<VehicleType> {
    const [newVehicleType] = await this.db.insert(vehicleTypes).values(vehicleType).returning();
    return newVehicleType;
  }

  async getVehicleTypeById(id: string): Promise<VehicleType | undefined> {
    const [vehicleType] = await this.db.select().from(vehicleTypes).where(eq(vehicleTypes.id, id));
    return vehicleType;
  }

  async getProductsByVehicleType(vehicleTypeId: string): Promise<Product[]> {
    return await this.db
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        subcategory: products.subcategory,
        description: products.description,
        specifications: products.specifications,
        impactRating: products.impactRating,
        heightMin: products.heightMin,
        heightMax: products.heightMax,
        price: products.price,
        basePricePerMeter: products.basePricePerMeter,
        currency: products.currency,
        imageUrl: products.imageUrl,
        technicalSheetUrl: products.technicalSheetUrl,
        applications: products.applications,
        industries: products.industries,
        features: products.features,
        isActive: products.isActive,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        compatibilityLevel: vehicleProductCompatibility.compatibilityLevel,
        safetyMargin: vehicleProductCompatibility.safetyMargin,
      })
      .from(products)
      .innerJoin(vehicleProductCompatibility, eq(products.id, vehicleProductCompatibility.productId))
      .where(and(
        eq(vehicleProductCompatibility.vehicleTypeId, vehicleTypeId),
        eq(vehicleProductCompatibility.isActive, true),
        eq(products.isActive, true)
      ))
      .orderBy(products.impactRating, products.name);
  }

  // Product Media
  async getProductMedia(productId: string): Promise<ProductMedia[]> {
    return await this.db.select().from(productMedia)
      .where(and(eq(productMedia.productId, productId), eq(productMedia.isActive, true)))
      .orderBy(productMedia.sortOrder, productMedia.createdAt);
  }

  async createProductMedia(media: InsertProductMedia): Promise<ProductMedia> {
    const [newMedia] = await this.db.insert(productMedia).values(media).returning();
    return newMedia;
  }

  // Vehicle-Product Compatibility  
  async getVehicleProductCompatibility(vehicleTypeId?: string, productId?: string): Promise<VehicleProductCompatibility[]> {
    let whereConditions = [eq(vehicleProductCompatibility.isActive, true)];
    
    if (vehicleTypeId) {
      whereConditions.push(eq(vehicleProductCompatibility.vehicleTypeId, vehicleTypeId));
    }
    if (productId) {
      whereConditions.push(eq(vehicleProductCompatibility.productId, productId));
    }
    
    return await this.db.select().from(vehicleProductCompatibility).where(and(...whereConditions));
  }

  async createVehicleProductCompatibility(compatibility: InsertVehicleProductCompatibility): Promise<VehicleProductCompatibility> {
    const [newCompatibility] = await this.db.insert(vehicleProductCompatibility).values(compatibility).returning();
    return newCompatibility;
  }

  async getProducts(filters?: { category?: string; industry?: string; search?: string; vehicleTypeIds?: string[]; applicationTypeIds?: string[] }): Promise<Product[]> {
    const whereConditions: (SQL | undefined)[] = [eq(products.isActive, true)];
    
    if (filters?.category) {
      // Special handling for cold-storage category - check both category and subcategory
      if (filters.category === 'cold-storage') {
        whereConditions.push(
          or(
            eq(products.category, 'cold-storage'),
            eq(products.subcategory, 'cold-storage'),
            eq(products.subcategory, 'Cold Storage Protection'),
            ilike(products.name, '%cold store%'),
            ilike(products.name, '%cold storage%')
          )
        );
      } else if (filters.category === 'charging-unit-protection') {
        // Include ForkGuard Kerb products and StepGuard for charging unit protection
        whereConditions.push(
          or(
            eq(products.category, 'charging-unit-protection'),
            eq(products.subcategory, 'charging-unit-protection'),
            ilike(products.name, '%forkguard kerb%'),
            ilike(products.name, '%step guard%'),
            ilike(products.name, '%stepguard%')
          )
        );
      } else if (filters.category === 'wall-protection') {
        // Include wall protection and related products
        whereConditions.push(
          or(
            eq(products.category, 'wall-protection'),
            eq(products.subcategory, 'wall-protection'),
            ilike(products.name, '%forkguard kerb%'),
            ilike(products.name, '%step guard%'),
            ilike(products.name, '%stepguard%'),
            ilike(products.name, '%micro barrier%'),
            and(
              eq(products.category, 'traffic-barriers'),
              ilike(products.name, '%single traffic barrier%')
            )
          )
        );
      } else if (filters.category === 'pedestrian-barriers') {
        // Include both pedestrian barriers AND traffic plus products
        whereConditions.push(
          or(
            eq(products.category, 'pedestrian-barriers'),
            and(
              eq(products.category, 'traffic-barriers'),
              or(
                ilike(products.name, '%plus%'),
                ilike(products.name, '%+%')
              )
            )
          )
        );
      } else {
        whereConditions.push(eq(products.category, filters.category));
      }
    }
    
    if (filters?.industry) {
      // Check if the industries JSON array contains the specified industry
      whereConditions.push(sql`${products.industries} ? ${filters.industry}`);
    }
    
    if (filters?.search) {
      const searchConditions = or(
        ilike(products.name, `%${filters.search}%`),
        ilike(products.description, `%${filters.search}%`)
      );
      if (searchConditions) {
        whereConditions.push(searchConditions);
      }
    }
    
    // Vehicle type filtering through compatibility table (multiple types)
    if (filters?.vehicleTypeIds && filters.vehicleTypeIds.length > 0) {
      const compatibleProductIds = await this.db
        .select({ productId: vehicleProductCompatibility.productId })
        .from(vehicleProductCompatibility)
        .where(and(
          inArray(vehicleProductCompatibility.vehicleTypeId, filters.vehicleTypeIds),
          eq(vehicleProductCompatibility.isActive, true)
        ));
      
      if (compatibleProductIds.length > 0) {
        whereConditions.push(
          inArray(products.id, compatibleProductIds.map(p => p.productId))
        );
      } else {
        // No compatible products found, return empty result
        return [];
      }
    }
    
    // Application type filtering through compatibility table (multiple types)
    if (filters?.applicationTypeIds && filters.applicationTypeIds.length > 0) {
      const compatibleProductIds = await this.db
        .select({ productId: productApplicationCompatibility.productId })
        .from(productApplicationCompatibility)
        .where(and(
          inArray(productApplicationCompatibility.applicationTypeId, filters.applicationTypeIds),
          eq(productApplicationCompatibility.isActive, true)
        ));
      
      if (compatibleProductIds.length > 0) {
        whereConditions.push(
          inArray(products.id, compatibleProductIds.map(p => p.productId))
        );
      } else {
        // No compatible products found, return empty result
        return [];
      }
    }
    
    return await this.db
      .select()
      .from(products)
      .where(and(...whereConditions))
      .orderBy(products.impactRating);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.isActive, true)));
    return product;
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.name, name), eq(products.isActive, true)));
    return product;
  }

  async getProductByNameSimilarity(searchTerm: string): Promise<Product | undefined> {
    // Try exact name match first
    const exactMatch = await this.getProductByName(searchTerm);
    if (exactMatch) return exactMatch;
    
    // Try similar name matching - convert search term to likely product name
    const cleanedSearch = searchTerm
      .replace(/family-/gi, '')
      .replace(/-{3,}/g, ' – ') // Convert triple hyphens to em dash
      .replace(/-+/g, ' ') // Convert remaining hyphens to spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Title case
      .trim();
    
    console.log(`Searching for product name similarity: "${cleanedSearch}"`);
    
    const [similarProduct] = await this.db
      .select()
      .from(products)
      .where(and(
        ilike(products.name, `%${cleanedSearch}%`),
        eq(products.isActive, true)
      ))
      .limit(1);
    
    return similarProduct;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await this.db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product> {
    const [updatedProduct] = await this.db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.db.update(products).set({ isActive: false }).where(eq(products.id, id));
  }

  async getProductVariants(baseName: string): Promise<Product[]> {
    // Get all products that match the base name pattern
    const allProducts = await this.db
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(products.name);
    
    // Filter products that match the base name
    const variants = allProducts.filter(product => {
      let productBaseName = product.name;
      // Remove variant-specific parts
      productBaseName = productBaseName.replace(/\s*[-–]\s*\d+\s*mm(\s*[-–]\s*\d+\s*mm)?/gi, '');
      productBaseName = productBaseName.replace(/\s*[-–]\s*(standard|plus|heavy[-\s]?duty|light[-\s]?duty)/gi, '');
      productBaseName = productBaseName.replace(/\s*[-–]\s*(single|double|triple|quad)/gi, '');
      productBaseName = productBaseName.replace(/\s*[-–]\s*\d+\s*sides?/gi, '');
      productBaseName = productBaseName.replace(/\s*\(\d+\s*rails?\)/gi, '');
      productBaseName = productBaseName.trim();
      
      return productBaseName.toLowerCase() === baseName.toLowerCase();
    });
    
    return variants;
  }

  async getProductRecommendations(requiredImpactRating: number): Promise<Product[]> {
    console.log(`Getting product recommendations for ${requiredImpactRating}J impact rating`);
    
    const requiredRating = Math.ceil(requiredImpactRating);
    console.log(`Required rating: ${requiredRating}J`);
    
    // Get all products that meet the impact rating requirement
    const allProducts = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`${products.impactRating} >= ${requiredRating}`
        )
      )
      .orderBy(products.impactRating);
    
    // Group products by base name to consolidate variants
    const productGroups = new Map<string, {
      baseProduct: Product,
      variants: Product[],
      baseName: string,
      minPrice: number,
      maxPrice: number,
      variantCount: number
    }>();
    
    for (const product of allProducts) {
      // Extract base product name by removing variant-specific parts
      let baseName = product.name;
      
      // Remove common variant patterns from product names
      baseName = baseName.replace(/\s*[-–]\s*\d+\s*mm(\s*[-–]\s*\d+\s*mm)?/gi, ''); // Remove dimensions
      baseName = baseName.replace(/\s*[-–]\s*(standard|plus|heavy[-\s]?duty|light[-\s]?duty)/gi, ''); // Remove duty types
      baseName = baseName.replace(/\s*[-–]\s*(single|double|triple|quad)/gi, ''); // Remove quantity descriptors
      baseName = baseName.replace(/\s*[-–]\s*\d+\s*sides?/gi, ''); // Remove side counts
      baseName = baseName.replace(/\s*\(\d+\s*rails?\)/gi, ''); // Remove rail counts
      baseName = baseName.trim();
      
      const price = product.price ? parseFloat(product.price) : 0;
      
      if (!productGroups.has(baseName)) {
        productGroups.set(baseName, {
          baseProduct: product,
          variants: [product],
          baseName: baseName,
          minPrice: price,
          maxPrice: price,
          variantCount: 1
        });
      } else {
        const group = productGroups.get(baseName)!;
        group.variants.push(product);
        group.variantCount++;
        if (price < group.minPrice) group.minPrice = price;
        if (price > group.maxPrice) group.maxPrice = price;
      }
    }
    
    // Create consolidated products with variant information
    const recommendedProducts = Array.from(productGroups.values()).map(group => {
      const baseProduct = { ...group.baseProduct };
      
      // Add variant information to the base product
      (baseProduct as any).baseName = group.baseName;
      (baseProduct as any).variantCount = group.variantCount;
      (baseProduct as any).variants = group.variants.map(v => ({
        id: v.id,
        name: v.name,
        price: v.price,
        heightMax: v.heightMax,
        heightMin: v.heightMin
      }));
      
      // Update name to show it's a group if there are variants
      if (group.variantCount > 1) {
        baseProduct.name = group.baseName;
        // Show price range if variants have different prices
        if (group.minPrice !== group.maxPrice) {
          baseProduct.price = `${group.minPrice}-${group.maxPrice}`;
        }
      }
      
      return baseProduct;
    });
    
    // Sort by impact rating
    recommendedProducts.sort((a, b) => (a.impactRating || 0) - (b.impactRating || 0));
    
    console.log(`Found ${allProducts.length} total variants, returning ${recommendedProducts.length} unique base products`);
    return recommendedProducts;
  }

  // Case Study operations - Now using corrected schema
  async getCaseStudies(industry?: string, contentType?: string): Promise<CaseStudy[]> {
    try {
      console.log(`Fetching case studies with filters - industry: ${industry || 'none'}, contentType: ${contentType || 'none'}`);
      
      // Map frontend industry filters to database values
      const industryMapping: Record<string, string> = {
        'food-and-drink': 'Food & Beverage',
        'food-and-beverage': 'Food & Beverage',
        'warehousing-distribution': 'Warehousing & Logistics',
        'warehousing-logistics': 'Warehousing & Logistics',
        'automotive': 'automotive',
        'manufacturing': 'manufacturing',
        'airports': 'airports',
        'parking-lot': 'parking-lot',
        'parking': 'parking-lot',
        'recycling-packaging': 'recycling-packaging',
        'multiple': 'multiple'
      };
      
      // Build the where conditions
      const conditions = [eq(caseStudies.isPublished, true)];
      
      if (industry) {
        // Use the mapped value or the original if no mapping exists
        const mappedIndustry = industryMapping[industry] || industry;
        conditions.push(eq(caseStudies.industry, mappedIndustry));
      }
      
      if (contentType) {
        conditions.push(eq(caseStudies.contentType, contentType));
      }
      
      const results = await this.db
        .select()
        .from(caseStudies)
        .where(and(...conditions))
        .orderBy(desc(caseStudies.createdAt));
        
      console.log(`Found ${results.length} case studies with applied filters`);
      return results;
    } catch (error) {
      console.error('Error in getCaseStudies:', error);
      throw error;
    }
  }

  async getCaseStudy(id: string): Promise<CaseStudy | undefined> {
    const [caseStudy] = await this.db.select().from(caseStudies).where(eq(caseStudies.id, id));
    return caseStudy;
  }

  async createCaseStudy(caseStudy: InsertCaseStudy): Promise<CaseStudy> {
    const [newCaseStudy] = await this.db.insert(caseStudies).values(caseStudy).returning();
    return newCaseStudy;
  }

  async updateCaseStudy(id: string, updates: Partial<InsertCaseStudy>): Promise<CaseStudy> {
    const [updatedCaseStudy] = await this.db
      .update(caseStudies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(caseStudies.id, id))
      .returning();
    return updatedCaseStudy;
  }

  async deleteCaseStudy(id: string): Promise<void> {
    await this.db.delete(caseStudies).where(eq(caseStudies.id, id));
  }

  // Resource operations
  async getResources(resourceType?: string): Promise<Resource[]> {
    try {
      console.log('Getting resources with resourceType:', resourceType);
      
      // Use Drizzle query builder for type safety and SQL injection prevention
      const whereConditions = [eq(resources.isActive, true)];
      
      if (resourceType) {
        whereConditions.push(eq(resources.resourceType, resourceType));
      }
      
      const result = await this.db
        .select({
          id: resources.id,
          title: resources.title,
          category: resources.category,
          resourceType: resources.resourceType,
          description: resources.description,
          fileUrl: resources.fileUrl,
          fileSize: resources.fileSize,
          fileType: resources.fileType,
          downloadCount: resources.downloadCount,
          isActive: resources.isActive,
          thumbnailUrl: resources.thumbnailUrl,
          createdAt: resources.createdAt,
          updatedAt: resources.updatedAt
        })
        .from(resources)
        .where(and(...whereConditions))
        .orderBy(desc(resources.downloadCount), desc(resources.createdAt));
      console.log('Resources query result:', result.length, 'rows');
      
      return result;
    } catch (error) {
      console.error('Error in getResources:', error);
      throw error;
    }
  }

  async getResource(id: string): Promise<Resource | undefined> {
    const [resource] = await this.db.select().from(resources).where(eq(resources.id, id));
    return resource;
  }

  async createResource(resource: InsertResource): Promise<Resource> {
    const [newResource] = await this.db.insert(resources).values(resource).returning();
    return newResource;
  }

  async updateResource(id: string, updates: Partial<InsertResource>): Promise<Resource> {
    const [updatedResource] = await this.db
      .update(resources)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(resources.id, id))
      .returning();
    return updatedResource;
  }

  async deleteResource(id: string): Promise<void> {
    await this.db.delete(resources).where(eq(resources.id, id));
  }

  async incrementDownloadCount(id: string): Promise<void> {
    await this.db
      .update(resources)
      .set({ downloadCount: sql`${resources.downloadCount} + 1` })
      .where(eq(resources.id, id));
  }

  // FAQ operations
  async getFaqs(category?: string): Promise<Faq[]> {
    const whereConditions = [];
    
    if (category) {
      whereConditions.push(eq(faqs.category, category));
    }
    
    const query = this.db.select().from(faqs);
    
    if (whereConditions.length > 0) {
      return await query.where(and(...whereConditions)).orderBy(faqs.priority);
    }
    
    return await query.orderBy(faqs.priority);
  }

  async getFaq(id: string): Promise<Faq | undefined> {
    const [faq] = await this.db.select().from(faqs).where(eq(faqs.id, id));
    return faq;
  }

  async createFaq(faq: InsertFaq): Promise<Faq> {
    const [newFaq] = await this.db.insert(faqs).values(faq).returning();
    return newFaq;
  }

  async updateFaq(id: string, updates: Partial<InsertFaq>): Promise<Faq> {
    const [updatedFaq] = await this.db
      .update(faqs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(faqs.id, id))
      .returning();
    return updatedFaq;
  }

  async deleteFaq(id: string): Promise<void> {
    await this.db.delete(faqs).where(eq(faqs.id, id));
  }

  // Impact Calculation operations
  async getUserCalculations(userId: string): Promise<ImpactCalculation[]> {
    return await this.db
      .select()
      .from(impactCalculations)
      .where(eq(impactCalculations.userId, userId))
      .orderBy(desc(impactCalculations.createdAt));
  }

  async getAllCalculations(): Promise<ImpactCalculation[]> {
    return await this.db
      .select()
      .from(impactCalculations)
      .orderBy(desc(impactCalculations.createdAt));
  }

  async getCalculation(id: string): Promise<ImpactCalculation | undefined> {
    const [calculation] = await this.db.select().from(impactCalculations).where(eq(impactCalculations.id, id));
    return calculation;
  }

  async getImpactCalculation(id: string): Promise<ImpactCalculation | undefined> {
    return this.getCalculation(id);
  }

  async createCalculation(calculation: InsertImpactCalculation): Promise<ImpactCalculation> {
    const [newCalculation] = await this.db.insert(impactCalculations).values(calculation).returning();
    return newCalculation;
  }

  async saveImpactCalculation(calculation: InsertImpactCalculation): Promise<ImpactCalculation> {
    return this.createCalculation(calculation);
  }

  async deleteCalculation(id: string): Promise<void> {
    await this.db.delete(impactCalculations).where(eq(impactCalculations.id, id));
  }

  // Order Form Request operations
  async getUserQuoteRequests(userId: string): Promise<any[]> {
    const result = await this.db.execute(sql`
      SELECT * FROM quote_requests 
      WHERE user_id = ${userId} 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  async getAllQuoteRequests(): Promise<QuoteRequest[]> {
    return await this.db
      .select()
      .from(quoteRequests)
      .orderBy(desc(quoteRequests.createdAt));
  }

  async getQuoteRequestsByStatus(status: string): Promise<QuoteRequest[]> {
    return await this.db
      .select()
      .from(quoteRequests)
      .where(eq(quoteRequests.status, status))
      .orderBy(desc(quoteRequests.createdAt));
  }

  async getQuoteRequest(id: string): Promise<QuoteRequest | undefined> {
    const [request] = await this.db.select().from(quoteRequests).where(eq(quoteRequests.id, id));
    return request;
  }

  async createQuoteRequest(request: any): Promise<any> {
    // Map the request to match the actual database schema
    const productNames = Array.isArray(request.productNames) ? request.productNames : 
                        request.productName ? [request.productName] : ['Various'];
    
    // Create a comprehensive message with all the quote details
    const messageLines = [
      `Order Form Request for: ${request.productName || 'Various products'}`,
      '',
      '--- Product Details ---',
      `Product: ${request.productName || 'N/A'}`,
      `Category: ${request.productCategory || 'N/A'}`,
      `Impact Rating: ${request.impactRating ? Math.round(request.impactRating).toLocaleString() + 'J' : 'N/A'}`,
      `Price: ${request.currency || 'AED'} ${request.price || 'Contact for pricing'}`,
      '',
      '--- Project Requirements ---',
      `Quantity: ${request.quantity || 'N/A'}`,
      `Location: ${request.projectLocation || 'N/A'}`,
      `Timeline: ${request.timeline || 'N/A'}`,
      `Application: ${request.specificApplication || 'N/A'}`,
      request.additionalRequirements ? `Additional Requirements: ${request.additionalRequirements}` : '',
      '',
      '--- Contact Information ---',
      `Contact Person: ${request.contactPerson || 'N/A'}`,
      `Email: ${request.contactEmail || 'N/A'}`,
      `Phone: ${request.phone || 'N/A'}`,
      `Company: ${request.company || 'N/A'}`,
      '',
      `Requested via: ${request.requestMethod || 'email'}`,
      `Preferred Contact: ${request.preferredContact || 'email'}`
    ].filter(line => line !== '').join('\n');

    const quoteData = {
      userId: request.userId,
      productNames: productNames,
      company: request.company || '',
      contactMethod: request.contactMethod || request.requestMethod || 'email',
      phoneNumber: request.phoneNumber || request.phone || '',
      email: request.email || request.contactEmail || '',
      customOrderNumber: request.customOrderNumber || null,
      message: messageLines,
      status: request.status || 'pending'
    };
    
    // Insert using Drizzle ORM with proper data types
    try {
      const [newQuoteRequest] = await this.db.insert(quoteRequests).values({
        userId: quoteData.userId,
        productNames: quoteData.productNames,
        company: quoteData.company,
        contactMethod: quoteData.contactMethod,
        phoneNumber: quoteData.phoneNumber,
        email: quoteData.email,
        customOrderNumber: quoteData.customOrderNumber,
        message: quoteData.message,
        status: quoteData.status,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      
      return newQuoteRequest;
    } catch (error) {
      console.error("Database insert error:", error);
      throw new Error(`Failed to create quote request: ${(error as Error).message}`);
    }
  }

  async updateQuoteRequest(id: string, updates: Partial<InsertQuoteRequest>): Promise<QuoteRequest> {
    const [updatedRequest] = await this.db
      .update(quoteRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quoteRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async updateQuoteRequestStatus(id: string, status: string): Promise<QuoteRequest> {
    return this.updateQuoteRequest(id, { status });
  }

  async deleteQuoteRequest(id: string): Promise<void> {
    await this.db.delete(quoteRequests).where(eq(quoteRequests.id, id));
  }

  async clearUserQuoteRequests(userId: string): Promise<void> {
    await this.db.delete(quoteRequests).where(eq(quoteRequests.userId, userId));
  }

  async getQuoteRequestStats(): Promise<{ total: number; pending: number; inProgress: number; completed: number }> {
    const [stats] = await this.db
      .select({
        total: sql<number>`COUNT(*)`,
        pending: sql<number>`COUNT(CASE WHEN status = 'pending' THEN 1 END)`,
        inProgress: sql<number>`COUNT(CASE WHEN status = 'in-progress' THEN 1 END)`,
        completed: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
      })
      .from(quoteRequests);
    
    return {
      total: Number(stats.total) || 0,
      pending: Number(stats.pending) || 0,
      inProgress: Number(stats.inProgress) || 0,
      completed: Number(stats.completed) || 0,
    };
  }

  // Order Form Request Item operations
  async getQuoteRequestItems(quoteRequestId: string): Promise<QuoteRequestItem[]> {
    return await this.db
      .select()
      .from(quoteRequestItems)
      .where(eq(quoteRequestItems.quoteRequestId, quoteRequestId))
      .orderBy(quoteRequestItems.createdAt);
  }

  async createQuoteRequestItem(item: InsertQuoteRequestItem): Promise<QuoteRequestItem> {
    const [newItem] = await this.db.insert(quoteRequestItems).values(item).returning();
    return newItem;
  }

  // Cart operations
  async getUserCart(userId: string): Promise<CartItem[]> {
    return await this.db
      .select()
      .from(cartItems)
      .where(eq(cartItems.userId, userId))
      .orderBy(desc(cartItems.createdAt));
  }

  async addToCart(item: InsertCartItem): Promise<CartItem> {
    const [newItem] = await this.db.insert(cartItems).values(item).returning();
    return newItem;
  }

  async updateCartItem(id: string, updates: Partial<InsertCartItem>): Promise<CartItem> {
    // If quantity is being updated, recalculate pricing
    if (updates.quantity !== undefined) {
      console.log(`Recalculating pricing for cart item ${id} with new quantity: ${updates.quantity}`);
      
      // Get the current cart item to access product name
      const [currentItem] = await this.db.select().from(cartItems).where(eq(cartItems.id, id));
      if (!currentItem) {
        throw new Error(`Cart item ${id} not found`);
      }
      
      // Recalculate pricing with new quantity
      const pricingResult = await this.calculatePrice(currentItem.productName, updates.quantity);

      if (pricingResult.requiresQuote) {
        // Fall back to the existing stored unit price (e.g. for variant-specific
        // items whose name does not match a pricing tier).
        const existingUnit = parseFloat(currentItem.unitPrice as any);
        if (!isNaN(existingUnit) && existingUnit > 0) {
          const newTotal = Math.round(existingUnit * updates.quantity * 100) / 100;
          updates.totalPrice = newTotal;
          updates.unitPrice = Math.round(existingUnit * 100) / 100;
          updates.pricingTier = currentItem.pricingTier || "Variant Price";
          console.log(`Used existing variant price for update: Unit=${updates.unitPrice}, Total=${updates.totalPrice}`);
        } else {
          throw new Error("No pricing available for this product. Please request a quote.");
        }
      } else {
        // Update with recalculated pricing
        updates.unitPrice = pricingResult.unitPrice;
        updates.totalPrice = pricingResult.totalPrice;
        updates.pricingTier = pricingResult.tier;

        console.log(`Updated pricing: Unit=${pricingResult.unitPrice}, Total=${pricingResult.totalPrice}, Tier=${pricingResult.tier}`);
      }
    }
    
    const [updatedItem] = await this.db
      .update(cartItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cartItems.id, id))
      .returning();
    return updatedItem;
  }

  async removeFromCart(id: string): Promise<void> {
    await this.db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearUserCart(userId: string): Promise<void> {
    await this.db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  // Product Pricing operations
  async getProductPricing(): Promise<ProductPricing[]> {
    return await this.db
      .select()
      .from(productPricing)
      .where(eq(productPricing.isActive, true))
      .orderBy(productPricing.productName);
  }

  async getProductVariants(productId?: string): Promise<any[]> {
    const rows = productId
      ? await this.db
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, productId),
              eq(productVariants.isActive, true),
            ),
          )
          .orderBy(productVariants.lengthMm, productVariants.name)
      : await this.db
          .select()
          .from(productVariants)
          .where(eq(productVariants.isActive, true))
          .orderBy(productVariants.productId, productVariants.lengthMm);
    return rows;
  }

  async getProductPricingByName(productName: string): Promise<any | undefined> {
    const [pricing] = await this.db
      .select()
      .from(productPricing)
      .where(and(eq(productPricing.productName, productName), eq(productPricing.isActive, true)));
    return pricing;
  }

  async calculatePrice(productName: string, quantity: number): Promise<{ unitPrice: number; totalPrice: number; tier: string; requiresQuote?: boolean }> {
    console.log(`Calculating price for product: "${productName}" with quantity: ${quantity}`);
    
    // Clean up product name - handle duplicate dimensions issue
    // e.g., "eFlex Single Rack End Barrier – 2500 mm – 2500 mm" -> "eFlex Single Rack End Barrier – 2500 mm"
    let cleanProductName = productName;
    const parts = productName.split(' – ');
    if (parts.length === 3 && parts[1] === parts[2]) {
      // If we have duplicate dimensions, remove the second one
      cleanProductName = `${parts[0]} – ${parts[1]}`;
      console.log(`Cleaned product name from "${productName}" to "${cleanProductName}"`);
    }
    
    // First try exact match with cleaned name
    const exactMatch = await this.db
      .select()
      .from(productPricing)
      .where(and(eq(productPricing.productName, cleanProductName), eq(productPricing.isActive, true)));
    
    let pricing: any = exactMatch[0];
      
    // If no exact match, try fuzzy matching (remove special characters and normalize)
    if (!pricing) {
      const normalizedProductName = cleanProductName.replace(/[™®+]/g, '').trim();
      const allPricing = await this.db
        .select()
        .from(productPricing)
        .where(eq(productPricing.isActive, true));
      
      pricing = allPricing.find(p => {
        const normalizedPricingName = p.productName.replace(/[™®+]/g, '').trim();
        return normalizedPricingName.toLowerCase() === normalizedProductName.toLowerCase();
      });
    }
    
    // Default base price calculation
    let basePrice: number;
    let unitPrice: number;
    let tier: string = "";
    
    if (!pricing) {
      console.log(`No pricing found for product: "${cleanProductName}", checking base product price...`);
      
      // Fallback to base product price from products table - try cleaned name first
      let [product] = await this.db
        .select()
        .from(products)
        .where(and(eq(products.name, cleanProductName), eq(products.isActive, true)));
      
      // If not found with cleaned name, try original name
      if (!product && cleanProductName !== productName) {
        [product] = await this.db
          .select()
          .from(products)
          .where(and(eq(products.name, productName), eq(products.isActive, true)));
      }
      
      if (product && product.price) {
        basePrice = parseFloat(product.price);
        console.log(`Using base product price: ${basePrice} AED for "${cleanProductName}"`);
      } else {
        console.error(`No pricing found for product: "${productName}" in either pricing or products table`);
        // No pricing available - return a "requires quote" response instead of a fake price
        return {
          unitPrice: 0,
          totalPrice: 0,
          tier: "No pricing available",
          requiresQuote: true,
        };
      }
    } else {
      // Use existing tier-based pricing logic (with NaN safety)
      const tier1Min = pricing.tier1Min ? parseFloat(pricing.tier1Min) : 0;
      const tier1Max = pricing.tier1Max ? parseFloat(pricing.tier1Max) : 0;
      const tier2Min = pricing.tier2Min ? parseFloat(pricing.tier2Min) : 0;
      const tier2Max = pricing.tier2Max ? parseFloat(pricing.tier2Max) : 0;
      const tier3Min = pricing.tier3Min ? parseFloat(pricing.tier3Min) : 0;
      const tier3Max = pricing.tier3Max ? parseFloat(pricing.tier3Max) : 0;
      const tier4Min = pricing.tier4Min ? parseFloat(pricing.tier4Min) : 0;
      
      if (quantity >= tier1Min && quantity < tier2Min) {
        basePrice = parseFloat(pricing.tier1Price);
        tier = `Tier 1 (${tier1Min}-${tier1Max}m)`;
      } else if (quantity >= tier2Min && quantity < tier3Min) {
        basePrice = parseFloat(pricing.tier2Price);
        tier = `Tier 2 (${tier2Min}-${tier2Max}m)`;
      } else if (quantity >= tier3Min && quantity < tier4Min) {
        basePrice = parseFloat(pricing.tier3Price);
        tier = `Tier 3 (${tier3Min}-${tier3Max}m)`;
      } else if (quantity >= tier4Min) {
        basePrice = parseFloat(pricing.tier4Price);
        tier = `Tier 4 (${tier4Min}m+)`;
      } else {
        // Default to tier 1 if quantity doesn't fit any tier
        basePrice = parseFloat(pricing.tier1Price);
        tier = `Tier 1 (${tier1Min}-${tier1Max}m)`;
      }
    }
    
    // All quantity-based discounts are handled by the DB-driven tiered pricing
    // in the product_pricing table (tiers 1-4 with quantity ranges).
    // To configure quantity discounts for any product (including traffic barriers),
    // set the appropriate tier ranges and prices in the product_pricing table.
    unitPrice = basePrice;
    if (!tier) {
      tier = pricing ? "Standard pricing" : "Base Product Price";
    }

    // NaN safety: if basePrice couldn't be parsed, treat as requires-quote
    if (isNaN(unitPrice) || unitPrice <= 0) {
      console.error(`calculatePrice: unitPrice is NaN or zero for "${productName}"`);
      return {
        unitPrice: 0,
        totalPrice: 0,
        tier: "No pricing available",
        requiresQuote: true,
      };
    }

    const totalPrice = Math.round(unitPrice * quantity * 100) / 100;

    return {
      unitPrice: Math.round(unitPrice * 100) / 100,
      totalPrice,
      tier
    };
  }

  // Legacy pricing methods - now using direct product pricing
  async createProductPricing(pricing: any): Promise<any> {
    throw new Error("Product pricing is now managed directly in the products table");
  }

  async updateProductPricing(id: string, updates: any): Promise<any> {
    throw new Error("Product pricing is now managed directly in the products table");
  }

  async deleteProductPricing(id: string): Promise<void> {
    throw new Error("Product pricing is now managed directly in the products table");
  }

  // Discount operations
  async getDiscountOptions(): Promise<DiscountOption[]> {
    return await this.db
      .select()
      .from(discountOptions)
      .where(eq(discountOptions.isActive, true))
      .orderBy(discountOptions.category, discountOptions.discountPercent);
  }

  async getUserDiscountSelections(userId: string): Promise<UserDiscountSelection[]> {
    return await this.db
      .select()
      .from(userDiscountSelections)
      .where(and(
        eq(userDiscountSelections.userId, userId),
        eq(userDiscountSelections.isSelected, true)
      ));
  }

  async saveUserDiscountSelections(userId: string, selections: string[]): Promise<UserDiscountSelection[]> {
    // First, clear all existing selections for this user
    await this.db
      .delete(userDiscountSelections)
      .where(eq(userDiscountSelections.userId, userId));

    // Insert new selections
    if (selections.length > 0) {
      const newSelections = selections.map(discountOptionId => ({
        userId,
        discountOptionId,
        isSelected: true,
      }));

      await this.db.insert(userDiscountSelections).values(newSelections);
    }

    // Return the updated selections
    return await this.getUserDiscountSelections(userId);
  }

  // ────────────────────────────────────────────────────────────────
  // Partner code operations
  //
  // Security model:
  //  - `validatePartnerCode` NEVER returns the list of valid codes; it only
  //    returns whether a given input is valid plus the partner name / %.
  //  - Usage count is incremented only on `redeemPartnerCode`, which is
  //    called server-side when an order is created. That makes the cap a
  //    real limit rather than a reservation.
  //  - `listPartnerCodes` / `createPartnerCode` / `setPartnerCodeActive`
  //    are admin-only (routes guard this).
  // ────────────────────────────────────────────────────────────────
  async validatePartnerCode(code: string, userId: string) {
    const trimmed = (code || "").trim();
    if (!trimmed) {
      return { valid: false, reason: "invalid" as const };
    }

    // Case-insensitive match against indexed LOWER(code).
    const [row] = await this.db
      .select()
      .from(partnerCodes)
      .where(sql`LOWER(${partnerCodes.code}) = LOWER(${trimmed})`)
      .limit(1);

    if (!row) return { valid: false, reason: "invalid" as const };
    if (!row.isActive) return { valid: false, reason: "inactive" as const };

    const now = new Date();
    if (row.validFrom && row.validFrom > now) {
      return { valid: false, reason: "notYetValid" as const };
    }
    if (row.validTo && row.validTo < now) {
      return { valid: false, reason: "expired" as const };
    }
    if (row.usageCap !== null && row.usageCap !== undefined && row.usageCount >= row.usageCap) {
      return { valid: false, reason: "exhausted" as const };
    }

    // Per-user limits (rolling 12-month window, evaluated in Postgres so the
    // clock is the DB server's and not the Worker's — Workers run on many
    // edges and a per-request `new Date()` would give inconsistent cutoffs).
    //
    // Rule 1: same user + same code within the window → lock out.
    // Rule 2: same user + ANY partner code, N redemptions within the
    // window → lock out. Rule 2 is evaluated second so a user who has
    // already used THIS code sees the more-specific message.
    if (userId) {
      const windowCutoff = sql`NOW() - (${PER_USER_SAME_CODE_WINDOW_MONTHS} || ' months')::interval`;

      const [sameCodeRow] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(partnerCodeRedemptions)
        .where(
          and(
            eq(partnerCodeRedemptions.userId, userId),
            eq(partnerCodeRedemptions.partnerCodeId, row.id),
            sql`${partnerCodeRedemptions.redeemedAt} >= ${windowCutoff}`,
          ),
        );
      if ((sameCodeRow?.c ?? 0) >= 1) {
        return { valid: false, reason: "per_user_same_code_limit" as const };
      }

      const [totalRow] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(partnerCodeRedemptions)
        .where(
          and(
            eq(partnerCodeRedemptions.userId, userId),
            sql`${partnerCodeRedemptions.redeemedAt} >= ${windowCutoff}`,
          ),
        );
      if ((totalRow?.c ?? 0) >= PER_USER_TOTAL_REDEMPTIONS_PER_WINDOW) {
        return { valid: false, reason: "per_user_total_limit" as const };
      }
    }

    return {
      valid: true as const,
      codeId: row.id,
      partnerName: row.partnerName,
      discountPercent: row.discountPercent,
    };
  }

  async redeemPartnerCode(
    code: string,
    userId: string,
    orderId: string | null,
    cartSubtotal: number | null
  ) {
    // Re-validate inside the txn to avoid TOCTOU: code could have been
    // deactivated or exhausted between validate() and redeem(), and — since
    // validate is now per-user — the same user could have slipped in a
    // second redemption between the two calls.
    const v = await this.validatePartnerCode(code, userId);
    if (!v.valid) return null;

    // Atomic increment: only succeeds if the cap hasn't been hit. This is
    // the enforcement point — validate() above is a convenience, redeem()
    // is the lock.
    const incremented = await this.db
      .update(partnerCodes)
      .set({
        usageCount: sql`${partnerCodes.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(partnerCodes.id, v.codeId),
          eq(partnerCodes.isActive, true),
          // Enforce cap at the SQL level so two concurrent redemptions can't
          // both slip through.
          or(
            isNull(partnerCodes.usageCap),
            sql`${partnerCodes.usageCount} < ${partnerCodes.usageCap}`
          ) as SQL
        )
      )
      .returning({ id: partnerCodes.id });

    if (incremented.length === 0) {
      // Another request got there first and exhausted the cap.
      return null;
    }

    const [redemption] = await this.db
      .insert(partnerCodeRedemptions)
      .values({
        partnerCodeId: v.codeId,
        userId,
        orderId,
        cartSubtotal: cartSubtotal !== null ? String(cartSubtotal) : null,
        discountPercentApplied: v.discountPercent,
      })
      .returning({ id: partnerCodeRedemptions.id });

    return { redemptionId: redemption.id, discountPercent: v.discountPercent };
  }

  async listPartnerCodes() {
    return await this.db
      .select()
      .from(partnerCodes)
      .orderBy(desc(partnerCodes.createdAt));
  }

  async createPartnerCode(input: {
    code: string;
    partnerName: string;
    discountPercent: number;
    validFrom?: Date | null;
    validTo?: Date | null;
    usageCap?: number | null;
    notes?: string | null;
    createdBy?: string | null;
  }) {
    if (
      !Number.isFinite(input.discountPercent) ||
      input.discountPercent < 1 ||
      input.discountPercent > 35
    ) {
      throw new Error("discountPercent must be between 1 and 35");
    }
    const [row] = await this.db
      .insert(partnerCodes)
      .values({
        code: input.code.trim(),
        partnerName: input.partnerName.trim(),
        discountPercent: input.discountPercent,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        usageCap: input.usageCap ?? null,
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return row;
  }

  async setPartnerCodeActive(id: string, isActive: boolean): Promise<void> {
    await this.db
      .update(partnerCodes)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(partnerCodes.id, id));
  }

  // LinkedIn Discount operations
  async upsertLinkedInDiscount(userId: string, linkedinData: {
    companyUrl: string;
    followers: number;
    commitment: boolean;
    postUrl?: string;
    proofUrls?: string[];
    status?: string;
  }): Promise<UserDiscountSelection> {
    // Check if LinkedIn discount option exists, if not create it
    let linkedinOption = await this.db.select()
      .from(discountOptions)
      .where(eq(discountOptions.id, 'linkedin_social'))
      .limit(1);
    
    if (linkedinOption.length === 0) {
      await this.db.insert(discountOptions).values({
        id: 'linkedin_social',
        title: 'LinkedIn Social Reciprocity',
        description: 'Discount based on LinkedIn company followers when you commit to posting about A-SAFE partnership',
        discountPercent: 0, // Fixed amount discount, not percentage
        category: 'social',
        isActive: true,
      });
    }
    
    // Check if user already has LinkedIn discount
    const existing = await this.db.select()
      .from(userDiscountSelections)
      .where(and(
        eq(userDiscountSelections.userId, userId),
        eq(userDiscountSelections.discountOptionId, 'linkedin_social')
      ))
      .limit(1);
    
    const discountData = {
      ...linkedinData,
      status: linkedinData.status || 'pending',
      createdAt: new Date().toISOString(),
    };
    
    if (existing.length > 0) {
      // Update existing
      const [updated] = await this.db.update(userDiscountSelections)
        .set({
          linkedinDiscountData: discountData,
          isSelected: true,
          updatedAt: new Date(),
        })
        .where(eq(userDiscountSelections.id, existing[0].id))
        .returning();
      return updated;
    } else {
      // Create new
      const [created] = await this.db.insert(userDiscountSelections)
        .values({
          userId,
          discountOptionId: 'linkedin_social',
          isSelected: true,
          linkedinDiscountData: discountData,
        })
        .returning();
      return created;
    }
  }
  
  async getLinkedInDiscountForCart(userId: string): Promise<UserDiscountSelection | undefined> {
    const [selection] = await this.db.select()
      .from(userDiscountSelections)
      .where(and(
        eq(userDiscountSelections.userId, userId),
        eq(userDiscountSelections.discountOptionId, 'linkedin_social'),
        eq(userDiscountSelections.isSelected, true)
      ))
      .limit(1);
    return selection;
  }
  
  async verifyLinkedInDiscount(selectionId: string, verifiedFollowers: number, status: string): Promise<UserDiscountSelection> {
    const [selection] = await this.db.select()
      .from(userDiscountSelections)
      .where(eq(userDiscountSelections.id, selectionId))
      .limit(1);
    
    if (!selection || !selection.linkedinDiscountData) {
      throw new Error('LinkedIn discount not found');
    }
    
    const updatedData = {
      ...(selection.linkedinDiscountData as any),
      verifiedFollowers,
      status,
      verifiedAt: new Date().toISOString(),
    };
    
    const [updated] = await this.db.update(userDiscountSelections)
      .set({
        linkedinDiscountData: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(userDiscountSelections.id, selectionId))
      .returning();
    
    return updated;
  }
  
  async calculateLinkedInDiscount(followers: number, subtotal: number): Promise<{ baseAedDiscount: number; cappedDiscount: number }> {
    // Calculate base discount: 0.001 AED per follower (1000 followers = 1 AED)
    const baseAedDiscount = Math.floor(followers / 1000);
    
    // Apply caps: Maximum of 2,500 AED or 1% of subtotal
    const maxDiscount = Math.min(2500, subtotal * 0.01);
    const cappedDiscount = Math.min(baseAedDiscount, maxDiscount);
    
    return {
      baseAedDiscount,
      cappedDiscount,
    };
  }

  // Service Care operations
  async getServiceCareOptions(): Promise<ServiceCareOption[]> {
    return await this.db
      .select()
      .from(serviceCareOptions)
      .where(eq(serviceCareOptions.isActive, true))
      .orderBy(serviceCareOptions.id);
  }

  async getUserServiceSelection(userId: string): Promise<UserServiceSelection | undefined> {
    const [selection] = await this.db
      .select()
      .from(userServiceSelections)
      .where(and(
        eq(userServiceSelections.userId, userId),
        eq(userServiceSelections.isSelected, true)
      ));
    return selection;
  }

  async saveUserServiceSelection(userId: string, serviceOptionId: string): Promise<UserServiceSelection> {
    // First, clear any existing selection for this user
    await this.db
      .delete(userServiceSelections)
      .where(eq(userServiceSelections.userId, userId));

    // Insert new selection
    const [newSelection] = await this.db
      .insert(userServiceSelections)
      .values({
        userId,
        serviceOptionId,
        isSelected: true,
      })
      .returning();

    return newSelection;
  }

  // Cart Project Information operations
  async getCartProjectInfo(userId: string): Promise<CartProjectInfo | undefined> {
    const [projectInfo] = await this.db
      .select()
      .from(cartProjectInfo)
      .where(eq(cartProjectInfo.userId, userId));
    return projectInfo;
  }

  async saveCartProjectInfo(userId: string, data: Partial<InsertCartProjectInfo>): Promise<CartProjectInfo> {
    // Check if project info already exists for this user
    const existing = await this.getCartProjectInfo(userId);

    if (existing) {
      // Update existing record
      const [updated] = await this.db
        .update(cartProjectInfo)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(cartProjectInfo.userId, userId))
        .returning();
      return updated;
    } else {
      // Create new record
      const [newProjectInfo] = await this.db
        .insert(cartProjectInfo)
        .values({
          userId,
          ...data,
        })
        .returning();
      return newProjectInfo;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Customer companies / Projects / Project contacts
  //
  // The opportunity model. Sales reps build up a library of customers
  // (Dnata, Emirates Flight Catering, …), start projects against them,
  // and attach per-project contacts with roles. Everything downstream
  // (Order Form, Layout Drawing title block, Site Survey client
  // block) reads defaults from the active project.
  // ─────────────────────────────────────────────────────────────

  async listCustomerCompanies(userId: string): Promise<CustomerCompany[]> {
    return await this.db
      .select()
      .from(customerCompanies)
      .where(eq(customerCompanies.userId, userId))
      .orderBy(customerCompanies.name);
  }

  async getCustomerCompany(id: string): Promise<CustomerCompany | undefined> {
    const [row] = await this.db
      .select()
      .from(customerCompanies)
      .where(eq(customerCompanies.id, id));
    return row;
  }

  async createCustomerCompany(data: InsertCustomerCompany): Promise<CustomerCompany> {
    const [row] = await this.db
      .insert(customerCompanies)
      .values(data)
      .returning();
    return row;
  }

  async updateCustomerCompany(id: string, data: Partial<InsertCustomerCompany>): Promise<CustomerCompany> {
    const [row] = await this.db
      .update(customerCompanies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customerCompanies.id, id))
      .returning();
    return row;
  }

  async listProjects(userId: string): Promise<Project[]> {
    return await this.db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.lastAccessedAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id));
    return row;
  }

  async getProjectWithDetails(id: string): Promise<(Project & { customerCompany: CustomerCompany | null; contacts: ProjectContact[] }) | undefined> {
    const project = await this.getProject(id);
    if (!project) return undefined;
    const [customer, contactsList] = await Promise.all([
      project.customerCompanyId ? this.getCustomerCompany(project.customerCompanyId) : Promise.resolve(undefined),
      this.listProjectContacts(id),
    ]);
    return {
      ...project,
      customerCompany: customer || null,
      contacts: contactsList,
    };
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [row] = await this.db.insert(projects).values(data).returning();
    return row;
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<Project> {
    const [row] = await this.db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return row;
  }

  async touchProjectAccess(id: string): Promise<void> {
    await this.db
      .update(projects)
      .set({ lastAccessedAt: new Date() })
      .where(eq(projects.id, id));
  }

  async listProjectContacts(projectId: string): Promise<ProjectContact[]> {
    return await this.db
      .select()
      .from(projectContacts)
      .where(eq(projectContacts.projectId, projectId))
      .orderBy(desc(projectContacts.lastInteractedAt), projectContacts.name);
  }

  async createProjectContact(data: InsertProjectContact): Promise<ProjectContact> {
    const [row] = await this.db.insert(projectContacts).values(data).returning();
    return row;
  }

  async updateProjectContact(id: string, data: Partial<InsertProjectContact>): Promise<ProjectContact> {
    const [row] = await this.db
      .update(projectContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectContacts.id, id))
      .returning();
    return row;
  }

  async deleteProjectContact(id: string): Promise<void> {
    await this.db.delete(projectContacts).where(eq(projectContacts.id, id));
  }

  // ─────────────────────────────────────────────────────────────
  // Project collaboration (shared access)
  // ─────────────────────────────────────────────────────────────

  // Access check: true when userId is the owner OR an accepted collaborator
  // at the given role level or above. Used by API-route middleware.
  async canAccessProject(
    projectId: string,
    userId: string,
    minRole: "viewer" | "editor" | "owner" = "viewer",
  ): Promise<{ allowed: boolean; role: "owner" | "editor" | "viewer" | null }> {
    const roleRank = { viewer: 0, editor: 1, owner: 2 };
    // Check ownership first — no table hit needed in the common case.
    const [proj] = await this.db
      .select({ id: projects.id, userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!proj) return { allowed: false, role: null };
    if (proj.userId === userId) return { allowed: true, role: "owner" };

    const [collab] = await this.db
      .select()
      .from(projectCollaborators)
      .where(
        and(
          eq(projectCollaborators.projectId, projectId),
          eq(projectCollaborators.userId, userId),
        ),
      );
    if (!collab || !collab.acceptedAt) return { allowed: false, role: null };
    const role = collab.role as "owner" | "editor" | "viewer";
    return { allowed: roleRank[role] >= roleRank[minRole], role };
  }

  // Return every projectId the user can see (owner + collaborator), used to
  // filter project lists + cascade to orders/surveys/drawings lookups.
  async accessibleProjectIds(userId: string): Promise<string[]> {
    const owned = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, userId));
    const shared = await this.db
      .select({ id: projectCollaborators.projectId })
      .from(projectCollaborators)
      .where(eq(projectCollaborators.userId, userId));
    const set = new Set<string>();
    owned.forEach((r) => set.add(r.id));
    shared.forEach((r) => set.add(r.id));
    return Array.from(set);
  }

  async listCollaborators(projectId: string): Promise<Array<{
    id: string;
    userId: string;
    role: string;
    invitedBy: string | null;
    invitedAt: Date | null;
    acceptedAt: Date | null;
    user: { id: string; email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  }>> {
    const rows = await this.db
      .select({
        id: projectCollaborators.id,
        userId: projectCollaborators.userId,
        role: projectCollaborators.role,
        invitedBy: projectCollaborators.invitedBy,
        invitedAt: projectCollaborators.invitedAt,
        acceptedAt: projectCollaborators.acceptedAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
      .from(projectCollaborators)
      .leftJoin(users, eq(users.id, projectCollaborators.userId))
      .where(eq(projectCollaborators.projectId, projectId))
      .orderBy(projectCollaborators.invitedAt);
    return rows as any;
  }

  async addCollaborator(input: {
    projectId: string;
    userId: string;
    role: "owner" | "editor" | "viewer";
    invitedBy: string;
  }): Promise<any> {
    // Upsert by (projectId, userId) — if the pair already exists, update the
    // role instead of erroring. Accepting immediately (instant-grant model).
    const existing = await this.db
      .select()
      .from(projectCollaborators)
      .where(
        and(
          eq(projectCollaborators.projectId, input.projectId),
          eq(projectCollaborators.userId, input.userId),
        ),
      );
    if (existing[0]) {
      const [row] = await this.db
        .update(projectCollaborators)
        .set({
          role: input.role,
          updatedAt: new Date(),
          acceptedAt: existing[0].acceptedAt ?? new Date(),
        })
        .where(eq(projectCollaborators.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(projectCollaborators)
      .values({
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        invitedBy: input.invitedBy,
        acceptedAt: new Date(),
      })
      .returning();
    return row;
  }

  async removeCollaborator(projectId: string, userId: string): Promise<boolean> {
    const res = await this.db
      .delete(projectCollaborators)
      .where(
        and(
          eq(projectCollaborators.projectId, projectId),
          eq(projectCollaborators.userId, userId),
        ),
      )
      .returning({ id: projectCollaborators.id });
    return res.length > 0;
  }

  async updateCollaboratorRole(
    projectId: string,
    userId: string,
    role: "owner" | "editor" | "viewer",
  ): Promise<boolean> {
    const res = await this.db
      .update(projectCollaborators)
      .set({ role, updatedAt: new Date() })
      .where(
        and(
          eq(projectCollaborators.projectId, projectId),
          eq(projectCollaborators.userId, userId),
        ),
      )
      .returning({ id: projectCollaborators.id });
    return res.length > 0;
  }

  // Lightweight user picker: every user except the caller. Used by the
  // "Add collaborator" modal. Excludes inactive accounts and de-dupes
  // users who are already collaborators on the target project so the
  // picker doesn't offer someone who's already on the team.
  async listShareableUsers(opts: {
    excludeUserId: string;
    excludeProjectId?: string;
    query?: string;
  }): Promise<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null }>> {
    const q = (opts.query || "").trim().toLowerCase();
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users);
    const excluded = new Set<string>([opts.excludeUserId]);
    if (opts.excludeProjectId) {
      const existing = await this.db
        .select({ userId: projectCollaborators.userId })
        .from(projectCollaborators)
        .where(eq(projectCollaborators.projectId, opts.excludeProjectId));
      existing.forEach((r) => excluded.add(r.userId));
      // Also exclude the project owner.
      const [owner] = await this.db
        .select({ userId: projects.userId })
        .from(projects)
        .where(eq(projects.id, opts.excludeProjectId));
      if (owner) excluded.add(owner.userId);
    }
    return rows
      .filter((u) => !excluded.has(u.id))
      .filter((u) => {
        if (!q) return true;
        const blob = `${u.email ?? ""} ${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 50);
  }

  async setActiveProject(userId: string, projectId: string | null): Promise<void> {
    await this.db
      .update(users)
      .set({ activeProjectId: projectId as any, updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (projectId) {
      await this.touchProjectAccess(projectId);
    }
  }

  // Backward-compat: reps who used cartProjectInfo pre-projects-model
  // have a loose "company + location + logo" record. On first access
  // after this deploy, mint a real customer_company + project for them
  // so the UI has something to hand. This only runs if they have NO
  // projects yet and cartProjectInfo is populated.
  async getOrSeedActiveProject(
    userId: string,
  ): Promise<(Project & { customerCompany: CustomerCompany | null; contacts: ProjectContact[] }) | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    // Fast path — user already has an active project.
    if ((user as any).activeProjectId) {
      const full = await this.getProjectWithDetails((user as any).activeProjectId);
      if (full) return full;
      // Orphaned ref — clear it and fall through to re-seed logic.
      await this.setActiveProject(userId, null);
    }

    // Next — pick their most-recently-accessed project if any.
    const existing = await this.listProjects(userId);
    if (existing.length > 0) {
      await this.setActiveProject(userId, existing[0].id);
      return (await this.getProjectWithDetails(existing[0].id)) || null;
    }

    // Lazy seed from cartProjectInfo so the UI has context day-one.
    const legacy = await this.getCartProjectInfo(userId);
    if (legacy && (legacy.company || legacy.location)) {
      let company: CustomerCompany | undefined;
      if (legacy.company) {
        company = await this.createCustomerCompany({
          userId,
          name: legacy.company,
          logoUrl: (legacy as any).companyLogoUrl || null,
        } as any);
      }
      const project = await this.createProject({
        userId,
        customerCompanyId: company?.id || null,
        name: legacy.company || "Unnamed project",
        location: legacy.location || null,
        description: (legacy as any).projectDescription || null,
        status: "active",
      } as any);
      await this.setActiveProject(userId, project.id);
      return (await this.getProjectWithDetails(project.id)) || null;
    }

    return null;
  }

  // Alias for saveCartProjectInfo to match the expected interface
  async upsertCartProjectInfo(data: InsertCartProjectInfo): Promise<CartProjectInfo> {
    // Extract userId from the data and call saveCartProjectInfo
    const { userId, ...rest } = data;
    return this.saveCartProjectInfo(userId, rest);
  }

  // Project Case Study operations
  async getProjectCaseStudies(userId: string): Promise<ProjectCaseStudy[]> {
    return await this.db
      .select()
      .from(projectCaseStudies)
      .where(eq(projectCaseStudies.userId, userId))
      .orderBy(desc(projectCaseStudies.createdAt));
  }

  async updateProjectCaseStudies(userId: string, caseStudyIds: string[]): Promise<ProjectCaseStudy[]> {
    // Delete existing selections
    await this.db
      .delete(projectCaseStudies)
      .where(eq(projectCaseStudies.userId, userId));
    
    // If no case studies selected, return empty array
    if (caseStudyIds.length === 0) {
      return [];
    }
    
    // Insert new selections
    const newSelections = await this.db
      .insert(projectCaseStudies)
      .values(
        caseStudyIds.map(caseStudyId => ({
          userId,
          caseStudyId,
        }))
      )
      .returning();
    
    return newSelections;
  }

  // Layout Drawing operations
  async getLayoutDrawings(userId: string): Promise<LayoutDrawing[]> {
    return await this.db
      .select()
      .from(layoutDrawings)
      .where(and(
        eq(layoutDrawings.userId, userId),
        isNull(layoutDrawings.deletedAt)
      ))
      .orderBy(desc(layoutDrawings.createdAt));
  }

  async getLayoutDrawing(id: string): Promise<LayoutDrawing | undefined> {
    const [drawing] = await this.db
      .select()
      .from(layoutDrawings)
      .where(and(
        eq(layoutDrawings.id, id),
        isNull(layoutDrawings.deletedAt)
      ));
    return drawing;
  }

  async createLayoutDrawing(drawing: { 
    userId: string; 
    projectName?: string; 
    company?: string; 
    location?: string; 
    fileName: string; 
    fileUrl: string; 
    fileType: string; 
    thumbnailUrl?: string 
  }): Promise<LayoutDrawing> {
    const [newDrawing] = await this.db
      .insert(layoutDrawings)
      .values(drawing)
      .returning();
    return newDrawing;
  }

  // Soft delete layout drawing (move to trash)
  async deleteLayoutDrawing(id: string): Promise<void> {
    const now = new Date();
    
    // First soft delete all associated markups
    await this.db
      .update(layoutMarkups)
      .set({ deletedAt: now })
      .where(eq(layoutMarkups.layoutDrawingId, id));
    
    // Then soft delete the drawing
    await this.db
      .update(layoutDrawings)
      .set({ deletedAt: now })
      .where(eq(layoutDrawings.id, id));
  }

  // Get trashed layout drawings
  async getTrashedLayoutDrawings(userId: string): Promise<LayoutDrawing[]> {
    return await this.db
      .select()
      .from(layoutDrawings)
      .where(and(
        eq(layoutDrawings.userId, userId),
        isNotNull(layoutDrawings.deletedAt)
      ))
      .orderBy(desc(layoutDrawings.deletedAt));
  }

  // Restore layout drawing from trash
  async restoreLayoutDrawing(id: string): Promise<void> {
    // Restore the drawing
    await this.db
      .update(layoutDrawings)
      .set({ deletedAt: null })
      .where(eq(layoutDrawings.id, id));
    
    // Restore all associated markups
    await this.db
      .update(layoutMarkups)
      .set({ deletedAt: null })
      .where(eq(layoutMarkups.layoutDrawingId, id));
  }

  // Permanently delete layout drawing
  async permanentlyDeleteLayoutDrawing(id: string): Promise<void> {
    // First delete all associated markups permanently
    await this.db
      .delete(layoutMarkups)
      .where(eq(layoutMarkups.layoutDrawingId, id));
    
    // Then delete the drawing permanently
    await this.db
      .delete(layoutDrawings)
      .where(eq(layoutDrawings.id, id));
  }

  // Update layout drawing scale
  async updateLayoutDrawingScale(id: string, scaleData: { 
    scale?: number; 
    scaleLine?: any; 
    isScaleSet?: boolean 
  }): Promise<LayoutDrawing> {
    const [updatedDrawing] = await this.db
      .update(layoutDrawings)
      .set({
        scale: scaleData.scale,
        scaleLine: scaleData.scaleLine,
        isScaleSet: scaleData.isScaleSet,
        updatedAt: new Date()
      })
      .where(eq(layoutDrawings.id, id))
      .returning();
    return updatedDrawing;
  }

  // Update layout drawing title
  async updateLayoutDrawingTitle(id: string, fileName: string): Promise<LayoutDrawing> {
    const [updatedDrawing] = await this.db
      .update(layoutDrawings)
      .set({
        fileName: fileName,
        updatedAt: new Date()
      })
      .where(eq(layoutDrawings.id, id))
      .returning();
    return updatedDrawing;
  }

  /**
   * Partial update on a layout drawing record. Used by the title-block
   * editor to persist any subset of the frame metadata (dwg no / revision /
   * author / etc) without wiping adjacent fields.
   */
  async updateLayoutDrawing(id: string, patch: Partial<LayoutDrawing>): Promise<LayoutDrawing> {
    const [updated] = await this.db
      .update(layoutDrawings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(layoutDrawings.id, id))
      .returning();
    return updated;
  }

  // Layout Markup operations
  async getLayoutMarkups(layoutDrawingId: string): Promise<LayoutMarkup[]> {
    return await this.db
      .select()
      .from(layoutMarkups)
      .where(and(
        eq(layoutMarkups.layoutDrawingId, layoutDrawingId),
        isNull(layoutMarkups.deletedAt)
      ))
      .orderBy(desc(layoutMarkups.createdAt));
  }

  async createLayoutMarkup(markup: { 
    layoutDrawingId: string; 
    cartItemId?: string; 
    productName?: string; 
    xPosition: number; 
    yPosition: number; 
    endX?: number; 
    endY?: number; 
    pathData?: string; 
    comment?: string;
    calculatedLength?: number 
  }): Promise<LayoutMarkup> {
    const [newMarkup] = await this.db
      .insert(layoutMarkups)
      .values(markup)
      .returning();
    return newMarkup;
  }

  async updateLayoutMarkup(id: string, updates: { 
    cartItemId?: string; 
    productName?: string; 
    xPosition?: number; 
    yPosition?: number; 
    endX?: number; 
    endY?: number; 
    pathData?: string; 
    comment?: string;
    calculatedLength?: number 
  }): Promise<LayoutMarkup> {
    const [updatedMarkup] = await this.db
      .update(layoutMarkups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(layoutMarkups.id, id))
      .returning();
    return updatedMarkup;
  }

  // Soft delete layout markup
  async deleteLayoutMarkup(id: string): Promise<void> {
    await this.db
      .update(layoutMarkups)
      .set({ deletedAt: new Date() })
      .where(eq(layoutMarkups.id, id));
  }

  // Restore layout markup
  async restoreLayoutMarkup(id: string): Promise<void> {
    await this.db
      .update(layoutMarkups)
      .set({ deletedAt: null })
      .where(eq(layoutMarkups.id, id));
  }

  // Permanently delete layout markup
  async permanentlyDeleteLayoutMarkup(id: string): Promise<void> {
    await this.db
      .delete(layoutMarkups)
      .where(eq(layoutMarkups.id, id));
  }

  // Draft Project operations
  async getUserDraftProjects(userId: string): Promise<DraftProject[]> {
    return await this.db
      .select()
      .from(draftProjects)
      .where(eq(draftProjects.userId, userId))
      .orderBy(desc(draftProjects.updatedAt));
  }

  async getDraftProject(id: string): Promise<DraftProject | undefined> {
    const [draft] = await this.db.select().from(draftProjects).where(eq(draftProjects.id, id));
    return draft;
  }

  async createDraftProject(draft: InsertDraftProject): Promise<DraftProject> {
    const [newDraft] = await this.db.insert(draftProjects).values(draft).returning();
    return newDraft;
  }

  async updateDraftProject(id: string, updates: Partial<InsertDraftProject>): Promise<DraftProject> {
    const [updatedDraft] = await this.db
      .update(draftProjects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(draftProjects.id, id))
      .returning();
    return updatedDraft;
  }

  async deleteDraftProject(id: string): Promise<void> {
    await this.db.delete(draftProjects).where(eq(draftProjects.id, id));
  }

  // OTP operations
  async generateAndStoreOtp(userId: string): Promise<{ otpCode: string; expiryTime: Date }> {
    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiry time (10 minutes from now)
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 10);
    
    // Store OTP in database
    await this.db
      .update(users)
      .set({
        otpCode,
        otpExpiry: expiryTime,
        otpAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    return { otpCode, expiryTime };
  }

  async verifyOtp(userId: string, otpCode: string): Promise<{ success: boolean; attempts: number; maxAttemptsReached: boolean }> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    
    if (!user || !user.otpCode || !user.otpExpiry) {
      return { success: false, attempts: 0, maxAttemptsReached: false };
    }

    // Check if OTP has expired
    if (new Date() > user.otpExpiry) {
      // Clear expired OTP
      await this.db
        .update(users)
        .set({
          otpCode: null,
          otpExpiry: null,
          otpAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      
      return { success: false, attempts: user.otpAttempts || 0, maxAttemptsReached: false };
    }

    // Increment attempts
    const newAttempts = (user.otpAttempts || 0) + 1;
    const maxAttemptsReached = newAttempts >= 3;

    // Check if max attempts reached
    if (maxAttemptsReached) {
      // Clear OTP after max attempts
      await this.db
        .update(users)
        .set({
          otpCode: null,
          otpExpiry: null,
          otpAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      
      return { success: false, attempts: newAttempts, maxAttemptsReached: true };
    }

    // Check if OTP matches
    const success = user.otpCode === otpCode;
    
    if (success) {
      // Clear OTP on successful verification
      await this.db
        .update(users)
        .set({
          otpCode: null,
          otpExpiry: null,
          otpAttempts: 0,
          phoneVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      // Update attempts
      await this.db
        .update(users)
        .set({
          otpAttempts: newAttempts,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return { success, attempts: newAttempts, maxAttemptsReached };
  }

  async markPhoneAsVerified(userId: string): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set({
        phoneVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  // Chat operations
  async getChatConversations(userId: string): Promise<ChatConversation[]> {
    return await this.db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(desc(chatConversations.updatedAt));
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    const [newConversation] = await this.db
      .insert(chatConversations)
      .values(conversation)
      .returning();
    return newConversation;
  }

  async deleteChatConversation(conversationId: string, userId: string): Promise<void> {
    // Delete all messages in the conversation first
    await this.db
      .delete(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId));
    
    // Delete the conversation
    await this.db
      .delete(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId)
        )
      );
  }

  async getChatMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
    // First verify the conversation belongs to the user
    const conversation = await this.db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId)
        )
      )
      .limit(1);
    
    if (conversation.length === 0) {
      throw new Error('Conversation not found or access denied');
    }
    
    return await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await this.db
      .insert(chatMessages)
      .values(message)
      .returning();
    
    // Update conversation's updatedAt timestamp
    await this.db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, message.conversationId));
    
    return newMessage;
  }

  // Solution Request operations
  async getSolutionRequestsByUser(userId: string): Promise<SolutionRequest[]> {
    return await this.db
      .select()
      .from(solutionRequests)
      .where(eq(solutionRequests.userId, userId))
      .orderBy(desc(solutionRequests.createdAt));
  }

  async getSolutionRequest(id: string, userId: string): Promise<SolutionRequest | undefined> {
    const [request] = await this.db
      .select()
      .from(solutionRequests)
      .where(
        and(
          eq(solutionRequests.id, id),
          eq(solutionRequests.userId, userId)
        )
      );
    return request;
  }

  async createSolutionRequest(request: InsertSolutionRequest): Promise<SolutionRequest> {
    const [newRequest] = await this.db
      .insert(solutionRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async updateSolutionRequest(id: string, updates: Partial<InsertSolutionRequest>): Promise<SolutionRequest> {
    const [updatedRequest] = await this.db
      .update(solutionRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(solutionRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async deleteSolutionRequest(id: string, userId: string): Promise<void> {
    await this.db
      .delete(solutionRequests)
      .where(
        and(
          eq(solutionRequests.id, id),
          eq(solutionRequests.userId, userId)
        )
      );
  }

  // Notification System implementation
  async getUserNotifications(userId: string, limit = 50): Promise<Notification[]> {
    return await this.db.select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotifications(userId: string): Promise<Notification[]> {
    return await this.db.select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await this.db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await this.db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await this.db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string): Promise<void> {
    await this.db.delete(notifications).where(eq(notifications.id, id));
  }

  // Messaging System implementation
  async getUserConversations(userId: string): Promise<Conversation[]> {
    return await this.db.select({
      id: conversations.id,
      type: conversations.type,
      title: conversations.title,
      description: conversations.description,
      metadata: conversations.metadata,
      isActive: conversations.isActive,
      createdBy: conversations.createdBy,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .innerJoin(conversationParticipants, eq(conversations.id, conversationParticipants.conversationId))
    .where(and(
      eq(conversationParticipants.userId, userId),
      eq(conversationParticipants.isActive, true),
      eq(conversations.isActive, true)
    ))
    .orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await this.db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [created] = await this.db.insert(conversations).values(conversation).returning();
    return created;
  }

  async updateConversation(id: string, updates: Partial<InsertConversation>): Promise<Conversation> {
    const [updated] = await this.db.update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  async getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]> {
    return await this.db.select()
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.isActive, true)
      ));
  }

  async addConversationParticipant(conversationId: string, userId: string, role = "participant"): Promise<ConversationParticipant> {
    const [participant] = await this.db.insert(conversationParticipants).values({
      conversationId,
      userId,
      role,
    }).returning();
    return participant;
  }

  async removeConversationParticipant(conversationId: string, userId: string): Promise<void> {
    await this.db.update(conversationParticipants)
      .set({ isActive: false })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ));
  }

  async getConversationMessages(conversationId: string, limit = 50, offset = 0): Promise<Message[]> {
    return await this.db.select()
      .from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        eq(messages.isDeleted, false)
      ))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const result = await this.db.insert(messages).values(message).returning();
    const created = (result as Message[])[0];

    // Update conversation timestamp
    if (message.conversationId) {
      await this.db.update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, String(message.conversationId)));
    }

    return created;
  }

  async updateMessage(id: string, content: string): Promise<Message> {
    const [updated] = await this.db.update(messages)
      .set({ content, isEdited: true, editedAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    return updated;
  }

  async deleteMessage(id: string): Promise<void> {
    await this.db.update(messages)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(messages.id, id));
  }

  async getMessageReactions(messageId: string): Promise<MessageReaction[]> {
    return await this.db.select().from(messageReactions).where(eq(messageReactions.messageId, messageId));
  }

  async addMessageReaction(messageId: string, userId: string, emoji: string): Promise<MessageReaction> {
    // Remove existing reaction from this user for this message
    await this.db.delete(messageReactions)
      .where(and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId)
      ));
    
    // Add new reaction
    const [reaction] = await this.db.insert(messageReactions).values({
      messageId,
      userId,
      emoji,
    }).returning();
    return reaction;
  }

  async removeMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    await this.db.delete(messageReactions)
      .where(and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji)
      ));
  }


  async getUserSafetyMetrics(userId: string, metricType?: string): Promise<SafetyMetric[]> {
    const whereConditions = [eq(safetyMetrics.userId, userId)];
    
    if (metricType) {
      whereConditions.push(eq(safetyMetrics.metricType, metricType));
    }
    
    return await this.db.select()
      .from(safetyMetrics)
      .where(and(...whereConditions))
      .orderBy(desc(safetyMetrics.createdAt));
  }

  async createSafetyMetric(metric: InsertSafetyMetric): Promise<SafetyMetric> {
    const [created] = await this.db.insert(safetyMetrics).values(metric).returning();
    return created;
  }

  async updateSafetyMetric(id: string, updates: Partial<InsertSafetyMetric>): Promise<SafetyMetric> {
    const [updated] = await this.db.update(safetyMetrics)
      .set(updates)
      .where(eq(safetyMetrics.id, id))
      .returning();
    return updated;
  }

  // Compliance implementation
  async getComplianceChecks(userId: string, region?: string): Promise<ComplianceCheck[]> {
    const whereConditions = [eq(complianceChecks.userId, userId)];
    
    if (region) {
      whereConditions.push(eq(complianceChecks.region, region));
    }
    
    return await this.db.select()
      .from(complianceChecks)
      .where(and(...whereConditions))
      .orderBy(desc(complianceChecks.lastChecked));
  }

  async createComplianceCheck(check: InsertComplianceCheck): Promise<ComplianceCheck> {
    const [created] = await this.db.insert(complianceChecks).values(check).returning();
    return created;
  }

  async updateComplianceStatus(id: string, status: string, findings?: any, recommendations?: any): Promise<ComplianceCheck> {
    const [updated] = await this.db.update(complianceChecks)
      .set({ 
        complianceStatus: status, 
        findings, 
        recommendations,
        lastChecked: new Date()
      })
      .where(eq(complianceChecks.id, id))
      .returning();
    return updated;
  }

  // Smart Reordering implementation
  async getSmartReorders(userId: string, status?: string): Promise<SmartReorder[]> {
    const whereConditions = [eq(smartReorders.userId, userId)];
    
    if (status) {
      whereConditions.push(eq(smartReorders.status, status));
    }
    
    return await this.db.select()
      .from(smartReorders)
      .where(and(...whereConditions))
      .orderBy(desc(smartReorders.predictedReorderDate));
  }

  async createSmartReorder(reorder: InsertSmartReorder): Promise<SmartReorder> {
    const [created] = await this.db.insert(smartReorders).values(reorder).returning();
    return created;
  }

  async updateSmartReorder(id: string, updates: Partial<InsertSmartReorder>): Promise<SmartReorder> {
    const [updated] = await this.db.update(smartReorders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(smartReorders.id, id))
      .returning();
    return updated;
  }

  async processSmartReorders(): Promise<void> {
    // Process pending smart reorders and create notifications
    const pendingReorders = await this.db.select()
      .from(smartReorders)
      .where(and(
        eq(smartReorders.status, "pending"),
        lte(smartReorders.predictedReorderDate, new Date()),
        eq(smartReorders.notificationSent, false)
      ));

    for (const reorder of pendingReorders) {
      // Create notification
      await this.createNotification({
        userId: reorder.userId,
        type: "smart_reorder",
        title: "Smart Reorder Recommendation",
        message: `Time to reorder ${reorder.recommendedQuantity} units based on your usage patterns`,
        data: { smartReorderId: reorder.id, productId: reorder.productId },
        priority: reorder.priority as any,
      });

      // Mark notification as sent
      await this.updateSmartReorder(reorder.id, { notificationSent: true });
    }
  }

  // Training implementation  
  async getTrainingModules(category?: string, difficulty?: string): Promise<TrainingModule[]> {
    const whereConditions = [eq(trainingModules.isPublished, true)];
    
    if (category) {
      whereConditions.push(eq(trainingModules.category, category));
    }
    
    if (difficulty) {
      whereConditions.push(eq(trainingModules.difficulty, difficulty));
    }
    
    return await this.db.select()
      .from(trainingModules)
      .where(and(...whereConditions))
      .orderBy(trainingModules.title);
  }

  async getTrainingModule(id: string): Promise<TrainingModule | undefined> {
    const [module] = await this.db.select().from(trainingModules).where(eq(trainingModules.id, id));
    return module;
  }

  async createTrainingModule(module: InsertTrainingModule): Promise<TrainingModule> {
    const [created] = await this.db.insert(trainingModules).values(module).returning();
    return created;
  }

  async updateTrainingModule(id: string, updates: Partial<InsertTrainingModule>): Promise<TrainingModule> {
    const [updated] = await this.db.update(trainingModules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(trainingModules.id, id))
      .returning();
    return updated;
  }

  async getUserTrainingProgress(userId: string, moduleId?: string): Promise<UserTrainingProgress[]> {
    const whereConditions = [eq(userTrainingProgress.userId, userId)];
    
    if (moduleId) {
      whereConditions.push(eq(userTrainingProgress.moduleId, moduleId));
    }
    
    return await this.db.select()
      .from(userTrainingProgress)
      .where(and(...whereConditions))
      .orderBy(desc(userTrainingProgress.updatedAt));
  }

  async updateTrainingProgress(userId: string, moduleId: string, progressPercentage: number, timeSpent: number): Promise<UserTrainingProgress> {
    const existing = await this.db.select()
      .from(userTrainingProgress)
      .where(and(
        eq(userTrainingProgress.userId, userId),
        eq(userTrainingProgress.moduleId, moduleId)
      ));

    if (existing.length > 0) {
      const [updated] = await this.db.update(userTrainingProgress)
        .set({ 
          progressPercentage,
          timeSpent: (existing[0].timeSpent ?? 0) + timeSpent,
          status: progressPercentage >= 100 ? "completed" : "in_progress",
          updatedAt: new Date()
        })
        .where(eq(userTrainingProgress.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await this.db.insert(userTrainingProgress).values({
        userId,
        moduleId,
        progressPercentage,
        timeSpent,
        status: progressPercentage >= 100 ? "completed" : "in_progress",
      }).returning();
      return created;
    }
  }

  async completeTraining(userId: string, moduleId: string, score?: number): Promise<UserTrainingProgress> {
    const [updated] = await this.db.update(userTrainingProgress)
      .set({ 
        status: "completed",
        progressPercentage: 100,
        score,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(userTrainingProgress.userId, userId),
        eq(userTrainingProgress.moduleId, moduleId)
      ))
      .returning();
    return updated;
  }

  // Forum implementation
  async getForumCategories(): Promise<ForumCategory[]> {
    return await this.db.select()
      .from(forumCategories)
      .where(eq(forumCategories.isActive, true))
      .orderBy(forumCategories.sortOrder, forumCategories.name);
  }

  async getForumCategory(id: string): Promise<ForumCategory | undefined> {
    const [category] = await this.db.select().from(forumCategories).where(eq(forumCategories.id, id));
    return category;
  }

  async getForumTopics(categoryId: string, limit = 20, offset = 0): Promise<ForumTopic[]> {
    return await this.db.select()
      .from(forumTopics)
      .where(eq(forumTopics.categoryId, categoryId))
      .orderBy(desc(forumTopics.isPinned), desc(forumTopics.lastReplyAt))
      .limit(limit)
      .offset(offset);
  }

  async getForumTopic(id: string): Promise<ForumTopic | undefined> {
    const [topic] = await this.db.select().from(forumTopics).where(eq(forumTopics.id, id));
    return topic;
  }

  async createForumTopic(topic: InsertForumTopic): Promise<ForumTopic> {
    const [created] = await this.db.insert(forumTopics).values(topic).returning();
    return created;
  }

  async updateForumTopic(id: string, updates: Partial<InsertForumTopic>): Promise<ForumTopic> {
    const [updated] = await this.db.update(forumTopics)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(forumTopics.id, id))
      .returning();
    return updated;
  }

  async incrementTopicViews(id: string): Promise<void> {
    await this.db.update(forumTopics)
      .set({ viewCount: sql`${forumTopics.viewCount} + 1` })
      .where(eq(forumTopics.id, id));
  }

  async getForumReplies(topicId: string, limit = 20, offset = 0): Promise<ForumReply[]> {
    return await this.db.select()
      .from(forumReplies)
      .where(eq(forumReplies.topicId, topicId))
      .orderBy(forumReplies.createdAt)
      .limit(limit)
      .offset(offset);
  }

  async createForumReply(reply: Omit<ForumReply, 'id' | 'createdAt'>): Promise<ForumReply> {
    const result = await this.db.insert(forumReplies).values(reply).returning();
    const created = (result as ForumReply[])[0];
    
    // Update topic reply count and last reply info
    await this.db.update(forumTopics)
      .set({ 
        replyCount: sql`${forumTopics.replyCount} + 1`,
        lastReplyAt: new Date(),
        lastReplyBy: reply.authorId,
        updatedAt: new Date()
      })
      .where(eq(forumTopics.id, reply.topicId));
    
    return created;
  }

  async updateForumReply(id: string, content: string): Promise<ForumReply> {
    const [updated] = await this.db.update(forumReplies)
      .set({ content, isEdited: true, editedAt: new Date() })
      .where(eq(forumReplies.id, id))
      .returning();
    return updated;
  }

  async likeForumReply(id: string): Promise<void> {
    await this.db.update(forumReplies)
      .set({ likeCount: sql`${forumReplies.likeCount} + 1` })
      .where(eq(forumReplies.id, id));
  }

  async markReplyAsAnswer(id: string): Promise<void> {
    const [reply] = await this.db.select().from(forumReplies).where(eq(forumReplies.id, id));
    
    if (reply) {
      // First, unmark any existing accepted answers
      await this.db.update(forumReplies)
        .set({ isAcceptedAnswer: false })
        .where(eq(forumReplies.topicId, reply.topicId));
      
      // Mark this reply as the accepted answer
      await this.db.update(forumReplies)
        .set({ isAcceptedAnswer: true })
        .where(eq(forumReplies.id, id));
    }
  }

  // Business Intelligence implementation
  async getMarketTrends(region?: string, industry?: string, isPublic?: boolean): Promise<MarketTrend[]> {
    const conditions: (SQL | undefined)[] = [];
    if (region) conditions.push(eq(marketTrends.region, region));
    if (industry) conditions.push(eq(marketTrends.industry, industry));
    if (isPublic !== undefined) conditions.push(eq(marketTrends.isPublic, isPublic));

    const query = conditions.length > 0
      ? this.db.select().from(marketTrends).where(and(...conditions))
      : this.db.select().from(marketTrends);

    return await query.orderBy(desc(marketTrends.publishedAt));
  }

  async getMarketTrend(id: string): Promise<MarketTrend | undefined> {
    const [trend] = await this.db.select().from(marketTrends).where(eq(marketTrends.id, id));
    return trend;
  }

  async createMarketTrend(trend: InsertMarketTrend): Promise<MarketTrend> {
    const [created] = await this.db.insert(marketTrends).values(trend).returning();
    return created;
  }

  async updateMarketTrend(id: string, updates: Partial<InsertMarketTrend>): Promise<MarketTrend> {
    const [updated] = await this.db.update(marketTrends)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(marketTrends.id, id))
      .returning();
    return updated;
  }

  async getUserContracts(userId: string, status?: string): Promise<Contract[]> {
    const whereConditions = [eq(contracts.userId, userId)];
    
    if (status) {
      whereConditions.push(eq(contracts.status, status));
    }
    
    return await this.db.select()
      .from(contracts)
      .where(and(...whereConditions))
      .orderBy(desc(contracts.createdAt));
  }

  async getContract(id: string): Promise<Contract | undefined> {
    const [contract] = await this.db.select().from(contracts).where(eq(contracts.id, id));
    return contract;
  }

  async createContract(contract: InsertContract): Promise<Contract> {
    const [created] = await this.db.insert(contracts).values(contract).returning();
    return created;
  }

  async updateContract(id: string, updates: Partial<InsertContract>): Promise<Contract> {
    const [updated] = await this.db.update(contracts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();
    return updated;
  }

  async getExpiringContracts(daysFromNow: number): Promise<Contract[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysFromNow);
    
    return await this.db.select()
      .from(contracts)
      .where(and(
        eq(contracts.status, "active"),
        lte(contracts.endDate, futureDate)
      ))
      .orderBy(contracts.endDate);
  }
  
  // Site Survey operations
  async getUserSiteSurveys(userId: string): Promise<SiteSurvey[]> {
    const surveys = await this.db
      .select()
      .from(siteSurveys)
      .where(eq(siteSurveys.userId, userId))
      .orderBy(desc(siteSurveys.createdAt));
      
    // For each survey, calculate statistics from its areas
    const surveysWithStats = await Promise.all(surveys.map(async (survey) => {
      const areas = await this.getSiteSurveyAreas(survey.id);
      
      // Calculate area counts and risk statistics
      const totalAreas = areas.length;
      const impactCalculations = areas.filter(area => area.calculatedJoules !== null).length;
      const criticalConditions = areas.filter(area => area.currentCondition === 'critical').length;
      const damagedConditions = areas.filter(area => area.currentCondition === 'damaged').length;
      const unprotectedConditions = areas.filter(area => area.currentCondition === 'unprotected').length;
      const goodConditions = areas.filter(area => area.currentCondition === 'good').length;
      
      // Count risk levels
      const criticalRisks = areas.filter(area => area.riskLevel === 'critical').length;
      const highRisks = areas.filter(area => area.riskLevel === 'high').length;
      const mediumRisks = areas.filter(area => area.riskLevel === 'medium').length;
      const lowRisks = areas.filter(area => area.riskLevel === 'low').length;
      
      // Determine overall risk level based on highest risks present
      let overallRiskLevel = 'low';
      if (criticalRisks > 0) overallRiskLevel = 'critical';
      else if (highRisks > 0) overallRiskLevel = 'high';
      else if (mediumRisks > 0) overallRiskLevel = 'medium';
      
      return {
        ...survey,
        totalAreasReviewed: totalAreas,
        totalImpactCalculations: impactCalculations,
        overallRiskLevel,
        conditionBreakdown: {
          critical: criticalConditions,
          damaged: damagedConditions,
          unprotected: unprotectedConditions,
          good: goodConditions
        },
        riskBreakdown: {
          critical: criticalRisks,
          high: highRisks,
          medium: mediumRisks,
          low: lowRisks
        }
      };
    }));
    
    return surveysWithStats;
  }

  async getSiteSurvey(id: string): Promise<(SiteSurvey & Record<string, any>) | undefined> {
    const [survey] = await this.db.select().from(siteSurveys).where(eq(siteSurveys.id, id));
    if (!survey) return undefined;
    
    // Update lastViewed timestamp
    await this.db
      .update(siteSurveys)
      .set({ lastViewed: new Date() })
      .where(eq(siteSurveys.id, id));
    
    // Calculate statistics from areas
    const areas = await this.getSiteSurveyAreas(survey.id);
    
    // Calculate area counts and risk statistics
    const totalAreas = areas.length;
    const impactCalculations = areas.filter(area => area.calculatedJoules !== null).length;
    const criticalConditions = areas.filter(area => area.currentCondition === 'critical').length;
    const damagedConditions = areas.filter(area => area.currentCondition === 'damaged').length;
    const unprotectedConditions = areas.filter(area => area.currentCondition === 'unprotected').length;
    const goodConditions = areas.filter(area => area.currentCondition === 'good').length;
    
    // Count risk levels
    const criticalRisks = areas.filter(area => area.riskLevel === 'critical').length;
    const highRisks = areas.filter(area => area.riskLevel === 'high').length;
    const mediumRisks = areas.filter(area => area.riskLevel === 'medium').length;
    const lowRisks = areas.filter(area => area.riskLevel === 'low').length;
    
    // Determine overall risk level based on highest risks present
    let overallRiskLevel = 'low';
    if (criticalRisks > 0) overallRiskLevel = 'critical';
    else if (highRisks > 0) overallRiskLevel = 'high';
    else if (mediumRisks > 0) overallRiskLevel = 'medium';
    
    return {
      ...survey,
      totalAreasReviewed: totalAreas,
      totalImpactCalculations: impactCalculations,
      overallRiskLevel,
      conditionBreakdown: {
        critical: criticalConditions,
        damaged: damagedConditions,
        unprotected: unprotectedConditions,
        good: goodConditions
      },
      riskBreakdown: {
        critical: criticalRisks,
        high: highRisks,
        medium: mediumRisks,
        low: lowRisks
      }
    };
  }

  async createSiteSurvey(survey: InsertSiteSurvey): Promise<SiteSurvey> {
    const [newSurvey] = await this.db.insert(siteSurveys).values(survey).returning();
    return newSurvey;
  }

  async updateSiteSurvey(id: string, updates: Partial<InsertSiteSurvey>): Promise<SiteSurvey> {
    const [updatedSurvey] = await this.db
      .update(siteSurveys)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(siteSurveys.id, id))
      .returning();
    return updatedSurvey;
  }

  async deleteSiteSurvey(id: string): Promise<void> {
    // First delete all areas associated with this survey
    await this.db.delete(siteSurveyAreas).where(eq(siteSurveyAreas.siteSurveyId, id));
    // Then delete the survey
    await this.db.delete(siteSurveys).where(eq(siteSurveys.id, id));
  }

  // Order Form Enhancement Methods



  async getCartItems(userId: string): Promise<CartItem[]> {
    return await this.db
      .select()
      .from(cartItems)
      .where(eq(cartItems.userId, userId))
      .orderBy(desc(cartItems.createdAt));
  }

  async completeSiteSurvey(id: string): Promise<SiteSurvey> {
    // Get survey areas to calculate statistics
    const areas = await this.getSiteSurveyAreas(id);
    const totalAreasReviewed = areas.length;
    const totalIssuesIdentified = areas.filter(area => area.currentCondition !== 'good').length;
    
    // Calculate risk levels
    const criticalAreas = areas.filter(area => area.riskLevel === 'critical').length;
    const highAreas = areas.filter(area => area.riskLevel === 'high').length;
    
    let overallRiskLevel = 'low';
    if (criticalAreas > 0) overallRiskLevel = 'critical';
    else if (highAreas > 0) overallRiskLevel = 'high';
    else if (areas.some(area => area.riskLevel === 'medium')) overallRiskLevel = 'medium';
    
    // Calculate estimated budget
    const estimatedBudgetRequired = areas.reduce((sum, area) => {
      return sum + (parseFloat(area.estimatedCost || '0'));
    }, 0);

    const [updatedSurvey] = await this.db
      .update(siteSurveys)
      .set({
        status: 'completed',
        totalAreasReviewed,
        totalIssuesIdentified,
        overallRiskLevel,
        estimatedBudgetRequired: estimatedBudgetRequired.toString(),
        updatedAt: new Date()
      })
      .where(eq(siteSurveys.id, id))
      .returning();
    
    return updatedSurvey;
  }

  // Site Survey Area operations
  async getSiteSurveyAreas(siteSurveyId: string): Promise<SiteSurveyArea[]> {
    return await this.db
      .select()
      .from(siteSurveyAreas)
      .where(eq(siteSurveyAreas.siteSurveyId, siteSurveyId))
      .orderBy(desc(siteSurveyAreas.createdAt));
  }

  async getSiteSurveyArea(id: string): Promise<SiteSurveyArea | undefined> {
    const [area] = await this.db.select().from(siteSurveyAreas).where(eq(siteSurveyAreas.id, id));
    return area;
  }

  async createSiteSurveyArea(area: InsertSiteSurveyArea): Promise<SiteSurveyArea> {
    const [newArea] = await this.db.insert(siteSurveyAreas).values(area).returning();
    return newArea;
  }

  async updateSiteSurveyArea(id: string, updates: Partial<InsertSiteSurveyArea>): Promise<SiteSurveyArea> {
    const [updatedArea] = await this.db
      .update(siteSurveyAreas)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(siteSurveyAreas.id, id))
      .returning();
    return updatedArea;
  }

  async deleteSiteSurveyArea(id: string): Promise<void> {
    await this.db.delete(siteSurveyAreas).where(eq(siteSurveyAreas.id, id));
  }
  
  // Communication Template operations
  async getCommunicationTemplates(category?: string): Promise<CommunicationTemplate[]> {
    const query = this.db.select().from(communicationTemplates);
    if (category) {
      return await query.where(eq(communicationTemplates.category, category));
    }
    return await query;
  }

  async getCommunicationTemplate(id: string): Promise<CommunicationTemplate | undefined> {
    const [template] = await this.db.select().from(communicationTemplates).where(eq(communicationTemplates.id, id));
    return template;
  }

  async createCommunicationTemplate(template: InsertCommunicationTemplate): Promise<CommunicationTemplate> {
    const [newTemplate] = await this.db.insert(communicationTemplates).values(template).returning();
    return newTemplate;
  }

  // Communication Log operations
  async createCommunicationLog(log: InsertCommunicationLog): Promise<CommunicationLog> {
    const [newLog] = await this.db.insert(communicationLogs).values(log).returning();
    return newLog;
  }

  // Sales Engagement operations
  async getSalesEngagements(salesRepId?: string): Promise<SalesEngagement[]> {
    if (salesRepId) {
      return await this.db.select().from(salesEngagements)
        .where(eq(salesEngagements.salesRepId, salesRepId))
        .orderBy(desc(salesEngagements.createdAt));
    }
    return await this.db.select().from(salesEngagements).orderBy(desc(salesEngagements.createdAt));
  }

  async createSalesEngagement(engagement: InsertSalesEngagement): Promise<SalesEngagement> {
    const [newEngagement] = await this.db.insert(salesEngagements).values(engagement).returning();
    return newEngagement;
  }

  async updateSalesEngagement(id: string, updates: Partial<InsertSalesEngagement>): Promise<SalesEngagement> {
    const [updatedEngagement] = await this.db
      .update(salesEngagements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(salesEngagements.id, id))
      .returning();
    return updatedEngagement;
  }

  // Comprehensive Search Methods
  async searchProducts(query: string): Promise<Product[]> {
    if (!query || query.length < 2) return [];
    
    const searchTerm = `%${query.toLowerCase()}%`;
    
    // Handle common variations
    const normalizedQuery = query
      .toLowerCase()
      .replace(/[\s-_]/g, '') // Remove spaces, hyphens, underscores
      .replace(/iflex/i, 'iflex')
      .replace(/asafe/i, 'asafe');
    
    const normalizedSearchTerm = `%${normalizedQuery}%`;
    
    const results = await this.db
      .select()
      .from(products)
      .where(
        or(
          ilike(products.name, searchTerm),
          ilike(products.description, searchTerm),
          ilike(products.category, searchTerm),
          // Also search with normalized query for variations
          sql`LOWER(REPLACE(REPLACE(REPLACE(${products.name}, ' ', ''), '-', ''), '_', '')) LIKE ${normalizedSearchTerm}`,
          sql`LOWER(REPLACE(REPLACE(REPLACE(${products.description}, ' ', ''), '-', ''), '_', '')) LIKE ${normalizedSearchTerm}`
        )
      )
      .limit(20);
    
    return results;
  }

  async searchResources(query: string): Promise<Resource[]> {
    if (!query || query.length < 2) return [];
    
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const results = await this.db
      .select()
      .from(resources)
      .where(
        or(
          ilike(resources.title, searchTerm),
          ilike(resources.description, searchTerm),
          ilike(resources.category, searchTerm),
          ilike(resources.resourceType, searchTerm)
        )
      )
      .limit(15);
    
    return results;
  }

  async searchCaseStudies(query: string): Promise<CaseStudy[]> {
    if (!query || query.length < 2) return [];
    
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const results = await this.db
      .select()
      .from(caseStudies)
      .where(
        or(
          ilike(caseStudies.title, searchTerm),
          ilike(caseStudies.description, searchTerm),
          ilike(caseStudies.industry, searchTerm),
          ilike(caseStudies.company, searchTerm),
          ilike(caseStudies.challenge, searchTerm),
          ilike(caseStudies.solution, searchTerm)
        )
      )
      .limit(10);
    
    return results;
  }

  async searchOrders(query: string, userId?: string): Promise<Order[]> {
    if (!query || query.length < 2) return [];
    
    const searchTerm = `%${query.toLowerCase()}%`;
    
    let queryBuilder = this.db
      .select()
      .from(orders);
    
    const whereConditions = [
      or(
        ilike(orders.orderNumber, searchTerm),
        ilike(orders.projectName, searchTerm),
        ilike(orders.projectLocation, searchTerm),
        ilike(orders.status, searchTerm),
        ilike(orders.customerCompany, searchTerm)
      )
    ];
    
    // If userId is provided, filter by user
    if (userId) {
      whereConditions.push(eq(orders.userId, userId));
    }
    
    const results = await queryBuilder
      .where(and(...whereConditions))
      .limit(10);
    
    return results;
  }

  async searchFAQs(query: string): Promise<Faq[]> {
    if (!query || query.length < 2) return [];
    
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const results = await this.db
      .select()
      .from(faqs)
      .where(
        or(
          ilike(faqs.question, searchTerm),
          ilike(faqs.answer, searchTerm),
          ilike(faqs.category, searchTerm)
        )
      )
      .limit(10);
    
    return results;
  }

  // Unified search across all content types
  async searchAll(query: string, type: string = 'all', userId?: string) {
    const results: any = {
      products: [],
      resources: [],
      caseStudies: [],
      orders: [],
      faqs: []
    };

    if (!query || query.length < 2) return results;

    // Search based on type filter
    if (type === 'all' || type === 'products') {
      results.products = await this.searchProducts(query);
    }
    
    if (type === 'all' || type === 'resources') {
      results.resources = await this.searchResources(query);
    }
    
    if (type === 'all' || type === 'case_studies') {
      results.caseStudies = await this.searchCaseStudies(query);
    }
    
    if (type === 'all' || type === 'orders') {
      results.orders = await this.searchOrders(query, userId);
    }
    
    if (type === 'all' || type === 'faqs') {
      results.faqs = await this.searchFAQs(query);
    }

    return results;
  }
  
  // Vehicle Type operations implementation (additional methods)
  async getVehicleType(id: string): Promise<VehicleType | undefined> {
    const [vehicle] = await this.db.select().from(vehicleTypes).where(eq(vehicleTypes.id, id));
    return vehicle;
  }

  async updateVehicleType(id: string, updates: Partial<InsertVehicleType>): Promise<VehicleType> {
    const [updated] = await this.db.update(vehicleTypes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(vehicleTypes.id, id))
      .returning();
    return updated;
  }
  
  async deleteVehicleType(id: string): Promise<void> {
    await this.db.delete(vehicleTypes).where(eq(vehicleTypes.id, id));
  }
  
  // Application Type operations implementation
  async getApplicationTypes(): Promise<ApplicationType[]> {
    return await this.db.select().from(applicationTypes)
      .where(eq(applicationTypes.isActive, true))
      .orderBy(applicationTypes.sortOrder, applicationTypes.name);
  }
  
  async getApplicationType(id: string): Promise<ApplicationType | undefined> {
    const [appType] = await this.db.select().from(applicationTypes).where(eq(applicationTypes.id, id));
    return appType;
  }
  
  async createApplicationType(app: InsertApplicationType): Promise<ApplicationType> {
    const [newApp] = await this.db.insert(applicationTypes).values(app).returning();
    return newApp;
  }
  
  async updateApplicationType(id: string, updates: Partial<InsertApplicationType>): Promise<ApplicationType> {
    const [updated] = await this.db.update(applicationTypes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(applicationTypes.id, id))
      .returning();
    return updated;
  }
  
  async deleteApplicationType(id: string): Promise<void> {
    await this.db.delete(applicationTypes).where(eq(applicationTypes.id, id));
  }
  
  // Vehicle-Product Compatibility operations implementation
  async getVehicleProductCompatibilities(productId?: string, vehicleTypeId?: string): Promise<VehicleProductCompatibility[]> {
    const conditions: (SQL | undefined)[] = [eq(vehicleProductCompatibility.isActive, true)];
    if (productId) conditions.push(eq(vehicleProductCompatibility.productId, productId));
    if (vehicleTypeId) conditions.push(eq(vehicleProductCompatibility.vehicleTypeId, vehicleTypeId));

    return await this.db.select().from(vehicleProductCompatibility)
      .where(and(...conditions));
  }

  async updateVehicleProductCompatibility(id: string, updates: Partial<InsertVehicleProductCompatibility>): Promise<VehicleProductCompatibility> {
    const [updated] = await this.db.update(vehicleProductCompatibility)
      .set(updates)
      .where(eq(vehicleProductCompatibility.id, id))
      .returning();
    return updated;
  }
  
  async deleteVehicleProductCompatibility(id: string): Promise<void> {
    await this.db.delete(vehicleProductCompatibility).where(eq(vehicleProductCompatibility.id, id));
  }
  
  // Product-Application Compatibility operations implementation
  async getProductApplicationCompatibilities(productId?: string, applicationTypeId?: string): Promise<ProductApplicationCompatibility[]> {
    const conditions: (SQL | undefined)[] = [eq(productApplicationCompatibility.isActive, true)];
    if (productId) conditions.push(eq(productApplicationCompatibility.productId, productId));
    if (applicationTypeId) conditions.push(eq(productApplicationCompatibility.applicationTypeId, applicationTypeId));

    return await this.db.select().from(productApplicationCompatibility)
      .where(and(...conditions));
  }
  
  async createProductApplicationCompatibility(compat: InsertProductApplicationCompatibility): Promise<ProductApplicationCompatibility> {
    const [newCompat] = await this.db.insert(productApplicationCompatibility).values(compat).returning();
    return newCompat;
  }
  
  async updateProductApplicationCompatibility(id: string, updates: Partial<InsertProductApplicationCompatibility>): Promise<ProductApplicationCompatibility> {
    const [updated] = await this.db.update(productApplicationCompatibility)
      .set(updates)
      .where(eq(productApplicationCompatibility.id, id))
      .returning();
    return updated;
  }
  
  async deleteProductApplicationCompatibility(id: string): Promise<void> {
    await this.db.delete(productApplicationCompatibility).where(eq(productApplicationCompatibility.id, id));
  }

  // Password reset operations
  async createPasswordResetToken(email: string): Promise<{ token: string; user: any } | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user) return null;

    const token = crypto.randomUUID();
    const hashedToken = await sha256(token);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.db
      .update(users)
      .set({ passwordResetToken: hashedToken, passwordResetExpiry: expiry, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return { token, user };
  }

  async verifyPasswordResetToken(token: string): Promise<any | null> {
    const hashedToken = await sha256(token);
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.passwordResetToken, hashedToken),
          gte(users.passwordResetExpiry, new Date())
        )
      );
    return user || null;
  }

  async resetUserPassword(userId: string, newPasswordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // OAuth operations
  async getUserByOAuth(provider: string, oauthId: string) {
    const [user] = await this.db.select().from(users).where(
      and(eq(users.oauthProvider, provider), eq(users.oauthId, oauthId))
    );
    return user;
  }

  async createUser(data: { email: string; passwordHash: string; firstName: string; lastName: string; company?: string | null; phone?: string | null; jobTitle?: string | null; role?: string }) {
    const id = crypto.randomUUID();
    const [user] = await this.db.insert(users).values({
      id,
      email: data.email,
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company || null,
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      role: data.role || "customer",
      emailVerified: false,
      mustCompleteProfile: false,
    }).returning();
    return user;
  }

  async createOAuthUser(profile: { email: string; firstName: string; lastName: string; provider: string; oauthId: string }) {
    const id = crypto.randomUUID();
    const [user] = await this.db.insert(users).values({
      id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      oauthProvider: profile.provider,
      oauthId: profile.oauthId,
      emailVerified: true,
      mustCompleteProfile: true,
    }).returning();
    return user;
  }

  async linkOAuthAccount(userId: string, provider: string, oauthId: string) {
    await this.db.update(users).set({ oauthProvider: provider, oauthId: oauthId }).where(eq(users.id, userId));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Approval-token helpers
  //
  // Validity-checking intentionally lives in the route handlers (they need to
  // produce distinct `not_found` / `expired` / `used` / `revoked` reasons);
  // this layer is plumbing: create / read / flip-used / flip-revoked.
  // ──────────────────────────────────────────────────────────────────────
  async createApprovalToken(input: InsertApprovalToken): Promise<ApprovalToken> {
    const [row] = await this.db.insert(approvalTokens).values(input).returning();
    return row;
  }

  async getApprovalTokenByToken(token: string): Promise<ApprovalToken | undefined> {
    const [row] = await this.db
      .select()
      .from(approvalTokens)
      .where(eq(approvalTokens.token, token));
    return row;
  }

  async getApprovalTokenById(id: string): Promise<ApprovalToken | undefined> {
    const [row] = await this.db
      .select()
      .from(approvalTokens)
      .where(eq(approvalTokens.id, id));
    return row;
  }

  async getApprovalTokensForOrder(orderId: string): Promise<ApprovalToken[]> {
    return await this.db
      .select()
      .from(approvalTokens)
      .where(eq(approvalTokens.orderId, orderId))
      .orderBy(desc(approvalTokens.issuedAt));
  }

  // Find the currently-active (unused, unrevoked) token for a given section.
  // Used when sales asks "revoke whatever's outstanding for commercial" — so
  // they can hand us `{section}` instead of a specific tokenId.
  async findActiveApprovalTokenForSection(
    orderId: string,
    section: string,
  ): Promise<ApprovalToken | undefined> {
    const [row] = await this.db
      .select()
      .from(approvalTokens)
      .where(
        and(
          eq(approvalTokens.orderId, orderId),
          eq(approvalTokens.section, section),
          isNull(approvalTokens.usedAt),
          isNull(approvalTokens.revokedAt),
        ),
      )
      .orderBy(desc(approvalTokens.issuedAt));
    return row;
  }

  async markApprovalTokenUsed(tokenId: string): Promise<void> {
    await this.db
      .update(approvalTokens)
      .set({ usedAt: new Date() })
      .where(eq(approvalTokens.id, tokenId));
  }

  async revokeApprovalToken(tokenId: string): Promise<void> {
    await this.db
      .update(approvalTokens)
      .set({ revokedAt: new Date() })
      .where(eq(approvalTokens.id, tokenId));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Order audit log
  // ──────────────────────────────────────────────────────────────────────
  async appendOrderAuditLog(entry: InsertOrderAuditLog): Promise<OrderAuditLog> {
    const [row] = await this.db.insert(orderAuditLog).values(entry).returning();
    return row;
  }

  async getOrderAuditLog(orderId: string): Promise<OrderAuditLog[]> {
    return await this.db
      .select()
      .from(orderAuditLog)
      .where(eq(orderAuditLog.orderId, orderId))
      .orderBy(desc(orderAuditLog.createdAt));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Shared section-approval helper
  //
  // Both the authenticated approve-section endpoint and the magic-link
  // consume endpoint route through here. The audit-log write is best-effort
  // relative to the signature write: we never want a log hiccup to fail a
  // sign-off the user already confirmed, so we catch+log any audit error.
  // ──────────────────────────────────────────────────────────────────────
  async applySectionApproval(input: {
    orderId: string;
    section: "technical" | "commercial" | "marketing";
    signature: OrderSectionSignature;
    actorUserId?: string | null;
    actorEmail?: string | null;
    tokenId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<Order> {
    const updated = await this.saveOrderSectionApproval(
      input.orderId,
      input.section,
      input.signature,
    );

    try {
      await this.appendOrderAuditLog({
        orderId: input.orderId,
        eventType: "approved",
        section: input.section,
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        details: {
          signedBy: input.signature.signedBy,
          jobTitle: input.signature.jobTitle,
          signedAt: input.signature.signedAt,
          tokenId: input.tokenId ?? null,
        },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    } catch (err) {
      // Don't fail the approval over a logging blip; surface in server logs.
      console.error("Audit log append failed for approved event:", err);
    }

    return updated;
  }
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// In Workers, create storage per-request: new DatabaseStorage(getDb(c.env.DATABASE_URL))
export function createStorage(db: Database) {
  return new DatabaseStorage(db);
}