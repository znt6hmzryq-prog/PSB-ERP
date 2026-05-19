-- Seed data for PSB-ERP
-- Tenants
INSERT INTO tenants (name, slug, domain, plan, status, settings) VALUES
('Pioneer Travel Agency', 'pioneer-travel', 'pioneer.psb-erp.com', 'enterprise', 'active', '{"currency":"USD","timezone":"America/New_York","language":"en"}'),
('Global Wings Travel', 'global-wings', 'globalwings.psb-erp.com', 'professional', 'active', '{"currency":"EUR","timezone":"Europe/London","language":"en"}');

-- Users
INSERT INTO users (unionId, tenant_id, name, email, role, status, department, phone, last_sign_in_at) VALUES
('admin-001', 1, 'Alexandra Chen', 'alex.chen@pioneer-travel.com', 'admin', 'active', 'Management', '+1-555-0101', NOW()),
('manager-001', 1, 'Marcus Johnson', 'marcus.j@pioneer-travel.com', 'manager', 'active', 'Operations', '+1-555-0102', NOW()),
('accountant-001', 1, 'Sarah Williams', 'sarah.w@pioneer-travel.com', 'accountant', 'active', 'Finance', '+1-555-0103', NOW()),
('agent-001', 1, 'David Kim', 'david.kim@pioneer-travel.com', 'agent', 'active', 'Sales', '+1-555-0104', NOW()),
('agent-002', 1, 'Emily Rodriguez', 'emily.r@pioneer-travel.com', 'agent', 'active', 'Sales', '+1-555-0105', NOW()),
('viewer-001', 1, 'James Taylor', 'james.t@pioneer-travel.com', 'viewer', 'active', 'Support', '+1-555-0106', NOW());

-- Roles
INSERT INTO roles (tenant_id, name, slug, description, permissions, is_system) VALUES
(1, 'Administrator', 'admin', 'Full system access', '["*"]', true),
(1, 'Manager', 'manager', 'Manage operations and teams', '["dashboard:read","tickets:*","crm:*","expenses:*","accounting:read","reports:*","wallet:*"]', true),
(1, 'Accountant', 'accountant', 'Financial operations', '["dashboard:read","accounting:*","expenses:*","wallet:*","reports:read"]', true),
(1, 'Travel Agent', 'agent', 'Ticket sales and CRM', '["dashboard:read","tickets:*","crm:*","expenses:create"]', true);

-- Wallets
INSERT INTO wallets (tenant_id, user_id, name, currency, balance, reserved_balance, status) VALUES
(1, 1, 'Main Operating Account', 'USD', 125000.00, 5000.00, 'active'),
(1, 2, 'Sales Commission Pool', 'USD', 45000.00, 2000.00, 'active'),
(1, 3, 'Petty Cash', 'USD', 5000.00, 0.00, 'active'),
(1, 4, 'Client Deposits', 'USD', 78000.00, 15000.00, 'active'),
(1, NULL, 'Refund Reserve', 'USD', 25000.00, 25000.00, 'active');

-- Airlines
INSERT INTO airlines (tenant_id, code, name, iata_code, icao_code, contact_email, contact_phone, status) VALUES
(1, 'AA', 'American Airlines', 'AA', 'AAL', 'support@aa.com', '+1-800-433-7300', 'active'),
(1, 'DL', 'Delta Air Lines', 'DL', 'DAL', 'support@delta.com', '+1-800-221-1212', 'active'),
(1, 'UA', 'United Airlines', 'UA', 'UAL', 'support@united.com', '+1-800-864-8331', 'active'),
(1, 'BA', 'British Airways', 'BA', 'BAW', 'support@ba.com', '+44-344-493-0787', 'active'),
(1, 'EK', 'Emirates', 'EK', 'UAE', 'support@emirates.com', '+971-4-295-4444', 'active'),
(1, 'LH', 'Lufthansa', 'LH', 'DLH', 'support@lufthansa.com', '+49-69-867-99400', 'active'),
(1, 'AF', 'Air France', 'AF', 'AFR', 'support@airfrance.com', '+33-1-57-02-1000', 'active'),
(1, 'SQ', 'Singapore Airlines', 'SQ', 'SIA', 'support@singaporeair.com', '+65-6788-6868', 'active');

