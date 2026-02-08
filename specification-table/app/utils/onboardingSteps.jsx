/**
 * Configuration for onboarding tour steps
 * Each step defines:
 * - route: The page where this step should be shown
 * - target: CSS selector for the element to highlight
 * - placement: Where to position the tooltip (top, bottom, left, right, center)
 * - title: Step title
 * - content: Step description (can be string or React component)
 * - info: Optional additional info box
 * - onNext: Optional callback when moving to next step
 * - disableOverlay: If true, overlay won't block interactions
 * - allowOverlayClick: If true, clicking overlay will close
 */

export const onboardingSteps = [
  // Step 1: Welcome on Home page
  {
    route: "/app",
    target: null, // Center on screen
    placement: "center",
    stepNumber: 1,
    title: "Welcome to SmartSpecs Table! 👋",
    content: "Let's get you started with a quick tour. We'll guide you through creating your first specification table template.",
    info: "This tour will take about 5 minutes. You can skip it anytime. You can interact with the page while this guide is active.",
    disableOverlay: true,
  },

  // Step 2: Select Theme
  {
    route: "/app",
    target: 's-text[data-onboarding="step1-title"]',
    placement: "bottom",
    stepNumber: 2,
    title: "Select Your Theme",
    content: "Scroll down to the 'Select Theme' section in the Setup Guide. Click on one of the theme cards to select it.",
    scrollToSection: true,
    info: "The extension will be added to this theme. You can change it later if needed. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: true,
    scrollToSection: true, // Flag pentru scroll automat la secțiune
  },

  // Step 3: Apply Extension
  {
    route: "/app",
    target: 's-text[data-onboarding="step2-title"]',
    placement: "bottom",
    stepNumber: 3,
    title: "Apply the Extension",
    content: "Scroll to the 'Apply & Activate Extension' section in the Setup Guide. After you've applied and activated the extension in the theme editor, click the button 'I have applied and activated the extension'.",
    info: "You'll need to activate it in the theme editor after applying. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: true,
    scrollToSection: true, // Flag pentru scroll automat la secțiune
  },

  // Step 4: Navigate to Templates
  {
    route: "/app",
    target: 's-link[data-onboarding="templates-link"], a[data-onboarding="templates-link"]',
    placement: "bottom",
    stepNumber: 4,
    title: "Create Your First Template",
    content: "Now let's create your first template. Click on 'Templates' in the navigation menu at the top to go to the templates page. We'll wait for you to navigate there.",
    info: "A template defines the structure and styling of your specification tables. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false, // NU face redirect automat
  },

  // Step 5: Create Template Button
  {
    route: "/app/templates",
    target: 's-button[data-onboarding="create-template"], button[data-onboarding="create-template"]',
    placement: "bottom",
    stepNumber: 5,
    title: "Create a New Template",
    content: "Click the '+ Create New Template' button to start building your first specification table template. We'll wait for you to click it.",
    info: "You can create multiple templates for different products or collections. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false, // NU face redirect automat când dai Next
  },

  // Step 6: Template Name
  {
    route: "/app/templates/new",
    target: 's-text-field[data-onboarding="template-name-input"]',
    placement: "bottom",
    stepNumber: 6,
    title: "Name Your Template",
    content: "Give your template a descriptive name. This helps you identify it later when assigning it to products. You can type in this field now.",
    info: "Example: 'Product Specifications' or 'Technical Details'. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: true, // Permite navigare automată pentru a ajunge pe pagina corectă
    scrollToSection: true, // Flag pentru scroll automat la input
  },

  // Step 7: Section Name
  {
    route: "/app/templates/new",
    target: 's-text-field[data-onboarding="section-name-input"]',
    placement: "bottom",
    stepNumber: 7,
    title: "Name Your Section",
    content: "Each section needs a title. Give your first section a descriptive name, like 'Product Details' or 'Specifications'. You can type in this field now.",
    info: "Sections help organize your metafields into logical groups. You can add more sections later. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
  },

  // Step 8: Add Metafields
  {
    route: "/app/templates/new",
    target: 's-button[data-onboarding="add-metafields"], s-button[data-onboarding="add-product-spec"], s-button[data-onboarding="add-custom-spec"]',
    placement: "bottom",
    stepNumber: 8,
    title: "Add Specifications to Your Template",
    content: "You have three options to add specifications to your template:",
    info: (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0 }}>
          <strong>• Add metafields specification:</strong> Select from your existing Shopify metafields (custom fields you've created). These can store data like dimensions, materials, care instructions, etc.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Add Product Specification:</strong> Use Shopify's built-in product specifications like weight, dimensions, or other standard product attributes.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Add Custom Specification:</strong> Create your own custom specification with a name and value that you define manually.
        </p>
        <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#6D7175" }}>
          You can add multiple specifications of any type. You can interact with the page while this guide is active.
        </p>
      </div>
    ),
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
    highlightMultiple: true, // Flag pentru highlight pe mai multe elemente
    wideTooltip: true, // Flag pentru tooltip mai lat
  },

  // Step 9: Add Sections
  {
    route: "/app/templates/new",
    target: 's-button[data-onboarding="add-section"]',
    placement: "bottom",
    stepNumber: 9,
    title: "Organize with Sections",
    content: "You can create multiple sections to organize your specifications. Click 'Add New Section' to create additional sections. Each section can have its own title and contain different specifications.",
    info: "For example, you might create sections like 'Product Details', 'Care Instructions', 'Technical Specifications', etc. This helps organize information and makes it easier for customers to find what they need. You can add as many sections as you want. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
  },

  // Step 10: Customize Specifications
  {
    route: "/app/templates/new",
    target: 'table tbody tr:first-child td:last-child',
    placement: "bottom",
    stepNumber: 10,
    title: "Customize Your Specifications",
    content: "After adding specifications, you can customize each one by clicking on it. You'll see options to:",
    info: (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0 }}>
          <strong>• Display Options:</strong> Hide specifications from PC only or Mobile only. This lets you show different information on different devices.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Tooltip:</strong> Add helpful tooltips that appear when customers hover over or click on a specification. Great for explaining technical terms or providing additional context.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Prefix & Suffix:</strong> Add text before or after the value (e.g., prefix "Weight: " or suffix " kg"). This helps format your specifications nicely.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Custom Name:</strong> Override the default name of a specification to make it more user-friendly for your customers.
        </p>
        <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#6D7175" }}>
          Click on any specification you've added to see these options. You can interact with the page while this guide is active.
        </p>
      </div>
    ),
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
    wideTooltip: true, // Flag pentru tooltip mai lat
  },

  // Step 11: Apply Styling
  {
    route: "/app/templates/new",
    target: 'div[data-onboarding="styles-preview-container"]',
    placement: "bottom",
    stepNumber: 11,
    title: "Apply Styling to Your Template",
    content: "You can customize the appearance of your specification table with various styling options. Scroll down to the styling section to see all available options:",
    info: (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0 }}>
          <strong>• Device-Specific Styling:</strong> Apply different styles for Mobile, Tablet, and Desktop devices. This allows you to optimize the appearance for each device type.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Colors & Typography:</strong> Customize colors for headers, text, borders, and backgrounds. Adjust font sizes and weights to match your brand.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Layout Options:</strong> Choose between different layouts like split view per section or per metafield. Control spacing, borders, and alignment.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Live Preview:</strong> See your changes in real-time in the preview panel on the right. This helps you visualize how your table will look on the storefront.
        </p>
        <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#6D7175" }}>
          All styling changes are saved automatically. You can interact with the page while this guide is active.
        </p>
      </div>
    ),
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
    wideTooltip: true, // Flag pentru tooltip mai lat
  },

  // Step 12: Display Settings
  {
    route: "/app/templates/new",
    target: 's-section[data-onboarding="display-settings-section"]',
    placement: "bottom",
    stepNumber: 12,
    title: "Display Settings",
    content: "Configure how your specification table is displayed to customers. You can choose different layout options:",
    info: (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0 }}>
          <strong>• Collapsible sections (expandable):</strong> Allow customers to expand and collapse sections. Great for organizing long lists of specifications.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Split View per Section:</strong> Distribute sections across two columns. This makes better use of horizontal space on desktop devices.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Split View per Metafield:</strong> Distribute individual metafields across two columns within each section. Useful for compact displays.
        </p>
        <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#6D7175" }}>
          Note: Split view options are not applied on mobile devices. You can interact with the page while this guide is active.
        </p>
      </div>
    ),
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
    wideTooltip: true, // Flag pentru tooltip mai lat
  },

  // Step 13: Collapsible Table
  {
    route: "/app/templates/new",
    target: 's-switch[data-onboarding="collapsible-table-switch"]',
    placement: "bottom",
    stepNumber: 13,
    title: "Collapsible Table Option",
    content: "Enable the collapsible table feature to allow customers to show or hide the entire specification table with a single click:",
    info: (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ margin: 0 }}>
          <strong>• Collapsible table:</strong> When enabled, customers can collapse or expand the entire table. This is useful for product pages with lots of content.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Device-specific options:</strong> After enabling, you can choose to show the collapsible feature only on Desktop or only on Mobile devices.
        </p>
        <p style={{ margin: 0 }}>
          <strong>• Table name:</strong> You can customize the table name that appears above the specifications. This name is also used as the collapse/expand button text.
        </p>
        <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#6D7175" }}>
          This feature is mutually exclusive with collapsible sections and "See More" options. You can interact with the page while this guide is active.
        </p>
      </div>
    ),
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
    wideTooltip: true, // Flag pentru tooltip mai lat
  },

  // Step 14: Save Template
  {
    route: "/app/templates/new",
    target: '#save-bar button[variant="primary"]',
    placement: "top",
    stepNumber: 14,
    title: "Save Your Template",
    content: "Once you've configured your template, click 'Save' in the contextual save bar at the top to save it. You'll be redirected to the templates page where you can assign it.",
    info: "Don't worry if you forget something - you can always edit templates later. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
    scrollToSection: true,
  },

  // Step 15: Assign Template
  {
    route: "/app/templates",
    target: 's-button[variant="primary"]',
    placement: "bottom",
    stepNumber: 15,
    title: "Assign Your Template",
    content: "Now let's assign your template to products or collections. Click 'Show' on your template to open the assignment options.",
    info: "You can assign templates to specific products, entire collections, or set one as global (shown on all products). You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
  },

  // Step 16: Assignment Type
  {
    route: "/app/templates",
    target: '[data-onboarding="assignment-type"]',
    placement: "bottom",
    stepNumber: 16,
    title: "Choose Assignment Type",
    content: "Select how you want to assign this template: to specific products, to collections, or as a global template.",
    info: "Global templates appear on all products. Product/Collection assignments are more specific and take priority. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
  },

  // Step 17: Select Products/Collections
  {
    route: "/app/templates",
    target: '[data-onboarding="select-targets"]',
    placement: "bottom",
    stepNumber: 17,
    title: "Select Products or Collections",
    content: "Use the search to find and select the products or collections where you want this template to appear.",
    info: "You can select multiple items. The template will appear on all selected products/collections. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
  },

  // Step 18: Save Assignment
  {
    route: "/app/templates",
    target: '[data-onboarding="save-assignment"]',
    placement: "top",
    stepNumber: 18,
    title: "Save Your Assignment",
    content: "Click 'Save' to apply the assignment. Your specification table will now appear on the selected products!",
    info: "Changes may take a few moments to appear on your storefront. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
  },

  // Step 19: Test on Storefront
  {
    route: "/app",
    target: '[data-onboarding="test-storefront"]',
    placement: "bottom",
    stepNumber: 19,
    title: "Test on Your Storefront",
    content: "Visit one of your product pages on your storefront to see your specification table in action!",
    info: "If you don't see it, make sure the extension is activated in your theme editor. You can interact with the page while this guide is active.",
    disableOverlay: true,
    allowAutoNavigate: false,
  },

  // Step 20: Completion
  {
    route: "/app",
    target: null,
    placement: "center",
    stepNumber: 20,
    title: "Congratulations! 🎉",
    content: "You've successfully set up your first specification table! You can now create more templates and customize them to fit your needs.",
    info: "Need help? Check the documentation or contact support.",
    disableOverlay: true,
    allowAutoNavigate: false,
  },
];
