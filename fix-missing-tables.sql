-- ============================================================
-- PSB-ERP MISSING TABLES FIX
-- Generated from schema.ts vs actual MySQL structure comparison
-- 11 tables missing
-- ============================================================
-- Run this SQL against your MySQL/MariaDB database
-- DO NOT DROP any existing tables or columns
-- ============================================================

-- --------------------------------------------------------
-- 1. suppliers (needed for Suppliers page, Payables page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  supplier_code varchar(50) NOT NULL,
  company_name varchar(200) NOT NULL,
  trade_name varchar(200) DEFAULT NULL,
  supplier_type enum('airline','hotel','tour_operator','car_rental','insurance','visa_service','other') NOT NULL DEFAULT 'other',
  tax_id varchar(50) DEFAULT NULL,
  email varchar(100) DEFAULT NULL,
  phone varchar(50) DEFAULT NULL,
  address text DEFAULT NULL,
  city varchar(100) DEFAULT NULL,
  country varchar(100) DEFAULT NULL,
  website varchar(200) DEFAULT NULL,
  credit_limit decimal(15,2) NOT NULL DEFAULT '0.00',
  balance_due decimal(15,2) NOT NULL DEFAULT '0.00',
  payment_terms int DEFAULT 30,
  currency varchar(3) DEFAULT 'USD',
  status enum('active','inactive','blocked') NOT NULL DEFAULT 'active',
  notes text DEFAULT NULL,
  created_by bigint UNSIGNED DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX suppliers_tenant_idx (tenant_id),
  INDEX suppliers_code_idx (supplier_code),
  INDEX suppliers_status_idx (status),
  UNIQUE INDEX suppliers_code_unique (tenant_id, supplier_code),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 2. supplier_contacts (needed for Suppliers page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_contacts (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  supplier_id bigint UNSIGNED NOT NULL,
  name varchar(100) NOT NULL,
  position varchar(100) DEFAULT NULL,
  email varchar(100) DEFAULT NULL,
  phone varchar(50) DEFAULT NULL,
  is_primary tinyint(1) DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX sc_supplier_idx (supplier_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 3. bills (needed for Payables page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS bills (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  supplier_id bigint UNSIGNED NOT NULL,
  bill_number varchar(100) NOT NULL,
  reference_number varchar(100) DEFAULT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  subtotal decimal(15,2) NOT NULL,
  tax_amount decimal(15,2) NOT NULL DEFAULT '0.00',
  discount_amount decimal(15,2) NOT NULL DEFAULT '0.00',
  total_amount decimal(15,2) NOT NULL,
  amount_paid decimal(15,2) NOT NULL DEFAULT '0.00',
  balance_due decimal(15,2) NOT NULL,
  currency varchar(3) DEFAULT 'USD',
  description text DEFAULT NULL,
  status enum('draft','open','partial','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
  category varchar(100) DEFAULT NULL,
  journal_entry_id bigint UNSIGNED DEFAULT NULL,
  created_by bigint UNSIGNED DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at datetime DEFAULT NULL,
  deleted_by bigint UNSIGNED DEFAULT NULL,
  INDEX bills_tenant_idx (tenant_id),
  INDEX bills_supplier_idx (supplier_id),
  INDEX bills_number_idx (bill_number),
  INDEX bills_status_idx (status),
  INDEX bills_due_date_idx (due_date),
  UNIQUE INDEX bills_number_unique (tenant_id, bill_number),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 4. bill_items (needed for Payables page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS bill_items (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  bill_id bigint UNSIGNED NOT NULL,
  description varchar(255) NOT NULL,
  quantity decimal(10,2) NOT NULL DEFAULT '1.00',
  unit_price decimal(15,2) NOT NULL,
  total decimal(15,2) NOT NULL,
  account_id bigint UNSIGNED DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX bi_bill_idx (bill_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (bill_id) REFERENCES bills(id),
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 5. supplier_payments (needed for Payables page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payments (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  supplier_id bigint UNSIGNED NOT NULL,
  bill_id bigint UNSIGNED DEFAULT NULL,
  payment_number varchar(100) NOT NULL,
  amount decimal(15,2) NOT NULL,
  payment_method enum('cash','bank_transfer','cheque','credit_card','wallet') NOT NULL,
  payment_date date NOT NULL,
  reference_number varchar(100) DEFAULT NULL,
  bank_account_id bigint UNSIGNED DEFAULT NULL,
  notes text DEFAULT NULL,
  journal_entry_id bigint UNSIGNED DEFAULT NULL,
  created_by bigint UNSIGNED DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime DEFAULT NULL,
  deleted_by bigint UNSIGNED DEFAULT NULL,
  INDEX sp_tenant_idx (tenant_id),
  INDEX sp_supplier_idx (supplier_id),
  INDEX sp_bill_idx (bill_id),
  INDEX sp_number_idx (payment_number),
  UNIQUE INDEX sp_number_unique (tenant_id, payment_number),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (bill_id) REFERENCES bills(id),
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 6. exchange_rates (needed for Exchange Rates page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange_rates (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  from_currency varchar(3) NOT NULL,
  to_currency varchar(3) NOT NULL,
  rate decimal(15,6) NOT NULL,
  effective_date date NOT NULL,
  source enum('manual','api','system') NOT NULL DEFAULT 'manual',
  created_by bigint UNSIGNED DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX er_tenant_idx (tenant_id),
  INDEX er_currency_idx (from_currency, to_currency),
  INDEX er_date_idx (effective_date),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 7. bank_statements (needed for Bank Reconciliation page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_statements (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  account_id bigint UNSIGNED NOT NULL,
  statement_date date NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  opening_balance decimal(15,2) NOT NULL DEFAULT '0.00',
  closing_balance decimal(15,2) NOT NULL DEFAULT '0.00',
  file_url text DEFAULT NULL,
  status enum('pending','processing','partial','reconciled') NOT NULL DEFAULT 'pending',
  total_debits decimal(15,2) NOT NULL DEFAULT '0.00',
  total_credits decimal(15,2) NOT NULL DEFAULT '0.00',
  notes text DEFAULT NULL,
  created_by bigint UNSIGNED DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX bs_tenant_idx (tenant_id),
  INDEX bs_account_idx (account_id),
  INDEX bs_status_idx (status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 8. bank_statement_lines (needed for Bank Reconciliation page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  statement_id bigint UNSIGNED NOT NULL,
  transaction_date date NOT NULL,
  description text DEFAULT NULL,
  reference varchar(100) DEFAULT NULL,
  debit decimal(15,2) NOT NULL DEFAULT '0.00',
  credit decimal(15,2) NOT NULL DEFAULT '0.00',
  balance decimal(15,2) NOT NULL DEFAULT '0.00',
  matched_journal_entry_id bigint UNSIGNED DEFAULT NULL,
  matched_ledger_entry_id bigint UNSIGNED DEFAULT NULL,
  match_confidence decimal(5,2) DEFAULT '0.00',
  status enum('unmatched','matched','ignored') NOT NULL DEFAULT 'unmatched',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX bsl_tenant_idx (tenant_id),
  INDEX bsl_statement_idx (statement_id),
  INDEX bsl_status_idx (status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (statement_id) REFERENCES bank_statements(id),
  FOREIGN KEY (matched_journal_entry_id) REFERENCES journal_entries(id),
  FOREIGN KEY (matched_ledger_entry_id) REFERENCES ledger_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 9. document_sequences (needed for Documents page numbering)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_sequences (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  prefix varchar(20) NOT NULL,
  year int NOT NULL,
  last_number bigint UNSIGNED NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ds_tenant_idx (tenant_id),
  UNIQUE INDEX ds_tenant_prefix_year_unique (tenant_id, prefix, year),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 10. system_settings (needed for Settings page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  `key` varchar(100) NOT NULL,
  value text DEFAULT NULL,
  category varchar(50) DEFAULT 'general',
  description text DEFAULT NULL,
  updated_by bigint UNSIGNED DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ss_tenant_key_idx (tenant_id, `key`),
  INDEX ss_category_idx (category),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 11. documents (needed for Documents page)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id bigint UNSIGNED NOT NULL,
  entity_type enum('invoice','ticket','deposit','supplier_payment','expense','report','customer','other') NOT NULL,
  entity_id bigint UNSIGNED NOT NULL,
  document_type enum('invoice','receipt','voucher','statement','report','attachment') NOT NULL,
  document_number varchar(100) DEFAULT NULL,
  file_name varchar(255) DEFAULT NULL,
  file_url text DEFAULT NULL,
  file_size bigint DEFAULT NULL,
  mime_type varchar(50) DEFAULT NULL,
  status enum('draft','generated','sent','archived') NOT NULL DEFAULT 'draft',
  generated_by bigint UNSIGNED DEFAULT NULL,
  generated_at timestamp NULL DEFAULT NULL,
  sent_at timestamp NULL DEFAULT NULL,
  sent_to varchar(320) DEFAULT NULL,
  metadata longtext DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime DEFAULT NULL,
  deleted_by bigint UNSIGNED DEFAULT NULL,
  INDEX docs_tenant_idx (tenant_id),
  INDEX docs_entity_idx (entity_type, entity_id),
  INDEX docs_type_idx (document_type),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (generated_by) REFERENCES users(id),
  FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