-- Customers
INSERT INTO customers (tenant_id, customer_code, first_name, last_name, email, phone, company, job_title, customer_type, status, total_bookings, total_revenue, last_booking_date, assigned_to) VALUES
(1, 'CUST-001', 'John', 'Smith', 'john.smith@techcorp.com', '+1-555-1001', 'TechCorp Inc.', 'CTO', 'corporate', 'vip', 24, 48500.00, '2026-04-15', 4),
(1, 'CUST-002', 'Maria', 'Garcia', 'maria.g@globalmedia.com', '+1-555-1002', 'Global Media', 'Director', 'corporate', 'active', 15, 32000.00, '2026-04-20', 4),
(1, 'CUST-003', 'Robert', 'Anderson', 'robert.a@gmail.com', '+1-555-1003', NULL, NULL, 'individual', 'active', 8, 12500.00, '2026-03-28', 5),
(1, 'CUST-004', 'Lisa', 'Wang', 'lisa.wang@pharma.co', '+1-555-1004', 'Pharma Solutions', 'VP Sales', 'corporate', 'vip', 32, 67800.00, '2026-05-01', 4),
(1, 'CUST-005', 'Michael', 'Brown', 'm.brown@consulting.com', '+1-555-1005', 'Brown Consulting', 'Principal', 'corporate', 'active', 12, 28900.00, '2026-04-10', 5),
(1, 'CUST-006', 'Jennifer', 'Lee', 'jlee@fashionbrand.com', '+1-555-1006', NULL, NULL, 'individual', 'active', 5, 8900.00, '2026-02-15', 4),
(1, 'CUST-007', 'William', 'Davis', 'w.davis@finance.com', '+1-555-1007', 'Finance Group', 'CFO', 'corporate', 'active', 18, 41200.00, '2026-04-22', 5),
(1, 'CUST-008', 'Amanda', 'Wilson', 'amanda.w@retailchain.com', '+1-555-1008', 'Retail Chain Co', 'Operations Manager', 'corporate', 'active', 9, 15600.00, '2026-03-30', 4);

-- Tickets
INSERT INTO tickets (tenant_id, ticket_number, pnr_code, airline_id, customer_id, travel_date, return_date, route_from, route_to, trip_type, class, base_fare, tax_amount, total_amount, commission_amount, net_payable, payment_status, status, issued_by) VALUES
(1, 'TKT-2026-001', 'ABC123', 1, 1, '2026-06-15', '2026-06-22', 'JFK', 'LHR', 'round_trip', 'business', 2800.00, 450.00, 3250.00, 325.00, 2925.00, 'paid', 'confirmed', 4),
(1, 'TKT-2026-002', 'DEF456', 2, 2, '2026-06-20', '2026-06-25', 'LAX', 'CDG', 'round_trip', 'economy', 850.00, 180.00, 1030.00, 103.00, 927.00, 'paid', 'confirmed', 4),
(1, 'TKT-2026-003', 'GHI789', 3, 3, '2026-07-01', NULL, 'ORD', 'NRT', 'one_way', 'premium_economy', 1200.00, 220.00, 1420.00, 142.00, 1278.00, 'partial', 'pending', 5),
(1, 'TKT-2026-004', 'JKL012', 4, 4, '2026-05-25', '2026-06-05', 'MIA', 'DXB', 'round_trip', 'first', 8500.00, 1200.00, 9700.00, 970.00, 8730.00, 'paid', 'confirmed', 4),
(1, 'TKT-2026-005', 'MNO345', 5, 5, '2026-06-10', '2026-06-18', 'SFO', 'SIN', 'round_trip', 'business', 5200.00, 680.00, 5880.00, 588.00, 5292.00, 'paid', 'confirmed', 5),
(1, 'TKT-2026-006', 'PQR678', 6, 1, '2026-07-15', NULL, 'BOS', 'FRA', 'one_way', 'economy', 750.00, 150.00, 900.00, 90.00, 810.00, 'pending', 'pending', 4),
(1, 'TKT-2026-007', 'STU901', 7, 6, '2026-05-30', '2026-06-07', 'SEA', 'CDG', 'round_trip', 'economy', 920.00, 195.00, 1115.00, 111.50, 1003.50, 'paid', 'completed', 5),
(1, 'TKT-2026-008', 'VWX234', 8, 7, '2026-06-25', NULL, 'DFW', 'SIN', 'one_way', 'business', 4200.00, 550.00, 4750.00, 475.00, 4275.00, 'partial', 'pending', 4),
(1, 'TKT-2026-009', 'YZA567', 1, 8, '2026-04-15', '2026-04-20', 'ATL', 'LHR', 'round_trip', 'economy', 680.00, 140.00, 820.00, 82.00, 738.00, 'refunded', 'refunded', 5),
(1, 'TKT-2026-010', 'BCD890', 3, 4, '2026-08-01', '2026-08-10', 'DEN', 'HND', 'round_trip', 'business', 3800.00, 520.00, 4320.00, 432.00, 3888.00, 'paid', 'confirmed', 4);

