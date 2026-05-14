#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Add a 3-day free trial to all subscription plans on ShapeUp.
  - Card required up front (payment_method_collection=always)
  - Auto-renews after 3 days at the chosen plan's price
  - One trial per user (tracked via users.has_used_trial)
  - UI must explicitly show "3 Days Free Trial" and the disclaimer:
    "Cancel anytime before the trial ends to avoid being charged."

backend:
  - task: "Subscription plans endpoint exposes trial_days and trial_eligible"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/subscription/plans now returns trial_days=3 and trial_eligible based on user.has_used_trial."
      - working: true
        agent: "testing"
        comment: "Verified via /app/backend_test.py against external URL. Fresh user → trial_days=3, trial_eligible=true, 3 plans returned (monthly £3.99, sixmonths £19.99, yearly £34.99) with correct keys/amounts/display. After flipping users.has_used_trial=true in Mongo, same endpoint returns trial_eligible=false. PASS."

  - task: "Stripe checkout session creates a 3-day trial for trial-eligible users"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/subscription/checkout sets subscription_data.trial_period_days=3 when !has_used_trial, payment_method_collection='always'. Returns trial_days in response. Sets has_used_trial=True after first successful payment confirmation (poll). Verify (a) first checkout for a fresh user returns trial_days=3 (b) repeat checkout after marking has_used_trial returns trial_days=0."
      - working: true
        agent: "testing"
        comment: "POST /api/subscription/checkout tested against external URL with Stripe emergent proxy. For trial-eligible fresh user, all three plans (monthly/sixmonths/yearly) returned HTTP 200 with trial_days=3, recurring=true, valid session_id, and url containing 'integrations.emergentagent.com'. After flipping has_used_trial=true in Mongo, monthly checkout returned trial_days=0 as expected. Backend logs confirm Stripe API 200 responses. PASS."
      - working: true
        agent: "testing"
        comment: "Regression: GET /api/subscription/status (fresh + subscribed), GET /api/workouts/today, GET /api/exercises/library, POST /api/chat (LLM) all return 200 for the subscribed test@cy.com user. PASS."

frontend:
  - task: "Subscribe screen shows 3-day free trial UI and disclaimer"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/subscribe.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Trial banner with badge, plan cards now show '£0.00 / FREE for 3 days / then £X' for trial-eligible users, CTA reads 'START 3-DAY FREE TRIAL', explicit cancel disclaimer rendered. Verified visually via screenshot."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 6
  run_ui: false

test_plan:
  current_focus:
    - "Subscription plans endpoint exposes trial_days and trial_eligible"
    - "Stripe checkout session creates a 3-day trial for trial-eligible users"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Please verify the 3-day free trial backend flow only. (1) Register a fresh user, hit GET /api/subscription/plans → expect trial_days=3, trial_eligible=true. (2) POST /api/subscription/checkout with plan='monthly' → expect 200, url containing 'checkout.stripe.com', trial_days=3 in the response body. (3) Flip user.has_used_trial=true in Mongo and POST /api/subscription/checkout again → expect trial_days=0. Use test credentials from /app/memory/test_credentials.md or create a new user. Do NOT run frontend tests."
  - agent: "testing"
    message: "Ran /app/backend_test.py against external base URL (slim-challenge-5.preview.emergentagent.com). 11/11 backend checks PASS. (a) Fresh user GET /api/subscription/plans → trial_days=3, trial_eligible=true, all 3 plans correct (£3.99/£19.99/£34.99). (b) POST /api/subscription/checkout for monthly/sixmonths/yearly each return 200 with trial_days=3, recurring=true, non-empty session_id, and url on integrations.emergentagent.com (emergent Stripe proxy). (c) After flipping users.has_used_trial=true in Mongo (db: changeyourself_db), GET /api/subscription/plans returns trial_eligible=false and POST /api/subscription/checkout monthly returns trial_days=0. (d) Regression endpoints all 200: GET /api/subscription/status (fresh + subscribed), GET /api/workouts/today, GET /api/exercises/library, POST /api/chat (used /api/chat — note request said /api/chat/send which does not exist in server.py; the implemented route is /api/chat). No 4xx/5xx observed. Backend logs confirm Stripe and LLM calls succeeded."
