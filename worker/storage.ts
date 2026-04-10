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
  discountOptions,
  userDiscountSelections,
  serviceCareOptions,
  userServiceSelections,
  cartProjectInfo,
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
} from "@shared/schema";
import { eq, desc, and, ilike, or, sql, isNull, isNotNull, lte, gte, asc, like, inArray } from "drizzle-orm";
import type { Database } from "./db";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  
  // Admin user operations
  getAdminByUsername(username: string): Promise<AdminUser | undefined>;
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
  upsertCartProjectInfo(data: InsertCartProjectInfo): Promise<CartProjectInfo>;
  
  // Product Pricing operations
  getProductPricing(): Promise<ProductPricing[]>;
  getProductPricingByName(productName: string): Promise<ProductPricing | undefined>;
  calculatePrice(productName: string, quantity: number): Promise<{ unitPrice: number; totalPrice: number; tier: string }>;
  createProductPricing(pricing: InsertProductPricing): Promise<ProductPricing>;
  updateProductPricing(id: string, updates: Partial<InsertProductPricing>): Promise<ProductPricing>;
  deleteProductPricing(id: string): Promise<void>;
  
  // Discount operations
  getDiscountOptions(): Promise<DiscountOption[]>;
  getUserDiscountSelections(userId: string): Promise<UserDiscountSelection[]>;
  saveUserDiscountSelections(userId: string, selections: string[]): Promise<UserDiscountSelection[]>;
  
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
    const [updatedUser] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
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
  
  async getAllUserActivities(): Promise<UserActivityLog[]> {
    return await this.db.select().from(userActivityLogs).orderBy(desc(userActivityLogs.createdAt)).limit(1000);
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
    
    return await db
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
    return await db
      .select()
      .from(globalOffices)
      .where(and(eq(globalOffices.region, region), eq(globalOffices.isActive, true)))
      .orderBy(asc(globalOffices.sortOrder), asc(globalOffices.companyName));
  }

  async getGlobalOfficesByCountry(country: string): Promise<GlobalOffice[]> {
    return await db
      .select()
      .from(globalOffices)
      .where(and(eq(globalOffices.country, country), eq(globalOffices.isActive, true)))
      .orderBy(asc(globalOffices.sortOrder), asc(globalOffices.companyName));
  }

  async getDefaultOfficeForRegion(region: string): Promise<GlobalOffice | undefined> {
    const [office] = await db
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
    const [updatedOffice] = await db
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
    return await db
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
    return await db
      .select()
      .from(orders)
      .orderBy(desc(orders.orderDate));
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.status, status))
      .orderBy(desc(orders.orderDate));
  }

  async updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
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
    return await db
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
    const whereConditions = [eq(products.isActive, true)];
    
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
      const compatibleProductIds = await db
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
      const compatibleProductIds = await db
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
    
    return await db
      .select()
      .from(products)
      .where(and(...whereConditions))
      .orderBy(products.impactRating);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.isActive, true)));
    return product;
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    const [product] = await db
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
    
    const [similarProduct] = await db
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
    const [updatedProduct] = await db
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
    const allProducts = await db
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
    const allProducts = await db
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
      
      const results = await db
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
    const [updatedCaseStudy] = await db
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
      
      const result = await db
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
    const [updatedResource] = await db
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
    await db
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
    
    const query = db.select().from(faqs);
    
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
    const [updatedFaq] = await db
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
    return await db
      .select()
      .from(impactCalculations)
      .where(eq(impactCalculations.userId, userId))
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
    return await db
      .select()
      .from(quoteRequests)
      .orderBy(desc(quoteRequests.createdAt));
  }

  async getQuoteRequestsByStatus(status: string): Promise<QuoteRequest[]> {
    return await db
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
    const [updatedRequest] = await db
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
    const [stats] = await db
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
    return await db
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
    return await db
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
      
      // Update with recalculated pricing
      updates.unitPrice = pricingResult.unitPrice;
      updates.totalPrice = pricingResult.totalPrice;
      updates.pricingTier = pricingResult.tier;
      
      console.log(`Updated pricing: Unit=${pricingResult.unitPrice}, Total=${pricingResult.totalPrice}, Tier=${pricingResult.tier}`);
    }
    
    const [updatedItem] = await db
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
    return await db
      .select()
      .from(productPricing)
      .where(eq(productPricing.isActive, true))
      .orderBy(productPricing.productName);
  }

  async getProductPricingByName(productName: string): Promise<any | undefined> {
    const [pricing] = await db
      .select()
      .from(productPricing)
      .where(and(eq(productPricing.productName, productName), eq(productPricing.isActive, true)));
    return pricing;
  }

  async calculatePrice(productName: string, quantity: number): Promise<{ unitPrice: number; totalPrice: number; tier: string }> {
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
    
    // Check if this is a traffic barrier product that should have quantity-based tiered pricing
    const isTrafficBarrier = (name: string): boolean => {
      const lowerName = name.toLowerCase();
      return lowerName.includes('forkguard kerb') ||
             lowerName.includes('traffic barrier') ||
             lowerName.includes('pedestrian barrier') ||
             lowerName.includes('single traffic') ||
             lowerName.includes('double traffic') ||
             lowerName.includes('traffic plus') ||
             lowerName.includes('atlas') ||
             lowerName.includes('alarm bar') ||
             lowerName.includes('car park barrier');
    };
    
    // First try exact match with cleaned name
    const exactMatch = await db
      .select()
      .from(productPricing)
      .where(and(eq(productPricing.productName, cleanProductName), eq(productPricing.isActive, true)));
    
    let pricing: any = exactMatch[0];
      
    // If no exact match, try fuzzy matching (remove special characters and normalize)
    if (!pricing) {
      const normalizedProductName = cleanProductName.replace(/[™®+]/g, '').trim();
      const allPricing = await db
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
    let tier: string;
    
    if (!pricing) {
      console.log(`No pricing found for product: "${cleanProductName}", checking base product price...`);
      
      // Fallback to base product price from products table - try cleaned name first
      let [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.name, cleanProductName), eq(products.isActive, true)));
      
      // If not found with cleaned name, try original name
      if (!product && cleanProductName !== productName) {
        [product] = await db
          .select()
          .from(products)
          .where(and(eq(products.name, productName), eq(products.isActive, true)));
      }
      
      if (product && product.price) {
        basePrice = parseFloat(product.price);
        console.log(`Using base product price: ${basePrice} AED for "${cleanProductName}"`);
      } else {
        console.error(`No pricing found for product: "${productName}" in either pricing or products table`);
        // Last resort fallback
        basePrice = 100; // Conservative fallback instead of 1000
      }
    } else {
      // Use existing tier-based pricing logic
      const tier1Min = parseFloat(pricing.tier1Min);
      const tier1Max = parseFloat(pricing.tier1Max);
      const tier2Min = parseFloat(pricing.tier2Min);
      const tier2Max = parseFloat(pricing.tier2Max);
      const tier3Min = parseFloat(pricing.tier3Min);
      const tier3Max = parseFloat(pricing.tier3Max);
      const tier4Min = parseFloat(pricing.tier4Min);
      
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
    
    // Apply quantity-based tiered discounts for traffic barrier products
    if (isTrafficBarrier(cleanProductName)) {
      let discountPercent = 0;
      let discountTier = "";
      
      if (quantity >= 20) {
        discountPercent = 30;
        discountTier = "20+ units (30% off)";
      } else if (quantity >= 10) {
        discountPercent = 20;
        discountTier = "10-20 units (20% off)";
      } else if (quantity > 2) {
        discountPercent = 10;
        discountTier = "3-10 units (10% off)";
      } else {
        discountPercent = 0;
        discountTier = "1-2 units (standard price)";
      }
      
      // Apply discount to the base price
      unitPrice = basePrice * (1 - discountPercent / 100);
      unitPrice = Math.round(unitPrice * 100) / 100; // Round to 2 decimal places
      
      // Update tier description to include discount information
      tier = pricing ? `${tier || ''} - ${discountTier}` : discountTier;
      
      console.log(`Traffic barrier product "${cleanProductName}" - Quantity: ${quantity}, Discount: ${discountPercent}%, Original: ${basePrice} AED, Discounted: ${unitPrice} AED`);
    } else {
      // For non-traffic barrier products, use the base price as-is
      unitPrice = basePrice;
      if (!tier) {
        tier = pricing ? "Standard pricing" : "Base Product Price";
      }
    }
    
    const totalPrice = unitPrice * quantity;

    return {
      unitPrice,
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
    return await db
      .select()
      .from(discountOptions)
      .where(eq(discountOptions.isActive, true))
      .orderBy(discountOptions.category, discountOptions.discountPercent);
  }

  async getUserDiscountSelections(userId: string): Promise<UserDiscountSelection[]> {
    return await db
      .select()
      .from(userDiscountSelections)
      .where(and(
        eq(userDiscountSelections.userId, userId),
        eq(userDiscountSelections.isSelected, true)
      ));
  }

  async saveUserDiscountSelections(userId: string, selections: string[]): Promise<UserDiscountSelection[]> {
    // First, clear all existing selections for this user
    await db
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
    return await db
      .select()
      .from(serviceCareOptions)
      .where(eq(serviceCareOptions.isActive, true))
      .orderBy(serviceCareOptions.id);
  }

  async getUserServiceSelection(userId: string): Promise<UserServiceSelection | undefined> {
    const [selection] = await db
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
    await db
      .delete(userServiceSelections)
      .where(eq(userServiceSelections.userId, userId));

    // Insert new selection
    const [newSelection] = await db
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
    const [projectInfo] = await db
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
      const [updated] = await db
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
      const [newProjectInfo] = await db
        .insert(cartProjectInfo)
        .values({
          userId,
          ...data,
        })
        .returning();
      return newProjectInfo;
    }
  }

  // Alias for saveCartProjectInfo to match the expected interface
  async upsertCartProjectInfo(data: InsertCartProjectInfo): Promise<CartProjectInfo> {
    // Extract userId from the data and call saveCartProjectInfo
    const { userId, ...rest } = data;
    return this.saveCartProjectInfo(userId, rest);
  }

  // Project Case Study operations
  async getProjectCaseStudies(userId: string): Promise<ProjectCaseStudy[]> {
    return await db
      .select()
      .from(projectCaseStudies)
      .where(eq(projectCaseStudies.userId, userId))
      .orderBy(desc(projectCaseStudies.createdAt));
  }

  async updateProjectCaseStudies(userId: string, caseStudyIds: string[]): Promise<ProjectCaseStudy[]> {
    // Delete existing selections
    await db
      .delete(projectCaseStudies)
      .where(eq(projectCaseStudies.userId, userId));
    
    // If no case studies selected, return empty array
    if (caseStudyIds.length === 0) {
      return [];
    }
    
    // Insert new selections
    const newSelections = await db
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
    return await db
      .select()
      .from(layoutDrawings)
      .where(and(
        eq(layoutDrawings.userId, userId),
        isNull(layoutDrawings.deletedAt)
      ))
      .orderBy(desc(layoutDrawings.createdAt));
  }

  async getLayoutDrawing(id: string): Promise<LayoutDrawing | undefined> {
    const [drawing] = await db
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
    const [newDrawing] = await db
      .insert(layoutDrawings)
      .values(drawing)
      .returning();
    return newDrawing;
  }

  // Soft delete layout drawing (move to trash)
  async deleteLayoutDrawing(id: string): Promise<void> {
    const now = new Date();
    
    // First soft delete all associated markups
    await db
      .update(layoutMarkups)
      .set({ deletedAt: now })
      .where(eq(layoutMarkups.layoutDrawingId, id));
    
    // Then soft delete the drawing
    await db
      .update(layoutDrawings)
      .set({ deletedAt: now })
      .where(eq(layoutDrawings.id, id));
  }

  // Get trashed layout drawings
  async getTrashedLayoutDrawings(userId: string): Promise<LayoutDrawing[]> {
    return await db
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
    await db
      .update(layoutDrawings)
      .set({ deletedAt: null })
      .where(eq(layoutDrawings.id, id));
    
    // Restore all associated markups
    await db
      .update(layoutMarkups)
      .set({ deletedAt: null })
      .where(eq(layoutMarkups.layoutDrawingId, id));
  }

  // Permanently delete layout drawing
  async permanentlyDeleteLayoutDrawing(id: string): Promise<void> {
    // First delete all associated markups permanently
    await db
      .delete(layoutMarkups)
      .where(eq(layoutMarkups.layoutDrawingId, id));
    
    // Then delete the drawing permanently
    await db
      .delete(layoutDrawings)
      .where(eq(layoutDrawings.id, id));
  }

  // Update layout drawing scale
  async updateLayoutDrawingScale(id: string, scaleData: { 
    scale?: number; 
    scaleLine?: any; 
    isScaleSet?: boolean 
  }): Promise<LayoutDrawing> {
    const [updatedDrawing] = await db
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
    const [updatedDrawing] = await db
      .update(layoutDrawings)
      .set({
        fileName: fileName,
        updatedAt: new Date()
      })
      .where(eq(layoutDrawings.id, id))
      .returning();
    return updatedDrawing;
  }

  // Layout Markup operations
  async getLayoutMarkups(layoutDrawingId: string): Promise<LayoutMarkup[]> {
    return await db
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
    const [newMarkup] = await db
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
    const [updatedMarkup] = await db
      .update(layoutMarkups)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(layoutMarkups.id, id))
      .returning();
    return updatedMarkup;
  }

  // Soft delete layout markup
  async deleteLayoutMarkup(id: string): Promise<void> {
    await db
      .update(layoutMarkups)
      .set({ deletedAt: new Date() })
      .where(eq(layoutMarkups.id, id));
  }

  // Restore layout markup
  async restoreLayoutMarkup(id: string): Promise<void> {
    await db
      .update(layoutMarkups)
      .set({ deletedAt: null })
      .where(eq(layoutMarkups.id, id));
  }

  // Permanently delete layout markup
  async permanentlyDeleteLayoutMarkup(id: string): Promise<void> {
    await db
      .delete(layoutMarkups)
      .where(eq(layoutMarkups.id, id));
  }

  // Draft Project operations
  async getUserDraftProjects(userId: string): Promise<DraftProject[]> {
    return await db
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
    const [updatedDraft] = await db
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
    await db
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
      await db
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
      await db
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
      await db
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
      await db
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
    const [user] = await db
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
    return await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(desc(chatConversations.updatedAt));
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    const [newConversation] = await db
      .insert(chatConversations)
      .values(conversation)
      .returning();
    return newConversation;
  }

  async deleteChatConversation(conversationId: string, userId: string): Promise<void> {
    // Delete all messages in the conversation first
    await db
      .delete(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId));
    
    // Delete the conversation
    await db
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
    const conversation = await db
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
    
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db
      .insert(chatMessages)
      .values(message)
      .returning();
    
    // Update conversation's updatedAt timestamp
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, message.conversationId));
    
    return newMessage;
  }

  // Solution Request operations
  async getSolutionRequestsByUser(userId: string): Promise<SolutionRequest[]> {
    return await db
      .select()
      .from(solutionRequests)
      .where(eq(solutionRequests.userId, userId))
      .orderBy(desc(solutionRequests.createdAt));
  }

  async getSolutionRequest(id: string, userId: string): Promise<SolutionRequest | undefined> {
    const [request] = await db
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
    const [newRequest] = await db
      .insert(solutionRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async updateSolutionRequest(id: string, updates: Partial<InsertSolutionRequest>): Promise<SolutionRequest> {
    const [updatedRequest] = await db
      .update(solutionRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(solutionRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async deleteSolutionRequest(id: string, userId: string): Promise<void> {
    await db
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
    const [created] = await this.db.insert(messages).values(message).returning();
    
    // Update conversation timestamp
    await this.db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, message.conversationId));
    
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
          timeSpent: existing[0].timeSpent + timeSpent,
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
    const [created] = await this.db.insert(forumReplies).values(reply).returning();
    
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
    let query = db.select().from(marketTrends);
    
    const conditions = [];
    if (region) conditions.push(eq(marketTrends.region, region));
    if (industry) conditions.push(eq(marketTrends.industry, industry));
    if (isPublic !== undefined) conditions.push(eq(marketTrends.isPublic, isPublic));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
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
    const surveys = await db
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

  async getSiteSurvey(id: string): Promise<SiteSurvey | undefined> {
    const [survey] = await this.db.select().from(siteSurveys).where(eq(siteSurveys.id, id));
    if (!survey) return undefined;
    
    // Update lastViewed timestamp
    await db
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
    const [updatedSurvey] = await db
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
    return await db
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

    const [updatedSurvey] = await db
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
    return await db
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
    const [updatedArea] = await db
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
    const query = db.select().from(communicationTemplates);
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
    const [updatedEngagement] = await db
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
    
    const results = await db
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
    
    const results = await db
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
    
    const results = await db
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
    
    let queryBuilder = db
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
    
    const results = await db
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
  
  // Vehicle Type operations implementation
  async getVehicleTypes(): Promise<VehicleType[]> {
    return await this.db.select().from(vehicleTypes)
      .where(eq(vehicleTypes.isActive, true))
      .orderBy(vehicleTypes.sortOrder, vehicleTypes.name);
  }
  
  async getVehicleType(id: string): Promise<VehicleType | undefined> {
    const [vehicle] = await this.db.select().from(vehicleTypes).where(eq(vehicleTypes.id, id));
    return vehicle;
  }
  
  async createVehicleType(vehicle: InsertVehicleType): Promise<VehicleType> {
    const [newVehicle] = await this.db.insert(vehicleTypes).values(vehicle).returning();
    return newVehicle;
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
    let query = db.select().from(vehicleProductCompatibility);
    
    const conditions = [];
    if (productId) conditions.push(eq(vehicleProductCompatibility.productId, productId));
    if (vehicleTypeId) conditions.push(eq(vehicleProductCompatibility.vehicleTypeId, vehicleTypeId));
    conditions.push(eq(vehicleProductCompatibility.isActive, true));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query;
  }
  
  async createVehicleProductCompatibility(compat: InsertVehicleProductCompatibility): Promise<VehicleProductCompatibility> {
    const [newCompat] = await this.db.insert(vehicleProductCompatibility).values(compat).returning();
    return newCompat;
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
    let query = db.select().from(productApplicationCompatibility);
    
    const conditions = [];
    if (productId) conditions.push(eq(productApplicationCompatibility.productId, productId));
    if (applicationTypeId) conditions.push(eq(productApplicationCompatibility.applicationTypeId, applicationTypeId));
    conditions.push(eq(productApplicationCompatibility.isActive, true));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query;
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
}

// In Workers, create storage per-request: new DatabaseStorage(getDb(c.env.DATABASE_URL))
export function createStorage(db: Database) {
  return new DatabaseStorage(db);
}