-- Ticket Passengers
INSERT INTO ticket_passengers (ticket_id, first_name, last_name, passenger_type, passport_number, nationality, seat_number) VALUES
(1, 'John', 'Smith', 'adult', 'P12345678', 'US', '2A'),
(2, 'Maria', 'Garcia', 'adult', 'P87654321', 'US', '14C'),
(3, 'Robert', 'Anderson', 'adult', 'P23456789', 'US', NULL),
(4, 'Lisa', 'Wang', 'adult', 'P34567890', 'US', '1A'),
(5, 'Michael', 'Brown', 'adult', 'P45678901', 'US', '5K'),
(6, 'John', 'Smith', 'adult', 'P12345678', 'US', NULL),
(7, 'Jennifer', 'Lee', 'adult', 'P56789012', 'US', '22F'),
(8, 'William', 'Davis', 'adult', 'P67890123', 'US', '3A'),
(9, 'Amanda', 'Wilson', 'adult', 'P78901234', 'US', NULL),
(10, 'Lisa', 'Wang', 'adult', 'P34567890', 'US', '4D');

-- Leads
INSERT INTO leads (tenant_id, first_name, last_name, email, phone, company, source, status, priority, estimated_value, assigned_to, expected_close_date) VALUES
(1, 'Patrick', 'O\'Connor', 'patrick.oc@enterprise.com', '+1-555-2001', 'Enterprise Solutions', 'Website', 'qualified', 'high', 15000.00, 4, '2026-06-30'),
(1, 'Sophie', 'Martin', 'sophie.m@luxury.com', '+1-555-2002', 'Luxury Brands Co', 'Referral', 'proposal', 'medium', 8500.00, 5, '2026-07-15'),
(1, 'James', 'Wilson', 'j.wilson@startup.io', '+1-555-2003', 'Tech Startup Inc', 'Social Media', 'contacted', 'medium', 5000.00, 4, '2026-07-30'),
(1, 'Emma', 'Thompson', 'emma.t@healthcare.org', '+1-555-2004', 'Healthcare Group', 'Email Campaign', 'new', 'high', 22000.00, 5, '2026-08-15'),
(1, 'Daniel', 'Lee', 'daniel.lee@education.edu', '+1-555-2005', 'Education Foundation', 'Event', 'negotiation', 'low', 3000.00, 4, '2026-06-20');

-- Interactions
INSERT INTO interactions (tenant_id, customer_id, lead_id, type, subject, description, follow_up_date, status, created_by) VALUES
(1, 1, NULL, 'call', 'Follow-up on business trip', 'Discussed upcoming Q3 travel plans', NULL, 'completed', 4),
(1, NULL, 1, 'email', 'Proposal for corporate rates', 'Sent customized rate sheet', '2026-05-15', 'pending', 4),
(1, 3, NULL, 'meeting', 'Annual travel review', 'Reviewed travel patterns and preferences', NULL, 'completed', 5),
(1, NULL, 2, 'call', 'Luxury package discussion', 'Presented premium offerings', '2026-05-20', 'pending', 5),
(1, 4, NULL, 'note', 'VIP preferences updated', 'Updated meal and seat preferences', NULL, 'completed', 4);

