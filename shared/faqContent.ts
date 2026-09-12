// ────────────────────────────────────────────────────────────────────────────
// shared/faqContent.ts
//
// The canonical A-SAFE FAQ content and its category metadata. One source for
// the FAQs page (client/src/pages/FAQs.tsx) and the FAQ sheet PDF renderer
// (worker/lib/pdf/reports/faqSheet.ts). Rows an admin publishes through
// POST /api/admin/faqs (the `faqs` table) take precedence at render time;
// this list is the fallback when that table is empty.
//
// Ids are stable slugs so a share link (?ids=a,b) survives reordering.
// ────────────────────────────────────────────────────────────────────────────

export interface FaqCategory {
  key: string;
  title: string;
  description: string;
}

export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
}

/** Category order is the order sections appear on the page and in the PDF. */
export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  { key: "product-technology", title: "Product & Technology", description: "Learn about A-SAFE's innovative polymer technology and advanced materials" },
  { key: "safety-performance", title: "Safety & Performance", description: "Understanding crash testing, compliance standards, and safety outcomes" },
  { key: "installation-planning", title: "Installation & Planning", description: "Site assessments, installation processes, and planning tools" },
  { key: "maintenance-durability", title: "Maintenance & Durability", description: "Lifespan, maintenance requirements, and replacement guidance" },
  { key: "applications-industries", title: "Applications & Industries", description: "Industry applications, environmental resistance, and specialized uses" },
  { key: "flexibility-customization", title: "Flexibility & Customization", description: "Customization options, adaptability, and environmental benefits" },
  { key: "business-roi", title: "Business & ROI", description: "Investment returns, cost savings, and business impact" },
  { key: "assessment-support", title: "Assessment & Support", description: "Consultations, assessments, and ongoing support services" },
  { key: "app-usage-platform", title: "App Usage & Platform", description: "How to use A-SAFE ENGAGE platform features and maximize your experience" },
];

/** Categories that describe the Engage app itself; left out of customer-facing documents. */
export const INTERNAL_FAQ_CATEGORIES: readonly string[] = ["app-usage-platform"];

export function faqCategoryTitle(key: string | null | undefined): string {
  return FAQ_CATEGORIES.find((c) => c.key === key)?.title ?? (key ? key.replace(/[-_]+/g, " ") : "General");
}

