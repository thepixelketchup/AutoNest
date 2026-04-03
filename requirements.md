# Product Requirements Document (PRD) & Technical Specifications
**Project Name:** AutoNest (Home Expenses & Direct Debit Tracker)
**Target Platform:** Web Application (Mobile-Responsive)

## 1. Project Overview
AutoNest is a web application designed to help households track recurring monthly fixed costs and monitor whether automatic direct debits (*automatische incasso*) have cleared. The MVP handles multi-user household syncing, manual transaction matching, variance tracking for fluctuating bills, and CSV bank statement imports.

## 2. Tech Stack
* **Frontend Framework:** React (Functional components, Hooks)
* **Styling:** Tailwind CSS
* **Routing:** React Router DOM
* **Backend as a Service (BaaS):** Firebase (Authentication, Firestore, Hosting)
* **State Management:** React Context API 
* **Build Tool:** Vite
* **CSV Parsing:** `papaparse` (for in-browser bank statement parsing)

## 3. Firebase Data Model (Firestore NoSQL)
The database follows a NoSQL structure optimized for fast reads at the household level.

| Collection | Document Fields | Description |
| :--- | :--- | :--- |
| **Users** | `uid`, `email`, `displayName`, `householdId` | Links authenticated users to a specific household. |
| **Households** | `id`, `name`, `joinCode`, `createdAt` | The central entity grouping users and bills together. |
| **Bills** | `id`, `householdId`, `name`, `expectedAmount`, `expectedDay`, `category` | The recurring template for a monthly expense. |
| **Transactions** | `id`, `billId`, `householdId`, `month`, `year`, `status`, `actualAmount`, `varianceReason`, `source`, `rawBankDescription` | The specific instance of a bill for a given month. Status is "pending" or "cleared". `source` tracks if it was added manually or via CSV. |

## 4. Authentication & Onboarding Flow
* **Authentication:** Email/Password and Google Sign-In via Firebase Auth. Protected routes.
* **Household Setup:** Post-login, users must "Create a New Household" (generates a 6-character `joinCode`) or "Join an Existing Household" (inputs a `joinCode`).
* **Initial Setup:** Household creators are prompted to add their first 3 recurring bills to populate the dashboard.

## 5. Dashboard Functional Requirements
* **Top-Level Metrics:** Total Expected, Total Cleared, Amount Remaining, and a Variance Alert (red/warning if total `actualAmount` > `expectedAmount`).
* **Visuals:** A progress bar showing the percentage of bills cleared for the month, and a mini-timeline of upcoming debits for the next 7 days.
* **Alerts:** A "Requires Attention" section for overdue pending bills and bills that cleared with an overcharge variance.

## 6. Bill Tracking & Transaction Matching (Core Loop)
* **The Monthly Ledger:** A list of all bills for the active month, sorted by `expectedDay`. Shows Name, Expected Amount, and Status (Pending/Cleared).
* **Manual Matching:** When marking a bill as "Cleared", pre-fill an `actualAmount` input with the `expectedAmount`. 
* **Variance Logic:** If `actualAmount` > `expectedAmount`, require a "Reason for Overcharge" (tags like "Late Fee", "High Usage" + free text).

## 7. Bank Statement Import (MVP 1)
* **Upload:** Drag-and-drop zone for `.csv` files.
* **Parsing:** Use `papaparse` to convert CSV to JSON entirely in the browser. Do not upload the raw file to Firebase.
* **Mapping UI:** Allow users to map their bank's CSV columns to "Date", "Name/Counterparty", and "Amount".
* **Auto-Matching Engine:** * Try to match imported transactions to "Pending" bills based on Counterparty Name (contains the bill name) and Date (within 5 days of `expectedDay`).
    * Show a split-screen: Unmatched Pending Bills (Left) vs. Imported Transactions (Right).
    * Allow users to approve auto-matches with one click, or manually drag/select to link them.

## 8. Future Scope & MVP 2 (AI Integration)
The following features are slated for V2 and will utilize the **Gemini API** and Open Banking integrations:
* **Smart Categorization & Matching:** Instead of basic string matching for CSV imports, send the `rawBankDescription` to Gemini to accurately identify the merchant, categorize the expense, and match it to a household bill, even if the names don't perfectly align.
* **Invoice/Receipt Scanning:** Allow users to upload a photo of a utility bill (e.g., annual energy settlement). Gemini Vision will extract the total amount owed, the due date, and detect if it's a refund or an overcharge.
* **Financial Insights Chat:** A chat interface where users can ask, "How are our utility bills trending this year compared to last?" Gemini will query the user's Firestore data to provide plain-language financial insights and warnings about upcoming cash flow bottlenecks.
* **Bunq API:** Direct OAuth connection to Bunq for automated, daily transaction syncing, replacing the manual CSV upload.

## 9. Technical Requirements & Best Practices
* **Component Abstraction:** Keep Firebase logic inside `services/firebase.js`. UI components must not contain direct Firebase SDK calls.
* **Mobile-First:** Design all layouts for mobile screens first using Tailwind CSS, scaling up to multi-column desktop views.
* **Security:** Implement Firestore Security Rules enforcing that users can only read/write documents where the `householdId` matches their user document.

---

## 10. AI Agent Development & Git Workflow
**CRITICAL INSTRUCTION FOR THE AI AGENT:** You must build this project incrementally. Do not attempt to write the entire application in a single output. After completing each step below, you **MUST** run the corresponding `git commit` command to save the state before moving to the next step.

* **Step 1: Scaffolding & Setup**
    * Initialize Vite React app, install Tailwind CSS, React Router, Papa Parse, and Firebase SDK. Set up the folder structure (`components/`, `pages/`, `services/`, `hooks/`).
    * *Command:* `git commit -m "chore: initial setup with Vite, Tailwind, and folder structure"`
* **Step 2: Firebase Configuration & Auth Layer**
    * Setup `firebase.js` config. Build the Login/Signup pages and the Google Auth integration. Set up the Auth Context to protect routes.
    * *Command:* `git commit -m "feat: implement Firebase authentication and protected routes"`
* **Step 3: Household Onboarding Flow**
    * Build the "Create/Join Household" logic, generating join codes, and saving User/Household documents to Firestore.
    * *Command:* `git commit -m "feat: add household creation and join code logic"`
* **Step 4: Core UI & Dashboard Shell**
    * Build the navigation (sidebar/bottom bar), the empty Dashboard layout, and the shared UI components (Cards, Buttons, Modals).
    * *Command:* `git commit -m "feat: build dashboard UI shell and reusable components"`
* **Step 5: Bill CRUD & Manual Matching Logic**
    * Implement the ability to add, edit, and delete recurring Bills. Implement the logic to mark a bill as cleared, including the Variance/Overcharge modal.
    * *Command:* `git commit -m "feat: implement bill management and manual transaction matching with variance logic"`
* **Step 6: CSV Import Engine**
    * Build the drag-and-drop CSV uploader using Papa Parse. Implement the column mapping UI and the basic auto-matching split-screen interface.
    * *Command:* `git commit -m "feat: add CSV bank statement import and auto-matching UI"`
* **Step 7: Polish & Security**
    * Write Firestore Security Rules. Ensure mobile responsiveness across all pages. Add loading states and error toasts.
    * *Command:* `git commit -m "fix: apply firestore security rules and UI polish"`