-- Expense Categories
INSERT INTO expense_categories (tenant_id, name, description, color, icon) VALUES
(1, 'Office Supplies', 'General office materials', '#3b82f6', 'package'),
(1, 'Travel & Accommodation', 'Staff travel and hotels', '#f59e0b', 'plane'),
(1, 'Software & Subscriptions', 'SaaS and software licenses', '#10b981', 'monitor'),
(1, 'Marketing & Advertising', 'Promotional activities', '#ef4444', 'megaphone'),
(1, 'Utilities', 'Electricity, internet, phone', '#8b5cf6', 'zap'),
(1, 'Professional Services', 'Legal, accounting, consulting', '#ec4899', 'briefcase'),
(1, 'Equipment', 'Hardware and equipment', '#06b6d4', 'cpu'),
(1, 'Training & Development', 'Staff education and courses', '#84cc16', 'graduation-cap');

-- Expenses
INSERT INTO expenses (tenant_id, category_id, title, description, amount, expense_date, payment_method, vendor, receipt_number, status, approved_by, submitted_by) VALUES
(1, 1, 'Stationery bulk order', 'Q2 office supplies', 450.00, '2026-04-01', 'card', 'Office Depot', 'REC-001', 'approved', 1, 3),
(1, 2, 'IATA conference travel', 'Annual conference attendance', 2800.00, '2026-04-05', 'bank_transfer', 'Marriott Hotels', 'REC-002', 'approved', 1, 2),
(1, 3, 'CRM Software License', 'Annual CRM subscription', 3600.00, '2026-04-10', 'card', 'Salesforce', 'REC-003', 'approved', 1, 3),
(1, 4, 'Google Ads Campaign', 'Spring campaign', 1500.00, '2026-04-12', 'card', 'Google', 'REC-004', 'approved', 2, 4),
(1, 5, 'Office Internet', 'Monthly fiber connection', 250.00, '2026-04-15', 'bank_transfer', 'AT&T', 'REC-005', 'approved', 1, 3),
(1, 6, 'Legal consultation', 'Contract review services', 1200.00, '2026-04-18', 'cheque', 'Lawson & Partners', 'REC-006', 'pending', NULL, 2),
(1, 7, 'New laptops', '3x MacBook Pro for agents', 4500.00, '2026-04-20', 'card', 'Apple Store', 'REC-007', 'approved', 1, 3),
(1, 8, 'IATA certification course', 'Training for 2 agents', 1800.00, '2026-04-22', 'bank_transfer', 'IATA Training', 'REC-008', 'pending', NULL, 2);

-- Chart of Accounts
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, is_bank_account, bank_name, account_number, current_balance) VALUES
(1, '1000', 'Cash on Hand', 'asset', 'current_asset', false, NULL, NULL, 5000.00),
(1, '1100', 'Bank Account - Main', 'asset', 'current_asset', true, 'Chase Bank', '****4567', 125000.00),
(1, '1200', 'Accounts Receivable', 'asset', 'current_asset', false, NULL, NULL, 45000.00),
(1, '1300', 'Commission Receivable', 'asset', 'current_asset', false, NULL, NULL, 2800.00),
(1, '2000', 'Accounts Payable', 'liability', 'current_liability', false, NULL, NULL, 32000.00),
(1, '2100', 'Customer Deposits', 'liability', 'current_liability', false, NULL, NULL, 78000.00),
(1, '3000', 'Owner Equity', 'equity', NULL, false, NULL, NULL, 65000.00),
(1, '3100', 'Retained Earnings', 'equity', NULL, false, NULL, NULL, 123800.00),
(1, '4000', 'Ticket Revenue', 'revenue', NULL, false, NULL, NULL, 0.00),
(1, '4100', 'Commission Revenue', 'revenue', NULL, false, NULL, NULL, 0.00),
(1, '5000', 'Office Expenses', 'expense', NULL, false, NULL, NULL, 0.00),
(1, '5100', 'Travel Expenses', 'expense', NULL, false, NULL, NULL, 0.00),
(1, '5200', 'Software Expenses', 'expense', NULL, false, NULL, NULL, 0.00),
(1, '5300', 'Marketing Expenses', 'expense', NULL, false, NULL, NULL, 0.00),
(1, '5400', 'Professional Services', 'expense', NULL, false, NULL, NULL, 0.00);