export const FAQS: readonly FaqEntry[] = [
  // Product & Technology
  {
    id: "what-makes-a-safe-barriers-different-from",
    category: "product-technology",
    question: "What makes A‑SAFE barriers different from steel barriers?",
    answer: "A‑SAFE barriers are made from advanced polymer technology that flexes and absorbs impact energy. Unlike steel, which transfers impact to the floor and often needs replacing after a collision, A‑SAFE barriers self-recover, protecting people, equipment, floors, and vehicles while reducing long-term costs.",
  },
  {
    id: "what-does-pas-13-crash-testing-mean",
    category: "product-technology",
    question: "What does PAS 13 crash testing mean?",
    answer: "PAS 13 is an internationally recognized code of practice that defines how barriers should be tested and installed. A‑SAFE barriers are independently crash-tested to these rigorous standards, so you can trust they perform exactly as promised when it matters most.",
  },
  {
    id: "what-materials-are-a-safe-barriers-made",
    category: "product-technology",
    question: "What materials are A‑SAFE barriers made from?",
    answer: "Our barriers are made from patented advanced polymer blends called Memaplex™ and Monoplex™, specifically engineered to flex, absorb energy, and return to shape after impact.",
  },
  {
    id: "can-a-safe-barriers-be-used-in",
    category: "product-technology",
    question: "Can A‑SAFE barriers be used in automated warehouses or with AGVs (Automated Guided Vehicles)?",
    answer: "Yes. Our barriers are designed to guide and protect both manned and unmanned traffic. In highly automated environments, they help define pathways for AGVs and protect robotics, storage systems, and segregate personnel zones to not interfere or disrupt AGV traffic flow.",
  },
  {
    id: "what-innovations-are-coming-next-for-barrier",
    category: "product-technology",
    question: "What innovations are coming next for barrier technology?",
    answer: "We are working on integrating smart technology, such as sensors and IoT connectivity, into barrier systems. These will help facilities track impacts, analyze risk hotspots, and make data-driven improvements.",
  },
  // Safety & Performance
  {
    id: "do-a-safe-barriers-stop-forklifts-completely",
    category: "safety-performance",
    question: "Do A‑SAFE barriers stop forklifts completely?",
    answer: "They are designed to absorb energy and slow vehicles safely while protecting structures and people. Depending on the impact conditions, the barrier can stop or significantly decelerate a vehicle, preventing serious damage or injury.",
  },
  {
    id: "can-barriers-protect-against-racking-damage",
    category: "safety-performance",
    question: "Can barriers protect against racking damage?",
    answer: "Yes. Specially designed racking protectors and low-level barriers shield racking legs and structures from forklift impacts, which are one of the most common causes of warehouse damage and racking collapse.",
  },
  {
    id: "do-a-safe-barriers-comply-with-osha",
    category: "safety-performance",
    question: "Do A‑SAFE barriers comply with OSHA and EU regulations?",
    answer: "Yes. A‑SAFE barriers are designed and installed in compliance with international safety standards, including OSHA requirements and EU directives for workplace safety.",
  },
  {
    id: "how-do-a-safe-barriers-support-a",
    category: "safety-performance",
    question: "How do A‑SAFE barriers support a safety culture in the workplace?",
    answer: "Barriers are a visual and practical commitment to protecting people. They help set boundaries, encourage safe behavior, and show that management prioritizes safety - creating a stronger safety culture.",
  },
  {
    id: "do-a-safe-barriers-reduce-workplace-stress",
    category: "safety-performance",
    question: "Do A‑SAFE barriers reduce workplace stress?",
    answer: "Yes. When pedestrians and operators see clear segregation and protection, it reduces anxiety. This leads to a calmer, more confident workforce and improved productivity.",
  },
  {
    id: "how-do-barriers-help-prevent-legal-and",
    category: "safety-performance",
    question: "How do barriers help prevent legal and compliance issues?",
    answer: "Proper impact protection helps companies comply with health and safety regulations, reducing the risk of fines, legal claims, and insurance disputes after incidents.",
  },
  {
    id: "do-barriers-make-forklift-drivers-overconfident",
    category: "safety-performance",
    question: "Do barriers make forklift drivers overconfident?",
    answer: "No. In fact, clear separation of vehicles and pedestrians reduces driver stress and increases attentiveness. Barriers are a safeguard, not a substitute for safe driving practices.",
  },
  // Installation & Planning
  {
    id: "how-long-does-installation-take",
    category: "installation-planning",
    question: "How long does installation take?",
    answer: "It really depends on site size and complexity. Our teams work around your operations to minimize downtime and disruption and it is typically a lot faster than steel alternative barriers due to A-SAFE modular assembly and supplied, fit-for-purpose floor fixings.",
  },
  {
    id: "do-you-offer-on-site-safety-assessments",
    category: "installation-planning",
    question: "Do you offer on-site safety assessments?",
    answer: "Yes. Our expert team will visit your site, review traffic and pedestrian risks, and provide a customized safety plan. This service is free of charge and comes with a detailed proposal.",
  },
  {
    id: "do-you-provide-cad-drawings-for-planning",
    category: "installation-planning",
    question: "Do you provide CAD drawings for planning?",
    answer: "Yes. We create detailed CAD layouts to help you visualize barrier placement and ensure your system integrates seamlessly with your facility.",
  },
  {
    id: "can-a-safe-provide-3d-visualizations-before",
    category: "installation-planning",
    question: "Can A‑SAFE provide 3D visualizations before installation?",
    answer: "Yes. Our team can provide 3D models of your facility showing exactly where barriers will be installed (customer supplied Revit design required). This makes planning clear for decision-makers and stakeholders.",
  },
  {
    id: "can-barriers-be-installed-without-drilling-into",
    category: "installation-planning",
    question: "Can barriers be installed without drilling into floors?",
    answer: "In some cases, temporary or surface-mounted solutions can be provided. However, for maximum impact protection, anchoring barriers to the floor ensures full crash-tested performance. We also have special slider base plates to allow for full impact performance along with the ability to easily remove barriers without any tools e.g. for periodic maintenance etc.",
  },
  // Maintenance & Durability
  {
    id: "are-a-safe-barriers-maintenance-free",
    category: "maintenance-durability",
    question: "Are A‑SAFE barriers maintenance-free?",
    answer: "Unlike steel barriers, A‑SAFE barriers don't rust, need repainting, or warp after impact. Periodic visual checks are all that's needed, but we can also provide periodic inspections or training for your teams on site.",
  },
  {
    id: "what-s-the-lifespan-of-a-polymer",
    category: "maintenance-durability",
    question: "What's the lifespan of a polymer barrier?",
    answer: "A‑SAFE barriers typically last years longer than steel alternatives because they absorb impacts rather than bend or break. They retain their strength and appearance even in demanding environments.",
  },
  {
    id: "do-you-provide-training-for-barrier-inspection",
    category: "maintenance-durability",
    question: "Do you provide training for barrier inspection?",
    answer: "Absolutely. We provide guidance and optional training for your staff to carry out periodic visual inspections, ensuring your system performs optimally.",
  },
  {
    id: "how-do-i-know-when-it-s",
    category: "maintenance-durability",
    question: "How do I know when it's time to replace a barrier?",
    answer: "Polymer barriers are highly durable and self‑recover after impact, but if a barrier has sustained a major hit, it should be inspected. We provide clear guidelines and can offer inspections to confirm integrity.",
  },
  {
    id: "what-happens-if-an-a-safe-barrier",
    category: "maintenance-durability",
    question: "What happens if an A‑SAFE barrier is hit multiple times?",
    answer: "Our unique polymer design absorbs impacts and flexes back into shape. Repeated minor impacts typically cause no damage. After severe or repeated collisions in the same spot, the barrier can be inspected and individual parts replaced as and when may be necessary.",
  },
  // Applications & Industries
  {
    id: "what-industries-are-a-safe-barriers-suitable",
    category: "applications-industries",
    question: "What industries are A‑SAFE barriers suitable for?",
    answer: "Our barriers are used across logistics, food & drink, automotive, airports, manufacturing, and pharmaceuticals. Any industry that values the protection of people, assets, and infrastructure can benefit from A‑SAFE systems.",
  },
  {
    id: "can-barriers-integrate-with-other-safety-systems",
    category: "applications-industries",
    question: "Can barriers integrate with other safety systems?",
    answer: "Yes. We can integrate barriers with gates, access control, and warning signage. Our solutions can also be designed to complement automated systems like sensors or traffic lights.",
  },
  {
    id: "can-barriers-help-protect-sensitive-machinery-or",
    category: "applications-industries",
    question: "Can barriers help protect sensitive machinery or infrastructure?",
    answer: "Absolutely. We offer barriers and bollards specifically designed to shield machinery, control panels, conveyors, columns, and even building walls from impact damage.",
  },
  {
    id: "are-there-options-for-outdoor-use-loading",
    category: "applications-industries",
    question: "Are there options for outdoor use (loading bays, car parks)?",
    answer: "Yes. A‑SAFE provides outdoor‑rated barriers and bollards with UV protection and weather-resistant finishes. These are ideal for truck yards, car parks, and external walkways.",
  },
  {
    id: "are-barriers-resistant-to-chemicals-oils-and",
    category: "applications-industries",
    question: "Are barriers resistant to chemicals, oils, and weather?",
    answer: "Our advanced polymers are resistant to most chemicals, oils, and fuels. Outdoor barrier solutions also include UV stabilizers to withstand weather without fading or degrading.",
  },
  {
    id: "are-there-lightweight-options-for-low-speed",
    category: "applications-industries",
    question: "Are there lightweight options for low-speed areas?",
    answer: "Yes. We offer a range of barrier types, from lightweight pedestrian guides for low-speed areas to heavy-duty systems for high-traffic, high-impact zones.",
  },
  // Flexibility & Customization
  {
    id: "can-barriers-be-moved-if-my-layout",
    category: "flexibility-customization",
    question: "Can barriers be moved if my layout changes?",
    answer: "Yes. A‑SAFE barriers are modular and can be relocated or reconfigured as your facility changes, making them a flexible long-term investment.",
  },
  {
    id: "can-a-safe-barriers-be-customized-in",
    category: "flexibility-customization",
    question: "Can A‑SAFE barriers be customized in color or design?",
    answer: "Yes. Our barriers are available in a range of high‑visibility standard colors, and we also offer custom colors to match your corporate branding or site requirements (custom colours may incur additional fees for production).",
  },
  {
    id: "what-are-the-environmental-benefits-of-polymer",
    category: "flexibility-customization",
    question: "What are the environmental benefits of polymer barriers?",
    answer: "Our barriers are 100% recyclable and have a longer lifespan than steel, which reduces material waste. Lower replacement frequency also means fewer resources consumed over the life of your system.",
  },
  // Business & ROI
  {
    id: "how-do-barriers-help-with-insurance-compliance",
    category: "business-roi",
    question: "How do barriers help with insurance compliance?",
    answer: "Properly installed, crash-tested barriers reduce risks, which can support compliance with insurer requirements and in some cases help reduce premiums.",
  },
  {
    id: "can-barriers-prevent-vehicle-downtime-costs",
    category: "business-roi",
    question: "Can barriers prevent vehicle downtime costs?",
    answer: "Yes. Barriers absorb impacts to protect vehicles from major structural damage, which reduces repair costs, downtime, and productivity losses.",
  },
  {
    id: "what-s-the-typical-payback-period-for",
    category: "business-roi",
    question: "What's the typical payback period for an A‑SAFE system?",
    answer: "Most clients see a return on investment within 18–24 months through reduced repairs, downtime, and accident costs. Many report savings that continue for years after installation.",
  },
  {
    id: "how-do-i-get-a-budget-estimate",
    category: "business-roi",
    question: "How do I get a budget estimate before a site visit?",
    answer: "You can request an initial estimate by sharing site layouts and vehicle details with us. For accurate pricing, a site assessment is recommended, but we can give rough costs quickly based on your basic information.",
  },
  {
    id: "can-i-start-with-a-small-project",
    category: "business-roi",
    question: "Can I start with a small project and expand later?",
    answer: "Yes. Many clients start with a pilot area or high‑risk zone. As they see the results, they expand coverage. A‑SAFE barriers are modular and easy to extend as needed.",
  },
  // Assessment & Support
  {
    id: "how-do-i-know-which-barrier-strength",
    category: "assessment-support",
    question: "How do I know which barrier strength I need?",
    answer: "We assess your site for factors such as vehicle weight, speed, and traffic flow. From this, we recommend a barrier system engineered to absorb the specific impact forces in your facility. We can also share some indicative potential impact forces based upon your vehicle details when input into our impact calculator.",
  },
  {
    id: "how-do-barriers-affect-warehouse-traffic-flow",
    category: "assessment-support",
    question: "How do barriers affect warehouse traffic flow?",
    answer: "Properly planned barrier systems guide safe vehicle and pedestrian movement, making facilities more organized. This reduces congestion, improves flow, and minimizes near-misses.",
  },
  {
    id: "how-do-i-request-a-free-consultation",
    category: "assessment-support",
    question: "How do I request a free consultation?",
    answer: "Simply fill out our online form or call your nearest A‑SAFE office. One of our safety specialists will contact you to arrange a site visit or virtual assessment at a convenient time.",
  },
  {
    id: "do-you-work-internationally",
    category: "assessment-support",
    question: "Do you work internationally?",
    answer: "A‑SAFE has a global presence with offices and partners in multiple regions. We supply and install barrier solutions worldwide, adapting to local standards and languages.",
  },
  // App Usage & Platform
  {
    id: "how-does-the-impact-calculator-help-me",
    category: "app-usage-platform",
    question: "How does the Impact Calculator help me choose the right barriers?",
    answer: "The Impact Calculator uses PAS 13 methodology to calculate kinetic energy based on your vehicle specifications (weight, speed, turning angles). It provides instant product recommendations with impact ratings and safety margins, eliminating guesswork and ensuring you select barriers engineered for your specific application.",
  },
  {
    id: "what-makes-the-a-safe-engage-product",
    category: "app-usage-platform",
    question: "What makes the A-SAFE ENGAGE product catalog better than traditional catalogs?",
    answer: "Our interactive catalog features real product data, authentic imagery, detailed specifications, and impact ratings. You can filter by industry, application, and impact requirements while viewing live pricing in multiple currencies. Each product includes comprehensive technical details and installation guides.",
  },
  {
    id: "how-do-case-studies-on-the-platform",
    category: "app-usage-platform",
    question: "How do case studies on the platform help me make better decisions?",
    answer: "Case studies provide real-world examples from your industry with authentic video content from A-SAFE's projects. You can see actual implementations, measurable outcomes, and ROI data from similar facilities. Filter by industry to find relevant applications and proven results that support your business case.",
  },
  {
    id: "what-resources-are-available-in-the-app",
    category: "app-usage-platform",
    question: "What resources are available in the app to support my projects?",
    answer: "The Resources section includes installation guides, technical certificates, CAD drawings, BIM objects, and video tutorials. All resources are categorized by product line and downloadable. You also get access to A-SAFE's virtual product space and factory tour for immersive learning.",
  },
  {
    id: "how-does-the-cart-system-help-me",
    category: "app-usage-platform",
    question: "How does the cart system help me manage multiple projects?",
    answer: "The intelligent cart system supports multi-currency pricing, automatic discount calculations, and quantity-based pricing tiers. It includes VAT calculations, delivery costs, and installation estimates. You can save carts for different projects and generate detailed quotes with all project specifications.",
  },
  {
    id: "can-i-save-and-track-my-calculations",
    category: "app-usage-platform",
    question: "Can I save and track my calculations for future reference?",
    answer: "Yes! The Calculations History feature saves all your impact calculations with full details including vehicle specs, recommended products, and safety margins. You can revisit previous calculations, modify parameters, and use them as templates for similar projects, building your personal library of solutions.",
  },
  {
    id: "how-does-the-quote-request-feature-streamline",
    category: "app-usage-platform",
    question: "How does the quote request feature streamline my procurement process?",
    answer: "Quote requests automatically pull your user profile data, selected products, and calculation results. The system generates comprehensive technical specifications and submits directly to A-SAFE experts. You get faster, more accurate quotes with all technical details pre-populated, reducing back-and-forth communication.",
  },
  {
    id: "what-advantages-does-the-mobile-app-experience",
    category: "app-usage-platform",
    question: "What advantages does the mobile app experience offer?",
    answer: "The mobile-optimized platform lets you access calculations, product specs, and resources on-site. Touch-friendly interface allows quick barrier selection during facility walks, instant access to installation guides, and the ability to share technical data with your team immediately.",
  },
  {
    id: "how-does-my-user-profile-enhance-my",
    category: "app-usage-platform",
    question: "How does my user profile enhance my experience?",
    answer: "Your profile stores company information, preferences, and project history. It automatically populates quote forms, personalizes product recommendations, and maintains your discount tier status. The system learns your usage patterns to surface relevant content and streamline repeat processes.",
  },
  {
    id: "how-does-the-platform-save-me-time",
    category: "app-usage-platform",
    question: "How does the platform save me time compared to traditional methods?",
    answer: "ENGAGE eliminates multiple steps: instant impact calculations vs. manual engineering, immediate product filtering vs. catalog browsing, one-click quote requests vs. phone calls and emails, downloadable resources vs. requesting documents, and real-time pricing vs. waiting for quotes. Users typically save 60-80% of procurement time.",
  },
];