-- Journal Entries
INSERT INTO journal_entries (tenant_id, entry_number, date, description, reference_type, reference_id, total_debit, total_credit, status, posted_by, posted_at) VALUES
(1, 'JE-2026-001', '2026-04-01', 'Initial capital contribution', NULL, NULL, 50000.00, 50000.00, 'posted', 1, NOW()),
(1, 'JE-2026-002', '2026-04-05', 'Ticket sale - John Smith', 'ticket', 1, 3250.00, 3250.00, 'posted', 1, NOW()),
(1, 'JE-2026-003', '2026-04-10', 'Office supplies purchase', 'expense', 1, 450.00, 450.00, 'posted', 3, NOW()),
(1, 'JE-2026-004', '2026-04-12', 'Commission earned - Delta', NULL, NULL, 103.00, 103.00, 'posted', 3, NOW()),
(1, 'JE-2026-005', '2026-04-15', 'Google Ads payment', 'expense', 4, 1500.00, 1500.00, 'posted', 1, NOW());

-- Journal Entry Lines
INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES
(1, 2, 'Bank deposit', 50000.00, 0.00),
(1, 7, 'Owner capital', 0.00, 50000.00),
(2, 3, 'Receivable from customer', 3250.00, 0.00),
(2, 9, 'Ticket revenue', 0.00, 3250.00),
(3, 11, 'Office supplies', 450.00, 0.00),
(3, 2, 'Bank payment', 0.00, 450.00),
(4, 4, 'Commission receivable', 103.00, 0.00),
(4, 10, 'Commission revenue', 0.00, 103.00),
(5, 14, 'Marketing expense', 1500.00, 0.00),
(5, 2, 'Bank payment', 0.00, 1500.00);

-- Ledger Entries
INSERT INTO ledger_entries (tenant_id, account_id, date, description, debit, credit, balance) VALUES
(1, 2, '2026-04-01', 'Initial capital', 50000.00, 0.00, 50000.00),
(1, 2, '2026-04-05', 'Ticket payment received', 3250.00, 0.00, 53250.00),
(1, 2, '2026-04-10', 'Office supplies', 0.00, 450.00, 52800.00),
(1, 2, '2026-04-15', 'Google Ads', 0.00, 1500.00, 51300.00),
(1, 7, '2026-04-01', 'Owner equity', 0.00, 50000.00, 50000.00),
(1, 9, '2026-04-05', 'Ticket revenue', 0.00, 3250.00, 3250.00),
(1, 10, '2026-04-12', 'Commission revenue', 0.00, 103.00, 103.00),
(1, 11, '2026-04-10', 'Office supplies', 450.00, 0.00, 450.00),
(1, 14, '2026-04-15', 'Marketing expense', 1500.00, 0.00, 1500.00);

-- Wallet Transactions
INSERT INTO wallet_transactions (wallet_id, tenant_id, type, amount, balance_after, description, reference_type, created_by) VALUES
(1, 1, 'credit', 50000.00, 50000.00, 'Initial funding', 'deposit', 1),
(1, 1, 'credit', 45000.00, 95000.00, 'Customer deposits', 'deposit', 3),
(1, 1, 'debit', 15000.00, 80000.00, 'Airline payment batch', 'payment', 1),
(1, 1, 'credit', 35000.00, 115000.00, 'Weekly receipts', 'deposit', 3),
(1, 1, 'credit', 10000.00, 125000.00, 'Additional capital', 'deposit', 1),
(2, 1, 'credit', 20000.00, 20000.00, 'Commission allocation', NULL, 1),
(2, 1, 'credit', 25000.00, 45000.00, 'Q1 commissions', NULL, 3),
(3, 1, 'credit', 5000.00, 5000.00, 'Petty cash setup', NULL, 1),
(4, 1, 'credit', 30000.00, 30000.00, 'Client advance deposits', NULL, 4),
(4, 1, 'credit', 48000.00, 78000.00, 'New client deposits', NULL, 5),
(5, 1, 'credit', 25000.00, 25000.00, 'Refund reserve setup', NULL, 1),
(5, 1, 'debit', 820.00, 24180.00, 'Refund - TKT-2026-009', 'refund', 3);

-- Notifications
INSERT INTO notifications (tenant_id, user_id, title, message, type, category, reference_type, reference_id) VALUES
(1, 1, 'New ticket booked', 'TKT-2026-010 has been confirmed for Lisa Wang', 'success', 'ticket', 'ticket', 10),
(1, 1, 'Expense approval needed', 'Legal consultation expense pending approval', 'warning', 'expense', 'expense', 6),
(1, 2, 'Low wallet balance alert', 'Petty Cash wallet is running low', 'warning', 'wallet', 'wallet', 3),
(1, 3, 'Journal entry posted', 'JE-2026-005 has been posted successfully', 'success', 'accounting', 'journal', 5),
(1, 4, 'New lead assigned', 'Patrick O\'Connor has been assigned to you', 'info', 'crm', 'lead', 1),
(1, 1, 'System update', 'PSB-ERP v2.1.0 update scheduled for tonight', 'info', 'system', NULL, NULL),
(1, 2, 'High-value ticket', 'First class booking worth $9,700 confirmed', 'success', 'ticket', 'ticket', 4),
(1, 3, 'Monthly reconciliation due', 'April month-end closing in 3 days', 'warning', 'accounting', NULL, NULL);

-- AI Conversations
INSERT INTO ai_conversations (tenant_id, user_id, title, model, status) VALUES
(1, 1, 'Revenue Forecast Analysis', 'gpt-4', 'active'),
(1, 2, 'Expense Anomaly Detection', 'gpt-4', 'active'),
(1, 3, 'Journal Entry Help', 'gpt-4', 'archived');

-- AI Messages
INSERT INTO ai_messages (conversation_id, role, content, tokens_used) VALUES
(1, 'user', 'What is our projected revenue for Q3 2026?', 15),
(1, 'assistant', 'Based on current booking trends and historical data, your projected Q3 2026 revenue is approximately $185,000. This represents a 23% increase over Q2. Key drivers include increased corporate bookings and premium cabin upgrades.', 56),
(1, 'user', 'Show me the breakdown by customer segment', 12),
(1, 'assistant', 'VIP Corporate: $95,000 (51%)\nRegular Corporate: $52,000 (28%)\nIndividual Premium: $28,000 (15%)\nStandard Individual: $10,000 (5%)\n\nVIP segment shows strongest growth at 35% YoY.', 89),
(2, 'user', 'Are there any unusual expense patterns this month?', 12),
(2, 'assistant', 'Equipment expense ($4,500) is 300% above monthly average. Travel expense ($2,800) for IATA conference is 180% above typical. Overall variance is within acceptable range (+12% vs budget).', 78),
(3, 'user', 'How do I record a ticket refund in the journal?', 13),
(3, 'assistant', '1. Reverse original revenue: Debit Ticket Revenue, Credit AR. 2. Record penalties: Debit Penalty Expense. 3. Update refund reserve wallet.', 92);

-- Audit Logs
INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values, ip_address) VALUES
(1, 1, 'login', 'user', '1', NULL, '192.168.1.1'),
(1, 4, 'ticket_created', 'ticket', '10', '{"ticketNumber":"TKT-2026-010","amount":"4320.00"}', '192.168.1.45'),
(1, 3, 'journal_posted', 'journal_entry', '5', '{"entryNumber":"JE-2026-005","amount":"1500.00"}', '192.168.1.23'),
(1, 2, 'wallet_transfer', 'wallet', '2', '{"balance":"45000.00"}', '192.168.1.67'),
(1, 1, 'role_updated', 'role', '3', '{"permissions":["accounting:*","wallet:*"]}', '192.168.1.1');
